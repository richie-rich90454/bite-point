// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { InputService } from "../../src/input/InputService";
import { DEFAULT_SETTINGS } from "../../src/settings/SettingsRepository";
import { cloneBindings } from "../../src/input/bindings";

const makeSettings = () => ({
    ...DEFAULT_SETTINGS,
    bindings: cloneBindings(DEFAULT_SETTINGS.bindings),
});

const key = (type: "keydown" | "keyup", code: string): KeyboardEvent =>
    new window.KeyboardEvent(type, { code, bubbles: true, cancelable: true });

describe("InputService", () => {
    let input: InputService;

    beforeEach(() => {
        input = new InputService(window, makeSettings());
    });

    it("ramps throttle while held and releases on key-up", () => {
        window.dispatchEvent(key("keydown", "KeyW"));
        input.update(0.1, false);
        const pressed = input.getControls().throttle;
        expect(pressed).toBeGreaterThan(0);
        window.dispatchEvent(key("keyup", "KeyW"));
        input.update(0.5, false);
        expect(input.getControls().throttle).toBeLessThan(pressed);
        input.dispose();
    });

    it("moves the clutch pedal with Z and X and holds position", () => {
        window.dispatchEvent(key("keydown", "KeyZ"));
        input.update(0.2, false);
        const depressed = input.getControls().clutchPedal;
        expect(depressed).toBeGreaterThan(0.2);
        window.dispatchEvent(key("keyup", "KeyZ"));
        input.update(0.2, false);
        expect(input.getControls().clutchPedal).toBeCloseTo(depressed, 5);
        window.dispatchEvent(key("keydown", "KeyX"));
        input.update(0.2, false);
        expect(input.getControls().clutchPedal).toBeLessThan(depressed);
        input.dispose();
    });

    it("releases throttle and depresses the clutch on focus loss", () => {
        window.dispatchEvent(key("keydown", "KeyW"));
        input.update(0.5, false);
        window.dispatchEvent(new Event("blur"));
        const controls = input.getControls();
        expect(controls.throttle).toBe(0);
        expect(controls.brake).toBe(0);
        expect(controls.clutchPedal).toBe(1);
        expect(controls.handbrake).toBe(true);
        input.dispose();
    });

    it("emits one shifter move per tap and uses its own key repeat", () => {
        window.dispatchEvent(key("keydown", "ArrowUp"));
        const first = input.consumeCommands();
        expect(first).toEqual([{ type: "shifter-move", direction: "up" }]);
        input.update(0.1, true);
        expect(input.consumeCommands()).toEqual([]);
        input.update(0.1, true);
        input.update(0.1, true);
        input.update(0.1, true);
        expect(input.consumeCommands()).toEqual([{ type: "shifter-move", direction: "up" }]);
        window.dispatchEvent(key("keyup", "ArrowUp"));
        input.dispose();
    });

    it("rebinds a key and rejects duplicate assignments", async () => {
        const promise = input.rebind("accelerator");
        window.dispatchEvent(key("keydown", "KeyQ"));
        const result = await promise;
        expect(result.ok).toBe(true);
        expect(input.formatBinding("accelerator")).toBe("Q");

        const duplicate = input.rebind("brake");
        window.dispatchEvent(key("keydown", "KeyQ"));
        const duplicateResult = await duplicate;
        expect(duplicateResult.ok).toBe(false);
        expect(duplicateResult.error).toContain("Accelerator");
        input.dispose();
    });

    it("queues pause and recovery commands", () => {
        window.dispatchEvent(key("keydown", "Escape"));
        window.dispatchEvent(key("keyup", "Escape"));
        expect(input.consumeCommands()).toContainEqual({ type: "pause" });

        window.dispatchEvent(key("keydown", "Backspace"));
        for (let index = 0; index < 16; index += 1) input.update(0.1, false);
        expect(input.consumeCommands()).toContainEqual({ type: "recovery" });
        for (let index = 0; index < 20; index += 1) input.update(0.1, false);
        expect(input.consumeCommands()).not.toContainEqual({ type: "recovery" });
        input.dispose();
    });
});
