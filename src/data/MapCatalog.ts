import rawMaps from "./maps.json";
import type { MapDefinition, MapKind, MapLayout } from "./MapTypes";
import type { RouteKind, RouteMode } from "../simulation/world/WorldTypes";

const ROUTE_KINDS: readonly RouteKind[] = [
    "tutorial",
    "straight",
    "sweep",
    "esses",
    "climb",
    "descent",
    "coast",
    "forest",
    "industrial",
    "tunnel",
    "bridge",
    "city",
    "summit",
];

const ROUTE_MODES: readonly RouteMode[] = ["curved", "straight"];
const MAP_KINDS: readonly MapKind[] = ["endless", "legacy"];
const MAP_LAYOUTS: readonly MapLayout[] = ["route", "grid"];

const ROUTE_KIND_SET = new Set<string>(ROUTE_KINDS);
const ROUTE_MODE_SET = new Set<string>(ROUTE_MODES);
const MAP_KIND_SET = new Set<string>(MAP_KINDS);
const MAP_LAYOUT_SET = new Set<string>(MAP_LAYOUTS);

function fail(index: number, message: string): never {
    throw new Error(`maps.json[${index}]: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStart(value: unknown, index: number): MapDefinition["start"] {
    if (!isRecord(value)) fail(index, "start must be an object");
    const { x, y, heading } = value as Record<string, unknown>;
    if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        typeof heading !== "number" ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(heading)
    ) {
        fail(index, "start requires finite x, y and heading");
    }
    return { x, y, heading };
}

function parseMap(value: unknown, index: number): MapDefinition {
    if (!isRecord(value)) fail(index, "map must be an object");
    const record = value as Record<string, unknown>;
    const { id, name, description, kind, layout, seed, routeMode, themeSequence } = record;
    if (typeof id !== "string" || id.length === 0) fail(index, "id must be a non-empty string");
    if (typeof name !== "string" || name.length === 0)
        fail(index, "name must be a non-empty string");
    if (typeof description !== "string") fail(index, "description must be a string");
    if (typeof kind !== "string" || !MAP_KIND_SET.has(kind)) {
        fail(index, `kind must be one of ${MAP_KINDS.join(", ")}`);
    }
    const layoutValue = layout ?? "route";
    if (typeof layoutValue !== "string" || !MAP_LAYOUT_SET.has(layoutValue)) {
        fail(index, `layout must be one of ${MAP_LAYOUTS.join(", ")}`);
    }
    if (typeof seed !== "number" || !Number.isFinite(seed)) fail(index, "seed must be finite");
    if (typeof routeMode !== "string" || !ROUTE_MODE_SET.has(routeMode)) {
        fail(index, `routeMode must be one of ${ROUTE_MODES.join(", ")}`);
    }
    if (!Array.isArray(themeSequence) || themeSequence.length === 0) {
        fail(index, "themeSequence must be a non-empty array");
    }
    for (const kind of themeSequence) {
        if (typeof kind !== "string" || !ROUTE_KIND_SET.has(kind)) {
            fail(index, `unknown route kind: ${String(kind)}`);
        }
    }
    return {
        id,
        name,
        description,
        kind: kind as MapKind,
        layout: layoutValue as MapLayout,
        seed: Math.floor(seed as number) >>> 0,
        routeMode: routeMode as RouteMode,
        themeSequence: themeSequence as RouteKind[],
        start: parseStart(record.start, index),
    };
}

export const MAPS: readonly MapDefinition[] = Object.freeze(
    (rawMaps as unknown[]).map((value, index) => Object.freeze(parseMap(value, index))),
);

const MAPS_BY_ID = new Map(MAPS.map((map) => [map.id, map]));

if (MAPS_BY_ID.size !== MAPS.length) {
    throw new Error("maps.json contains duplicate map ids");
}

export const DEFAULT_MAP_ID = "city-center";

if (!MAPS_BY_ID.has(DEFAULT_MAP_ID)) {
    throw new Error(`maps.json is missing the default map: ${DEFAULT_MAP_ID}`);
}

export function getMap(id: string): MapDefinition | undefined {
    return MAPS_BY_ID.get(id);
}
