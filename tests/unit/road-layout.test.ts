import { describe, expect, it } from "vitest";
import { isPavedSurface, PROVING_STRAIGHT } from "../../src/simulation/road/RoadLayout";
import { RoadContactProvider } from "../../src/simulation/road/RoadContactProvider";

describe("road surface boundaries", () => {
  it("keeps the straight flat and paved along its full length", () => {
    const road = new RoadContactProvider();
    for (let x = PROVING_STRAIGHT.startX; x <= PROVING_STRAIGHT.endX; x += 50) {
      for (const y of [-119.5, -110, -100.5]) {
        expect(isPavedSurface(x, y)).toBe(true);
        expect(road.heightAt(x, y)).toBe(0);
        expect(road.surfaceMuAt(x, y)).toBe(1);
      }
    }
  });

  it("connects the lot through the access apron and reduces grip off road", () => {
    const road = new RoadContactProvider();
    for (let y = -110; y <= -70; y += 1) expect(isPavedSurface(-40, y)).toBe(true);
    expect(road.surfaceMuAt(800, -130)).toBeLessThan(road.surfaceMuAt(800, -110));
    expect(road.rollingResistanceScaleAt(800, -130)).toBeGreaterThan(road.rollingResistanceScaleAt(800, -110));
    expect(isPavedSurface(6001, -110)).toBe(false);
  });
});
