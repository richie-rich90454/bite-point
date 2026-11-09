import { clamp, clamp01, smoothstep } from "../core/MathUtils";

export type ClutchMode = "open" | "slipping" | "locked";

export interface ClutchParameters {
    maxCapacityNm: number;
    frictionCoeff: number;
    effectiveRadiusM: number;
    frictionSurfaces: number;
    bitePoint: number;
    engagementWidth: number;
    thermalMassJK: number;
    ambientTempC: number;
    maxTempC: number;
    coolingPerSecond: number;
    wearRatePerJoule: number;
}

export interface ClutchResult {
    torqueNm: number;
    capacityNm: number;
    engagement: number;
    slipRadPerSec: number;
    slipPowerW: number;
    mode: ClutchMode;
    temperatureC: number;
    wear: number;
    heatAddedJ: number;
}

export class ClutchModel {
    temperatureC: number;
    wear = 0;
    private lastHeatJ = 0;

    constructor(private readonly params: ClutchParameters) {
        this.temperatureC = params.ambientTempC;
    }

    get capacityAtFullEngagement(): number {
        return this.params.maxCapacityNm;
    }

    get clampForceN(): number {
        return (
            this.params.maxCapacityNm /
            (this.params.frictionCoeff *
                this.params.frictionSurfaces *
                this.params.effectiveRadiusM)
        );
    }

    engagementForPedal(pedal: number): number {
        const p = clamp01(pedal);
        const half = this.params.engagementWidth / 2;
        return 1 - smoothstep(this.params.bitePoint - half, this.params.bitePoint + half, p);
    }

    capacityForPedal(pedal: number): number {
        const engagement = this.engagementForPedal(pedal);
        const thermal = this.thermalCapacityFactor();
        const wear = clamp(1 - this.wear * 0.6, 0.3, 1);
        return this.params.maxCapacityNm * engagement * thermal * wear;
    }

    computeTorque(
        pedal: number,
        engineOmega: number,
        inputOmega: number,
        dt: number,
        engineInertiaKgM2: number,
        drivelineInertiaReflectedKgM2: number,
    ): ClutchResult {
        this.lastHeatJ = 0;
        const capacity = this.capacityForPedal(pedal);
        const engagement = this.engagementForPedal(pedal);
        const slip = engineOmega - inputOmega;

        if (engagement < 0.01 || capacity < 0.01) {
            this.updateThermal(0, dt);
            return this.result(0, capacity, engagement, slip, "open");
        }

        const inertiaEngine = Math.max(engineInertiaKgM2, 1e-4);
        const inertiaDriveline = Math.max(drivelineInertiaReflectedKgM2, 1e-4);
        const effectiveInertia =
            (inertiaEngine * inertiaDriveline) / (inertiaEngine + inertiaDriveline);
        const desired = (slip / Math.max(dt, 1e-6)) * effectiveInertia;
        const torque = clamp(desired, -capacity, capacity);
        const locked = Math.abs(slip) < 0.5 && Math.abs(desired) < capacity * 0.98;
        const slipPower = locked ? 0 : Math.abs(torque * slip);
        const heat = slipPower * dt;

        this.updateThermal(heat, dt);
        return this.result(torque, capacity, engagement, slip, locked ? "locked" : "slipping");
    }

    private thermalCapacityFactor(): number {
        const overheatStart = 240;
        const excess = Math.max(0, this.temperatureC - overheatStart);
        return clamp(1 - (excess / (this.params.maxTempC - overheatStart)) * 0.65, 0.3, 1);
    }

    private updateThermal(heatJ: number, dt: number): void {
        const cooling =
            (this.temperatureC - this.params.ambientTempC) * this.params.coolingPerSecond;
        this.temperatureC += heatJ / this.params.thermalMassJK - cooling * dt;
        this.temperatureC = clamp(
            this.temperatureC,
            this.params.ambientTempC,
            this.params.maxTempC,
        );
        if (heatJ > 0) {
            this.wear = clamp01(this.wear + heatJ * this.params.wearRatePerJoule);
        }
        this.lastHeatJ = heatJ;
    }

    private result(
        torqueNm: number,
        capacityNm: number,
        engagement: number,
        slipRadPerSec: number,
        mode: ClutchMode,
    ): ClutchResult {
        return {
            torqueNm,
            capacityNm,
            engagement,
            slipRadPerSec,
            slipPowerW: mode === "locked" ? 0 : Math.abs(torqueNm * slipRadPerSec),
            mode,
            temperatureC: this.temperatureC,
            wear: this.wear,
            heatAddedJ: this.lastHeatJ,
        };
    }

    reset(): void {
        this.temperatureC = this.params.ambientTempC;
        this.wear = 0;
        this.lastHeatJ = 0;
    }
}
