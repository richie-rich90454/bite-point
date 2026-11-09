import {
    cloneBindings,
    DEFAULT_BINDINGS,
    validateBindings,
    type BindingMap,
} from "../input/bindings";

export type QualityPreset = "low" | "medium" | "high";
export type TextureQuality = "low" | "medium" | "high";
export type ColorblindMode = "none" | "protanopia" | "deuteranopia" | "tritanopia";
export type SpeedUnits = "metric" | "imperial";
export type ClutchAxis = "auto" | "leftTrigger" | "rightTrigger" | "separate";

export interface UserSettings {
    version: 2;
    bindings: BindingMap;
    masterVolume: number;
    audioEnabled: boolean;
    shadows: boolean;
    renderScale: number;
    fovDegrees: number;
    instructorEnabled: boolean;
    quickSelectMode: boolean;
    showDiagnostics: boolean;
    showTelemetry: boolean;
    quality: QualityPreset;
    drawDistance: number;
    textureQuality: TextureQuality;
    motionBlur: boolean;
    bloom: boolean;
    cameraShake: number;
    showFps: boolean;
    engineVolume: number;
    tireVolume: number;
    windVolume: number;
    uiVolume: number;
    muteOnFocusLoss: boolean;
    gamepadEnabled: boolean;
    clutchAxis: ClutchAxis;
    steeringDeadzone: number;
    throttleDeadzone: number;
    brakeDeadzone: number;
    units: SpeedUnits;
    hudScale: number;
    antiStallAssist: boolean;
    autoClutch: boolean;
    stabilityAssist: boolean;
    speedLimiterEnabled: boolean;
    colorblindMode: ColorblindMode;
    reducedMotion: boolean;
    highContrast: boolean;
}

const QUALITY_PRESETS: ReadonlyArray<QualityPreset> = ["low", "medium", "high"];
const TEXTURE_QUALITIES: ReadonlyArray<TextureQuality> = ["low", "medium", "high"];
const COLORBLIND_MODES: ReadonlyArray<ColorblindMode> = [
    "none",
    "protanopia",
    "deuteranopia",
    "tritanopia",
];
const SPEED_UNITS: ReadonlyArray<SpeedUnits> = ["metric", "imperial"];
const CLUTCH_AXES: ReadonlyArray<ClutchAxis> = ["auto", "leftTrigger", "rightTrigger", "separate"];

export const DEFAULT_SETTINGS: UserSettings = {
    version: 2,
    bindings: cloneBindings(DEFAULT_BINDINGS),
    masterVolume: 0.7,
    audioEnabled: true,
    shadows: true,
    renderScale: 1,
    fovDegrees: 62,
    instructorEnabled: true,
    quickSelectMode: false,
    showDiagnostics: false,
    showTelemetry: false,
    quality: "high",
    drawDistance: 1,
    textureQuality: "high",
    motionBlur: false,
    bloom: true,
    cameraShake: 0.5,
    showFps: false,
    engineVolume: 0.8,
    tireVolume: 0.6,
    windVolume: 0.5,
    uiVolume: 0.7,
    muteOnFocusLoss: true,
    gamepadEnabled: true,
    clutchAxis: "auto",
    steeringDeadzone: 0.08,
    throttleDeadzone: 0.05,
    brakeDeadzone: 0.05,
    units: "metric",
    hudScale: 1,
    antiStallAssist: false,
    autoClutch: false,
    stabilityAssist: true,
    speedLimiterEnabled: false,
    colorblindMode: "none",
    reducedMotion: false,
    highContrast: false,
};

const STORAGE_KEY = "bite-point.settings.v2";
const LEGACY_STORAGE_KEY = "bite-point.settings.v1";

export function createDefaultSettings(): UserSettings {
    return { ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS) };
}

export function sanitizeSettings(raw: unknown): UserSettings {
    const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
    const defaults = DEFAULT_SETTINGS;
    return {
        version: 2,
        bindings: validateBindings(source.bindings) ?? cloneBindings(DEFAULT_BINDINGS),
        masterVolume: clampNumber(source.masterVolume, 0, 1, defaults.masterVolume),
        audioEnabled: booleanValue(source.audioEnabled, defaults.audioEnabled),
        shadows: booleanValue(source.shadows, defaults.shadows),
        renderScale: clampNumber(source.renderScale, 0.5, 1.5, defaults.renderScale),
        fovDegrees: clampNumber(source.fovDegrees, 45, 95, defaults.fovDegrees),
        instructorEnabled: booleanValue(source.instructorEnabled, defaults.instructorEnabled),
        quickSelectMode: booleanValue(source.quickSelectMode, defaults.quickSelectMode),
        showDiagnostics: booleanValue(source.showDiagnostics, defaults.showDiagnostics),
        showTelemetry: booleanValue(source.showTelemetry, defaults.showTelemetry),
        quality: enumValue(source.quality, QUALITY_PRESETS, defaults.quality),
        drawDistance: clampNumber(source.drawDistance, 0.5, 2, defaults.drawDistance),
        textureQuality: enumValue(
            source.textureQuality,
            TEXTURE_QUALITIES,
            defaults.textureQuality,
        ),
        motionBlur: booleanValue(source.motionBlur, defaults.motionBlur),
        bloom: booleanValue(source.bloom, defaults.bloom),
        cameraShake: clampNumber(source.cameraShake, 0, 1, defaults.cameraShake),
        showFps: booleanValue(source.showFps, defaults.showFps),
        engineVolume: clampNumber(source.engineVolume, 0, 1, defaults.engineVolume),
        tireVolume: clampNumber(source.tireVolume, 0, 1, defaults.tireVolume),
        windVolume: clampNumber(source.windVolume, 0, 1, defaults.windVolume),
        uiVolume: clampNumber(source.uiVolume, 0, 1, defaults.uiVolume),
        muteOnFocusLoss: booleanValue(source.muteOnFocusLoss, defaults.muteOnFocusLoss),
        gamepadEnabled: booleanValue(source.gamepadEnabled, defaults.gamepadEnabled),
        clutchAxis: enumValue(source.clutchAxis, CLUTCH_AXES, defaults.clutchAxis),
        steeringDeadzone: clampNumber(source.steeringDeadzone, 0, 0.3, defaults.steeringDeadzone),
        throttleDeadzone: clampNumber(source.throttleDeadzone, 0, 0.3, defaults.throttleDeadzone),
        brakeDeadzone: clampNumber(source.brakeDeadzone, 0, 0.3, defaults.brakeDeadzone),
        units: enumValue(source.units, SPEED_UNITS, defaults.units),
        hudScale: clampNumber(source.hudScale, 0.75, 1.5, defaults.hudScale),
        antiStallAssist: booleanValue(source.antiStallAssist, defaults.antiStallAssist),
        autoClutch: booleanValue(source.autoClutch, defaults.autoClutch),
        stabilityAssist: booleanValue(source.stabilityAssist, defaults.stabilityAssist),
        speedLimiterEnabled: booleanValue(source.speedLimiterEnabled, defaults.speedLimiterEnabled),
        colorblindMode: enumValue(source.colorblindMode, COLORBLIND_MODES, defaults.colorblindMode),
        reducedMotion: booleanValue(source.reducedMotion, defaults.reducedMotion),
        highContrast: booleanValue(source.highContrast, defaults.highContrast),
    };
}

export function exportSettings(settings: UserSettings): string {
    return JSON.stringify(settings, null, 2);
}

export function importSettings(raw: string): UserSettings {
    return sanitizeSettings(JSON.parse(raw) as unknown);
}

export class SettingsRepository {
    private settings: UserSettings;
    private readonly storage: Storage | null;

    constructor(storage: Storage | null = safeStorage()) {
        this.storage = storage;
        this.settings = this.load();
    }

    get current(): Readonly<UserSettings> {
        return this.settings;
    }

    save(partial: Partial<UserSettings>): UserSettings {
        this.settings = sanitizeSettings({ ...this.settings, ...partial });
        this.persist();
        return this.settings;
    }

    reset(): UserSettings {
        this.settings = createDefaultSettings();
        this.persist();
        return this.settings;
    }

    exportJson(): string {
        return exportSettings(this.settings);
    }

    importJson(raw: string): UserSettings {
        this.settings = importSettings(raw);
        this.persist();
        return this.settings;
    }

    private load(): UserSettings {
        try {
            const raw =
                this.storage?.getItem(STORAGE_KEY) ?? this.storage?.getItem(LEGACY_STORAGE_KEY);
            if (!raw) return createDefaultSettings();
            return sanitizeSettings(JSON.parse(raw) as unknown);
        } catch {
            return createDefaultSettings();
        }
    }

    private persist(): void {
        try {
            this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        } catch {
            // Storage can be unavailable in private browsing; the session still works.
        }
    }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: ReadonlyArray<T>, fallback: T): T {
    return typeof value === "string" && (allowed as ReadonlyArray<string>).includes(value)
        ? (value as T)
        : fallback;
}

function safeStorage(): Storage | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}
