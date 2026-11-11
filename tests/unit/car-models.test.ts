import { describe, expect, it } from "vitest";
import { CARS, DEFAULT_CAR_ID, getCar } from "../../src/data/CarCatalog";
import {
    DEFAULT_CAR_MODEL_ID,
    carModelIds,
    resolveCarModel,
} from "../../src/presentation/CarModels";

describe("car model registry", () => {
    it("maps every car to a defined model", () => {
        for (const car of CARS) {
            const model = resolveCarModel(car.modelId);
            expect(model.id).toBe(car.modelId);
            expect(model.url.length).toBeGreaterThan(0);
            expect(model.paintMaterial.length).toBeGreaterThan(0);
        }
    });

    it("offers the full detailed model set", () => {
        expect(carModelIds().length).toBeGreaterThanOrEqual(8);
        expect(carModelIds()).toContain(DEFAULT_CAR_MODEL_ID);
        expect(getCar(DEFAULT_CAR_ID)?.modelId).toBe(DEFAULT_CAR_MODEL_ID);
    });

    it("falls back to the default model for unknown ids", () => {
        expect(resolveCarModel("does-not-exist").id).toBe(DEFAULT_CAR_MODEL_ID);
        expect(resolveCarModel(undefined).id).toBe(DEFAULT_CAR_MODEL_ID);
    });
});
