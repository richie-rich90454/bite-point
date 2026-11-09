import { describe, expect, it } from "vitest";
import { EngineModel } from "../../src/simulation/engine/EngineModel";
import { ShapePreservingCurve } from "../../src/simulation/core/MathUtils";
import engineConfig from "../../src/data/reference-compact.json";

const curve = new ShapePreservingCurve(engineConfig.engine.torqueCurve as Array<[number, number]>);
const model = (): EngineModel =>
    new EngineModel({
        idleRpm: engineConfig.engine.idleRpm,
        redlineRpm: engineConfig.engine.redlineRpm,
        stallRpm: engineConfig.engine.stallRpm,
        startRpm: engineConfig.engine.startRpm,
        inertiaKgM2: engineConfig.engine.inertiaKgM2,
        starterTorqueNm: engineConfig.engine.starterTorqueNm,
        frictionBaseNm: engineConfig.engine.frictionBaseNm,
        frictionPerRadPerSec: engineConfig.engine.frictionPerRadPerSec,
        pumpingLossNm: engineConfig.engine.pumpingLossNm,
        torqueAtRpm: (rpm) => curve.evaluate(rpm),
    });

describe("EngineModel", () => {
    it("cranks and starts from the starter", () => {
        const engine = model();
        let result = engine.update({ throttle: 0, ignition: true, starter: true }, 0, 1 / 250);
        for (let index = 0; index < 500 && !result.running; index += 1) {
            result = engine.update({ throttle: 0, ignition: true, starter: true }, 0, 1 / 250);
        }
        expect(result.running).toBe(true);
        expect(result.rpm).toBeGreaterThan(engineConfig.engine.startRpm);
    });

    it("settles near idle in neutral", () => {
        const engine = model();
        engine.setRunning(true);
        engine.setAngularVelocity((engineConfig.engine.idleRpm * Math.PI) / 30);
        let result = engine.update({ throttle: 0, ignition: true, starter: false }, 0, 1 / 250);
        for (let index = 0; index < 250 * 8; index += 1) {
            result = engine.update({ throttle: 0, ignition: true, starter: false }, 0, 1 / 250);
        }
        expect(result.running).toBe(true);
        expect(result.rpm).toBeGreaterThan(650);
        expect(result.rpm).toBeLessThan(1050);
    });

    it("stalls when the clutch load exceeds available torque", () => {
        const engine = model();
        engine.setRunning(true);
        engine.setAngularVelocity((engineConfig.engine.idleRpm * Math.PI) / 30);
        let result = engine.update({ throttle: 0, ignition: true, starter: false }, 260, 1 / 250);
        for (let index = 0; index < 250 * 3 && result.running; index += 1) {
            result = engine.update({ throttle: 0, ignition: true, starter: false }, 260, 1 / 250);
        }
        expect(result.running).toBe(false);
    });

    it("cuts fuel at the redline", () => {
        const engine = model();
        engine.setRunning(true);
        engine.setAngularVelocity(((engineConfig.engine.redlineRpm + 120) * Math.PI) / 30);
        let result = engine.update({ throttle: 1, ignition: true, starter: false }, 0, 1 / 250);
        for (let index = 0; index < 50; index += 1) {
            result = engine.update({ throttle: 1, ignition: true, starter: false }, 0, 1 / 250);
        }
        expect(result.fuelCut).toBe(true);
        expect(result.combustionTorqueNm).toBe(0);
    });

    it("stops combustion when ignition is switched off", () => {
        const engine = model();
        engine.setRunning(true);
        engine.setAngularVelocity((engineConfig.engine.idleRpm * Math.PI) / 30);
        engine.update({ throttle: 0, ignition: true, starter: false }, 0, 1 / 250);
        const result = engine.update({ throttle: 0, ignition: false, starter: false }, 0, 1 / 250);
        expect(result.running).toBe(false);
        expect(result.combustionTorqueNm).toBe(0);
    });
});
