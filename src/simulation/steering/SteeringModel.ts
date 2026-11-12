import { clamp, moveTowards } from "../core/MathUtils";

export interface SteeringParameters {
    maxAngleRad: number;
    rateRadPerSec: number;
    returnRateRadPerSec: number;
    highSpeedFactor: number;
    speedSensitivityKph: number;
}

export class SteeringModel {
    angleRad = 0;
    private speedMps = 0;

    constructor(private readonly params: SteeringParameters) {}

    get steeringWheelAngleRad(): number {
        const speedRatio = clamp((Math.abs(this.speedMps) * 3.6) / 120, 0, 1);
        const ratio = 15 - speedRatio * 3;
        return this.angleRad * ratio;
    }

    maxAngleAtSpeed(speedMps: number): number {
        const speedKph = Math.abs(speedMps) * 3.6;
        const t = clamp(speedKph / this.params.speedSensitivityKph, 0, 1);
        return this.params.maxAngleRad * (1 - t * (1 - this.params.highSpeedFactor));
    }

    update(dt: number, input: number, speedMps: number): number {
        this.speedMps = speedMps;
        const normalized = clamp(input, -1, 1);
        const magnitude = Math.abs(normalized);
        const shaped = Math.sign(normalized) * (magnitude * 0.55 + magnitude * magnitude * 0.45);
        const maxAngle = this.maxAngleAtSpeed(speedMps);
        const target = shaped * maxAngle;
        const rate = magnitude < 0.02 ? this.params.returnRateRadPerSec : this.params.rateRadPerSec;
        this.angleRad = moveTowards(this.angleRad, target, rate * dt);
        return this.angleRad;
    }

    reset(): void {
        this.angleRad = 0;
        this.speedMps = 0;
    }
}
