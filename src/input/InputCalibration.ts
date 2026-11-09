import { clamp01 } from "../simulation/core/MathUtils";

export interface CalibrationSettings {
    deadzone: number;
    throttleExponent: number;
    brakeExponent: number;
    clutchExponent: number;
    steeringExponent: number;
}

export const DEFAULT_CALIBRATION: CalibrationSettings = {
    deadzone: 0.04,
    throttleExponent: 1.2,
    brakeExponent: 1.1,
    clutchExponent: 1,
    steeringExponent: 1.35,
};

export class InputCalibration {
    constructor(private settings: CalibrationSettings = { ...DEFAULT_CALIBRATION }) {}

    private applyDeadzone(value: number): number {
        const magnitude = Math.abs(value);
        if (magnitude <= this.settings.deadzone) return 0;
        return (
            Math.sign(value) *
            clamp01((magnitude - this.settings.deadzone) / (1 - this.settings.deadzone))
        );
    }

    throttle(value: number): number {
        const normalized = this.applyDeadzone(clamp01(value));
        return Math.pow(normalized, this.settings.throttleExponent);
    }

    brake(value: number): number {
        const normalized = this.applyDeadzone(clamp01(value));
        return Math.pow(normalized, this.settings.brakeExponent);
    }

    clutch(value: number): number {
        const normalized = this.applyDeadzone(clamp01(value));
        return Math.pow(normalized, this.settings.clutchExponent);
    }

    steering(value: number): number {
        const normalized = this.applyDeadzone(Math.max(-1, Math.min(1, value)));
        return (
            Math.sign(normalized) * Math.pow(Math.abs(normalized), this.settings.steeringExponent)
        );
    }

    update(settings: Partial<CalibrationSettings>): void {
        this.settings = { ...this.settings, ...settings };
    }
}
