import { describe, expect, it } from "vitest";
import { validateVehicleConfig } from "../../src/simulation/config/VehicleConfig";
import config from "../../src/data/reference-compact.json";

const clone = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

describe("vehicle configuration", () => {
    it("accepts the reference configuration", () => {
        const result = validateVehicleConfig(config);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it("rejects negative mass and missing fields", () => {
        const broken = clone();
        broken.massKg = -10;
        delete broken.wheelbaseM;
        const result = validateVehicleConfig(broken);
        expect(result.valid).toBe(false);
        expect(result.errors.some((error) => error.includes("massKg"))).toBe(true);
        expect(result.errors.some((error) => error.includes("wheelbaseM"))).toBe(true);
    });

    it("rejects non-monotonic gear ratios", () => {
        const broken = clone();
        broken.gearRatios = [3.5, 4.1, 1.4, 1.1, 0.9, 0.7];
        const result = validateVehicleConfig(broken);
        expect(result.valid).toBe(false);
    });

    it("rejects invalid engagement geometry and provenance", () => {
        const broken = clone();
        (broken.clutch as Record<string, unknown>).bitePoint = 0.9;
        (broken.clutch as Record<string, unknown>).engagementWidth = 0.4;
        broken.provenance = { massKg: "made-up" };
        const result = validateVehicleConfig(broken);
        expect(result.valid).toBe(false);
    });

    it("warns about missing provenance entries", () => {
        const partial = clone();
        partial.provenance = { massKg: "estimated" };
        const result = validateVehicleConfig(partial);
        expect(result.valid).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("accepts aero configurations without the optional coefficients", () => {
        const partial = clone();
        const aero = partial.aero as Record<string, unknown>;
        delete aero.downforceCoefficient;
        delete aero.frontLiftCoefficient;
        delete aero.rearLiftCoefficient;
        const result = validateVehicleConfig(partial);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it("rejects out-of-range aero coefficients", () => {
        const broken = clone();
        const aero = broken.aero as Record<string, unknown>;
        aero.downforceCoefficient = 6;
        aero.frontLiftCoefficient = -3;
        aero.rearLiftCoefficient = 3;
        const result = validateVehicleConfig(broken);
        expect(result.valid).toBe(false);
        expect(result.errors.some((error) => error.includes("downforceCoefficient"))).toBe(true);
        expect(result.errors.some((error) => error.includes("frontLiftCoefficient"))).toBe(true);
        expect(result.errors.some((error) => error.includes("rearLiftCoefficient"))).toBe(true);
    });
});
