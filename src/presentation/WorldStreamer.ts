import { Scene, TransformNode } from "./babylon";
import type { ShadowGenerator } from "./babylon";
import type { WorldGenerator } from "../simulation/world/WorldGenerator";
import { WorldChunk } from "./world/WorldChunk";
import { WorldMaterials } from "./world/WorldMaterials";

const CHUNK_LENGTH_M = 160;

const FOG_PALETTE: Record<string, [number, number, number, number]> = {
    proving: [0.72, 0.8, 0.86, 0.00085],
    coast: [0.67, 0.8, 0.87, 0.00075],
    alpine: [0.7, 0.78, 0.84, 0.0009],
    mountain: [0.68, 0.76, 0.82, 0.001],
    forest: [0.58, 0.7, 0.66, 0.0014],
    industrial: [0.64, 0.66, 0.67, 0.0012],
    tunnel: [0.18, 0.18, 0.18, 0.004],
    bridge: [0.7, 0.78, 0.84, 0.0009],
    city: [0.65, 0.68, 0.7, 0.0012],
    summit: [0.78, 0.82, 0.86, 0.0006],
};

export class WorldStreamer {
    readonly root: TransformNode;
    private readonly materials: WorldMaterials;
    private readonly chunks = new Map<number, WorldChunk>();
    private lastS = 0;
    private initialized = false;
    private enabled = false;

    constructor(
        private readonly scene: Scene,
        private readonly world: WorldGenerator,
        private readonly shadows: ShadowGenerator,
    ) {
        this.root = new TransformNode("endless-world", scene);
        this.materials = new WorldMaterials(scene);
        this.shadows.addShadowCaster(this.materials.treeCanopy);
        this.shadows.addShadowCaster(this.materials.treeTrunk);
    }

    get activeChunks(): number {
        return this.chunks.size;
    }

    get distanceAlongRoad(): number {
        return this.lastS;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.root.setEnabled(enabled);
        if (enabled) this.initialized = false;
    }

    update(position: { x: number; y: number }, speedMps: number, drawDistanceM = 1400): void {
        if (!this.enabled) return;
        const projected = this.world.project(position.x, position.y, this.lastS);
        this.lastS = projected.s;
        const theme = this.world.sample(this.lastS).segment.theme;
        const fog = FOG_PALETTE[theme] ?? FOG_PALETTE.sweep!;
        this.scene.fogColor.set(fog[0], fog[1], fog[2]);
        this.scene.fogDensity = fog[3];
        const forward = Math.max(500, drawDistanceM);
        const rear = Math.max(240, Math.min(500, forward * 0.3));
        const minIndex = Math.floor((this.lastS - rear) / CHUNK_LENGTH_M);
        const maxIndex = Math.ceil((this.lastS + forward) / CHUNK_LENGTH_M);
        const center = Math.round(this.lastS / CHUNK_LENGTH_M);
        const missing: number[] = [];
        for (let index = minIndex; index <= maxIndex; index += 1) {
            if (!this.chunks.has(index)) missing.push(index);
        }
        missing.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
        const budget = this.initialized ? 4 : Math.min(missing.length, 6);
        for (let built = 0; built < missing.length && built < budget; built += 1) {
            const index = missing[built]!;
            const chunk = new WorldChunk(this.scene, this.world, this.materials, index, CHUNK_LENGTH_M);
            this.chunks.set(index, chunk);
        }
        this.initialized = true;
        for (const [index, chunk] of this.chunks) {
            if (index < minIndex - 1 || index > maxIndex + 1) {
                chunk.dispose();
                this.chunks.delete(index);
            }
        }
        void speedMps;
    }

    dispose(): void {
        for (const chunk of this.chunks.values()) chunk.dispose();
        this.chunks.clear();
        this.root.dispose();
        this.materials.dispose();
    }
}
