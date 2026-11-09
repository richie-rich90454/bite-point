import type { InputAction } from "../input/bindings";
import type { RebindResult } from "../input/InputService";
import type { UserSettings } from "../settings/SettingsRepository";
import type { TelemetrySample } from "../simulation/telemetry/TelemetryRecorder";
import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";
import { gearLabel } from "../simulation/vehicle/VehicleTypes";
import { assertValidVehicleConfig, type VehicleConfig } from "../simulation/config/VehicleConfig";
import rawConfig from "../data/reference-compact.json";
import { VehicleSimulation, type SimEvent } from "../simulation/vehicle/VehicleSimulation";
import { RoadContactProvider } from "../simulation/road/RoadContactProvider";
import { WorldGenerator } from "../simulation/world/WorldGenerator";
import { SimulationClock } from "../simulation/core/SimulationClock";
import { VehicleRenderer } from "../presentation/VehicleRenderer";
import { InputService } from "../input/InputService";
import { DrivingInstructor } from "../instructor/DrivingInstructor";
import { ScenarioManager } from "../scenarios/ScenarioManager";
import { SettingsRepository } from "../settings/SettingsRepository";
import { AudioDirector } from "../audio/AudioDirector";
import { AppUI, type AppUICallbacks, type UIUpdate } from "../ui/AppUI";
import { clamp, lerpAngle, wrapAngle } from "../simulation/core/MathUtils";

interface ReplaySession {
    samples: TelemetrySample[];
    elapsedS: number;
    durationS: number;
}

export class SimulatorApplication {
    private readonly config: VehicleConfig;
    private readonly settingsRepository: SettingsRepository;
    private readonly road: RoadContactProvider;
    private readonly world = new WorldGenerator(2026);
    private readonly simulation: VehicleSimulation;
    private readonly clock = new SimulationClock(1 / 250, 120);
    private readonly input: InputService;
    private readonly instructor: DrivingInstructor;
    private readonly scenarios: ScenarioManager;
    private readonly renderer: VehicleRenderer;
    private readonly audio: AudioDirector;
    private readonly ui: AppUI;
    private readonly canvas: HTMLCanvasElement;
    private started = false;
    private lastFrameMs = 0;
    private physicsMs = 0;
    private previousModal = false;
    private previousReplay = false;
    private replay: ReplaySession | null = null;
    private lastScenarioStatus = "";
    private lastOverloadToastAt = 0;
    private overloadSinceMs = 0;
    private lowFpsSinceMs = 0;
    private qualityRecoverySinceMs = 0;
    private adaptiveLevel = 0;
    private wasPointerLocked = false;
    private headlights = false;
    private wipers = 0;

    constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
        this.canvas = canvas;
        this.config = assertValidVehicleConfig(rawConfig as unknown);
        this.settingsRepository = new SettingsRepository();
        const settings = this.settingsRepository.current;
        this.road = new RoadContactProvider();
        this.simulation = new VehicleSimulation(this.config, this.road);
        this.instructor = new DrivingInstructor(settings.instructorEnabled);
        this.scenarios = new ScenarioManager();
        this.input = new InputService(window, settings, {
            onBindingsChanged: (bindings) => {
                this.settingsRepository.save({ bindings });
            },
            onSafetyStop: (message) => this.handleSafetyStop(message),
            onMessage: (message) => this.ui.showToast(message, "info"),
        });
        this.input.setClutchZone(this.config.clutch.bitePoint, this.config.clutch.engagementWidth);
        this.renderer = new VehicleRenderer(canvas, this.config, this.road, settings, this.world);
        this.audio = new AudioDirector(settings.audioEnabled, settings.masterVolume);

        const callbacks: AppUICallbacks = {
            onStart: (scenarioId) => this.startScenario(scenarioId),
            onResume: () => this.resume(),
            onRestart: () => this.startScenario(this.scenarios.current.id),
            onScenario: (scenarioId) => this.startScenario(scenarioId),
            onRecovery: () => this.recoverVehicle(),
            onSettings: (partial) => this.updateSettings(partial),
            onRebind: (action) => this.rebind(action),
            onResetBindings: () => {
                this.input.resetBindings();
                this.settingsRepository.save({ bindings: this.input.bindingsSnapshot });
                this.ui.updateSettings(this.settingsRepository.current);
            },
            onExportTelemetry: () => this.exportTelemetry(),
            onReplay: () => this.startReplay(),
            onStopReplay: () => this.stopReplay(true),
            onCamera: () => this.cycleCamera(),
            onHelp: () => this.ui.toggleHelp(),
            getBindingLabel: (action) => this.input.formatBinding(action),
        };
        this.ui = new AppUI(uiRoot, this.scenarios.all, settings, callbacks);

        this.road.setWorld(this.world);
        this.renderer.setWorldMode("endless");
        this.scenarios.start("endless", this.simulation);
        this.input.setIgnition(true);
        this.applySettings(settings);
        this.renderer.showcaseCamera();
        this.bindBrowserEvents();
        this.ui.showStart();
        window.bitePoint = {
            snapshot: () => {
                const state = this.simulation.getRenderState(0);
                return {
                    started: this.started,
                    scenarioId: this.scenarios.current.id,
                    scenarioStatus: this.scenarios.status,
                    gear: state.gear,
                    gearLabel: state.gearLabel,
                    speedKph: state.speedKph,
                    rpm: state.rpm,
                    running: state.engineRunning,
                    clutchPedal: state.clutchPedal,
                    clutchMode: state.clutchMode,
                    x: state.pose.x,
                    y: state.pose.y,
                    shifterGate: state.shifterGate,
                    shifterSlot: state.shifterSlot,
                    shifterGrabbed: state.shifterGrabbed,
                    pauseOpen: this.ui.pauseOpen,
                    helpOpen: this.ui.helpOpen,
                    telemetryOpen: this.ui.telemetryOpen,
                    replaying: this.replay !== null,
                    worldMode: this.renderer.activeWorldMode,
                    roadDistance: this.renderer.worldStreamer?.distanceAlongRoad ?? 0,
                    activeChunks: this.renderer.worldStreamer?.activeChunks ?? 0,
                    fps: this.renderer.getFps(),
                    stepsLastFrame: this.clock.stats().stepsLastFrame,
                    simulatedTimeS: this.clock.stats().simulatedTimeS,
                    throttle: state.throttle,
                    brake: state.brake,
                    handbrake: state.handbrake,
                    engineTorqueNm: state.engineTorqueNm,
                    wheelOmegas: state.wheels.map((wheel) => wheel.omega),
                    clutchModeDetail: state.clutchMode,
                    surfaceMu: state.sessionSurfaceMu,
                };
            },
            startScenario: (id) => this.startScenario(id),
            pause: () => this.ui.openPause("drive"),
            resume: () => this.resume(),
            world: () => this.renderer.worldDiagnostics,
        };
    }

    start(): void {
        this.lastFrameMs = performance.now();
        this.renderer.engine.runRenderLoop(() => this.frame());
    }

    private frame(): void {
        const now = performance.now();
        const delta = Math.min(0.1, Math.max(0, (now - this.lastFrameMs) / 1000));
        this.lastFrameMs = now;

        const modalAtStart = this.isModal();
        if (modalAtStart !== this.previousModal) this.applyModalState(modalAtStart);
        const replayAtStart = this.replay !== null;
        if (replayAtStart !== this.previousReplay) this.applyReplayState(replayAtStart);

        if (this.canDrive()) {
            this.input.update(delta, this.simulation.shifter.grabbed);
        } else {
            this.input.setSuspended(true);
            this.input.update(delta, this.simulation.shifter.grabbed);
            this.input.setSuspended(false);
        }
        const commands = this.input.consumeCommands();
        this.handleCommands(commands);

        const modalNow = this.isModal();
        if (modalNow !== this.previousModal) this.applyModalState(modalNow);
        const replayNow = this.replay !== null;
        if (replayNow !== this.previousReplay) this.applyReplayState(replayNow);

        if (this.replay) {
            this.renderReplayFrame(delta);
            return;
        }

        let renderState: VehicleRenderState;
        let clockStats = this.clock.stats();
        let events: SimEvent[] = [];

        if (this.started && !modalNow) {
            const physicsStart = performance.now();
            const controls = this.input.getControls();
            if (this.settingsRepository.current.autoClutch) {
                controls.clutchPedal =
                    this.simulation.speedMps < 2.2 && this.simulation.gear !== 0 ? 0.55 : 0;
            }
            clockStats = this.clock.advance(delta, (fixedStep) => {
                this.simulation.step(fixedStep, controls);
            });
            const physicsElapsed = performance.now() - physicsStart;
            this.physicsMs =
                this.physicsMs === 0
                    ? physicsElapsed
                    : this.physicsMs + (physicsElapsed - this.physicsMs) * 0.15;
            if (clockStats.overloaded) this.reportOverload(now);
            else this.overloadSinceMs = 0;
            renderState = this.simulation.getRenderState(clockStats.alpha);
            events = this.simulation.drainEvents();
            this.handleSimEvents(events);
            this.scenarios.update(this.simulation, renderState, events, delta);
            this.instructor.update(this.simulation, renderState, events, delta);
            this.audio.update(renderState, delta);
            this.handleScenarioStatus();
        } else {
            renderState = this.simulation.getRenderState(this.clock.stats().alpha);
            clockStats = this.clock.stats();
        }

        this.renderer.sync(renderState, delta);
        this.renderer.render();
        this.updateUi(renderState, clockStats, events);
        this.updateAdaptiveQuality(now);
    }

    private updateAdaptiveQuality(nowMs: number): void {
        if (!this.started || this.isModal() || this.replay) {
            this.lowFpsSinceMs = 0;
            this.qualityRecoverySinceMs = 0;
            return;
        }
        const fps = this.renderer.getFps();
        if (fps < 24) {
            this.qualityRecoverySinceMs = 0;
            if (this.lowFpsSinceMs === 0) this.lowFpsSinceMs = nowMs;
            if (nowMs - this.lowFpsSinceMs > 4000 && this.adaptiveLevel < 2) {
                this.adaptiveLevel += 1;
                this.renderer.setAdaptiveLevel(this.adaptiveLevel);
                if (this.adaptiveLevel === 1) {
                    this.ui.showToast(
                        "Performance mode enabled: resolution reduced to preserve real-time handling.",
                        "warning",
                    );
                }
                this.lowFpsSinceMs = nowMs;
            }
        } else {
            this.lowFpsSinceMs = 0;
            if (fps > 55 && this.adaptiveLevel > 0) {
                if (this.qualityRecoverySinceMs === 0) this.qualityRecoverySinceMs = nowMs;
                if (nowMs - this.qualityRecoverySinceMs > 12000) {
                    this.adaptiveLevel -= 1;
                    this.renderer.setAdaptiveLevel(this.adaptiveLevel);
                    this.qualityRecoverySinceMs = 0;
                }
            } else {
                this.qualityRecoverySinceMs = 0;
            }
        }
    }

    private applyModalState(open: boolean): void {
        this.previousModal = open;
        if (open) {
            this.input.releaseAllForReset();
            this.clock.reset();
            void this.audio.suspend();
        } else if (this.started) {
            this.clock.reset();
            this.lastFrameMs = performance.now();
            if (!this.replay) void this.audio.resume();
        }
    }

    private applyReplayState(active: boolean): void {
        this.previousReplay = active;
        if (active) {
            this.input.releaseAllForReset();
            this.clock.reset();
        } else {
            this.clock.reset();
            this.lastFrameMs = performance.now();
            if (!this.isModal()) void this.audio.resume();
        }
    }

    private renderReplayFrame(delta: number): void {
        const replay = this.replay;
        if (!replay) return;
        replay.elapsedS += delta;
        if (replay.elapsedS >= replay.durationS) {
            this.stopReplay(false);
            this.ui.openPause("drive");
            this.ui.showToast("Replay finished.", "info");
            return;
        }
        const time = replay.samples[0]!.t + replay.elapsedS;
        const state = this.buildReplayState(replay.samples, time);
        this.renderer.sync(state, delta);
        this.renderer.render();
        this.audio.update(state, delta);
        this.updateUi(state, this.clock.stats(), []);
    }

    private startScenario(id: string): void {
        void this.audio.start();
        const definition =
            this.scenarios.all.find((item) => item.id === id) ?? this.scenarios.all[0]!;
        const endless = definition.id === "endless";
        this.road.setWorld(endless ? this.world : null);
        this.renderer.setWorldMode(endless ? "endless" : "legacy");
        const scenario = this.scenarios.start(id, this.simulation);
        this.started = true;
        this.replay = null;
        this.input.releaseAllForReset();
        this.input.setIgnition(true);
        this.input.setHandbrake(false);
        this.ui.setScenarioSelection(scenario.id);
        this.ui.hideStart();
        this.ui.closePause();
        this.ui.closeHelp();
        this.instructor.clear();
        this.instructor.enabled = this.settingsRepository.current.instructorEnabled;
        this.clock.reset();
        this.lastFrameMs = performance.now();
        this.lastScenarioStatus = "running";
        this.headlights = false;
        this.wipers = 0;
        this.renderer.setHeadlights(false);
        this.renderer.setWipers(0);
        this.renderer.focusCockpit();
        this.ui.showToast(`${scenario.title}: ${scenario.description}`, "info");
    }

    private resume(): void {
        this.ui.closePause();
        this.ui.closeHelp();
        this.clock.reset();
        this.lastFrameMs = performance.now();
        void this.audio.resume();
    }

    private recoverVehicle(): void {
        if (!this.started) return;
        if (this.simulation.speedMps > 1.5) {
            this.ui.showToast(
                "Recovery only works when the car is stopped. Brake first.",
                "warning",
            );
            return;
        }
        this.startScenario(this.scenarios.current.id);
        this.ui.showToast("Vehicle recovered to the start of the session.", "success");
    }

    private updateSettings(partial: Partial<UserSettings>): void {
        const merged: Partial<UserSettings> = { ...partial };
        if (partial.quality) {
            if (partial.quality === "low") {
                merged.shadows = false;
                merged.renderScale = 0.75;
                merged.drawDistance = 0.7;
                merged.textureQuality = "low";
                merged.motionBlur = false;
                merged.bloom = false;
            } else if (partial.quality === "medium") {
                merged.shadows = true;
                merged.renderScale = 0.95;
                merged.drawDistance = 1;
                merged.textureQuality = "medium";
                merged.motionBlur = false;
                merged.bloom = true;
            } else {
                merged.shadows = true;
                merged.renderScale = 1.1;
                merged.drawDistance = 1.4;
                merged.textureQuality = "high";
                merged.motionBlur = true;
                merged.bloom = true;
            }
        }
        const saved = this.settingsRepository.save(merged);
        this.applySettings(saved);
        this.ui.updateSettings(saved);
    }

    private applySettings(settings: UserSettings): void {
        this.renderer.applySettings(settings);
        this.renderer.setDrawDistance(settings.drawDistance * 1400);
        this.simulation.speedLimitKph = settings.speedLimiterEnabled
            ? this.config.aero.maxSpeedKph
            : null;
        this.simulation.engine.antiStallAssist = settings.antiStallAssist;
        this.audio.setVolume(settings.masterVolume);
        this.audio.setEnabled(settings.audioEnabled);
        this.audio.setMix(settings);
        this.input.applySettings(settings);
        this.instructor.enabled = settings.instructorEnabled;
    }

    private async rebind(action: InputAction): Promise<RebindResult> {
        const result = await this.input.rebind(action);
        if (result.ok) {
            this.settingsRepository.save({ bindings: this.input.bindingsSnapshot });
            this.ui.updateSettings(this.settingsRepository.current);
        }
        return result;
    }

    private handleCommands(commands: ReturnType<InputService["consumeCommands"]>): void {
        for (const command of commands) {
            if (command.type === "pause") {
                if (this.replay) {
                    this.stopReplay(false);
                    this.ui.openPause("drive");
                } else if (this.simulation.shifter.grabbed) {
                    this.simulation.cancelShifter();
                    this.ui.showToast("Lever released without engaging a gear.", "info");
                } else {
                    this.ui.handleEscape();
                }
                continue;
            }
            if (command.type === "help") {
                this.ui.toggleHelp();
                continue;
            }
            if (command.type === "telemetry") {
                this.ui.setTelemetryVisible(!this.ui.telemetryOpen);
                continue;
            }
            if (command.type === "instructor") {
                this.instructor.toggle();
                this.settingsRepository.save({ instructorEnabled: this.instructor.enabled });
                this.ui.updateSettings(this.settingsRepository.current);
                this.ui.showToast(
                    this.instructor.enabled ? "Instructor enabled." : "Instructor disabled.",
                    "info",
                );
                continue;
            }
            if (command.type === "camera") {
                if (this.started) {
                    this.cycleCamera();
                }
                continue;
            }
            if (command.type === "recenter") {
                this.renderer.recenterView();
                continue;
            }
            if (command.type === "headlights") {
                this.headlights = !this.headlights;
                this.renderer.setHeadlights(this.headlights);
                this.ui.showToast(this.headlights ? "Headlights on." : "Headlights off.", "info");
                continue;
            }
            if (command.type === "wipers") {
                this.wipers = (this.wipers + 1) % 3;
                this.renderer.setWipers(this.wipers);
                this.ui.showToast(
                    `Wipers: ${this.wipers === 0 ? "off" : this.wipers === 1 ? "intermittent" : "fast"}.`,
                    "info",
                );
                continue;
            }
            if (command.type === "recovery") {
                if (this.canDrive()) this.recoverVehicle();
                continue;
            }
            if (!this.canDrive()) continue;
            if (command.type === "shifter-toggle") this.simulation.toggleShifter();
            else if (command.type === "shifter-move")
                this.simulation.moveShifter(command.direction);
            else if (command.type === "neutral") this.simulation.requestNeutral();
            else if (command.type === "reverse") this.simulation.requestReverse();
            else if (command.type === "quick-gear") this.simulation.selectGearDirect(command.gear);
        }
    }

    private handleSimEvents(events: SimEvent[]): void {
        for (const event of events) {
            if (event.type === "gear-engaged") this.audio.playGearClunk(this.simulation.gear);
            else if (event.type === "stall") this.audio.playStall();
        }
    }

    private handleScenarioStatus(): void {
        const status = this.scenarios.status;
        if (status === this.lastScenarioStatus) return;
        this.lastScenarioStatus = status;
        if (status === "success") {
            this.ui.showToast(this.scenarios.message || "Objective complete.", "success");
        } else if (status === "failed") {
            this.ui.showToast(
                this.scenarios.message || "Objective failed. Restart from the pause menu.",
                "warning",
            );
        }
    }

    private handleSafetyStop(message: string): void {
        this.ui.showToast(message, "warning");
        if (!this.started || this.ui.startOpen) return;
        if (!this.ui.pauseOpen && !this.ui.helpOpen) this.ui.openPause("drive");
        this.clock.reset();
        void this.audio.suspend();
    }

    private cycleCamera(): void {
        this.renderer.cycleCamera();
        this.ui.showToast(`Camera: ${this.renderer.cameraModeLabel}.`, "info");
    }

    private requestPointerLock(): void {
        if (!this.canvas.requestPointerLock) return;
        try {
            const result = this.canvas.requestPointerLock() as unknown;
            if (result instanceof Promise) void result.catch(() => undefined);
        } catch {
            // Pointer lock is optional.
        }
    }

    private exportTelemetry(): void {
        const json = this.simulation.recorder.exportJson();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `bite-point-telemetry-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.ui.showToast("Telemetry exported as JSON.", "success");
    }

    private startReplay(): void {
        const samples = this.simulation.recorder.samples();
        if (samples.length < 4) {
            this.ui.showToast("Drive for a moment before replaying.", "warning");
            return;
        }
        const startTime = Math.max(samples[0]!.t, samples[samples.length - 1]!.t - 20);
        const windowSamples = samples.filter((sample) => sample.t >= startTime);
        if (windowSamples.length < 4) {
            this.ui.showToast("Not enough recent telemetry to replay.", "warning");
            return;
        }
        this.replay = {
            samples: windowSamples,
            elapsedS: 0,
            durationS: Math.max(
                0.5,
                windowSamples[windowSamples.length - 1]!.t - windowSamples[0]!.t,
            ),
        };
        this.input.releaseAllForReset();
        this.ui.showToast("Replaying the last 20 seconds. Press Esc to stop.", "info");
    }

    private stopReplay(resume: boolean): void {
        this.replay = null;
        this.clock.reset();
        this.lastFrameMs = performance.now();
        if (resume) {
            void this.audio.resume();
            this.ui.showToast("Replay stopped.", "info");
        }
    }

    private buildReplayState(samples: TelemetrySample[], time: number): VehicleRenderState {
        let low = 0;
        let high = samples.length - 1;
        while (high - low > 1) {
            const mid = (low + high) >>> 1;
            if (samples[mid]!.t <= time) low = mid;
            else high = mid;
        }
        const a = samples[low]!;
        const b = samples[high]!;
        const span = b.t - a.t;
        const t = span > 0 ? clamp((time - a.t) / span, 0, 1) : 0;
        const sample = a;
        const heading = wrapAngle(lerpAngle(a.heading, b.heading, t));
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const z = a.z + (b.z - a.z) * t;
        const speed = a.speedMps + (b.speedMps - a.speedMps) * t;
        const rpm = a.engineRpm + (b.engineRpm - a.engineRpm) * t;
        const front = this.config.wheelbaseM * (1 - this.config.frontWeightBias);
        const rear = -this.config.wheelbaseM * this.config.frontWeightBias;
        const halfTrack = this.config.trackM / 2;
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        const hFL = this.road.heightAt(
            x + cos * front - sin * -halfTrack,
            y + sin * front + cos * -halfTrack,
        );
        const hFR = this.road.heightAt(
            x + cos * front - sin * halfTrack,
            y + sin * front + cos * halfTrack,
        );
        const hRL = this.road.heightAt(
            x + cos * rear - sin * -halfTrack,
            y + sin * rear + cos * -halfTrack,
        );
        const hRR = this.road.heightAt(
            x + cos * rear - sin * halfTrack,
            y + sin * rear + cos * halfTrack,
        );
        const pitch = Math.atan2((hFL + hFR) / 2 - (hRL + hRR) / 2, this.config.wheelbaseM);
        const roll = Math.atan2((hFL + hRL) / 2 - (hFR + hRR) / 2, this.config.trackM);
        const slopeLateral = Math.atan2((hFR + hRR) / 2 - (hFL + hRL) / 2, this.config.trackM);
        const engagement = this.simulation.clutch.engagementForPedal(sample.clutchPedal);
        const mode =
            engagement < 0.01
                ? "open"
                : Math.abs(sample.clutchSlipRadPerSec) > 2
                  ? "slipping"
                  : "locked";
        const gearPosition =
            this.config.gearbox.gates.find((position) => position.gear === sample.gear) ??
            this.config.gearbox.gates.find((position) => position.gear === 0)!;
        const staticLoad = (this.config.massKg * 9.80665) / 4;
        return {
            timeS: sample.t,
            pose: {
                x,
                y,
                z,
                heading,
                pitch,
                roll,
                vx: sample.forwardSpeed,
                vy: sample.lateralSpeed,
                yawRate: sample.yawRate,
            },
            speedMps: speed,
            speedKph: speed * 3.6,
            rpm,
            gear: sample.gear,
            gearLabel: gearLabel(sample.gear),
            throttle: sample.throttle,
            brake: sample.brake,
            clutchPedal: sample.clutchPedal,
            clutchBitePedal: this.config.clutch.bitePoint,
            clutchEngagementWidth: this.config.clutch.engagementWidth,
            handbrake: sample.handbrake,
            steeringInput: 0,
            steeringAngleRad: sample.wheelSteer,
            steeringWheelAngleRad: sample.wheelSteer * 13,
            ignition: true,
            starter: false,
            engineRunning: sample.running,
            cranking: false,
            fuelCut: sample.fuelCut,
            engineTorqueNm: sample.engineTorqueNm,
            clutchMode: mode,
            clutchSlipRadPerSec: sample.clutchSlipRadPerSec,
            clutchCapacityNm: this.config.clutch.maxCapacityNm * engagement,
            clutchEngagement: engagement,
            clutchTemperatureC: sample.clutchTempC,
            clutchWear: sample.clutchWear,
            gearboxTorqueFactor: sample.gear === 0 ? 0 : 1,
            shifterGate: gearPosition.gate,
            shifterSlot: gearPosition.slot,
            shifterGrabbed: false,
            sessionSurfaceMu: sample.surfaceMu,
            slopeForward: sample.slope,
            slopeLateral,
            wheelLocked: false,
            wheels: [0, 1, 2, 3].map((index) => ({
                omega: sample.wheelOmegas[index]!,
                steerAngleRad: index < 2 ? sample.wheelSteer : 0,
                normalLoadN: staticLoad,
                slipRatio: index < 2 ? sample.frontSlip : sample.rearSlip,
                compressionM: 0.12,
                longitudinalForceN: 0,
            })),
        };
    }

    private updateUi(
        renderState: VehicleRenderState,
        clockStats: ReturnType<SimulationClock["stats"]>,
        events: SimEvent[],
    ): void {
        void events;
        const update: UIUpdate = {
            state: renderState,
            clock: clockStats,
            fps: this.renderer.getFps(),
            physicsMs: this.physicsMs,
            scenario: {
                id: this.scenarios.current.id,
                title: this.scenarios.current.title,
                description: this.scenarios.current.description,
                instructions: this.scenarios.current.instructions,
                status: this.scenarios.status,
                message: this.scenarios.message,
                progress: this.scenarios.progress,
                elapsedS: this.scenarios.stats.elapsedS,
            },
            instructorMessages: this.instructor.messages,
            instructorEnabled: this.instructor.enabled,
            telemetrySamples: this.simulation.recorder.samples(),
            telemetryVisible: this.ui.telemetryOpen,
            replaying: this.replay !== null,
            cameraLabel: this.renderer.cameraModeLabel,
            headlights: this.headlights,
            wipers: this.wipers,
            inputDiagnostics: this.input.getDiagnostics(),
            quickSelectEnabled: this.settingsRepository.current.quickSelectMode,
            rendererMode: `${this.renderer.cameraMode} · ${this.settingsRepository.current.quality}`,
        };
        this.ui.update(update);
    }

    private reportOverload(nowMs: number): void {
        if (this.overloadSinceMs === 0) this.overloadSinceMs = nowMs;
        if (nowMs - this.overloadSinceMs < 3500) return;
        if (nowMs - this.lastOverloadToastAt < 12000) return;
        this.lastOverloadToastAt = nowMs;
        this.ui.showToast(
            "Simulation overloaded: catch-up is capped. Reduce render scale or close other tabs.",
            "warning",
        );
    }

    private isModal(): boolean {
        return this.ui.startOpen || this.ui.pauseOpen || this.ui.helpOpen;
    }

    private canDrive(): boolean {
        return this.started && !this.isModal() && this.replay === null;
    }

    private bindBrowserEvents(): void {
        this.canvas.addEventListener("click", () => {
            if (!this.started || this.isModal()) return;
            void this.audio.start();
            this.requestPointerLock();
        });

        window.addEventListener("mousemove", (event) => {
            if (this.canvas.ownerDocument.pointerLockElement !== this.canvas) return;
            if (this.renderer.cameraMode !== "cockpit") return;
            this.renderer.addLook(event.movementX * 0.0022, event.movementY * 0.0018);
        });

        this.canvas.ownerDocument.addEventListener("pointerlockchange", () => {
            const locked = this.canvas.ownerDocument.pointerLockElement === this.canvas;
            if (
                this.wasPointerLocked &&
                !locked &&
                this.started &&
                !this.ui.startOpen &&
                !this.ui.pauseOpen &&
                !this.ui.helpOpen
            ) {
                this.ui.openPause("drive");
            }
            this.wasPointerLocked = locked;
        });

        this.canvas.ownerDocument.addEventListener("visibilitychange", () => {
            if (this.canvas.ownerDocument.hidden) {
                void this.audio.suspend();
            } else {
                this.lastFrameMs = performance.now();
                this.clock.reset();
            }
        });
    }
}
