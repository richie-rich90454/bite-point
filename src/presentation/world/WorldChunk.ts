import { Mesh, Scene, TransformNode, VertexData } from "../babylon";
import type { WorldGenerator } from "../../simulation/world/WorldGenerator";
import type { WorldMaterials } from "./WorldMaterials";
import { ThemeBuilder } from "./ThemeBuilder";

const TERRAIN_LATERALS = [-110, -78, -52, -34, -22, -14, -9, 0, 9, 14, 22, 34, 52, 78, 110];
const ROAD_FRACTIONS = [-1, -0.5, 0, 0.5, 1];

export class WorldChunk {
    readonly root: TransformNode;

    constructor(
        private readonly scene: Scene,
        private readonly world: WorldGenerator,
        private readonly materials: WorldMaterials,
        readonly index: number,
        readonly lengthM: number,
    ) {
        this.root = new TransformNode(`world-chunk-${index}`, scene);
        const startS = index * lengthM;
        const rows = 20;
        this.buildRoad(startS, rows);
        this.buildMarkings(startS, rows);
        this.buildShoulders(startS, rows);
        this.buildTerrain(startS, rows);
        if (this.world.sample(startS + lengthM * 0.5).halfWidthM > 11) {
            this.buildMedian(startS, rows);
        }
        const theme = this.world.sample(startS + lengthM * 0.5).segment.theme;
        if (theme !== "city" && theme !== "bridge" && theme !== "tunnel") {
            this.buildRails(startS, rows);
        }
        new ThemeBuilder(scene, world, materials, this.root, index, startS, lengthM).build(theme);
    }

    dispose(): void {
        this.root.dispose(false, false);
    }

    private buildRoad(startS: number, rows: number): void {
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        for (let row = 0; row <= rows; row += 1) {
            const s = startS + (row / rows) * this.lengthM;
            const road = this.world.sample(s);
            for (const fraction of ROAD_FRACTIONS) {
                const lateral = fraction * road.halfWidthM;
                const terrain = this.world.sampleAt(s, lateral);
                const x = road.x + road.normalX * lateral;
                const y = road.y + road.normalY * lateral;
                positions.push(y, terrain.heightM + 0.025, x);
                uvs.push(lateral / 3, s / 3);
            }
        }
        const columns = ROAD_FRACTIONS.length;
        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns - 1; column += 1) {
                const a = row * columns + column;
                const b = a + 1;
                const c = a + columns;
                const d = c + 1;
                indices.push(a, b, c, b, d, c);
            }
        }
        const mesh = this.buildMesh("endless-road", positions, uvs, indices);
        mesh.material = this.materials.road;
        mesh.receiveShadows = true;
        mesh.isPickable = false;
    }

    private buildMarkings(startS: number, rows: number): void {
        const positions: number[] = [];
        const indices: number[] = [];
        const addVertex = (s: number, lateral: number): number => {
            const road = this.world.sample(s);
            const terrain = this.world.sampleAt(s, lateral);
            const x = road.x + road.normalX * lateral;
            const y = road.y + road.normalY * lateral;
            positions.push(y, terrain.heightM + 0.06, x);
            return positions.length / 3 - 1;
        };
        for (const side of [-1, 1]) {
            const base = positions.length / 3;
            for (let row = 0; row <= rows; row += 1) {
                const s = startS + (row / rows) * this.lengthM;
                const road = this.world.sample(s);
                const edge = side * (road.halfWidthM - 0.35);
                addVertex(s, edge - 0.1);
                addVertex(s, edge + 0.1);
            }
            for (let row = 0; row < rows; row += 1) {
                const a = base + row * 2;
                const b = a + 1;
                const c = a + 2;
                const d = a + 3;
                indices.push(a, b, c, b, d, c);
            }
        }
        const wide = this.world.sample(startS + this.lengthM * 0.5).halfWidthM > 11;
        if (wide) {
            for (const side of [-1, 1]) {
                for (const lateral of [1.55, 5.15, 8.75, 12.35]) {
                    const offset = side * lateral;
                    for (
                        let dash = Math.ceil(startS / 12) * 12;
                        dash < startS + this.lengthM;
                        dash += 12
                    ) {
                        const s0 = Math.max(startS, dash);
                        const s1 = Math.min(startS + this.lengthM, dash + 4);
                        if (s1 - s0 < 0.5) continue;
                        const a = addVertex(s0, offset - 0.1);
                        const b = addVertex(s0, offset + 0.1);
                        const c = addVertex(s1, offset - 0.1);
                        const d = addVertex(s1, offset + 0.1);
                        indices.push(a, b, c, b, d, c);
                    }
                }
            }
        } else {
            for (let dash = Math.ceil(startS / 12) * 12; dash < startS + this.lengthM; dash += 12) {
                const s0 = Math.max(startS, dash);
                const s1 = Math.min(startS + this.lengthM, dash + 4);
                if (s1 - s0 < 0.5) continue;
                const a = addVertex(s0, -0.08);
                const b = addVertex(s0, 0.08);
                const c = addVertex(s1, -0.08);
                const d = addVertex(s1, 0.08);
                indices.push(a, b, c, b, d, c);
            }
        }
        const mesh = this.buildMesh("endless-markings", positions, [], indices);
        mesh.material = this.materials.markings;
        mesh.receiveShadows = false;
        mesh.isPickable = false;
    }

    private buildShoulders(startS: number, rows: number): void {
        const offsets = [0.02, 1.2, 2.4, 3];
        for (const side of [-1, 1]) {
            const positions: number[] = [];
            const uvs: number[] = [];
            const indices: number[] = [];
            for (let row = 0; row <= rows; row += 1) {
                const s = startS + (row / rows) * this.lengthM;
                const road = this.world.sample(s);
                for (const offset of offsets) {
                    const lateral = side * (road.halfWidthM + offset);
                    const terrain = this.world.sampleAt(s, lateral);
                    const x = road.x + road.normalX * lateral;
                    const y = road.y + road.normalY * lateral;
                    positions.push(y, terrain.heightM + 0.004, x);
                    uvs.push(lateral / 4, s / 4);
                }
            }
            const columns = offsets.length;
            for (let row = 0; row < rows; row += 1) {
                for (let column = 0; column < columns - 1; column += 1) {
                    const a = row * columns + column;
                    const b = a + 1;
                    const c = a + columns;
                    const d = c + 1;
                    indices.push(a, b, c, b, d, c);
                }
            }
            const mesh = this.buildMesh(`endless-shoulder-${side}`, positions, uvs, indices);
            mesh.material = this.materials.shoulder;
            mesh.receiveShadows = true;
            mesh.isPickable = false;
        }
    }

    private buildMedian(startS: number, rows: number): void {
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        for (let row = 0; row <= rows; row += 1) {
            const s = startS + (row / rows) * this.lengthM;
            for (const lateral of [-1.5, 1.5]) {
                const road = this.world.sample(s);
                const terrain = this.world.sampleAt(s, lateral);
                const x = road.x + road.normalX * lateral;
                const y = road.y + road.normalY * lateral;
                positions.push(y, terrain.heightM + 0.14, x);
                uvs.push(lateral, s);
            }
        }
        for (let row = 0; row < rows; row += 1) {
            const a = row * 2;
            const b = a + 1;
            const c = a + 2;
            const d = a + 3;
            indices.push(a, b, c, b, d, c);
        }
        const mesh = this.buildMesh("endless-median", positions, uvs, indices);
        mesh.material = this.materials.curb;
        mesh.receiveShadows = true;
        mesh.isPickable = false;
    }

    private buildTerrain(startS: number, rows: number): void {
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        let theme = "sweep";
        for (let row = 0; row <= rows; row += 1) {
            const s = startS + (row / rows) * this.lengthM;
            const road = this.world.sample(s);
            theme = road.segment.theme;
            for (const lateral of TERRAIN_LATERALS) {
                const terrain = this.world.sampleAt(s, lateral);
                const x = road.x + road.normalX * lateral;
                const y = road.y + road.normalY * lateral;
                positions.push(y, terrain.heightM - 0.03, x);
                uvs.push(x / 14, y / 14);
            }
        }
        const columns = TERRAIN_LATERALS.length;
        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns - 1; column += 1) {
                const a = row * columns + column;
                const b = a + 1;
                const c = a + columns;
                const d = c + 1;
                indices.push(a, b, c, b, d, c);
            }
        }
        const mesh = this.buildMesh("endless-terrain", positions, uvs, indices);
        mesh.material = this.materials.terrain(theme);
        mesh.receiveShadows = true;
        mesh.isPickable = false;
    }

    private buildRails(startS: number, rows: number): void {
        for (const side of [-1, 1]) {
            const positions: number[] = [];
            const indices: number[] = [];
            for (let row = 0; row <= rows; row += 1) {
                const s = startS + (row / rows) * this.lengthM;
                const road = this.world.sample(s);
                const lateral = side * (road.halfWidthM + 2.2);
                const terrain = this.world.sampleAt(s, lateral);
                const x = road.x + road.normalX * lateral;
                const y = road.y + road.normalY * lateral;
                positions.push(y, terrain.heightM + 0.42, x);
                positions.push(y, terrain.heightM + 0.82, x);
            }
            for (let row = 0; row < rows; row += 1) {
                const a = row * 2;
                const b = a + 1;
                const c = a + 2;
                const d = a + 3;
                indices.push(a, b, c, b, d, c);
            }
            const mesh = this.buildMesh(`endless-rail-${side}`, positions, [], indices);
            mesh.material = this.materials.rail;
            mesh.receiveShadows = true;
            mesh.isPickable = false;
        }
    }

    private buildMesh(name: string, positions: number[], uvs: number[], indices: number[]): Mesh {
        const mesh = new Mesh(name, this.scene);
        const data = new VertexData();
        data.positions = positions;
        data.indices = indices;
        if (uvs.length > 0) data.uvs = uvs;
        const normals: number[] = [];
        VertexData.ComputeNormals(positions, indices, normals);
        data.normals = normals;
        data.applyToMesh(mesh, false);
        mesh.parent = this.root;
        return mesh;
    }
}
