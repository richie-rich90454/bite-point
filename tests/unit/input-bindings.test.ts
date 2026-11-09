import { describe, expect, it } from "vitest";
import {
    ACTION_LABELS,
    DEFAULT_BINDINGS,
    INPUT_ACTIONS,
    findBindingOwner,
    formatKeyCode,
    validateBindings,
} from "../../src/input/bindings";
import { InputCalibration } from "../../src/input/InputCalibration";

describe("bindings", () => {
    it("binds every action and rejects duplicates", () => {
        for (const action of INPUT_ACTIONS) {
            expect(DEFAULT_BINDINGS[action].length).toBeGreaterThan(0);
            expect(ACTION_LABELS[action].length).toBeGreaterThan(2);
        }
        const codes = Object.values(DEFAULT_BINDINGS).flat();
        expect(new Set(codes).size).toBe(codes.length);
        expect(findBindingOwner(DEFAULT_BINDINGS, "KeyW")).toBe("accelerator");
    });

    it("uses physical key code labels", () => {
        expect(formatKeyCode("KeyW")).toBe("W");
        expect(formatKeyCode("ArrowUp")).toBe("Up arrow");
        expect(formatKeyCode("Digit1")).toBe("1");
        expect(formatKeyCode("Enter")).toBe("Enter");
        const layout = new Map([["KeyW", "z"]]);
        expect(formatKeyCode("KeyW", layout)).toBe("Z");
    });

    it("repairs malformed saved bindings", () => {
        const repaired = validateBindings({ accelerator: ["KeyQ", 42] });
        expect(repaired?.accelerator).toEqual(["KeyQ"]);
        expect(repaired?.brake).toEqual(DEFAULT_BINDINGS.brake);
    });
});

describe("InputCalibration", () => {
    it("applies a deadzone and response curves", () => {
        const calibration = new InputCalibration({
            deadzone: 0.1,
            throttleExponent: 2,
            brakeExponent: 1,
            clutchExponent: 1,
            steeringExponent: 1,
        });
        expect(calibration.throttle(0.05)).toBe(0);
        expect(calibration.throttle(1)).toBe(1);
        expect(calibration.throttle(0.5)).toBeLessThan(0.5);
        expect(calibration.steering(-1)).toBe(-1);
        expect(calibration.steering(0.05)).toBe(0);
    });
});
