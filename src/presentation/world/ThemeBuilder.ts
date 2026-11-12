import { Mesh, PBRMaterial, Scene, TransformNode, VertexData } from "../babylon";
import { mulberry32, hashSeed } from "../../simulation/world/SeededNoise";
import type { WorldGenerator } from "../../simulation/world/WorldGenerator";
import type { RoadSample } from "../../simulation/world/WorldTypes";
import type { WorldMaterials } from "./WorldMaterials";

interface Vec3 {
    x: number;
    y: number;
    z: number;
}

const WATER_LEVELS = new WeakMap<WorldGenerator, number>();
const CITY_BLOCK_LENGTH_M = 160;
const CITY_CROSS_HALF_M = 7.2;
const CITY_AVENUE_OFFSET_M = 30;
const CITY_AVENUE_HALF_M = 4.2;

function waterLevelFor(world: WorldGenerator): number {
    const cached = WATER_LEVELS.get(world);
    if (cached !== undefined) return cached;
    let minimum = Number.POSITIVE_INFINITY;
    for (let s = -2000; s <= 20_000; s += 500) {
        minimum = Math.min(minimum, world.sample(s).elevationM);
    }
    const level = minimum - 8;
    WATER_LEVELS.set(world, level);
    return level;
}

export class ThemeBuilder {
    private readonly random: () => number;
    private serial = 0;

    constructor(
        private readonly scene: Scene,
        private readonly world: WorldGenerator,
        private readonly materials: WorldMaterials,
        private readonly root: TransformNode,
        private readonly index: number,
        private readonly startS: number,
        private readonly lengthM: number,
    ) {
        this.random = mulberry32(hashSeed(world.seed, index, 0x6a09e667));
    }

    build(theme: string): void {
        if (theme !== "tunnel" && theme !== "bridge" && theme !== "city") {
            this.buildDelineators();
        }
        switch (theme) {
            case "city":
                this.buildCity();
                return;
            case "industrial":
                this.buildIndustrial();
                return;
            case "tunnel":
                this.buildTunnel();
                return;
            case "bridge":
                this.buildBridge();
                return;
            case "coast":
                this.buildCoast();
                return;
            case "forest":
                this.buildForest();
                return;
            case "alpine":
            case "mountain":
                this.buildAlpine(false);
                return;
            case "summit":
                this.buildAlpine(true);
                return;
            default:
                this.buildDefault();
        }
    }

    private buildCity(): void {
        this.buildCityGrid();
        this.buildSidewalks();
        this.buildCurbs();
        for (const side of [-1, 1] as const) {
            this.buildStreetlights(side);
            this.buildSidewalkTrees(side);
            this.buildParkedCars(side);
            for (const s of this.slots(30, 8)) {
                if (!this.isTheme(s, "city")) continue;
                if (this.distanceToCrossStreet(s) < 15) continue;
                const random = this.slotRandom(s, side === 1 ? 0x1a2b3c : 0x4d5e6f);
                if (random() < 0.08) continue;
                this.buildBuilding(s, side, random);
            }
            this.buildFarBlocks(side);
        }
        this.buildTrafficLights();
    }

    private buildDelineators(): void {
        for (const s of this.slots(18, 7)) {
            const road = this.world.sample(s);
            for (const side of [-1, 1] as const) {
                const lateral = side * (road.halfWidthM + 2.5);
                const base = this.world.sampleAt(s, lateral).heightM;
                this.addBox(
                    "delineator-post",
                    this.materials.curb,
                    s,
                    lateral,
                    0.1,
                    0.9,
                    0.1,
                    base,
                );
                this.addBox(
                    "delineator-reflector",
                    this.materials.markings,
                    s,
                    lateral,
                    0.08,
                    0.12,
                    0.05,
                    base + 0.74,
                );
            }
        }
    }

    private distanceToCrossStreet(s: number): number {
        const cross = (Math.floor(s / CITY_BLOCK_LENGTH_M) + 0.5) * CITY_BLOCK_LENGTH_M;
        return Math.abs(s - cross);
    }

    private buildCityGrid(): void {
        const crossS = this.startS + this.lengthM * 0.5;
        if (this.isTheme(crossS, "city")) this.buildCrossStreet(crossS);
        for (const side of [-1, 1] as const) this.buildParallelAvenue(side);
    }

    private buildCrossStreet(sCross: number): void {
        for (const side of [-1, 1] as const) {
            const road = this.world.sample(sCross);
            const inner = road.halfWidthM + 0.3;
            const distances = [inner, inner + 9, inner + 24, inner + 44, inner + 68, 104];
            const laterals = this.lateralColumns(distances, side);
            const rows: Vec3[][] = [];
            for (const offset of [-CITY_CROSS_HALF_M, 0, CITY_CROSS_HALF_M]) {
                const row = this.world.sample(sCross + offset);
                rows.push(
                    laterals.map((lateral) =>
                        this.point(
                            row,
                            lateral,
                            this.world.sampleAt(sCross + offset, lateral).heightM + 0.17,
                        ),
                    ),
                );
            }
            this.surface(`city-cross-${side}`, rows, this.materials.road, 1 / 6);

            const centerRows: Vec3[][] = [];
            for (const offset of [-0.16, 0.16]) {
                const row = this.world.sample(sCross + offset);
                centerRows.push(
                    laterals.map((lateral) =>
                        this.point(
                            row,
                            lateral,
                            this.world.sampleAt(sCross + offset, lateral).heightM + 0.2,
                        ),
                    ),
                );
            }
            this.surface(`city-cross-center-${side}`, centerRows, this.materials.markings, 1);

            const stripeCount = Math.floor((road.halfWidthM * 2 - 1.4) / 1.3);
            for (let index = 0; index <= stripeCount; index += 1) {
                const lateral = -road.halfWidthM + 0.9 + index * 1.3;
                for (const direction of [-1, 1] as const) {
                    const s = sCross + direction * (CITY_CROSS_HALF_M + 1.7);
                    const base = this.world.sampleAt(s, lateral).heightM + 0.07;
                    this.addBox(
                        "crosswalk-stripe",
                        this.materials.markings,
                        s,
                        lateral,
                        0.68,
                        0.02,
                        2.6,
                        base,
                    );
                }
            }
            this.buildSignal(sCross + CITY_CROSS_HALF_M + 2.2, side);
            this.buildSignal(sCross - CITY_CROSS_HALF_M - 2.2, -side);
        }
    }

    private buildParallelAvenue(side: number): void {
        const rows: Vec3[][] = [];
        const centerRows: Vec3[][] = [];
        const nearSidewalk: Vec3[][] = [];
        const farSidewalk: Vec3[][] = [];
        for (let offset = 0; offset <= this.lengthM + 0.001; offset += 20) {
            const s = this.startS + offset;
            const road = this.world.sample(s);
            const center = road.halfWidthM + CITY_AVENUE_OFFSET_M;
            const laterals = this.lateralColumns(
                [center - CITY_AVENUE_HALF_M, center, center + CITY_AVENUE_HALF_M],
                side,
            );
            rows.push(
                laterals.map((lateral) =>
                    this.point(road, lateral, this.world.sampleAt(s, lateral).heightM + 0.05),
                ),
            );
            const centerLine = this.lateralColumns([center - 0.12, center + 0.12], side);
            centerRows.push(
                centerLine.map((lateral) =>
                    this.point(road, lateral, this.world.sampleAt(s, lateral).heightM + 0.08),
                ),
            );
            nearSidewalk.push(
                this.lateralColumns(
                    [center - CITY_AVENUE_HALF_M - 2.6, center - CITY_AVENUE_HALF_M],
                    side,
                ).map((lateral) =>
                    this.point(road, lateral, this.world.sampleAt(s, lateral).heightM + 0.15),
                ),
            );
            farSidewalk.push(
                this.lateralColumns(
                    [center + CITY_AVENUE_HALF_M, center + CITY_AVENUE_HALF_M + 2.6],
                    side,
                ).map((lateral) =>
                    this.point(road, lateral, this.world.sampleAt(s, lateral).heightM + 0.15),
                ),
            );
        }
        this.surface(`city-avenue-${side}`, rows, this.materials.road, 1 / 6);
        this.surface(`city-avenue-center-${side}`, centerRows, this.materials.markings, 1);
        this.surface(`city-avenue-sidewalk-${side}`, nearSidewalk, this.materials.sidewalk, 1 / 3);
        this.surface(
            `city-avenue-sidewalk-far-${side}`,
            farSidewalk,
            this.materials.sidewalk,
            1 / 3,
        );
    }

    private buildFarBlocks(side: number): void {
        for (const s of this.slots(26, 9)) {
            if (!this.isTheme(s, "city")) continue;
            if (this.distanceToCrossStreet(s) < 13) continue;
            const random = this.slotRandom(s, side === 1 ? 0x91a1 : 0x92a2);
            if (random() < 0.15) continue;
            this.buildBlockTower(s, side, random);
        }
    }

    private buildBlockTower(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const frontage = 13 + random() * 10;
        const depth = 10 + random() * 8;
        const floors =
            5 + Math.floor(random() * 16) + (random() < 0.25 ? 8 + Math.floor(random() * 12) : 0);
        const floorHeight = 3.2;
        const height = floors * floorHeight;
        const inner = road.halfWidthM + CITY_AVENUE_OFFSET_M + CITY_AVENUE_HALF_M + 3.4;
        const lateral = side * (inner + depth * 0.5);
        const { base, bottom } = this.footprint(s, frontage, side, inner, depth);
        const walls = [this.materials.wallA, this.materials.wallB, this.materials.wallC];
        const wall = walls[Math.floor(random() * walls.length)]!;

        this.addBox(
            "block-tower-foundation",
            this.materials.foundation,
            s,
            lateral,
            depth + 0.2,
            base - bottom + 1.5,
            frontage + 0.2,
            bottom - 1.5,
        );
        this.addBox("block-tower-wall", wall, s, lateral, depth, height, frontage, base);
        this.addBox(
            "block-tower-roof",
            this.materials.roof,
            s,
            lateral,
            depth + 0.6,
            0.34,
            frontage + 0.6,
            base + height,
        );

        const face = side * (inner - 0.06);
        for (let floor = 2; floor < floors; floor += 2) {
            const centerY = base + floor * floorHeight;
            this.addBox(
                "block-tower-window-band",
                this.materials.window,
                s,
                face,
                0.14,
                1.35,
                Math.max(2, frontage - 2.6),
                centerY,
            );
        }
        if (random() < 0.3) {
            this.addBox(
                "block-tower-tank",
                this.materials.tank,
                s + (random() - 0.5) * frontage * 0.4,
                lateral,
                2.2,
                2.6,
                2.2,
                base + height + 0.34,
            );
        }
    }

    private lateralColumns(distances: number[], side: number): number[] {
        const laterals = distances.map((distance) => side * distance);
        return side < 0 ? laterals.slice().sort((a, b) => a - b) : laterals;
    }

    private buildBuilding(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const frontage = 9 + random() * 11;
        const depth = 8 + random() * 9;
        const floors =
            3 + Math.floor(random() * 12) + (random() < 0.28 ? 8 + Math.floor(random() * 10) : 0);
        const floorHeight = 3.1 + random() * 0.5;
        const height = floors * floorHeight;
        const inner = road.halfWidthM + 6.4;
        const lateral = side * (inner + depth * 0.5);
        const { base, bottom } = this.footprint(s, frontage, side, inner, depth);
        const walls = [this.materials.wallA, this.materials.wallB, this.materials.wallC];
        const wall = walls[Math.floor(random() * walls.length)]!;
        const setback = floors >= 4 && random() < 0.4;
        const podiumFloors = setback ? 2 : floors;
        const podiumHeight = podiumFloors * floorHeight;
        const towerFrontage = setback ? frontage * (0.62 + random() * 0.16) : frontage;
        const towerDepth = setback ? depth * (0.66 + random() * 0.16) : depth;
        const towerInset = (depth - towerDepth) * 0.5;

        this.addBox(
            "building-foundation",
            this.materials.foundation,
            s,
            lateral,
            depth + 0.2,
            base - bottom + 1.5,
            frontage + 0.2,
            bottom - 1.5,
        );
        this.addBox("building-wall", wall, s, lateral, depth, podiumHeight, frontage, base);

        let roofTop = base + podiumHeight;
        let roofFrontage = frontage;
        let roofDepth = depth;
        if (setback) {
            this.addBox(
                "building-podium",
                this.materials.roof,
                s,
                lateral,
                depth + 0.3,
                0.3,
                frontage + 0.3,
                base + podiumHeight,
            );
            const towerBase = base + podiumHeight + 0.3;
            const towerHeight = height - podiumHeight;
            this.addBox(
                "building-tower",
                wall,
                s,
                lateral,
                towerDepth,
                towerHeight,
                towerFrontage,
                towerBase,
            );
            roofTop = towerBase + towerHeight;
            roofFrontage = towerFrontage;
            roofDepth = towerDepth;
        }
        this.addBox(
            "building-roof",
            this.materials.roof,
            s,
            lateral,
            roofDepth + 0.6,
            0.32,
            roofFrontage + 0.6,
            roofTop,
        );
        roofTop += 0.32;

        const face = side * (inner - 0.06);
        for (let floor = 1; floor < floors; floor += 1) {
            const towerFloor = setback && floor >= podiumFloors;
            const bandFrontage = towerFloor ? towerFrontage : frontage;
            const floorFace = towerFloor ? side * (inner + towerInset - 0.06) : face;
            const centerY = base + floor * floorHeight + floorHeight * 0.55;
            if (random() < 0.22) {
                this.addBox(
                    "building-window-band",
                    this.materials.window,
                    s,
                    floorFace,
                    0.12,
                    1.25,
                    Math.max(1.5, bandFrontage - 2.4),
                    centerY - 0.625,
                );
            } else {
                const columns = Math.max(1, Math.floor((bandFrontage - 2.4) / 2.6));
                const step = (bandFrontage - 3) / columns;
                for (let column = 0; column < columns; column += 1) {
                    const windowS = s - bandFrontage * 0.5 + 1.5 + (column + 0.5) * step;
                    this.addBox(
                        "building-window",
                        this.materials.window,
                        windowS,
                        floorFace,
                        0.14,
                        1.25,
                        1.15,
                        centerY - 0.625,
                    );
                }
            }
            if (!towerFloor && floor >= 2 && random() < 0.32) {
                const balconyLength = bandFrontage * 0.5;
                this.addBox(
                    "building-balcony",
                    this.materials.curb,
                    s,
                    side * (inner - 0.5),
                    1,
                    0.16,
                    balconyLength,
                    centerY - 0.78,
                );
                this.addBox(
                    "building-balcony-rail",
                    this.materials.fence,
                    s,
                    side * (inner - 0.95),
                    0.08,
                    0.72,
                    balconyLength,
                    centerY - 0.62,
                );
            }
        }

        const glassLength = Math.max(2, frontage * 0.62);
        this.addBox(
            "storefront-glass",
            this.materials.storefrontGlass,
            s,
            face,
            0.16,
            2.5,
            glassLength,
            base,
        );
        this.addBox(
            "building-door",
            this.materials.roof,
            s,
            face,
            0.2,
            2.4,
            Math.min(1.8, glassLength * 0.32),
            base,
        );
        this.addBox(
            "storefront-awning",
            this.materials.awning,
            s,
            side * (inner - 0.55),
            1.1,
            0.2,
            glassLength + 0.4,
            base + 2.75,
        );
        this.addBox(
            "storefront-sign",
            this.materials.signLit,
            s,
            side * (inner - 0.16),
            0.16,
            0.5,
            Math.min(4.2, frontage * 0.42),
            base + 3.1,
        );
        this.addBox(
            "building-blade-sign",
            this.materials.signage,
            s + frontage * 0.32,
            side * (inner - 0.55),
            1,
            0.7,
            0.16,
            base + 3.6,
        );

        this.buildRoofDetails(s, side, lateral, roofFrontage, roofDepth, roofTop, random);
    }

    private buildRoofDetails(
        s: number,
        side: number,
        lateral: number,
        frontage: number,
        depth: number,
        top: number,
        random: () => number,
    ): void {
        const roadEdge = lateral - side * (depth * 0.5 - 0.15);
        const backEdge = lateral + side * (depth * 0.5 - 0.15);
        for (const edge of [roadEdge, backEdge]) {
            this.addBox(
                "building-parapet",
                this.materials.curb,
                s,
                edge,
                0.3,
                0.55,
                frontage + 0.6,
                top,
            );
        }
        for (const offset of [-frontage * 0.5, frontage * 0.5]) {
            this.addBox(
                "building-parapet-side",
                this.materials.curb,
                s + offset,
                lateral,
                depth + 0.6,
                0.55,
                0.3,
                top,
            );
        }

        if (random() < 0.45) {
            this.addBox(
                "building-roof-unit",
                this.materials.foundation,
                s + (random() - 0.5) * frontage * 0.4,
                lateral + (random() - 0.5) * depth * 0.4,
                depth * 0.3,
                0.9,
                frontage * 0.25,
                top,
            );
        }
        if (random() < 0.55) {
            const antennaS = s + (random() - 0.5) * frontage * 0.5;
            const antennaLateral = lateral + (random() - 0.5) * depth * 0.4;
            const antennaHeight = 2.5 + random() * 3.5;
            this.addCylinder(
                "building-antenna",
                this.materials.fence,
                antennaS,
                antennaLateral,
                0.12,
                antennaHeight,
                top,
                6,
            );
            this.addBox(
                "building-beacon",
                this.materials.signalRed,
                antennaS,
                antennaLateral,
                0.2,
                0.2,
                0.2,
                top + antennaHeight,
            );
        }
        if (random() < 0.4) {
            const tankS = s + (random() - 0.5) * frontage * 0.4;
            const tankLateral = lateral + (random() - 0.5) * depth * 0.4;
            this.addBox(
                "building-tank-stand",
                this.materials.fence,
                tankS,
                tankLateral,
                1.8,
                0.7,
                1.8,
                top,
            );
            this.addCylinder(
                "building-water-tank",
                this.materials.tank,
                tankS,
                tankLateral,
                2.2,
                2.4,
                top + 0.7,
                10,
            );
            this.place(
                this.materials.coneSource("roof-tank-cone", this.materials.tank, 10),
                tankS,
                tankLateral,
                top + 0.7 + 2.4 + 0.4,
                2.3,
                0.8,
                2.3,
                0,
            );
        }
    }

    private buildSidewalkTrees(side: number): void {
        for (const s of this.slots(23, 7)) {
            if (!this.isTheme(s, "city")) continue;
            if (this.distanceToCrossStreet(s) < 11) continue;
            const random = this.slotRandom(s, side === 1 ? 0x61a1 : 0x62a2);
            if (random() < 0.25) continue;
            const road = this.world.sample(s);
            const lateral = side * (road.halfWidthM + 1.7 + random() * 1.1);
            const base = this.world.sampleAt(s, lateral).heightM + 0.13;
            const trunkHeight = 2.6 + random() * 1.8;
            const canopyHeight = 2.4 + random();
            const canopyWidth = 0.85 + random() * 0.3;
            this.addBox("tree-planter", this.materials.curb, s, lateral, 1.1, 0.3, 1.1, base);
            this.place(
                this.materials.treeTrunk,
                s,
                lateral,
                base + 0.3 + trunkHeight * 0.5,
                0.55,
                trunkHeight / 5,
                0.55,
                random() * Math.PI * 2,
            );
            this.place(
                this.materials.treeCanopy,
                s,
                lateral,
                base + 0.3 + trunkHeight + canopyHeight * 0.5,
                canopyWidth,
                canopyHeight / 5.5,
                canopyWidth,
                random() * Math.PI * 2,
            );
        }
    }

    private buildParkedCars(side: number): void {
        const bodies = [this.materials.carBodyA, this.materials.carBodyB, this.materials.carBodyC];
        for (const s of this.slots(13, 5)) {
            if (!this.isTheme(s, "city")) continue;
            if (this.distanceToCrossStreet(s) < 10) continue;
            const random = this.slotRandom(s, side === 1 ? 0x71b1 : 0x72b2);
            if (random() < 0.45) continue;
            const road = this.world.sample(s);
            const lateral = side * (road.halfWidthM - 1.15);
            const base = this.world.sampleAt(s, lateral).heightM + 0.03;
            const body = bodies[Math.floor(random() * bodies.length)]!;
            for (const along of [-1.4, 1.4]) {
                this.addBox(
                    "car-wheel",
                    this.materials.roof,
                    s + along,
                    lateral,
                    1.86,
                    0.5,
                    0.62,
                    base,
                );
            }
            this.addBox("car-body", body, s, lateral, 1.8, 0.68, 4.3, base + 0.3);
            this.addBox(
                "car-cabin",
                this.materials.storefrontGlass,
                s - 0.2,
                lateral,
                1.62,
                0.6,
                2.2,
                base + 0.98,
            );
            this.addBox("car-roof", body, s - 0.2, lateral, 1.5, 0.1, 2.0, base + 1.58);
        }
    }

    private buildTrafficLights(): void {
        for (const s of this.slots(54, 10)) {
            if (!this.isTheme(s, "city")) continue;
            const random = this.slotRandom(s, 0x5a5a);
            this.buildSignal(s, random() < 0.5 ? -1 : 1);
        }
    }

    private buildSignal(s: number, side: number): void {
        const road = this.world.sample(s);
        const postLateral = side * (road.halfWidthM + 1.1);
        const base = this.world.sampleAt(s, postLateral).heightM + 0.13;
        const tip = side * (road.halfWidthM - 1.3);
        this.addCylinder("signal-post", this.materials.fence, s, postLateral, 0.18, 6, base, 8);
        this.addBox(
            "signal-arm",
            this.materials.fence,
            s,
            side * (road.halfWidthM - 0.1),
            2.4,
            0.12,
            0.12,
            base + 5.7,
        );
        this.addBox("signal-housing", this.materials.roof, s, tip, 0.34, 0.95, 0.4, base + 4.75);
        this.addBox(
            "signal-red",
            this.materials.signalRed,
            s,
            tip - side * 0.19,
            0.06,
            0.28,
            0.24,
            base + 5.3,
        );
        this.addBox(
            "signal-green",
            this.materials.signalGreen,
            s,
            tip - side * 0.19,
            0.06,
            0.28,
            0.24,
            base + 4.85,
        );
    }

    private buildSidewalks(): void {
        const offsets = [0.35, 1.6, 3.2, 5.2];
        for (const side of [-1, 1] as const) {
            const rows: Vec3[][] = [];
            for (let s = this.startS; s <= this.startS + this.lengthM + 0.001; s += 12) {
                const road = this.world.sample(s);
                const edge = this.world.sampleAt(s, side * (road.halfWidthM + 0.35)).heightM + 0.13;
                rows.push(
                    offsets.map((offset) =>
                        this.point(road, side * (road.halfWidthM + offset), edge),
                    ),
                );
            }
            this.surface(`sidewalk-${side}`, rows, this.materials.sidewalk, 1 / 3);
        }
    }

    private buildCurbs(): void {
        const step = 4;
        const first = Math.ceil((this.startS + 1) / step) * step;
        for (let s = first; s < this.startS + this.lengthM; s += step) {
            if (!this.isTheme(s, "city")) continue;
            for (const side of [-1, 1] as const) {
                const road = this.world.sample(s + step * 0.5);
                const lateral = side * (road.halfWidthM + 0.2);
                const height = this.world.sampleAt(s + step * 0.5, lateral).heightM;
                this.addBox(
                    "curb",
                    this.materials.curb,
                    s + step * 0.5,
                    lateral,
                    0.32,
                    0.24,
                    step + 0.1,
                    height - 0.02,
                );
            }
        }
    }

    private buildStreetlights(side: number): void {
        for (const s of this.slots(36, 10)) {
            if (!this.isTheme(s, "city")) continue;
            if (this.distanceToCrossStreet(s) < 10) continue;
            const road = this.world.sample(s);
            const lateral = side * (road.halfWidthM + 4.4);
            const base = this.world.sampleAt(s, lateral).heightM;
            this.addCylinder("streetlight-post", this.materials.fence, s, lateral, 0.16, 7.2, base);
            this.addBox(
                "streetlight-arm",
                this.materials.fence,
                s,
                side * (road.halfWidthM + 3.5),
                2,
                0.1,
                0.12,
                base + 6.9,
            );
            this.addBox(
                "streetlight-head",
                this.materials.tunnelLamp,
                s,
                side * (road.halfWidthM + 2.55),
                0.5,
                0.16,
                0.32,
                base + 6.82,
            );
        }
    }

    private buildIndustrial(): void {
        for (const side of [-1, 1] as const) {
            this.buildFence(side);
            this.buildPipeRack(side);
            this.buildWarningPosts(side);
            const factories: number[] = [];
            for (const s of this.slots(58, 26)) {
                if (!this.isTheme(s, "industrial")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x7711 : 0x9922);
                this.buildWarehouse(s, side, random);
                factories.push(s);
            }
            for (const s of this.slots(120, 40)) {
                if (!this.isTheme(s, "industrial")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x8a1b : 0x8b2c);
                this.buildFactoryHall(s, side, random);
                factories.push(s);
            }
            for (const s of this.slots(11, 5)) {
                if (!this.isTheme(s, "industrial")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x33aa : 0x55bb);
                this.buildContainers(s, side, random);
            }
            for (const s of this.slots(120, 40)) {
                if (!this.isTheme(s, "industrial")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x1234 : 0x5678);
                const road = this.world.sample(s);
                const lateral = side * (road.halfWidthM + 46 + random() * 8);
                const base = this.world.sampleAt(s, lateral).heightM;
                this.addCylinder(
                    "chimney",
                    this.materials.wallB,
                    s,
                    lateral,
                    2.4,
                    18 + random() * 14,
                    base,
                    12,
                );
            }
            for (const s of this.slots(96, 34)) {
                if (!this.isTheme(s, "industrial")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x2f3a : 0x2f3b);
                this.buildStorageTank(s, side, random);
            }
            for (const s of this.slots(70, 22)) {
                if (!this.isTheme(s, "industrial")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x4c1d : 0x4c2e);
                this.buildFloodlight(s, side, random);
            }
            for (const s of this.slots(96, 28)) {
                if (!this.isTheme(s, "industrial")) continue;
                if (factories.some((factory) => Math.abs(factory - s) < 40)) continue;
                const random = this.slotRandom(s, side === 1 ? 0x6e31 : 0x6e32);
                this.buildGantryCrane(s, side, random);
            }
        }
        this.addRocks(4);
        this.addGrassTufts(10);
    }

    private buildWarehouse(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const frontage = 26 + random() * 22;
        const depth = 14 + random() * 12;
        const height = 7 + random() * 4;
        const inner = road.halfWidthM + 10;
        const lateral = side * (inner + depth * 0.5);
        const { base, bottom } = this.footprint(s, frontage, side, inner, depth);
        this.addBox(
            "warehouse-base",
            this.materials.foundation,
            s,
            lateral,
            depth + 0.2,
            base - bottom + 1.2,
            frontage + 0.2,
            bottom - 1.2,
        );
        this.addBox(
            "warehouse",
            this.materials.warehouse,
            s,
            lateral,
            depth,
            height,
            frontage,
            base,
        );
        if (random() < 0.5) {
            this.buildSawtoothRoof(s, side, inner, depth, frontage, base + height);
        } else {
            this.addBox(
                "warehouse-roof",
                this.materials.roof,
                s,
                lateral,
                depth + 0.8,
                0.4,
                frontage + 0.8,
                base + height,
            );
        }
        this.addBox(
            "warehouse-door",
            this.materials.roof,
            s,
            side * (inner - 0.06),
            0.18,
            4.8,
            8,
            base,
        );
        this.addBox(
            "warehouse-window",
            this.materials.window,
            s,
            side * (inner - 0.08),
            0.12,
            1.2,
            frontage * 0.6,
            base + 5.2,
        );
    }

    private buildFactoryHall(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const frontage = 42 + random() * 24;
        const depth = 20 + random() * 10;
        const height = 8 + random() * 4;
        const inner = road.halfWidthM + 12;
        const lateral = side * (inner + depth * 0.5);
        const { base, bottom } = this.footprint(s, frontage, side, inner, depth);
        this.addBox(
            "factory-base",
            this.materials.foundation,
            s,
            lateral,
            depth + 0.2,
            base - bottom + 1.4,
            frontage + 0.2,
            bottom - 1.4,
        );
        this.addBox(
            "factory-hall",
            this.materials.warehouse,
            s,
            lateral,
            depth,
            height,
            frontage,
            base,
        );
        this.addBox(
            "factory-roof",
            this.materials.roof,
            s,
            lateral,
            depth + 0.9,
            0.4,
            frontage + 0.9,
            base + height,
        );
        this.addBox(
            "factory-window",
            this.materials.window,
            s,
            side * (inner - 0.08),
            0.12,
            1.4,
            frontage * 0.78,
            base + height * 0.62,
        );
        for (const offset of [-frontage * 0.28, 0, frontage * 0.28]) {
            this.addBox(
                "factory-door",
                this.materials.roof,
                s + offset,
                side * (inner - 0.07),
                0.18,
                5,
                6,
                base,
            );
        }
        for (const offset of [-frontage * 0.3, 0, frontage * 0.3]) {
            this.addBox(
                "factory-vent",
                this.materials.fence,
                s + offset + (random() - 0.5) * 3,
                lateral + (random() - 0.5) * depth * 0.4,
                2.4,
                0.8,
                2.4,
                base + height + 0.4,
            );
        }
    }

    private buildSawtoothRoof(
        s: number,
        side: number,
        inner: number,
        depth: number,
        frontage: number,
        top: number,
    ): void {
        const teeth = Math.max(2, Math.round(depth / 5));
        const toothDepth = depth / teeth;
        const rise = 1.4;
        const profile: Array<{ d: number; y: number }> = [];
        for (let tooth = 0; tooth < teeth; tooth += 1) {
            const start = tooth * toothDepth;
            const crest = start + toothDepth * 0.76;
            profile.push({ d: start, y: top });
            profile.push({ d: crest, y: top + rise });
            profile.push({ d: crest, y: top });
        }
        profile.push({ d: depth, y: top });
        const steps = Math.max(2, Math.round(frontage / 6));
        const rows: Vec3[][] = [];
        for (let step = 0; step <= steps; step += 1) {
            const rowS = s - frontage * 0.5 + (step / steps) * frontage;
            const road = this.world.sample(rowS);
            rows.push(profile.map((point) => this.point(road, side * (inner + point.d), point.y)));
        }
        this.surface(`sawtooth-${this.index}-${Math.round(s)}`, rows, this.materials.roof, 1 / 3);
    }

    private buildContainers(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const lateral = side * (road.halfWidthM + 8.2);
        const base = this.world.sampleAt(s, lateral).heightM;
        const stack = 1 + Math.floor(random() * 4);
        const colors = [
            this.materials.containerA,
            this.materials.containerB,
            this.materials.containerC,
        ];
        for (let level = 0; level < stack; level += 1) {
            const color = colors[Math.floor(random() * colors.length)]!;
            this.addBox("container", color, s, lateral, 2.4, 2.6, 6, base + level * 2.6);
        }
    }

    private buildStorageTank(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const offset = road.halfWidthM + 64 + random() * 12;
        const diameter = 9 + random() * 4;
        const height = 9 + random() * 6;
        const lateral = side * offset;
        const { base } = this.footprint(s, diameter, side, offset - diameter * 0.5, diameter);
        this.addCylinder(
            "storage-tank",
            this.materials.tank,
            s,
            lateral,
            diameter,
            height,
            base,
            16,
        );
        this.place(
            this.materials.coneSource("storage-tank-roof", this.materials.tank, 16),
            s,
            lateral,
            base + height + 0.8,
            diameter * 1.03,
            1.6,
            diameter * 1.03,
            0,
        );
        for (let ring = 2.4; ring < height - 0.6; ring += 2.4) {
            this.addCylinder(
                "storage-tank-ring",
                this.materials.tank,
                s,
                lateral,
                diameter + 0.28,
                0.16,
                base + ring,
                16,
            );
        }
        const ladderLateral = lateral - side * (diameter * 0.5 + 0.12);
        this.addBox(
            "tank-ladder",
            this.materials.fence,
            s,
            ladderLateral,
            0.12,
            height + 0.4,
            0.9,
            base,
        );
        this.addBox(
            "tank-platform",
            this.materials.fence,
            s,
            lateral - side * (diameter * 0.5 - 0.4),
            1.4,
            0.14,
            2.2,
            base + height - 0.1,
        );
    }

    private buildPipeRack(side: number): void {
        const step = 12;
        const first = Math.ceil((this.startS + 2) / step) * step;
        for (let s = first; s < this.startS + this.lengthM; s += step) {
            if (!this.isTheme(s, "industrial")) continue;
            const road = this.world.sample(s);
            const lateral = side * (road.halfWidthM + 5.1);
            const base = this.world.sampleAt(s, lateral).heightM;
            this.addBox("rack-post", this.materials.fence, s, lateral, 0.18, 3.4, 0.18, base);
            this.addBox("rack-beam", this.materials.fence, s, lateral, 1.7, 0.16, 0.3, base + 3.3);
            for (const offset of [-0.5, 0.5]) {
                this.place(
                    this.materials.cylinderSource("rack-pipe", this.materials.pipe, 8),
                    s + step * 0.5,
                    lateral + offset,
                    base + 3.65,
                    0.34,
                    step + 0.05,
                    0.34,
                    0,
                    Math.PI / 2,
                );
            }
        }
    }

    private buildWarningPosts(side: number): void {
        const step = 24;
        const first = Math.ceil((this.startS + 4) / step) * step;
        for (let s = first; s < this.startS + this.lengthM; s += step) {
            if (!this.isTheme(s, "industrial")) continue;
            const road = this.world.sample(s);
            const lateral = side * (road.halfWidthM + 7);
            const base = this.world.sampleAt(s, lateral).heightM;
            this.addBox("warning-post", this.materials.hazard, s, lateral, 0.2, 1.2, 0.2, base);
            for (const height of [0.28, 0.68]) {
                this.addBox(
                    "warning-band",
                    this.materials.roof,
                    s,
                    lateral,
                    0.26,
                    0.16,
                    0.26,
                    base + height,
                );
            }
        }
    }

    private buildFloodlight(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const lateral = side * (road.halfWidthM + 43 + random() * 1.5);
        const base = this.world.sampleAt(s, lateral).heightM;
        const poleHeight = 18 + random() * 6;
        this.addCylinder(
            "floodlight-pole",
            this.materials.fence,
            s,
            lateral,
            0.35,
            poleHeight,
            base,
            8,
        );
        this.addBox(
            "floodlight-head",
            this.materials.fence,
            s,
            lateral,
            2.4,
            0.2,
            0.6,
            base + poleHeight,
        );
        for (const offset of [-0.7, 0.7]) {
            this.addBox(
                "floodlight-lamp",
                this.materials.tunnelLamp,
                s,
                lateral + offset,
                0.7,
                0.4,
                0.35,
                base + poleHeight + 0.2,
            );
        }
    }

    private buildGantryCrane(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const near = side * (road.halfWidthM + 7.4);
        const far = side * (road.halfWidthM + 14.2);
        const nearBase = this.world.sampleAt(s, near).heightM;
        const farBase = this.world.sampleAt(s, far).heightM;
        const mid = side * (road.halfWidthM + 10.8);
        const top = Math.max(nearBase, farBase) + 11 + random() * 2;
        for (const along of [-2.5, 2.5]) {
            this.addCylinder(
                "crane-leg",
                this.materials.fence,
                s + along,
                near,
                0.45,
                top - nearBase,
                nearBase,
                8,
            );
            this.addCylinder(
                "crane-leg",
                this.materials.fence,
                s + along,
                far,
                0.45,
                top - farBase,
                farBase,
                8,
            );
            this.addBox(
                "crane-crossbeam",
                this.materials.fence,
                s + along,
                mid,
                Math.abs(far - near) + 0.9,
                0.6,
                0.7,
                top - 0.6,
            );
        }
        this.addBox("crane-trolley", this.materials.containerA, s, mid, 1.4, 0.7, 2.4, top);
        this.addBox("crane-cable", this.materials.fence, s, mid, 0.1, 4, 0.1, top - 4.7);
        this.addBox("crane-spreader", this.materials.hazard, s, mid, 2.2, 0.25, 1.2, top - 4.95);
        for (const track of [near, far]) {
            const trackBase = this.world.sampleAt(s, track).heightM;
            this.addBox("crane-rail", this.materials.fence, s, track, 0.2, 0.14, 26, trackBase);
        }
    }

    private buildFence(side: number): void {
        const step = 6;
        const first = Math.ceil((this.startS + 2) / step) * step;
        for (let s = first; s < this.startS + this.lengthM; s += step) {
            if (!this.isTheme(s, "industrial")) continue;
            const road = this.world.sample(s);
            const lateral = side * (road.halfWidthM + 6.2);
            const base = this.world.sampleAt(s, lateral).heightM;
            this.addBox("fence-post", this.materials.fence, s, lateral, 0.12, 1.7, 0.12, base);
            this.addBox(
                "fence-rail",
                this.materials.fence,
                s + step * 0.5,
                lateral,
                0.06,
                0.09,
                step + 0.05,
                base + 1.45,
            );
            this.addBox(
                "fence-rail",
                this.materials.fence,
                s + step * 0.5,
                lateral,
                0.06,
                0.09,
                step + 0.05,
                base + 0.75,
            );
        }
    }

    private buildTunnel(): void {
        const rows: Vec3[][] = [];
        for (let s = this.startS; s <= this.startS + this.lengthM + 0.001; s += 8) {
            const road = this.world.sample(s);
            const base = this.world.sampleAt(s, 0).heightM;
            const radius = road.halfWidthM + 2;
            const rise = radius * 0.95;
            const row: Vec3[] = [];
            for (let i = 0; i <= 14; i += 1) {
                const angle = (i / 14) * Math.PI;
                row.push(this.point(road, Math.cos(angle) * radius, base + Math.sin(angle) * rise));
            }
            rows.push(row);
        }
        this.surface("tunnel-arch", rows, this.materials.tunnelShell, 1 / 3);

        const first = Math.ceil((this.startS + 6) / 12) * 12;
        for (let s = first; s < this.startS + this.lengthM; s += 12) {
            const road = this.world.sample(s);
            const base = this.world.sampleAt(s, 0).heightM;
            const radius = road.halfWidthM + 1.9;
            for (const side of [-1, 1] as const) {
                this.addBox(
                    "tunnel-light",
                    this.materials.tunnelLamp,
                    s,
                    side * radius * 0.78,
                    0.14,
                    0.3,
                    1.5,
                    base + radius * 0.62,
                );
            }
        }
    }

    private buildBridge(): void {
        const level = waterLevelFor(this.world);
        const deckRows: Vec3[][] = [];
        const leftFascia: Vec3[][] = [];
        const rightFascia: Vec3[][] = [];
        for (let s = this.startS; s <= this.startS + this.lengthM + 0.001; s += 8) {
            const road = this.world.sample(s);
            const base = this.world.sampleAt(s, 0).heightM - 0.45;
            const width = road.halfWidthM + 0.8;
            deckRows.push([this.point(road, -width, base), this.point(road, width, base)]);
            leftFascia.push([this.point(road, -width, base), this.point(road, -width, base - 1.6)]);
            rightFascia.push([this.point(road, width, base), this.point(road, width, base - 1.6)]);
        }
        this.surface("bridge-deck", deckRows, this.materials.foundation, 1 / 3);
        this.surface("bridge-fascia-left", leftFascia, this.materials.wallB, 1 / 3);
        this.surface("bridge-fascia-right", rightFascia, this.materials.wallB, 1 / 3);

        const railFirst = Math.ceil((this.startS + 1) / 3) * 3;
        for (let s = railFirst; s < this.startS + this.lengthM; s += 3) {
            const road = this.world.sample(s + 1.5);
            const base = this.world.sampleAt(s + 1.5, 0).heightM;
            for (const side of [-1, 1] as const) {
                const lateral = side * (road.halfWidthM - 0.15);
                this.addBox(
                    "bridge-post",
                    this.materials.fence,
                    s,
                    lateral,
                    0.14,
                    1.1,
                    0.14,
                    base - 0.4,
                );
                for (const height of [0.5, 0.95]) {
                    this.addBox(
                        "bridge-rail",
                        this.materials.fence,
                        s + 1.5,
                        lateral,
                        0.12,
                        0.12,
                        3.05,
                        base - 0.4 + height,
                    );
                }
            }
        }

        const pylonFirst = Math.ceil((this.startS + 20) / 40) * 40;
        for (let s = pylonFirst; s < this.startS + this.lengthM; s += 40) {
            const road = this.world.sample(s);
            const base = this.world.sampleAt(s, 0).heightM - 1.6;
            const bottom = level - 2;
            for (const side of [-1, 1] as const) {
                const lateral = side * (road.halfWidthM - 0.8);
                this.addCylinder(
                    "bridge-pylon",
                    this.materials.wallB,
                    s,
                    lateral,
                    1.8,
                    base - bottom,
                    bottom,
                    12,
                );
            }
            this.addBox(
                "bridge-crossbeam",
                this.materials.wallB,
                s,
                0,
                2 * (road.halfWidthM - 0.8) + 1.8,
                0.9,
                1.4,
                base - 0.9,
            );
        }

        this.addWater([-200, -140, -80, 0, 80, 140, 200], level);
    }

    private buildCoast(): void {
        const level = waterLevelFor(this.world);
        this.addWater([-220, -170, -120, -75, -44], level);

        const sandRows: Vec3[][] = [];
        for (let s = this.startS; s <= this.startS + this.lengthM + 0.001; s += 10) {
            const road = this.world.sample(s);
            const row: Vec3[] = [];
            for (const lateral of [-44, -34, -24, -15, -7]) {
                row.push(this.point(road, lateral, this.world.sampleAt(s, lateral).heightM + 0.04));
            }
            sandRows.push(row);
        }
        this.surface("coast-beach", sandRows, this.materials.sand, 1 / 4);

        for (const s of this.slots(20, 6)) {
            if (!this.isTheme(s, "coast")) continue;
            const random = this.slotRandom(s, 0x77cc);
            const road = this.world.sample(s);
            const lateral = -(road.halfWidthM + 8 + random() * 16);
            const base = this.world.sampleAt(s, lateral).heightM;
            const height = 6 + random() * 4;
            this.place(
                this.materials.treeTrunk,
                s,
                lateral,
                base + height * 0.5,
                0.7,
                height / 5,
                0.7,
                random() * Math.PI,
            );
            this.place(
                this.materials.coneSource("palm-frond", this.materials.palmFrond, 6),
                s,
                lateral,
                base + height + 0.3,
                5.5,
                1.5,
                5.5,
                random() * Math.PI * 2,
            );
            this.place(
                this.materials.coneSource("palm-frond-small", this.materials.palmFrond, 6),
                s,
                lateral,
                base + height - 0.6,
                3.6,
                1.1,
                3.6,
                random() * Math.PI * 2,
            );
        }
        this.addRocks(8);
        this.addGrassTufts(18);
    }

    private buildForest(): void {
        this.addTrees(26, false);
        this.addRocks(5);
        this.addGrassTufts(34);
    }

    private buildAlpine(summit: boolean): void {
        this.addTrees(24, true);
        this.addRocks(12);
        this.addSnowPatches(summit ? 34 : 16);
        this.addGrassTufts(8);
        this.buildMountainCliffs(summit);
        this.buildChevronSigns();
        this.buildPassMarkers();
    }

    private buildMountainCliffs(summit: boolean): void {
        for (const side of [-1, 1] as const) {
            for (const s of this.slots(26, 10)) {
                if (!this.isTheme(s, "alpine", "mountain", "summit")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x3c1d : 0x3d2e);
                if (random() < 0.25) continue;
                const road = this.world.sample(s);
                const distance = 22 + random() * 34;
                const lateral = side * (road.halfWidthM + distance);
                const base = this.world.sampleAt(s, lateral).heightM;
                const height = 6 + random() * (summit ? 24 : 16);
                const width = 5 + random() * 9;
                const depth = 5 + random() * 10;
                this.place(
                    this.materials.rock,
                    s,
                    lateral,
                    base + height * 0.35,
                    width,
                    height,
                    depth,
                    random() * Math.PI * 2,
                );
                if (random() < 0.45) {
                    this.place(
                        this.materials.rock,
                        s + 6 + random() * 5,
                        lateral + side * (3 + random() * 6),
                        base + height * 0.2,
                        width * 0.7,
                        height * 0.7,
                        depth * 0.8,
                        random() * Math.PI * 2,
                    );
                }
            }
        }
    }

    private buildChevronSigns(): void {
        for (const s of this.slots(42, 14)) {
            if (!this.isTheme(s, "alpine", "mountain", "summit")) continue;
            const random = this.slotRandom(s, 0x6c31);
            if (random() < 0.5) continue;
            const road = this.world.sample(s);
            const side = random() < 0.5 ? -1 : 1;
            const lateral = side * (road.halfWidthM + 2.6);
            const base = this.world.sampleAt(s, lateral).heightM;
            this.addCylinder("chevron-post", this.materials.fence, s, lateral, 0.1, 1.8, base, 6);
            this.addBox(
                "chevron-board",
                this.materials.hazard,
                s,
                lateral,
                1.4,
                0.75,
                0.12,
                base + 1.25,
            );
            this.addBox(
                "chevron-stripe",
                this.materials.roof,
                s,
                lateral + side * 0.08,
                1.2,
                0.16,
                0.03,
                base + 1.6,
            );
        }
    }

    private buildPassMarkers(): void {
        for (const s of this.slots(18, 6)) {
            if (!this.isTheme(s, "alpine", "mountain", "summit")) continue;
            const road = this.world.sample(s);
            for (const side of [-1, 1] as const) {
                const lateral = side * (road.halfWidthM + 1.6);
                const base = this.world.sampleAt(s, lateral).heightM;
                this.addBox(
                    "pass-marker",
                    this.materials.hazard,
                    s,
                    lateral,
                    0.12,
                    1.1,
                    0.12,
                    base,
                );
                this.addBox(
                    "pass-marker-reflector",
                    this.materials.tunnelLamp,
                    s,
                    lateral,
                    0.08,
                    0.16,
                    0.05,
                    base + 0.86,
                );
            }
        }
    }

    private buildDefault(): void {
        this.addTrees(12, false);
        this.addRocks(4);
        this.addGrassTufts(22);
    }

    private addTrees(count: number, conifer: boolean): void {
        const themes = conifer ? ["alpine", "mountain", "summit"] : ["forest", "proving", "coast"];
        for (let i = 0; i < count; i += 1) {
            const s = this.startS + this.random() * this.lengthM;
            if (!this.isTheme(s, ...themes)) continue;
            const side = this.random() < 0.5 ? -1 : 1;
            const road = this.world.sample(s);
            const lateral = side * (road.halfWidthM + 6 + this.random() * 42);
            const base = this.world.sampleAt(s, lateral).heightM;
            const height = 5 + this.random() * 7;
            const trunkHeight = height * (conifer ? 0.4 : 0.55);
            this.place(
                this.materials.treeTrunk,
                s,
                lateral,
                base + trunkHeight * 0.5,
                0.6 + this.random() * 0.5,
                trunkHeight / 5,
                0.6 + this.random() * 0.5,
                this.random() * Math.PI * 2,
            );
            if (conifer) {
                const source = this.materials.coneSource("pine", this.materials.pine, 7);
                const canopyHeight = height - trunkHeight * 0.6;
                this.place(
                    source,
                    s,
                    lateral,
                    base + trunkHeight * 0.6 + canopyHeight * 0.5,
                    height * 0.34,
                    canopyHeight,
                    height * 0.34,
                    this.random() * Math.PI * 2,
                );
            } else {
                const canopyHeight = height * 0.85;
                this.place(
                    this.materials.treeCanopy,
                    s,
                    lateral,
                    base + trunkHeight * 0.55 + canopyHeight * 0.5,
                    0.8 + this.random() * 0.6,
                    canopyHeight / 5.5,
                    0.8 + this.random() * 0.6,
                    this.random() * Math.PI * 2,
                );
            }
        }
    }

    private addRocks(count: number): void {
        for (let i = 0; i < count; i += 1) {
            const s = this.startS + this.random() * this.lengthM;
            const side = this.random() < 0.5 ? -1 : 1;
            const road = this.world.sample(s);
            const lateral = side * (road.halfWidthM + 3.5 + this.random() * 26);
            const base = this.world.sampleAt(s, lateral).heightM;
            const scale = 0.6 + this.random() * 1.8;
            this.place(
                this.materials.rock,
                s,
                lateral,
                base + scale * 0.4,
                scale,
                scale * 0.7,
                scale,
                this.random() * Math.PI * 2,
            );
        }
    }

    private addSnowPatches(count: number): void {
        const source = this.materials.cylinderSource("snow-patch", this.materials.snow, 12);
        for (let i = 0; i < count; i += 1) {
            const s = this.startS + this.random() * this.lengthM;
            const side = this.random() < 0.5 ? -1 : 1;
            const road = this.world.sample(s);
            const lateral = side * (road.halfWidthM + 4 + this.random() * 48);
            const base = this.world.sampleAt(s, lateral).heightM;
            const size = 2 + this.random() * 5;
            this.place(source, s, lateral, base + 0.05, size, 0.06, size, 0);
        }
    }

    private addGrassTufts(count: number): void {
        const source = this.materials.coneSource("grass-tuft", this.materials.grassTuft, 5);
        for (let i = 0; i < count; i += 1) {
            const s = this.startS + this.random() * this.lengthM;
            const side = this.random() < 0.5 ? -1 : 1;
            const road = this.world.sample(s);
            const lateral = side * (road.halfWidthM + 2.5 + this.random() * 40);
            const base = this.world.sampleAt(s, lateral).heightM;
            const scale = 0.5 + this.random() * 0.8;
            this.place(source, s, lateral, base + scale * 0.3, scale, scale * 0.7, scale, 0);
        }
    }

    private addWater(laterals: number[], level: number): void {
        const rows: Vec3[][] = [];
        for (let s = this.startS; s <= this.startS + this.lengthM + 0.001; s += 20) {
            const road = this.world.sample(s);
            rows.push(laterals.map((lateral) => this.point(road, lateral, level)));
        }
        this.surface("water", rows, this.materials.water, 1 / 20);
    }

    private footprint(
        s: number,
        frontage: number,
        side: number,
        inner: number,
        depth: number,
    ): { base: number; bottom: number } {
        let base = Number.NEGATIVE_INFINITY;
        let bottom = Number.POSITIVE_INFINITY;
        for (const along of [-frontage * 0.5, frontage * 0.5]) {
            for (const across of [0, depth]) {
                const height = this.world.sampleAt(s + along, side * (inner + across)).heightM;
                base = Math.max(base, height);
                bottom = Math.min(bottom, height);
            }
        }
        return { base: base + 0.05, bottom };
    }

    private isTheme(s: number, ...themes: string[]): boolean {
        return themes.includes(this.world.sample(s).segment.theme);
    }

    private slots(spacing: number, margin: number): number[] {
        const first = Math.ceil((this.startS + margin) / spacing) * spacing;
        const out: number[] = [];
        for (let s = first; s <= this.startS + this.lengthM - margin; s += spacing) out.push(s);
        return out;
    }

    private slotRandom(s: number, salt: number): () => number {
        return mulberry32(hashSeed(this.world.seed, Math.round(s), salt));
    }

    private point(road: RoadSample, lateral: number, height: number): Vec3 {
        return {
            x: road.y + road.normalY * lateral,
            y: height,
            z: road.x + road.normalX * lateral,
        };
    }

    private addBox(
        key: string,
        material: PBRMaterial,
        s: number,
        lateral: number,
        width: number,
        height: number,
        length: number,
        bottom: number,
        rotationOffset = 0,
    ): void {
        this.place(
            this.materials.boxSource(key, material),
            s,
            lateral,
            bottom + height * 0.5,
            width,
            height,
            length,
            rotationOffset,
        );
    }

    private addCylinder(
        key: string,
        material: PBRMaterial,
        s: number,
        lateral: number,
        diameter: number,
        height: number,
        bottom: number,
        tessellation = 8,
    ): void {
        this.place(
            this.materials.cylinderSource(key, material, tessellation),
            s,
            lateral,
            bottom + height * 0.5,
            diameter,
            height,
            diameter,
            0,
        );
    }

    private place(
        source: Mesh,
        s: number,
        lateral: number,
        y: number,
        scaleX: number,
        scaleY: number,
        scaleZ: number,
        rotation: number,
        rotationX = 0,
    ): void {
        const road = this.world.sample(s);
        const mesh = source.createInstance(`${source.name}-${this.index}-${this.serial++}`);
        mesh.position.set(road.y + road.normalY * lateral, y, road.x + road.normalX * lateral);
        mesh.scaling.set(scaleX, scaleY, scaleZ);
        mesh.rotation.y = road.heading + rotation;
        mesh.rotation.x = rotationX;
        mesh.isPickable = false;
        mesh.parent = this.root;
    }

    private surface(name: string, rows: Vec3[][], material: PBRMaterial, uvScale: number): void {
        if (rows.length < 2) return;
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        for (const row of rows) {
            for (const vertex of row) {
                positions.push(vertex.x, vertex.y, vertex.z);
                uvs.push(vertex.z * uvScale, vertex.x * uvScale);
            }
        }
        const columns = rows[0]?.length ?? 0;
        for (let row = 0; row < rows.length - 1; row += 1) {
            for (let column = 0; column < columns - 1; column += 1) {
                const a = row * columns + column;
                const b = a + 1;
                const c = a + columns;
                const d = c + 1;
                indices.push(a, b, c, b, d, c);
            }
        }
        const normals: number[] = [];
        VertexData.ComputeNormals(positions, indices, normals);
        const data = new VertexData();
        data.positions = positions;
        data.uvs = uvs;
        data.indices = indices;
        data.normals = normals;
        const mesh = new Mesh(`${name}-${this.index}`, this.scene);
        data.applyToMesh(mesh, false);
        mesh.material = material;
        mesh.receiveShadows = true;
        mesh.isPickable = false;
        mesh.parent = this.root;
    }
}
