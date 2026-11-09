import {
    BackgroundMaterial,
    CascadedShadowGenerator,
    Color3,
    CreateBox,
    CreateCylinder,
    CreateGround,
    CreateLines,
    CreatePlane,
    CreateSphere,
    DirectionalLight,
    DynamicTexture,
    EquiRectangularCubeTexture,
    HemisphericLight,
    HDRCubeTexture,
    Mesh,
    PBRMaterial,
    Scene,
    ShadowGenerator,
    SpotLight,
    StandardMaterial,
    Texture,
    Vector3,
    VertexBuffer,
    VertexData,
} from "./babylon";
import photographicSkyUrl from "../assets/proving-sky.hdr?url";
import { createRoadMaterial } from "./RoadMaterial";
import { ProvingGround } from "./ProvingGround";
import type { RoadContactProvider } from "../simulation/road/RoadContactProvider";

function simToBabylon(x: number, y: number, z: number): Vector3 {
    return new Vector3(y, z, x);
}

export class EnvironmentBuilder {
    readonly sky: Mesh;
    readonly ground: Mesh;
    readonly sun: DirectionalLight;
    readonly shadows: ShadowGenerator;

    constructor(
        private readonly scene: Scene,
        private readonly road: RoadContactProvider,
    ) {
        this.sky = this.createSky();
        this.ground = this.createTerrain();
        this.sun = this.createLights();
        this.createEnvironmentTexture();
        this.shadows = CascadedShadowGenerator.IsSupported
            ? new CascadedShadowGenerator(2048, this.sun)
            : new ShadowGenerator(2048, this.sun);
        if (this.shadows instanceof CascadedShadowGenerator) {
            this.shadows.numCascades = 3;
            this.shadows.shadowMaxZ = 180;
            this.shadows.stabilizeCascades = true;
            this.shadows.cascadeBlendPercentage = 0.12;
            this.shadows.lambda = 0.75;
        }
        this.shadows.usePercentageCloserFiltering = true;
        this.shadows.filteringQuality = ShadowGenerator.QUALITY_HIGH;
        this.shadows.bias = 0.0004;
        this.shadows.normalBias = 0.025;
        this.shadows.blurKernel = 24;
        this.shadows.darkness = 0.25;
        this.createMarkings();
        this.createProps();
        this.createWetPad();
        this.createSignage();
        new ProvingGround(this.scene, this.shadows);
        this.loadPhotographicSky();
    }

    private loadPhotographicSky(): void {
        const environment = new HDRCubeTexture(
            photographicSkyUrl,
            this.scene,
            512,
            false,
            true,
            false,
            true,
            () => {
                if (this.scene.isDisposed) return;
                const previous = this.scene.environmentTexture;
                this.scene.environmentTexture = environment;
                this.scene.environmentIntensity = 0.7;
                previous?.dispose();
                const skyTexture = environment.clone();
                skyTexture.coordinatesMode = Texture.SKYBOX_MODE;
                const material = new BackgroundMaterial("photographic-sky-material", this.scene);
                material.reflectionTexture = skyTexture;
                material.backFaceCulling = false;
                material.disableDepthWrite = true;
                const sky = CreateBox("photographic-sky", { size: 16000 }, this.scene);
                sky.infiniteDistance = true;
                sky.isPickable = false;
                sky.applyFog = false;
                sky.material = material;
                this.sky.setEnabled(false);
            },
            () => {
                /* Keep the locally generated fallback if HDR decoding is unavailable. */
            },
        );
    }

    addShadowCaster(mesh: Mesh): void {
        this.shadows.addShadowCaster(mesh, true);
    }

    private createSky(): Mesh {
        const texture = new DynamicTexture(
            "sky-gradient",
            { width: 2048, height: 1024 },
            this.scene,
            false,
        );
        const context = texture.getContext();
        const gradient = context.createLinearGradient(0, 0, 0, 1024);
        gradient.addColorStop(0, "#2d5f89");
        gradient.addColorStop(0.42, "#7ba8c6");
        gradient.addColorStop(0.62, "#d3e1e6");
        gradient.addColorStop(0.72, "#b9c6c8");
        gradient.addColorStop(1, "#8e9491");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 2048, 1024);
        let seed = 918273;
        const random = (): number => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        for (let cloud = 0; cloud < 90; cloud += 1) {
            const cx = random() * 2048;
            const cy = 140 + random() * 340;
            const rx = 100 + random() * 260;
            const ry = 20 + random() * 48;
            context.save();
            context.translate(cx, cy);
            context.scale(1, ry / rx);
            const cloudGradient = context.createRadialGradient(0, 0, 0, 0, 0, rx);
            cloudGradient.addColorStop(0, `rgba(255,255,255,${0.16 + random() * 0.22})`);
            cloudGradient.addColorStop(0.55, "rgba(255,255,255,0.1)");
            cloudGradient.addColorStop(1, "rgba(255,255,255,0)");
            context.fillStyle = cloudGradient;
            context.beginPath();
            context.arc(0, 0, rx, 0, Math.PI * 2);
            context.fill();
            context.restore();
        }
        const sunGradient = context.createRadialGradient(1520, 240, 0, 1520, 240, 170);
        sunGradient.addColorStop(0, "rgba(255,244,214,0.95)");
        sunGradient.addColorStop(0.18, "rgba(255,236,186,0.55)");
        sunGradient.addColorStop(1, "rgba(255,235,190,0)");
        context.fillStyle = sunGradient;
        context.beginPath();
        context.arc(1520, 240, 170, 0, Math.PI * 2);
        context.fill();
        texture.update(false);

        const material = new StandardMaterial("sky-material", this.scene);
        material.backFaceCulling = false;
        material.disableLighting = true;
        material.disableDepthWrite = true;
        material.emissiveTexture = texture;
        material.diffuseColor = Color3.Black();
        material.specularColor = Color3.Black();

        const sky = CreateSphere(
            "sky",
            { diameter: 24000, segments: 32, sideOrientation: Mesh.BACKSIDE },
            this.scene,
        );
        sky.material = material;
        sky.infiniteDistance = true;
        sky.isPickable = false;
        sky.applyFog = false;
        return sky;
    }

    private createEnvironmentTexture(): void {
        const canvas = document.createElement("canvas");
        canvas.width = 2048;
        canvas.height = 1024;
        const context = canvas.getContext("2d");
        if (!context) return;
        const gradient = context.createLinearGradient(0, 0, 0, 1024);
        gradient.addColorStop(0, "#47789f");
        gradient.addColorStop(0.42, "#9fc2d4");
        gradient.addColorStop(0.55, "#e3eceb");
        gradient.addColorStop(0.58, "#c5c9c0");
        gradient.addColorStop(1, "#4b4d45");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 2048, 1024);
        const sun = context.createRadialGradient(1520, 240, 0, 1520, 240, 140);
        sun.addColorStop(0, "rgba(255,250,230,1)");
        sun.addColorStop(0.18, "rgba(255,242,201,0.9)");
        sun.addColorStop(1, "rgba(255,240,200,0)");
        context.fillStyle = sun;
        context.fillRect(0, 0, 2048, 1024);
        context.fillStyle = "rgba(255,255,255,0.22)";
        for (let index = 0; index < 34; index += 1) {
            const x = ((index * 311) % 2048) + 20;
            const y = 160 + ((index * 97) % 220);
            context.beginPath();
            context.ellipse(x, y, 90 + (index % 4) * 36, 16 + (index % 3) * 7, 0, 0, Math.PI * 2);
            context.fill();
        }
        try {
            const texture = new EquiRectangularCubeTexture(
                canvas.toDataURL("image/png"),
                this.scene,
                512,
                true,
                true,
            );
            texture.name = "procedural-environment";
            this.scene.environmentTexture = texture;
            this.scene.environmentIntensity = 0.85;
        } catch {
            // Direct sunlight and hemispheric light remain available if environment generation fails.
        }
    }

    private createTerrain(): Mesh {
        const size = 190;
        const subdivisions = 96;
        const ground = CreateGround(
            "training-ground",
            { width: size, height: size, subdivisions, updatable: true },
            this.scene,
        );
        const positions = ground.getVerticesData(VertexBuffer.PositionKind);
        const indices = ground.getIndices();
        if (!positions || !indices) throw new Error("Ground geometry could not be built.");
        for (let i = 0; i < positions.length; i += 3) {
            const babylonX = positions[i]!;
            const babylonZ = positions[i + 2]!;
            const simX = babylonZ;
            const simY = babylonX;
            positions[i + 1] = this.road.heightAt(simX, simY);
        }
        const normals = new Float32Array(positions.length);
        VertexData.ComputeNormals(positions, indices, normals);
        ground.setVerticesData(VertexBuffer.PositionKind, positions, true);
        ground.setVerticesData(VertexBuffer.NormalKind, normals, true);
        ground.refreshBoundingInfo();
        ground.receiveShadows = true;

        ground.material = createRoadMaterial(this.scene, "training-asphalt", size, size);
        return ground;
    }

    private createLights(): DirectionalLight {
        const ambient = new HemisphericLight("sky-light", new Vector3(0.2, 1, 0.1), this.scene);
        ambient.intensity = 0.4;
        ambient.diffuse = new Color3(0.82, 0.9, 1);
        ambient.groundColor = new Color3(0.2, 0.2, 0.18);

        const sun = new DirectionalLight("sun", new Vector3(-0.45, -0.85, 0.28), this.scene);
        sun.position = new Vector3(60, 95, -40);
        sun.intensity = 2.1;
        sun.diffuse = new Color3(1, 0.94, 0.84);
        sun.specular = new Color3(1, 0.97, 0.9);
        const fill = new DirectionalLight("rim-fill", new Vector3(0.24, -0.5, 0.84), this.scene);
        fill.intensity = 0.22;
        fill.diffuse = new Color3(1, 0.78, 0.6);
        fill.specular = new Color3(1, 0.82, 0.64);
        return sun;
    }

    private createMarkings(): void {
        const white = new Color3(0.88, 0.87, 0.8);
        const faded = new Color3(0.62, 0.62, 0.58);

        const addLine = (points: Array<[number, number]>, color = white, alpha = 0.9): void => {
            const vectors = points.map(([x, y]) =>
                simToBabylon(x, y, this.road.heightAt(x, y) + 0.025),
            );
            const line = CreateLines("marking", { points: vectors }, this.scene);
            line.color = color;
            line.alpha = alpha;
            line.isPickable = false;
        };

        for (let bay = 0; bay < 3; bay += 1) {
            const x0 = -11 + bay * 3.4;
            const x1 = x0 + 3.1;
            addLine([
                [x0, 27.6],
                [x1, 27.6],
                [x1, 32.4],
                [x0, 32.4],
                [x0, 27.6],
            ]);
            addLine(
                [
                    [x0 + 1.55, 32.1],
                    [x0 + 1.55, 33.7],
                ],
                faded,
                0.7,
            );
        }

        addLine([
            [-32, -12.2],
            [18, -12.2],
        ]);
        addLine([
            [-32, -3.8],
            [18, -3.8],
        ]);
        addLine([
            [-32, -8],
            [24, -8],
        ]);

        for (let x = -28; x < 16; x += 6) {
            addLine(
                [
                    [x, 0.1],
                    [x + 3, 0.1],
                ],
                faded,
                0.75,
            );
        }

        for (const [centerY, halfWidth] of [
            [-9.5, 5.6],
            [9.5, 5.6],
        ] as const) {
            for (const offset of [-halfWidth, halfWidth]) {
                const points: Array<[number, number]> = [];
                for (let x = 24; x <= 96; x += 2) points.push([x, centerY + offset]);
                addLine(points, white, 0.55);
            }
        }

        for (let x = 30; x < 70; x += 8) {
            addLine(
                [
                    [x, -9.5],
                    [x + 3.5, -9.5],
                ],
                faded,
                0.5,
            );
            addLine(
                [
                    [x, 9.5],
                    [x + 3.5, 9.5],
                ],
                faded,
                0.5,
            );
        }

        addLine(
            [
                [-30, 24.2],
                [18, 24.2],
                [18, 39.8],
                [-30, 39.8],
                [-30, 24.2],
            ],
            new Color3(0.42, 0.48, 0.55),
            0.8,
        );

        const skidPadCenter = [-4, 8] as const;
        for (const radius of [8, 10]) {
            const points: Array<[number, number]> = [];
            for (let index = 0; index <= 48; index += 1) {
                const angle = (index / 48) * Math.PI * 2;
                points.push([
                    skidPadCenter[0] + Math.cos(angle) * radius,
                    skidPadCenter[1] + Math.sin(angle) * radius,
                ]);
            }
            addLine(points, faded, 0.55);
        }

        for (let stripe = 0; stripe < 5; stripe += 1) {
            addLine(
                [
                    [13 + stripe * 0.8, -6.5],
                    [13 + stripe * 0.8, -2.5],
                ],
                white,
                0.8,
            );
        }
        addLine(
            [
                [12.5, -6.7],
                [17.7, -6.7],
            ],
            white,
            0.9,
        );
        addLine(
            [
                [12.5, -2.3],
                [17.7, -2.3],
            ],
            white,
            0.9,
        );
    }

    private createWetPad(): void {
        const wet = CreateGround("wet-pad", { width: 16, height: 48 }, this.scene);
        wet.position = simToBabylon(-6, 32, 0.012);
        const material = new PBRMaterial("wet-material", this.scene);
        material.albedoColor = new Color3(0.08, 0.1, 0.12);
        material.metallic = 0.25;
        material.roughness = 0.13;
        material.alpha = 0.58;
        wet.material = material;
        wet.isPickable = false;
        wet.receiveShadows = true;
    }

    private createProps(): void {
        const orange = new StandardMaterial("cone-orange", this.scene);
        orange.diffuseColor = new Color3(0.92, 0.36, 0.06);
        orange.specularColor = new Color3(0.15, 0.1, 0.05);
        const white = new StandardMaterial("cone-white", this.scene);
        white.diffuseColor = new Color3(0.92, 0.9, 0.84);

        const conePositions: Array<[number, number]> = [
            [-26, -14],
            [-26, -2],
            [18, -14],
            [18, 14],
            [-18, 18],
            [24, 20],
            [57, -18],
            [57, 18],
            [80, -18],
            [80, 18],
            [-24, 16],
            [-19, 16],
            [-14, 16],
            [-9, 16],
            [-4, 16],
            [1, 16],
            [6, 16],
        ];
        for (const [x, y] of conePositions) {
            const height = this.road.heightAt(x, y);
            const cone = CreateCylinder(
                "cone",
                { diameterTop: 0.05, diameterBottom: 0.42, height: 0.62, tessellation: 14 },
                this.scene,
            );
            cone.position = simToBabylon(x, y, height + 0.31);
            cone.material = orange;
            cone.isPickable = false;
            this.shadows.addShadowCaster(cone, true);
            const stripe = CreateCylinder(
                "cone-stripe",
                { diameterTop: 0.18, diameterBottom: 0.28, height: 0.12, tessellation: 14 },
                this.scene,
            );
            stripe.position = simToBabylon(x, y, height + 0.36);
            stripe.material = white;
            const base = CreateBox(
                "cone-base",
                { width: 0.46, height: 0.035, depth: 0.46 },
                this.scene,
            );
            base.position = simToBabylon(x, y, height + 0.02);
            base.material = orange;
        }

        const barrierMaterial = new StandardMaterial("barrier", this.scene);
        barrierMaterial.diffuseColor = new Color3(0.72, 0.17, 0.14);
        const barrierPostMaterial = new StandardMaterial("barrier-post-material", this.scene);
        barrierPostMaterial.diffuseColor = new Color3(0.25, 0.27, 0.28);
        for (let x = 26; x <= 94; x += 5.5) {
            for (const y of [-16.4, 16.4]) {
                const height = this.road.heightAt(x, y);
                const post = CreateBox(
                    "barrier-post",
                    { width: 0.12, height: 0.8, depth: 0.12 },
                    this.scene,
                );
                post.position = simToBabylon(x, y, height + 0.4);
                post.material = barrierPostMaterial;
                const rail = CreateBox(
                    "barrier-rail",
                    { width: 0.08, height: 0.16, depth: 5.2 },
                    this.scene,
                );
                rail.position = simToBabylon(x + 2.5, y, height + 0.66);
                rail.material = barrierMaterial;
            }
        }

        const buildingMaterial = new StandardMaterial("building", this.scene);
        buildingMaterial.diffuseColor = new Color3(0.8, 0.8, 0.8);
        buildingMaterial.diffuseTexture = this.createBuildingTexture();
        buildingMaterial.specularColor = new Color3(0.08, 0.08, 0.08);
        const roofMaterial = new StandardMaterial("roof", this.scene);
        roofMaterial.diffuseColor = new Color3(0.2, 0.22, 0.24);
        const buildingPositions: Array<[number, number, number, number, number]> = [
            [-60, 70, 16, 9, 12],
            [-30, 78, 22, 12, 10],
            [10, 78, 18, 7, 16],
            [60, 60, 24, 14, 14],
            [-80, 20, 14, 22, 12],
        ];
        for (const [x, y, width, height, depth] of buildingPositions) {
            const building = CreateBox("building", { width, height, depth }, this.scene);
            building.position = simToBabylon(x, y, height / 2);
            building.material = buildingMaterial;
            const roof = CreateBox(
                "building-roof",
                { width: width + 0.6, height: 0.4, depth: depth + 0.6 },
                this.scene,
            );
            roof.position = simToBabylon(x, y, height + 0.2);
            roof.material = roofMaterial;
            const roofUnit = CreateBox(
                "roof-unit",
                { width: width * 0.3, height: 1.2, depth: depth * 0.25 },
                this.scene,
            );
            roofUnit.position = simToBabylon(x + width * 0.15, y - depth * 0.1, height + 1);
            roofUnit.material = roofMaterial;
            const entrance = CreateBox(
                "building-entrance",
                { width: width * 0.32, height: 2.2, depth: 0.08 },
                this.scene,
            );
            entrance.position = simToBabylon(x, y - depth / 2 - 0.04, 1.1);
            const entranceMaterial = new StandardMaterial("entrance-glass", this.scene);
            entranceMaterial.diffuseColor = new Color3(0.08, 0.12, 0.15);
            entranceMaterial.specularColor = new Color3(0.5, 0.55, 0.6);
            entrance.material = entranceMaterial;
        }

        const lampMaterial = new StandardMaterial("lamp", this.scene);
        lampMaterial.diffuseColor = new Color3(0.2, 0.2, 0.2);
        const lampGlow = new StandardMaterial("lamp-glow", this.scene);
        lampGlow.emissiveColor = new Color3(1, 0.86, 0.62);
        for (const [x, y] of [
            [-20, 20],
            [20, 20],
            [-20, -20],
            [20, -20],
            [50, 0],
        ] as Array<[number, number]>) {
            const pole = CreateCylinder(
                "lamp-pole",
                { diameter: 0.12, height: 5, tessellation: 8 },
                this.scene,
            );
            pole.position = simToBabylon(x, y, 2.5);
            pole.material = lampMaterial;
            const head = CreateBox(
                "lamp-head",
                { width: 0.5, height: 0.16, depth: 0.24 },
                this.scene,
            );
            head.position = simToBabylon(x, y, 5);
            head.material = lampGlow;
        }
    }

    private createBuildingTexture(): DynamicTexture {
        const size = 512;
        const texture = new DynamicTexture(
            "building-facade",
            { width: size, height: size },
            this.scene,
            true,
        );
        const context = texture.getContext();
        context.fillStyle = "#a7a397";
        context.fillRect(0, 0, size, size);
        context.fillStyle = "rgba(255,255,255,0.08)";
        for (let row = 0; row < 8; row += 1) {
            context.fillRect(0, row * 64 + 56, size, 3);
        }
        for (let row = 0; row < 7; row += 1) {
            for (let col = 0; col < 8; col += 1) {
                const x = 20 + col * 62;
                const y = 22 + row * 64;
                context.fillStyle = "rgba(30,42,50,0.92)";
                context.fillRect(x, y, 38, 28);
                context.fillStyle = "rgba(150,185,205,0.16)";
                context.fillRect(x + 3, y + 3, 13, 22);
                if ((row + col) % 3 === 0) {
                    context.fillStyle = "rgba(255,224,165,0.35)";
                    context.fillRect(x + 5, y + 5, 28, 18);
                }
            }
        }
        texture.wrapU = Texture.WRAP_ADDRESSMODE;
        texture.wrapV = Texture.WRAP_ADDRESSMODE;
        texture.uScale = 2;
        texture.vScale = 1.6;
        texture.update(false);
        return texture;
    }

    private createSignage(): void {
        const board = (
            name: string,
            title: string,
            subtitle: string,
            x: number,
            y: number,
            z: number,
            width: number,
            height: number,
        ): void => {
            const texture = new DynamicTexture(
                `${name}-texture`,
                { width: 1024, height: 320 },
                this.scene,
                true,
            );
            const context = texture.getContext();
            context.fillStyle = "#10161b";
            context.fillRect(0, 0, 1024, 320);
            context.fillStyle = "#e8b04b";
            context.fillRect(0, 0, 18, 320);
            context.fillStyle = "#ede8dc";
            context.font = "700 96px Bahnschrift, Arial, sans-serif";
            context.fillText(title, 52, 152);
            context.fillStyle = "rgba(232,176,75,0.85)";
            context.font = "600 42px Consolas, monospace";
            context.fillText(subtitle, 54, 236);
            texture.update();
            const material = new StandardMaterial(`${name}-material`, this.scene);
            material.emissiveTexture = texture;
            material.diffuseTexture = texture;
            material.emissiveColor = new Color3(0.22, 0.22, 0.22);
            material.specularColor = Color3.Black();
            material.backFaceCulling = true;
            for (const facing of [0, Math.PI]) {
                const plane = CreatePlane(`${name}-${facing}`, { width, height }, this.scene);
                plane.position = simToBabylon(x, y, z);
                plane.rotation.y = facing;
                plane.material = material;
            }
            const postMaterial = new StandardMaterial(`${name}-post`, this.scene);
            postMaterial.diffuseColor = new Color3(0.25, 0.27, 0.28);
            const postHeight = z;
            for (const offset of [-width / 2 + 0.2, width / 2 - 0.2]) {
                const post = CreateCylinder(
                    `${name}-post-mesh`,
                    { diameter: 0.12, height: postHeight, tessellation: 8 },
                    this.scene,
                );
                post.position = simToBabylon(x, y + offset, postHeight / 2);
                post.material = postMaterial;
            }
        };

        board("main-sign", "BITE POINT", "MANUAL DRIVING PAD", 2, -20, 3.4, 5.2, 1.55);
        board("hill-sign-gentle", "9% GRADE", "HILL START", 22, -16.5, 2.4, 3.2, 1);
        board("hill-sign-steep", "16% GRADE", "CLUTCH CONTROL", 22, 16.5, 2.4, 3.2, 1);
        board("park-sign", "PARKING", "REVERSE BAY", -14, 23.4, 2.2, 3.2, 1);
    }

    addHeadlightSpotlights(headlights: Array<SpotLight>): void {
        for (const light of headlights) {
            light.intensity = 0;
            light.range = 45;
            light.angle = Math.PI / 7;
            light.exponent = 3;
        }
    }
}
