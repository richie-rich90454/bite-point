import { describe, expect, it } from "vitest";
import { CARS, DEFAULT_CAR_ID, carsByTier, getCar } from "../../src/data/CarCatalog";
import { validateVehicleConfig, type Drivetrain } from "../../src/simulation/config/VehicleConfig";
import { measureZeroToHundred } from "../../src/simulation/measure/ZeroToHundred";
import type { EngineType } from "../../src/data/CarTypes";

const ENGINE_TYPES: EngineType[] = ["NA", "Turbo", "Hybrid", "Electric"];
const DRIVETRAINS: Drivetrain[] = ["FWD", "RWD", "AWD"];

describe("car catalog", () => {
    it("contains twelve cars with unique ids", () => {
        expect(CARS).toHaveLength(12);
        expect(new Set(CARS.map((car) => car.id)).size).toBe(CARS.length);
    });

    it("validates every configuration", () => {
        for (const car of CARS) {
            const result = validateVehicleConfig(car.config);
            expect(result.errors, car.id).toEqual([]);
            expect(car.config.id).toBe(car.id);
        }
    });

    it("covers tiers 1-5, every engine type and every drivetrain", () => {
        const tiers = carsByTier();
        expect([...tiers.keys()].sort()).toEqual([1, 2, 3, 4, 5]);

        const engineTypes = new Set(CARS.map((car) => car.engineType));
        for (const engineType of ENGINE_TYPES) expect(engineTypes.has(engineType)).toBe(true);

        const drivetrains = new Set(CARS.map((car) => car.drivetrain));
        for (const drivetrain of DRIVETRAINS) expect(drivetrains.has(drivetrain)).toBe(true);

        for (const car of CARS) {
            expect(ENGINE_TYPES).toContain(car.engineType);
            expect(DRIVETRAINS).toContain(car.drivetrain);
            expect(car.config.drivetrain).toBe(car.drivetrain);
        }
    });

    it("exposes the reference car as the default", () => {
        const reference = getCar(DEFAULT_CAR_ID);
        expect(reference).toBeDefined();
        expect(reference?.tier).toBe(5);
        expect(reference?.config.engine.redlineRpm).toBe(9000);
        expect(getCar("missing-car")).toBeUndefined();
    });

    it("measures a finite 0-100 km/h time for every car", () => {
        for (const car of CARS) {
            const result = measureZeroToHundred(car.config);
            console.log(car.id, result.timeS.toFixed(3), result.reached);
            expect(result.reached, car.id).toBe(true);
            expect(Number.isFinite(result.timeS), car.id).toBe(true);
            expect(result.timeS).toBeGreaterThanOrEqual(2);
            expect(result.timeS).toBeLessThanOrEqual(12);
        }
    });
});
