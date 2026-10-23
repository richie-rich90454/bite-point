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
  private readonly steeringWheelRatio = 13;

  constructor(private readonly params: SteeringParameters) {}

  get steeringWheelAngleRad(): number {
    return this.angleRad * this.steeringWheelRatio;
  }

  maxAngleAtSpeed(speedMps: number): number {
    const speedKph = Math.abs(speedMps) * 3.6;
    const t = clamp(speedKph / this.params.speedSensitivityKph, 0, 1);
    return this.params.maxAngleRad * (1 - t * (1 - this.params.highSpeedFactor));
  }

  update(dt: number, input: number, speedMps: number): number {
    const normalized = clamp(input, -1, 1);
    const maxAngle = this.maxAngleAtSpeed(speedMps);
    const target = normalized * maxAngle;
    const rate = Math.abs(normalized) < 0.02 ? this.params.returnRateRadPerSec : this.params.rateRadPerSec;
    this.angleRad = moveTowards(this.angleRad, target, rate * dt);
    return this.angleRad;
  }

  reset(): void {
    this.angleRad = 0;
  }
}
