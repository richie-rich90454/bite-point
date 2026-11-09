import { describe, expect, it } from "vitest";
import { ManualGearbox, SynchronizerModel } from "../../src/simulation/gearbox/ManualGearbox";
import config from "../../src/data/reference-compact.json";

const makeGearbox = (): ManualGearbox => {
    const synchronizer = new SynchronizerModel(config.gearbox.syncSpeedThresholdRadPerSec);
    return new ManualGearbox({
        gearRatios: config.gearRatios,
        reverseRatio: config.reverseRatio,
        shiftTimeS: config.gearbox.shiftTimeS,
        reverseMaxSpeedMps: config.gearbox.reverseMaxSpeedMps,
        synchronizer,
    });
};

const context = (
    overrides: Partial<{
        clutchDisengaged: boolean;
        inputOmega: number;
        outputOmega: number;
        speedMps: number;
    }> = {},
) => ({
    clutchDisengaged: true,
    inputOmega: 0,
    outputOmega: 20,
    speedMps: 0,
    ...overrides,
});

describe("ManualGearbox", () => {
    it("maps six forward ratios and reverse", () => {
        const gearbox = makeGearbox();
        expect(gearbox.ratioForGear(1)).toBeCloseTo(config.gearRatios[0]!);
        expect(gearbox.ratioForGear(6)).toBeCloseTo(config.gearRatios[5]!);
        expect(gearbox.ratioForGear(-1)).toBeCloseTo(config.reverseRatio);
        expect(gearbox.ratioForGear(0)).toBe(0);
    });

    it("engages with the clutch disengaged and ramps torque", () => {
        const gearbox = makeGearbox();
        const result = gearbox.tryEngage(1, context());
        expect(result.engaged).toBe(true);
        expect(gearbox.gear).toBe(1);
        expect(gearbox.torqueFactor).toBeLessThan(0.05);
        gearbox.update(config.gearbox.shiftTimeS / 2);
        expect(gearbox.torqueFactor).toBeGreaterThan(0.4);
        gearbox.update(config.gearbox.shiftTimeS);
        expect(gearbox.torqueFactor).toBeCloseTo(1);
    });

    it("rejects a mismatched shift when the clutch is engaged", () => {
        const gearbox = makeGearbox();
        const result = gearbox.tryEngage(
            2,
            context({ clutchDisengaged: false, inputOmega: 0, outputOmega: 100, speedMps: 10 }),
        );
        expect(result.engaged).toBe(false);
        expect(result.reason).toBe("synchronizer");
        expect(gearbox.gear).toBe(0);
    });

    it("allows a rev-matched shift without the clutch", () => {
        const gearbox = makeGearbox();
        const outputOmega = 50;
        const target = outputOmega * gearbox.ratioForGear(3);
        const result = gearbox.tryEngage(
            3,
            context({ clutchDisengaged: false, inputOmega: target, outputOmega, speedMps: 8 }),
        );
        expect(result.engaged).toBe(true);
    });

    it("locks out reverse above walking pace", () => {
        const gearbox = makeGearbox();
        const result = gearbox.tryEngage(
            -1,
            context({ speedMps: config.gearbox.reverseMaxSpeedMps + 1 }),
        );
        expect(result.engaged).toBe(false);
        expect(result.reason).toBe("reverse-lockout");
    });

    it("requires the clutch for reverse", () => {
        const gearbox = makeGearbox();
        const result = gearbox.tryEngage(-1, context({ clutchDisengaged: false, speedMps: 0 }));
        expect(result.engaged).toBe(false);
    });

    it("engages reverse at rest with the clutch in", () => {
        const gearbox = makeGearbox();
        const result = gearbox.tryEngage(-1, context());
        expect(result.engaged).toBe(true);
        expect(gearbox.isReverse).toBe(true);
        expect(gearbox.ratio).toBeLessThan(0);
    });

    it("returns to neutral immediately", () => {
        const gearbox = makeGearbox();
        gearbox.tryEngage(4, context());
        gearbox.update(1);
        gearbox.tryEngage(0, context());
        expect(gearbox.gear).toBe(0);
        expect(gearbox.torqueFactor).toBe(0);
    });
});
