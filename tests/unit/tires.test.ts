import { describe, expect, it } from "vitest";
import { TireModel } from "../../src/simulation/tires/TireModel";
import config from "../../src/data/reference-compact.json";

const tire = new TireModel(config.tires);

describe("TireModel", () => {
  it("computes slip ratios with a documented sign convention", () => {
    expect(tire.slipRatio(30, 0.317, 9.5)).toBeGreaterThan(0);
    expect(tire.slipRatio(0, 0.317, 9.5)).toBeLessThan(0);
    expect(tire.slipRatio(0, 0.317, 0)).toBe(0);
  });

  it("saturates longitudinal force near the friction limit", () => {
    const load = 4000;
    const max = tire.maxLongitudinalForce(load, 1);
    expect(max).toBeGreaterThan(3000);
    expect(Math.abs(tire.longitudinalForce(0.1, load))).toBeLessThanOrEqual(max);
    expect(Math.abs(tire.longitudinalForce(5, load))).toBeLessThanOrEqual(max);
    expect(Math.abs(tire.longitudinalForce(-5, load))).toBeGreaterThan(max * 0.9);
  });

  it("reduces grip with load sensitivity and wet surfaces", () => {
    const dry = tire.effectiveMu(4000, 1);
    const wet = tire.effectiveMu(4000, 0.55);
    const loaded = tire.effectiveMu(8000, 1);
    expect(wet).toBeLessThan(dry);
    expect(loaded).toBeLessThan(dry);
  });

  it("enforces a combined friction ellipse", () => {
    const load = 4000;
    const maxX = tire.maxLongitudinalForce(load);
    const maxY = tire.maxLateralForce(load);
    const result = tire.combinedForces(maxX * 0.9, maxY * 0.9, load);
    expect((result.longitudinal / maxX) ** 2 + (result.lateral / maxY) ** 2).toBeLessThanOrEqual(1.001);
  });
});
