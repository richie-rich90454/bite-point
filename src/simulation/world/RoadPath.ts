import type { RoutePlan } from "./RoutePlan";

const CHUNK_LENGTH_M = 2000;
const SAMPLE_STEP_M = 2;
const SAMPLES_PER_CHUNK = CHUNK_LENGTH_M / SAMPLE_STEP_M + 1;
const MAX_CACHED_CHUNKS = 4;

export interface PathSample {
    s: number;
    x: number;
    y: number;
    heading: number;
    tangentX: number;
    tangentY: number;
    normalX: number;
    normalY: number;
}

interface PathChunk {
    startS: number;
    xs: Float64Array;
    ys: Float64Array;
    headings: Float64Array;
}

export class RoadPath {
    private readonly route: RoutePlan;
    private readonly chunks = new Map<number, PathChunk>();
    private readonly chunkOrder: number[] = [];

    constructor(route: RoutePlan) {
        this.route = route;
    }

    samplePath(s: number): PathSample {
        const out: PathSample = {
            s: 0,
            x: 0,
            y: 0,
            heading: 0,
            tangentX: 1,
            tangentY: 0,
            normalX: 0,
            normalY: 1,
        };
        this.samplePathInto(s, out);
        return out;
    }

    samplePathInto(s: number, out: PathSample): void {
        const index = Math.floor(s / CHUNK_LENGTH_M);
        const chunk = this.chunkFor(index);
        const local = (s - chunk.startS) / SAMPLE_STEP_M;
        let sampleIndex = Math.floor(local);
        let t = local - sampleIndex;
        if (sampleIndex < 0) {
            sampleIndex = 0;
            t = 0;
        } else if (sampleIndex >= SAMPLES_PER_CHUNK - 1) {
            sampleIndex = SAMPLES_PER_CHUNK - 2;
            t = 1;
        }

        const x =
            chunk.xs[sampleIndex]! + (chunk.xs[sampleIndex + 1]! - chunk.xs[sampleIndex]!) * t;
        const y =
            chunk.ys[sampleIndex]! + (chunk.ys[sampleIndex + 1]! - chunk.ys[sampleIndex]!) * t;
        const heading =
            chunk.headings[sampleIndex]! +
            (chunk.headings[sampleIndex + 1]! - chunk.headings[sampleIndex]!) * t;
        const tangentX = Math.cos(heading);
        const tangentY = Math.sin(heading);

        out.s = s;
        out.x = x;
        out.y = y;
        out.heading = heading;
        out.tangentX = tangentX;
        out.tangentY = tangentY;
        out.normalX = -tangentY;
        out.normalY = tangentX;
    }

    private chunkFor(index: number): PathChunk {
        const cached = this.chunks.get(index);
        if (cached) return cached;
        const chunk = this.buildChunk(index);
        this.chunks.set(index, chunk);
        this.chunkOrder.push(index);
        if (this.chunkOrder.length > MAX_CACHED_CHUNKS) {
            const oldest = this.chunkOrder.shift();
            if (oldest !== undefined) this.chunks.delete(oldest);
        }
        return chunk;
    }

    private buildChunk(index: number): PathChunk {
        const startS = index * CHUNK_LENGTH_M;
        const origin = this.route.stateAt(startS);
        const xs = new Float64Array(SAMPLES_PER_CHUNK);
        const ys = new Float64Array(SAMPLES_PER_CHUNK);
        const headings = new Float64Array(SAMPLES_PER_CHUNK);

        let x = origin.x;
        let y = origin.y;
        let heading = origin.heading;
        for (let i = 0; i < SAMPLES_PER_CHUNK; i += 1) {
            xs[i] = x;
            ys[i] = y;
            headings[i] = heading;
            if (i === SAMPLES_PER_CHUNK - 1) break;
            const midpointS = startS + (i + 0.5) * SAMPLE_STEP_M;
            const curvature = this.route.curvatureAt(midpointS);
            const midpointHeading = heading + SAMPLE_STEP_M * 0.5 * curvature;
            x += SAMPLE_STEP_M * Math.cos(midpointHeading);
            y += SAMPLE_STEP_M * Math.sin(midpointHeading);
            heading += SAMPLE_STEP_M * curvature;
        }

        return { startS, xs, ys, headings };
    }
}
