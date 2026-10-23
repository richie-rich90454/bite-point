import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";

interface NoiseLayer {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineOscillators: OscillatorNode[] = [];
  private intake: NoiseLayer | null = null;
  private wind: NoiseLayer | null = null;
  private tire: NoiseLayer | null = null;
  private starterGain: GainNode | null = null;
  private starterOsc: OscillatorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled: boolean;
  private volume: number;
  private initialized = false;

  constructor(enabled = true, volume = 0.7) {
    this.enabled = enabled;
    this.volume = volume;
  }

  async start(): Promise<void> {
    if (this.initialized) {
      await this.context?.resume();
      return;
    }
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(context.destination);

    this.noiseBuffer = this.createNoiseBuffer(context);
    this.engineFilter = context.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 800;
    this.engineFilter.Q.value = 0.8;
    this.engineGain = context.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    const frequencies = [1, 2.01, 0.5];
    const types: OscillatorType[] = ["sawtooth", "square", "triangle"];
    for (let index = 0; index < frequencies.length; index += 1) {
      const oscillator = context.createOscillator();
      oscillator.type = types[index]!;
      oscillator.frequency.value = 32 * frequencies[index]!;
      const gain = context.createGain();
      gain.gain.value = index === 0 ? 0.55 : index === 1 ? 0.18 : 0.35;
      oscillator.connect(gain);
      gain.connect(this.engineFilter);
      oscillator.start();
      this.engineOscillators.push(oscillator);
    }

    this.intake = this.createNoiseLayer(context, "bandpass", 720, 1.2, 0);
    this.wind = this.createNoiseLayer(context, "lowpass", 500, 0.7, 0);
    this.tire = this.createNoiseLayer(context, "bandpass", 1600, 0.9, 0);

    this.starterOsc = context.createOscillator();
    this.starterOsc.type = "sawtooth";
    this.starterOsc.frequency.value = 88;
    this.starterGain = context.createGain();
    this.starterGain.gain.value = 0;
    this.starterOsc.connect(this.starterGain);
    this.starterGain.connect(this.master);
    this.starterOsc.start();

    this.initialized = true;
    await context.resume();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(enabled ? this.volume : 0, this.context.currentTime, 0.08);
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.context && this.enabled) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.08);
    }
  }

  update(state: VehicleRenderState, dt: number): void {
    if (!this.context || !this.engineGain || !this.engineFilter) return;
    const context = this.context;
    const now = context.currentTime;
    const rpm = Math.max(0, state.rpm);
    const firingFrequency = Math.max(18, (rpm / 60) * 2);
    for (let index = 0; index < this.engineOscillators.length; index += 1) {
      const multiplier = index === 0 ? 1 : index === 1 ? 2.008 : 0.5;
      this.engineOscillators[index]!.frequency.setTargetAtTime(firingFrequency * multiplier, now, 0.035);
    }
    const load = state.engineRunning ? 0.13 + state.throttle * 0.22 : 0;
    const targetGain = state.engineRunning ? load : 0;
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);
    const cutoff = 240 + rpm * 0.3 + state.throttle * 1600;
    this.engineFilter.frequency.setTargetAtTime(Math.min(7000, cutoff), now, 0.06);

    if (this.intake) {
      this.intake.gain.gain.setTargetAtTime(state.engineRunning ? state.throttle * 0.035 : 0, now, 0.08);
    }
    if (this.wind) {
      const windGain = Math.min(0.14, (state.speedMps / 42) ** 2 * 0.14);
      this.wind.gain.gain.setTargetAtTime(windGain, now, 0.2);
    }
    if (this.tire) {
      const surfaceFactor = state.sessionSurfaceMu < 0.8 ? 1.7 : 1;
      const tireGain = Math.min(0.1, (state.speedMps / 32) * 0.1) * surfaceFactor;
      this.tire.gain.gain.setTargetAtTime(tireGain, now, 0.15);
    }
    if (this.starterGain) {
      this.starterGain.gain.setTargetAtTime(state.cranking ? 0.055 : 0, now, 0.05);
    }
    if (this.starterOsc) {
      const wobble = 70 + (state.rpm % 120) * 0.25;
      this.starterOsc.frequency.setTargetAtTime(wobble, now, 0.05);
    }
    void dt;
  }

  playGearClunk(gear: number): void {
    if (!this.context || !this.master || !this.noiseBuffer) return;
    const context = this.context;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = gear === -1 ? 320 : 480;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + 0.12);
  }

  playStall(): void {
    if (!this.context || !this.master) return;
    const context = this.context;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(58, now);
    oscillator.frequency.exponentialRampToValueAtTime(24, now + 0.35);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.42);
  }

  suspend(): void {
    void this.context?.suspend();
  }

  resume(): void {
    void this.context?.resume();
  }

  get running(): boolean {
    return this.context?.state === "running";
  }

  private createNoiseLayer(
    context: AudioContext,
    filterType: BiquadFilterType,
    frequency: number,
    q: number,
    gainValue: number,
  ): NoiseLayer | null {
    if (!this.noiseBuffer || !this.master) return null;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    return { source, gain };
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 987654321;
    for (let index = 0; index < data.length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[index] = (seed / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  dispose(): void {
    for (const oscillator of this.engineOscillators) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped.
      }
    }
    this.starterOsc?.stop();
    this.intake?.source.stop();
    this.wind?.source.stop();
    this.tire?.source.stop();
    void this.context?.close();
    this.context = null;
    this.initialized = false;
  }
}
