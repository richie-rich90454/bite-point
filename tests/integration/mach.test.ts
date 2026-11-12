import { describe, expect, it } from "vitest";
import { getCar } from "../../src/data/CarCatalog";
import { RoadContactProvider } from "../../src/simulation/road/RoadContactProvider";
import { WorldGenerator } from "../../src/simulation/world/WorldGenerator";
import { VehicleSimulation } from "../../src/simulation/vehicle/VehicleSimulation";
import { baseControls } from "../support/simulation";

const machCar = getCar("electric-hypercar-1mt")!;

function straightSimulation(): VehicleSimulation {
    const road = new RoadContactProvider();
    road.setWorld(new WorldGenerator(2026, "straight"));
    const sim = new VehicleSimulation(machCar.config, road);
    sim.reset({ x: 0, y: 0, heading: 0, gear: 1, engineRunning: true, ignition: true });
    sim.autoClutch = true;
    return sim;
}

describe("Mach 1 top speed", () => {
    it("reaches beyond 900 km/h on the endless straight", () => {
        const sim = straightSimulation();
        let maximum = 0;
        let elapsed = 0;
        const shiftSpeeds = [0, 28, 44, 66, 100, 150];
        while (elapsed < 180 && maximum < 920) {
            if (sim.gear > 0 && sim.gear < 6 && sim.speedMps > shiftSpeeds[sim.gear]!) {
                sim.selectGearDirect(sim.gear + 1);
            }
            sim.step(1 / 250, { ...baseControls(), throttle: 1 });
            maximum = Math.max(maximum, sim.speedMps * 3.6);
            elapsed += 1 / 250;
        }
        expect(maximum).toBeGreaterThan(900);
        expect(Number.isFinite(sim.body.state.vx)).toBe(true);
    });

    it("stays directional at 500 km/h with full steering input", () => {
        const sim = straightSimulation();
        sim.reset({ x: 0, y: 0, heading: 0, gear: 6, engineRunning: true, ignition: true });
        sim.body.state.vx = 139;
        sim.body.state.vy = 0;
        sim.wheels.forEach((wheel) => {
            wheel.omega = 139 / sim.config.wheelRadiusM;
        });
        const headingStart = sim.body.state.heading;
        for (let index = 0; index < 500; index += 1) {
            sim.step(1 / 250, { ...baseControls(), throttle: 0.8, steering: 1 });
        }
        expect(Math.abs(sim.body.state.yawRate)).toBeLessThan(0.2);
        expect(Math.abs(sim.body.state.vy)).toBeLessThan(9);
        expect(Math.abs(sim.body.state.heading - headingStart)).toBeLessThan(0.6);
        expect(Number.isFinite(sim.body.state.vx)).toBe(true);
    });
});
