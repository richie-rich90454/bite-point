import { describe, expect, it } from "vitest";
import {
    baseControls,
    launch,
    makeSimulation,
    selectGear,
    startWarm,
    stepFor,
} from "../support/simulation";

describe("vehicle integration", () => {
    it("idles in neutral without creeping", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 0 });
        stepFor(sim, 5, () => ({ ...baseControls(), clutchPedal: 1 }));
        expect(sim.engine.running).toBe(true);
        expect(sim.engine.rpm).toBeGreaterThan(650);
        expect(sim.engine.rpm).toBeLessThan(1050);
        expect(sim.speedMps).toBeLessThan(0.1);
    });

    it("starts from cold with the starter", () => {
        const sim = makeSimulation();
        sim.reset({ engineRunning: false, gear: 0, ignition: true, clutchPedal: 1 });
        stepFor(sim, 2, () => ({ ...baseControls(), starter: true }));
        expect(sim.engine.running).toBe(true);
        expect(sim.engine.rpm).toBeGreaterThan(400);
    });

    it("moves off with a gentle clutch release", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 1 });
        const result = launch(sim);
        expect(result.stalled).toBe(false);
        expect(result.speedMps).toBeGreaterThan(1.5);
        expect(sim.gear).toBe(1);
    });

    it("stalls when the clutch is dumped with no throttle", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 1 });
        stepFor(sim, 2.5, () => ({ ...baseControls(), clutchPedal: 0 }));
        expect(sim.engine.running).toBe(false);
        expect(sim.engine.rpm).toBeLessThan(400);
        expect(sim.gear).toBe(1);
    });

    it("rolls back on the hill with the clutch pressed", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 1, x: 30, y: -9.5, heading: 0 });
        const startX = sim.x;
        stepFor(sim, 2, () => ({ ...baseControls(), clutchPedal: 1 }));
        expect(sim.getRenderState(0).slopeForward).toBeGreaterThan(0.03);
        expect(sim.x).toBeLessThan(startX - 0.15);
    });

    it("holds the hill on the handbrake", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 1, x: 30, y: -9.5, heading: 0 });
        const startX = sim.x;
        stepFor(sim, 2, () => ({ ...baseControls(), clutchPedal: 1, handbrake: true }));
        expect(Math.abs(sim.x - startX)).toBeLessThan(0.2);
    });

    it("shifts from first to second through the neutral corridor", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 1 });
        const launchResult = launch(sim, 0.5);
        expect(launchResult.running).toBe(true);
        expect(sim.speedMps).toBeGreaterThan(2);

        stepFor(sim, 0.3, () => ({ ...baseControls(), throttle: 0, clutchPedal: 1 }));
        sim.grabShifter();
        expect(sim.moveShifter("down")).toBe(true);
        expect(sim.gearbox.gear).toBe(1);
        expect(sim.moveShifter("down")).toBe(true);
        sim.releaseShifter();
        expect(sim.gear).toBe(2);

        stepFor(sim, 1.2, () => ({ ...baseControls(), throttle: 0.25, clutchPedal: 0.85 }));
        stepFor(sim, 1.5, () => ({ ...baseControls(), throttle: 0.25, clutchPedal: 0 }));
        expect(sim.engine.running).toBe(true);
        expect(sim.speedMps).toBeGreaterThan(2);
    });

    it("rejects reverse while moving too fast", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 1 });
        launch(sim, 0.5);
        stepFor(sim, 0.2, () => ({ ...baseControls(), clutchPedal: 1 }));
        sim.requestReverse();
        expect(sim.gear).toBe(1);
        expect(sim.drainEvents().some((event) => event.type === "reverse-blocked")).toBe(true);
    });

    it("engages reverse at rest and moves backwards", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 0 });
        sim.requestReverse();
        expect(sim.gear).toBe(-1);
        stepFor(sim, 1, () => ({ ...baseControls(), throttle: 0.3, clutchPedal: 1 }));
        stepFor(sim, 0.5, () => ({ ...baseControls(), throttle: 0.3, clutchPedal: 0.62 }));
        stepFor(sim, 2.5, () => ({ ...baseControls(), throttle: 0.3, clutchPedal: 0.6 }));
        expect(sim.engine.running).toBe(true);
        expect(sim.x).toBeLessThan(-0.1);
    });

    it("brakes to a stop without reversing the car", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 1 });
        launch(sim, 0.5);
        expect(sim.speedMps).toBeGreaterThan(1);
        stepFor(sim, 3, () => ({ ...baseControls(), brake: 1, clutchPedal: 1 }));
        expect(sim.speedMps).toBeLessThan(0.2);
    });

    it("accelerates with a locked clutch instead of coasting", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 1 });
        stepFor(sim, 1, () => ({ ...baseControls(), throttle: 1, clutchPedal: 1 }));
        stepFor(sim, 5, () => ({ ...baseControls(), throttle: 1, clutchPedal: 0.42 }));
        expect(sim.engine.running).toBe(true);
        expect(sim.speedMps).toBeGreaterThan(8);
        expect(sim.wheels.every((wheel) => wheel.omega > 0)).toBe(true);
        expect(Number.isFinite(sim.body.state.vx)).toBe(true);
    });

    it("accelerates past two hundred kilometres per hour in sixth", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 6, y: -114.5 });
        stepFor(sim, 0.2, () => ({ ...baseControls(), throttle: 0, clutchPedal: 1 }));
        for (const wheel of sim.wheels) wheel.omega = 174;
        sim.body.state.vx = 55;
        sim.engine.setAngularVelocity(
            174 * sim.gearbox.ratioForGear(6) * sim.driveline.finalDriveRatio,
        );
        selectGear(sim, 6);
        const startX = sim.x;
        let maxSpeed = 0;
        for (let step = 0; step < 25000; step += 1) {
            sim.step(1 / 250, { ...baseControls(), throttle: 1, clutchPedal: 0 });
            maxSpeed = Math.max(maxSpeed, sim.speedMps);
        }
        expect(sim.speedMps * 3.6).toBeGreaterThan(200);
        expect(maxSpeed * 3.6).toBeGreaterThan(200);
        expect(sim.x - startX).toBeLessThan(6000);
        expect(sim.gear).toBe(6);
        expect(Number.isFinite(sim.body.state.vx)).toBe(true);
        expect(Number.isFinite(sim.engine.rpm)).toBe(true);
        for (let step = 0; step < 500; step += 1) {
            sim.step(1 / 250, { ...baseControls(), throttle: 1, clutchPedal: 0, steering: 0.12 });
            maxSpeed = Math.max(maxSpeed, sim.speedMps);
        }
        expect(Number.isFinite(sim.body.state.vx)).toBe(true);
        expect(Number.isFinite(sim.body.state.vy)).toBe(true);
        expect(Math.abs(sim.body.state.yawRate)).toBeLessThan(3.6);
        expect(maxSpeed * 3.6).toBeGreaterThan(200);
    });

    it("keeps forces finite above the reference top speed", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 6, y: -114.5 });
        const wheelOmega = 90 / sim.config.wheelRadiusM;
        for (const wheel of sim.wheels) wheel.omega = wheelOmega;
        sim.body.state.vx = 90;
        sim.engine.setAngularVelocity(
            wheelOmega * sim.gearbox.ratioForGear(6) * sim.driveline.finalDriveRatio,
        );
        selectGear(sim, 6);
        for (let step = 0; step < 250; step += 1) {
            sim.step(1 / 250, { ...baseControls(), throttle: 1, clutchPedal: 0 });
        }
        expect(Number.isFinite(sim.body.state.vx)).toBe(true);
        expect(Number.isFinite(sim.body.state.vy)).toBe(true);
        expect(Number.isFinite(sim.body.state.yawRate)).toBe(true);
        expect(Number.isFinite(sim.engine.rpm)).toBe(true);
        expect(sim.wheels.every((wheel) => Number.isFinite(wheel.omega))).toBe(true);
        expect(
            sim.getRenderState(0).wheels.every((wheel) => Number.isFinite(wheel.normalLoadN)),
        ).toBe(true);
    });

    it("keeps engine and wheel speed consistent when the clutch locks", () => {
        const sim = makeSimulation();
        startWarm(sim, { gear: 2 });
        stepFor(sim, 4, () => ({ ...baseControls(), throttle: 0.2, clutchPedal: 0 }));
        const wheelOmega = (sim.wheels[0].omega + sim.wheels[1].omega) / 2;
        const ratio = sim.gearbox.ratioForGear(2) * sim.driveline.finalDriveRatio;
        if (sim.lastClutchResult.mode === "locked") {
            expect(Math.abs(sim.engine.angularVelocity - wheelOmega * ratio)).toBeLessThan(2);
        }
        expect(Number.isFinite(sim.engine.angularVelocity)).toBe(true);
    });
});
