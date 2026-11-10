import type { BodyState } from "./VehicleBodyModel";
import type { ClutchMode } from "../clutch/ClutchModel";

export interface WheelRenderState {
    omega: number;
    steerAngleRad: number;
    normalLoadN: number;
    slipRatio: number;
    compressionM: number;
    longitudinalForceN: number;
}

export interface VehicleRenderState {
    timeS: number;
    pose: BodyState;
    speedMps: number;
    speedKph: number;
    rpm: number;
    gear: number;
    gearLabel: string;
    throttle: number;
    brake: number;
    clutchPedal: number;
    clutchBitePedal: number;
    clutchEngagementWidth: number;
    handbrake: boolean;
    launchControlActive?: boolean;
    steeringInput: number;
    steeringAngleRad: number;
    steeringWheelAngleRad: number;
    ignition: boolean;
    starter: boolean;
    engineRunning: boolean;
    cranking: boolean;
    fuelCut: boolean;
    engineTorqueNm: number;
    clutchMode: ClutchMode;
    clutchSlipRadPerSec: number;
    clutchCapacityNm: number;
    clutchEngagement: number;
    clutchTemperatureC: number;
    clutchWear: number;
    gearboxTorqueFactor: number;
    shifterGate: number;
    shifterSlot: number;
    shifterGrabbed: boolean;
    sessionSurfaceMu: number;
    slopeForward: number;
    slopeLateral: number;
    wheelLocked: boolean;
    wheels: WheelRenderState[];
}

export function gearLabel(gear: number): string {
    if (gear === -1) return "R";
    if (gear === 0) return "N";
    return String(gear);
}
