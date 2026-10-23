import { clamp01 } from "../core/MathUtils";

export interface BrakeParameters {
  frontTorqueNm: number;
  rearTorqueNm: number;
  handbrakeTorqueNm: number;
}

export class BrakeModel {
  constructor(private readonly params: BrakeParameters) {}

  torqueForWheel(pedal: number, handbrake: boolean, axle: "front" | "rear"): number {
    const progressive = Math.pow(clamp01(pedal), 1.15);
    const service = axle === "front" ? this.params.frontTorqueNm : this.params.rearTorqueNm;
    const handbrakeTorque = handbrake && axle === "rear" ? this.params.handbrakeTorqueNm : 0;
    return service * progressive + handbrakeTorque;
  }

  totalTorque(pedal: number, handbrake: boolean): number {
    return (
      this.torqueForWheel(pedal, handbrake, "front") * 2 +
      this.torqueForWheel(pedal, handbrake, "rear") * 2
    );
  }
}
