import { describe, expect, it } from "vitest";
import {
    ShapePreservingCurve,
    clamp,
    moveTowards,
    smoothstep,
    wrapAngle,
} from "../../src/simulation/core/MathUtils";

describe("MathUtils", () => {
    it("clamps and moves towards targets", () => {
        expect(clamp(5, 0, 3)).toBe(3);
        expect(moveTowards(0, 1, 0.25)).toBe(0.25);
        expect(moveTowards(1, 0, 2)).toBe(0);
        expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
        expect(Math.abs(wrapAngle(Math.PI * 3))).toBeCloseTo(Math.PI);
    });

    it("interpolates a shape-preserving curve without overshoot", () => {
        const curve = new ShapePreservingCurve([
            [600, 78],
            [2000, 147],
            [4200, 160],
            [6800, 106],
        ]);
        expect(curve.evaluate(600)).toBeCloseTo(78);
        expect(curve.evaluate(2000)).toBeCloseTo(147);
        expect(curve.evaluate(4200)).toBeCloseTo(160);
        expect(curve.evaluate(6800)).toBeCloseTo(106);
        for (let rpm = 600; rpm <= 6800; rpm += 25) {
            const value = curve.evaluate(rpm);
            expect(value).toBeGreaterThanOrEqual(70);
            expect(value).toBeLessThanOrEqual(165);
        }
        expect(curve.evaluate(500)).toBeCloseTo(78);
        expect(curve.evaluate(7000)).toBeCloseTo(106);
    });

    it("does not create artificial peaks between equal values", () => {
        const curve = new ShapePreservingCurve([
            [0, 0],
            [1000, 100],
            [2000, 100],
            [3000, 100],
            [4000, 0],
        ]);
        for (let x = 0; x <= 4000; x += 10) {
            expect(curve.evaluate(x)).toBeLessThanOrEqual(100.000001);
        }
    });
});
