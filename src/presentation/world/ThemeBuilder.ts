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
        this.buildSidewalks();
        this.buildCurbs();
        for (const side of [-1, 1] as const) {
            this.buildStreetlights(side);
            for (const s of this.slots(30, 8)) {
                if (!this.isTheme(s, "city")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x1a2b3c : 0x4d5e6f);
                if (random() < 0.16) continue;
                this.buildBuilding(s, side, random);
            }
        }
    }

    private buildBuilding(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const frontage = 9 + random() * 11;
        const depth = 8 + random() * 9;
        const floors = 2 + Math.floor(random() * 9);
        const floorHeight = 3.1 + random() * 0.5;
        const height = floors * floorHeight;
        const inner = road.halfWidthM + 6.4;
        const lateral = side * (inner + depth * 0.5);
        const { base, bottom } = this.footprint(s, frontage, side, inner, depth);
        const walls = [this.materials.wallA, this.materials.wallB, this.materials.wallC];
        const wall = walls[Math.floor(random() * walls.length)]!;

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
        this.addBox("building-wall", wall, s, lateral, depth, height, frontage, base);
        this.addBox(
            "building-roof",
            this.materials.roof,
            s,
            lateral,
            depth + 0.6,
            0.32,
            frontage + 0.6,
            base + height,
        );
        if (random() > 0.45) {
            this.addBox(
                "building-roof-unit",
                this.materials.foundation,
                s + (random() - 0.5) * frontage * 0.4,
                lateral + (random() - 0.5) * depth * 0.4,
                depth * 0.3,
                0.9,
                frontage * 0.25,
                base + height + 0.32,
            );
        }

        const face = side * (inner - 0.06);
        const columns = Math.max(1, Math.floor((frontage - 2.4) / 2.6));
        const step = (frontage - 3) / columns;
        for (let floor = 1; floor < floors; floor += 1) {
            const centerY = base + floor * floorHeight + floorHeight * 0.55;
            for (let column = 0; column < columns; column += 1) {
                const windowS = s - frontage * 0.5 + 1.5 + (column + 0.5) * step;
                this.addBox(
                    "building-window",
                    this.materials.window,
                    windowS,
                    face,
                    0.14,
                    1.25,
                    1.15,
                    centerY - 0.625,
                );
            }
        }
        this.addBox("building-entrance", this.materials.window, s, face, 0.18, 2.5, 2.6, base);
        this.addBox(
            "building-sign",
            this.materials.signage,
            s,
            side * (inner - 0.14),
            0.16,
            0.55,
            3,
            base + 2.7,
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
            for (const s of this.slots(58, 26)) {
                if (!this.isTheme(s, "industrial")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x7711 : 0x9922);
                this.buildWarehouse(s, side, random);
            }
            for (const s of this.slots(16, 6)) {
                if (!this.isTheme(s, "industrial")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x33aa : 0x55bb);
                this.buildContainers(s, side, random);
            }
            for (const s of this.slots(120, 40)) {
                if (!this.isTheme(s, "industrial")) continue;
                const random = this.slotRandom(s, side === 1 ? 0x1234 : 0x5678);
                const road = this.world.sample(s);
                const lateral = side * (road.halfWidthM + 36 + random() * 14);
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
        }
        this.addRocks(4);
        this.addGrassTufts(10);
    }

    private buildWarehouse(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const frontage = 26 + random() * 22;
        const depth = 14 + random() * 12;
        const height = 6 + random() * 5;
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
    }

    private buildContainers(s: number, side: number, random: () => number): void {
        const road = this.world.sample(s);
        const lateral = side * (road.halfWidthM + 8.2);
        const base = this.world.sampleAt(s, lateral).heightM;
        const stack = 1 + Math.floor(random() * 3);
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
        this.addTrees(18, true);
        this.addRocks(9);
        this.addSnowPatches(summit ? 30 : 14);
        this.addGrassTufts(10);
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
    ): void {
        const road = this.world.sample(s);
        const mesh = source.createInstance(`${source.name}-${this.index}-${this.serial++}`);
        mesh.position.set(road.y + road.normalY * lateral, y, road.x + road.normalX * lateral);
        mesh.scaling.set(scaleX, scaleY, scaleZ);
        mesh.rotation.y = road.heading + rotation;
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
