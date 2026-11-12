import type { RouteKind, RouteMode } from "../simulation/world/WorldTypes";

export type MapKind = "endless" | "legacy";

export interface MapDefinition {
    id: string;
    name: string;
    description: string;
    kind: MapKind;
    seed: number;
    routeMode: RouteMode;
    themeSequence: RouteKind[];
    start: { x: number; y: number; heading: number };
}
