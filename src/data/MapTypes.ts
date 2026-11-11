import type { RouteKind, RouteMode } from "../simulation/world/WorldTypes";

export interface MapDefinition {
    id: string;
    name: string;
    description: string;
    seed: number;
    routeMode: RouteMode;
    themeSequence: RouteKind[];
    start: { x: number; y: number; heading: number };
}
