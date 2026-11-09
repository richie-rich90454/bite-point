import type { InputAction } from "../input/bindings";
import type { InputDiagnostics, RebindResult } from "../input/InputService";
import {
    DEFAULT_SETTINGS,
    exportSettings,
    importSettings,
    type UserSettings,
} from "../settings/SettingsRepository";
import type { ScenarioDefinition, ScenarioStatus } from "../scenarios/ScenarioManager";
import type { ClockStats } from "../simulation/core/SimulationClock";
import type { TelemetrySample } from "../simulation/telemetry/TelemetryRecorder";
import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";
import type { InstructorMessage } from "../instructor/DrivingInstructor";
import { DashboardPresenter } from "../presentation/DashboardPresenter";
import { ACTION_LABELS, INPUT_ACTIONS, formatKeyCode } from "../input/bindings";

export interface UIScenarioInfo {
    id: string;
    title: string;
    description: string;
    instructions: string[];
    status: ScenarioStatus;
    message: string;
    progress: number;
    elapsedS: number;
}

export interface UIUpdate {
    state: VehicleRenderState;
    clock: ClockStats;
    fps: number;
    physicsMs: number;
    scenario: UIScenarioInfo;
    instructorMessages: InstructorMessage[];
    instructorEnabled: boolean;
    telemetrySamples: TelemetrySample[];
    telemetryVisible: boolean;
    replaying: boolean;
    cameraLabel: string;
    headlights: boolean;
    wipers: number;
    inputDiagnostics: InputDiagnostics;
    quickSelectEnabled: boolean;
    rendererMode: string;
}

export interface AppUICallbacks {
    onStart: (scenarioId: string) => void;
    onResume: () => void;
    onRestart: () => void;
    onScenario: (scenarioId: string) => void;
    onRecovery: () => void;
    onSettings: (settings: Partial<UserSettings>) => void;
    onRebind: (action: InputAction) => Promise<RebindResult>;
    onResetBindings: () => void;
    onExportTelemetry: () => void;
    onReplay: () => void;
    onStopReplay: () => void;
    onCamera: () => void;
    onHelp: () => void;
    getBindingLabel: (action: InputAction) => string;
}

type PauseTab = "drive" | "lessons" | "controls" | "settings" | "input" | "diagnostics";

const TAB_LABELS: Record<PauseTab, string> = {
    drive: "Drive",
    lessons: "Lessons",
    controls: "Controls",
    settings: "Settings",
    input: "Input test",
    diagnostics: "Diagnostics",
};

type SettingKey = Exclude<keyof UserSettings, "version" | "bindings">;

interface SettingOption {
    value: string;
    label: string;
}

type SettingControl =
    | {
          key: SettingKey;
          label: string;
          help: string;
          kind: "range";
          min: number;
          max: number;
          step: number;
          unit: string;
          format: (value: number) => string;
      }
    | { key: SettingKey; label: string; help: string; kind: "toggle" }
    | {
          key: SettingKey;
          label: string;
          help: string;
          kind: "select";
          options: ReadonlyArray<SettingOption>;
      };

type SettingsSectionId = "graphics" | "audio" | "controls" | "driving" | "interface" | "data";

interface SettingsSection {
    id: SettingsSectionId;
    title: string;
    controls: ReadonlyArray<SettingControl>;
}

const percent = (value: number): string => `${Math.round(value * 100)}`;

const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = [
    {
        id: "graphics",
        title: "Graphics",
        controls: [
            {
                key: "quality",
                label: "Quality preset",
                help: "Balances shadows, resolution and anti-aliasing. Changing it updates render scale and shadows too.",
                kind: "select",
                options: [
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                ],
            },
            {
                key: "renderScale",
                label: "Render scale",
                help: "Internal resolution multiplier. Lower values improve frame rate on slower GPUs.",
                kind: "range",
                min: 0.5,
                max: 1.5,
                step: 0.05,
                unit: "×",
                format: (value) => value.toFixed(2),
            },
            {
                key: "drawDistance",
                label: "Draw distance",
                help: "How far the scene is rendered before detail fades out.",
                kind: "range",
                min: 0.5,
                max: 2,
                step: 0.05,
                unit: "×",
                format: (value) => value.toFixed(2),
            },
            {
                key: "shadows",
                label: "Shadows",
                help: "Cast shadows from the car and trackside objects.",
                kind: "toggle",
            },
            {
                key: "textureQuality",
                label: "Texture quality",
                help: "Surface detail for asphalt, paint and the cockpit.",
                kind: "select",
                options: [
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                ],
            },
            {
                key: "motionBlur",
                label: "Motion blur",
                help: "Adds speed blur at the frame edges. Off is the clearest option.",
                kind: "toggle",
            },
            {
                key: "bloom",
                label: "Bloom",
                help: "Soft highlight glow around bright surfaces.",
                kind: "toggle",
            },
            {
                key: "fovDegrees",
                label: "Field of view",
                help: "Cockpit camera field of view in degrees.",
                kind: "range",
                min: 45,
                max: 95,
                step: 1,
                unit: "°",
                format: (value) => String(Math.round(value)),
            },
            {
                key: "cameraShake",
                label: "Camera shake",
                help: "Cabin movement from engine vibration and road surface.",
                kind: "range",
                min: 0,
                max: 1,
                step: 0.05,
                unit: "%",
                format: percent,
            },
            {
                key: "showFps",
                label: "Show frame rate",
                help: "Display the live frame rate in the driving HUD.",
                kind: "toggle",
            },
        ],
    },
    {
        id: "audio",
        title: "Audio",
        controls: [
            {
                key: "masterVolume",
                label: "Master volume",
                help: "Overall output level for every channel.",
                kind: "range",
                min: 0,
                max: 1,
                step: 0.05,
                unit: "%",
                format: percent,
            },
            {
                key: "audioEnabled",
                label: "Sound output",
                help: "Mute or unmute the whole simulation.",
                kind: "toggle",
            },
            {
                key: "engineVolume",
                label: "Engine",
                help: "Engine and exhaust level.",
                kind: "range",
                min: 0,
                max: 1,
                step: 0.05,
                unit: "%",
                format: percent,
            },
            {
                key: "tireVolume",
                label: "Tires",
                help: "Road roar and tire scrub level.",
                kind: "range",
                min: 0,
                max: 1,
                step: 0.05,
                unit: "%",
                format: percent,
            },
            {
                key: "windVolume",
                label: "Wind",
                help: "Airflow noise that rises with speed.",
                kind: "range",
                min: 0,
                max: 1,
                step: 0.05,
                unit: "%",
                format: percent,
            },
            {
                key: "uiVolume",
                label: "Interface",
                help: "Clicks, confirmations and instructor cues.",
                kind: "range",
                min: 0,
                max: 1,
                step: 0.05,
                unit: "%",
                format: percent,
            },
            {
                key: "muteOnFocusLoss",
                label: "Mute on focus loss",
                help: "Silence the simulation when the window loses focus.",
                kind: "toggle",
            },
        ],
    },
    {
        id: "controls",
        title: "Controls",
        controls: [
            {
                key: "gamepadEnabled",
                label: "Gamepad and wheel",
                help: "Accept input from connected controllers and racing wheels.",
                kind: "toggle",
            },
            {
                key: "clutchAxis",
                label: "Clutch axis",
                help: "Choose how an analog clutch is read from your wheel or pad.",
                kind: "select",
                options: [
                    { value: "auto", label: "Automatic" },
                    { value: "leftTrigger", label: "Left trigger" },
                    { value: "rightTrigger", label: "Right trigger" },
                    { value: "separate", label: "Separate pedal" },
                ],
            },
            {
                key: "steeringDeadzone",
                label: "Steering deadzone",
                help: "Ignore small steering movements at the centre.",
                kind: "range",
                min: 0,
                max: 0.3,
                step: 0.01,
                unit: "%",
                format: percent,
            },
            {
                key: "throttleDeadzone",
                label: "Throttle deadzone",
                help: "Ignore small throttle movements at rest.",
                kind: "range",
                min: 0,
                max: 0.3,
                step: 0.01,
                unit: "%",
                format: percent,
            },
            {
                key: "brakeDeadzone",
                label: "Brake deadzone",
                help: "Ignore small brake movements at rest.",
                kind: "range",
                min: 0,
                max: 0.3,
                step: 0.01,
                unit: "%",
                format: percent,
            },
            {
                key: "quickSelectMode",
                label: "Quick-select gears 1–6",
                help: "Accessibility option. It still obeys clutch and reverse-lockout rules.",
                kind: "toggle",
            },
        ],
    },
    {
        id: "driving",
        title: "Driving",
        controls: [
            {
                key: "units",
                label: "Units",
                help: "Speed and distance units used by the interface.",
                kind: "select",
                options: [
                    { value: "metric", label: "Metric (km/h)" },
                    { value: "imperial", label: "Imperial (mph)" },
                ],
            },
            {
                key: "hudScale",
                label: "HUD scale",
                help: "Size of the driving instruments on screen.",
                kind: "range",
                min: 0.75,
                max: 1.5,
                step: 0.05,
                unit: "×",
                format: (value) => value.toFixed(2),
            },
            {
                key: "instructorEnabled",
                label: "Driving instructor",
                help: "Show coaching messages while you drive.",
                kind: "toggle",
            },
            {
                key: "antiStallAssist",
                label: "Extra stall assist",
                help: "Adds a small throttle kick when the engine drops below idle speed.",
                kind: "toggle",
            },
            {
                key: "autoClutch",
                label: "Automatic clutch",
                help: "Handles launches and gear changes without the clutch keys. You can still shift manually.",
                kind: "toggle",
            },
            {
                key: "stabilityAssist",
                label: "Stability assist",
                help: "Damps sideways slides at speed so the car stays predictable.",
                kind: "toggle",
            },
            {
                key: "speedLimiterEnabled",
                label: "Speed limiter",
                help: "Cap top speed. Off by default so the proving straight stays open.",
                kind: "toggle",
            },
        ],
    },
    {
        id: "interface",
        title: "Interface",
        controls: [
            {
                key: "colorblindMode",
                label: "Colorblind mode",
                help: "Adjusts status colors for common color-vision deficiencies.",
                kind: "select",
                options: [
                    { value: "none", label: "None" },
                    { value: "protanopia", label: "Protanopia" },
                    { value: "deuteranopia", label: "Deuteranopia" },
                    { value: "tritanopia", label: "Tritanopia" },
                ],
            },
            {
                key: "reducedMotion",
                label: "Reduced motion",
                help: "Remove transitions and decorative animation.",
                kind: "toggle",
            },
            {
                key: "highContrast",
                label: "High contrast",
                help: "Strengthen borders and text contrast.",
                kind: "toggle",
            },
            {
                key: "showDiagnostics",
                label: "Diagnostics chip",
                help: "Show frame rate, physics steps and CPU cost in the HUD.",
                kind: "toggle",
            },
            {
                key: "showTelemetry",
                label: "Telemetry panel",
                help: "Open the live telemetry panel when a session starts.",
                kind: "toggle",
            },
        ],
    },
    { id: "data", title: "Data", controls: [] },
];

export class AppUI {
    startOpen = true;
    pauseOpen = false;
    helpOpen = false;
    telemetryOpen = false;
    private activeTab: PauseTab = "drive";
    private selectedScenario = "endless";
    private readonly dashboard: DashboardPresenter;
    private readonly root: HTMLElement;
    private readonly callbacks: AppUICallbacks;
    private settings: UserSettings;
    private readonly scenarios: ReadonlyArray<ScenarioDefinition>;
    private lastScenarioId = "";
    private lastInstructorSignature = "";
    private lastTelemetryDraw = 0;
    private settingsNotice = "";
    private settingsNoticeError = false;

    private readonly startOverlay: HTMLElement;
    private readonly pauseOverlay: HTMLElement;
    private readonly helpOverlay: HTMLElement;
    private readonly hud: HTMLElement;
    private readonly telemetryPanel: HTMLElement;
    private readonly dashboardCanvas: HTMLCanvasElement;
    private readonly scenarioTitle: HTMLElement;
    private readonly scenarioDescription: HTMLElement;
    private readonly scenarioStatus: HTMLElement;
    private readonly scenarioMessage: HTMLElement;
    private readonly scenarioProgress: HTMLElement;
    private readonly scenarioSteps: HTMLElement;
    private readonly scenarioElapsed: HTMLElement;
    private readonly prompt: HTMLElement;
    private readonly warnings: HTMLElement;
    private readonly instructorList: HTMLElement;
    private readonly cameraLabel: HTMLElement;
    private readonly pauseContent: HTMLElement;
    private readonly tabs: HTMLElement;
    private readonly inputTestPanel: HTMLElement;
    private readonly diagnosticsPanel: HTMLElement;
    private readonly helpContent: HTMLElement;
    private readonly toastStack: HTMLElement;
    private readonly telemetryCanvas: HTMLCanvasElement;
    private readonly telemetryStats: HTMLElement;
    private readonly telemetryReplayButton: HTMLButtonElement;
    private readonly statusLights: HTMLElement;
    private readonly liveStatus: HTMLElement;

    constructor(
        root: HTMLElement,
        scenarios: ReadonlyArray<ScenarioDefinition>,
        settings: UserSettings,
        callbacks: AppUICallbacks,
    ) {
        this.root = root;
        this.scenarios = scenarios;
        this.settings = settings;
        this.callbacks = callbacks;
        root.innerHTML = this.template();
        this.startOverlay = this.query(".start-overlay");
        this.pauseOverlay = this.query(".pause-overlay");
        this.helpOverlay = this.query(".help-overlay");
        this.hud = this.query(".hud");
        this.telemetryPanel = this.query(".telemetry-panel");
        this.dashboardCanvas = this.query<HTMLCanvasElement>("#dashboard-canvas");
        this.scenarioTitle = this.query(".scenario-title");
        this.scenarioDescription = this.query(".scenario-description");
        this.scenarioStatus = this.query(".scenario-status");
        this.scenarioMessage = this.query(".scenario-message");
        this.scenarioProgress = this.query(".scenario-progress-fill");
        this.scenarioSteps = this.query(".scenario-steps");
        this.scenarioElapsed = this.query(".scenario-elapsed");
        this.prompt = this.query(".prompt-text");
        this.warnings = this.query(".warning-row");
        this.instructorList = this.query(".instructor-list");
        this.cameraLabel = this.query(".camera-label");
        this.pauseContent = this.query(".pause-content");
        this.tabs = this.query(".pause-tabs");
        this.inputTestPanel = this.pauseContent;
        this.diagnosticsPanel = this.pauseContent;
        this.helpContent = this.query(".help-content");
        this.toastStack = this.query(".toast-stack");
        this.telemetryCanvas = this.query<HTMLCanvasElement>("#telemetry-canvas");
        this.telemetryStats = this.query(".telemetry-stats");
        this.telemetryReplayButton = this.query<HTMLButtonElement>('[data-ui="replay"]');
        this.statusLights = this.query(".status-lights");
        this.liveStatus = this.query(".live-status");
        this.dashboard = new DashboardPresenter(this.dashboardCanvas, {
            units: settings.units,
        });

        this.bindStaticEvents();
        this.renderStartScenarios();
        this.renderHelp();
        this.setTelemetryVisible(settings.showTelemetry, false);
        this.updateSettings(settings);
    }

    updateSettings(settings: UserSettings): void {
        this.settings = settings;
        this.dashboard.setUnits(settings.units);
        this.applyInterfacePreferences();
        if (this.pauseOpen && this.activeTab === "settings") this.renderPauseTab();
    }

    private get speedUnit(): string {
        return this.settings.units === "imperial" ? "mph" : "km/h";
    }

    private speedValue(kph: number): number {
        return this.settings.units === "imperial" ? kph * 0.621371 : kph;
    }

    private applyInterfacePreferences(): void {
        const root = document.documentElement;
        root.dataset.reducedMotion = String(this.settings.reducedMotion);
        root.dataset.highContrast = String(this.settings.highContrast);
        root.dataset.colorblind = this.settings.colorblindMode;
        root.style.setProperty("--hud-scale", String(this.settings.hudScale));
    }

    setScenarioSelection(id: string): void {
        this.selectedScenario = id;
        this.root.querySelectorAll<HTMLElement>("[data-scenario-card]").forEach((card) => {
            card.classList.toggle("selected", card.dataset.scenarioCard === id);
        });
    }

    get selected(): string {
        return this.selectedScenario;
    }

    showStart(): void {
        this.startOpen = true;
        this.startOverlay.hidden = false;
        this.hud.classList.add("hud-hidden");
        document.exitPointerLock?.();
    }

    hideStart(): void {
        this.startOpen = false;
        this.startOverlay.hidden = true;
        this.hud.classList.remove("hud-hidden");
        (document.activeElement as HTMLElement | null)?.blur();
    }

    openPause(tab: PauseTab = "drive"): void {
        if (this.startOpen) return;
        this.closeHelp();
        this.activeTab = tab;
        this.pauseOpen = true;
        this.pauseOverlay.hidden = false;
        this.hud.classList.add("hud-dimmed");
        this.renderPauseTab();
        document.exitPointerLock?.();
        (document.activeElement as HTMLElement | null)?.blur();
    }

    closePause(): void {
        this.pauseOpen = false;
        this.pauseOverlay.hidden = true;
        this.hud.classList.remove("hud-dimmed");
        (document.activeElement as HTMLElement | null)?.blur();
    }

    togglePause(): void {
        if (this.startOpen) return;
        if (this.pauseOpen) this.closePause();
        else this.openPause("drive");
    }

    openHelp(): void {
        this.closePause();
        this.helpOpen = true;
        this.helpOverlay.hidden = false;
        this.hud.classList.add("hud-dimmed");
        this.renderHelp();
        document.exitPointerLock?.();
    }

    closeHelp(): void {
        this.helpOpen = false;
        this.helpOverlay.hidden = true;
        if (!this.pauseOpen) this.hud.classList.remove("hud-dimmed");
    }

    toggleHelp(): void {
        if (this.helpOpen) this.closeHelp();
        else this.openHelp();
    }

    setTelemetryVisible(visible: boolean, notify = true): void {
        this.telemetryOpen = visible;
        this.telemetryPanel.hidden = !visible;
        if (notify) this.callbacks.onSettings({ showTelemetry: visible });
    }

    toggleTelemetry(): void {
        this.setTelemetryVisible(!this.telemetryOpen);
    }

    handleEscape(): void {
        if (this.helpOpen) {
            this.closeHelp();
            return;
        }
        if (this.startOpen) return;
        this.togglePause();
    }

    showToast(message: string, kind: "info" | "warning" | "success" = "info"): void {
        const toast = document.createElement("div");
        toast.className = `toast toast-${kind}`;
        toast.textContent = message;
        this.toastStack.append(toast);
        while (this.toastStack.childElementCount > 4) this.toastStack.firstElementChild?.remove();
        window.setTimeout(() => toast.remove(), 5200);
    }

    update(data: UIUpdate): void {
        if (!this.startOpen) {
            if (data.cameraLabel !== "Exterior")
                this.dashboard.draw(data.state, data.state.shifterGrabbed);
            this.renderScenario(data);
            this.renderHud(data);
            this.renderInstructor(data);
            this.renderTelemetry(data);
            this.renderPauseDynamic(data);
        }
        this.telemetryReplayButton.textContent = data.replaying
            ? "Stop replay"
            : "Replay last 20 s";
    }

    private query<T extends HTMLElement = HTMLElement>(selector: string): T {
        const element = this.root.querySelector<T>(selector);
        if (!element) throw new Error(`UI element not found: ${selector}`);
        return element;
    }

    private template(): string {
        return `
      <div class="hud">
        <div class="scenario-card panel">
          <div class="scenario-topline">
            <span class="kicker">Lesson</span>
            <span class="scenario-status">Running</span>
          </div>
          <div class="scenario-title">Free drive</div>
          <div class="scenario-description"></div>
          <ol class="scenario-steps"></ol>
          <div class="scenario-progress"><span class="scenario-progress-fill"></span></div>
          <div class="scenario-footer">
            <span class="scenario-message"></span>
            <span class="scenario-elapsed">0:00</span>
          </div>
        </div>

        <div class="status-stack">
          <div class="live-status">
            <div class="camera-label">Cockpit</div>
            <div class="status-lights"></div>
          </div>
          <div class="diagnostics-chip panel" data-diagnostics>
            <span data-diag="fps">-- FPS</span>
            <span data-diag="step">--</span>
            <span data-diag="cpu">--</span>
          </div>
        </div>

        <div class="warning-row"></div>
        <div class="instructor-panel panel">
          <div class="panel-label">Instructor</div>
          <div class="instructor-list"></div>
        </div>

        <div class="prompt panel">
          <div class="prompt-key">Hint</div>
          <div class="prompt-text">Press I to switch on the ignition, then hold K to start.</div>
        </div>

        <div class="dashboard-panel">
          <canvas id="dashboard-canvas" aria-label="Instrument cluster"></canvas>
        </div>
        <section class="exterior-instruments" aria-label="Driving instruments">
          <div class="exterior-speed"><b data-exterior-speed>0</b><span data-exterior-unit>km/h</span><strong data-exterior-gear>N</strong></div>
          <div class="exterior-rpm"><span data-exterior-revs></span></div>
          <div class="exterior-rev-label"><span data-exterior-rpm>0 rpm</span><b class="shift-cue">Shift up</b></div>
          <div class="exterior-pedals">
            <div><span>Clutch</span><i><b data-exterior-clutch></b></i></div>
            <div><span>Throttle</span><i><b data-exterior-throttle></b></i></div>
            <div><span>Brake</span><i><b data-exterior-brake></b></i></div>
          </div>
        </section>

        <button class="pause-button" data-ui="pause" aria-label="Pause">II</button>
        <div class="toast-stack"></div>
      </div>

      <section class="telemetry-panel panel" hidden>
        <div class="panel-header">
          <div>
            <div class="panel-label">Telemetry</div>
            <div class="panel-title">Last 20 seconds</div>
          </div>
          <button class="icon-button" data-ui="close-telemetry" aria-label="Close telemetry">×</button>
        </div>
        <canvas id="telemetry-canvas"></canvas>
        <div class="telemetry-stats"></div>
        <div class="button-row">
          <button class="button secondary" data-ui="export">Export JSON</button>
          <button class="button secondary" data-ui="replay">Replay last 20 s</button>
        </div>
        <p class="fine-print">Samples are recorded at 20 Hz from the fixed-step simulation. Export for offline analysis or replay the visual state.</p>
      </section>

      <section class="overlay start-overlay">
        <div class="start-shell">
          <div class="start-copy">
            <div class="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.1">
                <path d="M24 2.5 45.5 24 24 45.5 2.5 24 24 2.5Z" />
                <path d="M16.5 12.5v23M31.5 12.5v23M16.5 24h15" />
                <circle cx="16.5" cy="12.5" r="1.6" fill="currentColor" stroke="none" />
                <circle cx="31.5" cy="12.5" r="1.6" fill="currentColor" stroke="none" />
                <circle cx="16.5" cy="35.5" r="1.6" fill="currentColor" stroke="none" />
                <circle cx="31.5" cy="35.5" r="1.6" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <p class="eyebrow">Manual transmission simulator</p>
            <h1>Bite<br><em>point</em></h1>
            <p class="start-lead">Feel the bite. Nail the shift. Drive an endless procedural highway with a manual gearbox and no artificial speed ceiling.</p>
            <div class="start-actions">
              <button class="button primary" data-ui="start">Start driving</button>
              <button class="button ghost" data-ui="help-start">Controls</button>
            </div>
            <div class="start-footnote">Six speeds, 250 Hz physics, endless road</div>
          </div>
          <div class="start-select">
            <div class="panel-label">Choose your session</div>
            <div class="scenario-grid"></div>
            <div class="start-hints">
              <span><b>I</b> ignition</span>
              <span><b>K</b> starter</span>
              <span><b>Z / X</b> clutch</span>
              <span><b>Enter + arrows</b> H-pattern</span>
            </div>
          </div>
        </div>
      </section>

      <section class="overlay pause-overlay" hidden>
        <div class="pause-shell">
          <div class="pause-side">
            <div class="panel-label">Bite Point</div>
            <h2>Pit stop</h2>
            <div class="pause-tabs"></div>
            <div class="pause-side-footer">Esc resumes, F1 controls</div>
          </div>
          <div class="pause-main">
            <div class="pause-content"></div>
          </div>
        </div>
      </section>

      <section class="overlay help-overlay" hidden>
        <div class="help-shell">
          <div class="panel-header">
            <div>
              <div class="panel-label">Driver's handbook</div>
              <h2>Controls & technique</h2>
            </div>
            <button class="icon-button" data-ui="close-help" aria-label="Close help">×</button>
          </div>
          <div class="help-content"></div>
        </div>
      </section>
    `;
    }

    private bindStaticEvents(): void {
        this.query('[data-ui="pause"]').addEventListener("click", () => this.openPause("drive"));
        this.query('[data-ui="close-telemetry"]').addEventListener("click", () =>
            this.setTelemetryVisible(false),
        );
        this.query('[data-ui="export"]').addEventListener("click", () =>
            this.callbacks.onExportTelemetry(),
        );
        this.telemetryReplayButton.addEventListener("click", () => {
            if (this.telemetryReplayButton.textContent === "Stop replay")
                this.callbacks.onStopReplay();
            else this.callbacks.onReplay();
        });
        this.query('[data-ui="close-help"]').addEventListener("click", () => this.closeHelp());
        this.query('[data-ui="help-start"]').addEventListener("click", () => this.openHelp());
        this.startOverlay.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-ui="start"]')) {
                this.callbacks.onStart(this.selectedScenario);
            }
        });
        this.pauseOverlay.addEventListener("click", (event) => {
            if ((event.target as HTMLElement).classList.contains("pause-overlay"))
                this.closePause();
        });
        this.helpOverlay.addEventListener("click", (event) => {
            if ((event.target as HTMLElement).classList.contains("help-overlay")) this.closeHelp();
        });
        this.tabs.addEventListener("click", (event) => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
            if (!button) return;
            this.activeTab = button.dataset.tab as PauseTab;
            this.renderPauseTab();
        });
    }

    private renderStartScenarios(): void {
        const container = this.query(".scenario-grid");
        container.innerHTML = "";
        for (const scenario of this.scenarios) {
            const button = document.createElement("button");
            button.className = "scenario-option";
            button.dataset.scenarioCard = scenario.id;
            button.innerHTML = `<span class="scenario-option-title"></span><span class="scenario-option-description"></span>`;
            button.querySelector(".scenario-option-title")!.textContent = scenario.title;
            button.querySelector(".scenario-option-description")!.textContent =
                scenario.description;
            button.addEventListener("click", () => this.setScenarioSelection(scenario.id));
            container.append(button);
        }
        this.setScenarioSelection(this.selectedScenario);
    }

    private renderScenario(data: UIUpdate): void {
        const info = data.scenario;
        if (info.id !== this.lastScenarioId) {
            this.lastScenarioId = info.id;
            this.scenarioTitle.textContent = info.title;
            this.scenarioDescription.textContent = info.description;
            this.scenarioSteps.innerHTML = "";
            for (const instruction of info.instructions) {
                const item = document.createElement("li");
                item.textContent = instruction;
                this.scenarioSteps.append(item);
            }
        }
        this.scenarioStatus.textContent = sentenceCase(info.status);
        this.scenarioStatus.className = `scenario-status status-${info.status}`;
        this.scenarioMessage.textContent = info.message || "Objective in progress.";
        this.scenarioProgress.style.width = `${Math.round(Math.min(1, Math.max(0, info.progress)) * 100)}%`;
        this.scenarioElapsed.textContent = formatTime(info.elapsedS);
    }

    private renderHud(data: UIUpdate): void {
        const state = data.state;
        this.cameraLabel.textContent = `${data.cameraLabel}, ${data.headlights ? "lights on" : "lights off"}, wipers ${data.wipers}`;
        this.hud.classList.toggle("view-exterior", data.cameraLabel !== "Cockpit");
        const lights: Array<[string, boolean, string]> = [
            ["Ign", state.ignition, state.ignition ? "on" : "off"],
            ["Oil", state.engineRunning, state.engineRunning ? "ok" : "warn"],
            ["Brake", state.handbrake, state.handbrake ? "warn" : "off"],
            [
                "Hot",
                state.clutchTemperatureC > 300,
                state.clutchTemperatureC > 300 ? "warn" : "off",
            ],
            ["Fuel", state.fuelCut, state.fuelCut ? "warn" : "off"],
        ];
        this.statusLights.innerHTML = lights
            .map(
                ([label, active, cls]) =>
                    `<span class="light light-${active ? cls : "off"}">${label}</span>`,
            )
            .join("");

        const warnings: string[] = [];
        if (!state.engineRunning && !state.cranking) warnings.push("Engine off");
        if (state.cranking) warnings.push("Cranking");
        if (state.fuelCut) warnings.push("Rev limiter");
        if (state.clutchTemperatureC > 320) warnings.push("Clutch hot");
        if (state.wheelLocked) warnings.push("Wheel lock");
        if (state.clutchMode === "slipping" && state.clutchEngagement > 0.6 && state.speedMps < 1.5)
            warnings.push("Bite point");
        if (state.slopeForward > 0.02 && state.pose.vx < -0.2) warnings.push("Rolling back");
        if (state.gear === 0 && state.speedMps > 0.5) warnings.push("Neutral");
        if (this.settings.speedLimiterEnabled && state.speedKph > 198)
            warnings.push("Speed limiter");
        this.warnings.textContent = warnings.join(", ");
        this.warnings.classList.toggle("visible", warnings.length > 0);

        this.prompt.textContent = this.promptFor(state);
        const instruments = this.query(".exterior-instruments");
        instruments.classList.toggle(
            "shift-ready",
            state.rpm > 5700 && state.gear > 0 && state.gear < 6,
        );
        this.query("[data-exterior-speed]").textContent = this.speedValue(state.speedKph).toFixed(
            0,
        );
        this.query("[data-exterior-unit]").textContent = this.speedUnit;
        this.query("[data-exterior-gear]").textContent = state.gearLabel;
        this.query("[data-exterior-rpm]").textContent = `${state.rpm.toFixed(0)} rpm`;
        for (const [name, value] of [
            ["revs", state.rpm / 7000],
            ["clutch", state.clutchPedal],
            ["throttle", state.throttle],
            ["brake", state.brake],
        ] as const) {
            this.query(`[data-exterior-${name}]`).style.transform =
                `scaleX(${Math.max(0, Math.min(1, value))})`;
        }
        this.liveStatus.textContent = `${state.gearLabel}, ${this.speedValue(state.speedKph).toFixed(0)} ${this.speedUnit}, ${state.engineRunning ? "running" : "engine off"}`;
        const fps = Number.isFinite(data.fps) ? data.fps : 0;
        const fpsElement = this.root.querySelector<HTMLElement>('[data-diag="fps"]');
        const stepElement = this.root.querySelector<HTMLElement>('[data-diag="step"]');
        const cpuElement = this.root.querySelector<HTMLElement>('[data-diag="cpu"]');
        if (fpsElement) {
            fpsElement.hidden = !this.settings.showFps;
            fpsElement.textContent = `${fps.toFixed(0)} FPS`;
        }
        if (stepElement) stepElement.textContent = `${data.clock.stepsLastFrame} steps`;
        if (cpuElement) cpuElement.textContent = `${data.physicsMs.toFixed(2)} ms`;
        const diagChip = this.root.querySelector<HTMLElement>("[data-diagnostics]");
        if (diagChip) diagChip.hidden = !this.settings.showDiagnostics && !this.settings.showFps;
    }

    private renderInstructor(data: UIUpdate): void {
        const panel = this.query(".instructor-panel");
        panel.hidden = !data.instructorEnabled || data.instructorMessages.length === 0;
        const signature = data.instructorMessages
            .map((message) => `${message.text}-${message.kind}`)
            .join("|");
        if (signature === this.lastInstructorSignature) return;
        this.lastInstructorSignature = signature;
        this.instructorList.innerHTML = "";
        for (const message of data.instructorMessages.slice(-3)) {
            const item = document.createElement("div");
            item.className = `instructor-message message-${message.kind}`;
            item.textContent = message.text;
            this.instructorList.append(item);
        }
    }

    private renderTelemetry(data: UIUpdate): void {
        if (!this.telemetryOpen) return;
        const now = performance.now();
        if (now - this.lastTelemetryDraw < 90) return;
        this.lastTelemetryDraw = now;
        const samples = data.telemetrySamples.slice(-400);
        const canvas = this.telemetryCanvas;
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (
            canvas.width !== Math.round(rect.width * dpr) ||
            canvas.height !== Math.round(rect.height * dpr)
        ) {
            canvas.width = Math.max(1, Math.round(rect.width * dpr));
            canvas.height = Math.max(1, Math.round(rect.height * dpr));
        }
        const context = canvas.getContext("2d");
        if (!context) return;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, rect.width, rect.height);
        context.fillStyle = "rgba(255,255,255,0.02)";
        context.fillRect(0, 0, rect.width, rect.height);
        context.strokeStyle = "rgba(255,255,255,0.06)";
        context.lineWidth = 1;
        for (let line = 0; line <= 4; line += 1) {
            const y = (rect.height / 4) * line;
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(rect.width, y);
            context.stroke();
        }
        if (samples.length > 1) {
            const maxSpeed = Math.max(...samples.map((sample) => sample.speedMps * 3.6), 40);
            const maxSlip = Math.max(
                ...samples.map((sample) => Math.abs(sample.clutchSlipRadPerSec)),
                20,
            );
            const drawLine = (
                value: (sample: TelemetrySample) => number,
                color: string,
                width: number,
            ): void => {
                context.beginPath();
                samples.forEach((sample, index) => {
                    const x = (index / (samples.length - 1)) * rect.width;
                    const y =
                        rect.height -
                        Math.max(0, Math.min(1, value(sample))) * (rect.height - 8) -
                        4;
                    if (index === 0) context.moveTo(x, y);
                    else context.lineTo(x, y);
                });
                context.strokeStyle = color;
                context.lineWidth = width;
                context.stroke();
            };
            drawLine((sample) => (sample.speedMps * 3.6) / maxSpeed, "#e8e6df", 1.6);
            drawLine((sample) => sample.engineRpm / 7000, "#e8b04b", 1.6);
            drawLine((sample) => Math.abs(sample.clutchSlipRadPerSec) / maxSlip, "#e05b4b", 1.2);
        }
        const latest = samples[samples.length - 1];
        if (latest) {
            const surface = latest.surfaceMu < 0.8 ? "wet" : "dry";
            this.telemetryStats.innerHTML = `
        <div><span>Speed</span><b>${this.speedValue(latest.speedMps * 3.6).toFixed(0)} ${this.speedUnit}</b></div>
        <div><span>RPM</span><b>${latest.engineRpm.toFixed(0)}</b></div>
        <div><span>Gear</span><b>${latest.gear === -1 ? "R" : latest.gear === 0 ? "N" : latest.gear}</b></div>
        <div><span>Clutch</span><b>${latest.clutchTempC.toFixed(0)} °C</b></div>
        <div><span>Slip</span><b>${Math.abs(latest.clutchSlipRadPerSec).toFixed(0)} rad/s</b></div>
        <div><span>Surface</span><b>${surface}</b></div>
      `;
        }
        this.telemetryReplayButton.textContent = data.replaying
            ? "Stop replay"
            : "Replay last 20 s";
    }

    private renderPauseTab(): void {
        if (!this.pauseOpen) return;
        this.tabs.innerHTML = (Object.keys(TAB_LABELS) as PauseTab[])
            .map(
                (tab) =>
                    `<button class="pause-tab ${tab === this.activeTab ? "active" : ""}" data-tab="${tab}">${TAB_LABELS[tab]}</button>`,
            )
            .join("");

        if (this.activeTab === "drive") this.renderDriveTab();
        else if (this.activeTab === "lessons") this.renderLessonsTab();
        else if (this.activeTab === "controls") this.renderControlsTab();
        else if (this.activeTab === "settings") this.renderSettingsTab();
        else if (this.activeTab === "input") this.renderInputTab(true);
        else this.renderDiagnosticsTab(true);
    }

    private renderDriveTab(): void {
        this.pauseContent.innerHTML = `
      <div class="content-heading">
        <div>
          <div class="panel-label">Session</div>
          <h3>Ready when you are</h3>
        </div>
        <button class="button primary" data-ui="resume">Resume driving</button>
      </div>
      <div class="pause-grid">
        <div class="pause-card">
          <div class="panel-label">Current session</div>
          <div class="pause-scenario-title"></div>
          <div class="pause-scenario-description"></div>
          <div class="button-row">
            <button class="button secondary" data-ui="restart">Restart session</button>
            <button class="button ghost" data-ui="recovery">Recover vehicle</button>
          </div>
        </div>
        <div class="pause-card">
          <div class="panel-label">Cheat sheet</div>
          <ul class="shortcut-list">
            <li><span>Clutch</span><b>${this.callbacks.getBindingLabel("clutchDepress")} / ${this.callbacks.getBindingLabel("clutchRelease")}</b></li>
            <li><span>Gear lever</span><b>${this.callbacks.getBindingLabel("grabLever")} + arrows</b></li>
            <li><span>Handbrake</span><b>${this.callbacks.getBindingLabel("handbrake")}</b></li>
            <li><span>Camera</span><b>${this.callbacks.getBindingLabel("camera")}</b></li>
            <li><span>Telemetry</span><b>${this.callbacks.getBindingLabel("telemetry")}</b></li>
          </ul>
        </div>
      </div>
      <div class="button-row top-gap">
        <button class="button secondary" data-ui="camera">Cycle camera</button>
        <button class="button ghost" data-ui="help">Open driver's handbook</button>
      </div>
    `;
        const scenario = this.scenarios.find((item) => item.id === this.lastScenarioId);
        if (scenario) {
            this.pauseContent.querySelector(".pause-scenario-title")!.textContent = scenario.title;
            this.pauseContent.querySelector(".pause-scenario-description")!.textContent =
                scenario.description;
        }
        this.pauseContent
            .querySelector('[data-ui="resume"]')
            ?.addEventListener("click", () => this.closePause());
        this.pauseContent.querySelector('[data-ui="restart"]')?.addEventListener("click", () => {
            this.closePause();
            this.callbacks.onRestart();
        });
        this.pauseContent.querySelector('[data-ui="recovery"]')?.addEventListener("click", () => {
            this.closePause();
            this.callbacks.onRecovery();
        });
        this.pauseContent
            .querySelector('[data-ui="camera"]')
            ?.addEventListener("click", () => this.callbacks.onCamera());
        this.pauseContent
            .querySelector('[data-ui="help"]')
            ?.addEventListener("click", () => this.openHelp());
    }

    private renderLessonsTab(): void {
        this.pauseContent.innerHTML = `
      <div class="content-heading">
        <div>
          <div class="panel-label">Training programme</div>
          <h3>Choose a lesson</h3>
        </div>
      </div>
      <div class="lesson-list"></div>
    `;
        const list = this.pauseContent.querySelector(".lesson-list")!;
        for (const scenario of this.scenarios) {
            const card = document.createElement("div");
            card.className = "lesson-card";
            card.innerHTML = `
        <div>
          <div class="lesson-title"></div>
          <div class="lesson-description"></div>
        </div>
        <button class="button secondary">Start</button>
      `;
            card.querySelector(".lesson-title")!.textContent = scenario.title;
            card.querySelector(".lesson-description")!.textContent = scenario.description;
            card.querySelector("button")!.addEventListener("click", () => {
                this.closePause();
                this.setScenarioSelection(scenario.id);
                this.callbacks.onScenario(scenario.id);
            });
            list.append(card);
        }
    }

    private renderControlsTab(): void {
        this.pauseContent.innerHTML = `
      <div class="content-heading">
        <div>
          <div class="panel-label">Keyboard</div>
          <h3>Bindings</h3>
          <p class="muted">Default bindings use physical key codes, so WASD stays in the same place on every layout. Click a binding to replace it.</p>
        </div>
        <button class="button ghost" data-ui="reset-bindings">Reset defaults</button>
      </div>
      <div class="binding-list"></div>
      <div class="rebind-status"></div>
      <p class="fine-print">Escape cancels a rebind. Duplicate bindings are rejected so two actions cannot fight over one key.</p>
    `;
        const list = this.pauseContent.querySelector<HTMLElement>(".binding-list")!;
        const status = this.pauseContent.querySelector<HTMLElement>(".rebind-status");
        this.populateBindingList(list, status, () => this.renderControlsTab());
        this.pauseContent
            .querySelector('[data-ui="reset-bindings"]')
            ?.addEventListener("click", () => {
                this.callbacks.onResetBindings();
                this.renderControlsTab();
            });
    }

    private populateBindingList(
        list: HTMLElement,
        status: HTMLElement | null,
        onBound: () => void,
    ): void {
        list.innerHTML = "";
        for (const action of INPUT_ACTIONS) {
            const row = document.createElement("div");
            row.className = "binding-row";
            row.innerHTML = `<span>${ACTION_LABELS[action]}</span><button type="button" class="key-chip"></button>`;
            const button = row.querySelector("button")!;
            button.textContent = this.callbacks.getBindingLabel(action);
            button.addEventListener("click", async () => {
                button.textContent = "Press a key…";
                button.classList.add("capturing");
                const result = await this.callbacks.onRebind(action);
                button.classList.remove("capturing");
                if (result.ok && result.code) {
                    if (status)
                        status.textContent = `${ACTION_LABELS[action]} bound to ${formatKeyCode(result.code)}.`;
                    onBound();
                } else if (result.error) {
                    if (status) {
                        status.textContent = result.error;
                        status.classList.add("error");
                    }
                    button.textContent = this.callbacks.getBindingLabel(action);
                }
            });
            list.append(row);
        }
    }

    private renderSettingsTab(): void {
        const nav = SETTINGS_SECTIONS.map(
            (section) =>
                `<button type="button" class="settings-nav-button" data-section-target="${section.id}">${section.title}</button>`,
        ).join("");
        const body = SETTINGS_SECTIONS.map((section) => this.renderSettingsSection(section)).join(
            "",
        );
        this.pauseContent.innerHTML = `
      <div class="content-heading">
        <div>
          <div class="panel-label">Preferences</div>
          <h3>Settings</h3>
          <p class="muted">Changes save as you make them. Each section can be reset on its own.</p>
        </div>
      </div>
      <nav class="settings-nav" aria-label="Settings sections">${nav}</nav>
      <div class="settings-grid">${body}</div>
      <p class="settings-status" data-settings-status role="status" aria-live="polite"></p>
    `;
        this.bindSettingsEvents();
        this.renderSettingsNotice();
    }

    private renderSettingsSection(section: SettingsSection): string {
        const controls = section.controls.map((control) => this.renderSettingRow(control)).join("");
        const reset =
            section.id === "data"
                ? ""
                : `<div class="section-toolbar"><button type="button" class="button ghost button-small" data-reset-section="${section.id}" aria-label="Reset ${section.title.toLowerCase()} settings">Reset section</button></div>`;
        const bindings = section.id === "controls" ? this.renderSettingsBindings() : "";
        const data = section.id === "data" ? this.renderSettingsData() : "";
        return `<fieldset class="settings-section" id="settings-${section.id}">
      <legend>${section.title}</legend>
      ${reset}
      <div class="settings-section-body">${controls}${bindings}${data}</div>
    </fieldset>`;
    }

    private renderSettingRow(control: SettingControl): string {
        const id = `setting-${control.key}`;
        const helpId = `${id}-help`;
        const value = this.settings[control.key];
        if (control.kind === "range") {
            const numeric = typeof value === "number" ? value : control.min;
            return `<div class="setting-row">
        <div class="setting-copy">
          <label for="${id}">${control.label}</label>
          <p class="setting-help" id="${helpId}">${control.help}</p>
        </div>
        <div class="setting-control">
          <input id="${id}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${numeric}" data-setting="${control.key}" aria-describedby="${helpId}">
          <span class="setting-value"><b>${control.format(numeric)}</b> <span class="setting-unit">${control.unit}</span></span>
        </div>
      </div>`;
        }
        if (control.kind === "toggle") {
            return `<div class="setting-row">
        <div class="setting-copy">
          <label for="${id}">${control.label}</label>
          <p class="setting-help" id="${helpId}">${control.help}</p>
        </div>
        <div class="setting-control setting-control-toggle">
          <input id="${id}" type="checkbox" ${value === true ? "checked" : ""} data-setting="${control.key}" aria-describedby="${helpId}">
        </div>
      </div>`;
        }
        const current = String(value ?? "");
        const options = control.options
            .map(
                (option) =>
                    `<option value="${option.value}" ${option.value === current ? "selected" : ""}>${option.label}</option>`,
            )
            .join("");
        return `<div class="setting-row">
        <div class="setting-copy">
          <label for="${id}">${control.label}</label>
          <p class="setting-help" id="${helpId}">${control.help}</p>
        </div>
        <div class="setting-control">
          <select id="${id}" data-setting="${control.key}" aria-describedby="${helpId}">${options}</select>
        </div>
      </div>`;
    }

    private renderSettingsBindings(): string {
        return `<div class="settings-subsection settings-bindings">
      <h4 class="settings-subtitle">Keyboard bindings</h4>
      <p class="setting-help" id="settings-bindings-help">Default bindings use physical key codes, so WASD stays in the same place on every layout. Activate a binding to replace it.</p>
      <div class="binding-list" aria-describedby="settings-bindings-help"></div>
      <div class="rebind-status" role="status" aria-live="polite"></div>
      <div class="button-row">
        <button type="button" class="button ghost button-small" data-ui="reset-bindings">Reset bindings</button>
      </div>
    </div>`;
    }

    private renderSettingsData(): string {
        return `<div class="settings-subsection">
      <h4 class="settings-subtitle">Configuration file</h4>
      <p class="setting-help">Export your settings as JSON, import a saved file, or return every section to its defaults.</p>
      <div class="button-row">
        <button type="button" class="button secondary" data-ui="export-settings">Export settings</button>
        <button type="button" class="button secondary" data-ui="import-settings">Import settings</button>
        <button type="button" class="button ghost" data-ui="reset-all">Reset all</button>
      </div>
      <input type="file" accept="application/json,.json" hidden data-settings-import>
    </div>`;
    }

    private bindSettingsEvents(): void {
        const content = this.pauseContent;
        content
            .querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]")
            .forEach((input) => {
                const key = input.dataset.setting as SettingKey;
                const control = findSettingControl(key);
                if (input instanceof HTMLInputElement && input.type === "range") {
                    const display =
                        input.parentElement?.querySelector<HTMLElement>(".setting-value b");
                    input.addEventListener("input", () => {
                        if (display && control?.kind === "range")
                            display.textContent = control.format(Number(input.value));
                    });
                }
                input.addEventListener("change", () => {
                    const value: unknown =
                        input instanceof HTMLInputElement && input.type === "checkbox"
                            ? input.checked
                            : input instanceof HTMLInputElement && input.type === "range"
                              ? Number(input.value)
                              : input.value;
                    this.callbacks.onSettings({ [key]: value } as Partial<UserSettings>);
                    if (key === "showTelemetry") this.setTelemetryVisible(Boolean(value), false);
                });
            });

        content.querySelectorAll<HTMLButtonElement>("[data-section-target]").forEach((button) => {
            button.addEventListener("click", () => {
                const target = document.getElementById(`settings-${button.dataset.sectionTarget}`);
                target?.scrollIntoView({
                    block: "start",
                    behavior: this.settings.reducedMotion ? "auto" : "smooth",
                });
                content
                    .querySelectorAll("[data-section-target]")
                    .forEach((item) => item.removeAttribute("aria-current"));
                button.setAttribute("aria-current", "true");
            });
        });

        content.querySelectorAll<HTMLButtonElement>("[data-reset-section]").forEach((button) => {
            button.addEventListener("click", () => {
                const section = SETTINGS_SECTIONS.find(
                    (item) => item.id === button.dataset.resetSection,
                );
                if (!section) return;
                this.settingsNotice = `${section.title} reset to defaults.`;
                this.settingsNoticeError = false;
                if (section.id === "controls") this.callbacks.onResetBindings();
                if (section.controls.length > 0) {
                    const partial: Record<string, unknown> = {};
                    for (const control of section.controls)
                        partial[control.key] = DEFAULT_SETTINGS[control.key];
                    this.applySettingsDefaults(partial as Partial<UserSettings>);
                }
                this.renderSettingsNotice();
            });
        });

        const bindingList = content.querySelector<HTMLElement>(".settings-bindings .binding-list");
        const bindingStatus = content.querySelector<HTMLElement>(
            ".settings-bindings .rebind-status",
        );
        if (bindingList)
            this.populateBindingList(bindingList, bindingStatus, () => this.renderSettingsTab());

        content.querySelector('[data-ui="reset-bindings"]')?.addEventListener("click", () => {
            this.callbacks.onResetBindings();
            this.renderSettingsTab();
        });
        content
            .querySelector('[data-ui="export-settings"]')
            ?.addEventListener("click", () => this.exportSettingsFile());
        content
            .querySelector('[data-ui="import-settings"]')
            ?.addEventListener("click", () =>
                content.querySelector<HTMLInputElement>("[data-settings-import]")?.click(),
            );
        content
            .querySelector<HTMLInputElement>("[data-settings-import]")
            ?.addEventListener("change", (event) => this.importSettingsFile(event));
        content.querySelector('[data-ui="reset-all"]')?.addEventListener("click", () => {
            this.settingsNotice = "All settings reset to defaults.";
            this.settingsNoticeError = false;
            this.applySettingsDefaults({ ...DEFAULT_SETTINGS } as Partial<UserSettings>);
            this.renderSettingsNotice();
        });
    }

    private applySettingsDefaults(partial: Partial<UserSettings>): void {
        const rest = { ...partial };
        if (rest.quality !== undefined) {
            this.callbacks.onSettings({ quality: rest.quality });
            delete rest.quality;
        }
        this.callbacks.onSettings(rest);
    }

    private exportSettingsFile(): void {
        const blob = new Blob([exportSettings(this.settings)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "bite-point-settings.json";
        anchor.click();
        URL.revokeObjectURL(url);
        this.settingsNotice = "Settings exported.";
        this.settingsNoticeError = false;
        this.renderSettingsNotice();
    }

    private importSettingsFile(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        void file.text().then((text) => {
            try {
                const imported = importSettings(text);
                this.settingsNotice = "Settings imported.";
                this.settingsNoticeError = false;
                this.callbacks.onSettings(imported);
            } catch {
                this.settingsNotice = "That file is not a valid settings export.";
                this.settingsNoticeError = true;
                this.renderSettingsNotice();
            } finally {
                input.value = "";
            }
        });
    }

    private renderSettingsNotice(): void {
        const element = this.pauseContent.querySelector<HTMLElement>("[data-settings-status]");
        if (!element) return;
        element.textContent = this.settingsNotice;
        element.classList.toggle("error", this.settingsNoticeError);
    }

    private renderInputTab(force = false): void {
        if (!force && !this.pauseOpen) return;
        this.inputTestPanel.innerHTML = `
      <div class="content-heading">
        <div>
          <div class="panel-label">Input tester</div>
          <h3>Every key, live</h3>
          <p class="muted">Press keys to verify your keyboard. If several keys held at once disappear, your keyboard's rollover limit is the cause.</p>
        </div>
      </div>
      <div class="input-live-grid">
        <div class="pause-card">
          <div class="panel-label">Held keys</div>
          <div class="held-keys">None</div>
          <div class="panel-label top-gap">Held actions</div>
          <div class="held-actions">None</div>
        </div>
        <div class="pause-card">
          <div class="panel-label">Gamepad / wheel</div>
          <div class="gamepad-info">No controller detected.</div>
        </div>
      </div>
      <p class="fine-print">Keyboard bindings use physical key codes. Axis calibration includes a deadzone and response curves for analog hardware.</p>
    `;
    }

    private renderDiagnosticsTab(force = false): void {
        if (!force && !this.pauseOpen) return;
        this.diagnosticsPanel.innerHTML = `
      <div class="content-heading">
        <div>
          <div class="panel-label">Diagnostics</div>
          <h3>Measured, not guessed</h3>
        </div>
      </div>
      <div class="diagnostics-grid"></div>
    `;
    }

    private renderPauseDynamic(data: UIUpdate): void {
        if (!this.pauseOpen) return;
        if (this.activeTab === "input") {
            const heldKeys = this.inputTestPanel.querySelector(".held-keys");
            const heldActions = this.inputTestPanel.querySelector(".held-actions");
            const gamepad = this.inputTestPanel.querySelector(".gamepad-info");
            if (heldKeys) {
                heldKeys.textContent =
                    data.inputDiagnostics.pressedCodes.length > 0
                        ? data.inputDiagnostics.pressedCodes
                              .map((code) => formatKeyCode(code))
                              .join(", ")
                        : "None";
            }
            if (heldActions) {
                heldActions.textContent =
                    data.inputDiagnostics.heldActions.length > 0
                        ? data.inputDiagnostics.heldActions
                              .map((action) => ACTION_LABELS[action])
                              .join(", ")
                        : "None";
                if (data.inputDiagnostics.pressedCodes.length > 5) {
                    heldActions.textContent += "  —  many keys held; rollover may limit detection.";
                }
            }
            if (gamepad) {
                const pad = data.inputDiagnostics.gamepad;
                gamepad.textContent = pad.connected
                    ? `${pad.id}${pad.isWheel ? " (wheel mode)" : ""}, steer ${pad.steerAxis.toFixed(2)}, throttle ${pad.throttleAxis.toFixed(2)}, brake ${pad.brakeAxis.toFixed(2)}`
                    : "No controller detected.";
            }
        }
        if (this.activeTab === "diagnostics") {
            const grid = this.diagnosticsPanel.querySelector(".diagnostics-grid");
            if (grid) {
                const entries: Array<[string, string]> = [
                    ["Frame rate", `${data.fps.toFixed(1)} FPS`],
                    ["Physics step", "4.00 ms fixed (250 Hz)"],
                    ["Physics cost / frame", `${data.physicsMs.toFixed(2)} ms`],
                    ["Steps last frame", String(data.clock.stepsLastFrame)],
                    ["Interpolation alpha", data.clock.alpha.toFixed(2)],
                    ["Overload", data.clock.overloaded ? "Yes — catch-up capped" : "No"],
                    ["Dropped time", `${data.clock.droppedTimeS.toFixed(3)} s`],
                    ["Solver mode", data.state.clutchMode],
                    ["Clutch capacity", `${data.state.clutchCapacityNm.toFixed(0)} Nm`],
                    ["Clutch temp", `${data.state.clutchTemperatureC.toFixed(0)} °C`],
                    [
                        "Wheel loads",
                        data.state.wheels
                            .map((wheel) => `${(wheel.normalLoadN / 1000).toFixed(1)}k`)
                            .join(" / ") + " N",
                    ],
                    ["Surface mu", data.state.sessionSurfaceMu.toFixed(2)],
                    ["Slope", `${(Math.tan(data.state.slopeForward) * 100).toFixed(1)}%`],
                    ["Camera", data.cameraLabel],
                    ["Renderer", data.rendererMode],
                ];
                grid.innerHTML = entries
                    .map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`)
                    .join("");
            }
        }
    }

    private renderHelp(): void {
        const bindings = INPUT_ACTIONS.map(
            (action) =>
                `<li><span>${ACTION_LABELS[action]}</span><b>${this.callbacks.getBindingLabel(action)}</b></li>`,
        ).join("");
        this.helpContent.innerHTML = `
      <div class="help-columns">
        <div>
          <div class="panel-label">Driving controls</div>
          <ul class="shortcut-list">${bindings}</ul>
        </div>
        <div>
          <div class="panel-label">The H-pattern</div>
          <div class="h-pattern-help">
            <div><b>1</b><span>left, forward</span><b>2</b><span>left, rear</span></div>
            <div><b>3</b><span>centre, forward</span><b>4</b><span>centre, rear</span></div>
            <div><b>5</b><span>right, forward</span><b>6</b><span>right, rear</span></div>
          </div>
          <ol class="help-steps">
            <li>Press Enter to grab the lever. The HUD highlights it.</li>
            <li>Use one arrow key per segment. Neutral is the horizontal corridor.</li>
            <li>Press Enter to release and attempt engagement.</li>
            <li>The synchronizer and reverse lockout decide whether the gear engages.</li>
          </ol>
          <div class="panel-label">Moving off</div>
          <p class="help-copy">Press Z to depress the clutch, select first, then release X slowly. At the bite point the car begins to creep. Add a little throttle, hold the bite, then release fully. Too fast a release stalls the engine; too much throttle while slipping heats the clutch.</p>
          <div class="panel-label">Hill start</div>
          <p class="help-copy">Hold the foot brake or handbrake. Bring the clutch to its bite point until you feel the drivetrain load, then release the brake and add throttle. The simulation has no hidden anti-rollback assist: gravity is real.</p>
          <p class="fine-print">Window focus loss releases the throttle and brake, depresses the clutch and applies the handbrake. The simulation pauses when the tab is hidden.</p>
        </div>
      </div>
    `;
    }

    private promptFor(state: VehicleRenderState): string {
        const key = (action: InputAction): string => this.callbacks.getBindingLabel(action);
        if (
            state.engineRunning &&
            state.gear > 0 &&
            state.gear < 6 &&
            state.rpm > 5700 &&
            state.clutchPedal < 0.2
        ) {
            return `Shift up: lift ${key("accelerator")}, depress ${key("clutchDepress")}, select ${state.gear + 1}, then release ${key("clutchRelease")}.`;
        }
        if (
            state.engineRunning &&
            state.gear > 1 &&
            state.rpm < 1400 &&
            state.throttle > 0.4 &&
            state.clutchPedal < 0.2
        ) {
            return "Engine is labouring. Depress the clutch and select a lower gear before accelerating.";
        }
        if (!state.ignition)
            return "Press I to switch on the ignition, then hold K to start the engine.";
        if (!state.engineRunning && !state.cranking)
            return "Hold K to crank the starter. Keep the clutch depressed with Z.";
        if (state.shifterGrabbed)
            return "Arrow keys move the lever, Enter releases and engages, Esc cancels.";
        if (state.gear === 0 && state.engineRunning)
            return "Enter grabs the lever. Arrows move through the gate; press Enter again to engage.";
        if (state.gear > 0 && state.speedMps < 0.2 && state.clutchPedal > 0.45)
            return "Find the bite point: release X slowly until the car creeps, then add a little W.";
        if (state.clutchMode === "slipping")
            return "Clutch is slipping. Hold the bite point briefly, then release X fully as the car moves.";
        if (state.slopeForward > 0.02 && state.pose.vx < -0.1)
            return "Rolling back. More clutch bite or hold the brake. Gravity is doing its job.";
        if (state.gear === 0 && state.speedMps > 0.5)
            return "Neutral while rolling. Select a gear or brake to a stop.";
        return "Z clutch, X release, Space handbrake, C camera, Tab telemetry, F1 help.";
    }
}

function findSettingControl(key: string): SettingControl | undefined {
    for (const section of SETTINGS_SECTIONS) {
        const control = section.controls.find((item) => item.key === key);
        if (control) return control;
    }
    return undefined;
}

function sentenceCase(value: string): string {
    return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function formatTime(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(whole / 60);
    const remainder = whole % 60;
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export type { PauseTab };
