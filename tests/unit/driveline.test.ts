import { describe, expect, it } from "vitest";
import { DrivelineModel } from "../../src/simulation/driveline/DrivelineModel";
import type { Drivetrain } from "../../src/simulation/config/VehicleConfig";

const finalDrive = 3.6;
const efficiency = 0.92;

function makeDriveline(drivetrain: Drivetrain, awdTorqueSplit = 0.45): DrivelineModel {
    return new DrivelineModel(finalDrive, efficiency, drivetrain, awdTorqueSplit);
}

const front = [10, 14];
const rear = [20, 24];

describe("DrivelineModel drivetrains", () => {
    it("reads the output shaft from the driven axle", () => {
        expect(makeDriveline("FWD").outputShaftOmega(front, rear)).toBeCloseTo(12 * finalDrive);
        expect(makeDriveline("RWD").outputShaftOmega(front, rear)).toBeCloseTo(22 * finalDrive);
    });

    it("weights both axles for AWD", () => {
        expect(makeDriveline("AWD", 0.25).outputShaftOmega(front, rear)).toBeCloseTo(
            (0.25 * 12 + 0.75 * 22) * finalDrive,
        );
        expect(makeDriveline("AWD", 0.6).outputShaftOmega(front, rear)).toBeCloseTo(
            (0.6 * 12 + 0.4 * 22) * finalDrive,
        );
    });

    it("splits drive torque between the axles", () => {
        expect(makeDriveline("FWD").driveTorqueByAxle(1000)).toEqual({
            frontNm: 1000,
            rearNm: 0,
        });
        expect(makeDriveline("RWD").driveTorqueByAxle(1000)).toEqual({
            frontNm: 0,
            rearNm: 1000,
        });
        expect(makeDriveline("AWD", 0.45).driveTorqueByAxle(1000)).toEqual({
            frontNm: 450,
            rearNm: 550,
        });
    });

    it("reflects two wheels for two-wheel drive and four for AWD", () => {
        expect(makeDriveline("FWD").drivenWheelCount).toBe(2);
        expect(makeDriveline("RWD").drivenWheelCount).toBe(2);
        expect(makeDriveline("AWD").drivenWheelCount).toBe(4);
    });

    it("keeps an open differential per axle", () => {
        const driveline = makeDriveline("AWD", 0.5);
        expect(driveline.frontDifferential.distribute(1000)).toEqual([500, 500]);
        expect(driveline.rearDifferential.distribute(1000)).toEqual([500, 500]);
    });
});
