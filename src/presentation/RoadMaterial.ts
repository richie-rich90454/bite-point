import { Color3, DynamicTexture, PBRMaterial, Scene, Texture } from "./babylon";
import { applyTextureSet, TEXTURE_SETS } from "./world/TextureSets";

/** World size of one asphalt scan tile. Larger tiles hide the repeat at speed. */
const ROAD_TILE_M = 10;
const WEAR_TILE_M = 13;

function createWearTexture(scene: Scene, name: string): DynamicTexture {
    const size = 512;
    const texture = new DynamicTexture(name, { width: size, height: size }, scene, true);
    const context = texture.getContext() as unknown as CanvasRenderingContext2D;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);

    let seed = 90210;
    const random = (): number => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const wrapped = (draw: (x: number, y: number) => void): void => {
        for (const dx of [-size, 0, size]) {
            for (const dy of [-size, 0, size]) draw(dx, dy);
        }
    };

    for (let patch = 0; patch < 9; patch += 1) {
        const x = random() * size;
        const y = random() * size;
        const radius = 34 + random() * 92;
        wrapped((dx, dy) => {
            const gradient = context.createRadialGradient(
                x + dx,
                y + dy,
                0,
                x + dx,
                y + dy,
                radius,
            );
            gradient.addColorStop(0, `rgba(0,0,0,${0.14 + random() * 0.18})`);
            gradient.addColorStop(0.6, "rgba(0,0,0,0.07)");
            gradient.addColorStop(1, "rgba(0,0,0,0)");
            context.fillStyle = gradient;
            context.beginPath();
            context.arc(x + dx, y + dy, radius, 0, Math.PI * 2);
            context.fill();
        });
    }

    for (let crack = 0; crack < 16; crack += 1) {
        const points: Array<[number, number]> = [];
        let x = random() * size;
        let y = random() * size;
        points.push([x, y]);
        const steps = 3 + Math.floor(random() * 5);
        for (let step = 0; step < steps; step += 1) {
            x += (random() - 0.5) * 42;
            y += (random() - 0.5) * 42;
            points.push([x, y]);
        }
        wrapped((dx, dy) => {
            context.strokeStyle = `rgba(0,0,0,${0.2 + random() * 0.2})`;
            context.lineWidth = 0.7 + random() * 1.5;
            context.beginPath();
            context.moveTo(points[0]![0] + dx, points[0]![1] + dy);
            for (let index = 1; index < points.length; index += 1) {
                context.lineTo(points[index]![0] + dx, points[index]![1] + dy);
            }
            context.stroke();
        });
    }

    for (let stone = 0; stone < 5200; stone += 1) {
        const x = random() * size;
        const y = random() * size;
        const shade = 190 + Math.floor(random() * 65);
        context.fillStyle = `rgba(${shade},${shade},${shade},${0.08 + random() * 0.16})`;
        context.fillRect(x, y, 1 + random() * 2, 1 + random() * 2);
    }

    // Detail map channels: R/G normal, B albedo, A roughness.
    const pixels = context.getImageData(0, 0, size, size);
    for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = 128;
        pixels.data[index + 1] = 128;
    }
    context.putImageData(pixels, 0, 0);
    texture.update(false);
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 8;
    texture.gammaSpace = false;
    return texture;
}

export function createRoadMaterial(
    scene: Scene,
    name: string,
    widthM: number,
    lengthM: number,
): PBRMaterial {
    const material = new PBRMaterial(name, scene);
    const uScale = widthM / ROAD_TILE_M;
    const vScale = lengthM / ROAD_TILE_M;
    applyTextureSet(material, scene, TEXTURE_SETS.asphalt!, uScale, vScale, {
        anisotropy: 16,
        bumpLevel: 1.25,
    });
    material.albedoColor = new Color3(0.78, 0.8, 0.82);
    material.metallic = 0.03;
    material.roughness = 0.95;

    const wear = createWearTexture(scene, `${name}-wear`);
    wear.uScale = widthM / WEAR_TILE_M;
    wear.vScale = lengthM / WEAR_TILE_M;
    wear.uOffset = 0.21;
    wear.vOffset = 0.37;
    material.detailMap.texture = wear;
    material.detailMap.diffuseBlendLevel = 0.62;
    material.detailMap.roughnessBlendLevel = 0.9;
    material.detailMap.bumpLevel = 0;
    material.detailMap.isEnabled = true;
    return material;
}

export function createShoulderMaterial(
    scene: Scene,
    name: string,
    widthM: number,
    lengthM: number,
): PBRMaterial {
    const material = new PBRMaterial(name, scene);
    applyTextureSet(material, scene, TEXTURE_SETS.gravel!, widthM / 4, lengthM / 4, {
        anisotropy: 8,
        bumpLevel: 0.9,
    });
    material.albedoColor = new Color3(0.86, 0.83, 0.75);
    material.metallic = 0;
    material.roughness = 0.98;
    return material;
}
