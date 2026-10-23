import { clamp } from "../core/MathUtils";
import type { TireModel } from "../tires/TireModel";

export interface WheelUpdateInput {
  dt: number;
  driveTorqueNm: number;
  brakeTorqueNm: number;
  normalLoadN: number;
  forwardSpeedMps: number;
  surfaceMu: number;
  wheelRadiusM: number;
  wheelInertiaKgM2: number;
}

export interface WheelUpdateResult {
  omega: number;
  longitudinalForceN: number;
  slipRatio: number;
  lockup: boolean;
}

export class WheelModel {
  omega = 0;
  slipRatio = 0;
  longitudinalForceN = 0;
  lockup = false;

  constructor(
    readonly id: string,
    private readonly tire: TireModel,
  ) {}

  update(input: WheelUpdateInput): WheelUpdateResult {
    const {
      dt,
      driveTorqueNm,
      brakeTorqueNm,
      normalLoadN,
      forwardSpeedMps,
      surfaceMu,
      wheelRadiusM,
      wheelInertiaKgM2,
    } = input;

    const inertia = Math.max(wheelInertiaKgM2, 0.01);
    const maxForce = this.tire.maxLongitudinalForce(normalLoadN, surfaceMu);
    const peakSlip = this.tire.peakSlip;
    const denominator = Math.max(Math.abs(forwardSpeedMps), 1.0);

    if (Math.abs(driveTorqueNm) < 0.5 && brakeTorqueNm < 0.5) {
      this.omega = forwardSpeedMps / wheelRadiusM;
      this.slipRatio = 0;
      this.longitudinalForceN = 0;
      this.lockup = false;
      return { omega: this.omega, longitudinalForceN: 0, slipRatio: 0, lockup: false };
    }

    const forceAt = (omega: number): number => {
      const kappa = (wheelRadiusM * omega - forwardSpeedMps) / denominator;
      return maxForce * Math.tanh(kappa / peakSlip);
    };
    const equation = (omega: number): number => {
      const rollingResistance = brakeTorqueNm * Math.tanh(omega / 0.08);
      return (
        (inertia / dt) * (omega - this.omega) +
        wheelRadiusM * forceAt(omega) +
        rollingResistance -
        driveTorqueNm
      );
    };

    const span = Math.max(600, Math.abs(this.omega) + 250, Math.abs(forwardSpeedMps / wheelRadiusM) + 250);
    let low = -span;
    let high = span;
    let lowValue = equation(low);
    let highValue = equation(high);
    let guard = 0;
    while (lowValue > 0 && guard < 8) {
      low -= span;
      lowValue = equation(low);
      guard += 1;
    }
    guard = 0;
    while (highValue < 0 && guard < 8) {
      high += span;
      highValue = equation(high);
      guard += 1;
    }
    for (let iteration = 0; iteration < 42; iteration += 1) {
      const middle = (low + high) * 0.5;
      const value = equation(middle);
      if (value > 0) high = middle;
      else low = middle;
    }
    const solvedOmega = (low + high) * 0.5;
    this.omega = Number.isFinite(solvedOmega) ? clamp(solvedOmega, -1200, 1200) : 0;
    const kappa = (wheelRadiusM * this.omega - forwardSpeedMps) / denominator;
    const force = forceAt(this.omega);
    this.slipRatio = kappa;
    this.longitudinalForceN = force;
    this.lockup = Math.abs(this.omega) < 0.6 && Math.abs(forwardSpeedMps) > 2;
    return {
      omega: this.omega,
      longitudinalForceN: force,
      slipRatio: kappa,
      lockup: this.lockup,
    };
  }

  setOmega(omega: number): void {
    this.omega = omega;
  }

  reset(): void {
    this.omega = 0;
    this.slipRatio = 0;
    this.longitudinalForceN = 0;
    this.lockup = false;
  }
}
