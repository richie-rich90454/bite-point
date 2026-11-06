import type { InputAction } from "../input/bindings";
import type { InputDiagnostics, RebindResult } from "../input/InputService";
import type { UserSettings } from "../settings/SettingsRepository";
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

export class AppUI {
  startOpen = true;
  pauseOpen = false;
  helpOpen = false;
  telemetryOpen = false;
  private activeTab: PauseTab = "drive";
  private selectedScenario = "free-drive";
  private readonly dashboard: DashboardPresenter;
  private readonly root: HTMLElement;
  private readonly callbacks: AppUICallbacks;
  private settings: UserSettings;
  private readonly scenarios: ReadonlyArray<ScenarioDefinition>;
  private lastScenarioId = "";
  private lastInstructorSignature = "";
  private lastTelemetryDraw = 0;

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
    this.dashboard = new DashboardPresenter(this.dashboardCanvas);

    this.bindStaticEvents();
    this.renderStartScenarios();
    this.renderHelp();
    this.setTelemetryVisible(settings.showTelemetry, false);
    this.updateSettings(settings);
  }

  updateSettings(settings: UserSettings): void {
    this.settings = settings;
    if (this.pauseOpen && this.activeTab === "settings") this.renderPauseTab();
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
      if (data.cameraLabel !== "Exterior") this.dashboard.draw(data.state, data.state.shifterGrabbed);
      this.renderScenario(data);
      this.renderHud(data);
      this.renderInstructor(data);
      this.renderTelemetry(data);
      this.renderPauseDynamic(data);
    }
    this.telemetryReplayButton.textContent = data.replaying ? "Stop replay" : "Replay last 20 s";
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
            <span class="kicker">LESSON</span>
            <span class="scenario-status">RUNNING</span>
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
          <div class="panel-label">INSTRUCTOR</div>
          <div class="instructor-list"></div>
        </div>

        <div class="prompt panel">
          <div class="prompt-key">HINT</div>
          <div class="prompt-text">Press I to switch on the ignition, then hold K to start.</div>
        </div>

        <div class="dashboard-panel">
          <canvas id="dashboard-canvas" aria-label="Instrument cluster"></canvas>
        </div>
        <section class="exterior-instruments" aria-label="Driving instruments">
          <div class="exterior-speed"><b data-exterior-speed>0</b><span>km/h</span><strong data-exterior-gear>N</strong></div>
          <div class="exterior-rpm"><span data-exterior-revs></span></div>
          <div class="exterior-rev-label"><span data-exterior-rpm>0 rpm</span><b class="shift-cue">SHIFT ↑</b></div>
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
            <div class="panel-label">TELEMETRY</div>
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
            <p class="eyebrow">MANUAL TRANSMISSION SIMULATOR</p>
            <h1>BITE<br><em>POINT</em></h1>
            <p class="start-lead">Feel the bite. Nail the shift. Build from your first hill start to a 200 km/h run on the closed proving straight.</p>
            <div class="start-actions">
              <button class="button primary" data-ui="start">Start driving</button>
              <button class="button ghost" data-ui="help-start">Controls</button>
            </div>
            <div class="start-footnote">SIX SPEEDS · 250 HZ PHYSICS · 6 KM PROVING STRAIGHT</div>
          </div>
          <div class="start-select">
            <div class="panel-label">CHOOSE YOUR SESSION</div>
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
            <div class="panel-label">BITE POINT</div>
            <h2>Pit stop</h2>
            <div class="pause-tabs"></div>
            <div class="pause-side-footer">Esc resumes · F1 controls</div>
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
              <div class="panel-label">DRIVER'S HANDBOOK</div>
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
    this.query('[data-ui="close-telemetry"]').addEventListener("click", () => this.setTelemetryVisible(false));
    this.query('[data-ui="export"]').addEventListener("click", () => this.callbacks.onExportTelemetry());
    this.telemetryReplayButton.addEventListener("click", () => {
      if (this.telemetryReplayButton.textContent === "Stop replay") this.callbacks.onStopReplay();
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
      if ((event.target as HTMLElement).classList.contains("pause-overlay")) this.closePause();
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
      button.querySelector(".scenario-option-description")!.textContent = scenario.description;
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
    this.scenarioStatus.textContent = info.status.toUpperCase();
    this.scenarioStatus.className = `scenario-status status-${info.status}`;
    this.scenarioMessage.textContent = info.message || "Objective in progress.";
    this.scenarioProgress.style.width = `${Math.round(Math.min(1, Math.max(0, info.progress)) * 100)}%`;
    this.scenarioElapsed.textContent = formatTime(info.elapsedS);
  }

  private renderHud(data: UIUpdate): void {
    const state = data.state;
    this.cameraLabel.textContent = `${data.cameraLabel} · ${data.headlights ? "LIGHTS" : "LIGHTS OFF"} · WIPERS ${data.wipers}`;
    this.hud.classList.toggle("view-exterior", data.cameraLabel !== "Cockpit");
    const lights: Array<[string, boolean, string]> = [
      ["IGN", state.ignition, state.ignition ? "on" : "off"],
      ["OIL", state.engineRunning, state.engineRunning ? "ok" : "warn"],
      ["P", state.handbrake, state.handbrake ? "warn" : "off"],
      ["HOT", state.clutchTemperatureC > 300, state.clutchTemperatureC > 300 ? "warn" : "off"],
      ["FUEL", state.fuelCut, state.fuelCut ? "warn" : "off"],
    ];
    this.statusLights.innerHTML = lights
      .map(([label, active, cls]) => `<span class="light light-${active ? cls : "off"}">${label}</span>`)
      .join("");

    const warnings: string[] = [];
    if (!state.engineRunning && !state.cranking) warnings.push("ENGINE OFF");
    if (state.cranking) warnings.push("CRANKING");
    if (state.fuelCut) warnings.push("REV LIMITER");
    if (state.clutchTemperatureC > 320) warnings.push("CLUTCH HOT");
    if (state.wheelLocked) warnings.push("WHEEL LOCK");
    if (state.clutchMode === "slipping" && state.clutchEngagement > 0.6 && state.speedMps < 1.5) warnings.push("BITE POINT");
    if (state.slopeForward > 0.02 && state.pose.vx < -0.2) warnings.push("ROLLING BACK");
    if (state.gear === 0 && state.speedMps > 0.5) warnings.push("NEUTRAL");
    if (state.speedKph > 198) warnings.push("200 KM/H LIMITER");
    this.warnings.textContent = warnings.join("  ·  ");
    this.warnings.classList.toggle("visible", warnings.length > 0);

    this.prompt.textContent = this.promptFor(state);
    const instruments = this.query(".exterior-instruments");
    instruments.classList.toggle("shift-ready", state.rpm > 5700 && state.gear > 0 && state.gear < 6);
    this.query("[data-exterior-speed]").textContent = state.speedKph.toFixed(0);
    this.query("[data-exterior-gear]").textContent = state.gearLabel;
    this.query("[data-exterior-rpm]").textContent = `${state.rpm.toFixed(0)} rpm`;
    for (const [name, value] of [["revs", state.rpm / 7000], ["clutch", state.clutchPedal], ["throttle", state.throttle], ["brake", state.brake]] as const) {
      this.query(`[data-exterior-${name}]`).style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
    }
    this.liveStatus.textContent = `${state.gearLabel} · ${state.speedKph.toFixed(0)} km/h · ${state.engineRunning ? "RUNNING" : "ENGINE OFF"}`;
    const fps = Number.isFinite(data.fps) ? data.fps : 0;
    const fpsElement = this.root.querySelector('[data-diag="fps"]');
    const stepElement = this.root.querySelector('[data-diag="step"]');
    const cpuElement = this.root.querySelector('[data-diag="cpu"]');
    if (fpsElement) fpsElement.textContent = `${fps.toFixed(0)} FPS`;
    if (stepElement) stepElement.textContent = `${data.clock.stepsLastFrame} steps`;
    if (cpuElement) cpuElement.textContent = `${data.physicsMs.toFixed(2)} ms`;
    const diagChip = this.root.querySelector<HTMLElement>("[data-diagnostics]");
    if (diagChip) diagChip.hidden = !this.settings.showDiagnostics;
  }

  private renderInstructor(data: UIUpdate): void {
    const panel = this.query(".instructor-panel");
    panel.hidden = !data.instructorEnabled || data.instructorMessages.length === 0;
    const signature = data.instructorMessages.map((message) => `${message.text}-${message.kind}`).join("|");
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
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
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
      const maxSlip = Math.max(...samples.map((sample) => Math.abs(sample.clutchSlipRadPerSec)), 20);
      const drawLine = (value: (sample: TelemetrySample) => number, color: string, width: number): void => {
        context.beginPath();
        samples.forEach((sample, index) => {
          const x = (index / (samples.length - 1)) * rect.width;
          const y = rect.height - Math.max(0, Math.min(1, value(sample))) * (rect.height - 8) - 4;
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
        <div><span>Speed</span><b>${(latest.speedMps * 3.6).toFixed(0)} km/h</b></div>
        <div><span>RPM</span><b>${latest.engineRpm.toFixed(0)}</b></div>
        <div><span>Gear</span><b>${latest.gear === -1 ? "R" : latest.gear === 0 ? "N" : latest.gear}</b></div>
        <div><span>Clutch</span><b>${latest.clutchTempC.toFixed(0)} °C</b></div>
        <div><span>Slip</span><b>${Math.abs(latest.clutchSlipRadPerSec).toFixed(0)} rad/s</b></div>
        <div><span>Surface</span><b>${surface}</b></div>
      `;
    }
    this.telemetryReplayButton.textContent = data.replaying ? "Stop replay" : "Replay last 20 s";
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
          <div class="panel-label">SESSION</div>
          <h3>Ready when you are</h3>
        </div>
        <button class="button primary" data-ui="resume">Resume driving</button>
      </div>
      <div class="pause-grid">
        <div class="pause-card">
          <div class="panel-label">CURRENT SESSION</div>
          <div class="pause-scenario-title"></div>
          <div class="pause-scenario-description"></div>
          <div class="button-row">
            <button class="button secondary" data-ui="restart">Restart session</button>
            <button class="button ghost" data-ui="recovery">Recover vehicle</button>
          </div>
        </div>
        <div class="pause-card">
          <div class="panel-label">CHEAT SHEET</div>
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
      this.pauseContent.querySelector(".pause-scenario-description")!.textContent = scenario.description;
    }
    this.pauseContent.querySelector('[data-ui="resume"]')?.addEventListener("click", () => this.closePause());
    this.pauseContent.querySelector('[data-ui="restart"]')?.addEventListener("click", () => {
      this.closePause();
      this.callbacks.onRestart();
    });
    this.pauseContent.querySelector('[data-ui="recovery"]')?.addEventListener("click", () => {
      this.closePause();
      this.callbacks.onRecovery();
    });
    this.pauseContent.querySelector('[data-ui="camera"]')?.addEventListener("click", () => this.callbacks.onCamera());
    this.pauseContent.querySelector('[data-ui="help"]')?.addEventListener("click", () => this.openHelp());
  }

  private renderLessonsTab(): void {
    this.pauseContent.innerHTML = `
      <div class="content-heading">
        <div>
          <div class="panel-label">TRAINING PROGRAMME</div>
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
          <div class="panel-label">KEYBOARD</div>
          <h3>Bindings</h3>
          <p class="muted">Default bindings use physical key codes, so WASD stays in the same place on every layout. Click a binding to replace it.</p>
        </div>
        <button class="button ghost" data-ui="reset-bindings">Reset defaults</button>
      </div>
      <div class="binding-list"></div>
      <div class="rebind-status"></div>
      <p class="fine-print">Escape cancels a rebind. Duplicate bindings are rejected so two actions cannot fight over one key.</p>
    `;
    const list = this.pauseContent.querySelector(".binding-list")!;
    for (const action of INPUT_ACTIONS) {
      const row = document.createElement("div");
      row.className = "binding-row";
      row.innerHTML = `<span>${ACTION_LABELS[action]}</span><button class="key-chip"></button>`;
      const button = row.querySelector("button")!;
      button.textContent = this.callbacks.getBindingLabel(action);
      button.addEventListener("click", async () => {
        button.textContent = "Press a key…";
        button.classList.add("capturing");
        const result = await this.callbacks.onRebind(action);
        button.classList.remove("capturing");
        const status = this.pauseContent.querySelector<HTMLElement>(".rebind-status");
        if (result.ok && result.code) {
          if (status) status.textContent = `${ACTION_LABELS[action]} bound to ${formatKeyCode(result.code)}.`;
          this.renderControlsTab();
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
    this.pauseContent.querySelector('[data-ui="reset-bindings"]')?.addEventListener("click", () => {
      this.callbacks.onResetBindings();
      this.renderControlsTab();
    });
  }

  private renderSettingsTab(): void {
    const settings = this.settings;
    this.pauseContent.innerHTML = `
      <div class="content-heading">
        <div>
          <div class="panel-label">PREFERENCES</div>
          <h3>Settings</h3>
        </div>
      </div>
      <div class="settings-grid">
        <label class="setting-row"><span>Master volume</span><input type="range" min="0" max="1" step="0.05" value="${settings.masterVolume}" data-setting="masterVolume"><b>${Math.round(settings.masterVolume * 100)}%</b></label>
        <label class="setting-row"><span>Audio</span><input type="checkbox" ${settings.audioEnabled ? "checked" : ""} data-setting="audioEnabled"></label>
        <label class="setting-row"><span>Shadows</span><input type="checkbox" ${settings.shadows ? "checked" : ""} data-setting="shadows"></label>
        <label class="setting-row"><span>Graphics quality</span>
          <select data-setting="quality">
            <option value="low" ${settings.quality === "low" ? "selected" : ""}>Low</option>
            <option value="medium" ${settings.quality === "medium" ? "selected" : ""}>Medium</option>
            <option value="high" ${settings.quality === "high" ? "selected" : ""}>High</option>
          </select>
        </label>
        <label class="setting-row"><span>Render scale</span><input type="range" min="0.5" max="1.5" step="0.05" value="${settings.renderScale}" data-setting="renderScale"><b>${settings.renderScale.toFixed(2)}×</b></label>
        <label class="setting-row"><span>Field of view</span><input type="range" min="45" max="95" step="1" value="${settings.fovDegrees}" data-setting="fovDegrees"><b>${settings.fovDegrees}°</b></label>
        <label class="setting-row"><span>Instructor messages</span><input type="checkbox" ${settings.instructorEnabled ? "checked" : ""} data-setting="instructorEnabled"></label>
        <label class="setting-row"><span>Quick-select gears 1–6</span><input type="checkbox" ${settings.quickSelectMode ? "checked" : ""} data-setting="quickSelectMode"></label>
        <label class="setting-row"><span>Diagnostics chip</span><input type="checkbox" ${settings.showDiagnostics ? "checked" : ""} data-setting="showDiagnostics"></label>
      </div>
      <p class="fine-print">Quick-select is an accessibility option. It still obeys clutch and reverse-lockout rules; the H-pattern remains the default.</p>
    `;
    this.pauseContent.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]").forEach((input) => {
      input.addEventListener("change", () => {
        const name = input.dataset.setting as keyof UserSettings;
        let value: unknown = input.type === "checkbox" ? (input as HTMLInputElement).checked : input.value;
        if (input.type === "range") value = Number(input.value);
        this.callbacks.onSettings({ [name]: value });
        if (name === "renderScale" || name === "fovDegrees" || name === "masterVolume") {
          const display = input.parentElement?.querySelector("b");
          if (display) {
            const numeric = Number(value);
            display.textContent =
              name === "masterVolume" ? `${Math.round(numeric * 100)}%` : name === "fovDegrees" ? `${numeric}°` : `${numeric.toFixed(2)}×`;
          }
        }
      });
    });
  }

  private renderInputTab(force = false): void {
    if (!force && !this.pauseOpen) return;
    this.inputTestPanel.innerHTML = `
      <div class="content-heading">
        <div>
          <div class="panel-label">INPUT TESTER</div>
          <h3>Every key, live</h3>
          <p class="muted">Press keys to verify your keyboard. If several keys held at once disappear, your keyboard's rollover limit is the cause.</p>
        </div>
      </div>
      <div class="input-live-grid">
        <div class="pause-card">
          <div class="panel-label">HELD KEYS</div>
          <div class="held-keys">None</div>
          <div class="panel-label top-gap">HELD ACTIONS</div>
          <div class="held-actions">None</div>
        </div>
        <div class="pause-card">
          <div class="panel-label">GAMEPAD / WHEEL</div>
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
          <div class="panel-label">DIAGNOSTICS</div>
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
            ? data.inputDiagnostics.pressedCodes.map((code) => formatKeyCode(code)).join("  ·  ")
            : "None";
      }
      if (heldActions) {
        heldActions.textContent =
          data.inputDiagnostics.heldActions.length > 0
            ? data.inputDiagnostics.heldActions.map((action) => ACTION_LABELS[action]).join("  ·  ")
            : "None";
        if (data.inputDiagnostics.pressedCodes.length > 5) {
          heldActions.textContent += "  —  many keys held; rollover may limit detection.";
        }
      }
      if (gamepad) {
        const pad = data.inputDiagnostics.gamepad;
        gamepad.textContent = pad.connected
          ? `${pad.id}${pad.isWheel ? " (wheel mode)" : ""} · steer ${pad.steerAxis.toFixed(2)} · throttle ${pad.throttleAxis.toFixed(2)} · brake ${pad.brakeAxis.toFixed(2)}`
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
          ["Overload", data.clock.overloaded ? "YES — catch-up capped" : "no"],
          ["Dropped time", `${data.clock.droppedTimeS.toFixed(3)} s`],
          ["Solver mode", data.state.clutchMode],
          ["Clutch capacity", `${data.state.clutchCapacityNm.toFixed(0)} Nm`],
          ["Clutch temp", `${data.state.clutchTemperatureC.toFixed(0)} °C`],
          ["Wheel loads", data.state.wheels.map((wheel) => `${(wheel.normalLoadN / 1000).toFixed(1)}k`).join(" / ") + " N"],
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
          <div class="panel-label">DRIVING CONTROLS</div>
          <ul class="shortcut-list">${bindings}</ul>
        </div>
        <div>
          <div class="panel-label">THE H-PATTERN</div>
          <div class="h-pattern-help">
            <div><b>1</b><span>left · forward</span><b>2</b><span>left · rear</span></div>
            <div><b>3</b><span>centre · forward</span><b>4</b><span>centre · rear</span></div>
            <div><b>5</b><span>right · forward</span><b>6</b><span>right · rear</span></div>
          </div>
          <ol class="help-steps">
            <li>Press Enter to grab the lever. The HUD highlights it.</li>
            <li>Use one arrow key per segment. Neutral is the horizontal corridor.</li>
            <li>Press Enter to release and attempt engagement.</li>
            <li>The synchronizer and reverse lockout decide whether the gear engages.</li>
          </ol>
          <div class="panel-label">MOVING OFF</div>
          <p class="help-copy">Press Z to depress the clutch, select first, then release X slowly. At the bite point the car begins to creep. Add a little throttle, hold the bite, then release fully. Too fast a release stalls the engine; too much throttle while slipping heats the clutch.</p>
          <div class="panel-label">HILL START</div>
          <p class="help-copy">Hold the foot brake or handbrake. Bring the clutch to its bite point until you feel the drivetrain load, then release the brake and add throttle. The simulation has no hidden anti-rollback assist: gravity is real.</p>
          <p class="fine-print">Window focus loss releases the throttle and brake, depresses the clutch and applies the handbrake. The simulation pauses when the tab is hidden.</p>
        </div>
      </div>
    `;
  }

  private promptFor(state: VehicleRenderState): string {
    const key = (action: InputAction): string => this.callbacks.getBindingLabel(action);
    if (state.engineRunning && state.gear > 0 && state.gear < 6 && state.rpm > 5700 && state.clutchPedal < 0.2) {
      return `Shift up: lift ${key("accelerator")}, depress ${key("clutchDepress")}, select ${state.gear + 1}, then release ${key("clutchRelease")}.`;
    }
    if (state.engineRunning && state.gear > 1 && state.rpm < 1400 && state.throttle > 0.4 && state.clutchPedal < 0.2) {
      return "Engine is labouring. Depress the clutch and select a lower gear before accelerating.";
    }
    if (!state.ignition) return "Press I to switch on the ignition, then hold K to start the engine.";
    if (!state.engineRunning && !state.cranking) return "Hold K to crank the starter. Keep the clutch depressed with Z.";
    if (state.shifterGrabbed) return "Arrow keys move the lever · Enter releases and engages · Esc cancels.";
    if (state.gear === 0 && state.engineRunning) return "Enter grabs the lever. Arrows move through the gate; press Enter again to engage.";
    if (state.gear > 0 && state.speedMps < 0.2 && state.clutchPedal > 0.45) return "Find the bite point: release X slowly until the car creeps, then add a little W.";
    if (state.clutchMode === "slipping") return "Clutch is slipping. Hold the bite point briefly, then release X fully as the car moves.";
    if (state.slopeForward > 0.02 && state.pose.vx < -0.1) return "Rolling back. More clutch bite or hold the brake. Gravity is doing its job.";
    if (state.gear === 0 && state.speedMps > 0.5) return "Neutral while rolling. Select a gear or brake to a stop.";
    return "Z clutch · X release · Space handbrake · C camera · Tab telemetry · F1 help.";
  }
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export type { PauseTab };
