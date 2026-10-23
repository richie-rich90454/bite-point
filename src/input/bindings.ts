export const INPUT_ACTIONS = [
  "accelerator",
  "brake",
  "steerLeft",
  "steerRight",
  "clutchDepress",
  "clutchRelease",
  "grabLever",
  "leverUp",
  "leverDown",
  "leverLeft",
  "leverRight",
  "neutral",
  "reverse",
  "handbrake",
  "ignition",
  "starter",
  "camera",
  "recenter",
  "headlights",
  "wipers",
  "telemetry",
  "help",
  "instructor",
  "pause",
  "recovery",
  "quick1",
  "quick2",
  "quick3",
  "quick4",
  "quick5",
  "quick6",
] as const;

export type InputAction = (typeof INPUT_ACTIONS)[number];

export type BindingMap = Record<InputAction, string[]>;

export const ACTION_LABELS: Record<InputAction, string> = {
  accelerator: "Accelerator",
  brake: "Brake",
  steerLeft: "Steer left",
  steerRight: "Steer right",
  clutchDepress: "Depress clutch",
  clutchRelease: "Release clutch",
  grabLever: "Grab / release lever",
  leverUp: "Lever up",
  leverDown: "Lever down",
  leverLeft: "Lever left",
  leverRight: "Lever right",
  neutral: "Select neutral",
  reverse: "Select reverse",
  handbrake: "Handbrake",
  ignition: "Ignition",
  starter: "Starter",
  camera: "Cycle camera",
  recenter: "Recenter view",
  headlights: "Headlights",
  wipers: "Wipers",
  telemetry: "Telemetry",
  help: "Help",
  instructor: "Instructor",
  pause: "Pause / settings",
  recovery: "Recovery (hold)",
  quick1: "Quick select 1",
  quick2: "Quick select 2",
  quick3: "Quick select 3",
  quick4: "Quick select 4",
  quick5: "Quick select 5",
  quick6: "Quick select 6",
};

export const DEFAULT_BINDINGS: BindingMap = {
  accelerator: ["KeyW"],
  brake: ["KeyS"],
  steerLeft: ["KeyA"],
  steerRight: ["KeyD"],
  clutchDepress: ["KeyZ"],
  clutchRelease: ["KeyX"],
  grabLever: ["Enter"],
  leverUp: ["ArrowUp"],
  leverDown: ["ArrowDown"],
  leverLeft: ["ArrowLeft"],
  leverRight: ["ArrowRight"],
  neutral: ["KeyN"],
  reverse: ["KeyR"],
  handbrake: ["Space"],
  ignition: ["KeyI"],
  starter: ["KeyK"],
  camera: ["KeyC"],
  recenter: ["Home"],
  headlights: ["KeyF"],
  wipers: ["KeyG"],
  telemetry: ["Tab"],
  help: ["F1"],
  instructor: ["F2"],
  pause: ["Escape"],
  recovery: ["Backspace"],
  quick1: ["Digit1"],
  quick2: ["Digit2"],
  quick3: ["Digit3"],
  quick4: ["Digit4"],
  quick5: ["Digit5"],
  quick6: ["Digit6"],
};

const KEY_LABELS: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Escape: "Esc",
  Backspace: "Backspace",
  Tab: "Tab",
  ArrowUp: "Up arrow",
  ArrowDown: "Down arrow",
  ArrowLeft: "Left arrow",
  ArrowRight: "Right arrow",
  Home: "Home",
  End: "End",
  PageUp: "Page Up",
  PageDown: "Page Down",
  ShiftLeft: "Left Shift",
  ShiftRight: "Right Shift",
  ControlLeft: "Left Ctrl",
  ControlRight: "Right Ctrl",
  AltLeft: "Left Alt",
  AltRight: "Right Alt",
  CapsLock: "Caps Lock",
  Delete: "Delete",
  Insert: "Insert",
};

export function formatKeyCode(code: string, labels?: ReadonlyMap<string, string>): string {
  const localized = labels?.get(code);
  if (localized && localized.length > 0) return localized.toUpperCase();
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  if (code.startsWith("F") && /^F\d{1,2}$/.test(code)) return code;
  return code;
}

export function bindingsEqual(a: BindingMap, b: BindingMap): boolean {
  return INPUT_ACTIONS.every((action) => {
    const left = a[action] ?? [];
    const right = b[action] ?? [];
    return left.length === right.length && left.every((code, index) => code === right[index]);
  });
}

export function findBindingOwner(bindings: BindingMap, code: string): InputAction | null {
  for (const action of INPUT_ACTIONS) {
    if ((bindings[action] ?? []).includes(code)) return action;
  }
  return null;
}

export function cloneBindings(bindings: BindingMap): BindingMap {
  return Object.fromEntries(
    INPUT_ACTIONS.map((action) => [action, [...(bindings[action] ?? [])]]),
  ) as BindingMap;
}

export function validateBindings(raw: unknown): BindingMap | null {
  if (typeof raw !== "object" || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const result = cloneBindings(DEFAULT_BINDINGS);
  for (const action of INPUT_ACTIONS) {
    const value = source[action];
    if (!Array.isArray(value)) continue;
    const codes = value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length < 64);
    if (codes.length > 0) result[action] = [...new Set(codes)].slice(0, 2);
  }
  return result;
}
