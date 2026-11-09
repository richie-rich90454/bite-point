// Engine losses and idle behavior follow Heywood [R9].
import { clamp, moveTowards, rpmToRadPerSec } from "../core/MathUtils";

export class IdleController {
    private integral = 0;
    private output = 0;

    constructor(
        private readonly targetRpm = 820,
        private readonly maxThrottle = 0.6,
    ) {}

    update(rpm: number, running: boolean, driverThrottle: number, dt: number): number {
        if (!running) {
            this.integral = 0;
            this.output = moveTowards(this.output, 0, dt * 2);
            return this.output;
        }
        const error = this.targetRpm - rpm;
        if (error <= 0 && driverThrottle > 0.04) {
            this.integral = Math.max(0, this.integral - dt * 0.4);
            this.output = moveTowards(this.output, 0, dt * 3);
            return this.output;
        }

        const proportional = clamp(error / 700, -0.5, 0.9) * 0.5;
        this.integral = clamp(this.integral + (error / 700) * dt * 0.9, 0, this.maxThrottle);
        this.output = clamp(proportional + this.integral, 0, this.maxThrottle);
        return this.output;
    }

    get throttleCommand(): number {
        return this.output;
    }

    reset(): void {
        this.integral = 0;
        this.output = 0;
    }
}

export interface EngineControl {
    throttle: number;
    ignition: boolean;
    starter: boolean;
}

export interface EngineResult {
    rpm: number;
    angularVelocity: number;
    torqueNm: number;
    combustionTorqueNm: number;
    lossTorqueNm: number;
    starterTorqueNm: number;
    clutchTorqueNm: number;
    running: boolean;
    cranking: boolean;
    fuelCut: boolean;
    idleThrottle: number;
    effectiveThrottle: number;
    stalledThisStep: boolean;
}

export interface EngineParameters {
    idleRpm: number;
    redlineRpm: number;
    stallRpm: number;
    startRpm: number;
    inertiaKgM2: number;
    starterTorqueNm: number;
    frictionBaseNm: number;
    frictionPerRadPerSec: number;
    pumpingLossNm: number;
    torqueAtRpm: (rpm: number) => number;
}

export class EngineModel {
    readonly idle: IdleController;
    angularVelocity = 0;
    running = false;
    cranking = false;
    fuelCut = false;
    antiStallAssist = true;
    private ignitionWasOn = false;
    private stallFlag = false;

    constructor(private readonly params: EngineParameters) {
        this.idle = new IdleController(params.idleRpm);
    }

    get rpm(): number {
        return (this.angularVelocity * 30) / Math.PI;
    }

    update(control: EngineControl, clutchTorqueNm: number, dt: number): EngineResult {
        const throttle = clamp(control.throttle, 0, 1);

        if (this.ignitionWasOn && !control.ignition) {
            this.running = false;
            this.fuelCut = false;
        }
        this.ignitionWasOn = control.ignition;

        this.cranking = control.ignition && control.starter && !this.running;
        const rpm = this.rpm;
        const idleThrottle = this.idle.update(rpm, this.running, throttle, dt);
        const stallAssist =
            this.antiStallAssist && this.running && rpm < this.params.idleRpm * 0.9 ? 0.35 : 0;
        const effectiveThrottle = Math.max(throttle, idleThrottle, stallAssist);

        if (this.running && rpm >= this.params.redlineRpm) this.fuelCut = true;
        if (!this.running) this.fuelCut = false;
        if (this.fuelCut && rpm < this.params.redlineRpm - 180) this.fuelCut = false;

        let combustion = 0;
        if (this.running && !this.fuelCut) {
            combustion = this.params.torqueAtRpm(Math.max(rpm, 0)) * effectiveThrottle;
        }

        const friction =
            this.params.frictionBaseNm +
            this.params.frictionPerRadPerSec * Math.max(this.angularVelocity, 0);
        const pumping = this.params.pumpingLossNm * (1 - effectiveThrottle);
        const loss = friction + pumping;

        let starterTorque = 0;
        if (this.cranking) starterTorque = this.params.starterTorqueNm;
        else if (
            control.starter &&
            control.ignition &&
            this.running &&
            this.angularVelocity < this.params.startRpm
        ) {
            starterTorque = this.params.starterTorqueNm * 0.5;
        }

        const netTorque = combustion + starterTorque - loss - clutchTorqueNm;
        this.angularVelocity = Math.max(
            0,
            this.angularVelocity + (netTorque / this.params.inertiaKgM2) * dt,
        );

        this.stallFlag = false;
        if (
            !this.running &&
            this.cranking &&
            this.angularVelocity >= rpmToRadPerSec(this.params.startRpm)
        ) {
            this.running = true;
        }
        if (this.running && this.rpm < this.params.stallRpm) {
            this.running = false;
            this.fuelCut = false;
            this.stallFlag = true;
        }

        if (!this.running && !this.cranking && this.angularVelocity < 0.8) {
            this.angularVelocity = 0;
        }

        return {
            rpm: this.rpm,
            angularVelocity: this.angularVelocity,
            torqueNm: combustion + starterTorque - loss,
            combustionTorqueNm: combustion,
            lossTorqueNm: loss,
            starterTorqueNm: starterTorque,
            clutchTorqueNm,
            running: this.running,
            cranking: this.cranking,
            fuelCut: this.fuelCut,
            idleThrottle,
            effectiveThrottle,
            stalledThisStep: this.stallFlag,
        };
    }

    setRunning(running: boolean): void {
        this.running = running;
        this.cranking = false;
        this.fuelCut = false;
        this.stallFlag = false;
    }

    setAngularVelocity(radPerSec: number): void {
        this.angularVelocity = Math.max(0, radPerSec);
    }

    reset(): void {
        this.angularVelocity = 0;
        this.running = false;
        this.cranking = false;
        this.fuelCut = false;
        this.ignitionWasOn = false;
        this.idle.reset();
    }
}
