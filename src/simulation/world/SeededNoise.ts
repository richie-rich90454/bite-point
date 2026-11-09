// Gradient noise and fBm follow Perlin [R1] and Gustavson [R2].
const FBM_OCTAVES = 4;

export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export function hashSeed(seed: number, a: number, b = 0): number {
    let hash = seed | 0;
    hash = Math.imul(hash ^ (a | 0), 0x27d4eb2d);
    hash ^= hash >>> 15;
    hash = Math.imul(hash + (b | 0), 0x85ebca6b);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35);
    hash ^= hash >>> 16;
    return hash >>> 0;
}

function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function fadeDerivative(t: number): number {
    return 30 * t * t * (t - 1) * (t - 1);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export class SeededNoise {
    readonly seed: number;
    private readonly permutation = new Uint16Array(512);
    private readonly gradientX = new Float64Array(8);
    private readonly gradientY = new Float64Array(8);
    private readonly offsetX = new Float64Array(FBM_OCTAVES);
    private readonly offsetY = new Float64Array(FBM_OCTAVES);
    private readonly offset1 = new Float64Array(FBM_OCTAVES);

    constructor(seed: number) {
        this.seed = seed >>> 0;
        const random = mulberry32(hashSeed(this.seed, 0x51ed270b));
        const base = new Uint16Array(256);
        for (let i = 0; i < 256; i += 1) base[i] = i;
        for (let i = 255; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            const value = base[i]!;
            base[i] = base[j]!;
            base[j] = value;
        }
        for (let i = 0; i < 512; i += 1) this.permutation[i] = base[i & 255]!;

        for (let i = 0; i < 8; i += 1) {
            const angle = (Math.PI * 2 * i) / 8;
            this.gradientX[i] = Math.cos(angle);
            this.gradientY[i] = Math.sin(angle);
        }
        for (let octave = 0; octave < FBM_OCTAVES; octave += 1) {
            this.offsetX[octave] = random() * 1024;
            this.offsetY[octave] = random() * 1024;
            this.offset1[octave] = random() * 1024;
        }
    }

    noise2(x: number, y: number): number {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = x - xi;
        const yf = y - yi;
        const xIndex = xi & 255;
        const yIndex = yi & 255;
        const u = fade(xf);
        const v = fade(yf);

        const aa = this.permutation[this.permutation[xIndex]! + yIndex]! & 7;
        const ba = this.permutation[this.permutation[xIndex + 1]! + yIndex]! & 7;
        const ab = this.permutation[this.permutation[xIndex]! + yIndex + 1]! & 7;
        const bb = this.permutation[this.permutation[xIndex + 1]! + yIndex + 1]! & 7;

        const n00 = this.gradientX[aa]! * xf + this.gradientY[aa]! * yf;
        const n10 = this.gradientX[ba]! * (xf - 1) + this.gradientY[ba]! * yf;
        const n01 = this.gradientX[ab]! * xf + this.gradientY[ab]! * (yf - 1);
        const n11 = this.gradientX[bb]! * (xf - 1) + this.gradientY[bb]! * (yf - 1);

        return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
    }

    fbm2(x: number, y: number): number {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        for (let octave = 0; octave < FBM_OCTAVES; octave += 1) {
            value +=
                amplitude *
                this.noise2(
                    x * frequency + this.offsetX[octave]!,
                    y * frequency + this.offsetY[octave]!,
                );
            amplitude *= 0.5;
            frequency *= 2;
        }
        return value / 1.875;
    }

    noise1(x: number): number {
        const xi = Math.floor(x);
        const xf = x - xi;
        const index = xi & 255;
        const g0 = this.permutation[index]! & 1 ? 1 : -1;
        const g1 = this.permutation[index + 1]! & 1 ? 1 : -1;
        const n0 = g0 * xf;
        const n1 = g1 * (xf - 1);
        return lerp(n0, n1, fade(xf));
    }

    noise1Derivative(x: number): number {
        const xi = Math.floor(x);
        const xf = x - xi;
        const index = xi & 255;
        const g0 = this.permutation[index]! & 1 ? 1 : -1;
        const g1 = this.permutation[index + 1]! & 1 ? 1 : -1;
        const n0 = g0 * xf;
        const n1 = g1 * (xf - 1);
        return (n1 - n0) * fadeDerivative(xf) + fade(xf) * (g1 - g0);
    }

    fbm1(x: number): number {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        for (let octave = 0; octave < FBM_OCTAVES; octave += 1) {
            value += amplitude * this.noise1(x * frequency + this.offset1[octave]!);
            amplitude *= 0.5;
            frequency *= 2;
        }
        return value / 1.875;
    }

    fbm1Derivative(x: number): number {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        for (let octave = 0; octave < FBM_OCTAVES; octave += 1) {
            value +=
                amplitude *
                frequency *
                this.noise1Derivative(x * frequency + this.offset1[octave]!);
            amplitude *= 0.5;
            frequency *= 2;
        }
        return value / 1.875;
    }
}
