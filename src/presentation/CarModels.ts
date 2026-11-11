import compactUrl from "../assets/models/1990s-compact-car.glb?url";
import sedanUrl from "../assets/models/1990s-sedan.glb?url";
import hatchbackKitUrl from "../assets/models/hatchback-vehicle-kit.glb?url";
import muscleUrl from "../assets/models/muscle-car.glb?url";
import rallyUrl from "../assets/models/rally-car.glb?url";
import sportsUrl from "../assets/models/1990s-sports-car.glb?url";
import electricUrl from "../assets/models/electric-car.glb?url";
import coupeUrl from "../assets/models/coupe.glb?url";

export interface CarModelDefinition {
    readonly id: string;
    readonly label: string;
    readonly url: string;
    /** Uniform scale applied to the imported model. */
    readonly scale: number;
    /** Offset in car space (x, y, z), in metres. */
    readonly offset: readonly [number, number, number];
    /** Material-name fragment used to find the paintable body material. */
    readonly paintMaterial: string;
    readonly defaultPaint: string;
}

const CAR_MODELS: Record<string, CarModelDefinition> = {
    "commuter-hatch": {
        id: "commuter-hatch",
        label: "1990s compact",
        url: compactUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#b9c4c9",
    },
    "city-sedan": {
        id: "city-sedan",
        label: "1990s sedan",
        url: sedanUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#5d6b74",
    },
    "hot-hatch": {
        id: "hot-hatch",
        label: "Modern hatchback",
        url: hatchbackKitUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#d84b2a",
    },
    "muscle-coupe": {
        id: "muscle-coupe",
        label: "Muscle car",
        url: muscleUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#1f2a44",
    },
    "rally-sedan": {
        id: "rally-sedan",
        label: "Rally car",
        url: rallyUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#2e6fb7",
    },
    "sports-coupe": {
        id: "sports-coupe",
        label: "Sports coupe",
        url: coupeUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#e2c044",
    },
    "track-coupe": {
        id: "track-coupe",
        label: "Track coupe",
        url: sportsUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#7ac142",
    },
    supercar: {
        id: "supercar",
        label: "Supercar",
        url: sportsUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#111318",
    },
    "gt-coupe": {
        id: "gt-coupe",
        label: "GT coupe",
        url: coupeUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#f0f0f0",
    },
    hypercar: {
        id: "hypercar",
        label: "Hypercar",
        url: sportsUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#1b5e8e",
    },
    "electric-hypercar": {
        id: "electric-hypercar",
        label: "Electric hypercar",
        url: electricUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#c8e6ff",
    },
    "reference-coupe": {
        id: "reference-coupe",
        label: "Bite Point hatchback",
        url: hatchbackKitUrl,
        scale: 1,
        offset: [0, 0, 0],
        paintMaterial: "body_pbr",
        defaultPaint: "#d6d6d6",
    },
};

export const DEFAULT_CAR_MODEL_ID = "reference-coupe";

export function resolveCarModel(modelId: string | null | undefined): CarModelDefinition {
    return (modelId ? CAR_MODELS[modelId] : undefined) ?? CAR_MODELS[DEFAULT_CAR_MODEL_ID]!;
}

export function carModelIds(): string[] {
    return Object.keys(CAR_MODELS);
}
