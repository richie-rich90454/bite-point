import hatchbackUrl from "../assets/hatchback.glb?url";

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
    hatchback: {
        id: "hatchback",
        label: "1990s hatchback",
        url: hatchbackUrl,
        scale: 1.04,
        offset: [0, 0, -0.29],
        paintMaterial: "body_pbr",
        defaultPaint: "#ffffff",
    },
};

export const DEFAULT_CAR_MODEL_ID = "hatchback";

export function resolveCarModel(modelId: string | null | undefined): CarModelDefinition {
    return (modelId ? CAR_MODELS[modelId] : undefined) ?? CAR_MODELS[DEFAULT_CAR_MODEL_ID]!;
}

export function carModelIds(): string[] {
    return Object.keys(CAR_MODELS);
}
