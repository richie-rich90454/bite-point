import { smoothstep } from "../core/MathUtils";

export interface TerrainRamp {
  id: string;
  xStart: number;
  yMin: number;
  yMax: number;
  slope: number;
  lengthM: number;
  surfaceMu?: number;
}

export interface RoadSample {
  heightM: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  gradientX: number;
  gradientY: number;
  surfaceMu: number;
  rampId: string | null;
}

export interface WetArea {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  muScale: number;
}

export const TRAINING_GROUND_RAMPS: TerrainRamp[] = [
  { id: "gentle-hill", xStart: 26, yMin: -16, yMax: -3, slope: 0.09, lengthM: 40, surfaceMu: 1 },
  { id: "steep-hill", xStart: 26, yMin: 3, yMax: 16, slope: 0.16, lengthM: 34, surfaceMu: 1 },
];

export const TRAINING_GROUND_WET_AREA: WetArea = {
  xMin: -30,
  xMax: 18,
  yMin: 24,
  yMax: 40,
  muScale: 0.55,
};

export class RoadContactProvider {
  private wetAreas: WetArea[] = [TRAINING_GROUND_WET_AREA];

  constructor(readonly ramps: TerrainRamp[] = TRAINING_GROUND_RAMPS) {}

  heightAt(x: number, y: number): number {
    let height = 0;
    for (const ramp of this.ramps) {
      if (y >= ramp.yMin && y <= ramp.yMax && x >= ramp.xStart) {
        const distance = Math.min(x - ramp.xStart, ramp.lengthM);
        const edgeBlend = smoothstep(0, 3.5, Math.min(y - ramp.yMin, ramp.yMax - y));
        height = Math.max(height, distance * ramp.slope * edgeBlend);
      }
    }
    return height;
  }

  rampAt(x: number, y: number): TerrainRamp | null {
    for (const ramp of this.ramps) {
      if (y >= ramp.yMin && y <= ramp.yMax && x >= ramp.xStart) return ramp;
    }
    return null;
  }

  surfaceMuAt(x: number, y: number): number {
    let mu = 1;
    for (const area of this.wetAreas) {
      if (x >= area.xMin && x <= area.xMax && y >= area.yMin && y <= area.yMax) {
        mu = Math.min(mu, area.muScale);
      }
    }
    return mu;
  }

  sample(x: number, y: number): RoadSample {
    const epsilon = 0.25;
    const height = this.heightAt(x, y);
    const gradientX = (this.heightAt(x + epsilon, y) - this.heightAt(x - epsilon, y)) / (2 * epsilon);
    const gradientY = (this.heightAt(x, y + epsilon) - this.heightAt(x, y - epsilon)) / (2 * epsilon);
    const length = Math.hypot(gradientX, gradientY, 1);
    return {
      heightM: height,
      normalX: -gradientX / length,
      normalY: -gradientY / length,
      normalZ: 1 / length,
      gradientX,
      gradientY,
      surfaceMu: this.surfaceMuAt(x, y),
      rampId: this.rampAt(x, y)?.id ?? null,
    };
  }

  setWetAreas(areas: WetArea[]): void {
    this.wetAreas = areas;
  }

  resetSurface(): void {
    this.wetAreas = [TRAINING_GROUND_WET_AREA];
  }
}
