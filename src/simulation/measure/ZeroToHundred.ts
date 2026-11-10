import type { VehicleConfig } from "../config/VehicleConfig";
import { VehicleSimulation, type VehicleControls } from "../vehicle/VehicleSimulation";

export interface ZeroToHundredResult {
    timeS: number;
    reached: boolean;
}

const STEP_S = 1 / 250;
const MAX_TIME_S = 20;
const TARGET_KPH = 100;
const LAUNCH_Y = -110;

const fullThrottle: VehicleControls = {
    throttle: 1,
    brake: 0,
    clutchPedal: 0,
    steering: 0,
    handbrake: false,
    ignition: true,
    starter: false,
};

/**
 * Road speed at which the current gear reaches the shift rpm, so the launch
 * does not stack upshifts while the clutch is still synchronising.
 */
function shiftSpeedMps(config: VehicleConfig, gear: number, shiftRpm: number): number {
    const ratio = (config.gearRatios[gear - 1] ?? 0) * config.finalDriveRatio;
    return ratio > 0 ? (shiftRpm * Math.PI * config.wheelRadiusM) / (30 * ratio) : Infinity;
}

export function measureZeroToHundred(config: VehicleConfig): ZeroToHundredResult {
    const sim = new VehicleSimulation(config);
    sim.autoClutch = true;
    sim.reset({ engineRunning: true, gear: 0, ignition: true, y: LAUNCH_Y });

    // Bring the engine to a launch rpm in neutral, then drop it into first and
    // start the clock. Without this the automatic clutch can bog a torque-rich
    // engine below its stall speed before the car is rolling.
    const launchRpm = Math.min(config.engine.idleRpm * 3, config.engine.redlineRpm * 0.5);
    for (let i = 0; i < 250 && sim.engine.rpm < launchRpm; i += 1) {
        sim.step(STEP_S, fullThrottle);
    }
    sim.selectGearDirect(1);

    const shiftRpm = Math.min(8500, config.engine.redlineRpm - 200);
    let elapsed = 0;

    while (elapsed < MAX_TIME_S) {
        sim.step(STEP_S, fullThrottle);
        elapsed += STEP_S;

        if (sim.speedMps * 3.6 >= TARGET_KPH) return { timeS: elapsed, reached: true };

        if (
            sim.gear > 0 &&
            sim.gear < 6 &&
            sim.engine.rpm >= shiftRpm &&
            sim.speedMps >= shiftSpeedMps(config, sim.gear, shiftRpm)
        ) {
            sim.selectGearDirect(sim.gear + 1);
        }
    }

    return { timeS: elapsed, reached: false };
}
