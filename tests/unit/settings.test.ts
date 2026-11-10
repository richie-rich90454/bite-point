import { describe, expect, it } from "vitest";
import {
    DEFAULT_SETTINGS,
    createDefaultSettings,
    sanitizeSettings,
} from "../../src/settings/SettingsRepository";
import { CARS, DEFAULT_CAR_ID, getCar } from "../../src/data/CarCatalog";
import { DEFAULT_MAP_ID, MAPS, getMap } from "../../src/data/MapCatalog";

describe("car and map selection settings", () => {
    it("defaults to a car and map that exist", () => {
        const settings = createDefaultSettings();
        expect(settings.selectedCarId).toBe(DEFAULT_CAR_ID);
        expect(settings.selectedMapId).toBe(DEFAULT_MAP_ID);
        expect(getCar(settings.selectedCarId)).toBeDefined();
        expect(getMap(settings.selectedMapId)).toBeDefined();
    });

    it("keeps valid selections", () => {
        const car = CARS[1]!;
        const map = MAPS[1]!;
        const settings = sanitizeSettings({
            selectedCarId: car.id,
            selectedMapId: map.id,
        });
        expect(settings.selectedCarId).toBe(car.id);
        expect(settings.selectedMapId).toBe(map.id);
    });

    it("falls back on invalid selections", () => {
        const settings = sanitizeSettings({
            selectedCarId: 42,
            selectedMapId: "",
        });
        expect(settings.selectedCarId).toBe(DEFAULT_SETTINGS.selectedCarId);
        expect(settings.selectedMapId).toBe(DEFAULT_SETTINGS.selectedMapId);
    });
});
