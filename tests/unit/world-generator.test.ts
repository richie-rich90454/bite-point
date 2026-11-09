import { describe, expect, it } from "vitest";
import { WorldGenerator } from "../../src/simulation/world/WorldGenerator";
import { TUTORIAL_END, TUTORIAL_START } from "../../src/simulation/world/RoutePlan";

const DISTANCE_M = 100_000;
const SAMPLE_STEP_M = 1;

describe("world generator", () => {
    it("is deterministic for the same seed", () => {
        const first = new WorldGenerator(4242);
        const second = new WorldGenerator(4242);
        for (const s of [-1234.5, 0, 399.5, 401, 5000, 42_000, 123_456]) {
            const a = first.sample(s);
            const b = second.sample(s);
            expect(a.x).toBe(b.x);
            expect(a.y).toBe(b.y);
            expect(a.heading).toBe(b.heading);
            expect(a.elevationM).toBe(b.elevationM);
            expect(a.grade).toBe(b.grade);
            expect(a.bankRad).toBe(b.bankRad);
            expect(a.halfWidthM).toBe(b.halfWidthM);
            expect(a.surface).toBe(b.surface);
            expect(a.segment.index).toBe(b.segment.index);
            expect(a.segment.curvature).toBe(b.segment.curvature);
        }
    });

    it("produces a different route for a different seed", () => {
        const first = new WorldGenerator(1);
        const second = new WorldGenerator(2);
        const a = first.sample(5000);
        const b = second.sample(5000);
        const differs =
            a.x !== b.x ||
            a.y !== b.y ||
            a.heading !== b.heading ||
            a.segment.kind !== b.segment.kind;
        expect(differs).toBe(true);
    });

    it("keeps position, heading and elevation continuous over 100 km", () => {
        const world = new WorldGenerator(7);
        let previous = world.sample(0);
        let monotonicForward = true;
        let maxHeading = 0;
        for (let s = SAMPLE_STEP_M; s <= DISTANCE_M; s += SAMPLE_STEP_M) {
            const current = world.sample(s);
            const dx = current.x - previous.x;
            const dy = current.y - previous.y;
            expect(Math.hypot(dx, dy)).toBeLessThan(1.5);
            expect(Math.abs(current.heading - previous.heading)).toBeLessThan(0.02);
            expect(Math.abs(current.elevationM - previous.elevationM)).toBeLessThan(0.12);
            monotonicForward = monotonicForward && current.x > previous.x;
            maxHeading = Math.max(maxHeading, Math.abs(current.heading));
            previous = current;
        }
        expect(monotonicForward).toBe(true);
        expect(maxHeading).toBeLessThan(Math.PI / 2);
    });

    it("bounds curvature to the configured limits", () => {
        const world = new WorldGenerator(99);
        for (let s = TUTORIAL_START; s <= DISTANCE_M; s += 250) {
            const segment = world.segmentAt(s);
            expect(Math.abs(segment.curvature)).toBeLessThanOrEqual(0.006 + 1e-12);
            if (segment.kind !== "esses" && segment.kind !== "summit") {
                expect(Math.abs(segment.curvature)).toBeLessThanOrEqual(0.0008 + 1e-12);
            }
        }
        expect(TUTORIAL_END).toBe(400);
    });

    it("projects random on-road points back to their route distance", () => {
        const world = new WorldGenerator(2026);
        for (let i = 0; i < 60; i += 1) {
            const s = 600 + i * 1613.7;
            const road = world.sample(s);
            const lateralM = (((i * 37) % 21) / 20 - 0.5) * 1.4 * road.halfWidthM;
            const x = road.x + road.normalX * lateralM;
            const y = road.y + road.normalY * lateralM;
            const projected = world.project(x, y, s);
            expect(Math.abs(projected.s - s)).toBeLessThan(0.5);
            expect(Math.abs(projected.lateralM - lateralM)).toBeLessThan(0.05);
            expect(Math.abs(projected.distanceM - Math.abs(lateralM))).toBeLessThan(0.05);
        }
    });

    it("classifies road, shoulder and off-road surfaces", () => {
        const world = new WorldGenerator(11);
        const s = 12_345;
        const road = world.sample(s);
        const center = world.sampleAt(s, 0);
        const shoulder = world.sampleAt(s, road.halfWidthM + 1.5);
        const verge = world.sampleAt(s, road.halfWidthM + 15);

        expect(center.surface).toBe("asphalt");
        expect(shoulder.surface).toBe("gravel");
        expect(verge.surface).not.toBe("asphalt");
        expect(verge.surface).not.toBe("gravel");
        expect(center.surfaceMu).toBeGreaterThan(shoulder.surfaceMu);
        expect(shoulder.surfaceMu).toBeGreaterThanOrEqual(verge.surfaceMu);
        expect(center.rollingResistanceScale).toBeLessThan(shoulder.rollingResistanceScale);
        expect(shoulder.rollingResistanceScale).toBeLessThanOrEqual(verge.rollingResistanceScale);
    });

    it("never produces NaN over 100 km", () => {
        const world = new WorldGenerator(123);
        let allFinite = true;
        for (let s = 0; s <= DISTANCE_M; s += SAMPLE_STEP_M) {
            const sample = world.sample(s);
            allFinite =
                allFinite &&
                Number.isFinite(sample.x) &&
                Number.isFinite(sample.y) &&
                Number.isFinite(sample.heading) &&
                Number.isFinite(sample.elevationM) &&
                Number.isFinite(sample.grade) &&
                Number.isFinite(sample.bankRad) &&
                Number.isFinite(sample.halfWidthM);
        }
        expect(allFinite).toBe(true);
    });

    it("bounds grade to nine percent", () => {
        const world = new WorldGenerator(321);
        let maxGrade = 0;
        for (let s = 0; s <= DISTANCE_M; s += SAMPLE_STEP_M) {
            maxGrade = Math.max(maxGrade, Math.abs(world.sample(s).grade));
        }
        expect(maxGrade).toBeLessThanOrEqual(0.09 + 1e-12);
    });
});
