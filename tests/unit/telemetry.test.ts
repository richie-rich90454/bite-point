import { describe, expect, it } from "vitest";
import { RingBuffer } from "../../src/simulation/telemetry/RingBuffer";
import {
    TelemetryRecorder,
    type TelemetrySample,
} from "../../src/simulation/telemetry/TelemetryRecorder";

const sample = (t: number): TelemetrySample => ({
    t,
    x: t,
    y: 0,
    z: 0,
    heading: 0,
    speedMps: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    yawRate: 0,
    engineRpm: 800,
    engineTorqueNm: 0,
    clutchPedal: 1,
    clutchSlipRadPerSec: 0,
    clutchTempC: 30,
    clutchWear: 0,
    gear: 0,
    throttle: 0,
    brake: 0,
    steering: 0,
    handbrake: false,
    running: true,
    fuelCut: false,
    frontSlip: 0,
    rearSlip: 0,
    wheelOmegas: [0, 0, 0, 0],
    wheelSteer: 0,
    surfaceMu: 1,
    slope: 0,
});

describe("RingBuffer", () => {
    it("wraps in chronological order", () => {
        const buffer = new RingBuffer<number>(3);
        buffer.push(1);
        buffer.push(2);
        buffer.push(3);
        buffer.push(4);
        expect(buffer.size).toBe(3);
        expect(buffer.toArray()).toEqual([2, 3, 4]);
        expect(buffer.latest()).toBe(4);
    });

    it("handles empty buffers", () => {
        const buffer = new RingBuffer<number>(2);
        expect(buffer.size).toBe(0);
        expect(buffer.latest()).toBeUndefined();
        expect(buffer.toArray()).toEqual([]);
    });
});

describe("TelemetryRecorder", () => {
    it("samples at the configured rate", () => {
        const recorder = new TelemetryRecorder(20, 1);
        let time = 0;
        for (let index = 0; index < 250; index += 1) {
            const dt = 1 / 250;
            time += dt;
            recorder.update(dt, () => sample(time));
        }
        expect(recorder.size).toBeGreaterThanOrEqual(18);
        expect(recorder.size).toBeLessThanOrEqual(21);
        const samples = recorder.samples();
        expect(samples[0]!.t).toBeLessThan(samples[samples.length - 1]!.t);
    });

    it("exports valid JSON with the samples", () => {
        const recorder = new TelemetryRecorder(20, 1);
        recorder.update(0.1, () => sample(0.1));
        const parsed = JSON.parse(recorder.exportJson()) as { format: string; samples: unknown[] };
        expect(parsed.format).toBe("bite-point-telemetry");
        expect(parsed.samples.length).toBe(1);
    });
});
