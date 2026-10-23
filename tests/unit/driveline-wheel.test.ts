import { describe, expect, it } from "vitest";
import { DrivelineModel } from "../../src/simulation/driveline/DrivelineModel";
import { WheelModel } from "../../src/simulation/vehicle/WheelModel";
import { TireModel } from "../../src/simulation/tires/TireModel";
import config from "../../src/data/reference-compact.json";

const driveline = new DrivelineModel(config.finalDriveRatio, config.drivetrainEfficiency);
const tire = new TireModel(config.tires);

describe("DrivelineModel", () => {
  it("maps wheel speed through the final drive and gearbox", () => {
    const wheelOmega = 20;
    const output = driveline.outputShaftOmega([wheelOmega, wheelOmega]);
    expect(output).toBeCloseTo(wheelOmega * config.finalDriveRatio);
    const gearRatio = config.gearRatios[1]!;
    const input = driveline.gearboxInputOmega(output, gearRatio);
    expect(input).toBeCloseTo(wheelOmega * config.finalDriveRatio * gearRatio);
    expect(driveline.engineOmegaForWheelOmega(wheelOmega, gearRatio)).toBeCloseTo(input);
  });

  it("transmits torque and reflects inertia through the selected gear", () => {
    const torque = 120;
    const total = driveline.totalWheelDriveTorque(torque, config.gearRatios[0]!, 1);
    expect(total).toBeCloseTo(torque * config.gearRatios[0]! * config.finalDriveRatio * config.drivetrainEfficiency);
    const first = driveline.reflectedInertiaKgM2(config.gearRatios[0]!, config.massKg, config.wheelRadiusM, config.wheelInertiaKgM2, 2);
    const third = driveline.reflectedInertiaKgM2(config.gearRatios[2]!, config.massKg, config.wheelRadiusM, config.wheelInertiaKgM2, 2);
    expect(first).toBeGreaterThan(third);
  });
});

describe("WheelModel", () => {
  it("free-rolls without longitudinal force when undriven and unbraked", () => {
    const wheel = new WheelModel("test", tire);
    wheel.setOmega(0);
    const result = wheel.update({
      dt: 1 / 250,
      driveTorqueNm: 0,
      brakeTorqueNm: 0,
      normalLoadN: 4000,
      forwardSpeedMps: 5,
      surfaceMu: 1,
      wheelRadiusM: config.wheelRadiusM,
      wheelInertiaKgM2: config.wheelInertiaKgM2,
    });
    expect(result.omega).toBeCloseTo(5 / config.wheelRadiusM);
    expect(Math.abs(result.longitudinalForceN)).toBe(0);
  });

  it("limits drive force to tire grip", () => {
    const wheel = new WheelModel("test", tire);
    wheel.setOmega(0);
    const result = wheel.update({
      dt: 1 / 250,
      driveTorqueNm: 2500,
      brakeTorqueNm: 0,
      normalLoadN: 4000,
      forwardSpeedMps: 0,
      surfaceMu: 1,
      wheelRadiusM: config.wheelRadiusM,
      wheelInertiaKgM2: config.wheelInertiaKgM2,
    });
    const max = tire.maxLongitudinalForce(4000, 1);
    expect(Math.abs(result.longitudinalForceN)).toBeLessThanOrEqual(max * 1.001);
    expect(result.omega).toBeGreaterThan(0);
  });

  it("stops a braked wheel and generates a braking force", () => {
    const wheel = new WheelModel("test", tire);
    wheel.setOmega(20);
    const result = wheel.update({
      dt: 1 / 250,
      driveTorqueNm: 0,
      brakeTorqueNm: 2500,
      normalLoadN: 4000,
      forwardSpeedMps: 6,
      surfaceMu: 1,
      wheelRadiusM: config.wheelRadiusM,
      wheelInertiaKgM2: config.wheelInertiaKgM2,
    });
    expect(result.omega).toBeLessThan(20);
    expect(result.longitudinalForceN).toBeLessThan(0);
    expect(Number.isFinite(result.omega)).toBe(true);
  });
});
