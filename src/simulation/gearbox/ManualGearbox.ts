import { clamp01 } from "../core/MathUtils";

export type EngagementFailure = "synchronizer" | "reverse-lockout" | "shift-in-progress";

export interface EngagementContext {
  clutchDisengaged: boolean;
  inputOmega: number;
  outputOmega: number;
  speedMps: number;
}

export interface EngagementResult {
  engaged: boolean;
  reason?: EngagementFailure;
  requestedGear: number;
  synchronizerDelta: number;
}

export class SynchronizerModel {
  constructor(
    private readonly speedThresholdRadPerSec: number,
    private readonly capacityNm = 220,
  ) {}

  canEngage(inputOmega: number, targetOmega: number, clutchDisengaged: boolean): boolean {
    const delta = Math.abs(inputOmega - targetOmega);
    if (clutchDisengaged) return true;
    return delta <= this.speedThresholdRadPerSec;
  }

  synchronizerTorque(deltaRadPerSec: number): number {
    const direction = Math.sign(deltaRadPerSec);
    return -direction * Math.min(this.capacityNm, Math.abs(deltaRadPerSec) * 2.2);
  }

  get threshold(): number {
    return this.speedThresholdRadPerSec;
  }
}

export interface ManualGearboxParameters {
  gearRatios: number[];
  reverseRatio: number;
  shiftTimeS: number;
  reverseMaxSpeedMps: number;
  synchronizer: SynchronizerModel;
}

export class ManualGearbox {
  gear = 0;
  torqueFactor = 0;
  private shiftTimer = 0;
  private shiftInProgress = false;

  constructor(private readonly params: ManualGearboxParameters) {}

  get isNeutral(): boolean {
    return this.gear === 0;
  }

  get isReverse(): boolean {
    return this.gear === -1;
  }

  get ratio(): number {
    return this.ratioForGear(this.gear);
  }

  ratioForGear(gear: number): number {
    if (gear === 0) return 0;
    if (gear === -1) return this.params.reverseRatio;
    return this.params.gearRatios[gear - 1] ?? 0;
  }

  update(dt: number): void {
    if (this.gear === 0) {
      this.torqueFactor = 0;
      this.shiftTimer = 0;
      return;
    }
    this.shiftTimer += dt;
    this.torqueFactor = clamp01(this.shiftTimer / this.params.shiftTimeS);
    if (this.torqueFactor >= 1) this.shiftInProgress = false;
  }

  tryEngage(requestedGear: number, context: EngagementContext): EngagementResult {
    const targetOmega = requestedGear === 0 ? context.inputOmega : context.outputOmega * this.ratioForGear(requestedGear);
    const delta = Math.abs(context.inputOmega - targetOmega);

    if (requestedGear === this.gear) {
      return { engaged: true, requestedGear, synchronizerDelta: delta };
    }

    if (requestedGear === -1) {
      if (context.speedMps > this.params.reverseMaxSpeedMps) {
        return { engaged: false, reason: "reverse-lockout", requestedGear, synchronizerDelta: delta };
      }
      if (!context.clutchDisengaged) {
        return { engaged: false, reason: "synchronizer", requestedGear, synchronizerDelta: delta };
      }
    }

    if (requestedGear !== 0 && !this.params.synchronizer.canEngage(context.inputOmega, targetOmega, context.clutchDisengaged)) {
      return { engaged: false, reason: "synchronizer", requestedGear, synchronizerDelta: delta };
    }

    this.gear = requestedGear;
    this.shiftTimer = 0;
    this.torqueFactor = requestedGear === 0 ? 0 : 0.0001;
    this.shiftInProgress = requestedGear !== 0;
    return { engaged: true, requestedGear, synchronizerDelta: delta };
  }

  get shifting(): boolean {
    return this.shiftInProgress;
  }

  get shiftProgress(): number {
    return this.torqueFactor;
  }

  reset(gear = 0): void {
    this.gear = gear;
    this.torqueFactor = gear === 0 ? 0 : 1;
    this.shiftTimer = this.params.shiftTimeS;
    this.shiftInProgress = false;
  }
}
