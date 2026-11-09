export class DrivelineModel {
    constructor(
        readonly finalDriveRatio: number,
        readonly efficiency: number,
    ) {}

    outputShaftOmega(frontWheelOmegas: ReadonlyArray<number>): number {
        if (frontWheelOmegas.length === 0) return 0;
        let sum = 0;
        for (const omega of frontWheelOmegas) sum += omega;
        return (sum / frontWheelOmegas.length) * this.finalDriveRatio;
    }

    gearboxInputOmega(outputOmega: number, gearRatio: number): number {
        return outputOmega * gearRatio;
    }

    totalWheelDriveTorque(clutchTorqueNm: number, gearRatio: number, torqueFactor: number): number {
        return clutchTorqueNm * gearRatio * this.finalDriveRatio * this.efficiency * torqueFactor;
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
