import { describe, expect, it } from "vitest";
import { RoadContactProvider } from "../../src/simulation/road/RoadContactProvider";
import { WorldGenerator } from "../../src/simulation/world/WorldGenerator";
import { VehicleSimulation } from "../../src/simulation/vehicle/VehicleSimulation";
import { vehicleConfig, baseControls, launch, stepFor } from "../support/simulation";

function makeEndlessSimulation(): { sim: VehicleSimulation; road: RoadContactProvider } {
    const road = new RoadContactProvider();
    const world = new WorldGenerator(2026);
    road.setWorld(world);
    const sim = new VehicleSimulation(vehicleConfig, road);
    sim.reset({ x: 0, y: 0, heading: 0, gear: 0, engineRunning: true, ignition: true });
    return { sim, road };
}

describe("endless world driving", () => {
    it("drives forward on the procedural road with a stable simulation", () => {
        const { sim } = makeEndlessSimulation();
        sim.selectGearDirect(1);
        expect(launch(sim, 0.7).running).toBe(true);
        let elapsed = 0;
        while (elapsed < 20 && sim.speedMps * 3.6 < 120) {
            if (sim.engine.rpm > 5500 && sim.gear < 5) {
                stepFor(sim, 0.25, () => ({ ...baseControls(), clutchPedal: 1 }));
                sim.selectGearDirect(sim.gear + 1);
                stepFor(sim, 0.3, (_sim, t) => ({
                    ...baseControls(),
                    throttle: 0.6,
                    clutchPedal: Math.max(0, 1 - t / 0.3),
                }));
                elapsed += 0.55;
            }
            sim.step(1 / 250, { ...baseControls(), throttle: 1, clutchPedal: 0 });
            elapsed += 1 / 250;
        }
        expect(sim.engine.running).toBe(true);
        expect(sim.x).toBeGreaterThan(100);
        expect(sim.speedMps * 3.6).toBeGreaterThan(80);
        expect(Number.isFinite(sim.body.state.x)).toBe(true);
        expect(Number.isFinite(sim.body.state.vx)).toBe(true);
        expect(Number.isFinite(sim.body.state.yawRate)).toBe(true);
    });

    it("classifies asphalt and off-road grip differently", () => {
        const { road } = makeEndlessSimulation();
        const paved = road.surfaceMuAt(0, 0);
        const verge = road.surfaceMuAt(0, 40);
        expect(paved).toBeGreaterThan(0.9);
        expect(verge).toBeLessThan(paved);
        expect(road.rollingResistanceScaleAt(0, 40)).toBeGreaterThan(
            road.rollingResistanceScaleAt(0, 0),
        );
    });

    it("launches and upshifts with the automatic clutch", () => {
        const { sim } = makeEndlessSimulation();
        sim.autoClutch = true;
        sim.selectGearDirect(1);
        stepFor(sim, 6, () => ({ ...baseControls(), throttle: 0.65 }));
        expect(sim.engine.running).toBe(true);
        expect(sim.speedMps).toBeGreaterThan(2);
        sim.selectGearDirect(2);
        stepFor(sim, 1, () => ({ ...baseControls(), throttle: 0.5 }));
        expect(sim.gear).toBe(2);
        expect(Number.isFinite(sim.body.state.vx)).toBe(true);
    });

    it("keeps a high-speed steering input predictable", () => {
        const { sim } = makeEndlessSimulation();
        sim.stabilityAssist = true;
        sim.body.state.vx = 25;
        sim.wheels.forEach((wheel) => {
            wheel.omega = 25 / sim.config.wheelRadiusM;
        });
        sim.selectGearDirect(4);
        stepFor(sim, 3, () => ({
            ...baseControls(),
            steering: 0.25,
            throttle: 0.2,
        }));
        expect(Math.abs(sim.body.state.yawRate)).toBeLessThan(1.8);
        expect(Math.abs(sim.body.state.vy)).toBeLessThan(6);
        expect(Number.isFinite(sim.body.state.yawRate)).toBe(true);
        expect(Number.isFinite(sim.body.state.vy)).toBe(true);
    });

    it("pushes the car back inside the guardrails", () => {
        const { sim } = makeEndlessSimulation();
        sim.body.state.y = 20;
        sim.body.state.vx = 15;
        sim.step(1 / 250, { ...baseControls(), clutchPedal: 0 });
        expect(Math.abs(sim.body.state.y)).toBeLessThan(20);
        expect(sim.drainEvents().some((event) => event.type === "barrier")).toBe(true);
    });
});
