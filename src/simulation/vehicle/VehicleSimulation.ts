// Aerodynamic load transfer follows Hucho [R11].
import type { VehicleConfig } from "../config/VehicleConfig";
import { EngineModel, type EngineResult } from "../engine/EngineModel";
import { ClutchModel, type ClutchResult } from "../clutch/ClutchModel";
import { HPatternShifter } from "../gearbox/HPatternShifter";
import { ManualGearbox, SynchronizerModel, type EngagementResult } from "../gearbox/ManualGearbox";
import { DrivelineModel, OpenDifferential } from "../driveline/DrivelineModel";
import { TireModel } from "../tires/TireModel";
import { SteeringModel } from "../steering/SteeringModel";
import { BrakeModel } from "../brakes/BrakeModel";
import { SuspensionModel } from "../suspension/SuspensionModel";
import { WheelModel } from "./WheelModel";
import { VehicleBodyModel } from "./VehicleBodyModel";
import { RoadContactProvider } from "../road/RoadContactProvider";
import { clamp, clamp01, GRAVITY, ShapePreservingCurve } from "../core/MathUtils";
import { TelemetryRecorder, type TelemetrySample } from "../telemetry/TelemetryRecorder";
import { gearLabel, type VehicleRenderState } from "./VehicleTypes";

export interface VehicleControls {
    throttle: number;
    brake: number;
    clutchPedal: number;
    steering: number;
    handbrake: boolean;
    ignition: boolean;
    starter: boolean;
}

export type SimEventType =
    | "stall"
    | "engine-start"
    | "engine-stop"
    | "gear-engaged"
    | "gear-rejected"
    | "reverse-blocked"
    | "redline"
    | "clutch-overheat"
    | "wheel-lock"
    | "shift-hint"
    | "barrier";

export interface SimEvent {
    timeS: number;
    type: SimEventType;
    message: string;
}

export interface ResetOptions {
    x?: number;
    y?: number;
    heading?: number;
    engineRunning?: boolean;
    gear?: number;
    clutchPedal?: number;
    ignition?: boolean;
}

const DEFAULT_CONTROLS: VehicleControls = {
    throttle: 0,
    brake: 0,
    clutchPedal: 1,
    steering: 0,
    handbrake: false,
    ignition: false,
    starter: false,
};

export class VehicleSimulation {
    readonly body: VehicleBodyModel;
    readonly engine: EngineModel;
    readonly clutch: ClutchModel;
    readonly gearbox: ManualGearbox;
    readonly shifter: HPatternShifter;
    readonly driveline: DrivelineModel;
    readonly differential = new OpenDifferential();
    readonly tire: TireModel;
    readonly steering: SteeringModel;
    readonly brakes: BrakeModel;
    readonly suspensionFront: SuspensionModel;
    readonly suspensionRear: SuspensionModel;
    readonly wheels: [WheelModel, WheelModel, WheelModel, WheelModel];
    readonly road: RoadContactProvider;
    readonly recorder: TelemetryRecorder;
    controls: VehicleControls = { ...DEFAULT_CONTROLS };
    speedLimitKph: number | null = null;
    timeS = 0;
    lastEngineResult: EngineResult;
    lastClutchResult: ClutchResult;
    lastEngagement: EngagementResult | null = null;
    private neutralInputOmega = 0;
    private events: SimEvent[] = [];
    private eventCooldowns = new Map<SimEventType, number>();
    private wheelLoads: [number, number, number, number] = [0, 0, 0, 0];
    private wheelCompressions: [number, number, number, number] = [0, 0, 0, 0];
    private slopeForward = 0;
    private slopeLateral = 0;
    private surfaceMu = 1;

    constructor(
        readonly config: VehicleConfig,
        road = new RoadContactProvider(),
    ) {
        this.body = new VehicleBodyModel(
            config.massKg,
            config.wheelbaseM,
            config.trackM,
            config.cgHeightM,
            0,
            0,
            0,
        );
        const curve = new ShapePreservingCurve(config.engine.torqueCurve);
        this.engine = new EngineModel({
            ...config.engine,
            torqueAtRpm: (rpm) => curve.evaluate(rpm),
        });
        this.clutch = new ClutchModel(config.clutch);
        const synchronizer = new SynchronizerModel(config.gearbox.syncSpeedThresholdRadPerSec);
        this.gearbox = new ManualGearbox({
            gearRatios: config.gearRatios,
            reverseRatio: config.reverseRatio,
            shiftTimeS: config.gearbox.shiftTimeS,
            reverseMaxSpeedMps: config.gearbox.reverseMaxSpeedMps,
            synchronizer,
        });
        this.shifter = new HPatternShifter({
            positions: config.gearbox.gates,
            shiftTimeS: config.gearbox.shiftTimeS,
        });
        this.driveline = new DrivelineModel(config.finalDriveRatio, config.drivetrainEfficiency);
        this.tire = new TireModel(config.tires);
        this.steering = new SteeringModel(config.steering);
        this.brakes = new BrakeModel(config.brakes);
        this.suspensionFront = new SuspensionModel({
            springRateNm: config.suspension.springRateFrontNm,
            damperNsm: config.suspension.damperNsm,
            rideHeightM: config.suspension.rideHeightM,
            maxCompressionM: config.suspension.maxCompressionM,
            bumpStopRateNm: config.suspension.bumpStopRateNm,
        });
        this.suspensionRear = new SuspensionModel({
            springRateNm: config.suspension.springRateRearNm,
            damperNsm: config.suspension.damperNsm,
            rideHeightM: config.suspension.rideHeightM,
            maxCompressionM: config.suspension.maxCompressionM,
            bumpStopRateNm: config.suspension.bumpStopRateNm,
        });
        this.wheels = [
            new WheelModel("front-left", this.tire),
            new WheelModel("front-right", this.tire),
            new WheelModel("rear-left", this.tire),
            new WheelModel("rear-right", this.tire),
        ];
        this.road = road;
        this.recorder = new TelemetryRecorder();

        this.lastEngineResult = this.makeEnginePlaceholder();
        this.lastClutchResult = this.makeClutchPlaceholder();
        this.reset({});
    }

    get x(): number {
        return this.body.state.x;
    }

    get y(): number {
        return this.body.state.y;
    }

    get speedMps(): number {
        return this.body.speedMps;
    }

    get gear(): number {
        return this.gearbox.gear;
    }

    get wheelOmegas(): [number, number, number, number] {
        return [
            this.wheels[0].omega,
            this.wheels[1].omega,
            this.wheels[2].omega,
            this.wheels[3].omega,
        ];
    }

    step(dt: number, controls: VehicleControls): void {
        if (!(dt > 0)) return;
        this.controls = {
            throttle: clamp01(controls.throttle),
            brake: clamp01(controls.brake),
            clutchPedal: clamp01(controls.clutchPedal),
            steering: clamp(controls.steering, -1, 1),
            handbrake: controls.handbrake,
            ignition: controls.ignition,
            starter: controls.starter,
        };
        this.body.capturePrevious();
        this.timeS += dt;

        this.shifter.update(dt);
        this.gearbox.update(dt);
        this.steering.update(dt, this.controls.steering, this.body.state.vx);
        this.surfaceMu = this.road.surfaceMuAt(this.body.state.x, this.body.state.y);

        const wheelPositions = this.wheelPositions();
        const frontHeights = [
            this.road.heightAt(wheelPositions[0]!.x, wheelPositions[0]!.y),
            this.road.heightAt(wheelPositions[1]!.x, wheelPositions[1]!.y),
        ];
        const rearHeights = [
            this.road.heightAt(wheelPositions[2]!.x, wheelPositions[2]!.y),
            this.road.heightAt(wheelPositions[3]!.x, wheelPositions[3]!.y),
        ];
        const zFront = (frontHeights[0]! + frontHeights[1]!) / 2;
        const zRear = (rearHeights[0]! + rearHeights[1]!) / 2;
        const zLeft = (frontHeights[0]! + rearHeights[0]!) / 2;
        const zRight = (frontHeights[1]! + rearHeights[1]!) / 2;
        const slopeForward = Math.atan2(zFront - zRear, this.config.wheelbaseM);
        const slopeLateral = Math.atan2(zRight - zLeft, this.config.trackM);
        this.slopeForward = slopeForward;
        this.slopeLateral = slopeLateral;

        const frontOmega = [this.wheels[0].omega, this.wheels[1].omega] as const;
        const outputOmega = this.driveline.outputShaftOmega(frontOmega);
        const ratio = this.gearbox.ratio;
        let inputOmega: number;
        if (this.gearbox.gear !== 0) {
            inputOmega = outputOmega * ratio;
        } else {
            const engagement = this.clutch.engagementForPedal(this.controls.clutchPedal);
            if (engagement > 0.5) {
                this.neutralInputOmega +=
                    (this.engine.angularVelocity - this.neutralInputOmega) * Math.min(1, 24 * dt);
            } else {
                this.neutralInputOmega *= Math.exp(-2.2 * dt);
            }
            inputOmega = this.neutralInputOmega;
        }

        const reflectedInertia =
            this.gearbox.gear !== 0
                ? this.driveline.reflectedInertiaKgM2(
                      ratio,
                      this.config.massKg,
                      this.config.wheelRadiusM,
                      this.config.wheelInertiaKgM2,
                      2,
                  )
                : 0.05;
        const clutchResult = this.clutch.computeTorque(
            this.controls.clutchPedal,
            this.engine.angularVelocity,
            inputOmega,
            dt,
            this.config.engine.inertiaKgM2,
            reflectedInertia,
        );
        this.lastClutchResult = clutchResult;
        const engineResult = this.engine.update(
            {
                throttle: this.controls.throttle,
                ignition: this.controls.ignition,
                starter: this.controls.starter,
            },
            clutchResult.torqueNm,
            dt,
        );
        const wasRunning = this.lastEngineResult.running;
        this.lastEngineResult = engineResult;
        if (engineResult.running && !wasRunning)
            this.pushEvent("engine-start", "Engine started.", 0);
        if (engineResult.stalledThisStep) {
            this.pushEvent("stall", "Engine stalled. Press the clutch, then hold K to restart.", 0);
        }
        if (!engineResult.running && wasRunning && !engineResult.stalledThisStep) {
            this.pushEvent("engine-stop", "Engine stopped.", 0.5);
        }

        const speedMagnitude = Math.abs(this.body.state.vx);
        const cosSlope =
            1 /
            Math.sqrt(
                1 + this.slopeForward * this.slopeForward + this.slopeLateral * this.slopeLateral,
            );
        const weight = this.config.massKg * GRAVITY * cosSlope;
        const staticFront = weight * this.config.frontWeightBias;
        const staticRear = weight * (1 - this.config.frontWeightBias);
        const longAccel = clamp(this.body.lastLongitudinalAcceleration, -14, 14);
        const latAccel = clamp(this.body.lastLateralAcceleration, -14, 14);
        const longTransfer =
            (this.config.massKg * longAccel * this.config.cgHeightM) / this.config.wheelbaseM;
        const dynamicPressure =
            0.5 * this.config.aero.airDensity * this.body.state.vx * this.body.state.vx;
        const downforceN = dynamicPressure * (this.config.aero.downforceCoefficient ?? 0);
        const frontLiftN = dynamicPressure * (this.config.aero.frontLiftCoefficient ?? 0);
        const rearLiftN = dynamicPressure * (this.config.aero.rearLiftCoefficient ?? 0);
        // Downforce loads the axles; a positive lift coefficient unloads them.
        const frontAxleLoad = Math.max(
            0,
            staticFront - longTransfer - downforceN * 0.45 - frontLiftN,
        );
        const rearAxleLoad = Math.max(0, staticRear + longTransfer - downforceN * 0.55 - rearLiftN);
        const lateralTransfer =
            (this.config.massKg * latAccel * this.config.cgHeightM) / this.config.trackM;
        const frontLateralTransfer = lateralTransfer * 0.55;
        const rearLateralTransfer = lateralTransfer * 0.45;
        this.wheelLoads = [
            Math.max(0, frontAxleLoad / 2 + frontLateralTransfer),
            Math.max(0, frontAxleLoad / 2 - frontLateralTransfer),
            Math.max(0, rearAxleLoad / 2 + rearLateralTransfer),
            Math.max(0, rearAxleLoad / 2 - rearLateralTransfer),
        ];
        this.wheelCompressions = [
            this.suspensionFront.compressionForLoad(this.wheelLoads[0]),
            this.suspensionFront.compressionForLoad(this.wheelLoads[1]),
            this.suspensionRear.compressionForLoad(this.wheelLoads[2]),
            this.suspensionRear.compressionForLoad(this.wheelLoads[3]),
        ];

        const totalDriveTorque = this.driveline.totalWheelDriveTorque(
            clutchResult.mode === "locked" && this.gearbox.gear !== 0
                ? this.lastEngineResult.torqueNm
                : clutchResult.torqueNm,
            ratio,
            this.gearbox.torqueFactor,
        );
        const [leftDrive, rightDrive] = this.differential.distribute(totalDriveTorque);
        const yawRate = this.body.state.yawRate;
        const halfTrack = this.config.trackM / 2;
        const frontBrake = this.brakes.torqueForWheel(
            this.controls.brake,
            this.controls.handbrake,
            "front",
        );
        const rearBrake = this.brakes.torqueForWheel(
            this.controls.brake,
            this.controls.handbrake,
            "rear",
        );
        const wheelSurfaceMu = wheelPositions.map((position) =>
            this.road.surfaceMuAt(position.x, position.y),
        );
        const wheelSpeeds = [
            this.body.state.vx - yawRate * -halfTrack,
            this.body.state.vx - yawRate * halfTrack,
            this.body.state.vx - yawRate * -halfTrack,
            this.body.state.vx - yawRate * halfTrack,
        ];

        const wheelResults = this.wheels.map((wheel, index) =>
            wheel.update({
                dt,
                driveTorqueNm: index < 2 ? (index === 0 ? leftDrive : rightDrive) : 0,
                brakeTorqueNm: index < 2 ? frontBrake : rearBrake,
                normalLoadN: this.wheelLoads[index]!,
                forwardSpeedMps: wheelSpeeds[index]!,
                surfaceMu: wheelSurfaceMu[index]!,
                wheelRadiusM: this.config.wheelRadiusM,
                wheelInertiaKgM2: this.config.wheelInertiaKgM2,
            }),
        );

        const frontLongitudinal =
            wheelResults[0]!.longitudinalForceN + wheelResults[1]!.longitudinalForceN;
        const rearLongitudinal =
            wheelResults[2]!.longitudinalForceN + wheelResults[3]!.longitudinalForceN;
        const vxSafe = Math.max(speedMagnitude, 1);
        const steerAngle = this.steering.angleRad;
        const effectiveSteer = this.body.state.vx >= 0 ? steerAngle : -steerAngle;
        const a = this.config.wheelbaseM * (1 - this.config.frontWeightBias);
        const b = this.config.wheelbaseM * this.config.frontWeightBias;
        const alphaFront = Math.atan2(this.body.state.vy + yawRate * a, vxSafe) - effectiveSteer;
        const alphaRear = Math.atan2(this.body.state.vy - yawRate * b, vxSafe);
        const muFront = (wheelSurfaceMu[0]! + wheelSurfaceMu[1]!) / 2;
        const muRear = (wheelSurfaceMu[2]! + wheelSurfaceMu[3]!) / 2;
        const lowSpeedGrip = clamp(speedMagnitude / 1.2, 0, 1);
        const frontLateralRaw =
            -this.tire.lateralForce(alphaFront, frontAxleLoad, muFront) * lowSpeedGrip;
        const rearLateralRaw =
            -this.tire.lateralForce(alphaRear, rearAxleLoad, muRear) * lowSpeedGrip;
        const combinedFront = this.tire.combinedForces(
            frontLongitudinal,
            frontLateralRaw,
            frontAxleLoad,
            muFront,
        );
        const combinedRear = this.tire.combinedForces(
            rearLongitudinal,
            rearLateralRaw,
            rearAxleLoad,
            muRear,
        );

        const yawMoment =
            a * combinedFront.lateral * Math.cos(effectiveSteer) - b * combinedRear.lateral;
        const dragN =
            0.5 *
            this.config.aero.airDensity *
            this.config.aero.dragAreaCdA *
            this.body.state.vx *
            speedMagnitude;
        const rollingResistanceN =
            speedMagnitude > 0.05
                ? Math.sign(this.body.state.vx) *
                  this.config.tires.rollingResistance *
                  weight *
                  this.road.rollingResistanceScaleAt(this.body.state.x, this.body.state.y)
                : 0;

        this.body.step(dt, {
            longitudinalN: combinedFront.longitudinal + combinedRear.longitudinal,
            lateralN: combinedFront.lateral + combinedRear.lateral,
            yawMomentNm: yawMoment,
            dragN,
            rollingResistanceN,
            slopeForward,
            slopeLateral,
            steerAngleRad: steerAngle,
        });
        // No default top-speed clamp: maximum road speed emerges from engine power,
        // aerodynamic drag, gearing, rolling resistance and the rev limiter. The
        // optional limiter exists only for players who explicitly enable it.
        if (this.speedLimitKph !== null) {
            const limitMps = this.speedLimitKph / 3.6;
            if (this.body.state.vx > limitMps) this.body.state.vx = limitMps;
        }
        // reverseMaxSpeedMps is the engagement lockout threshold, not a driving
        // speed limiter. Reverse road speed follows its ratio and the engine limit.

        const frame = this.road.project(this.body.state.x, this.body.state.y);
        if (frame) {
            const edge = frame.halfWidthM + 1.7;
            const over = Math.abs(frame.lateralM) - edge;
            if (over > 0) {
                const side = Math.sign(frame.lateralM) || 1;
                this.body.shiftPosition(-side * frame.normalX * over, -side * frame.normalY * over);
                const impact = Math.min(1, over / 1.5);
                this.body.state.vx *= 1 - impact * 0.35;
                this.body.state.vy *= 1 - impact * 0.5;
                this.body.state.yawRate *= 1 - impact * 0.25;
                if (impact > 0.02) {
                    this.pushEvent(
                        "barrier",
                        "Barrier contact. Keep the car between the guardrails.",
                        1.5,
                    );
                }
            }
        }

        const pose = this.wheelPositions();
        const finalHeights = pose.map((position) => this.road.heightAt(position.x, position.y));
        this.body.state.z =
            (finalHeights[0]! + finalHeights[1]! + finalHeights[2]! + finalHeights[3]!) / 4;
        this.body.state.pitch = Math.atan2(
            (finalHeights[0]! + finalHeights[1]!) / 2 - (finalHeights[2]! + finalHeights[3]!) / 2,
            this.config.wheelbaseM,
        );
        this.body.state.roll = Math.atan2(
            (finalHeights[0]! + finalHeights[2]!) / 2 - (finalHeights[1]! + finalHeights[3]!) / 2,
            this.config.trackM,
        );

        const newInputOmega =
            this.gearbox.gear !== 0
                ? this.driveline.outputShaftOmega([this.wheels[0].omega, this.wheels[1].omega]) *
                  ratio
                : this.neutralInputOmega;
        if (
            clutchResult.mode === "locked" &&
            this.gearbox.gear !== 0 &&
            this.gearbox.torqueFactor > 0.5
        ) {
            this.engine.setAngularVelocity(Math.max(0, newInputOmega));
        }

        if (this.engine.rpm > this.config.engine.redlineRpm - 80) {
            this.pushEvent("redline", "Rev limiter active.", 2);
        }
        if (clutchResult.temperatureC > 320) {
            this.pushEvent(
                "clutch-overheat",
                "Clutch is overheating. Let it cool and slip less.",
                4,
            );
        }
        if (this.wheels.some((wheel) => wheel.lockup)) {
            this.pushEvent("wheel-lock", "A wheel is locked. Ease the brake to keep steering.", 3);
        }

        this.recorder.update(dt, () => this.makeSample());
    }

    grabShifter(): void {
        if (this.gearbox.gear !== 0) this.shifter.setPositionForGear(this.gearbox.gear);
        this.shifter.grab();
    }

    releaseShifter(): void {
        if (!this.shifter.grabbed) return;
        const requested = this.shifter.release();
        const result = this.tryEngage(requested);
        if (!result.engaged) {
            this.shifter.setPositionForGear(this.gearbox.gear);
        } else if (requested !== 0) {
            this.pushEvent("gear-engaged", `Engaged ${gearLabel(requested)}.`, 0);
        }
    }

    toggleShifter(): void {
        if (this.shifter.grabbed) this.releaseShifter();
        else this.grabShifter();
    }

    cancelShifter(): void {
        if (!this.shifter.grabbed) return;
        this.shifter.cancel();
        this.shifter.setPositionForGear(this.gearbox.gear);
    }

    moveShifter(direction: "up" | "down" | "left" | "right"): boolean {
        if (!this.shifter.grabbed) {
            this.pushEvent("shift-hint", "Press Enter to grab the gear lever first.", 2);
            return false;
        }
        const result =
            direction === "up"
                ? this.shifter.moveUp()
                : direction === "down"
                  ? this.shifter.moveDown()
                  : direction === "left"
                    ? this.shifter.moveLeft()
                    : this.shifter.moveRight();
        return result.moved;
    }

    requestNeutral(): void {
        this.shifter.requestNeutral();
        this.gearbox.tryEngage(0, this.engagementContext());
        this.neutralInputOmega = 0;
        this.pushEvent("gear-engaged", "Selected neutral.", 0.4);
    }

    requestReverse(): void {
        this.shifter.requestReverse();
        const result = this.tryEngage(-1);
        if (!result.engaged) {
            this.shifter.setPositionForGear(this.gearbox.gear);
        }
    }

    selectGearDirect(gear: number): void {
        if (gear < -1 || gear > 6) return;
        if (gear === 0) {
            this.requestNeutral();
            return;
        }
        this.shifter.setPositionForGear(gear);
        const result = this.tryEngage(gear);
        if (!result.engaged) this.shifter.setPositionForGear(this.gearbox.gear);
    }

    private tryEngage(gear: number): EngagementResult {
        const result = this.gearbox.tryEngage(gear, this.engagementContext());
        this.lastEngagement = result;
        if (!result.engaged) {
            const message =
                result.reason === "reverse-lockout"
                    ? "Reverse is locked out above walking pace."
                    : "The synchronizer refused the shift. Press the clutch or match engine speed.";
            this.pushEvent(
                result.reason === "reverse-lockout" ? "reverse-blocked" : "gear-rejected",
                message,
                1.5,
            );
        }
        return result;
    }

    private engagementContext() {
        const outputOmega = this.driveline.outputShaftOmega([
            this.wheels[0].omega,
            this.wheels[1].omega,
        ]);
        const inputOmega =
            this.gearbox.gear !== 0 ? outputOmega * this.gearbox.ratio : this.neutralInputOmega;
        return {
            clutchDisengaged: this.clutch.engagementForPedal(this.controls.clutchPedal) < 0.12,
            inputOmega,
            outputOmega,
            speedMps: Math.abs(this.body.state.vx),
        };
    }

    private wheelPositions(): Array<{ x: number; y: number }> {
        const heading = this.body.state.heading;
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        const halfTrack = this.config.trackM / 2;
        const a = this.config.wheelbaseM * (1 - this.config.frontWeightBias);
        const b = this.config.wheelbaseM * this.config.frontWeightBias;
        const offsets: Array<[number, number]> = [
            [a, -halfTrack],
            [a, halfTrack],
            [-b, -halfTrack],
            [-b, halfTrack],
        ];
        return offsets.map(([longitudinal, lateral]) => ({
            x: this.body.state.x + cos * longitudinal - sin * lateral,
            y: this.body.state.y + sin * longitudinal + cos * lateral,
        }));
    }

    getRenderState(alpha = 0): VehicleRenderState {
        const pose = this.body.interpolated(alpha);
        const speedMps = Math.hypot(pose.vx, pose.vy);
        const wheels = this.wheels.map((wheel, index) => ({
            omega: wheel.omega,
            steerAngleRad: index < 2 ? this.steering.angleRad : 0,
            normalLoadN: this.wheelLoads[index]!,
            slipRatio: wheel.slipRatio,
            compressionM: this.wheelCompressions[index]!,
            longitudinalForceN: wheel.longitudinalForceN,
        }));
        return {
            timeS: this.timeS,
            pose,
            speedMps,
            speedKph: speedMps * 3.6,
            rpm: this.engine.rpm,
            gear: this.gearbox.gear,
            gearLabel: gearLabel(this.gearbox.gear),
            throttle: this.controls.throttle,
            brake: this.controls.brake,
            clutchPedal: this.controls.clutchPedal,
            clutchBitePedal: this.config.clutch.bitePoint,
            clutchEngagementWidth: this.config.clutch.engagementWidth,
            handbrake: this.controls.handbrake,
            steeringInput: this.controls.steering,
            steeringAngleRad: this.steering.angleRad,
            steeringWheelAngleRad: this.steering.steeringWheelAngleRad,
            ignition: this.controls.ignition,
            starter: this.controls.starter,
            engineRunning: this.engine.running,
            cranking: this.engine.cranking,
            fuelCut: this.engine.fuelCut,
            engineTorqueNm: this.lastEngineResult.torqueNm,
            clutchMode: this.lastClutchResult.mode,
            clutchSlipRadPerSec: this.lastClutchResult.slipRadPerSec,
            clutchCapacityNm: this.lastClutchResult.capacityNm,
            clutchEngagement: this.lastClutchResult.engagement,
            clutchTemperatureC: this.clutch.temperatureC,
            clutchWear: this.clutch.wear,
            gearboxTorqueFactor: this.gearbox.torqueFactor,
            shifterGate: this.shifter.visualGate,
            shifterSlot: this.shifter.visualSlot,
            shifterGrabbed: this.shifter.grabbed,
            sessionSurfaceMu: this.surfaceMu,
            slopeForward: this.slopeForward,
            slopeLateral: this.slopeLateral,
            wheelLocked: this.wheels.some((wheel) => wheel.lockup),
            wheels,
        };
    }

    getLatestTelemetry(): TelemetrySample | undefined {
        return this.recorder.latest();
    }

    drainEvents(): SimEvent[] {
        const result = this.events;
        this.events = [];
        return result;
    }

    reset(options: ResetOptions = {}): void {
        const x = options.x ?? 0;
        const y = options.y ?? 0;
        const heading = options.heading ?? 0;
        this.timeS = 0;
        this.body.reset(x, y, heading);
        this.road.syncHint(x, y);
        for (const wheel of this.wheels) wheel.reset();
        this.steering.reset();
        this.gearbox.reset(options.gear ?? 0);
        this.shifter.reset(options.gear ?? 0);
        this.clutch.reset();
        this.engine.reset();
        if (options.engineRunning) {
            this.engine.setAngularVelocity((this.config.engine.idleRpm * Math.PI) / 30);
            this.engine.setRunning(true);
        }
        this.neutralInputOmega =
            options.gear === 0 || options.gear === undefined ? this.engine.angularVelocity : 0;
        this.controls = {
            ...DEFAULT_CONTROLS,
            clutchPedal: options.clutchPedal ?? 1,
            ignition: options.ignition ?? Boolean(options.engineRunning),
        };
        this.lastEngineResult = this.makeEnginePlaceholder();
        this.lastClutchResult = this.makeClutchPlaceholder();
        this.lastEngagement = null;
        this.events = [];
        this.eventCooldowns.clear();
        this.recorder.clear();
        this.surfaceMu = this.road.surfaceMuAt(x, y);
        this.updateTerrainPose();
    }

    private updateTerrainPose(): void {
        const positions = this.wheelPositions();
        const heights = positions.map((position) => this.road.heightAt(position.x, position.y));
        this.body.state.z = (heights[0]! + heights[1]! + heights[2]! + heights[3]!) / 4;
        this.body.state.pitch = Math.atan2(
            (heights[0]! + heights[1]!) / 2 - (heights[2]! + heights[3]!) / 2,
            this.config.wheelbaseM,
        );
        this.body.state.roll = Math.atan2(
            (heights[0]! + heights[2]!) / 2 - (heights[1]! + heights[3]!) / 2,
            this.config.trackM,
        );
    }

    private makeSample(): TelemetrySample {
        return {
            t: this.timeS,
            x: this.body.state.x,
            y: this.body.state.y,
            z: this.body.state.z,
            heading: this.body.state.heading,
            speedMps: this.body.speedMps,
            forwardSpeed: this.body.state.vx,
            lateralSpeed: this.body.state.vy,
            yawRate: this.body.state.yawRate,
            engineRpm: this.engine.rpm,
            engineTorqueNm: this.lastEngineResult.torqueNm,
            clutchPedal: this.controls.clutchPedal,
            clutchSlipRadPerSec: this.lastClutchResult.slipRadPerSec,
            clutchTempC: this.clutch.temperatureC,
            clutchWear: this.clutch.wear,
            gear: this.gearbox.gear,
            throttle: this.controls.throttle,
            brake: this.controls.brake,
            steering: this.steering.angleRad,
            handbrake: this.controls.handbrake,
            running: this.engine.running,
            fuelCut: this.engine.fuelCut,
            frontSlip: this.wheels[0].slipRatio,
            rearSlip: this.wheels[2].slipRatio,
            wheelOmegas: this.wheelOmegas,
            wheelSteer: this.steering.angleRad,
            surfaceMu: this.surfaceMu,
            slope: this.slopeForward,
        };
    }

    private makeEnginePlaceholder(): EngineResult {
        return {
            rpm: 0,
            angularVelocity: 0,
            torqueNm: 0,
            combustionTorqueNm: 0,
            lossTorqueNm: 0,
            starterTorqueNm: 0,
            clutchTorqueNm: 0,
            running: false,
            cranking: false,
            fuelCut: false,
            idleThrottle: 0,
            effectiveThrottle: 0,
            stalledThisStep: false,
        };
    }

    private makeClutchPlaceholder(): ClutchResult {
        return {
            torqueNm: 0,
            capacityNm: 0,
            engagement: 0,
            slipRadPerSec: 0,
            slipPowerW: 0,
            mode: "open",
            temperatureC: this.config.clutch.ambientTempC,
            wear: 0,
            heatAddedJ: 0,
        };
    }

    private pushEvent(type: SimEventType, message: string, cooldownS: number): void {
        const now = this.timeS;
        const nextAllowed = this.eventCooldowns.get(type) ?? 0;
        if (now < nextAllowed) return;
        if (cooldownS > 0) this.eventCooldowns.set(type, now + cooldownS);
        this.events.push({ timeS: now, type, message });
        if (this.events.length > 30) this.events.shift();
    }
}
