import { clamp } from "../simulation/core/MathUtils";
import type { ClutchAxis } from "../settings/SettingsRepository";

export interface GamepadSnapshot {
    connected: boolean;
    id: string;
    isWheel: boolean;
    steerAxis: number;
    throttleAxis: number;
    brakeAxis: number;
    clutchAxis: number | null;
    clutchButton: boolean;
    handbrake: boolean;
    ignitionPressed: boolean;
    starter: boolean;
    leverUpPressed: boolean;
    leverDownPressed: boolean;
    leverLeftPressed: boolean;
    leverRightPressed: boolean;
    grabPressed: boolean;
    neutralPressed: boolean;
    reversePressed: boolean;
    buttons: boolean[];
    axes: number[];
}

const EMPTY_SNAPSHOT: GamepadSnapshot = {
    connected: false,
    id: "",
    isWheel: false,
    steerAxis: 0,
    throttleAxis: 0,
    brakeAxis: 0,
    clutchAxis: null,
    clutchButton: false,
    handbrake: false,
    ignitionPressed: false,
    starter: false,
    leverUpPressed: false,
    leverDownPressed: false,
    leverLeftPressed: false,
    leverRightPressed: false,
    grabPressed: false,
    neutralPressed: false,
    reversePressed: false,
    buttons: [],
    axes: [],
};

export class GamepadInputAdapter {
    private previousButtons: boolean[] = [];
    private wasConnected = false;
    private enabled = true;
    private clutchAxisMode: ClutchAxis = "auto";
    lastDisconnected = false;

    constructor(private readonly deadzone = 0.08) {}

    setClutchAxisMode(mode: ClutchAxis): void {
        this.clutchAxisMode = mode;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.wasConnected = false;
            this.previousButtons = [];
        }
    }

    update(): GamepadSnapshot {
        if (!this.enabled) return { ...EMPTY_SNAPSHOT };
        const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
        let pad: Gamepad | null = null;
        for (const candidate of pads) {
            if (candidate?.connected) {
                pad = candidate;
                break;
            }
        }
        if (!pad) {
            this.lastDisconnected = this.wasConnected;
            this.wasConnected = false;
            this.previousButtons = [];
            return { ...EMPTY_SNAPSHOT };
        }

        this.lastDisconnected = false;
        this.wasConnected = true;
        const isWheel = /wheel|racing|g29|g920|g923|t300|t500|fanatec|moza|simagic/i.test(pad.id);
        const axes = pad.axes.map((value) => (Number.isFinite(value) ? value : 0));
        const buttons = pad.buttons.map((button) => button.pressed || button.value > 0.5);
        const pressed = (index: number): boolean => buttons[index] ?? false;
        const edge = (index: number): boolean =>
            pressed(index) && !(this.previousButtons[index] ?? false);
        const steer = Math.abs(axes[0] ?? 0) > this.deadzone ? clamp(axes[0] ?? 0, -1, 1) : 0;

        let throttleAxis = 0;
        let brakeAxis = 0;
        let clutchAxis: number | null = null;
        const leftTrigger = pad.buttons[6]?.value ?? 0;
        const rightTrigger = pad.buttons[7]?.value ?? 0;
        if (isWheel) {
            if (this.clutchAxisMode === "leftTrigger") {
                clutchAxis = clamp(axes[4] ?? leftTrigger, 0, 1);
            } else if (this.clutchAxisMode === "rightTrigger") {
                clutchAxis = clamp(axes[5] ?? rightTrigger, 0, 1);
            } else {
                clutchAxis = clamp(axes[1] ?? 0, 0, 1);
            }
            throttleAxis = clamp(axes[2] ?? 0, 0, 1);
            brakeAxis = clamp(axes[3] ?? 0, 0, 1);
        } else {
            throttleAxis = rightTrigger;
            brakeAxis = leftTrigger;
            if (this.clutchAxisMode === "leftTrigger") clutchAxis = leftTrigger;
            else if (this.clutchAxisMode === "rightTrigger") clutchAxis = rightTrigger;
        }

        const snapshot: GamepadSnapshot = {
            connected: true,
            id: pad.id,
            isWheel,
            steerAxis: steer,
            throttleAxis,
            brakeAxis,
            clutchAxis,
            clutchButton: isWheel ? false : pressed(4),
            handbrake: pressed(0),
            ignitionPressed: edge(3),
            starter: pressed(2),
            leverUpPressed: edge(12),
            leverDownPressed: edge(13),
            leverLeftPressed: edge(14),
            leverRightPressed: edge(15),
            grabPressed: edge(1),
            neutralPressed: edge(10),
            reversePressed: edge(11),
            buttons,
            axes,
        };
        this.previousButtons = buttons;
        return snapshot;
    }
}
