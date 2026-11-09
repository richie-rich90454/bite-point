import { describe, expect, it } from "vitest";
import { HPatternShifter } from "../../src/simulation/gearbox/HPatternShifter";
import config from "../../src/data/reference-compact.json";
import type { GearPosition } from "../../src/simulation/config/VehicleConfig";

const makeShifter = (): HPatternShifter =>
    new HPatternShifter({
        positions: config.gearbox.gates as GearPosition[],
        shiftTimeS: config.gearbox.shiftTimeS,
    });

describe("HPatternShifter", () => {
    it("starts in neutral in the centre gate", () => {
        const shifter = makeShifter();
        expect(shifter.selectedGear).toBe(0);
        expect(shifter.gate).toBe(1);
        expect(shifter.slot).toBe(0);
    });

    it("requires grabbing the lever before moving", () => {
        const shifter = makeShifter();
        expect(shifter.moveLeft().moved).toBe(false);
        shifter.grab();
        expect(shifter.moveLeft().moved).toBe(true);
    });

    it("selects first through left then forward", () => {
        const shifter = makeShifter();
        shifter.grab();
        expect(shifter.moveLeft().moved).toBe(true);
        expect(shifter.moveUp().moved).toBe(true);
        expect(shifter.selectedGear).toBe(1);
        expect(shifter.release()).toBe(1);
    });

    it("must pass through neutral between first and second", () => {
        const shifter = makeShifter();
        shifter.reset(1);
        shifter.grab();
        expect(shifter.moveDown().moved).toBe(true);
        expect(shifter.slot).toBe(0);
        expect(shifter.selectedGear).toBe(0);
        expect(shifter.moveDown().moved).toBe(true);
        expect(shifter.selectedGear).toBe(2);
        expect(shifter.release()).toBe(2);
    });

    it("cannot cross gates while a gear is selected", () => {
        const shifter = makeShifter();
        shifter.reset(1);
        shifter.grab();
        expect(shifter.moveRight().moved).toBe(false);
        expect(shifter.gate).toBe(0);
    });

    it("moves through the gate sequence to sixth", () => {
        const shifter = makeShifter();
        shifter.grab();
        shifter.moveLeft();
        shifter.moveUp();
        expect(shifter.release()).toBe(1);
        shifter.grab();
        shifter.moveDown();
        shifter.moveDown();
        expect(shifter.release()).toBe(2);
        shifter.grab();
        shifter.moveUp();
        shifter.moveRight();
        shifter.moveUp();
        expect(shifter.release()).toBe(3);
    });

    it("requests reverse at the far gate", () => {
        const shifter = makeShifter();
        expect(shifter.requestReverse()).toBe(true);
        expect(shifter.selectedGear).toBe(-1);
        shifter.requestNeutral();
        expect(shifter.selectedGear).toBe(0);
    });
});
