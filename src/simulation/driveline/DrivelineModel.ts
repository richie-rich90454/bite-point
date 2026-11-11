import { clamp01 } from "../core/MathUtils";
import type { Drivetrain } from "../config/VehicleConfig";

function average(values: ReadonlyArray<number>): number {
    if (values.length === 0) return 0;
    let sum = 0;
    for (const value of values) sum += value;
    return sum / values.length;
}

export class DrivelineModel {
    readonly frontDifferential = new OpenDifferential();
    readonly rearDifferential = new OpenDifferential();
    private readonly frontFraction: number;

    constructor(
        readonly finalDriveRatio: number,
        readonly efficiency: number,
        readonly drivetrain: Drivetrain = "FWD",
        awdTorqueSplit = 0.5,
    ) {
        this.frontFraction =
            drivetrain === "FWD" ? 1 : drivetrain === "RWD" ? 0 : clamp01(awdTorqueSplit);
    }

    get drivenWheelCount(): number {
        return this.drivetrain === "AWD" ? 4 : 2;
    }

    outputShaftOmega(
        frontWheelOmegas: ReadonlyArray<number>,
        rearWheelOmegas: ReadonlyArray<number> = [],
    ): number {
        const front = average(frontWheelOmegas);
        const rear = rearWheelOmegas.length > 0 ? average(rearWheelOmegas) : front;
        const wheelOmega =
            this.drivetrain === "FWD"
                ? front
                : this.drivetrain === "RWD"
                  ? rear
                  : this.frontFraction * front + (1 - this.frontFraction) * rear;
        return wheelOmega * this.finalDriveRatio;
    }

    gearboxInputOmega(outputOmega: number, gearRatio: number): number {
        return outputOmega * gearRatio;
    }

    totalWheelDriveTorque(clutchTorqueNm: number, gearRatio: number, torqueFactor: number): number {
        return clutchTorqueNm * gearRatio * this.finalDriveRatio * this.efficiency * torqueFactor;
    }

    driveTorqueByAxle(totalTorqueNm: number): { frontNm: number; rearNm: number } {
        return {
            frontNm: totalTorqueNm * this.frontFraction,
            rearNm: totalTorqueNm * (1 - this.frontFraction),
        };
    }

    reflectedInertiaKgM2(
        gearRatio: number,
        vehicleMassKg: number,
        wheelRadiusM: number,
        wheelInertiaKgM2: number,
        drivenWheelCount: number,
    ): number {
        const ratio = gearRatio * this.finalDriveRatio;
        const wheelAndVehicleInertia =
            vehicleMassKg * wheelRadiusM * wheelRadiusM + drivenWheelCount * wheelInertiaKgM2;
        return wheelAndVehicleInertia * ratio * ratio + 0.04;
    }

    wheelOmegaForEngineOmega(engineOmega: number, gearRatio: number): number {
        const ratio = gearRatio * this.finalDriveRatio;
        return ratio === 0 ? 0 : engineOmega / ratio;
    }

    engineOmegaForWheelOmega(wheelOmega: number, gearRatio: number): number {
        return wheelOmega * gearRatio * this.finalDriveRatio;
    }
}

export class OpenDifferential {
    distribute(totalTorqueNm: number): [number, number] {
        const half = totalTorqueNm / 2;
        return [half, half];
    }

    distributeByWheel(
        totalTorqueNm: number,
        leftOmega: number,
        rightOmega: number,
    ): [number, number] {
        void leftOmega;
        void rightOmega;
        return this.distribute(totalTorqueNm);
    }
}
