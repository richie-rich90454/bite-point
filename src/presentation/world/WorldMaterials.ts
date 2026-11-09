import { Color3, CreateCylinder, CreateSphere, Mesh, PBRMaterial, Scene } from "../babylon";
import { createRoadMaterial } from "../RoadMaterial";
import { applyTextureSet, TEXTURE_SETS } from "./TextureSets";

const TERRAIN_SETS: Record<string, string> = {
    proving: "grass",
    coast: "grass",
    alpine: "rock",
    mountain: "grass",
    forest: "grass",
    industrial: "concrete",
    tunnel: "concrete",
    bridge: "concrete",
    city: "concrete",
    summit: "rock",
};

const TERRAIN_TINTS: Record<string, string> = {
    proving: "#9aa07a",
    coast: "#9ca47c",
    alpine: "#8d8c84",
    mountain: "#8f9778",
    forest: "#7d8f70",
    industrial: "#9a968c",
    tunnel: "#8e8b82",
    bridge: "#969184",
    city: "#9a968a",
    summit: "#a8a59a",
};

export class WorldMaterials {
    readonly road: PBRMaterial;
    readonly rail: PBRMaterial;
    readonly markings: PBRMaterial;
    readonly treeTrunk: Mesh;
    readonly treeCanopy: Mesh;
    readonly rock: Mesh;
    private readonly terrainMaterials = new Map<string, PBRMaterial>();

    constructor(private readonly scene: Scene) {
        this.road = createRoadMaterial(scene, "endless-asphalt", 3, 3);
        this.rail = new PBRMaterial("endless-rail", scene);
        this.rail.albedoColor = new Color3(0.62, 0.65, 0.67);
        this.rail.metallic = 0.75;
        this.rail.roughness = 0.34;
        this.rail.backFaceCulling = false;
        applyTextureSet(this.rail, scene, TEXTURE_SETS.metal!, 2, 2);
        this.rail.albedoColor = new Color3(0.78, 0.8, 0.82);

        this.markings = new PBRMaterial("endless-markings", scene);
        this.markings.albedoColor = new Color3(0.92, 0.9, 0.82);
        this.markings.emissiveColor = new Color3(0.08, 0.08, 0.07);
        this.markings.roughness = 0.7;
        this.markings.metallic = 0;

        const trunkMaterial = new PBRMaterial("endless-trunk", scene);
        trunkMaterial.albedoColor = new Color3(0.31, 0.25, 0.18);
        trunkMaterial.roughness = 1;
        const canopyMaterial = new PBRMaterial("endless-canopy", scene);
        canopyMaterial.albedoColor = new Color3(0.34, 0.46, 0.3);
        canopyMaterial.roughness = 1;
        const rockMaterial = new PBRMaterial("endless-rock", scene);
        applyTextureSet(rockMaterial, scene, TEXTURE_SETS.rock!, 1, 1);
        rockMaterial.albedoColor = new Color3(0.72, 0.7, 0.66);
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
        const set = TEXTURE_SETS[TERRAIN_SETS[theme] ?? "grass"] ?? TEXTURE_SETS.grass!;
        const tint = TERRAIN_TINTS[theme] ?? TERRAIN_TINTS.coast!;
        const material = new PBRMaterial(`terrain-${theme}`, this.scene);
        applyTextureSet(material, this.scene, set, 1, 1);
        material.albedoColor = Color3.FromHexString(tint);
        material.roughness = 0.98;
        material.metallic = 0;
        this.terrainMaterials.set(theme, material);
        return material;
    }

    dispose(): void {
        for (const material of this.terrainMaterials.values()) material.dispose();
        this.road.dispose();
        this.rail.dispose();
        this.markings.dispose();
        this.treeTrunk.dispose();
        this.treeCanopy.dispose();
        this.rock.dispose();
    }
}
