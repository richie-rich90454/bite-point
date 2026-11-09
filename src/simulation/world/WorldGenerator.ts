import { clamp } from "../core/MathUtils";
import { RoadPath } from "./RoadPath";
import type { PathSample } from "./RoadPath";
import { RoutePlan } from "./RoutePlan";
import { TerrainProfile } from "./TerrainProfile";
import type { RoadSample, RouteSegment, TerrainSample } from "./WorldTypes";

const GRAVITY = 9.80665;
const REFERENCE_SPEED = 40;
const MAX_BANK_RAD = 0.1;
const NORMAL_EPSILON_M = 0.5;
const LOCAL_SEARCH_RADIUS_M = 80;
const LOCAL_SEARCH_STEP_M = 2;
const COARSE_START_RADIUS_M = 2000;
const COARSE_MAX_RADIUS_M = 32000;
const COARSE_STEP_M = 25;
const NEWTON_ITERATIONS = 8;
const NEWTON_MAX_STEP_M = 50;

interface Projection {
    s: number;
    lateralM: number;
    distanceM: number;
}

export class WorldGenerator {
    readonly seed: number;
    private readonly terrain: TerrainProfile;
    private readonly route: RoutePlan;
    private readonly path: RoadPath;
    private readonly scratchPath: PathSample;
    private readonly scratchRoad: RoadSample;
    private readonly scratchProjection: Projection;

    constructor(seed = 0) {
        this.seed = seed >>> 0;
        this.terrain = new TerrainProfile(this.seed);
        this.route = new RoutePlan(this.seed, (s) => this.terrain.gradeAt(s));
        this.path = new RoadPath(this.route);
        this.scratchPath = {
            s: 0,
            x: 0,
            y: 0,
            heading: 0,
            tangentX: 1,
            tangentY: 0,
            normalX: 0,
            normalY: 1,
        };
        this.scratchRoad = {
            s: 0,
            x: 0,
            y: 0,
            heading: 0,
            tangentX: 1,
            tangentY: 0,
            normalX: 0,
            normalY: 1,
            elevationM: 0,
            grade: 0,
            bankRad: 0,
            halfWidthM: 7,
            surface: "asphalt",
            segment: this.route.segmentAt(0),
        };
        this.scratchProjection = { s: 0, lateralM: 0, distanceM: 0 };
    }

    sample(s: number): RoadSample {
        const segment = this.route.segmentAt(s);
        const out: RoadSample = {
            s,
            x: 0,
            y: 0,
            heading: 0,
            tangentX: 1,
            tangentY: 0,
            normalX: 0,
            normalY: 1,
            elevationM: 0,
            grade: 0,
            bankRad: 0,
            halfWidthM: segment.halfWidthM,
            surface: segment.surface,
            segment,
        };
        this.sampleInto(s, out);
        return out;
    }

    segmentAt(s: number): RouteSegment {
        return this.route.segmentAt(s);
    }

    project(x: number, y: number, hintS?: number): Projection {
        const out: Projection = { s: 0, lateralM: 0, distanceM: 0 };
        this.projectInto(x, y, hintS, out);
        return out;
    }

    sampleAt(s: number, lateralM: number): TerrainSample {
        this.sampleInto(s, this.scratchRoad);
        const road = this.scratchRoad;
        const worldX = road.x + road.normalX * lateralM;
        const worldY = road.y + road.normalY * lateralM;
        const heightM = this.terrain.heightAtCrossSection(
            road.elevationM,
            road.halfWidthM,
            road.bankRad,
            road.segment.theme,
            lateralM,
            worldX,
            worldY,
        );

        const plusLat = this.terrain.heightAtCrossSection(
            road.elevationM,
            road.halfWidthM,
            road.bankRad,
            road.segment.theme,
            lateralM + NORMAL_EPSILON_M,
            worldX + road.normalX * NORMAL_EPSILON_M,
            worldY + road.normalY * NORMAL_EPSILON_M,
        );
        const minusLat = this.terrain.heightAtCrossSection(
            road.elevationM,
            road.halfWidthM,
            road.bankRad,
            road.segment.theme,
            lateralM - NORMAL_EPSILON_M,
            worldX - road.normalX * NORMAL_EPSILON_M,
            worldY - road.normalY * NORMAL_EPSILON_M,
        );
        const gradientLateral = (plusLat - minusLat) / (2 * NORMAL_EPSILON_M);
        const gradientForward = this.terrain.gradeAt(s);
        const gradientX = gradientForward * road.tangentX + gradientLateral * road.normalX;
        const gradientY = gradientForward * road.tangentY + gradientLateral * road.normalY;
        const normalLength = Math.sqrt(gradientX * gradientX + gradientY * gradientY + 1);
        const surface = this.terrain.surfaceFor(road.halfWidthM, road.segment.theme, lateralM);

        return {
            heightM,
            normalX: -gradientX / normalLength,
            normalY: -gradientY / normalLength,
            normalZ: 1 / normalLength,
            gradientX,
            gradientY,
            surface,
            surfaceMu: this.terrain.surfaceMu(surface),
            rollingResistanceScale: this.terrain.rollingResistanceScale(surface),
            lateralM,
        };
    }

    heightAt(x: number, y: number, hintS?: number): number {
        this.projectInto(x, y, hintS, this.scratchProjection);
        this.sampleInto(this.scratchProjection.s, this.scratchRoad);
        return this.terrain.heightAtCrossSection(
            this.scratchRoad.elevationM,
            this.scratchRoad.halfWidthM,
            this.scratchRoad.bankRad,
            this.scratchRoad.segment.theme,
            this.scratchProjection.lateralM,
            x,
            y,
        );
    }

    surfaceMuAt(x: number, y: number, hintS?: number): number {
        this.projectInto(x, y, hintS, this.scratchProjection);
        this.sampleInto(this.scratchProjection.s, this.scratchRoad);
        const surface = this.terrain.surfaceFor(
            this.scratchRoad.halfWidthM,
            this.scratchRoad.segment.theme,
            this.scratchProjection.lateralM,
        );
        return this.terrain.surfaceMu(surface);
    }

    rollingResistanceScaleAt(x: number, y: number, hintS?: number): number {
        this.projectInto(x, y, hintS, this.scratchProjection);
        this.sampleInto(this.scratchProjection.s, this.scratchRoad);
        const surface = this.terrain.surfaceFor(
            this.scratchRoad.halfWidthM,
            this.scratchRoad.segment.theme,
            this.scratchProjection.lateralM,
        );
        return this.terrain.rollingResistanceScale(surface);
    }

    private sampleInto(s: number, out: RoadSample): void {
        this.path.samplePathInto(s, this.scratchPath);
        const path = this.scratchPath;
        const segment = this.route.segmentAt(s);
        const curvature = this.route.curvatureAt(s);
        const bankRad = clamp(
            Math.atan((curvature * REFERENCE_SPEED * REFERENCE_SPEED) / GRAVITY),
            -MAX_BANK_RAD,
            MAX_BANK_RAD,
        );

        out.s = s;
        out.x = path.x;
        out.y = path.y;
        out.heading = path.heading;
        out.tangentX = path.tangentX;
        out.tangentY = path.tangentY;
        out.normalX = path.normalX;
        out.normalY = path.normalY;
        out.elevationM = this.terrain.elevationAt(s);
        out.grade = this.terrain.gradeAt(s);
        out.bankRad = bankRad;
        out.halfWidthM = segment.halfWidthM;
        out.surface = segment.surface;
        out.segment = segment;
    }

    private projectInto(x: number, y: number, hintS: number | undefined, out: Projection): void {
        let s: number;
        if (hintS !== undefined && Number.isFinite(hintS)) {
            s = this.localSearch(x, y, hintS);
        } else {
            s = this.coarseSearch(x, y);
        }
        s = this.refineProjection(x, y, s);

        this.path.samplePathInto(s, this.scratchPath);
        const dx = this.scratchPath.x - x;
        const dy = this.scratchPath.y - y;
        out.s = s;
        out.lateralM = -(dx * this.scratchPath.normalX + dy * this.scratchPath.normalY);
        out.distanceM = Math.sqrt(dx * dx + dy * dy);
    }

    private localSearch(x: number, y: number, hintS: number): number {
        let bestS = hintS;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (
            let offset = -LOCAL_SEARCH_RADIUS_M;
            offset <= LOCAL_SEARCH_RADIUS_M;
            offset += LOCAL_SEARCH_STEP_M
        ) {
            const candidate = hintS + offset;
            const distance = this.distanceSquared(x, y, candidate);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestS = candidate;
            }
        }
        return bestS;
    }

    private coarseSearch(x: number, y: number): number {
        let guess = x;
        let bestS = guess;
        let bestDistance = Number.POSITIVE_INFINITY;
        let radius = COARSE_START_RADIUS_M;
        while (radius <= COARSE_MAX_RADIUS_M) {
            let passBestS = guess;
            let passBestDistance = Number.POSITIVE_INFINITY;
            let edgeHit = false;
            for (let offset = -radius; offset <= radius; offset += COARSE_STEP_M) {
                const candidate = guess + offset;
                const distance = this.distanceSquared(x, y, candidate);
                if (distance < passBestDistance) {
                    passBestDistance = distance;
                    passBestS = candidate;
                    edgeHit = Math.abs(offset) >= radius - COARSE_STEP_M;
                }
            }
            if (passBestDistance < bestDistance) {
                bestDistance = passBestDistance;
                bestS = passBestS;
            }
            if (!edgeHit) break;
            guess = passBestS;
            radius *= 2;
        }
        return bestS;
    }

    private refineProjection(x: number, y: number, startS: number): number {
        let s = startS;
        for (let iteration = 0; iteration < NEWTON_ITERATIONS; iteration += 1) {
            this.path.samplePathInto(s, this.scratchPath);
            const dx = this.scratchPath.x - x;
            const dy = this.scratchPath.y - y;
            const along = dx * this.scratchPath.tangentX + dy * this.scratchPath.tangentY;
            const lateral = dx * this.scratchPath.normalX + dy * this.scratchPath.normalY;
            const curvature = this.route.curvatureAt(s);
            const denominator = 1 - lateral * curvature;
            let step = Math.abs(denominator) > 1e-4 ? -along / denominator : 0;
            if (!Number.isFinite(step)) break;
            if (step > NEWTON_MAX_STEP_M) step = NEWTON_MAX_STEP_M;
            else if (step < -NEWTON_MAX_STEP_M) step = -NEWTON_MAX_STEP_M;
            s += step;
            if (Math.abs(step) < 1e-5) break;
        }
        return s;
    }

    private distanceSquared(x: number, y: number, s: number): number {
        this.path.samplePathInto(s, this.scratchPath);
        const dx = this.scratchPath.x - x;
        const dy = this.scratchPath.y - y;
        return dx * dx + dy * dy;
    }
}
