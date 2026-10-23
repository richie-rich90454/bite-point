import { clamp } from "../simulation/core/MathUtils";

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
  lastDisconnected = false;

  constructor(private readonly deadzone = 0.08) {}

  update(): GamepadSnapshot {
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
    const edge = (index: number): boolean => pressed(index) && !(this.previousButtons[index] ?? false);
    const steer = Math.abs(axes[0] ?? 0) > this.deadzone ? clamp(axes[0] ?? 0, -1, 1) : 0;

    let throttleAxis = 0;
    let brakeAxis = 0;
    let clutchAxis: number | null = null;
    if (isWheel) {
      clutchAxis = clamp(axes[1] ?? 0, 0, 1);
      throttleAxis = clamp(axes[2] ?? 0, 0, 1);
      brakeAxis = clamp(axes[3] ?? 0, 0, 1);
    } else {
      throttleAxis = pad.buttons[7] ? pad.buttons[7].value : 0;
      brakeAxis = pad.buttons[6] ? pad.buttons[6].value : 0;
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
