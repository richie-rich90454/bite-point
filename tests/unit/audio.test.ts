import { describe, expect, it } from "vitest";
import { AudioDirector } from "../../src/audio/AudioDirector";
import { EngineAudio } from "../../src/audio/EngineAudio";
import type { VehicleRenderState } from "../../src/simulation/vehicle/VehicleTypes";

const renderState = (overrides: Partial<VehicleRenderState> = {}): VehicleRenderState =>
    ({
        rpm: 900,
        throttle: 0.5,
        speedMps: 12,
        engineRunning: true,
        cranking: false,
        sessionSurfaceMu: 1,
        ...overrides,
    }) as VehicleRenderState;

describe("EngineAudio", () => {
    it("constructs and switches sound sets without an AudioContext", () => {
        const engine = new EngineAudio();
        expect(engine.activeSoundSet).toBe("na");
        expect(engine.usesStarter).toBe(true);

        for (const soundSet of ["na", "turbo", "hybrid", "electric", "unknown"]) {
            expect(() => engine.setSoundSet(soundSet)).not.toThrow();
        }

        engine.setSoundSet("electric");
        expect(engine.activeSoundSet).toBe("electric");
        expect(engine.usesStarter).toBe(false);

        expect(() => engine.update(renderState(), 0.8)).not.toThrow();
        expect(() => engine.dispose()).not.toThrow();
    });
});

describe("AudioDirector", () => {
    it("stays safe in an environment without Web Audio", async () => {
        const director = new AudioDirector(true, 0.7);
        director.setMix({ engineVolume: 0.8, tireVolume: 0.6, windVolume: 0.5 });
        director.setEnabled(false);
        director.setEnabled(true);
        director.setVolume(0.5);
        director.setSoundSet("turbo");
        director.update(renderState(), 1 / 60);
        director.playGearClunk(2);
        director.playStall();
        director.suspend();
        director.resume();
        expect(director.running).toBe(false);

        await expect(director.start()).resolves.toBeUndefined();
        expect(director.running).toBe(false);

        director.dispose();
    });
});
