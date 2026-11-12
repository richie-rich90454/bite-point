import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";

export type EngineSoundSet = "na" | "turbo" | "hybrid" | "electric";

interface HarmonicSpec {
    ratio: number;
    level: number;
    type: OscillatorType;
}

interface Profile {
    usesStarter: boolean;
    /** Firing events per revolution. Null means no combustion engine (electric). */
    firingPerRev: number | null;
    harmonics: HarmonicSpec[];
    gain: { idle: number; load: number };
    lowpass: { base: number; rpm: number; load: number; max: number };
    intake: { frequency: number; q: number; idle: number; load: number; rpm: number } | null;
    exhaust: { frequency: number; q: number; idle: number; load: number } | null;
    whistle: { base: number; rpm: number; span: number; load: number; minRpm: number } | null;
    motor: { base: number; speed: number; load: number; level: number; harmonic: number } | null;
}

const MAX_HARMONICS = 4;

const PROFILES: Record<EngineSoundSet, Profile> = {
    na: {
        usesStarter: true,
        firingPerRev: 2,
        harmonics: [
            { ratio: 0.5, level: 0.3, type: "sine" },
            { ratio: 1, level: 0.5, type: "sawtooth" },
            { ratio: 2, level: 0.22, type: "triangle" },
            { ratio: 3, level: 0.1, type: "sine" },
        ],
        gain: { idle: 0.16, load: 0.32 },
        lowpass: { base: 380, rpm: 0.22, load: 1300, max: 5600 },
        intake: { frequency: 720, q: 1.15, idle: 0.006, load: 0.05, rpm: 0.07 },
        exhaust: { frequency: 150, q: 0.85, idle: 0.014, load: 0.07 },
        whistle: null,
        motor: null,
    },
    turbo: {
        usesStarter: true,
        firingPerRev: 2,
        harmonics: [
            { ratio: 0.5, level: 0.18, type: "sine" },
            { ratio: 1, level: 0.34, type: "triangle" },
            { ratio: 2, level: 0.16, type: "sine" },
            { ratio: 3.5, level: 0.09, type: "sine" },
        ],
        gain: { idle: 0.12, load: 0.28 },
        lowpass: { base: 520, rpm: 0.34, load: 1700, max: 6800 },
        intake: { frequency: 900, q: 1.9, idle: 0.003, load: 0.07, rpm: 0.12 },
        exhaust: { frequency: 175, q: 0.8, idle: 0.01, load: 0.075 },
        whistle: { base: 1600, rpm: 0.55, span: 2200, load: 0.055, minRpm: 1500 },
        motor: null,
    },
    hybrid: {
        usesStarter: true,
        firingPerRev: 1.5,
        harmonics: [
            { ratio: 0.5, level: 0.22, type: "sine" },
            { ratio: 1, level: 0.3, type: "triangle" },
            { ratio: 2, level: 0.15, type: "sine" },
            { ratio: 3, level: 0.06, type: "sine" },
        ],
        gain: { idle: 0.09, load: 0.2 },
        lowpass: { base: 480, rpm: 0.24, load: 900, max: 4800 },
        intake: { frequency: 780, q: 1.35, idle: 0.004, load: 0.04, rpm: 0.06 },
        exhaust: { frequency: 165, q: 0.8, idle: 0.008, load: 0.045 },
        whistle: null,
        motor: { base: 200, speed: 22, load: 0.035, level: 0.05, harmonic: 2.03 },
    },
    electric: {
        usesStarter: false,
        firingPerRev: null,
        harmonics: [],
        gain: { idle: 0, load: 0 },
        lowpass: { base: 1200, rpm: 0, load: 0, max: 8000 },
        intake: null,
        exhaust: null,
        whistle: null,
        motor: { base: 240, speed: 32, load: 0.05, level: 0.11, harmonic: 2.02 },
    },
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const normalizeSoundSet = (soundSet: string): EngineSoundSet => {
    const key = soundSet.trim().toLowerCase();
    if (key === "ev" || key.includes("electric")) return "electric";
    if (key.includes("hybrid")) return "hybrid";
    if (key.includes("turbo")) return "turbo";
    return "na";
};

export class EngineAudio {
    private context: AudioContext | null = null;
    private output: GainNode | null = null;
    private toneFilter: BiquadFilterNode | null = null;
    private harmonicBus: GainNode | null = null;
    private harmonicOscillators: OscillatorNode[] = [];
    private harmonicGains: GainNode[] = [];
    private intakeSource: AudioBufferSourceNode | null = null;
    private intakeFilter: BiquadFilterNode | null = null;
    private intakeGain: GainNode | null = null;
    private exhaustSource: AudioBufferSourceNode | null = null;
    private exhaustFilter: BiquadFilterNode | null = null;
    private exhaustGain: GainNode | null = null;
    private whistleOscillator: OscillatorNode | null = null;
    private whistleGain: GainNode | null = null;
    private motorOscillator: OscillatorNode | null = null;
    private motorHighOscillator: OscillatorNode | null = null;
    private motorGain: GainNode | null = null;
    private motorHighGain: GainNode | null = null;
    private exhaustPulseOscillator: OscillatorNode | null = null;
    private exhaustPulseDepth: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    private lastThrottle = 0;
    private crackleCooldown = 0;
    private blowOffCooldown = 0;
    private soundSet: EngineSoundSet = "na";
    private profile: Profile = PROFILES.na;

    constructor(soundSet: string = "na") {
        this.setSoundSet(soundSet);
    }

    get activeSoundSet(): EngineSoundSet {
        return this.soundSet;
    }

    get usesStarter(): boolean {
        return this.profile.usesStarter;
    }

    setSoundSet(soundSet: string): void {
        this.soundSet = normalizeSoundSet(soundSet);
        this.profile = PROFILES[this.soundSet];
        if (this.context) this.applyProfile();
    }

    attach(context: AudioContext, destination: AudioNode, noiseBuffer: AudioBuffer): void {
        if (this.context) this.teardown();
        this.context = context;

        const output = context.createGain();
        output.gain.value = 1;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 20;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;
        compressor.connect(output);
        output.connect(destination);
        this.output = output;

        const toneFilter = context.createBiquadFilter();
        toneFilter.type = "lowpass";
        toneFilter.frequency.value = 800;
        toneFilter.Q.value = 0.7;
        const harmonicBus = context.createGain();
        harmonicBus.gain.value = 0;
        toneFilter.connect(harmonicBus);
        harmonicBus.connect(compressor);
        this.toneFilter = toneFilter;
        this.harmonicBus = harmonicBus;

        for (let index = 0; index < MAX_HARMONICS; index += 1) {
            const oscillator = context.createOscillator();
            oscillator.type = "sine";
            oscillator.frequency.value = 40;
            const gain = context.createGain();
            gain.gain.value = 0;
            oscillator.connect(gain);
            gain.connect(toneFilter);
            oscillator.start();
            this.harmonicOscillators.push(oscillator);
            this.harmonicGains.push(gain);
        }

        this.intakeSource = context.createBufferSource();
        this.intakeSource.buffer = noiseBuffer;
        this.intakeSource.loop = true;
        this.intakeFilter = context.createBiquadFilter();
        this.intakeFilter.type = "bandpass";
        this.intakeFilter.frequency.value = 720;
        this.intakeFilter.Q.value = 1;
        this.intakeGain = context.createGain();
        this.intakeGain.gain.value = 0;
        this.intakeSource.connect(this.intakeFilter);
        this.intakeFilter.connect(this.intakeGain);
        this.intakeGain.connect(compressor);
        this.intakeSource.start();

        this.exhaustSource = context.createBufferSource();
        this.exhaustSource.buffer = noiseBuffer;
        this.exhaustSource.loop = true;
        this.exhaustFilter = context.createBiquadFilter();
        this.exhaustFilter.type = "lowpass";
        this.exhaustFilter.frequency.value = 160;
        this.exhaustFilter.Q.value = 0.8;
        this.exhaustGain = context.createGain();
        this.exhaustGain.gain.value = 0;
        this.exhaustSource.connect(this.exhaustFilter);
        this.exhaustFilter.connect(this.exhaustGain);
        this.exhaustGain.connect(compressor);
        this.exhaustSource.start();
        this.noiseBuffer = noiseBuffer;

        this.exhaustPulseOscillator = context.createOscillator();
        this.exhaustPulseOscillator.type = "square";
        this.exhaustPulseOscillator.frequency.value = 60;
        this.exhaustPulseDepth = context.createGain();
        this.exhaustPulseDepth.gain.value = 0;
        this.exhaustPulseOscillator.connect(this.exhaustPulseDepth);
        this.exhaustPulseDepth.connect(this.exhaustGain.gain);
        this.exhaustPulseOscillator.start();

        this.whistleOscillator = context.createOscillator();
        this.whistleOscillator.type = "sine";
        this.whistleOscillator.frequency.value = 2000;
        this.whistleGain = context.createGain();
        this.whistleGain.gain.value = 0;
        this.whistleOscillator.connect(this.whistleGain);
        this.whistleGain.connect(compressor);
        this.whistleOscillator.start();

        this.motorOscillator = context.createOscillator();
        this.motorOscillator.type = "triangle";
        this.motorOscillator.frequency.value = 240;
        this.motorGain = context.createGain();
        this.motorGain.gain.value = 0;
        this.motorOscillator.connect(this.motorGain);
        this.motorGain.connect(compressor);
        this.motorOscillator.start();

        this.motorHighOscillator = context.createOscillator();
        this.motorHighOscillator.type = "sine";
        this.motorHighOscillator.frequency.value = 480;
        this.motorHighGain = context.createGain();
        this.motorHighGain.gain.value = 0;
        this.motorHighOscillator.connect(this.motorHighGain);
        this.motorHighGain.connect(compressor);
        this.motorHighOscillator.start();

        this.applyProfile();
    }

    update(state: VehicleRenderState, engineLevel: number, dt = 1 / 60): void {
        const context = this.context;
        if (!context || !this.harmonicBus) return;
        const now = context.currentTime;
        const profile = this.profile;
        const level = clamp01(engineLevel);
        const throttle = clamp01(state.throttle);
        const rpm = Math.max(0, state.rpm);
        const speed = Math.max(0, state.speedMps);
        const running = state.engineRunning;
        const firing =
            profile.firingPerRev === null
                ? 0
                : Math.min(320, Math.max(20, (rpm / 60) * profile.firingPerRev));
        const limiterPulse = state.fuelCut ? (Math.sin(now * Math.PI * 2 * 14) > 0 ? 1 : 0.32) : 1;

        for (let index = 0; index < this.harmonicOscillators.length; index += 1) {
            const spec = profile.harmonics[index];
            const oscillator = this.harmonicOscillators[index]!;
            if (spec && firing > 0 && running) {
                oscillator.frequency.setTargetAtTime(
                    Math.min(9000, firing * spec.ratio),
                    now,
                    0.04,
                );
            }
        }

        const engineTarget =
            running && profile.firingPerRev !== null
                ? (profile.gain.idle + throttle * profile.gain.load) * level * limiterPulse
                : 0;
        this.harmonicBus.gain.setTargetAtTime(engineTarget, now, 0.07);

        if (this.toneFilter) {
            const cutoff = Math.min(
                profile.lowpass.max,
                profile.lowpass.base + rpm * profile.lowpass.rpm + throttle * profile.lowpass.load,
            );
            this.toneFilter.frequency.setTargetAtTime(cutoff, now, 0.06);
        }

        if (this.intakeGain && this.intakeFilter) {
            const intake = profile.intake;
            const target = intake && running ? (intake.idle + throttle * intake.load) * level : 0;
            this.intakeGain.gain.setTargetAtTime(target, now, 0.09);
            if (intake) {
                this.intakeFilter.frequency.setTargetAtTime(
                    intake.frequency + rpm * intake.rpm,
                    now,
                    0.08,
                );
            }
        }

        let exhaustTarget = 0;
        if (this.exhaustGain && this.exhaustFilter) {
            const exhaust = profile.exhaust;
            exhaustTarget =
                exhaust && running
                    ? (exhaust.idle + throttle * exhaust.load) * level * limiterPulse
                    : 0;
            this.exhaustGain.gain.setTargetAtTime(exhaustTarget, now, 0.09);
            if (exhaust) {
                this.exhaustFilter.frequency.setTargetAtTime(
                    exhaust.frequency + rpm * 0.02 + throttle * 90,
                    now,
                    0.09,
                );
            }
        }
        if (this.exhaustPulseOscillator && this.exhaustPulseDepth) {
            const pulseHz = Math.max(20, firing * 0.5);
            this.exhaustPulseOscillator.frequency.setTargetAtTime(pulseHz, now, 0.03);
            this.exhaustPulseDepth.gain.setTargetAtTime(exhaustTarget * 0.62, now, 0.06);
        }

        if (this.whistleGain && this.whistleOscillator) {
            const whistle = profile.whistle;
            let target = 0;
            if (whistle && running && rpm > whistle.minRpm) {
                const spool = Math.min(1, (rpm - whistle.minRpm) / 2500);
                target = (0.25 + throttle * 0.75) * spool * whistle.load * level;
                this.whistleOscillator.frequency.setTargetAtTime(
                    Math.min(7000, whistle.base + rpm * whistle.rpm + throttle * whistle.span),
                    now,
                    0.08,
                );
            }
            this.whistleGain.gain.setTargetAtTime(target, now, 0.12);
        }

        if (
            this.motorGain &&
            this.motorHighGain &&
            this.motorOscillator &&
            this.motorHighOscillator
        ) {
            const motor = profile.motor;
            const active = motor !== null && (running || speed > 0.5);
            let target = 0;
            if (motor && active) {
                const speedFactor = Math.min(1, 0.15 + speed * 0.06);
                target = (motor.level + throttle * motor.load) * speedFactor * level;
                const frequency = Math.min(6000, motor.base + speed * motor.speed + throttle * 80);
                this.motorOscillator.frequency.setTargetAtTime(frequency, now, 0.06);
                this.motorHighOscillator.frequency.setTargetAtTime(
                    Math.min(10000, frequency * motor.harmonic),
                    now,
                    0.06,
                );
            }
            this.motorGain.gain.setTargetAtTime(target, now, 0.09);
            this.motorHighGain.gain.setTargetAtTime(target * 0.35, now, 0.09);
        }

        this.crackleCooldown = Math.max(0, this.crackleCooldown - dt);
        this.blowOffCooldown = Math.max(0, this.blowOffCooldown - dt);
        const lifting = this.lastThrottle > 0.35 && throttle < 0.08;
        if (running && rpm > 2200 && (lifting || state.fuelCut) && this.crackleCooldown <= 0) {
            this.playCrackle(now, rpm);
            this.crackleCooldown = 0.035 + Math.random() * 0.13;
        }
        if (running && profile.whistle && lifting && rpm > 2800 && this.blowOffCooldown <= 0) {
            this.playBlowOff(now);
            this.blowOffCooldown = 0.35;
        }
        this.lastThrottle = throttle;
    }

    private playCrackle(now: number, rpm: number): void {
        const context = this.context;
        if (!context || !this.output || !this.noiseBuffer) return;
        const source = context.createBufferSource();
        source.buffer = this.noiseBuffer;
        const highpass = context.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 700;
        const lowpass = context.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = 2200 + Math.min(2600, rpm * 0.35);
        const gain = context.createGain();
        const peak = 0.018 + Math.random() * 0.035;
        const duration = 0.035 + Math.random() * 0.06;
        gain.gain.setValueAtTime(peak, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(this.output);
        source.start(now);
        source.stop(now + duration + 0.02);
    }

    private playBlowOff(now: number): void {
        const context = this.context;
        if (!context || !this.output || !this.noiseBuffer) return;
        const source = context.createBufferSource();
        source.buffer = this.noiseBuffer;
        const filter = context.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1500;
        filter.Q.value = 0.9;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.055, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.output);
        source.start(now);
        source.stop(now + 0.26);
    }

    dispose(): void {
        this.teardown();
        this.context = null;
    }

    private applyProfile(): void {
        const context = this.context;
        const now = context?.currentTime ?? 0;
        for (let index = 0; index < this.harmonicOscillators.length; index += 1) {
            const spec = this.profile.harmonics[index];
            const oscillator = this.harmonicOscillators[index]!;
            const gain = this.harmonicGains[index]!;
            oscillator.type = spec?.type ?? "sine";
            gain.gain.setTargetAtTime(spec?.level ?? 0, now, 0.05);
        }
        if (this.intakeFilter) {
            this.intakeFilter.Q.setTargetAtTime(this.profile.intake?.q ?? 1, now, 0.05);
        }
        if (this.exhaustFilter) {
            this.exhaustFilter.Q.setTargetAtTime(this.profile.exhaust?.q ?? 0.8, now, 0.05);
        }
    }

    private teardown(): void {
        const stop = (node: { stop?: () => void } | null): void => {
            try {
                node?.stop?.();
            } catch {
                // Already stopped.
            }
        };
        for (const oscillator of this.harmonicOscillators) stop(oscillator);
        stop(this.intakeSource);
        stop(this.exhaustSource);
        stop(this.whistleOscillator);
        stop(this.motorOscillator);
        stop(this.motorHighOscillator);
        stop(this.exhaustPulseOscillator);
        try {
            this.output?.disconnect();
        } catch {
            // Already disconnected.
        }
        this.harmonicOscillators = [];
        this.harmonicGains = [];
        this.intakeSource = null;
        this.intakeFilter = null;
        this.intakeGain = null;
        this.exhaustSource = null;
        this.exhaustFilter = null;
        this.exhaustGain = null;
        this.whistleOscillator = null;
        this.whistleGain = null;
        this.motorOscillator = null;
        this.motorHighOscillator = null;
        this.motorGain = null;
        this.motorHighGain = null;
        this.exhaustPulseOscillator = null;
        this.exhaustPulseDepth = null;
        this.noiseBuffer = null;
        this.lastThrottle = 0;
        this.crackleCooldown = 0;
        this.blowOffCooldown = 0;
        this.toneFilter = null;
        this.harmonicBus = null;
        this.output = null;
    }
}
