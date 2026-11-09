import { describe, expect, it } from "vitest";
import { baseControls, launch, makeSimulation, startWarm, stepFor } from "../support/simulation";

describe("gearbox integration", () => {
    it("engages all six forward gears and neutral while the clutch is disengaged", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 1 });
        launch(sim, 0.5);
        for (const target of [2, 3, 4, 5, 6]) {
            stepFor(sim, 0.2, () => ({ ...baseControls(), clutchPedal: 1 }));
            sim.selectGearDirect(target);
            expect(sim.gear).toBe(target);
            expect(sim.shifter.selectedGear).toBe(target);
            expect(Number.isFinite(sim.gearbox.torqueFactor)).toBe(true);
        }
        sim.requestNeutral();
        expect(sim.gear).toBe(0);
        expect(sim.shifter.selectedGear).toBe(0);
    });

    it("is deterministic for identical inputs", () => {
        const run = () => {
            const sim = makeSimulation();
            startWarm(sim, { gear: 1 });
            launch(sim, 0.5);
            stepFor(sim, 2, () => ({
                ...baseControls(),
                throttle: 0.2,
                steering: 0.1,
                clutchPedal: 0,
            }));
            return sim.getRenderState(0);
        };
        const first = run();
        const second = run();
        expect(first.pose.x).toBeCloseTo(second.pose.x, 10);
        expect(first.pose.y).toBeCloseTo(second.pose.y, 10);
        expect(first.rpm).toBeCloseTo(second.rpm, 8);
    });

    it("stops safely on a wet surface", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 1, x: -20, y: 32, heading: 0 });
        expect(sim.getRenderState(0).sessionSurfaceMu).toBeLessThan(0.8);
        launch(sim, 0.5);
        stepFor(sim, 3, () => ({ ...baseControls(), brake: 1, clutchPedal: 1 }));
        expect(sim.speedMps).toBeLessThan(0.5);
        expect(Number.isFinite(sim.body.state.vx)).toBe(true);
    });
});
