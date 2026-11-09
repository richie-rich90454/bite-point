// KTX2 container and transcoder references: [R20]; local decoder vendored from [R25].
import "@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader";
import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2";
import { PBRMaterial, Scene, Texture } from "../babylon";
import decoderModuleUrl from "../../assets/ktx2/babylon.ktx2Decoder.js?url";
import mscTranscoderJsUrl from "../../assets/ktx2/msc_basis_transcoder.js?url";
import mscTranscoderWasmUrl from "../../assets/ktx2/msc_basis_transcoder.wasm?url";
import asphaltArmJpg from "../../assets/textures/asphalt/asphalt-arm.jpg?url";
import asphaltArmKtx from "../../assets/textures/asphalt/asphalt-arm.ktx2?url";
import asphaltColorJpg from "../../assets/textures/asphalt/asphalt-color.jpg?url";
import asphaltColorKtx from "../../assets/textures/asphalt/asphalt-color.ktx2?url";
import asphaltNormalJpg from "../../assets/textures/asphalt/asphalt-normal.jpg?url";
import asphaltNormalKtx from "../../assets/textures/asphalt/asphalt-normal.ktx2?url";
import concreteArmJpg from "../../assets/textures/concrete/concrete-arm.jpg?url";
import concreteArmKtx from "../../assets/textures/concrete/concrete-arm.ktx2?url";
import concreteColorJpg from "../../assets/textures/concrete/concrete-color.jpg?url";
import concreteColorKtx from "../../assets/textures/concrete/concrete-color.ktx2?url";
import concreteNormalJpg from "../../assets/textures/concrete/concrete-normal.jpg?url";
import concreteNormalKtx from "../../assets/textures/concrete/concrete-normal.ktx2?url";
import grassArmJpg from "../../assets/textures/grass/grass-arm.jpg?url";
import grassArmKtx from "../../assets/textures/grass/grass-arm.ktx2?url";
import grassColorJpg from "../../assets/textures/grass/grass-color.jpg?url";
import grassColorKtx from "../../assets/textures/grass/grass-color.ktx2?url";
import grassNormalJpg from "../../assets/textures/grass/grass-normal.jpg?url";
import grassNormalKtx from "../../assets/textures/grass/grass-normal.ktx2?url";
import gravelArmJpg from "../../assets/textures/gravel/gravel-arm.jpg?url";
import gravelArmKtx from "../../assets/textures/gravel/gravel-arm.ktx2?url";
import gravelColorJpg from "../../assets/textures/gravel/gravel-color.jpg?url";
import gravelColorKtx from "../../assets/textures/gravel/gravel-color.ktx2?url";
import gravelNormalJpg from "../../assets/textures/gravel/gravel-normal.jpg?url";
import gravelNormalKtx from "../../assets/textures/gravel/gravel-normal.ktx2?url";
import metalArmJpg from "../../assets/textures/metal/metal-arm.jpg?url";
import metalArmKtx from "../../assets/textures/metal/metal-arm.ktx2?url";
import metalColorJpg from "../../assets/textures/metal/metal-color.jpg?url";
import metalColorKtx from "../../assets/textures/metal/metal-color.ktx2?url";
import metalNormalJpg from "../../assets/textures/metal/metal-normal.jpg?url";
import metalNormalKtx from "../../assets/textures/metal/metal-normal.ktx2?url";
import rockArmJpg from "../../assets/textures/rock/rock-arm.jpg?url";
import rockArmKtx from "../../assets/textures/rock/rock-arm.ktx2?url";
import rockColorJpg from "../../assets/textures/rock/rock-color.jpg?url";
import rockColorKtx from "../../assets/textures/rock/rock-color.ktx2?url";
import rockNormalJpg from "../../assets/textures/rock/rock-normal.jpg?url";
import rockNormalKtx from "../../assets/textures/rock/rock-normal.ktx2?url";

KhronosTextureContainer2.URLConfig.jsDecoderModule = decoderModuleUrl;
KhronosTextureContainer2.URLConfig.jsMSCTranscoder = mscTranscoderJsUrl;
KhronosTextureContainer2.URLConfig.wasmMSCTranscoder = mscTranscoderWasmUrl;

export interface TextureSet {
    colorKtx: string;
    colorJpg: string;
    normalKtx: string;
    normalJpg: string;
    armKtx: string;
    armJpg: string;
}

export const TEXTURE_SETS: Record<string, TextureSet> = {
    asphalt: {
        colorKtx: asphaltColorKtx,
        colorJpg: asphaltColorJpg,
        normalKtx: asphaltNormalKtx,
        normalJpg: asphaltNormalJpg,
        armKtx: asphaltArmKtx,
        armJpg: asphaltArmJpg,
    },
    grass: {
        colorKtx: grassColorKtx,
        colorJpg: grassColorJpg,
        normalKtx: grassNormalKtx,
        normalJpg: grassNormalJpg,
        armKtx: grassArmKtx,
        armJpg: grassArmJpg,
    },
    gravel: {
        colorKtx: gravelColorKtx,
        colorJpg: gravelColorJpg,
        normalKtx: gravelNormalKtx,
        normalJpg: gravelNormalJpg,
        armKtx: gravelArmKtx,
        armJpg: gravelArmJpg,
    },
    rock: {
        colorKtx: rockColorKtx,
        colorJpg: rockColorJpg,
        normalKtx: rockNormalKtx,
        normalJpg: rockNormalJpg,
        armKtx: rockArmKtx,
        armJpg: rockArmJpg,
    },
    concrete: {
        colorKtx: concreteColorKtx,
        colorJpg: concreteColorJpg,
        normalKtx: concreteNormalKtx,
        normalJpg: concreteNormalJpg,
        armKtx: concreteArmKtx,
        armJpg: concreteArmJpg,
    },
    metal: {
        colorKtx: metalColorKtx,
        colorJpg: metalColorJpg,
        normalKtx: metalNormalKtx,
        normalJpg: metalNormalJpg,
        armKtx: metalArmKtx,
        armJpg: metalArmJpg,
    },
};

export function applyTextureSet(
    material: PBRMaterial,
    scene: Scene,
    set: TextureSet,
    uScale = 1,
    vScale = 1,
): void {
    const configure = (texture: Texture, linear: boolean): void => {
        texture.uScale = uScale;
        texture.vScale = vScale;
        texture.wrapU = Texture.WRAP_ADDRESSMODE;
        texture.wrapV = Texture.WRAP_ADDRESSMODE;
        texture.anisotropicFilteringLevel = 8;
        texture.gammaSpace = !linear;
    };
    const load = (
        ktx: string,
        jpg: string,
        linear: boolean,
        assign: (texture: Texture) => void,
    ): void => {
        const fallback = new Texture(jpg, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
        configure(fallback, linear);
        assign(fallback);
        let upgraded: Texture | null = null;
        upgraded = new Texture(
            ktx,
            scene,
            false,
            false,
            Texture.TRILINEAR_SAMPLINGMODE,
            () => {
                if (!upgraded) return;
                configure(upgraded, linear);
                assign(upgraded);
                fallback.dispose();
            },
            () => {
                upgraded?.dispose();
                upgraded = null;
            },
        );
    };

    load(set.colorKtx, set.colorJpg, false, (texture) => {
        material.albedoTexture = texture;
    });
    load(set.normalKtx, set.normalJpg, true, (texture) => {
        material.bumpTexture = texture;
        texture.level = 0.7;
    });
    load(set.armKtx, set.armJpg, true, (texture) => {
        material.metallicTexture = texture;
    });
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = true;
    material.useAmbientOcclusionFromMetallicTextureRed = true;
    material.metallic = 0.05;
    material.roughness = 0.92;
}
