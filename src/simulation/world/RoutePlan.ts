// Curvature transitions use the Euler-spiral/clothoid principle from [R3].
import { clamp, smoothstep } from "../core/MathUtils";
import { hashSeed, mulberry32 } from "./SeededNoise";
import type { RouteKind, RouteMode, RouteSegment, SurfaceKind } from "./WorldTypes";

export const TUTORIAL_START = -400;
export const TUTORIAL_END = 400;

const MIN_SEGMENT_LENGTH = 400;
const MAX_SEGMENT_LENGTH = 2500;
const MAX_CACHED_SEGMENTS = 4096;
const INTEGRATION_STEP = 2;
const MAX_GRADE = 0.09;
const MAX_BANK = 0.1;
const GRAVITY = 9.80665;
const REFERENCE_SPEED = 40;

const NORMAL_CURVATURE_LIMIT = 0.0008;
const SPECIAL_CURVATURE_LIMIT = 0.006;
const TURN_BUDGET_RAD = 0.4;
const HEADING_GUARD_RAD = 0.3;

const KINDS_A: readonly RouteKind[] = ["sweep", "esses", "climb", "descent", "coast", "forest"];
const KINDS_B: readonly RouteKind[] = ["industrial", "tunnel", "bridge", "city", "summit", "sweep"];

const THEME_BY_KIND: Record<RouteKind, string> = {
    tutorial: "proving",
    straight: "proving",
    sweep: "coast",
    esses: "alpine",
    climb: "mountain",
    descent: "mountain",
    coast: "coast",
    forest: "forest",
    industrial: "industrial",
    tunnel: "tunnel",
    bridge: "bridge",
    city: "city",
    summit: "summit",
};

export interface RouteSegmentState {
    segment: RouteSegment;
    length: number;
    rampM: number;
    peakCurvature: number;
    wavelengthM: number;
    bumpSigmaM: number;
    startX: number;
    startY: number;
    startHeading: number;
    endX: number;
    endY: number;
    endHeading: number;
}

export interface RoutePoint {
    x: number;
    y: number;
    heading: number;
}

interface SegmentCore {
    kind: RouteKind;
    length: number;
    rampM: number;
    peakCurvature: number;
    wavelengthM: number;
    bumpSigmaM: number;
    halfWidthM: number;
    surface: SurfaceKind;
    theme: string;
}

function curvatureAtDistance(state: RouteSegmentState, distance: number): number {
    const length = state.length;
    const peak = state.peakCurvature;
    if (peak === 0) return 0;
    const d = distance < 0 ? 0 : distance > length ? length : distance;
    const envelope =
        smoothstep(0, state.rampM, d) * (1 - smoothstep(length - state.rampM, length, d));
    if (envelope === 0) return 0;
    if (state.segment.kind === "esses") {
        const angle = (Math.PI * 2 * d) / state.wavelengthM;
        return peak * envelope * Math.sin(angle);
    }
    if (state.segment.kind === "summit") {
        const z = (d - length * 0.5) / state.bumpSigmaM;
        return peak * envelope * Math.exp(-0.5 * z * z);
    }
    return peak * envelope;
}

export class RoutePlan {
    readonly seed: number;
    private readonly gradeAt: (s: number) => number;
    private readonly tutorial: RouteSegmentState;
    private positive: RouteSegmentState[] = [];
    private negative: RouteSegmentState[] = [];

    constructor(
        seed: number,
        gradeAt: (s: number) => number,
        readonly mode: RouteMode = "curved",
        readonly themeSequence: readonly RouteKind[] = [],
    ) {
        this.seed = seed >>> 0;
        this.gradeAt = gradeAt;
        this.tutorial = this.createTutorialState();
        this.straight = {
            index: 0,
            kind: "straight",
            sStart: Number.NEGATIVE_INFINITY,
            sEnd: Number.POSITIVE_INFINITY,
            curvature: 0,
            grade: 0,
            bankRad: 0,
            halfWidthM: 7,
            surface: "asphalt",
            theme: themeSequence[0] ? THEME_BY_KIND[themeSequence[0]] : THEME_BY_KIND.straight,
        };
    }

    private readonly straight: RouteSegment;

    segmentAt(s: number): RouteSegment {
        if (this.mode === "straight") return this.straight;
        return this.stateFor(s).segment;
    }

    curvatureAt(s: number): number {
        if (this.mode === "straight") return 0;
        const state = this.stateFor(s);
        return curvatureAtDistance(state, s - state.segment.sStart);
    }

    stateAt(s: number): RoutePoint {
        if (this.mode === "straight") return { x: s, y: 0, heading: 0 };
        const state = this.stateFor(s);
        const total = s - state.segment.sStart;
        let x = state.startX;
        let y = state.startY;
        let heading = state.startHeading;
        let travelled = 0;
        while (travelled < total) {
            const step = Math.min(INTEGRATION_STEP, total - travelled);
            const curvature = curvatureAtDistance(state, travelled + step * 0.5);
            const midpointHeading = heading + step * 0.5 * curvature;
            x += step * Math.cos(midpointHeading);
            y += step * Math.sin(midpointHeading);
            heading += step * curvature;
            travelled += step;
        }
        return { x, y, heading };
    }

    private stateFor(s: number): RouteSegmentState {
        if (s >= TUTORIAL_START && s <= TUTORIAL_END) return this.tutorial;
        return s > TUTORIAL_END ? this.stateForPositive(s) : this.stateForNegative(s);
    }

    private stateForPositive(s: number): RouteSegmentState {
        if (this.positive.length === 0 || s < this.positive[0]!.segment.sStart) {
            this.positive = [this.createPositiveState(1, this.tutorial)];
        }
        let last = this.positive[this.positive.length - 1]!;
        while (last.segment.sEnd < s) {
            if (this.positive.length >= MAX_CACHED_SEGMENTS) {
                this.positive.splice(0, Math.floor(MAX_CACHED_SEGMENTS / 2));
            }
            last = this.positive[this.positive.length - 1]!;
            this.positive.push(this.createPositiveState(last.segment.index + 1, last));
            last = this.positive[this.positive.length - 1]!;
        }
        let low = 0;
        let high = this.positive.length - 1;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.positive[middle]!.segment.sEnd < s) low = middle + 1;
            else high = middle;
        }
        return this.positive[low]!;
    }

    private stateForNegative(s: number): RouteSegmentState {
        if (this.negative.length === 0 || s > this.negative[0]!.segment.sEnd) {
            this.negative = [this.createNegativeState(-1, this.tutorial)];
        }
        let last = this.negative[this.negative.length - 1]!;
        while (last.segment.sStart > s) {
            if (this.negative.length >= MAX_CACHED_SEGMENTS) {
                this.negative.splice(0, Math.floor(MAX_CACHED_SEGMENTS / 2));
            }
            last = this.negative[this.negative.length - 1]!;
            this.negative.push(this.createNegativeState(last.segment.index - 1, last));
            last = this.negative[this.negative.length - 1]!;
        }
        for (let i = 0; i < this.negative.length; i += 1) {
            const candidate = this.negative[i]!;
            if (s >= candidate.segment.sStart) return candidate;
        }
        return this.negative[this.negative.length - 1]!;
    }

    private createPositiveState(ordinal: number, previous: RouteSegmentState): RouteSegmentState {
        const core = this.createCore(ordinal, previous.endHeading);
        const sStart = previous.segment.sEnd;
        const sEnd = sStart + core.length;
        const state: RouteSegmentState = {
            segment: this.createSegment(ordinal, core, sStart, sEnd),
            length: core.length,
            rampM: core.rampM,
            peakCurvature: core.peakCurvature,
            wavelengthM: core.wavelengthM,
            bumpSigmaM: core.bumpSigmaM,
            startX: previous.endX,
            startY: previous.endY,
            startHeading: previous.endHeading,
            endX: previous.endX,
            endY: previous.endY,
            endHeading: previous.endHeading,
        };
        let x = state.startX;
        let y = state.startY;
        let heading = state.startHeading;
        let travelled = 0;
        while (travelled < core.length) {
            const step = Math.min(INTEGRATION_STEP, core.length - travelled);
            const curvature = curvatureAtDistance(state, travelled + step * 0.5);
            const midpointHeading = heading + step * 0.5 * curvature;
            x += step * Math.cos(midpointHeading);
            y += step * Math.sin(midpointHeading);
            heading += step * curvature;
            travelled += step;
        }
        state.endX = x;
        state.endY = y;
        state.endHeading = heading;
        return state;
    }

    private createNegativeState(ordinal: number, next: RouteSegmentState): RouteSegmentState {
        const core = this.createCore(ordinal, next.startHeading);
        const sEnd = next.segment.sStart;
        const sStart = sEnd - core.length;
        const state: RouteSegmentState = {
            segment: this.createSegment(ordinal, core, sStart, sEnd),
            length: core.length,
            rampM: core.rampM,
            peakCurvature: core.peakCurvature,
            wavelengthM: core.wavelengthM,
            bumpSigmaM: core.bumpSigmaM,
            startX: next.startX,
            startY: next.startY,
            startHeading: next.startHeading,
            endX: next.startX,
            endY: next.startY,
            endHeading: next.startHeading,
        };
        let x = next.startX;
        let y = next.startY;
        let heading = next.startHeading;
        let remaining = core.length;
        while (remaining > 0) {
            const step = Math.min(INTEGRATION_STEP, remaining);
            const curvature = curvatureAtDistance(state, remaining - step * 0.5);
            const midpointHeading = heading - step * 0.5 * curvature;
            x -= step * Math.cos(midpointHeading);
            y -= step * Math.sin(midpointHeading);
            heading -= step * curvature;
            remaining -= step;
        }
        state.startX = x;
        state.startY = y;
        state.startHeading = heading;
        return state;
    }

    private createCore(ordinal: number, referenceHeading: number): SegmentCore {
        const random = mulberry32(hashSeed(this.seed, ordinal, 0x2545f491));
        const kinds = (Math.abs(ordinal) & 1) === 1 ? KINDS_A : KINDS_B;
        const kind =
            this.themeSequence.length > 0
                ? this.themeSequence[(Math.abs(ordinal) - 1) % this.themeSequence.length]!
                : kinds[Math.floor(random() * kinds.length)]!;
        const length = MIN_SEGMENT_LENGTH + random() * (MAX_SEGMENT_LENGTH - MIN_SEGMENT_LENGTH);
        const rampM = Math.min(60 + random() * 90, length / 3);
        const halfWidthM = 6 + random() * 2;

        let desired: number;
        let wavelengthM = 0;
        let bumpSigmaM = 0;
        if (kind === "esses") {
            desired = 0.0025 + random() * 0.0035;
            wavelengthM = length / (1.5 + random() * 1.5);
        } else if (kind === "summit") {
            desired = 0.002 + random() * 0.004;
            bumpSigmaM = 55 + random() * 75;
        } else {
            desired = 0.00018 + random() * 0.0006;
        }

        let sign: number;
        if (Math.abs(referenceHeading) > HEADING_GUARD_RAD) {
            sign = referenceHeading > 0 ? -1 : 1;
        } else {
            sign = random() < 0.5 ? -1 : 1;
        }

        let amplitude: number;
        if (kind === "esses") {
            const excursionLimit = (TURN_BUDGET_RAD * Math.PI) / Math.max(wavelengthM, 1);
            amplitude = Math.min(desired, SPECIAL_CURVATURE_LIMIT, excursionLimit);
        } else if (kind === "summit") {
            const effective = Math.max(bumpSigmaM * Math.sqrt(Math.PI * 2), 1);
            amplitude = Math.min(desired, SPECIAL_CURVATURE_LIMIT, TURN_BUDGET_RAD / effective);
        } else {
            const effective = Math.max(length - rampM, 1);
            amplitude = Math.min(desired, NORMAL_CURVATURE_LIMIT, TURN_BUDGET_RAD / effective);
        }
        const peakCurvature = sign * amplitude;

        return {
            kind,
            length,
            rampM,
            peakCurvature,
            wavelengthM,
            bumpSigmaM,
            halfWidthM,
            surface: "asphalt",
            theme: THEME_BY_KIND[kind],
        };
    }

    private createSegment(
        ordinal: number,
        core: SegmentCore,
        sStart: number,
        sEnd: number,
    ): RouteSegment {
        const grade = clamp(this.gradeAt((sStart + sEnd) * 0.5), -MAX_GRADE, MAX_GRADE);
        const bankRad = clamp(
            Math.atan((core.peakCurvature * REFERENCE_SPEED * REFERENCE_SPEED) / GRAVITY),
            -MAX_BANK,
            MAX_BANK,
        );
        return {
            index: ordinal,
            kind: core.kind,
            sStart,
            sEnd,
            curvature: core.peakCurvature,
            grade,
            bankRad,
            halfWidthM: core.halfWidthM,
            surface: core.surface,
            theme: core.theme,
        };
    }

    private createTutorialState(): RouteSegmentState {
        const segment: RouteSegment = {
            index: 0,
            kind: "tutorial",
            sStart: TUTORIAL_START,
            sEnd: TUTORIAL_END,
            curvature: 0,
            grade: clamp(this.gradeAt(0), -MAX_GRADE, MAX_GRADE),
            bankRad: 0,
            halfWidthM: 7,
            surface: "asphalt",
            theme: THEME_BY_KIND.tutorial,
        };
        return {
            segment,
            length: TUTORIAL_END - TUTORIAL_START,
            rampM: 0,
            peakCurvature: 0,
            wavelengthM: 0,
            bumpSigmaM: 0,
            startX: TUTORIAL_START,
            startY: 0,
            startHeading: 0,
            endX: TUTORIAL_END,
            endY: 0,
            endHeading: 0,
        };
    }
}
