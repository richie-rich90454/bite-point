import colorUrl from "../assets/asphalt-color.jpg?url";
import normalUrl from "../assets/asphalt-normal.jpg?url";
import armUrl from "../assets/asphalt-arm.jpg?url";
import { Color3, PBRMaterial, Scene, Texture } from "./babylon";

/** CC0 3 m asphalt scan. Keep texture dimensions in world metres. */
export function createRoadMaterial(scene: Scene, name: string, widthM: number, lengthM: number): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  const map = (url: string, linear = false): Texture => {
    const texture = new Texture(url, scene);
    texture.uScale = widthM / 3;
    texture.vScale = lengthM / 3;
    texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 16;
    texture.gammaSpace = !linear;
    return texture;
  };
  material.albedoTexture = map(colorUrl);
  material.albedoColor = new Color3(0.72, 0.75, 0.78);
  material.bumpTexture = map(normalUrl, true);
  material.bumpTexture.level = 0.45;
  material.metallicTexture = map(armUrl, true);
  material.useRoughnessFromMetallicTextureAlpha = false;
  material.useRoughnessFromMetallicTextureGreen = true;
  material.useMetallnessFromMetallicTextureBlue = true;
  material.useAmbientOcclusionFromMetallicTextureRed = true;
  material.metallic = 0;
  material.roughness = 1;
  return material;
}
