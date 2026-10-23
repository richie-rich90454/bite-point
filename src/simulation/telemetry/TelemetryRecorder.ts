import { RingBuffer } from "./RingBuffer";

export interface TelemetrySample {
  t: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  speedMps: number;
  forwardSpeed: number;
  lateralSpeed: number;
  yawRate: number;
  engineRpm: number;
  engineTorqueNm: number;
  clutchPedal: number;
  clutchSlipRadPerSec: number;
  clutchTempC: number;
  clutchWear: number;
  gear: number;
  throttle: number;
  brake: number;
  steering: number;
  handbrake: boolean;
  running: boolean;
  fuelCut: boolean;
  frontSlip: number;
  rearSlip: number;
  wheelOmegas: [number, number, number, number];
  wheelSteer: number;
  surfaceMu: number;
  slope: number;
}

export class TelemetryRecorder {
  private readonly buffer: RingBuffer<TelemetrySample>;
  private nextSampleTime = 0;
  private elapsed = 0;

  constructor(
    readonly sampleRateHz = 20,
    readonly capacitySeconds = 60,
  ) {
    if (!(sampleRateHz > 0)) throw new Error("sampleRateHz must be positive.");
    this.buffer = new RingBuffer<TelemetrySample>(Math.round(sampleRateHz * capacitySeconds));
  }

  update(dt: number, sampleFactory: () => TelemetrySample): void {
    this.elapsed += dt;
    if (this.elapsed >= this.nextSampleTime) {
      this.nextSampleTime += 1 / this.sampleRateHz;
      if (this.nextSampleTime <= this.elapsed) this.nextSampleTime = this.elapsed + 1 / this.sampleRateHz;
      this.buffer.push(sampleFactory());
    }
  }

  get size(): number {
    return this.buffer.size;
  }

  latest(): TelemetrySample | undefined {
    return this.buffer.latest();
  }

  samples(): TelemetrySample[] {
    return this.buffer.toArray();
  }

  clear(): void {
    this.buffer.clear();
    this.elapsed = 0;
    this.nextSampleTime = 0;
  }

  exportJson(): string {
    return JSON.stringify(
      {
        format: "bite-point-telemetry",
        version: 1,
        sampleRateHz: this.sampleRateHz,
        samples: this.samples(),
      },
      null,
      2,
    );
  }
}
