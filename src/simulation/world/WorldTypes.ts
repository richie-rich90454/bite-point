export type SurfaceKind = "asphalt" | "gravel" | "grass" | "dirt" | "snow" | "wet";

export type RouteMode = "curved" | "straight";

export type RouteKind =
    | "tutorial"
    | "straight"
    | "sweep"
    | "esses"
    | "climb"
    | "descent"
    | "coast"
    | "forest"
    | "industrial"
    | "tunnel"
    | "bridge"
    | "city"
    | "summit";

export interface RouteSegment {
    index: number;
    kind: RouteKind;
    sStart: number;
    sEnd: number;
    curvature: number;
    grade: number;
    bankRad: number;
    halfWidthM: number;
    surface: SurfaceKind;
    theme: string;
}

export interface RoadSample {
    s: number;
    x: number;
    y: number;
    heading: number;
    tangentX: number;
    tangentY: number;
    normalX: number;
    normalY: number;
    elevationM: number;
    grade: number;
    bankRad: number;
    halfWidthM: number;
    surface: SurfaceKind;
    segment: RouteSegment;
}

export interface TerrainSample {
    heightM: number;
    normalX: number;
    normalY: number;
    normalZ: number;
    gradientX: number;
    gradientY: number;
    surface: SurfaceKind;
    surfaceMu: number;
    rollingResistanceScale: number;
    lateralM: number;
}
