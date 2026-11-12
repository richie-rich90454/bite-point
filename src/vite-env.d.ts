export {};

export interface BitePointSnapshot {
    started: boolean;
    scenarioId: string;
    scenarioStatus: string;
    gear: number;
    gearLabel: string;
    carId: string;
    mapId: string;
    redlineRpm: number;
    speedoMaxKph: number;
    speedKph: number;
    rpm: number;
    running: boolean;
    clutchPedal: number;
    clutchMode: string;
    x: number;
    y: number;
    shifterGate: number;
    shifterSlot: number;
    shifterGrabbed: boolean;
    pauseOpen: boolean;
    helpOpen: boolean;
    telemetryOpen: boolean;
    replaying: boolean;
    worldMode: string;
    roadDistance: number;
    activeChunks: number;
    fps: number;
    stepsLastFrame: number;
    simulatedTimeS: number;
    throttle: number;
    brake: number;
    handbrake: boolean;
    launchControlActive: boolean;
    launchControlPhase: "idle" | "holding" | "releasing" | "launched";
    engineTorqueNm: number;
    wheelOmegas: number[];
    clutchModeDetail: string;
    surfaceMu: number;
}

export interface BitePointDebugApi {
    snapshot: () => BitePointSnapshot;
    startScenario: (id: string) => void;
    pause: () => void;
    resume: () => void;
    world: () => {
        material: string | null;
        albedo: string | null;
        albedoReady: boolean;
        textures: number;
        chunks: number;
        roadMaterial: string | null;
        terrainMaterial: string | null;
        roadVertices: number;
        terrainVertices: number;
    };
    debug: () => {
        camera: [number, number, number] | null;
        cameraMode: string;
        cockpitEnabled: boolean;
        cockpitChildren: number;
        cockpitVisible: number;
        importedCar: boolean;
        exteriorCabin: boolean;
        activeMeshes: number;
    };
}

declare global {
    interface Window {
        bitePoint?: BitePointDebugApi;
    }
}
