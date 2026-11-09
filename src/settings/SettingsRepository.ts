import {
    cloneBindings,
    DEFAULT_BINDINGS,
    validateBindings,
    type BindingMap,
} from "../input/bindings";

export interface UserSettings {
    version: 1;
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
    quality: "low" | "medium" | "high";
}

export const DEFAULT_SETTINGS: UserSettings = {
    version: 1,
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
};

const STORAGE_KEY = "bite-point.settings.v1";

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
        this.settings = {
            ...this.settings,
            ...partial,
            version: 1,
            bindings: partial.bindings ? cloneBindings(partial.bindings) : this.settings.bindings,
            renderScale: clampNumber(partial.renderScale ?? this.settings.renderScale, 0.5, 1.5),
            masterVolume: clampNumber(partial.masterVolume ?? this.settings.masterVolume, 0, 1),
            fovDegrees: clampNumber(partial.fovDegrees ?? this.settings.fovDegrees, 45, 95),
        };
        try {
            this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        } catch {
            // Storage can be unavailable in private browsing; the session still works.
        }
        return this.settings;
    }

    reset(): UserSettings {
        this.settings = { ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS) };
        try {
            this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        } catch {
            // Ignore unavailable storage.
        }
        return this.settings;
    }

    private load(): UserSettings {
        try {
            const raw = this.storage?.getItem(STORAGE_KEY);
            if (!raw) return { ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS) };
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const bindings = validateBindings(parsed.bindings) ?? cloneBindings(DEFAULT_BINDINGS);
            const quality =
                parsed.quality === "low" || parsed.quality === "medium" || parsed.quality === "high"
                    ? parsed.quality
                    : DEFAULT_SETTINGS.quality;
            return {
                version: 1,
                bindings,
                masterVolume: clampNumber(parsed.masterVolume, 0, 1, DEFAULT_SETTINGS.masterVolume),
                audioEnabled:
                    typeof parsed.audioEnabled === "boolean"
                        ? parsed.audioEnabled
                        : DEFAULT_SETTINGS.audioEnabled,
                shadows:
                    typeof parsed.shadows === "boolean" ? parsed.shadows : DEFAULT_SETTINGS.shadows,
                renderScale: clampNumber(
                    parsed.renderScale,
                    0.5,
                    1.5,
                    DEFAULT_SETTINGS.renderScale,
                ),
                fovDegrees: clampNumber(parsed.fovDegrees, 45, 95, DEFAULT_SETTINGS.fovDegrees),
                instructorEnabled:
                    typeof parsed.instructorEnabled === "boolean"
                        ? parsed.instructorEnabled
                        : DEFAULT_SETTINGS.instructorEnabled,
                quickSelectMode:
                    typeof parsed.quickSelectMode === "boolean"
                        ? parsed.quickSelectMode
                        : DEFAULT_SETTINGS.quickSelectMode,
                showDiagnostics:
                    typeof parsed.showDiagnostics === "boolean"
                        ? parsed.showDiagnostics
                        : DEFAULT_SETTINGS.showDiagnostics,
                showTelemetry:
                    typeof parsed.showTelemetry === "boolean"
                        ? parsed.showTelemetry
                        : DEFAULT_SETTINGS.showTelemetry,
                quality,
            };
        } catch {
            return { ...DEFAULT_SETTINGS, bindings: cloneBindings(DEFAULT_BINDINGS) };
        }
    }
}

function clampNumber(value: unknown, min: number, max: number, fallback?: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback ?? min;
    return Math.min(max, Math.max(min, value));
}

function safeStorage(): Storage | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}
