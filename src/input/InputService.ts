import { clamp, clamp01, moveTowards } from "../simulation/core/MathUtils";
import type { VehicleControls } from "../simulation/vehicle/VehicleSimulation";
import type { UserSettings } from "../settings/SettingsRepository";
import {
    ACTION_LABELS,
    cloneBindings,
    DEFAULT_BINDINGS,
    findBindingOwner,
    formatKeyCode,
    INPUT_ACTIONS,
    type BindingMap,
    type InputAction,
} from "./bindings";
import { GamepadInputAdapter, type GamepadSnapshot } from "./GamepadInputAdapter";
import { InputCalibration } from "./InputCalibration";
import { KeyboardInputAdapter, loadKeyLabelMap } from "./KeyboardInputAdapter";

export type InputCommand =
    | { type: "shifter-toggle" }
    | { type: "shifter-move"; direction: "up" | "down" | "left" | "right" }
    | { type: "neutral" }
    | { type: "reverse" }
    | { type: "quick-gear"; gear: number }
    | { type: "camera" }
    | { type: "recenter" }
    | { type: "headlights" }
    | { type: "wipers" }
    | { type: "telemetry" }
    | { type: "help" }
    | { type: "instructor" }
    | { type: "pause" }
    | { type: "recovery" };

export interface RebindResult {
    ok: boolean;
    action: InputAction;
    code?: string;
    error?: string;
}

export interface InputServiceCallbacks {
    onBindingsChanged?: (bindings: BindingMap) => void;
    onSafetyStop?: (message: string) => void;
    onMessage?: (message: string) => void;
}

export interface InputDiagnostics {
    pressedCodes: string[];
    heldActions: InputAction[];
    gamepad: GamepadSnapshot;
    pendingRebind: InputAction | null;
}

const ARROW_ACTIONS: Partial<Record<InputAction, "up" | "down" | "left" | "right">> = {
    leverUp: "up",
    leverDown: "down",
    leverLeft: "left",
    leverRight: "right",
};

const COMMAND_ACTIONS: Partial<Record<InputAction, InputCommand>> = {
    camera: { type: "camera" },
    recenter: { type: "recenter" },
    headlights: { type: "headlights" },
    wipers: { type: "wipers" },
    telemetry: { type: "telemetry" },
    help: { type: "help" },
    instructor: { type: "instructor" },
    pause: { type: "pause" },
};

const KEY_REPEAT_DELAY_S = 0.34;
const KEY_REPEAT_RATE_S = 0.12;
const RECOVERY_HOLD_S = 1.5;

export class InputService {
    private readonly keyboard: KeyboardInputAdapter;
    private readonly gamepad = new GamepadInputAdapter();
    private readonly calibration = new InputCalibration();
    private bindings: BindingMap;
    private held = new Set<InputAction>();
    private commands: InputCommand[] = [];
    private throttlePedal = 0;
    private brakePedal = 0;
    private clutchPedal = 1;
    private virtualThrottle = 0;
    private virtualBrake = 0;
    private virtualSteering = 0;
    private virtualClutch: number | null = null;
    private virtualHandbrake = false;
    private virtualStarter = false;
    private steeringAxis = 0;
    private ignition = false;
    private starter = false;
    private handbrake = false;
    private repeatAction: InputAction | null = null;
    private repeatTimer = 0;
    private recoveryHold = 0;
    private recoverySent = false;
    private pendingRebind: InputAction | null = null;
    private gamepadSnapshot: GamepadSnapshot;
    private previousGamepadConnected = false;
    private quickSelectMode: boolean;
    private keyLabels = new Map<string, string>();
    private disposed = false;
    private suspended = false;
    private clutchBitePoint = 0.4;
    private clutchEngagementWidth = 0.5;

    constructor(
        private readonly target: Window,
        settings: UserSettings,
        private readonly callbacks: InputServiceCallbacks = {},
    ) {
        this.bindings = cloneBindings(settings.bindings);
        this.quickSelectMode = settings.quickSelectMode;
        this.keyboard = new KeyboardInputAdapter(target, this.bindings, {
            onActionDown: (action) => this.handleActionDown(action),
            onActionUp: (action) => this.handleActionUp(action),
            onFocusLost: () =>
                this.handleSafetyStop(
                    "Window lost focus. Controls released, clutch depressed, handbrake applied.",
                ),
            onVisibilityHidden: () =>
                this.handleSafetyStop("Tab hidden. Simulation paused and controls released."),
        });
        this.gamepadSnapshot = this.gamepad.update();
        void loadKeyLabelMap().then((labels) => {
            this.keyLabels = labels;
        });
    }

    get bindingsSnapshot(): Readonly<BindingMap> {
        return this.bindings;
    }

    get isRebinding(): boolean {
        return this.pendingRebind !== null;
    }

    applySettings(settings: UserSettings): void {
        if (JSON.stringify(settings.bindings) !== JSON.stringify(this.bindings)) {
            this.bindings = cloneBindings(settings.bindings);
            this.keyboard.setBindings(this.bindings);
        }
        this.quickSelectMode = settings.quickSelectMode;
        this.gamepad.setEnabled(settings.gamepadEnabled);
        this.gamepad.setClutchAxisMode(settings.clutchAxis);
        this.calibration.update({
            steeringDeadzone: settings.steeringDeadzone,
            throttleDeadzone: settings.throttleDeadzone,
            brakeDeadzone: settings.brakeDeadzone,
            clutchDeadzone: settings.steeringDeadzone,
        });
    }

    setSuspended(suspended: boolean): void {
        this.suspended = suspended;
    }

    setClutchZone(bitePoint: number, engagementWidth: number): void {
        this.clutchBitePoint = bitePoint;
        this.clutchEngagementWidth = engagementWidth;
    }

    update(dt: number, shifterGrabbed: boolean): void {
        if (this.disposed) return;
        const step = clamp(dt, 0, 0.25);
        const pad = this.gamepad.update();
        if (pad.connected && !this.previousGamepadConnected) {
            this.callbacks.onMessage?.(`Controller connected: ${pad.id.slice(0, 48)}`);
        } else if (!pad.connected && this.previousGamepadConnected) {
            this.handleControllerDisconnect();
        }
        this.previousGamepadConnected = pad.connected;
        this.gamepadSnapshot = pad;
        if (this.suspended) return;

        if (pad.ignitionPressed) this.ignition = !this.ignition;
        if (pad.grabPressed) this.commands.push({ type: "shifter-toggle" });
        if (pad.leverUpPressed) this.commands.push({ type: "shifter-move", direction: "up" });
        if (pad.leverDownPressed) this.commands.push({ type: "shifter-move", direction: "down" });
        if (pad.leverLeftPressed) this.commands.push({ type: "shifter-move", direction: "left" });
        if (pad.leverRightPressed) this.commands.push({ type: "shifter-move", direction: "right" });
        if (pad.neutralPressed) this.commands.push({ type: "neutral" });
        if (pad.reversePressed) this.commands.push({ type: "reverse" });

        const keyboardThrottleTarget = this.held.has("accelerator") ? 1 : 0;
        const throttleRate = keyboardThrottleTarget > this.throttlePedal ? 2.7 : 6.5;
        this.throttlePedal = moveTowards(
            this.throttlePedal,
            keyboardThrottleTarget,
            throttleRate * step,
        );
        if (pad.connected && (pad.isWheel || pad.throttleAxis > 0.02)) {
            const pedal = this.calibration.throttle(pad.throttleAxis);
            this.throttlePedal = Math.max(this.throttlePedal, pedal);
        }

        const keyboardBrakeTarget = this.held.has("brake") ? 1 : 0;
        const brakeRate = keyboardBrakeTarget > this.brakePedal ? 3.4 : 8;
        this.brakePedal = moveTowards(this.brakePedal, keyboardBrakeTarget, brakeRate * step);
        if (pad.connected && (pad.isWheel || pad.brakeAxis > 0.02)) {
            const pedal = this.calibration.brake(pad.brakeAxis);
            this.brakePedal = Math.max(this.brakePedal, pedal);
        }

        if (pad.connected && pad.clutchAxis !== null) {
            this.clutchPedal = this.calibration.clutch(pad.clutchAxis);
        } else {
            const depress = this.held.has("clutchDepress") || pad.clutchButton;
            const release = this.held.has("clutchRelease");
            if (depress && !release) {
                this.clutchPedal = moveTowards(this.clutchPedal, 1, 1.9 * step);
            } else if (release && !depress) {
                const low = this.clutchBitePoint - this.clutchEngagementWidth / 2;
                const high = this.clutchBitePoint + this.clutchEngagementWidth / 2;
                const inBiteZone = this.clutchPedal <= high && this.clutchPedal >= low;
                const releaseRate = inBiteZone ? 0.5 : this.clutchPedal > high ? 1.9 : 2.2;
                this.clutchPedal = moveTowards(this.clutchPedal, 0, releaseRate * step);
            }
        }

        this.throttlePedal = Math.max(this.throttlePedal, this.virtualThrottle);
        this.brakePedal = Math.max(this.brakePedal, this.virtualBrake);
        if (this.virtualClutch !== null) {
            const target = this.virtualClutch;
            if (target >= this.clutchPedal) {
                this.clutchPedal = moveTowards(this.clutchPedal, target, 1.9 * step);
            } else {
                const low = this.clutchBitePoint - this.clutchEngagementWidth / 2;
                const high = this.clutchBitePoint + this.clutchEngagementWidth / 2;
                const inBiteZone = this.clutchPedal <= high && this.clutchPedal >= low;
                const rate = inBiteZone ? 0.5 : this.clutchPedal > high ? 1.9 : 2.2;
                this.clutchPedal = moveTowards(this.clutchPedal, target, rate * step);
            }
        }

        const keyboardSteer =
            (this.held.has("steerRight") ? 1 : 0) - (this.held.has("steerLeft") ? 1 : 0);
        const virtualSteer = this.virtualSteering;
        if (Math.abs(virtualSteer) > Math.abs(keyboardSteer)) {
            this.steeringAxis = clamp(virtualSteer, -1, 1);
        } else if (pad.connected && Math.abs(pad.steerAxis) > 0.02) {
            this.steeringAxis = this.calibration.steering(pad.steerAxis);
        } else {
            this.steeringAxis = keyboardSteer;
        }

        this.handbrake = this.held.has("handbrake") || (pad.connected && pad.handbrake);
        this.starter = this.held.has("starter") || (pad.connected && pad.starter);
        if (this.virtualHandbrake) this.handbrake = true;
        if (this.virtualStarter) this.starter = true;

        if (this.held.has("recovery")) {
            if (!this.recoverySent) {
                this.recoveryHold += step;
                if (this.recoveryHold >= RECOVERY_HOLD_S) {
                    this.recoverySent = true;
                    this.commands.push({ type: "recovery" });
                }
            }
        } else {
            this.recoveryHold = 0;
            this.recoverySent = false;
        }

        if (shifterGrabbed && this.repeatAction && this.held.has(this.repeatAction)) {
            this.repeatTimer -= step;
            if (this.repeatTimer <= 0) {
                const direction = ARROW_ACTIONS[this.repeatAction];
                if (direction) this.commands.push({ type: "shifter-move", direction });
                this.repeatTimer = KEY_REPEAT_RATE_S;
            }
        }
    }

    getControls(): VehicleControls {
        return {
            throttle: clamp01(this.throttlePedal),
            brake: clamp01(this.brakePedal),
            clutchPedal: clamp01(this.clutchPedal),
            steering: clamp(this.steeringAxis, -1, 1),
            handbrake: this.handbrake,
            ignition: this.ignition,
            starter: this.starter,
        };
    }

    consumeCommands(): InputCommand[] {
        const result = this.commands;
        this.commands = [];
        return result;
    }

    setIgnition(on: boolean): void {
        this.ignition = on;
    }

    setHandbrake(on: boolean): void {
        this.handbrake = on;
    }

    setVirtualThrottle(value: number): void {
        this.virtualThrottle = Math.max(0, Math.min(1, value));
    }

    setVirtualBrake(value: number): void {
        this.virtualBrake = Math.max(0, Math.min(1, value));
    }

    setVirtualSteering(value: number): void {
        this.virtualSteering = Math.max(-1, Math.min(1, value));
    }

    setVirtualClutch(value: number | null): void {
        this.virtualClutch = value === null ? null : Math.max(0, Math.min(1, value));
    }

    setVirtualHandbrake(on: boolean): void {
        this.virtualHandbrake = on;
    }

    setVirtualStarter(on: boolean): void {
        this.virtualStarter = on;
    }

    clearVirtualControls(): void {
        this.virtualThrottle = 0;
        this.virtualBrake = 0;
        this.virtualSteering = 0;
        this.virtualClutch = null;
        this.virtualHandbrake = false;
        this.virtualStarter = false;
    }

    releaseAllForReset(): void {
        this.throttlePedal = 0;
        this.brakePedal = 0;
        this.clutchPedal = 1;
        this.steeringAxis = 0;
        this.starter = false;
        this.handbrake = true;
        this.held.clear();
        this.repeatAction = null;
        this.clearVirtualControls();
    }

    async rebind(action: InputAction): Promise<RebindResult> {
        if (this.pendingRebind) {
            return { ok: false, action, error: "Another key is already being captured." };
        }
        this.pendingRebind = action;
        return new Promise<RebindResult>((resolve) => {
            this.keyboard.captureNext((code) => {
                this.pendingRebind = null;
                if (code === "Escape") {
                    resolve({ ok: false, action, error: "Rebind cancelled." });
                    return;
                }
                const owner = findBindingOwner(this.bindings, code);
                if (owner && owner !== action) {
                    resolve({
                        ok: false,
                        action,
                        code,
                        error: `${formatKeyCode(code, this.keyLabels)} is already bound to ${ACTION_LABELS[owner]}.`,
                    });
                    return;
                }
                this.bindings = { ...this.bindings, [action]: [code] };
                this.keyboard.setBindings(this.bindings);
                this.callbacks.onBindingsChanged?.(cloneBindings(this.bindings));
                resolve({ ok: true, action, code });
            });
        });
    }

    cancelRebind(): void {
        this.keyboard.cancelCapture();
        this.pendingRebind = null;
    }

    resetBindings(): void {
        this.bindings = cloneBindings(DEFAULT_BINDINGS);
        this.keyboard.setBindings(this.bindings);
        this.callbacks.onBindingsChanged?.(cloneBindings(this.bindings));
    }

    formatBinding(action: InputAction): string {
        const codes = this.bindings[action] ?? [];
        return codes.map((code) => formatKeyCode(code, this.keyLabels)).join(" / ") || "Unbound";
    }

    getDiagnostics(): InputDiagnostics {
        return {
            pressedCodes: this.keyboard.getPressedCodes(),
            heldActions: [...this.held],
            gamepad: this.gamepadSnapshot,
            pendingRebind: this.pendingRebind,
        };
    }

    get quickSelectEnabled(): boolean {
        return this.quickSelectMode;
    }

    dispose(): void {
        this.disposed = true;
        this.keyboard.dispose();
    }

    private handleActionDown(action: InputAction): void {
        if (this.held.has(action)) return;
        this.held.add(action);

        const arrowDirection = ARROW_ACTIONS[action];
        if (arrowDirection) {
            this.commands.push({ type: "shifter-move", direction: arrowDirection });
            this.repeatAction = action;
            this.repeatTimer = KEY_REPEAT_DELAY_S;
            return;
        }

        if (action === "grabLever") {
            this.commands.push({ type: "shifter-toggle" });
            return;
        }
        if (action === "neutral") {
            this.commands.push({ type: "neutral" });
            return;
        }
        if (action === "reverse") {
            this.commands.push({ type: "reverse" });
            return;
        }
        if (action === "ignition") {
            this.ignition = !this.ignition;
            return;
        }
        if (action === "starter") return;
        if (action === "accelerator" || action === "brake" || action === "handbrake") return;
        if (action === "clutchDepress" || action === "clutchRelease") return;
        if (action === "steerLeft" || action === "steerRight") return;
        if (action === "recovery") return;

        if (action.startsWith("quick")) {
            if (!this.quickSelectMode) {
                this.callbacks.onMessage?.(
                    "Quick-select is off. Use the H-pattern lever (Enter, arrows).",
                );
                return;
            }
            const gear = Number(action.slice(5));
            this.commands.push({ type: "quick-gear", gear });
            return;
        }

        const command = COMMAND_ACTIONS[action];
        if (command) this.commands.push(command);
    }

    private handleActionUp(action: InputAction): void {
        this.held.delete(action);
        if (this.repeatAction === action) {
            this.repeatAction = null;
            this.repeatTimer = 0;
        }
    }

    private handleSafetyStop(message: string): void {
        this.throttlePedal = 0;
        this.brakePedal = 0;
        this.clutchPedal = 1;
        this.steeringAxis = 0;
        this.starter = false;
        this.handbrake = true;
        this.held.clear();
        this.repeatAction = null;
        this.recoveryHold = 0;
        this.clearVirtualControls();
        this.callbacks.onSafetyStop?.(message);
    }

    private handleControllerDisconnect(): void {
        this.throttlePedal = 0;
        this.brakePedal = 0;
        this.handbrake = true;
        this.callbacks.onSafetyStop?.(
            "Controller disconnected. Throttle and brake released, handbrake applied.",
        );
    }
}

export { INPUT_ACTIONS, ACTION_LABELS };
