import { describe, expect, it } from "vitest";
import { SuspensionModel } from "../../src/simulation/suspension/SuspensionModel";
import { SteeringModel } from "../../src/simulation/steering/SteeringModel";
import { BrakeModel } from "../../src/simulation/brakes/BrakeModel";
import config from "../../src/data/reference-compact.json";

describe("SuspensionModel", () => {
    const suspension = new SuspensionModel({
        springRateNm: config.suspension.springRateFrontNm,
        damperNsm: config.suspension.damperNsm,
        rideHeightM: config.suspension.rideHeightM,
        maxCompressionM: config.suspension.maxCompressionM,
        bumpStopRateNm: config.suspension.bumpStopRateNm,
    });

    it("computes static compression from load", () => {
        const compression = suspension.staticCompression(3000);
        expect(compression).toBeCloseTo(3000 / config.suspension.springRateFrontNm);
        expect(suspension.force(compression, 0)).toBeCloseTo(3000, 0);
    });

    it("engages the bump stop past maximum travel", () => {
        const atLimit = suspension.force(config.suspension.maxCompressionM, 0);
        const pastLimit = suspension.force(config.suspension.maxCompressionM + 0.02, 0);
        expect(pastLimit).toBeGreaterThan(atLimit);
        expect(suspension.compressionForLoad(100000)).toBeGreaterThan(
            config.suspension.maxCompressionM,
        );
    });

    it("adds damping force with compression rate", () => {
        expect(suspension.force(0.05, 1)).toBeGreaterThan(suspension.force(0.05, 0));
        expect(suspension.force(0.05, -1)).toBeLessThan(suspension.force(0.05, 0));
    });
});

describe("SteeringModel", () => {
    const steering = new SteeringModel(config.steering);

    it("maps right input to a positive road-wheel angle", () => {
        steering.reset();
        steering.update(0.5, 1, 0);
        expect(steering.angleRad).toBeGreaterThan(0);
    });

    it("rate-limits steering input", () => {
        steering.reset();
        steering.update(1 / 250, 1, 0);
        expect(steering.angleRad).toBeLessThanOrEqual(config.steering.rateRadPerSec / 250 + 1e-9);
    });

    it("reduces maximum angle at speed and self-centres", () => {
        const low = steering.maxAngleAtSpeed(0);
        const high = steering.maxAngleAtSpeed(30);
        expect(high).toBeLessThan(low);
        steering.reset();
        for (let index = 0; index < 100; index += 1) steering.update(0.01, 1, 0);
        const angle = steering.angleRad;
        for (let index = 0; index < 200; index += 1) steering.update(0.01, 0, 0);
        expect(Math.abs(steering.angleRad)).toBeLessThan(Math.abs(angle));
    });
});

describe("BrakeModel", () => {
    const brakes = new BrakeModel(config.brakes);

    it("ramps service brake torque with pedal", () => {
        expect(brakes.torqueForWheel(0, false, "front")).toBe(0);
        expect(brakes.torqueForWheel(1, false, "front")).toBeCloseTo(config.brakes.frontTorqueNm);
        expect(brakes.torqueForWheel(0.5, false, "front")).toBeLessThan(
            config.brakes.frontTorqueNm,
        );
    });

    it("applies the handbrake only to the rear axle", () => {
        const rear = brakes.torqueForWheel(0, true, "rear");
        const front = brakes.torqueForWheel(0, true, "front");
        expect(rear).toBeCloseTo(config.brakes.handbrakeTorqueNm);
        expect(front).toBe(0);
    });
});
