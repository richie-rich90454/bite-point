export interface ClockStats {
  fixedStepS: number;
  stepsLastFrame: number;
  alpha: number;
  overloaded: boolean;
  droppedTimeS: number;
  simulatedTimeS: number;
  catchUpFrames: number;
}

export class SimulationClock {
  readonly fixedStepS: number;
  readonly maxCatchUpSteps: number;
  private accumulator = 0;
  private simulatedTime = 0;
  private overloaded = false;
  private droppedTime = 0;
  private lastSteps = 0;
  private alpha = 0;
  private overloadFrames = 0;

  constructor(fixedStepS = 1 / 250, maxCatchUpSteps = 8) {
    if (!(fixedStepS > 0)) throw new Error("fixedStepS must be positive.");
    if (maxCatchUpSteps < 1) throw new Error("maxCatchUpSteps must be at least one.");
    this.fixedStepS = fixedStepS;
    this.maxCatchUpSteps = maxCatchUpSteps;
  }

  advance(realDeltaS: number, step: (dt: number) => void): ClockStats {
    const safeDelta = Number.isFinite(realDeltaS) ? Math.min(Math.max(realDeltaS, 0), 0.25) : 0;
    this.accumulator += safeDelta;
    let steps = 0;

    while (this.accumulator >= this.fixedStepS && steps < this.maxCatchUpSteps) {
      step(this.fixedStepS);
      this.accumulator -= this.fixedStepS;
      this.simulatedTime += this.fixedStepS;
      steps += 1;
    }

    if (this.accumulator >= this.fixedStepS) {
      const dropped = this.accumulator - (this.accumulator % this.fixedStepS);
      this.droppedTime += dropped;
      this.accumulator -= dropped;
      this.overloaded = true;
      this.overloadFrames = 30;
    } else if (this.overloadFrames > 0) {
      this.overloadFrames -= 1;
      if (this.overloadFrames === 0) this.overloaded = false;
    }

    this.alpha = this.accumulator / this.fixedStepS;
    this.lastSteps = steps;
    return this.stats();
  }

  reset(): void {
    this.accumulator = 0;
    this.alpha = 0;
    this.lastSteps = 0;
    this.overloaded = false;
    this.overloadFrames = 0;
    this.droppedTime = 0;
  }

  stats(): ClockStats {
    return {
      fixedStepS: this.fixedStepS,
      stepsLastFrame: this.lastSteps,
      alpha: this.alpha,
      overloaded: this.overloaded,
      droppedTimeS: this.droppedTime,
      simulatedTimeS: this.simulatedTime,
      catchUpFrames: this.overloadFrames,
    };
  }
}
