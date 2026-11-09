// Combined-slip tire forces follow the empirical formulation in Pacejka [R6].
import { clamp } from "../core/MathUtils";
import type { TireConfig } from "../config/VehicleConfig";

export interface TireForces {
    longitudinal: number;
    lateral: number;
}

export class TireModel {
    private readonly referenceLoadN = 4000;

    constructor(private readonly config: TireConfig) {}

    get peakSlip(): number {
        return this.config.peakSlip;
    }

    effectiveMu(normalLoadN: number, surfaceMu = 1): number {
        if (normalLoadN <= 0) return 0;
        const loadRatio = normalLoadN / this.referenceLoadN;
        const sensitivity = clamp(1 - this.config.loadSensitivity * (loadRatio - 1), 0.55, 1.2);
        return this.config.mu * surfaceMu * sensitivity;
    }

    maxLongitudinalForce(normalLoadN: number, surfaceMu = 1): number {
        return Math.max(0, normalLoadN) * this.effectiveMu(normalLoadN, surfaceMu);
    }

    maxLateralForce(normalLoadN: number, surfaceMu = 1): number {
        return (
            Math.max(0, normalLoadN) *
            this.effectiveMu(normalLoadN, surfaceMu) *
            this.config.lateralStiffnessFactor
        );
    }

    slipRatio(
        wheelOmega: number,
        wheelRadiusM: number,
        forwardSpeedMps: number,
        floorMps = 1,
    ): number {
        const wheelSpeed = wheelOmega * wheelRadiusM;
        const denominator = Math.max(Math.abs(forwardSpeedMps), Math.abs(wheelSpeed), floorMps);
        return (wheelSpeed - forwardSpeedMps) / denominator;
    }

    slipAngle(lateralSpeedMps: number, forwardSpeedMps: number, floorMps = 1): number {
        return Math.atan2(lateralSpeedMps, Math.max(Math.abs(forwardSpeedMps), floorMps));
    }

    longitudinalForce(kappa: number, normalLoadN: number, surfaceMu = 1): number {
        const maxForce = this.maxLongitudinalForce(normalLoadN, surfaceMu);
        return maxForce * Math.tanh(kappa / this.config.peakSlip);
    }

    lateralForce(slipAngleRad: number, normalLoadN: number, surfaceMu = 1): number {
        const maxForce = this.maxLateralForce(normalLoadN, surfaceMu);
        const peak = this.config.peakSlipAngleRad / this.config.lateralStiffnessFactor;
        return maxForce * Math.tanh(slipAngleRad / peak);
    }

    combinedForces(
        longitudinalN: number,
        lateralN: number,
        normalLoadN: number,
        surfaceMu = 1,
    ): TireForces {
        const maxLongitudinal = this.maxLongitudinalForce(normalLoadN, surfaceMu);
        const maxLateral = this.maxLateralForce(normalLoadN, surfaceMu);
        if (maxLongitudinal <= 0 || maxLateral <= 0) return { longitudinal: 0, lateral: 0 };
        const ellipse = (longitudinalN / maxLongitudinal) ** 2 + (lateralN / maxLateral) ** 2;
        if (ellipse <= 1) return { longitudinal: longitudinalN, lateral: lateralN };
        const scale = 1 / Math.sqrt(ellipse);
        return { longitudinal: longitudinalN * scale, lateral: lateralN * scale };
    }
}
