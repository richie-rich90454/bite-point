import { Mesh, Scene, TransformNode, VertexData } from "../babylon";
import type { WorldGenerator } from "../../simulation/world/WorldGenerator";
import type { WorldMaterials } from "./WorldMaterials";

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
        this.buildTerrain(startS, rows);
        this.buildRails(startS, rows);
        this.buildProps(startS);
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
                const edge = side * (road.halfWidthM - 0.3);
                addVertex(s, edge - 0.075);
                addVertex(s, edge + 0.075);
            }
            for (let row = 0; row < rows; row += 1) {
                const a = base + row * 2;
                const b = a + 1;
                const c = a + 2;
                const d = a + 3;
                indices.push(a, b, c, b, d, c);
            }
        }
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
        const mesh = this.buildMesh("endless-markings", positions, [], indices);
        mesh.material = this.materials.markings;
        mesh.receiveShadows = false;
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

    private buildProps(startS: number): void {
        let seed = (this.index * 2654435761 + 1013904223) >>> 0;
        const random = (): number => {
            seed = (1664525 * seed + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        const road = this.world.sample(startS + this.lengthM * 0.5);
        const theme = road.segment.theme;
        const dense = theme === "forest" || theme === "coast" || theme === "climb";
        const count = dense ? 14 : 7;
        for (let index = 0; index < count; index += 1) {
            const side = random() < 0.5 ? -1 : 1;
            const s = startS + random() * this.lengthM;
            const lateral = side * (road.halfWidthM + 6 + random() * 44);
            const terrain = this.world.sampleAt(s, lateral);
            const center = this.world.sample(s);
            const x = center.x + center.normalX * lateral;
            const y = center.y + center.normalY * lateral;
            const height = 4.5 + random() * 5;
            const trunk = this.materials.treeTrunk.createInstance(`trunk-${this.index}-${index}`);
            trunk.position.set(y, terrain.heightM + height * 0.5, x);
            trunk.scaling.y = height / 5;
            trunk.rotation.y = random() * Math.PI * 2;
            trunk.parent = this.root;
            const canopy = this.materials.treeCanopy.createInstance(
                `canopy-${this.index}-${index}`,
            );
            canopy.position.set(y, terrain.heightM + height + 1.1, x);
            canopy.scaling.y = height / 5.5;
            canopy.scaling.x = 0.8 + random() * 0.5;
            canopy.scaling.z = canopy.scaling.x;
            canopy.rotation.y = random() * Math.PI * 2;
            canopy.parent = this.root;
            if (index < 3) {
                this.materials.treeTrunk.receiveShadows = true;
                this.materials.treeCanopy.receiveShadows = true;
            }
        }
        const rockCount = 2 + Math.floor(random() * 3);
        for (let index = 0; index < rockCount; index += 1) {
            const side = random() < 0.5 ? -1 : 1;
            const s = startS + random() * this.lengthM;
            const lateral = side * (road.halfWidthM + 3 + random() * 26);
            const terrain = this.world.sampleAt(s, lateral);
            const center = this.world.sample(s);
            const x = center.x + center.normalX * lateral;
            const y = center.y + center.normalY * lateral;
            const rock = this.materials.rock.createInstance(`rock-${this.index}-${index}`);
            const scale = 0.6 + random() * 1.8;
            rock.position.set(y, terrain.heightM + scale * 0.4, x);
            rock.scaling.set(scale, scale * 0.7, scale);
            rock.rotation.y = random() * Math.PI * 2;
            rock.parent = this.root;
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
