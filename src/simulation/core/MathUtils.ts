export const GRAVITY = 9.80665;

export function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
    return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
    if (Math.abs(target - current) <= maxDelta) return target;
    return current + Math.sign(target - current) * maxDelta;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
    if (edge0 === edge1) return value < edge0 ? 0 : 1;
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

export function signOr(value: number, fallback: number): number {
    return value === 0 ? fallback : Math.sign(value);
}

export function rpmToRadPerSec(rpm: number): number {
    return (rpm * Math.PI) / 30;
}

export function radPerSecToRpm(radPerSec: number): number {
    return (radPerSec * 30) / Math.PI;
}

export function wrapAngle(angle: number): number {
    const twoPi = Math.PI * 2;
    let result = angle % twoPi;
    if (result > Math.PI) result -= twoPi;
    if (result < -Math.PI) result += twoPi;
    return result;
}

export function lerpAngle(a: number, b: number, t: number): number {
    return a + wrapAngle(b - a) * t;
}

export function moveTowardsAngle(current: number, target: number, maxDelta: number): number {
    const delta = wrapAngle(target - current);
    if (Math.abs(delta) <= maxDelta) return wrapAngle(current + delta);
    return wrapAngle(current + Math.sign(delta) * maxDelta);
}

export function expApproach(
    current: number,
    target: number,
    ratePerSec: number,
    dt: number,
): number {
    return target + (current - target) * Math.exp(-ratePerSec * dt);
}

export class ShapePreservingCurve {
    readonly xs: number[];
    readonly ys: number[];
    private readonly slopes: number[];

    constructor(points: ReadonlyArray<readonly [number, number]>) {
        if (points.length < 2) throw new Error("A curve needs at least two points.");
        const sorted = [...points].sort((a, b) => a[0] - b[0]);
        this.xs = sorted.map((point) => point[0]);
        this.ys = sorted.map((point) => point[1]);
        for (let i = 1; i < this.xs.length; i += 1) {
            if (!(this.xs[i]! > this.xs[i - 1]!))
                throw new Error("Curve x values must be strictly increasing.");
        }
        this.slopes = this.computeSlopes();
    }

    evaluate(x: number): number {
        const xs = this.xs;
        const last = xs.length - 1;
        if (x <= xs[0]!) return this.ys[0]!;
        if (x >= xs[last]!) return this.ys[last]!;

        let low = 0;
        let high = last;
        while (high - low > 1) {
            const mid = (low + high) >>> 1;
            if (xs[mid]! <= x) low = mid;
            else high = mid;
        }

        const h = xs[high]! - xs[low]!;
        const t = (x - xs[low]!) / h;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        return (
            h00 * this.ys[low]! +
            h10 * h * this.slopes[low]! +
            h01 * this.ys[high]! +
            h11 * h * this.slopes[high]!
        );
    }

    private computeSlopes(): number[] {
        const n = this.xs.length;
        const h = new Array<number>(n - 1);
        const delta = new Array<number>(n - 1);
        for (let i = 0; i < n - 1; i += 1) {
            h[i] = this.xs[i + 1]! - this.xs[i]!;
            delta[i] = (this.ys[i + 1]! - this.ys[i]!) / h[i]!;
        }
        const slopes = new Array<number>(n).fill(0);
        if (n === 2) {
            slopes[0] = delta[0]!;
            slopes[1] = delta[0]!;
            return slopes;
        }

        for (let i = 1; i < n - 1; i += 1) {
            const d0 = delta[i - 1]!;
            const d1 = delta[i]!;
            if (d0 === 0 || d1 === 0 || Math.sign(d0) !== Math.sign(d1)) {
                slopes[i] = 0;
            } else {
                const w1 = 2 * h[i]! + h[i - 1]!;
                const w2 = h[i]! + 2 * h[i - 1]!;
                slopes[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
            }
        }

        slopes[0] = this.endpointSlope(h[0]!, h[1]!, delta[0]!, delta[1]!);
        slopes[n - 1] = this.endpointSlope(h[n - 2]!, h[n - 3]!, delta[n - 2]!, delta[n - 3]!);
        return slopes;
    }

    private endpointSlope(h0: number, h1: number, d0: number, d1: number): number {
        const slope = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
        if (slope === 0) return 0;
        if (Math.sign(slope) !== Math.sign(d0)) return 0;
        if (Math.sign(d0) !== Math.sign(d1) && Math.abs(slope) > Math.abs(3 * d0)) return 3 * d0;
        return slope;
    }
}
