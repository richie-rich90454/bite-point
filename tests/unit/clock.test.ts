import { describe, expect, it } from "vitest";
import { SimulationClock } from "../../src/simulation/core/SimulationClock";

describe("SimulationClock", () => {
    it("runs the requested number of fixed steps", () => {
        const clock = new SimulationClock(1 / 250, 8);
        let count = 0;
        const stats = clock.advance(4 / 250, () => {
            count += 1;
        });
        expect(count).toBe(4);
        expect(stats.stepsLastFrame).toBe(4);
        expect(stats.alpha).toBeCloseTo(0, 5);
        expect(stats.simulatedTimeS).toBeCloseTo(4 / 250);
    });

    it("caps catch-up and reports overload", () => {
        const clock = new SimulationClock(1 / 250, 8);
        let count = 0;
        const stats = clock.advance(0.25, () => {
            count += 1;
        });
        expect(count).toBe(8);
        expect(stats.overloaded).toBe(true);
        expect(stats.droppedTimeS).toBeGreaterThan(0.2);
    });

    it("ignores invalid deltas and keeps interpolation bounded", () => {
        const clock = new SimulationClock(1 / 250, 8);
        const stats = clock.advance(Number.NaN, () => undefined);
        expect(stats.stepsLastFrame).toBe(0);
        const second = clock.advance(0.0005, () => undefined);
        expect(second.alpha).toBeGreaterThan(0);
        expect(second.alpha).toBeLessThan(1);
    });

    it("resets accumulated time", () => {
        const clock = new SimulationClock(1 / 250, 8);
        clock.advance(0.1, () => undefined);
        clock.reset();
        const stats = clock.advance(0, () => undefined);
        expect(stats.alpha).toBe(0);
        expect(stats.droppedTimeS).toBe(0);
    });
});
