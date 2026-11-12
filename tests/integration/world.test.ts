import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_ID, getMap, MAPS } from "../../src/data/MapCatalog";
import type { MapDefinition } from "../../src/data/MapTypes";
import { WorldGenerator } from "../../src/simulation/world/WorldGenerator";
import { SCENARIOS } from "../../src/scenarios/ScenarioManager";

const CHUNK_LENGTH_M = 160;
const LATERALS = [-100, -42, -12, 0, 12, 42, 100];

function worldFor(map: MapDefinition): WorldGenerator {
    return new WorldGenerator(map.seed, map.routeMode, map.themeSequence);
}

describe("map catalog", () => {
    it("exposes the selectable infinite maps", () => {
        expect(MAPS.length).toBeGreaterThanOrEqual(12);
        expect(new Set(MAPS.map((map) => map.id)).size).toBe(MAPS.length);
        expect(getMap(DEFAULT_MAP_ID)?.name).toBe("City Center");
        expect(getMap("missing-map")).toBeUndefined();
        for (const map of MAPS) {
            expect(map.name.length).toBeGreaterThan(0);
            expect(map.description.length).toBeGreaterThan(0);
            expect(map.kind === "endless" || map.kind === "legacy").toBe(true);
            expect(map.themeSequence.length).toBeGreaterThan(0);
            expect(Number.isFinite(map.seed)).toBe(true);
            expect(map.routeMode === "curved" || map.routeMode === "straight").toBe(true);
            expect(Number.isFinite(map.start.x)).toBe(true);
            expect(Number.isFinite(map.start.y)).toBe(true);
            expect(Number.isFinite(map.start.heading)).toBe(true);
        }
    });

    it("has a map for every theme family", () => {
        const ids = new Set(MAPS.map((map) => map.id));
        for (const id of [
            "city-center",
            "industrial-district",
            "coastal-highway",
            "alpine-pass",
            "forest-run",
            "tunnel-run",
            "bridge-crossing",
            "summit",
            "endless-straight",
            "endless-curves",
            "world-tour",
            "proving-ground",
        ]) {
            expect(ids.has(id)).toBe(true);
        }
        expect(getMap("proving-ground")?.kind).toBe("legacy");
        expect(MAPS.filter((map) => map.kind === "legacy")).toHaveLength(1);
    });
});

describe("scenario world routing", () => {
    it("keeps the launch tutorial on the endless straight and practice on the legacy lot", () => {
        expect(SCENARIOS.find((scenario) => scenario.id === "launch-control")?.routeMode).toBe(
            "straight",
        );
        expect(SCENARIOS.find((scenario) => scenario.id === "launch-control")?.world).toBe(
            "endless",
        );
        expect(SCENARIOS.find((scenario) => scenario.id === "proving-run")?.world).toBe("legacy");
        expect(SCENARIOS.filter((scenario) => scenario.world === "legacy").length).toBeGreaterThan(
            3,
        );
        for (const scenario of SCENARIOS) expect(scenario.world).toBeTruthy();
    });
});

describe("themed endless generation", () => {
    it("starts the industrial, city, forest and tunnel maps on their own theme", () => {
        expect(worldFor(getMap("industrial-district")!).segmentAt(500).theme).toBe("industrial");
        expect(worldFor(getMap("city-center")!).segmentAt(500).theme).toBe("city");
        expect(worldFor(getMap("forest-run")!).segmentAt(500).theme).toBe("forest");
        expect(worldFor(getMap("tunnel-run")!).segmentAt(500).theme).toBe("tunnel");
        expect(worldFor(getMap("bridge-crossing")!).segmentAt(500).theme).toBe("bridge");
    });

    it("is deterministic for every map", () => {
        for (const map of MAPS) {
            const first = worldFor(map);
            const second = worldFor(map);
            for (const s of [-350, 0, 399.5, 800, 4210, 12_345.5, 48_000]) {
                const a = first.sample(s);
                const b = second.sample(s);
                expect(a.x).toBe(b.x);
                expect(a.y).toBe(b.y);
                expect(a.heading).toBe(b.heading);
                expect(a.elevationM).toBe(b.elevationM);
                expect(a.segment.kind).toBe(b.segment.kind);
                expect(a.segment.index).toBe(b.segment.index);
                expect(a.segment.theme).toBe(b.segment.theme);
            }
        }
    });

    it("cycles the requested theme sequence by segment ordinal", () => {
        for (const map of MAPS) {
            if (map.routeMode === "straight") continue;
            const world = worldFor(map);
            for (let s = 500; s <= 20_000; s += 37) {
                const segment = world.segmentAt(s);
                const ordinal = Math.abs(segment.index) - 1;
                const expected = map.themeSequence[ordinal % map.themeSequence.length]!;
                expect(segment.kind).toBe(expected);
            }
        }
    });

    it("keeps the straight map on the x axis", () => {
        const map = getMap("endless-straight");
        expect(map).toBeDefined();
        const world = worldFor(map!);
        for (const s of [-5000, -400, 0, 400, 5000, 50_000]) {
            const sample = world.sample(s);
            expect(sample.x).toBeCloseTo(s, 6);
            expect(sample.y).toBeCloseTo(0, 6);
            expect(sample.heading).toBeCloseTo(0, 6);
        }
    });

    it("produces finite heights, normals and elevations on every map", () => {
        for (const map of MAPS) {
            const world = worldFor(map);
            for (let s = -600; s <= 6000; s += 41) {
                const sample = world.sample(s);
                expect(Number.isFinite(sample.x)).toBe(true);
                expect(Number.isFinite(sample.y)).toBe(true);
                expect(Number.isFinite(sample.heading)).toBe(true);
                expect(Number.isFinite(sample.elevationM)).toBe(true);
                expect(Number.isFinite(sample.grade)).toBe(true);
                expect(Number.isFinite(sample.bankRad)).toBe(true);
                for (const lateral of LATERALS) {
                    const terrain = world.sampleAt(s, lateral);
                    expect(Number.isFinite(terrain.heightM)).toBe(true);
                    expect(Number.isFinite(terrain.normalX)).toBe(true);
                    expect(Number.isFinite(terrain.normalY)).toBe(true);
                    expect(Number.isFinite(terrain.normalZ)).toBe(true);
                    expect(terrain.normalZ).toBeGreaterThan(0);
                    expect(Math.abs(terrain.heightM)).toBeLessThan(500);
                }
            }
        }
    });

    it("keeps chunk boundaries continuous on every map", () => {
        for (const map of MAPS) {
            const world = worldFor(map);
            for (let boundary = -320; boundary <= 3200; boundary += CHUNK_LENGTH_M) {
                const before = world.sample(boundary - 0.25);
                const after = world.sample(boundary + 0.25);
                expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.6);
                expect(Math.abs(after.heading - before.heading)).toBeLessThan(0.01);
                expect(Math.abs(after.elevationM - before.elevationM)).toBeLessThan(0.05);
                for (const lateral of LATERALS) {
                    const left = world.sampleAt(boundary - 0.25, lateral);
                    const right = world.sampleAt(boundary + 0.25, lateral);
                    expect(Math.abs(left.heightM - right.heightM)).toBeLessThan(0.4);
                }
            }
        }
    });
});
