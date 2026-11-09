import { clamp, smoothstep } from "../core/MathUtils";
import { SeededNoise } from "./SeededNoise";
import type { SurfaceKind } from "./WorldTypes";

const ELEVATION_SCALE_M = 20;
const ELEVATION_FREQUENCY = 1 / 6000;
const MAX_GRADE = 0.09;
export const SHOULDER_WIDTH_M = 3;
const SHOULDER_DROP_M = 0.15;
export const CROWN_M = 0.08;
const VERGE_SLOPE = 0.07;
const VERGE_DROP_LIMIT_M = 6;

const SURFACE_MU: Record<SurfaceKind, number> = {
    asphalt: 1,
    wet: 0.75,
    gravel: 0.62,
    grass: 0.5,
    dirt: 0.55,
    snow: 0.32,
};

const ROLLING_RESISTANCE: Record<SurfaceKind, number> = {
    asphalt: 1,
    wet: 1.15,
    gravel: 1.8,
    grass: 2.4,
    dirt: 2.1,
    snow: 3,
};

export class TerrainProfile {
    private readonly noise: SeededNoise;

    constructor(seed: number) {
        this.noise = new SeededNoise(seed ^ 0x9e3779b9);
    }

    elevationAt(s: number): number {
        return ELEVATION_SCALE_M * this.noise.fbm1(s * ELEVATION_FREQUENCY);
    }

    gradeAt(s: number): number {
        const derivative =
            ELEVATION_SCALE_M *
            ELEVATION_FREQUENCY *
            this.noise.fbm1Derivative(s * ELEVATION_FREQUENCY);
        return clamp(derivative, -MAX_GRADE, MAX_GRADE);
    }

    surfaceFor(halfWidthM: number, theme: string, lateralM: number): SurfaceKind {
        const distance = Math.abs(lateralM);
        if (distance <= halfWidthM) return "asphalt";
        if (distance <= halfWidthM + SHOULDER_WIDTH_M) return "gravel";
        return offRoadSurface(theme);
    }

    surfaceMu(surface: SurfaceKind): number {
        return SURFACE_MU[surface];
    }

    rollingResistanceScale(surface: SurfaceKind): number {
        return ROLLING_RESISTANCE[surface];
    }

    heightAtCrossSection(
        centerElevationM: number,
        halfWidthM: number,
        bankRad: number,
        theme: string,
        lateralM: number,
        worldX: number,
        worldY: number,
        crownM = CROWN_M,
    ): number {
        const distance = Math.abs(lateralM);
        if (distance <= halfWidthM) {
            const normalized = lateralM / halfWidthM;
            return (
                centerElevationM +
                crownM * (1 - normalized * normalized) -
                lateralM * Math.tan(bankRad)
            );
        }

        const edgeHeight = centerElevationM - Math.sign(lateralM) * halfWidthM * Math.tan(bankRad);
        if (distance <= halfWidthM + SHOULDER_WIDTH_M) {
            const t = (distance - halfWidthM) / SHOULDER_WIDTH_M;
            return edgeHeight - SHOULDER_DROP_M * smoothstep(0, 1, t);
        }

        const beyond = distance - halfWidthM - SHOULDER_WIDTH_M;
        const base =
            edgeHeight - SHOULDER_DROP_M - Math.min(beyond * VERGE_SLOPE, VERGE_DROP_LIMIT_M);
        const noiseAmplitude = Math.min(1, beyond / 25) * 5;
        if (noiseAmplitude === 0) return base;
        return base + noiseAmplitude * this.noise.fbm2(worldX * 0.012, worldY * 0.012);
    }
}

function offRoadSurface(theme: string): SurfaceKind {
    switch (theme) {
        case "summit":
        case "alpine":
            return "snow";
        case "forest":
        case "mountain":
        case "industrial":
        case "tunnel":
            return "dirt";
        default:
            return "grass";
    }
}
