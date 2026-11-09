import {
    Color3,
    CreateCylinder,
    CreateSphere,
    DynamicTexture,
    Mesh,
    PBRMaterial,
    Scene,
    Texture,
} from "../babylon";
import { createRoadMaterial } from "../RoadMaterial";

const TERRAIN_TINTS: Record<string, string> = {
    proving: "#7c8060",
    coast: "#7f8568",
    alpine: "#6f7b5c",
    mountain: "#6d7862",
    forest: "#55684d",
    industrial: "#77746a",
    tunnel: "#6c6b62",
    bridge: "#737a6f",
    city: "#79766c",
    summit: "#8a897d",
};

export class WorldMaterials {
    readonly road: PBRMaterial;
    readonly rail: PBRMaterial;
    readonly markings: PBRMaterial;
    readonly treeTrunk: Mesh;
    readonly treeCanopy: Mesh;
    readonly rock: Mesh;
    private readonly terrainMaterials = new Map<string, PBRMaterial>();
    private readonly textures: DynamicTexture[] = [];

    constructor(private readonly scene: Scene) {
        this.road = createRoadMaterial(scene, "endless-asphalt", 3, 3);
        this.rail = new PBRMaterial("endless-rail", scene);
        this.rail.albedoColor = new Color3(0.62, 0.65, 0.67);
        this.rail.metallic = 0.75;
        this.rail.roughness = 0.34;
        this.rail.backFaceCulling = false;

        this.markings = new PBRMaterial("endless-markings", scene);
        this.markings.albedoColor = new Color3(0.92, 0.9, 0.82);
        this.markings.emissiveColor = new Color3(0.08, 0.08, 0.07);
        this.markings.roughness = 0.7;
        this.markings.metallic = 0;

        const trunkMaterial = new PBRMaterial("endless-trunk", scene);
        trunkMaterial.albedoColor = new Color3(0.31, 0.25, 0.18);
        trunkMaterial.roughness = 1;
        const canopyMaterial = new PBRMaterial("endless-canopy", scene);
        canopyMaterial.albedoColor = new Color3(0.24, 0.35, 0.22);
        canopyMaterial.roughness = 1;
        const rockMaterial = new PBRMaterial("endless-rock", scene);
        rockMaterial.albedoColor = new Color3(0.43, 0.42, 0.39);
        rockMaterial.roughness = 0.94;

        this.treeTrunk = CreateCylinder(
            "endless-tree-trunk",
            { diameterTop: 0.16, diameterBottom: 0.34, height: 5, tessellation: 6 },
            scene,
        );
        this.treeTrunk.material = trunkMaterial;
        this.treeTrunk.isVisible = false;
        this.treeTrunk.isPickable = false;

        this.treeCanopy = CreateCylinder(
            "endless-tree-canopy",
            { diameterTop: 0, diameterBottom: 3.2, height: 5.5, tessellation: 7 },
            scene,
        );
        this.treeCanopy.material = canopyMaterial;
        this.treeCanopy.isVisible = false;
        this.treeCanopy.isPickable = false;

        this.rock = CreateSphere("endless-rock-source", { diameter: 1.6, segments: 5 }, scene);
        this.rock.material = rockMaterial;
        this.rock.isVisible = false;
        this.rock.isPickable = false;
    }

    terrain(theme: string): PBRMaterial {
        const cached = this.terrainMaterials.get(theme);
        if (cached) return cached;
        const tint = TERRAIN_TINTS[theme] ?? TERRAIN_TINTS.sweep!;
        const material = new PBRMaterial(`terrain-${theme}`, this.scene);
        const texture = new DynamicTexture(`terrain-texture-${theme}`, 512, this.scene, true);
        const context = texture.getContext();
        context.fillStyle = tint;
        context.fillRect(0, 0, 512, 512);
        let seed = 918273 + theme.length * 7919;
        const random = (): number => {
            seed = (1664525 * seed + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        for (let index = 0; index < 9000; index += 1) {
            const shade = 30 + Math.floor(random() * 70);
            context.fillStyle = `rgba(${shade},${shade + 10},${Math.max(0, shade - 12)},0.16)`;
            context.fillRect(
                random() * 512,
                random() * 512,
                1 + random() * 4,
                1 + random() * 7,
            );
        }
        texture.wrapU = Texture.WRAP_ADDRESSMODE;
        texture.wrapV = Texture.WRAP_ADDRESSMODE;
        texture.anisotropicFilteringLevel = 8;
        texture.update(false);
        this.textures.push(texture);
        material.albedoTexture = texture;
        material.roughness = 0.98;
        material.metallic = 0;
        this.terrainMaterials.set(theme, material);
        return material;
    }

    dispose(): void {
        for (const texture of this.textures) texture.dispose();
        for (const material of this.terrainMaterials.values()) material.dispose();
        this.road.dispose();
        this.rail.dispose();
        this.markings.dispose();
        this.treeTrunk.dispose();
        this.treeCanopy.dispose();
        this.rock.dispose();
    }
}
