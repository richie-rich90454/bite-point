import { Color3, PBRMaterial, Scene } from "./babylon";
import { applyTextureSet, TEXTURE_SETS } from "./world/TextureSets";

/** CC0 3 m asphalt scan. Keep texture dimensions in world metres. */
export function createRoadMaterial(
    scene: Scene,
    name: string,
    widthM: number,
    lengthM: number,
): PBRMaterial {
    const material = new PBRMaterial(name, scene);
    applyTextureSet(material, scene, TEXTURE_SETS.asphalt!, widthM / 3, lengthM / 3);
    material.albedoColor = new Color3(0.72, 0.75, 0.78);
    return material;
}
