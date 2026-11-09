import { smoothstep } from "../core/MathUtils";
import { isPavedSurface } from "./RoadLayout";
import type { WorldGenerator } from "../world/WorldGenerator";

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
    {
        id: "gentle-hill",
        xStart: 26,
        yMin: -16,
        yMax: -3,
        slope: 0.09,
        lengthM: 40,
        surfaceMu: 1,
    },
    {
        id: "steep-hill",
        xStart: 26,
        yMin: 3,
        yMax: 16,
        slope: 0.16,
        lengthM: 34,
        surfaceMu: 1,
    },
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
    private world: WorldGenerator | null = null;
    private hintS = 0;

    constructor(readonly ramps: TerrainRamp[] = TRAINING_GROUND_RAMPS) {}

    setWorld(world: WorldGenerator | null): void {
        this.world = world;
        this.hintS = 0;
    }

    get endless(): boolean {
        return this.world !== null;
    }

    heightAt(x: number, y: number): number {
        if (this.world) return this.world.heightAt(x, y, this.hintS);
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
        if (this.world) return null;
        for (const ramp of this.ramps) {
            if (y >= ramp.yMin && y <= ramp.yMax && x >= ramp.xStart) return ramp;
        }
        return null;
    }

    surfaceMuAt(x: number, y: number): number {
        if (this.world) {
            return this.world.surfaceMuAt(x, y, this.hintS);
        }
        let mu = isPavedSurface(x, y) ? 1 : 0.62;
        for (const area of this.wetAreas) {
            if (x >= area.xMin && x <= area.xMax && y >= area.yMin && y <= area.yMax) {
                mu = Math.min(mu, area.muScale);
            }
        }
        return mu;
    }

    rollingResistanceScaleAt(x: number, y: number): number {
        if (this.world) {
            return this.world.rollingResistanceScaleAt(x, y, this.hintS);
        }
        return isPavedSurface(x, y) ? 1 : 3.2;
    }

    project(
        x: number,
        y: number,
    ): {
        s: number;
        lateralM: number;
        halfWidthM: number;
        normalX: number;
        normalY: number;
    } | null {
        if (!this.world) return null;
        const projected = this.world.project(x, y, this.hintS);
        this.hintS = projected.s;
        const road = this.world.sample(projected.s);
        return {
            s: projected.s,
            lateralM: projected.lateralM,
            halfWidthM: road.halfWidthM,
            normalX: road.normalX,
            normalY: road.normalY,
        };
    }

    sample(x: number, y: number): RoadSample {
        if (this.world) {
            const projected = this.world.project(x, y, this.hintS);
            this.hintS = projected.s;
            const terrain = this.world.sampleAt(projected.s, projected.lateralM);
            return {
                heightM: terrain.heightM,
                normalX: terrain.normalX,
                normalY: terrain.normalY,
                normalZ: terrain.normalZ,
                gradientX: terrain.gradientX,
                gradientY: terrain.gradientY,
                surfaceMu: terrain.surfaceMu,
                rampId: null,
            };
        }
        const epsilon = 0.25;
        const height = this.heightAt(x, y);
        const gradientX =
            (this.heightAt(x + epsilon, y) - this.heightAt(x - epsilon, y)) / (2 * epsilon);
        const gradientY =
            (this.heightAt(x, y + epsilon) - this.heightAt(x, y - epsilon)) / (2 * epsilon);
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
