import {
    assertValidVehicleConfig,
    type VehicleConfig,
} from "../../src/simulation/config/VehicleConfig";
import {
    VehicleSimulation,
    type VehicleControls,
} from "../../src/simulation/vehicle/VehicleSimulation";
import config from "../../src/data/reference-compact.json";
import { clamp01, moveTowards } from "../../src/simulation/core/MathUtils";

export const vehicleConfig: VehicleConfig = assertValidVehicleConfig(config as unknown);

export const baseControls = (): VehicleControls => ({
    throttle: 0,
    brake: 0,
    clutchPedal: 1,
    steering: 0,
    handbrake: false,
    ignition: true,
    starter: false,
});

export function makeSimulation(): VehicleSimulation {
    return new VehicleSimulation(vehicleConfig);
}

export function stepFor(
    sim: VehicleSimulation,
    seconds: number,
    controls: (sim: VehicleSimulation, elapsed: number) => VehicleControls,
    dt = 1 / 250,
): void {
    const steps = Math.round(seconds / dt);
    for (let index = 0; index < steps; index += 1) {
        sim.step(dt, controls(sim, index * dt));
    }
}

export interface LaunchResult {
    speedMps: number;
    rpm: number;
    running: boolean;
    stalled: boolean;
}

export function launch(sim: VehicleSimulation, throttle = 0.5, dt = 1 / 250): LaunchResult {
    let stalled = false;
    let pedal = 1;
    const controls = (throttleValue: number): VehicleControls => ({
        ...baseControls(),
        throttle: throttleValue,
        clutchPedal: pedal,
    });

    const phase = (duration: number, targetPedal: number, throttleValue: number): void => {
        const steps = Math.round(duration / dt);
        for (let index = 0; index < steps; index += 1) {
            pedal = moveTowards(pedal, targetPedal, (1 / Math.max(duration, dt)) * dt);
            sim.step(dt, controls(throttleValue));
            if (sim.drainEvents().some((event) => event.type === "stall")) stalled = true;
        }
    };

    phase(1, 1, throttle);
    phase(0.5, 0.62, throttle);
    phase(0.5, 0.6, throttle);
    phase(0.5, 0.57, throttle);
    phase(0.5, 0.54, throttle);
    phase(0.5, 0.5, throttle);
    phase(0.5, 0.45, throttle);
    phase(0.5, 0.35, throttle);
    phase(0.5, 0.2, throttle);
    phase(0.5, 0, throttle * 0.8);
    phase(1, 0, throttle * 0.6);
    return {
        speedMps: sim.speedMps,
        rpm: sim.engine.rpm,
        running: sim.engine.running,
        stalled: stalled || !sim.engine.running,
    };
}

export function selectGear(sim: VehicleSimulation, gear: number): void {
    sim.selectGearDirect(gear);
}

export function startWarm(
    sim: VehicleSimulation,
    options: { gear?: number; x?: number; y?: number; heading?: number } = {},
): void {
    sim.reset({
        engineRunning: true,
        gear: options.gear ?? 0,
        clutchPedal: 1,
        ignition: true,
        x: options.x ?? 0,
        y: options.y ?? 0,
        heading: options.heading ?? 0,
    });
}

export function throttleClutchTransition(
    fromClutch: number,
    toClutch: number,
    fromThrottle: number,
    toThrottle: number,
    durationS: number,
): (sim: VehicleSimulation, elapsed: number) => VehicleControls {
    return (_sim, elapsed) => {
        const t = clamp01(elapsed / durationS);
        return {
            ...baseControls(),
            throttle: fromThrottle + (toThrottle - fromThrottle) * t,
            clutchPedal: fromClutch + (toClutch - fromClutch) * t,
        };
    };
}
