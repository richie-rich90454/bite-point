import {
    Color3,
    CreateBox,
    CreateCylinder,
    CreateSphere,
    Mesh,
    PBRMaterial,
    Scene,
} from "../babylon";
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
    readonly shoulder: PBRMaterial;
    readonly curb: PBRMaterial;
    readonly sidewalk: PBRMaterial;
    readonly wallA: PBRMaterial;
    readonly wallB: PBRMaterial;
    readonly wallC: PBRMaterial;
    readonly tunnelShell: PBRMaterial;
    readonly roof: PBRMaterial;
    readonly foundation: PBRMaterial;
    readonly window: PBRMaterial;
    readonly signage: PBRMaterial;
    readonly water: PBRMaterial;
    readonly sand: PBRMaterial;
    readonly snow: PBRMaterial;
    readonly grassTuft: PBRMaterial;
    readonly tunnelLamp: PBRMaterial;
    readonly warehouse: PBRMaterial;
    readonly containerA: PBRMaterial;
    readonly containerB: PBRMaterial;
    readonly containerC: PBRMaterial;
    readonly fence: PBRMaterial;
    readonly palmFrond: PBRMaterial;
    readonly pine: PBRMaterial;
    readonly treeTrunk: Mesh;
    readonly treeCanopy: Mesh;
    readonly rock: Mesh;
    private readonly terrainMaterials = new Map<string, PBRMaterial>();
    private readonly ownedMaterials: PBRMaterial[] = [];
    private readonly sourceMeshes = new Map<string, Mesh>();

    constructor(private readonly scene: Scene) {
        this.road = createRoadMaterial(scene, "endless-asphalt", 3, 3);

        this.rail = this.pbr("endless-rail");
        this.rail.albedoColor = new Color3(0.62, 0.65, 0.67);
        this.rail.metallic = 0.75;
        this.rail.roughness = 0.34;
        this.rail.backFaceCulling = false;
        applyTextureSet(this.rail, scene, TEXTURE_SETS.metal!, 2, 2);
        this.rail.albedoColor = new Color3(0.78, 0.8, 0.82);

        this.markings = this.pbr("endless-markings");
        this.markings.albedoColor = new Color3(0.92, 0.9, 0.82);
        this.markings.emissiveColor = new Color3(0.08, 0.08, 0.07);
        this.markings.roughness = 0.7;
        this.markings.metallic = 0;

        this.shoulder = this.pbr("endless-shoulder");
        applyTextureSet(this.shoulder, scene, TEXTURE_SETS.gravel!, 1, 1);
        this.shoulder.albedoColor = new Color3(0.54, 0.5, 0.44);
        this.shoulder.roughness = 1;

        this.curb = this.concrete("endless-curb", "#b4aea2", 0.9);
        this.sidewalk = this.concrete("endless-sidewalk", "#9f9a90", 0.92);
        this.sidewalk.backFaceCulling = false;
        this.wallA = this.concrete("endless-wall-a", "#c2b8a8", 0.86);
        this.wallB = this.concrete("endless-wall-b", "#9c9188", 0.88);
        this.wallB.backFaceCulling = false;
        this.wallC = this.concrete("endless-wall-c", "#8b949c", 0.82);
        this.tunnelShell = this.concrete("endless-tunnel-shell", "#84817a", 0.92);
        this.tunnelShell.backFaceCulling = false;
        this.foundation = this.concrete("endless-foundation", "#6f6a62", 0.95);
        this.foundation.backFaceCulling = false;
        this.warehouse = this.metal("endless-warehouse", "#9aa3aa", 0.55);
        this.containerA = this.metal("endless-container-a", "#8c3b2e", 0.62);
        this.containerB = this.metal("endless-container-b", "#2f5d7a", 0.62);
        this.containerC = this.metal("endless-container-c", "#3f6b45", 0.62);
        this.fence = this.metal("endless-fence", "#6d7378", 0.5);

        this.roof = this.pbr("endless-roof");
        this.roof.albedoColor = new Color3(0.19, 0.2, 0.21);
        this.roof.roughness = 0.9;
        this.roof.metallic = 0.15;

        this.window = this.pbr("endless-window");
        this.window.albedoColor = new Color3(0.09, 0.13, 0.18);
        this.window.emissiveColor = new Color3(0.06, 0.09, 0.12);
        this.window.roughness = 0.12;
        this.window.metallic = 0.55;

        this.signage = this.pbr("endless-signage");
        this.signage.albedoColor = new Color3(0.95, 0.72, 0.32);
        this.signage.emissiveColor = new Color3(0.62, 0.42, 0.14);
        this.signage.roughness = 0.5;

        this.tunnelLamp = this.pbr("endless-tunnel-lamp");
        this.tunnelLamp.albedoColor = new Color3(1, 0.93, 0.72);
        this.tunnelLamp.emissiveColor = new Color3(0.95, 0.8, 0.48);
        this.tunnelLamp.roughness = 0.4;

        this.water = this.pbr("endless-water");
        this.water.albedoColor = new Color3(0.07, 0.22, 0.3);
        this.water.emissiveColor = new Color3(0.01, 0.04, 0.06);
        this.water.roughness = 0.1;
        this.water.metallic = 0.25;
        this.water.backFaceCulling = false;

        this.snow = this.pbr("endless-snow");
        this.snow.albedoColor = new Color3(0.91, 0.94, 0.96);
        this.snow.roughness = 0.85;
        this.snow.metallic = 0;

        this.grassTuft = this.pbr("endless-grass-tuft");
        this.grassTuft.albedoColor = new Color3(0.26, 0.38, 0.2);
        this.grassTuft.roughness = 1;

        this.palmFrond = this.pbr("endless-palm-frond");
        this.palmFrond.albedoColor = new Color3(0.25, 0.43, 0.23);
        this.palmFrond.roughness = 1;

        this.pine = this.pbr("endless-pine");
        this.pine.albedoColor = new Color3(0.16, 0.27, 0.17);
        this.pine.roughness = 1;

        this.sand = this.pbr("endless-sand");
        applyTextureSet(this.sand, scene, TEXTURE_SETS.gravel!, 1, 1);
        this.sand.albedoColor = new Color3(0.82, 0.74, 0.55);
        this.sand.roughness = 1;
        this.sand.backFaceCulling = false;

        const trunkMaterial = this.pbr("endless-trunk");
        trunkMaterial.albedoColor = new Color3(0.31, 0.25, 0.18);
        trunkMaterial.roughness = 1;

        const canopyMaterial = this.pbr("endless-canopy");
        canopyMaterial.albedoColor = new Color3(0.34, 0.46, 0.3);
        canopyMaterial.roughness = 1;

        const rockMaterial = this.pbr("endless-rock");
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

    /** Shared invisible source mesh; callers attach instances to their own chunk roots. */
    boxSource(key: string, material: PBRMaterial): Mesh {
        const cached = this.sourceMeshes.get(key);
        if (cached) return cached;
        const mesh = CreateBox(`src-${key}`, { size: 1 }, this.scene);
        mesh.material = material;
        mesh.isVisible = false;
        mesh.isPickable = false;
        this.sourceMeshes.set(key, mesh);
        return mesh;
    }

    cylinderSource(key: string, material: PBRMaterial, tessellation = 8): Mesh {
        const cached = this.sourceMeshes.get(key);
        if (cached) return cached;
        const mesh = CreateCylinder(
            `src-${key}`,
            { diameter: 1, height: 1, tessellation },
            this.scene,
        );
        mesh.material = material;
        mesh.isVisible = false;
        mesh.isPickable = false;
        this.sourceMeshes.set(key, mesh);
        return mesh;
    }

    coneSource(key: string, material: PBRMaterial, tessellation = 7): Mesh {
        const cached = this.sourceMeshes.get(key);
        if (cached) return cached;
        const mesh = CreateCylinder(
            `src-${key}`,
            { diameterTop: 0, diameterBottom: 1, height: 1, tessellation },
            this.scene,
        );
        mesh.material = material;
        mesh.isVisible = false;
        mesh.isPickable = false;
        this.sourceMeshes.set(key, mesh);
        return mesh;
    }

    dispose(): void {
        for (const material of this.terrainMaterials.values()) material.dispose();
        for (const material of this.ownedMaterials) material.dispose();
        for (const mesh of this.sourceMeshes.values()) mesh.dispose();
        this.road.dispose();
        this.treeTrunk.dispose();
        this.treeCanopy.dispose();
        this.rock.dispose();
    }

    private pbr(name: string): PBRMaterial {
        const material = new PBRMaterial(name, this.scene);
        this.ownedMaterials.push(material);
        return material;
    }

    private concrete(name: string, tint: string, roughness: number): PBRMaterial {
        const material = this.pbr(name);
        applyTextureSet(material, this.scene, TEXTURE_SETS.concrete!, 1, 1);
        material.albedoColor = Color3.FromHexString(tint);
        material.roughness = roughness;
        material.metallic = 0.05;
        return material;
    }

    private metal(name: string, tint: string, roughness: number): PBRMaterial {
        const material = this.pbr(name);
        applyTextureSet(material, this.scene, TEXTURE_SETS.metal!, 1, 1);
        material.albedoColor = Color3.FromHexString(tint);
        material.roughness = roughness;
        material.metallic = 0.45;
        return material;
    }
}
