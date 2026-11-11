import { describe, expect, it } from "vitest";
import { baseControls, launch, makeSimulation, startWarm, stepFor } from "../support/simulation";
import { ScenarioManager } from "../../src/scenarios/ScenarioManager";

describe("closed-course performance", () => {
    it("reaches 200 km/h from rest with clutch-operated shifts and space to brake", () => {
        const sim = makeSimulation();
        const scenarios = new ScenarioManager();
        scenarios.start("proving-run", sim);
        expect(launch(sim, 0.7).running).toBe(true);
        let elapsed = 0;
        while (elapsed < 160 && sim.speedMps * 3.6 < 199.9) {
            if (sim.engine.rpm > 5800 && sim.gear < 6) {
                stepFor(sim, 0.3, () => ({ ...baseControls(), clutchPedal: 1 }));
                sim.selectGearDirect(sim.gear + 1);
                stepFor(sim, 0.35, (_sim, t) => ({
                    ...baseControls(),
                    throttle: 0.5,
                    clutchPedal: Math.max(0, 1 - t / 0.3),
                }));
                elapsed += 0.65;
            }
            sim.step(1 / 250, { ...baseControls(), throttle: 1, clutchPedal: 0 });
            elapsed += 1 / 250;
        }
        expect(sim.engine.running).toBe(true);
        expect(sim.gear).toBeGreaterThanOrEqual(5);
        expect(sim.speedMps * 3.6).toBeGreaterThanOrEqual(199.9);
        expect(sim.x).toBeLessThan(5500);
        scenarios.update(sim, sim.getRenderState(1), [], elapsed);
        expect(scenarios.status).toBe("running");
        stepFor(sim, 12, () => ({ ...baseControls(), brake: 0.7, clutchPedal: 1 }));
        expect(sim.speedMps).toBeLessThan(0.2);
        expect(sim.x).toBeLessThan(5950);
        sim.requestNeutral();
        scenarios.update(sim, sim.getRenderState(1), [], 12);
        expect(scenarios.status).toBe("success");
    });

    it("rolling resistance reduces coast speed in both directions", () => {
        for (const direction of [-1, 1]) {
            const sim = makeSimulation();
            startWarm(sim, { y: -114.5 });
            // Freely rolling wheels with neutral selected.
            sim.body.state.vx = direction;
            sim.wheels.forEach((wheel) => {
                wheel.omega = direction / sim.config.wheelRadiusM;
            });
            stepFor(sim, 1, () => ({ ...baseControls() }));
            expect(sim.speedMps).toBeLessThan(0.95);
        }
    });

    it("does not confuse reverse engagement lockout with a backwards speed limiter", () => {
        const sim = makeSimulation();
        startWarm(sim, { y: -114.5 });
        sim.body.state.vx = -5;
        sim.wheels.forEach((wheel) => {
            wheel.omega = -5 / sim.config.wheelRadiusM;
        });
        sim.step(1 / 250, baseControls());
        expect(sim.body.state.vx).toBeLessThan(-4.9);
        sim.requestReverse();
        expect(sim.gear).toBe(0);
        expect(sim.drainEvents().some((event) => event.type === "reverse-blocked")).toBe(true);
    });
});
