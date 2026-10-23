import { describe, expect, it } from "vitest";
import { baseControls, launch, makeSimulation, startWarm, stepFor } from "../support/simulation";

const timesteps = [1 / 120, 1 / 250, 1 / 500];

describe("numerical stability", () => {
  it("produces finite, consistent launch results across timesteps", () => {
    const speeds: number[] = [];
    for (const dt of timesteps) {
      const sim = makeSimulation();
      startWarm(sim, { gear: 1 });
      const result = launch(sim, 0.5, dt);
      expect(result.running).toBe(true);
      expect(Number.isFinite(sim.x)).toBe(true);
      expect(Number.isFinite(sim.engine.rpm)).toBe(true);
      expect(sim.engine.rpm).toBeGreaterThanOrEqual(0);
      for (const wheel of sim.wheels) {
        expect(Number.isFinite(wheel.omega)).toBe(true);
        expect(Number.isFinite(wheel.longitudinalForceN)).toBe(true);
      }
      speeds.push(sim.speedMps);
    }
    const spread = Math.max(...speeds) - Math.min(...speeds);
    expect(spread).toBeLessThan(4);
  });

  it("keeps tire forces inside their friction envelopes", () => {
    const sim = makeSimulation();
    startWarm(sim, { gear: 1 });
    stepFor(sim, 3, () => ({ ...baseControls(), throttle: 0.5, clutchPedal: 0 }));
    for (let index = 0; index < sim.wheels.length; index += 1) {
      const wheel = sim.wheels[index]!;
      const wheelState = sim.getRenderState(0).wheels[index]!;
      const maxForce = sim.tire.maxLongitudinalForce(wheelState.normalLoadN, sim.getRenderState(0).sessionSurfaceMu);
      expect(Math.abs(wheel.longitudinalForceN)).toBeLessThanOrEqual(maxForce * 1.02 + 1);
    }
    expect(Number.isFinite(sim.body.state.vx)).toBe(true);
    expect(Number.isFinite(sim.body.state.vy)).toBe(true);
    expect(Number.isFinite(sim.body.state.yawRate)).toBe(true);
  });

  it("does not create motion when parked with the handbrake", () => {
    const sim = makeSimulation();
    startWarm(sim, { gear: 0 });
    const startX = sim.x;
    stepFor(sim, 10, () => ({ ...baseControls(), handbrake: true }));
    expect(Math.abs(sim.x - startX)).toBeLessThan(0.05);
    expect(Math.abs(sim.body.state.vx)).toBeLessThan(0.05);
  });

  it("recovers cleanly from full brake lock at speed", () => {
    const sim = makeSimulation();
    startWarm(sim, { gear: 2 });
    stepFor(sim, 2, () => ({ ...baseControls(), throttle: 0.5, clutchPedal: 0 }));
    stepFor(sim, 1.5, () => ({ ...baseControls(), brake: 1, clutchPedal: 1 }));
    stepFor(sim, 1, () => ({ ...baseControls(), brake: 0, clutchPedal: 1 }));
    expect(Number.isFinite(sim.speedMps)).toBe(true);
    expect(sim.speedMps).toBeLessThan(1);
  });
});
