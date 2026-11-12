import { describe, expect, it } from "vitest";
import {
    CITY_BLOCK_M,
    CITY_ROAD_HALF_M,
    cityBlock,
    cityCollision,
    citySurfaceAt,
} from "../../src/simulation/world/CityLayout";

describe("city grid layout", () => {
    it("classifies roads, sidewalks and block ground", () => {
        expect(citySurfaceAt(0, 0).onRoad).toBe(true);
        expect(citySurfaceAt(60, CITY_ROAD_HALF_M + 2).onSidewalk).toBe(true);
        expect(citySurfaceAt(60, 60)).toMatchObject({ onRoad: false, onSidewalk: false });
        expect(citySurfaceAt(60, 60).rollingResistance).toBeGreaterThan(3);
    });

    it("generates deterministic blocks with buildings", () => {
        const first = cityBlock(1101, 2, -3);
        const second = cityBlock(1101, 2, -3);
        expect(first).toEqual(second);
        expect(first.plaza || first.buildings.length > 0).toBe(true);
        for (const building of first.buildings) {
            expect(building.height).toBeGreaterThan(0);
            expect(building.width).toBeGreaterThan(0);
            expect(building.x).toBeGreaterThan(2 * CITY_BLOCK_M);
            expect(building.x).toBeLessThan(3 * CITY_BLOCK_M);
        }
    });

    it("pushes a circle out of a building wall", () => {
        const block = cityBlock(1101, 0, 0);
        const building = block.buildings[0]!;
        const push = cityCollision(1101, building.x, building.y, 1.1);
        expect(push).not.toBeNull();
        expect(Math.hypot(push!.x, push!.y)).toBeGreaterThan(0);
    });

    it("leaves the open street free of collisions", () => {
        expect(cityCollision(1101, 0, 0, 1.1)).toBeNull();
    });
});
