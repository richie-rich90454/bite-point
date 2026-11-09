import { clamp, GRAVITY, wrapAngle } from "../core/MathUtils";

export interface BodyState {
    x: number;
    y: number;
    z: number;
    heading: number;
    pitch: number;
    roll: number;
    vx: number;
    vy: number;
    yawRate: number;
}

export interface BodyForces {
    longitudinalN: number;
    lateralN: number;
    yawMomentNm: number;
    dragN: number;
    rollingResistanceN: number;
    slopeForward: number;
    slopeLateral: number;
    steerAngleRad: number;
}

export interface BodySnapshot extends BodyState {}

export class VehicleBodyModel {
    readonly state: BodyState;
    readonly inertiaZ: number;
    lastLongitudinalAcceleration = 0;
    lastLateralAcceleration = 0;
    private previous: BodySnapshot;

    constructor(
        readonly massKg: number,
        readonly wheelbaseM: number,
        readonly trackM: number,
        readonly cgHeightM: number,
        startX = 0,
        startY = 0,
        startHeading = 0,
    ) {
        this.inertiaZ = (massKg * (wheelbaseM * wheelbaseM + trackM * trackM)) / 12;
        this.state = {
            x: startX,
            y: startY,
            z: 0,
            heading: startHeading,
            pitch: 0,
            roll: 0,
            vx: 0,
            vy: 0,
            yawRate: 0,
        };
        this.previous = { ...this.state };
    }

    get speedMps(): number {
        return Math.hypot(this.state.vx, this.state.vy);
    }

    capturePrevious(): void {
        this.previous = { ...this.state };
    }

    shiftPosition(x: number, y: number): void {
        this.state.x += x;
        this.state.y += y;
        this.previous.x += x;
        this.previous.y += y;
    }

    step(dt: number, forces: BodyForces): void {
        const { state } = this;
        const forwardAccel =
            forces.longitudinalN / this.massKg -
            forces.dragN / this.massKg -
            forces.rollingResistanceN / this.massKg -
            GRAVITY * Math.sin(forces.slopeForward);
        const lateralAccel =
            forces.lateralN / this.massKg - GRAVITY * Math.sin(forces.slopeLateral);

        const previousVx = state.vx;
        state.vx += (forwardAccel + state.yawRate * state.vy) * dt;
        state.vy += (lateralAccel - state.yawRate * state.vx) * dt;

        const yawAcceleration = forces.yawMomentNm / this.inertiaZ;
        state.yawRate += yawAcceleration * dt;

        const lowSpeed = clamp(1 - Math.abs(state.vx) / 2.5, 0, 1);
        if (lowSpeed > 0 && Math.abs(state.vx) > 0.05) {
            const kinematicYaw = (state.vx / this.wheelbaseM) * Math.tan(forces.steerAngleRad);
            state.yawRate += (kinematicYaw - state.yawRate) * lowSpeed * 6 * dt;
            state.vy *= Math.exp(-6 * lowSpeed * dt);
        }
        if (
            Math.abs(state.vx) < 0.03 &&
            Math.abs(forces.longitudinalN) < 25 &&
            Math.abs(forces.slopeForward) < 0.005
        ) {
            state.vx = 0;
            state.vy *= Math.exp(-10 * dt);
            state.yawRate *= Math.exp(-10 * dt);
        }

        state.yawRate = clamp(state.yawRate, -3.5, 3.5);
        state.heading = wrapAngle(state.heading + state.yawRate * dt);
        const cos = Math.cos(state.heading);
        const sin = Math.sin(state.heading);
        state.x += (state.vx * cos - state.vy * sin) * dt;
        state.y += (state.vx * sin + state.vy * cos) * dt;
        state.z = 0;

        this.lastLongitudinalAcceleration = dt > 0 ? (state.vx - previousVx) / dt : 0;
        this.lastLateralAcceleration = lateralAccel;
    }

    interpolated(alpha: number): BodyState {
        const t = clamp(alpha, 0, 1);
        const a = this.previous;
        const b = this.state;
        const headingDelta = wrapAngle(b.heading - a.heading);
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t,
            heading: wrapAngle(a.heading + headingDelta * t),
            pitch: a.pitch + (b.pitch - a.pitch) * t,
            roll: a.roll + (b.roll - a.roll) * t,
            vx: a.vx + (b.vx - a.vx) * t,
            vy: a.vy + (b.vy - a.vy) * t,
            yawRate: a.yawRate + (b.yawRate - a.yawRate) * t,
        };
    }

    reset(x: number, y: number, heading = 0): void {
        this.state.x = x;
        this.state.y = y;
        this.state.z = 0;
        this.state.heading = wrapAngle(heading);
        this.state.pitch = 0;
        this.state.roll = 0;
        this.state.vx = 0;
        this.state.vy = 0;
        this.state.yawRate = 0;
        this.previous = { ...this.state };
        this.lastLongitudinalAcceleration = 0;
        this.lastLateralAcceleration = 0;
    }
}
