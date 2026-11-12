import {
    Color3,
    CreateGround,
    DynamicTexture,
    Mesh,
    PBRMaterial,
    Scene,
    Texture,
    TransformNode,
} from "../babylon";
import type { ShadowGenerator } from "../babylon";
import { createRoadMaterial } from "../RoadMaterial";
import { applyTextureSet, TEXTURE_SETS } from "./TextureSets";
import { WorldMaterials } from "./WorldMaterials";
import {
    CITY_BLOCK_M,
    CITY_MEDIAN_HALF_M,
    CITY_ROAD_HALF_M,
    CITY_SIDEWALK_M,
    cityBlock,
    type CityBuilding,
} from "../../simulation/world/CityLayout";
import { hashSeed, mulberry32 } from "../../simulation/world/SeededNoise";

const LANE_WIDTH_M = (CITY_ROAD_HALF_M - CITY_MEDIAN_HALF_M) / 4;
const VIEW_RADIUS = 2;
const FOG_COLOR: [number, number, number] = [0.67, 0.7, 0.73];

interface CityChunk {
    root: TransformNode;
}

export class CityStreamer {
    readonly root: TransformNode;
    private readonly chunks = new Map<string, CityChunk>();
    private readonly materials: WorldMaterials;
    private readonly ownsMaterials: boolean;
    private readonly roadAligned: PBRMaterial;
    private readonly roadCross: PBRMaterial;
    private readonly ground: PBRMaterial;
    private readonly facades: PBRMaterial[][] = [];
    private seed = 1101;
    private initialized = false;
    private lastX = 0;
    private lastY = 0;

    constructor(
        private readonly scene: Scene,
        private readonly shadows: ShadowGenerator,
        materials?: WorldMaterials,
    ) {
        this.root = new TransformNode("city-world", scene);
        this.materials = materials ?? new WorldMaterials(scene);
        this.ownsMaterials = !materials;
        this.roadAligned = createRoadMaterial(scene, "city-road-aligned", 120, 32);
        this.roadCross = createRoadMaterial(scene, "city-road-cross", 32, 120);
        this.ground = new PBRMaterial("city-ground", scene);
        applyTextureSet(this.ground, scene, TEXTURE_SETS.concrete ?? TEXTURE_SETS.gravel!, 12, 12);
        this.ground.albedoColor = new Color3(0.52, 0.51, 0.48);
        this.ground.roughness = 0.96;
        this.ground.metallic = 0;
        this.buildFacades();
        this.setEnabled(false);
    }

    get activeChunks(): number {
        return this.chunks.size;
    }

    setSeed(seed: number): void {
        if (seed === this.seed) return;
        this.seed = seed;
        this.clear();
    }

    setEnabled(enabled: boolean): void {
        this.root.setEnabled(enabled);
        if (!enabled) this.clear();
        else this.initialized = false;
    }

    update(x: number, y: number, drawDistanceM: number): void {
        if (!this.root.isEnabled()) return;
        const radius = Math.max(
            1,
            Math.min(VIEW_RADIUS, Math.round(drawDistanceM / CITY_BLOCK_M / 2)),
        );
        const cx = Math.floor(x / CITY_BLOCK_M);
        const cy = Math.floor(y / CITY_BLOCK_M);
        const moved = Math.abs(x - this.lastX) > 8 || Math.abs(y - this.lastY) > 8;
        if (!this.initialized || moved) {
            this.lastX = x;
            this.lastY = y;
            const missing: Array<[number, number, number]> = [];
            for (let gx = cx - radius; gx <= cx + radius; gx += 1) {
                for (let gy = cy - radius; gy <= cy + radius; gy += 1) {
                    const key = `${gx},${gy}`;
                    if (!this.chunks.has(key)) {
                        missing.push([gx, gy, (gx - cx) ** 2 + (gy - cy) ** 2]);
                    }
                }
            }
            missing.sort((a, b) => a[2] - b[2]);
            const budget = this.initialized ? 2 : Math.max(4, missing.length);
            const deadline = performance.now() + (this.initialized ? 4 : 8);
            for (let index = 0; index < Math.min(budget, missing.length); index += 1) {
                if (this.initialized && performance.now() > deadline) break;
                const [gx, gy] = missing[index]!;
                this.buildChunk(gx, gy);
            }
            for (const [key, chunk] of this.chunks) {
                const [gx, gy] = key.split(",").map(Number) as [number, number];
                if (Math.abs(gx - cx) > radius + 1 || Math.abs(gy - cy) > radius + 1) {
                    chunk.root.dispose(false, false);
                    this.chunks.delete(key);
                }
            }
            this.initialized = true;
        }
        this.scene.fogColor.set(FOG_COLOR[0], FOG_COLOR[1], FOG_COLOR[2]);
        this.scene.fogDensity = 0.0021;
    }

    dispose(): void {
        this.clear();
        this.roadAligned.dispose();
        this.roadCross.dispose();
        this.ground.dispose();
        for (const row of this.facades) for (const material of row) material.dispose();
        if (this.ownsMaterials) this.materials.dispose();
        this.root.dispose();
    }

    private clear(): void {
        for (const chunk of this.chunks.values()) chunk.root.dispose(false, false);
        this.chunks.clear();
        this.initialized = false;
    }

    private buildChunk(gx: number, gy: number): void {
        const root = new TransformNode(`city-chunk-${gx}-${gy}`, this.scene);
        root.parent = this.root;
        const x0 = gx * CITY_BLOCK_M;
        const y0 = gy * CITY_BLOCK_M;
        const block = cityBlock(this.seed, gx, gy);

        this.plane(
            root,
            "city-ground",
            CITY_BLOCK_M,
            CITY_BLOCK_M,
            x0 + 60,
            y0 + 60,
            0,
            this.ground,
        );

        if (block.plaza) {
            const plaza = new PBRMaterial("city-plaza", this.scene);
            plaza.albedoColor = new Color3(0.42, 0.52, 0.36);
            plaza.roughness = 1;
            this.plane(root, "city-plaza", 72, 72, x0 + 60, y0 + 60, 0.02, plaza);
        }

        this.buildStreet(root, x0, y0);
        this.buildSidewalks(root, x0, y0);
        this.buildMedian(root, x0, y0);
        this.buildMarkings(root, x0, y0);
        this.buildCrosswalks(root, x0, y0);
        this.buildBuildings(root, block.buildings);
        this.buildProps(root, x0, y0, block.plaza);
        this.chunks.set(`${gx},${gy}`, { root });
    }

    private plane(
        root: TransformNode,
        name: string,
        width: number,
        depth: number,
        cityX: number,
        cityY: number,
        height: number,
        material: PBRMaterial,
    ): Mesh {
        const mesh = CreateGround(name, { width, height: depth }, this.scene);
        mesh.position.set(cityY, height, cityX);
        mesh.material = material;
        mesh.parent = root;
        mesh.receiveShadows = true;
        mesh.isPickable = false;
        return mesh;
    }

    private buildStreet(root: TransformNode, x0: number, y0: number): void {
        const width = CITY_ROAD_HALF_M * 2;
        this.plane(root, "city-road-ns", CITY_BLOCK_M, width, x0, y0 + 60, 0.03, this.roadAligned);
        this.plane(root, "city-road-ew", width, CITY_BLOCK_M, x0 + 60, y0, 0.035, this.roadCross);
    }

    private buildSidewalks(root: TransformNode, x0: number, y0: number): void {
        const offset = CITY_ROAD_HALF_M + CITY_SIDEWALK_M / 2;
        for (const side of [-1, 1]) {
            this.plane(
                root,
                "city-sidewalk-ns",
                CITY_BLOCK_M,
                CITY_SIDEWALK_M,
                x0 + side * offset,
                y0 + 60,
                0.06,
                this.materials.sidewalk,
            );
            this.plane(
                root,
                "city-sidewalk-ew",
                CITY_SIDEWALK_M,
                CITY_BLOCK_M,
                x0 + 60,
                y0 + side * offset,
                0.06,
                this.materials.sidewalk,
            );
        }
        for (const side of [-1, 1]) {
            this.box(
                root,
                "city-curb",
                this.materials.curb,
                x0 + side * CITY_ROAD_HALF_M,
                y0 + 60,
                0.09,
                0.24,
                0.32,
                CITY_BLOCK_M,
            );
            this.box(
                root,
                "city-curb",
                this.materials.curb,
                x0 + 60,
                y0 + side * CITY_ROAD_HALF_M,
                0.09,
                CITY_BLOCK_M,
                0.24,
                0.32,
                undefined,
                this.materials.curb,
            );
        }
    }

    private buildMedian(root: TransformNode, x0: number, y0: number): void {
        const width = CITY_MEDIAN_HALF_M * 2;
        this.box(
            root,
            "city-median",
            this.materials.curb,
            x0,
            y0 + 60,
            0.11,
            width,
            0.22,
            CITY_BLOCK_M,
        );
        this.box(
            root,
            "city-median",
            this.materials.curb,
            x0 + 60,
            y0,
            0.11,
            CITY_BLOCK_M,
            0.22,
            width,
        );
        for (const along of [20, 60, 100]) {
            this.place(root, this.materials.treeTrunk, x0, y0 + along, 0.4, 0.4, 0.6, 0.4);
            this.place(root, this.materials.treeCanopy, x0, y0 + along, 2.2, 0.55, 0.8, 0.55);
        }
    }

    private buildMarkings(root: TransformNode, x0: number, y0: number): void {
        const laneOffsets = [
            CITY_MEDIAN_HALF_M + LANE_WIDTH_M,
            CITY_MEDIAN_HALF_M + LANE_WIDTH_M * 2,
            CITY_MEDIAN_HALF_M + LANE_WIDTH_M * 3,
        ];
        const mark = this.materials.markings;
        for (const side of [-1, 1]) {
            for (const offset of laneOffsets) {
                const lateral = side * offset;
                for (let along = 4; along < CITY_BLOCK_M; along += 9) {
                    this.box(
                        root,
                        "city-dash",
                        mark,
                        x0 + lateral,
                        y0 + along,
                        0.075,
                        0.14,
                        0.02,
                        3.2,
                    );
                    this.box(
                        root,
                        "city-dash",
                        mark,
                        x0 + along,
                        y0 + lateral,
                        0.075,
                        3.2,
                        0.02,
                        0.14,
                    );
                }
            }
            this.box(
                root,
                "city-edge",
                mark,
                x0 + side * (CITY_ROAD_HALF_M - 0.35),
                y0 + 60,
                0.075,
                0.16,
                0.02,
                CITY_BLOCK_M - CITY_ROAD_HALF_M * 2,
            );
            this.box(
                root,
                "city-edge",
                mark,
                x0 + 60,
                y0 + side * (CITY_ROAD_HALF_M - 0.35),
                0.075,
                CITY_BLOCK_M - CITY_ROAD_HALF_M * 2,
                0.02,
                0.16,
            );
            this.box(
                root,
                "city-median-edge",
                mark,
                x0 + side * (CITY_MEDIAN_HALF_M + 0.2),
                y0 + 60,
                0.085,
                0.14,
                0.02,
                CITY_BLOCK_M - CITY_ROAD_HALF_M * 2,
            );
            this.box(
                root,
                "city-median-edge",
                mark,
                x0 + 60,
                y0 + side * (CITY_MEDIAN_HALF_M + 0.2),
                0.085,
                CITY_BLOCK_M - CITY_ROAD_HALF_M * 2,
                0.02,
                0.14,
            );
        }
    }

    private buildCrosswalks(root: TransformNode, x0: number, y0: number): void {
        const mark = this.materials.markings;
        const stripe = 0.65;
        const gap = 0.7;
        const count = Math.floor((CITY_ROAD_HALF_M * 2 - stripe) / (stripe + gap));
        for (const arm of [-1, 1]) {
            for (let index = 0; index < count; index += 1) {
                const offset = -CITY_ROAD_HALF_M + stripe + index * (stripe + gap);
                this.box(
                    root,
                    "city-crosswalk",
                    mark,
                    x0 + offset,
                    y0 + arm * (CITY_ROAD_HALF_M + 2.2),
                    0.08,
                    stripe,
                    0.02,
                    3,
                );
                this.box(
                    root,
                    "city-crosswalk",
                    mark,
                    x0 + arm * (CITY_ROAD_HALF_M + 2.2),
                    y0 + offset,
                    0.08,
                    3,
                    0.02,
                    stripe,
                );
            }
        }
    }

    private buildBuildings(root: TransformNode, buildings: CityBuilding[]): void {
        for (const building of buildings) {
            const source = this.facadeSource(building.style, building.height >= 45);
            const wall = source.createInstance(`city-building-${building.x}-${building.y}`);
            wall.position.set(building.y, building.height * 0.5, building.x);
            wall.scaling.set(building.depth, building.height, building.width);
            wall.parent = root;
            wall.isPickable = false;
            const roof = this.materials
                .boxSource("city-roof", this.materials.roof)
                .createInstance(`city-roof-${building.x}-${building.y}`);
            roof.position.set(building.y, building.height + 0.18, building.x);
            roof.scaling.set(building.depth + 0.6, 0.36, building.width + 0.6);
            roof.parent = root;
            roof.isPickable = false;
            if (building.rooftop) {
                const unit = this.materials
                    .boxSource("city-roof-unit", this.materials.foundation)
                    .createInstance(`city-roof-unit-${building.x}-${building.y}`);
                unit.position.set(
                    building.y + building.depth * 0.15,
                    building.height + 1.4,
                    building.x - building.width * 0.12,
                );
                unit.scaling.set(building.depth * 0.3, 2.4, building.width * 0.24);
                unit.parent = root;
                unit.isPickable = false;
            }
            const frontage = this.frontageOffset(building);
            const awning = this.materials
                .boxSource("city-awning", this.materials.signage)
                .createInstance(`city-awning-${building.x}-${building.y}`);
            awning.position.set(frontage.x, 3.1, frontage.y);
            awning.scaling.set(frontage.scaleX, 0.32, frontage.scaleZ);
            awning.parent = root;
            awning.isPickable = false;
        }
    }

    private frontageOffset(building: CityBuilding): {
        x: number;
        y: number;
        scaleX: number;
        scaleZ: number;
    } {
        const toWest = building.x - CITY_ROAD_HALF_M - CITY_SIDEWALK_M;
        const toEast = CITY_BLOCK_M - CITY_ROAD_HALF_M - CITY_SIDEWALK_M - building.x;
        const toSouth = building.y - CITY_ROAD_HALF_M - CITY_SIDEWALK_M;
        const toNorth = CITY_BLOCK_M - CITY_ROAD_HALF_M - CITY_SIDEWALK_M - building.y;
        const minimum = Math.min(toWest, toEast, toSouth, toNorth);
        const width = building.width * 0.7;
        const depth = building.depth * 0.7;
        if (minimum === toSouth)
            return {
                x: building.y - building.depth * 0.5 - 1.2,
                y: building.x,
                scaleX: 1.4,
                scaleZ: width,
            };
        if (minimum === toNorth)
            return {
                x: building.y + building.depth * 0.5 + 1.2,
                y: building.x,
                scaleX: 1.4,
                scaleZ: width,
            };
        if (minimum === toWest)
            return {
                x: building.y,
                y: building.x - building.width * 0.5 - 1.2,
                scaleX: depth,
                scaleZ: 1.4,
            };
        return {
            x: building.y,
            y: building.x + building.width * 0.5 + 1.2,
            scaleX: depth,
            scaleZ: 1.4,
        };
    }

    private buildProps(root: TransformNode, x0: number, y0: number, plaza: boolean): void {
        const random = mulberry32(hashSeed(this.seed, Math.round(x0), Math.round(y0)));
        for (const side of [-1, 1]) {
            for (const along of [24, 60, 96]) {
                const treeX = x0 + side * (CITY_ROAD_HALF_M + 3.2);
                const treeY = y0 + along + (random() - 0.5) * 4;
                this.tree(root, treeX, treeY, 0.85 + random() * 0.35);
            }
        }
        if (!plaza) {
            for (const side of [-1, 1]) {
                this.streetlight(root, x0 + side * (CITY_ROAD_HALF_M + 2.2), y0 + 14);
                this.streetlight(root, x0 + side * (CITY_ROAD_HALF_M + 2.2), y0 + 106);
            }
            this.parkedCar(root, x0 + CITY_ROAD_HALF_M - 1.6, y0 + 30, 0);
            this.parkedCar(root, x0 - CITY_ROAD_HALF_M + 1.6, y0 + 84, Math.PI);
        }
        if (random() < 0.55) this.trafficSignal(root, x0 + 2, y0 + 2);
        for (let index = 0; index < (plaza ? 8 : 3); index += 1) {
            this.tree(root, x0 + 20 + random() * 80, y0 + 20 + random() * 80, 0.7 + random() * 0.5);
        }
    }

    private tree(root: TransformNode, x: number, y: number, scale: number): void {
        this.place(root, this.materials.treeTrunk, x, y, 1.7 * scale, 0.45, 0.8, 0.45);
        this.place(
            root,
            this.materials.treeCanopy,
            x,
            y,
            4.7 * scale,
            0.9 * scale,
            1.1,
            0.9 * scale,
        );
    }

    private streetlight(root: TransformNode, x: number, y: number): void {
        const pole = this.materials
            .cylinderSource("city-light-post", this.materials.fence, 8)
            .createInstance(`city-light-${x}-${y}`);
        pole.position.set(y, 3.6, x);
        pole.scaling.set(0.16, 7.2, 0.16);
        pole.parent = root;
        pole.isPickable = false;
        const head = this.materials
            .boxSource("city-light-head", this.materials.tunnelLamp)
            .createInstance(`city-light-head-${x}-${y}`);
        head.position.set(y, 7.3, x + (x > 0 ? -0.9 : 0.9));
        head.scaling.set(0.5, 0.14, 1.8);
        head.parent = root;
        head.isPickable = false;
    }

    private parkedCar(root: TransformNode, x: number, y: number, heading: number): void {
        const body = this.materials
            .boxSource("city-car-body", this.materials.carBodyA)
            .createInstance(`city-parked-${x}-${y}`);
        body.position.set(y, 0.62, x);
        body.scaling.set(1.8, 0.6, 4.3);
        body.rotation.y = heading;
        body.parent = root;
        body.isPickable = false;
        const cabin = this.materials
            .boxSource("city-car-cabin", this.materials.storefrontGlass)
            .createInstance(`city-parked-cabin-${x}-${y}`);
        cabin.position.set(y, 1.12, x);
        cabin.scaling.set(1.55, 0.5, 2.2);
        cabin.rotation.y = heading;
        cabin.parent = root;
        cabin.isPickable = false;
    }

    private trafficSignal(root: TransformNode, x: number, y: number): void {
        const post = this.materials
            .cylinderSource("city-signal-post", this.materials.fence, 8)
            .createInstance(`city-signal-${x}-${y}`);
        post.position.set(y, 3, x);
        post.scaling.set(0.18, 6, 0.18);
        post.parent = root;
        post.isPickable = false;
        const arm = this.materials
            .boxSource("city-signal-arm", this.materials.fence)
            .createInstance(`city-signal-arm-${x}-${y}`);
        arm.position.set(y, 5.7, x - 2.1);
        arm.scaling.set(0.12, 0.12, 4.2);
        arm.parent = root;
        arm.isPickable = false;
        const housing = this.materials
            .boxSource("city-signal-housing", this.materials.roof)
            .createInstance(`city-signal-housing-${x}-${y}`);
        housing.position.set(y, 5.2, x - 4);
        housing.scaling.set(0.42, 0.95, 0.36);
        housing.parent = root;
        housing.isPickable = false;
        const lamp = this.materials
            .boxSource("city-signal-lamp", this.materials.signalRed)
            .createInstance(`city-signal-lamp-${x}-${y}`);
        lamp.position.set(y, 5.45, x - 4.2);
        lamp.scaling.set(0.26, 0.26, 0.06);
        lamp.parent = root;
        lamp.isPickable = false;
    }

    private box(
        root: TransformNode,
        key: string,
        material: PBRMaterial,
        cityX: number,
        cityY: number,
        height: number,
        widthX: number,
        heightY: number,
        widthY: number,
        rotation = 0,
        override?: PBRMaterial,
    ): void {
        const mesh = this.materials
            .boxSource(key, override ?? material)
            .createInstance(`${key}-${this.chunks.size}-${cityX}-${cityY}`);
        mesh.position.set(cityY, height, cityX);
        mesh.scaling.set(widthY, heightY, widthX);
        mesh.rotation.y = rotation;
        mesh.parent = root;
        mesh.isPickable = false;
    }

    private place(
        root: TransformNode,
        source: Mesh,
        x: number,
        y: number,
        height: number,
        scaleX: number,
        scaleY: number,
        scaleZ: number,
    ): void {
        const mesh = source.createInstance(`${source.name}-${this.chunks.size}-${x}-${y}`);
        mesh.position.set(y, height, x);
        mesh.scaling.set(scaleX, scaleY, scaleZ);
        mesh.parent = root;
        mesh.isPickable = false;
    }

    private buildFacades(): void {
        for (let style = 0; style < 4; style += 1) {
            const row: PBRMaterial[] = [];
            for (const tall of [false, true]) {
                const material = this.facadeMaterial(style, tall);
                row.push(material);
            }
            this.facades.push(row);
        }
    }

    private facadeSource(style: number, tall: boolean): Mesh {
        return this.materials.boxSource(
            `city-facade-${style}-${tall ? "tall" : "low"}`,
            this.facades[style]![tall ? 1 : 0]!,
        );
    }

    private facadeMaterial(style: number, tall: boolean): PBRMaterial {
        const palettes = [
            { wall: "#7c4a3f", band: "#6a3c33", glass: "#1f2d39", lit: "#e8b25e" },
            { wall: "#b1a58f", band: "#9b8f79", glass: "#24323d", lit: "#f0c477" },
            { wall: "#3e586b", band: "#334b5c", glass: "#16232e", lit: "#9fd3e8" },
            { wall: "#4b4c50", band: "#3d3e42", glass: "#19242d", lit: "#e5bd74" },
        ];
        const palette = palettes[style]!;
        const columns = tall ? 10 : 7;
        const rows = tall ? 20 : 8;
        const width = 256;
        const height = 512;
        const texture = new DynamicTexture(
            `city-facade-${style}-${tall}`,
            { width, height },
            this.scene,
            true,
        );
        const context = texture.getContext() as unknown as CanvasRenderingContext2D;
        context.fillStyle = palette.wall;
        context.fillRect(0, 0, width, height);
        const bandHeight = height / rows;
        for (let row = 0; row < rows; row += 1) {
            context.fillStyle = row % 2 === 0 ? palette.band : palette.wall;
            context.fillRect(0, row * bandHeight, width, bandHeight * 0.35);
        }
        const marginX = width * 0.06;
        const cellWidth = (width - marginX * 2) / columns;
        const windowWidth = cellWidth * 0.62;
        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const x = marginX + column * cellWidth + (cellWidth - windowWidth) * 0.5;
                const y = row * bandHeight + bandHeight * 0.32;
                context.fillStyle = palette.glass;
                context.fillRect(x, y, windowWidth, bandHeight * 0.46);
                context.fillStyle = "rgba(220,235,245,0.14)";
                context.fillRect(x, y, windowWidth * 0.45, bandHeight * 0.46);
            }
        }
        const groundHeight = height * 0.13;
        context.fillStyle = "#20282d";
        context.fillRect(0, height - groundHeight, width, groundHeight);
        context.fillStyle = "#101518";
        for (let door = 0; door < 4; door += 1) {
            context.fillRect(
                width * 0.08 + door * width * 0.23,
                height - groundHeight * 0.8,
                width * 0.17,
                groundHeight * 0.7,
            );
        }
        context.fillStyle = palette.lit;
        context.globalAlpha = 0.75;
        context.fillRect(0, height - groundHeight * 0.28, width, groundHeight * 0.16);
        context.globalAlpha = 1;
        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                if (Math.random() > 0.14) continue;
                const x = marginX + column * cellWidth + (cellWidth - windowWidth) * 0.5;
                const y = row * bandHeight + bandHeight * 0.32;
                context.fillStyle = palette.lit;
                context.globalAlpha = 0.28;
                context.fillRect(x, y, windowWidth, bandHeight * 0.46);
                context.globalAlpha = 1;
            }
        }
        texture.update(false);
        texture.wrapU = Texture.WRAP_ADDRESSMODE;
        texture.wrapV = Texture.WRAP_ADDRESSMODE;
        texture.anisotropicFilteringLevel = 4;
        const material = new PBRMaterial(`city-facade-mat-${style}-${tall}`, this.scene);
        material.albedoTexture = texture;
        material.emissiveTexture = texture;
        material.emissiveColor = new Color3(0.12, 0.12, 0.13);
        material.roughness = 0.74;
        material.metallic = 0.08;
        return material;
    }
}
