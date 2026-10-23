export type Provenance = "measured" | "documented" | "estimated" | "unvalidated";

export type GateSlot = -1 | 0 | 1;

export interface GearPosition {
  gear: number;
  gate: number;
  slot: GateSlot;
}

export interface EngineConfig {
  idleRpm: number;
  redlineRpm: number;
  stallRpm: number;
  startRpm: number;
  inertiaKgM2: number;
  starterTorqueNm: number;
  frictionBaseNm: number;
  frictionPerRadPerSec: number;
  pumpingLossNm: number;
  torqueCurve: Array<[number, number]>;
}

export interface ClutchConfig {
  maxCapacityNm: number;
  frictionCoeff: number;
  effectiveRadiusM: number;
  frictionSurfaces: number;
  bitePoint: number;
  engagementWidth: number;
  thermalMassJK: number;
  ambientTempC: number;
  maxTempC: number;
  coolingPerSecond: number;
  wearRatePerJoule: number;
}

export interface GearboxConfig {
  shiftTimeS: number;
  syncSpeedThresholdRadPerSec: number;
  reverseMaxSpeedMps: number;
  gates: GearPosition[];
}

export interface TireConfig {
  mu: number;
  peakSlip: number;
  peakSlipAngleRad: number;
  loadSensitivity: number;
  rollingResistance: number;
  lateralStiffnessFactor: number;
}

export interface SteeringConfig {
  maxAngleRad: number;
  rateRadPerSec: number;
  returnRateRadPerSec: number;
  highSpeedFactor: number;
  speedSensitivityKph: number;
}

export interface BrakeConfig {
  frontTorqueNm: number;
  rearTorqueNm: number;
  handbrakeTorqueNm: number;
}

export interface SuspensionConfig {
  springRateFrontNm: number;
  springRateRearNm: number;
  damperNsm: number;
  rideHeightM: number;
  maxCompressionM: number;
  bumpStopRateNm: number;
}

export interface AeroConfig {
  dragAreaCdA: number;
  airDensity: number;
  maxSpeedKph: number;
}

export interface VehicleConfig {
  schemaVersion: number;
  id: string;
  name: string;
  massKg: number;
  wheelbaseM: number;
  trackM: number;
  cgHeightM: number;
  frontWeightBias: number;
  wheelRadiusM: number;
  wheelInertiaKgM2: number;
  finalDriveRatio: number;
  drivetrainEfficiency: number;
  gearRatios: number[];
  reverseRatio: number;
  engine: EngineConfig;
  clutch: ClutchConfig;
  gearbox: GearboxConfig;
  tires: TireConfig;
  steering: SteeringConfig;
  brakes: BrakeConfig;
  suspension: SuspensionConfig;
  aero: AeroConfig;
  provenance: Record<string, Provenance>;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const provenanceValues: readonly Provenance[] = ["measured", "documented", "estimated", "unvalidated"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateVehicleConfig(raw: unknown): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(raw)) {
    return { valid: false, errors: ["Vehicle configuration must be an object."], warnings };
  }

  const num = (path: string, min: number, max: number): number => {
    const parts = path.split(".");
    let current: unknown = raw;
    for (const part of parts) {
      if (!isRecord(current)) break;
      current = current[part];
    }
    if (typeof current !== "number" || !Number.isFinite(current)) {
      errors.push(`${path} must be a finite number.`);
      return Number.NaN;
    }
    if (current < min || current > max) {
      errors.push(`${path} must be between ${min} and ${max}, received ${current}.`);
    }
    return current;
  };

  const str = (path: string): string => {
    const value = raw[path];
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`${path} must be a non-empty string.`);
      return "";
    }
    return value;
  };

  if (raw.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  str("id");
  str("name");

  const mass = num("massKg", 300, 5000);
  const wheelbase = num("wheelbaseM", 1.5, 5);
  num("trackM", 1.0, 3);
  num("cgHeightM", 0.2, 1.2);
  const bias = num("frontWeightBias", 0.2, 0.8);
  num("wheelRadiusM", 0.15, 0.7);
  num("wheelInertiaKgM2", 0.05, 20);
  num("finalDriveRatio", 1, 8);
  num("drivetrainEfficiency", 0.5, 1);

  const ratios = raw.gearRatios;
  if (!Array.isArray(ratios) || ratios.length !== 6) {
    errors.push("gearRatios must contain exactly six forward ratios.");
  } else {
    ratios.forEach((ratio, index) => {
      if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0.4 || ratio > 8) {
        errors.push(`gearRatios[${index}] must be between 0.4 and 8.`);
      }
      if (index > 0 && typeof ratios[index - 1] === "number" && typeof ratio === "number" && ratio >= (ratios[index - 1] as number)) {
        errors.push("gearRatios must be strictly decreasing from first to sixth.");
      }
    });
  }
  num("reverseRatio", -8, -0.4);

  if (!isRecord(raw.engine)) errors.push("engine section is required.");
  else {
    const idle = num("engine.idleRpm", 400, 1500);
    const redline = num("engine.redlineRpm", 3000, 12000);
    const stall = num("engine.stallRpm", 100, 1000);
    num("engine.startRpm", 150, 1200);
    if (stall >= idle) errors.push("engine.stallRpm must be below engine.idleRpm.");
    if (idle >= redline) errors.push("engine.idleRpm must be below engine.redlineRpm.");
    num("engine.inertiaKgM2", 0.05, 2);
    num("engine.starterTorqueNm", 10, 500);
    num("engine.frictionBaseNm", 0, 100);
    num("engine.frictionPerRadPerSec", 0, 1);
    num("engine.pumpingLossNm", 0, 200);

    const curve = raw.engine.torqueCurve;
    if (!Array.isArray(curve) || curve.length < 3) {
      errors.push("engine.torqueCurve must contain at least three [rpm, torque] points.");
    } else {
      let previousRpm = -1;
      for (const [index, point] of curve.entries()) {
        if (!Array.isArray(point) || point.length !== 2 || typeof point[0] !== "number" || typeof point[1] !== "number") {
          errors.push(`engine.torqueCurve[${index}] must be an [rpm, torque] pair.`);
          continue;
        }
        if (point[0] <= previousRpm) errors.push("engine.torqueCurve rpm values must be strictly increasing.");
        if (point[0] < 300 || point[0] > 12000) errors.push(`engine.torqueCurve[${index}] rpm is out of range.`);
        if (point[1] < 0 || point[1] > 1500) errors.push(`engine.torqueCurve[${index}] torque is out of range.`);
        previousRpm = point[0];
      }
      if (Number.isFinite(idle) && Number.isFinite(redline)) {
        const first = curve[0] as [number, number] | undefined;
        const last = curve[curve.length - 1] as [number, number] | undefined;
        if (first && first[0] > idle) errors.push("engine.torqueCurve must start at or below idle rpm.");
        if (last && last[0] < redline) errors.push("engine.torqueCurve must extend to the redline.");
      }
    }
  }

  if (!isRecord(raw.clutch)) errors.push("clutch section is required.");
  else {
    num("clutch.maxCapacityNm", 20, 3000);
    num("clutch.frictionCoeff", 0.05, 1.5);
    num("clutch.effectiveRadiusM", 0.02, 0.3);
    num("clutch.frictionSurfaces", 1, 8);
    num("clutch.bitePoint", 0.05, 0.95);
    num("clutch.engagementWidth", 0.02, 0.5);
    const bite = raw.clutch.bitePoint;
    const width = raw.clutch.engagementWidth;
    if (typeof bite === "number" && typeof width === "number" && bite + width > 1.01) {
      errors.push("clutch.bitePoint + clutch.engagementWidth must not exceed 1.");
    }
    num("clutch.thermalMassJK", 100, 100000);
    num("clutch.ambientTempC", -40, 60);
    num("clutch.maxTempC", 80, 1200);
    num("clutch.coolingPerSecond", 0, 0.5);
    num("clutch.wearRatePerJoule", 0, 1e-3);
  }

  if (!isRecord(raw.gearbox)) errors.push("gearbox section is required.");
  else {
    num("gearbox.shiftTimeS", 0.02, 1.5);
    num("gearbox.syncSpeedThresholdRadPerSec", 0.5, 200);
    num("gearbox.reverseMaxSpeedMps", 0, 10);
    const gates = raw.gearbox.gates;
    if (!Array.isArray(gates) || gates.length < 7) {
      errors.push("gearbox.gates must define neutral plus six forward gears, optionally reverse.");
    } else {
      const seen = new Set<number>();
      for (const [index, gate] of gates.entries()) {
        if (!isRecord(gate)) {
          errors.push(`gearbox.gates[${index}] must be an object.`);
          continue;
        }
        const gear = gate.gear;
        const gateIndex = gate.gate;
        const slot = gate.slot;
        if (typeof gear !== "number" || !Number.isInteger(gear) || gear < -1 || gear > 6) {
          errors.push(`gearbox.gates[${index}].gear must be an integer from -1 to 6.`);
        } else if (seen.has(gear)) {
          errors.push(`gearbox.gates contains duplicate gear ${gear}.`);
        } else {
          seen.add(gear);
        }
        if (typeof gateIndex !== "number" || !Number.isInteger(gateIndex) || gateIndex < 0 || gateIndex > 4) {
          errors.push(`gearbox.gates[${index}].gate must be an integer from 0 to 4.`);
        }
        if (slot !== -1 && slot !== 0 && slot !== 1) {
          errors.push(`gearbox.gates[${index}].slot must be -1, 0 or 1.`);
        }
      }
      for (const gear of [0, 1, 2, 3, 4, 5, 6]) {
        if (!seen.has(gear)) warnings.push(`gearbox.gates does not define gear ${gear}.`);
      }
    }
  }

  if (!isRecord(raw.tires)) errors.push("tires section is required.");
  else {
    num("tires.mu", 0.2, 2.0);
    num("tires.peakSlip", 0.02, 0.5);
    num("tires.peakSlipAngleRad", 0.02, 0.5);
    num("tires.loadSensitivity", 0, 0.8);
    num("tires.rollingResistance", 0, 0.1);
    num("tires.lateralStiffnessFactor", 0.2, 3);
  }

  if (!isRecord(raw.steering)) errors.push("steering section is required.");
  else {
    num("steering.maxAngleRad", 0.1, 1.2);
    num("steering.rateRadPerSec", 0.2, 10);
    num("steering.returnRateRadPerSec", 0.2, 15);
    num("steering.highSpeedFactor", 0.1, 1);
    num("steering.speedSensitivityKph", 10, 300);
  }

  if (!isRecord(raw.brakes)) errors.push("brakes section is required.");
  else {
    num("brakes.frontTorqueNm", 100, 12000);
    num("brakes.rearTorqueNm", 50, 12000);
    num("brakes.handbrakeTorqueNm", 100, 12000);
  }

  if (!isRecord(raw.suspension)) errors.push("suspension section is required.");
  else {
    num("suspension.springRateFrontNm", 1000, 200000);
    num("suspension.springRateRearNm", 1000, 200000);
    num("suspension.damperNsm", 100, 50000);
    num("suspension.rideHeightM", 0.05, 0.6);
    num("suspension.maxCompressionM", 0.02, 0.3);
    num("suspension.bumpStopRateNm", 10000, 1000000);
  }

  if (!isRecord(raw.aero)) errors.push("aero section is required.");
  else {
    num("aero.dragAreaCdA", 0.1, 3);
    num("aero.airDensity", 0.5, 2);
    num("aero.maxSpeedKph", 50, 400);
  }

  if (bias > 0 && wheelbase > 0 && mass > 0) {
    const frontLoad = mass * 9.81 * bias;
    if (frontLoad > 30000) warnings.push("Front axle load looks unusually high.");
  }

  const provenance = raw.provenance;
  if (!isRecord(provenance)) {
    errors.push("provenance map is required.");
  } else {
    for (const [path, value] of Object.entries(provenance)) {
      if (typeof value !== "string" || !provenanceValues.includes(value as Provenance)) {
        errors.push(`provenance.${path} must be measured, documented, estimated or unvalidated.`);
      }
    }
    const required = [
      "massKg",
      "wheelbaseM",
      "frontWeightBias",
      "engine.torqueCurve",
      "engine.inertiaKgM2",
      "clutch.maxCapacityNm",
      "clutch.bitePoint",
      "gearRatios",
      "finalDriveRatio",
      "tires.mu",
      "tires.peakSlip",
      "steering.maxAngleRad",
      "brakes.frontTorqueNm",
      "suspension.springRateFrontNm",
    ];
    for (const path of required) {
      if (!(path in provenance)) warnings.push(`provenance is missing an entry for ${path}.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function assertValidVehicleConfig(raw: unknown): VehicleConfig {
  const result = validateVehicleConfig(raw);
  if (!result.valid) {
    throw new Error(`Invalid vehicle configuration:\n${result.errors.join("\n")}`);
  }
  return raw as VehicleConfig;
}

export function provenanceOf(config: VehicleConfig, path: string): Provenance {
  return config.provenance[path] ?? "unvalidated";
}
