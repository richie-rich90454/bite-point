export {};

export interface BitePointSnapshot {
    started: boolean;
    scenarioId: string;
    scenarioStatus: string;
    gear: number;
    gearLabel: string;
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
    fps: number;
    stepsLastFrame: number;
    simulatedTimeS: number;
    throttle: number;
    brake: number;
    handbrake: boolean;
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
}

declare global {
    interface Window {
        bitePoint?: BitePointDebugApi;
    }
}
