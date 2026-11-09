import hatchbackUrl from "../assets/hatchback.glb?url";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import {
    AbstractMesh,
    Color3,
    Color4,
    CreateBox,
    CreateCylinder,
    CreatePlane,
    CreateRibbon,
    CreateSphere,
    CreateTorus,
    DefaultRenderingPipeline,
    DynamicTexture,
    Engine,
    ImportMeshAsync,
    MotionBlurPostProcess,
    Mesh,
    PBRMaterial,
    PointLight,
    Quaternion,
    Scene,
    SpotLight,
    StandardMaterial,
    Texture,
    TransformNode,
    Vector3,
    VertexData,
} from "./babylon";
import type { VehicleConfig } from "../simulation/config/VehicleConfig";
import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";
import type { RoadContactProvider } from "../simulation/road/RoadContactProvider";
import type { WorldGenerator } from "../simulation/world/WorldGenerator";
import type { UserSettings } from "../settings/SettingsRepository";
import { CockpitController, type CameraMode } from "./CockpitController";
import { EnvironmentBuilder } from "./EnvironmentBuilder";
import { WorldStreamer } from "./WorldStreamer";

interface WheelVisual {
    root: TransformNode;
    spin: TransformNode;
    angle: number;
}

export class VehicleRenderer {
    readonly engine: Engine;
    readonly scene: Scene;
    readonly environment: EnvironmentBuilder;
    readonly cockpit: CockpitController;
    readonly worldStreamer: WorldStreamer | null;
    private worldMode: "legacy" | "endless" = "legacy";
    private drawDistanceM = 1400;
    private readonly speedoMaxKph: number;
    private adaptiveLevel = 0;
    private lastSettings: UserSettings;
    private pipeline: DefaultRenderingPipeline | null = null;
    private motionBlur: MotionBlurPostProcess | null = null;
    private readonly carRoot: TransformNode;
    private readonly exteriorCabin: TransformNode;
    private readonly cockpitGroup: TransformNode;
    private readonly exteriorMeshes: AbstractMesh[] = [];
    private readonly wheels: WheelVisual[] = [];
    private importedCar: TransformNode | null = null;
    private importedWheels: Array<{
        spin: TransformNode;
        steer: TransformNode | null;
        angle: number;
    } | null> = [];
    private usingImportedCar = false;
    private carAssetPending = true;
    private cockpitLight: PointLight | null = null;
    private steeringSpinNode: TransformNode | null = null;
    private tachNeedleNode: TransformNode | null = null;
    private speedNeedleNode: TransformNode | null = null;
    private readonly leverArm: Mesh;
    private readonly leverKnob: Mesh;
    private readonly leverBase = new Vector3(0.03, 0.48, -0.08);
    private readonly pedalMeshes: { mesh: Mesh; baseY: number; baseRotation: number }[] = [];
    private readonly headlightSpots: SpotLight[] = [];
    private readonly headlightMaterial: StandardMaterial;
    private readonly brakeLightMaterial: StandardMaterial;
    private readonly reverseLightMaterial: StandardMaterial;
    private readonly wiperPivot: TransformNode;
    private readonly paintMaterial: PBRMaterial;
    private readonly glassMaterial: PBRMaterial;
    private wiperTime = 0;
    private headlightsOn = false;
    private wipersMode = 0;
    private disposed = false;
    private readonly resizeHandler: () => void;
    private lastCameraMode: CameraMode = "cockpit";

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly config: VehicleConfig,
        road: RoadContactProvider,
        settings: UserSettings,
        world?: WorldGenerator,
    ) {
        this.lastSettings = settings;
        const topGear = config.gearRatios[config.gearRatios.length - 1] ?? 1;
        const wheelCircumference = 2 * Math.PI * config.wheelRadiusM;
        const redlineSpeedKph =
            (config.engine.redlineRpm / 60) *
            (wheelCircumference / (topGear * config.finalDriveRatio)) *
            3.6;
        this.speedoMaxKph = Math.max(
            500,
            Math.min(600, Math.ceil((redlineSpeedKph * 1.15) / 20) * 20),
        );
        this.engine = new Engine(
            canvas,
            true,
            { preserveDrawingBuffer: false, stencil: true, adaptToDeviceRatio: true },
            true,
        );
        this.scene = new Scene(this.engine);
        this.scene.clearColor = Color4.FromHexString("#a9c0d2ff");
        this.scene.ambientColor = new Color3(0.3, 0.32, 0.35);
        this.scene.fogMode = Scene.FOGMODE_EXP2;
        this.scene.fogDensity = 0.00085;
        this.scene.fogColor = new Color3(0.72, 0.8, 0.86);
        this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
        this.scene.imageProcessingConfiguration.toneMappingType = 1;
        this.scene.imageProcessingConfiguration.exposure = 0.84;
        this.scene.imageProcessingConfiguration.contrast = 1.14;

        this.environment = new EnvironmentBuilder(this.scene, road);
        this.worldStreamer = world
            ? new WorldStreamer(this.scene, world, this.environment.shadows)
            : null;
        this.setWorldMode("legacy");
        this.carRoot = new TransformNode("car-root", this.scene);
        this.exteriorCabin = new TransformNode("exterior-cabin", this.scene);
        this.exteriorCabin.parent = this.carRoot;
        this.cockpitGroup = new TransformNode("cockpit-interior", this.scene);
        this.cockpitGroup.parent = this.carRoot;

        this.paintMaterial = this.createPaintMaterial();
        this.glassMaterial = this.createGlassMaterial();
        this.headlightMaterial = new StandardMaterial("headlight-emissive", this.scene);
        this.headlightMaterial.emissiveColor = new Color3(1, 0.9, 0.72);
        this.headlightMaterial.diffuseColor = new Color3(0.1, 0.1, 0.1);
        this.brakeLightMaterial = new StandardMaterial("brake-emissive", this.scene);
        this.brakeLightMaterial.emissiveColor = new Color3(0.5, 0.02, 0.02);
        this.brakeLightMaterial.diffuseColor = new Color3(0.15, 0.01, 0.01);
        this.reverseLightMaterial = new StandardMaterial("reverse-emissive", this.scene);
        this.reverseLightMaterial.emissiveColor = new Color3(0.6, 0.6, 0.55);
        this.reverseLightMaterial.diffuseColor = new Color3(0.1, 0.1, 0.1);

        this.buildCar();
        this.loadDetailedCar();
        const cockpitMeshes = new Set(this.cockpitGroup.getChildMeshes());
        for (const mesh of this.carRoot.getChildMeshes()) {
            if (!cockpitMeshes.has(mesh)) this.exteriorMeshes.push(mesh);
        }
        this.leverArm = this.scene.getMeshByName("gear-lever-arm") as Mesh;
        this.leverKnob = this.scene.getMeshByName("gear-knob") as Mesh;
        this.wiperPivot = this.carRoot
            .getChildTransformNodes()
            .find((node) => node.name === "wiper-pivot") as TransformNode;

        this.cockpit = new CockpitController(this.scene, this.carRoot, this.config);
        this.pipeline = new DefaultRenderingPipeline("post-pipeline", true, this.scene, [
            this.cockpit.camera,
        ]);
        this.pipeline.fxaaEnabled = true;
        this.pipeline.bloomEnabled = true;
        this.pipeline.bloomThreshold = 0.92;
        this.pipeline.bloomWeight = 0.12;
        this.pipeline.bloomKernel = 32;
        this.pipeline.sharpenEnabled = false;
        this.pipeline.chromaticAberrationEnabled = true;
        this.pipeline.chromaticAberration.aberrationAmount = 6;
        this.pipeline.grainEnabled = true;
        this.pipeline.grain.intensity = 2.4;
        this.applySettings(settings);
        this.setCameraMode("cockpit");
        this.resizeHandler = () => this.engine.resize();
        window.addEventListener("resize", this.resizeHandler);
    }

    get cameraMode(): CameraMode {
        return this.lastCameraMode;
    }

    get cameraModeLabel(): string {
        return this.lastCameraMode === "cockpit"
            ? "Cockpit"
            : this.lastCameraMode === "hood"
              ? "Hood"
              : "Exterior";
    }

    applySettings(settings: UserSettings): void {
        this.lastSettings = settings;
        const adaptiveScale = this.adaptiveLevel === 0 ? 1 : this.adaptiveLevel === 1 ? 0.82 : 0.65;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        this.engine.setHardwareScalingLevel(
            1 / (pixelRatio * settings.renderScale * adaptiveScale),
        );
        this.scene.shadowsEnabled = settings.shadows && this.adaptiveLevel < 2;
        if (this.pipeline) {
            this.pipeline.bloomEnabled =
                settings.bloom && settings.quality !== "low" && this.adaptiveLevel < 2;
            this.pipeline.fxaaEnabled = true;
            this.pipeline.samples = settings.quality === "high" && this.adaptiveLevel === 0 ? 4 : 1;
            this.pipeline.chromaticAberrationEnabled =
                settings.quality === "high" && this.adaptiveLevel === 0;
            this.pipeline.grainEnabled = settings.quality !== "low";
        }
        this.applyMotionBlur(
            settings.motionBlur && settings.quality !== "low" && this.adaptiveLevel < 2,
        );
        const anisotropy =
            settings.textureQuality === "low" ? 2 : settings.textureQuality === "medium" ? 4 : 8;
        for (const texture of this.scene.textures) {
            texture.anisotropicFilteringLevel = anisotropy;
        }
        this.cockpit.setFov(settings.fovDegrees);
        this.cockpit.setShake(settings.cameraShake);
    }

    private applyMotionBlur(enabled: boolean): void {
        if (enabled && !this.motionBlur) {
            this.motionBlur = new MotionBlurPostProcess(
                "speed-motion-blur",
                this.scene,
                1,
                this.cockpit.camera,
            );
            this.motionBlur.motionStrength = 0.35;
            this.motionBlur.motionBlurSamples = 12;
        } else if (!enabled && this.motionBlur) {
            this.motionBlur.dispose();
            this.motionBlur = null;
        }
    }

    setAdaptiveLevel(level: number): void {
        const clamped = Math.max(0, Math.min(2, level));
        if (clamped === this.adaptiveLevel) return;
        this.adaptiveLevel = clamped;
        this.applySettings(this.lastSettings);
    }

    get adaptiveQualityLevel(): number {
        return this.adaptiveLevel;
    }

    get activeWorldMode(): "legacy" | "endless" {
        return this.worldMode;
    }

    get worldDiagnostics(): {
        material: string | null;
        albedo: string | null;
        albedoReady: boolean;
        textures: number;
        chunks: number;
        roadMaterial: string | null;
        terrainMaterial: string | null;
        roadVertices: number;
        terrainVertices: number;
    } {
        const material = this.scene.getMaterialByName("endless-asphalt") as PBRMaterial | null;
        const albedo = material?.albedoTexture ?? null;
        const road = this.scene.getMeshByName("endless-road");
        const terrain = this.scene.getMeshByName("endless-terrain");
        return {
            material: material?.name ?? null,
            albedo: albedo?.name ?? null,
            albedoReady: albedo?.isReady() ?? false,
            textures: this.scene.textures.length,
            chunks: this.worldStreamer?.activeChunks ?? 0,
            roadMaterial: road?.material?.name ?? null,
            terrainMaterial: terrain?.material?.name ?? null,
            roadVertices: road?.getTotalVertices() ?? 0,
            terrainVertices: terrain?.getTotalVertices() ?? 0,
        };
    }

    setWorldMode(mode: "legacy" | "endless"): void {
        this.worldMode = mode;
        this.environment.setLegacyMode(mode === "legacy");
        this.worldStreamer?.setEnabled(mode === "endless");
    }

    setDrawDistance(distanceM: number): void {
        this.drawDistanceM = Math.max(500, Math.min(3000, distanceM));
    }

    setWorld(world: WorldGenerator | null): void {
        this.worldStreamer?.setWorld(world);
    }

    cycleCamera(): CameraMode {
        const mode = this.cockpit.cycle();
        this.setCameraMode(mode);
        return mode;
    }

    showcaseCamera(): CameraMode {
        this.cockpit.setMode("exterior");
        this.setCameraMode("exterior");
        return "exterior";
    }

    focusCockpit(): CameraMode {
        this.cockpit.setMode("cockpit");
        this.setCameraMode("cockpit");
        return "cockpit";
    }

    recenterView(): void {
        this.cockpit.recenter();
    }

    addLook(deltaYaw: number, deltaPitch: number): void {
        this.cockpit.addLook(deltaYaw, deltaPitch);
    }

    setHeadlights(on: boolean): void {
        this.headlightsOn = on;
    }

    get headlights(): boolean {
        return this.headlightsOn;
    }

    setWipers(mode: number): void {
        this.wipersMode = ((mode % 3) + 3) % 3;
    }

    get wipers(): number {
        return this.wipersMode;
    }

    sync(state: VehicleRenderState, dt: number): void {
        const pose = state.pose;
        this.carRoot.position.set(pose.y, pose.z + 0.015, pose.x);
        this.carRoot.rotationQuaternion = Quaternion.RotationYawPitchRoll(
            pose.heading,
            -pose.pitch,
            -pose.roll,
        );
        this.carRoot.computeWorldMatrix(true);
        this.worldStreamer?.update(
            { x: pose.x, y: pose.y },
            state.speedMps,
            this.worldMode === "endless" ? this.drawDistanceM : 0,
        );

        for (let index = 0; index < this.wheels.length; index += 1) {
            const wheel = this.wheels[index]!;
            const wheelState = state.wheels[index]!;
            wheel.root.rotation.y = wheelState.steerAngleRad;
            wheel.angle += wheelState.omega * dt;
            wheel.spin.rotation.x = wheel.angle;
        }
        for (let index = 0; index < this.importedWheels.length; index += 1) {
            const wheel = this.importedWheels[index];
            if (!wheel) continue;
            const wheelState = state.wheels[index]!;
            if (wheel.steer) wheel.steer.rotation.y = wheelState.steerAngleRad;
            wheel.angle += wheelState.omega * dt;
            wheel.spin.rotation.x = wheel.angle;
        }

        if (this.steeringSpinNode) {
            this.steeringSpinNode.rotation.z = -state.steeringWheelAngleRad;
        }
        if (this.tachNeedleNode) {
            const rpmFraction = Math.min(1, state.rpm / this.config.engine.redlineRpm);
            this.tachNeedleNode.rotation.z = 2.4 - rpmFraction * 4.8;
        }
        if (this.speedNeedleNode) {
            const speedFraction = Math.min(1, state.speedKph / this.speedoMaxKph);
            this.speedNeedleNode.rotation.z = 2.4 - speedFraction * 4.8;
        }

        this.updateGearLever(state);
        this.updatePedals(state);
        this.updateLights(state);
        this.updateWipers(dt);

        this.cockpit.update(state, dt);
        const mode = this.cockpit.mode;
        if (mode !== this.lastCameraMode) this.setCameraMode(mode);
    }

    render(): void {
        this.scene.render();
    }

    getFps(): number {
        return this.engine.getFps();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        window.removeEventListener("resize", this.resizeHandler);
        this.worldStreamer?.dispose();
        this.cockpit.dispose();
        this.scene.dispose();
        this.engine.dispose();
    }

    private setCameraMode(mode: CameraMode): void {
        this.lastCameraMode = mode;
        const showExterior = mode !== "cockpit";
        this.cockpitGroup.setEnabled(!showExterior);
        if (this.cockpitLight) this.cockpitLight.setEnabled(!showExterior);
        if (this.usingImportedCar) {
            this.importedCar?.setEnabled(showExterior);
            this.exteriorCabin.setEnabled(false);
            for (const mesh of this.exteriorMeshes) mesh.setEnabled(false);
            return;
        }
        if (this.carAssetPending) {
            this.exteriorCabin.setEnabled(false);
            for (const mesh of this.exteriorMeshes) mesh.setEnabled(false);
            return;
        }
        this.exteriorCabin.setEnabled(showExterior);
        for (const mesh of this.exteriorMeshes) mesh.setEnabled(showExterior);
    }

    private createPaintMaterial(): PBRMaterial {
        const material = new PBRMaterial("paint", this.scene);
        material.albedoColor = Color3.FromHexString("#4f585e");
        material.metallic = 0.73;
        material.roughness = 0.27;
        material.clearCoat.isEnabled = true;
        material.clearCoat.intensity = 0.85;
        material.clearCoat.roughness = 0.14;
        material.environmentIntensity = 0.9;
        material.backFaceCulling = false;
        return material;
    }

    private createGlassMaterial(): PBRMaterial {
        const material = new PBRMaterial("glass", this.scene);
        material.albedoColor = new Color3(0.005, 0.007, 0.009);
        material.metallic = 0.15;
        material.roughness = 0.1;
        material.alpha = 1;
        material.environmentIntensity = 0.3;
        material.backFaceCulling = false;
        return material;
    }

    private material(name: string, color: string, metallic = 0.1, roughness = 0.7): PBRMaterial {
        const material = new PBRMaterial(name, this.scene);
        material.albedoColor = Color3.FromHexString(color);
        material.metallic = metallic;
        material.roughness = roughness;
        return material;
    }

    private buildCar(): void {
        const trim = this.material("trim", "#17191b", 0.2, 0.65);
        const rubber = this.material("rubber", "#0b0c0d", 0.02, 0.92);
        const chrome = this.material("chrome", "#b8bcc0", 0.95, 0.2);
        const interior = new StandardMaterial("interior", this.scene);
        interior.diffuseColor = new Color3(0.012, 0.016, 0.02);
        interior.specularColor = new Color3(0.02, 0.02, 0.02);
        const seatMaterial = new StandardMaterial("seat", this.scene);
        seatMaterial.diffuseColor = new Color3(0.025, 0.028, 0.03);
        seatMaterial.specularColor = new Color3(0.02, 0.02, 0.02);
        const carpet = new StandardMaterial("carpet", this.scene);
        carpet.diffuseColor = new Color3(0.008, 0.009, 0.01);
        carpet.specularColor = Color3.Black();
        const rim = this.material("rim", "#9fa4a8", 0.82, 0.32);

        const halfWidth = this.config.trackM / 2;
        const frontAxle = this.config.wheelbaseM * (1 - this.config.frontWeightBias);
        const rearAxle = -this.config.wheelbaseM * this.config.frontWeightBias;
        const bodyCenterZ = (frontAxle + rearAxle) / 2;
        const wheelRadius = this.config.wheelRadiusM;
        const wheelWidth = 0.24;

        const addBox = (
            name: string,
            width: number,
            height: number,
            depth: number,
            x: number,
            y: number,
            z: number,
            material: PBRMaterial | StandardMaterial,
            parent: TransformNode = this.carRoot,
            shadows = true,
        ): Mesh => {
            const mesh = CreateBox(name, { width, height, depth }, this.scene);
            mesh.position.set(x, y, z);
            mesh.material = material;
            mesh.parent = parent;
            mesh.isPickable = false;
            if (shadows) this.environment.shadows.addShadowCaster(mesh, true);
            return mesh;
        };

        const familyFace = this.material("family-face", "#0d0f11", 0.15, 0.55);
        const headlamp = this.material("headlamp-housing", "#11161b", 0.55, 0.26);
        const redLens = this.material("red-lens", "#5b0708", 0.2, 0.2);
        const amberLens = this.material("amber-lens", "#8a3a05", 0.2, 0.25);
        const highChrome = this.material("high-chrome", "#d6d9da", 1, 0.12);
        const lowChrome = this.material("low-chrome", "#8d9397", 0.9, 0.28);

        addBox("underbody", 1.56, 0.08, 4.0, 0, 0.28, bodyCenterZ, carpet, this.carRoot, false);

        const bodySections = [
            { z: -2.22, w: 0.52, bottom: 0.44, shoulder: 0.6, top: 0.82, topWidth: 0.39 },
            { z: -2.12, w: 0.55, bottom: 0.42, shoulder: 0.62, top: 0.84, topWidth: 0.41 },
            { z: -2.0, w: 0.69, bottom: 0.34, shoulder: 0.73, top: 0.94, topWidth: 0.54 },
            { z: -1.84, w: 0.78, bottom: 0.3, shoulder: 0.78, top: 0.99, topWidth: 0.62 },
            { z: -1.58, w: 0.84, bottom: 0.28, shoulder: 0.81, top: 1.02, topWidth: 0.67 },
            { z: -1.05, w: 0.855, bottom: 0.28, shoulder: 0.82, top: 1.035, topWidth: 0.7 },
            { z: -0.25, w: 0.86, bottom: 0.28, shoulder: 0.825, top: 1.04, topWidth: 0.71 },
            { z: 0.55, w: 0.855, bottom: 0.28, shoulder: 0.82, top: 1.03, topWidth: 0.7 },
            { z: 1.1, w: 0.84, bottom: 0.29, shoulder: 0.8, top: 1.015, topWidth: 0.67 },
            { z: 1.55, w: 0.8, bottom: 0.32, shoulder: 0.76, top: 0.985, topWidth: 0.61 },
            { z: 1.9, w: 0.72, bottom: 0.36, shoulder: 0.69, top: 0.93, topWidth: 0.53 },
            { z: 2.12, w: 0.58, bottom: 0.43, shoulder: 0.62, top: 0.85, topWidth: 0.43 },
        ];
        const lowerBody = this.createLoft(
            "body-shell",
            bodySections,
            this.paintMaterial,
            this.carRoot,
        );
        lowerBody.receiveShadows = true;

        const greenhouseSections = [
            { z: -1.95, w: 0.56, base: 0.98, roof: 1.02, roofWidth: 0.42 },
            { z: -1.78, w: 0.62, base: 0.99, roof: 1.14, roofWidth: 0.47 },
            { z: -1.55, w: 0.72, base: 1.0, roof: 1.29, roofWidth: 0.5 },
            { z: -1.3, w: 0.78, base: 1.015, roof: 1.4, roofWidth: 0.52 },
            { z: -1.0, w: 0.8, base: 1.025, roof: 1.45, roofWidth: 0.54 },
            { z: -0.4, w: 0.81, base: 1.03, roof: 1.475, roofWidth: 0.55 },
            { z: 0.12, w: 0.8, base: 1.03, roof: 1.465, roofWidth: 0.54 },
            { z: 0.38, w: 0.78, base: 1.025, roof: 1.36, roofWidth: 0.52 },
            { z: 0.56, w: 0.72, base: 1.02, roof: 1.18, roofWidth: 0.48 },
            { z: 0.68, w: 0.64, base: 1.01, roof: 1.03, roofWidth: 0.4 },
        ];
        this.createCabinLoft(
            "greenhouse",
            greenhouseSections,
            this.glassMaterial,
            this.exteriorCabin,
        );
        addBox(
            "roof-skin",
            1.16,
            0.045,
            1.4,
            0,
            1.497,
            -0.38,
            this.paintMaterial,
            this.exteriorCabin,
            false,
        );
        addBox(
            "roof-skin-front",
            0.9,
            0.04,
            0.32,
            0,
            1.49,
            0.18,
            this.paintMaterial,
            this.exteriorCabin,
            false,
        );

        const sideWindowAt = (
            side: number,
            name: string,
            z0: number,
            y0: number,
            z1: number,
            y1: number,
        ): Mesh => {
            return this.createQuad(
                name,
                [
                    [side * 0.816, y0, z0],
                    [side * 0.586, y1, z0],
                    [side * 0.586, y1, z1],
                    [side * 0.816, y0, z1],
                ],
                this.glassMaterial,
                this.exteriorCabin,
                false,
            );
        };
        for (const side of [-1, 1]) {
            sideWindowAt(side, `front-window-${side}`, 0.3, 1.08, -0.18, 1.43);
            sideWindowAt(side, `rear-window-${side}`, -0.28, 1.08, -1.5, 1.38);
            addBox(
                `side-window-panel-front-${side}`,
                0.02,
                0.32,
                0.5,
                side * 0.9,
                1.255,
                0.06,
                this.glassMaterial,
                this.exteriorCabin,
                false,
            );
            addBox(
                `side-window-panel-rear-${side}`,
                0.02,
                0.3,
                1.1,
                side * 0.9,
                1.25,
                -0.82,
                this.glassMaterial,
                this.exteriorCabin,
                false,
            );
            addBox(
                `window-trim-${side}`,
                0.016,
                0.022,
                1.65,
                side * 0.902,
                1.075,
                -0.55,
                highChrome,
                this.exteriorCabin,
                false,
            );
            addBox(
                `window-top-trim-${side}`,
                0.016,
                0.02,
                1.55,
                side * 0.902,
                1.425,
                -0.62,
                highChrome,
                this.exteriorCabin,
                false,
            );
            addBox(
                `b-pillar-outer-${side}`,
                0.045,
                0.4,
                0.065,
                side * 0.716,
                1.28,
                -0.235,
                familyFace,
                this.exteriorCabin,
                false,
            );
            addBox(
                `door-seam-${side}`,
                0.012,
                0.5,
                0.012,
                side * 0.902,
                0.68,
                0.36,
                familyFace,
                this.carRoot,
                false,
            );
            addBox(
                `door-seam-rear-${side}`,
                0.012,
                0.5,
                0.012,
                side * 0.902,
                0.68,
                -0.82,
                familyFace,
                this.carRoot,
                false,
            );
            addBox(
                `door-handle-${side}`,
                0.13,
                0.035,
                0.035,
                side * 0.916,
                0.93,
                0.08,
                highChrome,
                this.carRoot,
                false,
            );
            addBox(
                `door-handle-rear-${side}`,
                0.12,
                0.03,
                0.03,
                side * 0.912,
                0.93,
                -0.86,
                highChrome,
                this.carRoot,
                false,
            );
            addBox(
                `side-skirt-${side}`,
                0.1,
                0.1,
                2.5,
                side * 0.87,
                0.37,
                -0.22,
                familyFace,
                this.carRoot,
                false,
            );
            addBox(
                `beltline-${side}`,
                0.018,
                0.022,
                2.35,
                side * 0.872,
                1.045,
                -0.3,
                highChrome,
                this.carRoot,
                false,
            );
            addBox(
                `mirror-stalk-${side}`,
                0.14,
                0.045,
                0.045,
                side * 0.955,
                1.08,
                0.55,
                trim,
                this.carRoot,
                false,
            );
            addBox(
                `mirror-housing-${side}`,
                0.2,
                0.105,
                0.11,
                side * 1.06,
                1.09,
                0.55,
                this.paintMaterial,
                this.carRoot,
                false,
            );
            addBox(
                `mirror-glass-${side}`,
                0.15,
                0.075,
                0.012,
                side * 1.06,
                1.09,
                0.61,
                chrome,
                this.carRoot,
                false,
            );
            addBox(
                `fender-trim-${side}`,
                0.025,
                0.15,
                0.85,
                side * 0.91,
                0.66,
                frontAxle,
                familyFace,
                this.carRoot,
                false,
            );
            addBox(
                `fender-trim-rear-${side}`,
                0.025,
                0.15,
                0.85,
                side * 0.91,
                0.66,
                rearAxle,
                familyFace,
                this.carRoot,
                false,
            );
        }

        this.createQuad(
            "windshield-glass",
            [
                [-0.63, 1.04, 0.69],
                [0.63, 1.04, 0.69],
                [0.58, 1.455, 0.31],
                [-0.58, 1.455, 0.31],
            ],
            this.glassMaterial,
            this.exteriorCabin,
            false,
        );
        this.createQuad(
            "rear-glass",
            [
                [-0.5, 1.0, -1.96],
                [0.5, 1.0, -1.96],
                [0.5, 1.4, -1.52],
                [-0.5, 1.4, -1.52],
            ],
            this.glassMaterial,
            this.exteriorCabin,
            false,
        );
        for (const side of [-1, 1]) {
            addBox(
                `a-pillar-outer-${side}`,
                0.032,
                0.53,
                0.04,
                side * 0.735,
                1.24,
                0.47,
                familyFace,
                this.exteriorCabin,
                false,
            ).rotation.x = -0.66;
            addBox(
                `c-pillar-outer-${side}`,
                0.05,
                0.44,
                0.16,
                side * 0.7,
                1.23,
                -1.55,
                this.paintMaterial,
                this.exteriorCabin,
                false,
            ).rotation.x = 0.58;
        }
        addBox(
            "shark-fin",
            0.04,
            0.07,
            0.18,
            0,
            1.55,
            -1.31,
            familyFace,
            this.exteriorCabin,
            false,
        );
        addBox(
            "rear-spoiler",
            1.2,
            0.035,
            0.24,
            0,
            1.46,
            -1.52,
            this.paintMaterial,
            this.exteriorCabin,
            false,
        ).rotation.x = 0.1;
        addBox(
            "rear-body-cap",
            1.05,
            0.46,
            0.04,
            0,
            0.58,
            -2.14,
            this.paintMaterial,
            this.carRoot,
            false,
        );
        addBox(
            "front-body-cap",
            1.05,
            0.46,
            0.04,
            0,
            0.58,
            2.12,
            this.paintMaterial,
            this.carRoot,
            false,
        );
        addBox(
            "rear-bulkhead",
            1.16,
            0.42,
            0.04,
            0,
            1.2,
            -1.62,
            interior,
            this.cockpitGroup,
            false,
        );
        addBox("parcel-shelf", 1.2, 0.04, 0.34, 0, 1.18, -1.4, carpet, this.cockpitGroup, false);

        addBox("front-bumper", 1.8, 0.38, 0.2, 0, 0.55, frontAxle + 1.1, this.paintMaterial);
        addBox("rear-bumper", 1.78, 0.4, 0.2, 0, 0.54, -2.2, this.paintMaterial);
        addBox(
            "front-lip",
            1.62,
            0.12,
            0.16,
            0,
            0.34,
            frontAxle + 1.14,
            familyFace,
            this.carRoot,
            false,
        );
        addBox("rear-diffuser", 1.5, 0.14, 0.15, 0, 0.32, -2.27, familyFace, this.carRoot, false);
        addBox(
            "grille",
            0.92,
            0.19,
            0.07,
            0,
            0.74,
            frontAxle + 1.16,
            familyFace,
            this.carRoot,
            false,
        );
        addBox(
            "grille-slat-top",
            0.92,
            0.015,
            0.02,
            0,
            0.8,
            frontAxle + 1.198,
            highChrome,
            this.carRoot,
            false,
        );
        addBox(
            "grille-slat-low",
            0.92,
            0.012,
            0.02,
            0,
            0.7,
            frontAxle + 1.198,
            highChrome,
            this.carRoot,
            false,
        );
        addBox(
            "lower-intake",
            1.02,
            0.13,
            0.08,
            0,
            0.43,
            frontAxle + 1.17,
            familyFace,
            this.carRoot,
            false,
        );
        addBox(
            "front-plate",
            0.44,
            0.11,
            0.025,
            0,
            0.57,
            frontAxle + 1.205,
            chrome,
            this.carRoot,
            false,
        );
        const badge = CreateCylinder(
            "front-badge",
            { diameter: 0.105, height: 0.02, tessellation: 24 },
            this.scene,
        );
        badge.rotation.x = Math.PI / 2;
        badge.position.set(0, 0.74, frontAxle + 1.21);
        badge.material = highChrome;
        badge.parent = this.carRoot;
        badge.isPickable = false;
        const badgeInner = CreateCylinder(
            "front-badge-inner",
            { diameter: 0.065, height: 0.022, tessellation: 20 },
            this.scene,
        );
        badgeInner.rotation.x = Math.PI / 2;
        badgeInner.position.set(0, 0.74, frontAxle + 1.215);
        badgeInner.material = familyFace;
        badgeInner.parent = this.carRoot;
        badgeInner.isPickable = false;

        for (const side of [-1, 1]) {
            addBox(
                `headlamp-${side}`,
                0.48,
                0.17,
                0.1,
                side * 0.55,
                0.9,
                frontAxle + 1.13,
                headlamp,
                this.carRoot,
                false,
            );
            addBox(
                `drl-${side}`,
                0.34,
                0.018,
                0.025,
                side * 0.55,
                0.95,
                frontAxle + 1.19,
                this.headlightMaterial,
                this.carRoot,
                false,
            );
            const projector = CreateCylinder(
                `projector-${side}`,
                { diameter: 0.105, height: 0.035, tessellation: 20 },
                this.scene,
            );
            projector.rotation.x = Math.PI / 2;
            projector.position.set(side * 0.55, 0.89, frontAxle + 1.2);
            projector.material = highChrome;
            projector.parent = this.carRoot;
            projector.isPickable = false;
            addBox(
                `fog-${side}`,
                0.12,
                0.06,
                0.03,
                side * 0.63,
                0.43,
                frontAxle + 1.19,
                amberLens,
                this.carRoot,
                false,
            );
            addBox(
                `taillight-${side}`,
                0.49,
                0.18,
                0.055,
                side * 0.55,
                0.92,
                -2.16,
                redLens,
                this.carRoot,
                false,
            );
            addBox(
                `taillight-led-${side}`,
                0.42,
                0.02,
                0.01,
                side * 0.55,
                0.98,
                -2.195,
                this.brakeLightMaterial,
                this.carRoot,
                false,
            );
            addBox(
                `reverse-light-${side}`,
                0.11,
                0.05,
                0.02,
                side * 0.72,
                0.82,
                -2.19,
                this.reverseLightMaterial,
                this.carRoot,
                false,
            );
            addBox(
                `reflector-${side}`,
                0.1,
                0.045,
                0.02,
                side * 0.65,
                0.5,
                -2.2,
                redLens,
                this.carRoot,
                false,
            );
            addBox(
                `exhaust-${side}`,
                0.09,
                0.09,
                0.16,
                side * 0.34,
                0.3,
                -2.24,
                highChrome,
                this.carRoot,
                false,
            );
        }
        addBox("rear-plate", 0.44, 0.11, 0.02, 0, 0.6, -2.24, chrome, this.carRoot, false);
        const badgeTexture = new DynamicTexture(
            "golf-badge-texture",
            { width: 512, height: 128 },
            this.scene,
            true,
        );
        const badgeContext = badgeTexture.getContext() as unknown as CanvasRenderingContext2D;
        badgeContext.clearRect(0, 0, 512, 128);
        badgeContext.fillStyle = "#c9d0d4";
        badgeContext.font = '700 92px "Noto Sans", sans-serif';
        badgeContext.textAlign = "center";
        badgeContext.textBaseline = "middle";
        badgeContext.fillText("Golf", 256, 66);
        badgeTexture.update(false);
        badgeTexture.hasAlpha = true;
        const badgeMaterial = new StandardMaterial("golf-badge-material", this.scene);
        badgeMaterial.diffuseTexture = badgeTexture;
        badgeMaterial.emissiveTexture = badgeTexture;
        badgeMaterial.useAlphaFromDiffuseTexture = true;
        badgeMaterial.backFaceCulling = false;
        badgeMaterial.specularColor = Color3.Black();
        const rearBadge = CreatePlane("golf-rear-badge", { width: 0.28, height: 0.07 }, this.scene);
        rearBadge.position.set(0, 0.78, -2.245);
        rearBadge.rotation.y = Math.PI;
        rearBadge.material = badgeMaterial;
        rearBadge.parent = this.carRoot;
        rearBadge.isPickable = false;
        addBox(
            "brake-light-bar",
            0.55,
            0.025,
            0.02,
            0,
            1.42,
            -1.66,
            this.brakeLightMaterial,
            this.exteriorCabin,
            false,
        );

        const headlightLeft = new SpotLight(
            "headlight-spot-left",
            new Vector3(0, 0, 0),
            new Vector3(0, -0.1, 1),
            Math.PI / 6.5,
            4,
            this.scene,
        );
        const headlightRight = new SpotLight(
            "headlight-spot-right",
            new Vector3(0, 0, 0),
            new Vector3(0, -0.1, 1),
            Math.PI / 6.5,
            4,
            this.scene,
        );
        for (const light of [headlightLeft, headlightRight]) {
            light.diffuse = new Color3(1, 0.92, 0.78);
            light.specular = new Color3(1, 0.95, 0.85);
            light.intensity = 0;
            light.range = 55;
            this.headlightSpots.push(light);
        }
        this.headlightSpots[0]!.position.set(-0.58, 0.86, 0);
        this.headlightSpots[1]!.position.set(0.58, 0.86, 0);

        for (let index = 0; index < 4; index += 1) {
            const front = index < 2;
            const left = index % 2 === 0;
            const wheelRoot = new TransformNode(`wheel-root-${index}`, this.scene);
            wheelRoot.parent = this.carRoot;
            wheelRoot.position.set(
                left ? -(halfWidth + 0.085) : halfWidth + 0.085,
                wheelRadius,
                front ? frontAxle : rearAxle,
            );
            const spin = new TransformNode(`wheel-spin-${index}`, this.scene);
            spin.parent = wheelRoot;
            const tire = CreateCylinder(
                `tire-${index}`,
                { diameter: wheelRadius * 2.02, height: wheelWidth, tessellation: 40 },
                this.scene,
            );
            tire.rotation.z = Math.PI / 2;
            tire.material = rubber;
            tire.parent = spin;
            tire.isPickable = false;
            tire.receiveShadows = true;
            this.environment.shadows.addShadowCaster(tire, true);
            const sidewall = CreateTorus(
                `sidewall-${index}`,
                { diameter: wheelRadius * 1.55, thickness: 0.035, tessellation: 32 },
                this.scene,
            );
            sidewall.rotation.z = Math.PI / 2;
            sidewall.material = rubber;
            sidewall.parent = spin;
            sidewall.isPickable = false;
            const rimMesh = CreateCylinder(
                `rim-${index}`,
                { diameter: wheelRadius * 1.3, height: wheelWidth + 0.015, tessellation: 32 },
                this.scene,
            );
            rimMesh.rotation.z = Math.PI / 2;
            rimMesh.material = lowChrome;
            rimMesh.parent = spin;
            rimMesh.isPickable = false;
            const rimFace = CreateCylinder(
                `rim-face-${index}`,
                { diameter: wheelRadius * 1.16, height: wheelWidth + 0.02, tessellation: 32 },
                this.scene,
            );
            rimFace.rotation.z = Math.PI / 2;
            rimFace.material = rim;
            rimFace.parent = spin;
            rimFace.isPickable = false;
            for (let spokeIndex = 0; spokeIndex < 5; spokeIndex += 1) {
                const spoke = CreateBox(
                    `spoke-${index}-${spokeIndex}`,
                    { width: 0.035, height: 0.24, depth: 0.035 },
                    this.scene,
                );
                spoke.position.set(0, 0.12, 0);
                const spokePivot = new TransformNode(
                    `spoke-pivot-${index}-${spokeIndex}`,
                    this.scene,
                );
                spokePivot.parent = spin;
                spokePivot.rotation.x = (spokeIndex / 5) * Math.PI * 2;
                spoke.parent = spokePivot;
                spoke.material = highChrome;
                spoke.isPickable = false;
            }
            const hub = CreateCylinder(
                `hub-${index}`,
                { diameter: 0.12, height: wheelWidth + 0.05, tessellation: 20 },
                this.scene,
            );
            hub.rotation.z = Math.PI / 2;
            hub.material = highChrome;
            hub.parent = spin;
            hub.isPickable = false;
            const disc = CreateCylinder(
                `brake-disc-${index}`,
                { diameter: 0.31, height: 0.025, tessellation: 28 },
                this.scene,
            );
            disc.rotation.z = Math.PI / 2;
            disc.position.set(left ? 0.08 : -0.08, 0, 0);
            disc.material = lowChrome;
            disc.parent = wheelRoot;
            disc.isPickable = false;
            const caliper = CreateBox(
                `caliper-${index}`,
                { width: 0.045, height: 0.11, depth: 0.06 },
                this.scene,
            );
            caliper.position.set(left ? 0.09 : -0.09, 0.11, -0.13);
            caliper.material = redLens;
            caliper.parent = wheelRoot;
            caliper.isPickable = false;
            const arch = CreateTorus(
                `wheel-arch-${index}`,
                { diameter: wheelRadius * 2.25, thickness: 0.035, tessellation: 28 },
                this.scene,
            );
            arch.rotation.z = Math.PI / 2;
            arch.position.set(left ? -0.1 : 0.1, 0, 0);
            arch.material = familyFace;
            arch.parent = wheelRoot;
            arch.isPickable = false;
            this.wheels.push({ root: wheelRoot, spin, angle: 0 });
        }

        this.buildInterior(trim, interior, seatMaterial, carpet, chrome);
    }

    private loadDetailedCar(): void {
        void ImportMeshAsync(hatchbackUrl, this.scene)
            .then((result) => {
                if (this.disposed) return;
                const assetRoot = result.meshes[0];
                if (!assetRoot) throw new Error("The car asset has no root mesh.");

                const root = new TransformNode("imported-car", this.scene);
                root.parent = this.carRoot;
                root.scaling.setAll(1.04);
                root.position.set(0, 0, -0.29);
                assetRoot.parent = root;

                const shadowTexture = new DynamicTexture(
                    "car-contact-shadow",
                    { width: 256, height: 512 },
                    this.scene,
                    true,
                );
                const shadowContext = shadowTexture.getContext();
                shadowContext.clearRect(0, 0, 256, 512);
                const shadowGradient = shadowContext.createRadialGradient(
                    128,
                    256,
                    28,
                    128,
                    256,
                    180,
                );
                shadowGradient.addColorStop(0, "rgba(0,0,0,0.60)");
                shadowGradient.addColorStop(0.55, "rgba(0,0,0,0.32)");
                shadowGradient.addColorStop(1, "rgba(0,0,0,0)");
                shadowContext.fillStyle = shadowGradient;
                shadowContext.fillRect(0, 0, 256, 512);
                shadowTexture.update(false);
                shadowTexture.hasAlpha = true;
                const shadowMaterial = new StandardMaterial(
                    "car-contact-shadow-material",
                    this.scene,
                );
                shadowMaterial.diffuseTexture = shadowTexture;
                shadowMaterial.useAlphaFromDiffuseTexture = true;
                shadowMaterial.disableLighting = true;
                shadowMaterial.diffuseColor = Color3.White();
                shadowMaterial.emissiveColor = Color3.Black();
                shadowMaterial.specularColor = Color3.Black();
                shadowMaterial.backFaceCulling = false;
                const shadowPlane = CreatePlane(
                    "car-contact-shadow-plane",
                    { width: 2.45, height: 4.6 },
                    this.scene,
                );
                shadowPlane.rotation.x = Math.PI / 2;
                shadowPlane.position.y = 0.018;
                shadowPlane.material = shadowMaterial;
                shadowPlane.parent = root;
                shadowPlane.isPickable = false;

                const wheelEntries: Array<{
                    spin: TransformNode;
                    steer: TransformNode | null;
                    angle: number;
                } | null> = [null, null, null, null];
                for (const mesh of result.meshes) {
                    mesh.isPickable = false;
                    mesh.receiveShadows = true;
                    const wheelMatch = /wheel_(fl|fr|rl|rr)/i.exec(mesh.name);
                    if (wheelMatch) {
                        const node = mesh as Mesh;
                        const originalPosition = node.position.clone();
                        const parent = node.parent ?? assetRoot;
                        const pivot = new TransformNode(
                            `imported-wheel-pivot-${wheelMatch[1]}`,
                            this.scene,
                        );
                        pivot.parent = parent;
                        pivot.position.copyFrom(originalPosition);
                        pivot.rotationQuaternion = null;
                        node.parent = pivot;
                        node.position.setAll(0);
                        node.rotationQuaternion = null;
                        node.rotation.setAll(0);
                        const front = wheelMatch[1]!.toLowerCase().startsWith("f");
                        const index = (front ? 0 : 2) + (originalPosition.x > 0 ? 1 : 0);
                        wheelEntries[index] = { spin: node, steer: front ? pivot : null, angle: 0 };
                        this.environment.shadows.addShadowCaster(mesh, true);
                        continue;
                    }
                    if (mesh.getTotalVertices() > 0 && mesh.material?.alpha === 1) {
                        this.environment.shadows.addShadowCaster(mesh, true);
                    }
                }

                const materials = new Set<PBRMaterial>();
                for (const mesh of result.meshes) {
                    if (mesh.material instanceof PBRMaterial) materials.add(mesh.material);
                }
                for (const material of materials) {
                    const name = material.name.toLowerCase();
                    if (name.includes("body_pbr")) {
                        // Preserve the authored panel, trim and roughness detail in the GLB.
                        material.albedoColor = Color3.White();
                        material.metallic = 1;
                        material.roughness = 1;
                        material.clearCoat.isEnabled = true;
                        material.clearCoat.intensity = 0.45;
                        material.clearCoat.roughness = 0.24;
                        material.environmentIntensity = 0.9;
                    } else if (name.includes("window_glass")) {
                        material.albedoColor = new Color3(0.018, 0.028, 0.034);
                        material.metallic = 0.08;
                        material.roughness = 0.08;
                        material.alpha = 0.58;
                        material.backFaceCulling = false;
                        material.environmentIntensity = 0.7;
                    } else if (name.includes("tire")) {
                        material.environmentIntensity = 0.25;
                        material.roughness = 0.92;
                    } else if (name.includes("rim") || name.includes("hubcap")) {
                        material.albedoColor = new Color3(0.52, 0.55, 0.58);
                        material.metallic = 0.7;
                        material.roughness = 0.24;
                        material.environmentIntensity = 0.9;
                    }
                }

                this.importedWheels = wheelEntries;
                this.importedCar = root;
                this.usingImportedCar = true;
                this.carAssetPending = false;
                this.exteriorCabin.setEnabled(false);
                for (const mesh of this.exteriorMeshes) mesh.setEnabled(false);
                root.setEnabled(this.lastCameraMode !== "cockpit");
                this.scene.getEngine().resize();
            })
            .catch((error: unknown) => {
                this.carAssetPending = false;
                this.setCameraMode(this.lastCameraMode);
                console.warn(
                    "Detailed car asset could not be loaded; keeping the procedural fallback.",
                    error,
                );
            });
    }

    private createLoft(
        name: string,
        sections: Array<{
            z: number;
            w: number;
            bottom: number;
            shoulder: number;
            top: number;
            topWidth: number;
        }>,
        material: PBRMaterial,
        parent: TransformNode,
    ): Mesh {
        const paths = sections.map((section) => {
            const { z, w, bottom, shoulder, top, topWidth } = section;
            return [
                new Vector3(-w * 0.94, bottom, z),
                new Vector3(-w, bottom + 0.07, z),
                new Vector3(-w, shoulder, z),
                new Vector3(-topWidth * 1.03, top - 0.02, z),
                new Vector3(-topWidth * 0.55, top, z),
                new Vector3(topWidth * 0.55, top, z),
                new Vector3(topWidth * 1.03, top - 0.02, z),
                new Vector3(w, shoulder, z),
                new Vector3(w, bottom + 0.07, z),
                new Vector3(w * 0.94, bottom, z),
            ];
        });
        const mesh = CreateRibbon(
            name,
            { pathArray: paths, closePath: true, sideOrientation: Mesh.DOUBLESIDE },
            this.scene,
        );
        mesh.material = material;
        mesh.parent = parent;
        mesh.isPickable = false;
        this.environment.shadows.addShadowCaster(mesh, true);
        return mesh;
    }

    private createCabinLoft(
        name: string,
        sections: Array<{ z: number; w: number; base: number; roof: number; roofWidth: number }>,
        material: PBRMaterial,
        parent: TransformNode,
    ): Mesh {
        const paths = sections.map((section) => {
            const { z, w, base, roof, roofWidth } = section;
            return [
                new Vector3(-w, base, z),
                new Vector3(-w, roof - 0.12, z),
                new Vector3(-roofWidth, roof, z),
                new Vector3(roofWidth, roof, z),
                new Vector3(w, roof - 0.12, z),
                new Vector3(w, base, z),
            ];
        });
        const mesh = CreateRibbon(
            name,
            { pathArray: paths, closePath: true, sideOrientation: Mesh.DOUBLESIDE },
            this.scene,
        );
        mesh.material = material;
        mesh.parent = parent;
        mesh.isPickable = false;
        this.environment.shadows.addShadowCaster(mesh, true);
        return mesh;
    }

    private createQuad(
        name: string,
        points: Array<[number, number, number]>,
        material: PBRMaterial,
        parent: TransformNode,
        shadows = false,
    ): Mesh {
        const mesh = new Mesh(name, this.scene);
        const positions = points.flatMap((point) => point);
        const indices = [0, 1, 2, 0, 2, 3];
        const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
        const normals: number[] = [];
        VertexData.ComputeNormals(positions, indices, normals);
        const vertexData = new VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.normals = normals;
        vertexData.uvs = uvs;
        vertexData.applyToMesh(mesh);
        mesh.material = material;
        mesh.parent = parent;
        mesh.isPickable = false;
        if (shadows) this.environment.shadows.addShadowCaster(mesh, true);
        return mesh;
    }

    private buildInterior(
        trim: PBRMaterial,
        interior: StandardMaterial,
        seatMaterial: StandardMaterial,
        carpet: StandardMaterial,
        chrome: PBRMaterial,
    ): void {
        const leather = new StandardMaterial("cockpit-leather", this.scene);
        leather.diffuseColor = new Color3(0.04, 0.038, 0.035);
        leather.specularColor = new Color3(0.05, 0.048, 0.043);
        leather.emissiveColor = new Color3(0.012, 0.011, 0.009);
        leather.specularPower = 24;
        const softTrim = new StandardMaterial("cockpit-soft-trim", this.scene);
        softTrim.diffuseColor = new Color3(0.09, 0.086, 0.08);
        softTrim.specularColor = new Color3(0.03, 0.03, 0.03);
        softTrim.emissiveColor = new Color3(0.016, 0.014, 0.011);
        const brushedMetal = new StandardMaterial("cockpit-brushed-metal", this.scene);
        brushedMetal.diffuseColor = new Color3(0.36, 0.35, 0.32);
        brushedMetal.specularColor = new Color3(0.7, 0.67, 0.6);
        brushedMetal.specularPower = 64;
        const screenMaterial = new StandardMaterial("cockpit-display", this.scene);
        screenMaterial.diffuseColor = new Color3(0.008, 0.012, 0.016);
        screenMaterial.emissiveColor = new Color3(0.07, 0.18, 0.23);
        screenMaterial.specularColor = new Color3(0.04, 0.05, 0.055);

        const addBox = (
            name: string,
            width: number,
            height: number,
            depth: number,
            x: number,
            y: number,
            z: number,
            material: PBRMaterial | StandardMaterial,
            parent: TransformNode = this.cockpitGroup,
        ): Mesh => {
            const mesh = CreateBox(name, { width, height, depth }, this.scene);
            mesh.position.set(x, y, z);
            mesh.material = material;
            mesh.parent = parent;
            mesh.isPickable = false;
            return mesh;
        };

        // Lower cabin shell. The camera sits at 1.22 m, above the seat cushion and
        // below the roof, with the dash top well under the eye line.
        addBox("cockpit-floor", 1.42, 0.035, 1.55, 0, 0.22, 0.0, carpet);
        addBox("driver-footwell", 0.58, 0.02, 0.62, -0.36, 0.25, 0.38, carpet);
        addBox("passenger-footwell", 0.58, 0.02, 0.62, 0.42, 0.25, 0.38, carpet);
        addBox("transmission-tunnel", 0.26, 0.18, 1.35, 0.02, 0.36, -0.18, carpet);
        addBox("centre-console", 0.24, 0.22, 0.72, 0.02, 0.52, -0.03, leather);
        addBox("console-trim", 0.2, 0.018, 0.55, 0.02, 0.635, -0.02, brushedMetal);

        addBox("cockpit-hood", 1.48, 0.03, 1.34, 0, 0.91, 1.45, this.paintMaterial);
        addBox("hood-crease-left", 0.012, 0.012, 1.05, -0.38, 0.929, 1.48, softTrim);
        addBox("hood-crease-right", 0.012, 0.012, 1.05, 0.38, 0.929, 1.48, softTrim);
        addBox("cowl-vent", 1.12, 0.018, 0.12, 0, 1.018, 0.92, softTrim);
        addBox("windshield-base-trim", 1.38, 0.028, 0.06, 0, 1.03, 0.79, softTrim);
        addBox("wiper-left", 0.55, 0.012, 0.014, -0.25, 1.028, 0.93, trim);
        addBox("wiper-right", 0.45, 0.012, 0.014, 0.24, 1.026, 0.9, trim);

        const cabinLamp = new PointLight(
            "cockpit-ambient",
            new Vector3(-0.16, 1.3, 0.28),
            this.scene,
        );
        cabinLamp.parent = this.cockpitGroup;
        cabinLamp.diffuse = new Color3(1, 0.8, 0.6);
        cabinLamp.specular = new Color3(0.8, 0.6, 0.4);
        cabinLamp.intensity = 2.8;
        cabinLamp.range = 3.6;
        this.cockpitLight = cabinLamp;

        // Main dashboard: a low, deep shelf rather than a vertical slab.
        addBox("dashboard-lower", 1.4, 0.2, 0.18, 0, 0.78, 0.52, leather);
        addBox("dashboard-main", 1.46, 0.16, 0.4, 0, 0.91, 0.7, leather);
        addBox("dashboard-top", 1.48, 0.045, 0.5, 0, 1.0, 0.69, leather).rotation.x = -0.035;
        addBox("dashboard-cowl", 1.42, 0.035, 0.16, 0, 1.015, 0.89, softTrim).rotation.x = -0.08;
        addBox("dash-chrome-rule", 1.0, 0.012, 0.02, 0.08, 0.985, 0.545, brushedMetal);
        addBox("dash-passenger-trim", 0.46, 0.034, 0.02, 0.36, 0.975, 0.55, softTrim);

        for (const [x, y, z] of [
            [-0.61, 0.985, 0.555],
            [-0.45, 0.985, 0.555],
            [0.18, 0.985, 0.555],
            [0.34, 0.985, 0.555],
        ] as Array<[number, number, number]>) {
            const vent = addBox("dash-vent", 0.075, 0.045, 0.018, x, y, z, softTrim);
            vent.rotation.x = -0.1;
            addBox("dash-vent-slat", 0.065, 0.006, 0.022, x, y + 0.008, z + 0.002, brushedMetal);
        }

        addBox("driver-binnacle", 0.46, 0.055, 0.24, -0.36, 1.045, 0.57, leather).rotation.x =
            -0.13;
        addBox("driver-cluster", 0.36, 0.13, 0.015, -0.36, 1.03, 0.5, screenMaterial).rotation.x =
            -0.16;
        addBox("cluster-bezel", 0.39, 0.155, 0.02, -0.36, 1.03, 0.508, softTrim).rotation.x = -0.16;

        const infoScreen = addBox(
            "infotainment-screen",
            0.29,
            0.17,
            0.012,
            0.04,
            1.005,
            0.54,
            screenMaterial,
        );
        infoScreen.rotation.x = -0.12;
        addBox("infotainment-bezel", 0.33, 0.205, 0.012, 0.04, 1.0, 0.552, softTrim).rotation.x =
            -0.12;
        addBox("hazard-button", 0.05, 0.022, 0.01, 0.04, 0.965, 0.57, this.brakeLightMaterial);
        addBox("start-button", 0.03, 0.03, 0.01, 0.19, 0.92, 0.56, chrome);

        // Screen surround and windshield frame. These establish the cabin volume.
        addBox("windshield-header", 1.27, 0.028, 0.075, 0, 1.405, 0.35, softTrim);
        addBox("headliner", 1.25, 0.025, 1.4, 0, 1.425, -0.38, softTrim);
        for (const side of [-1, 1]) {
            addBox(
                `windshield-pillar-${side}`,
                0.028,
                0.47,
                0.04,
                side * 0.68,
                1.215,
                0.535,
                softTrim,
            ).rotation.x = -0.68;
            addBox(`window-sill-${side}`, 0.05, 0.035, 1.45, side * 0.705, 1.005, -0.22, softTrim);
            addBox(`door-card-${side}`, 0.06, 0.5, 1.35, side * 0.72, 0.72, -0.22, leather);
            addBox(`door-armrest-${side}`, 0.14, 0.06, 0.44, side * 0.655, 0.82, -0.24, softTrim);
            addBox(`door-handle-${side}`, 0.08, 0.018, 0.12, side * 0.69, 0.92, 0.18, brushedMetal);
            addBox(`b-pillar-trim-${side}`, 0.04, 0.4, 0.055, side * 0.68, 1.18, -0.68, softTrim);
            addBox(`sun-visor-${side}`, 0.42, 0.02, 0.16, side * 0.35, 1.385, 0.2, softTrim);
        }

        // Seats sit below the eye line and behind the driver, not in the sight line.
        for (const [side, x] of [
            ["driver", -0.36],
            ["passenger", 0.42],
        ] as Array<[string, number]>) {
            addBox(`${side}-seat-base`, 0.49, 0.13, 0.5, x, 0.46, -0.35, seatMaterial);
            const back = addBox(
                `${side}-seat-back`,
                0.48,
                0.53,
                0.15,
                x,
                0.72,
                -0.71,
                seatMaterial,
            );
            back.rotation.x = 0.12;
            addBox(`${side}-headrest`, 0.25, 0.2, 0.11, x, 1.07, -0.77, seatMaterial);
            addBox(
                `${side}-seat-bolster-left`,
                0.06,
                0.45,
                0.17,
                x - 0.22,
                0.71,
                -0.69,
                seatMaterial,
            ).rotation.x = 0.12;
            addBox(
                `${side}-seat-bolster-right`,
                0.06,
                0.45,
                0.17,
                x + 0.22,
                0.71,
                -0.69,
                seatMaterial,
            ).rotation.x = 0.12;
        }

        const plaidTexture = new DynamicTexture(
            "golf-plaid",
            { width: 256, height: 256 },
            this.scene,
            true,
        );
        const plaidContext = plaidTexture.getContext();
        plaidContext.fillStyle = "#101113";
        plaidContext.fillRect(0, 0, 256, 256);
        for (let index = 0; index < 8; index += 1) {
            plaidContext.fillStyle =
                index % 2 === 0 ? "rgba(125, 22, 28, 0.55)" : "rgba(196, 190, 175, 0.18)";
            plaidContext.fillRect(index * 32, 0, 8, 256);
            plaidContext.fillRect(0, index * 32, 256, 6);
        }
        plaidTexture.update(false);
        plaidTexture.wrapU = Texture.WRAP_ADDRESSMODE;
        plaidTexture.wrapV = Texture.WRAP_ADDRESSMODE;
        plaidTexture.uScale = 2.2;
        plaidTexture.vScale = 2.2;
        const plaidMaterial = new PBRMaterial("golf-plaid-material", this.scene);
        plaidMaterial.albedoTexture = plaidTexture;
        plaidMaterial.metallic = 0;
        plaidMaterial.roughness = 0.94;
        for (const x of [-0.36, 0.42]) {
            const centre = addBox(
                "seat-plaid-panel",
                0.32,
                0.4,
                0.012,
                x,
                0.74,
                -0.625,
                plaidMaterial,
            );
            centre.rotation.x = 0.12;
            addBox("seat-plaid-cushion", 0.32, 0.012, 0.36, x, 0.532, -0.35, plaidMaterial);
        }

        const wheelPivot = new TransformNode("steering-pivot", this.scene);
        wheelPivot.parent = this.cockpitGroup;
        wheelPivot.position.set(-0.36, 0.94, 0.33);
        wheelPivot.rotation.x = -0.4;
        const steeringSpin = new TransformNode("steering-spin", this.scene);
        steeringSpin.parent = wheelPivot;
        this.steeringSpinNode = steeringSpin;
        const column = CreateCylinder(
            "steering-column",
            { diameter: 0.048, height: 0.3, tessellation: 12 },
            this.scene,
        );
        column.rotation.x = Math.PI / 2;
        column.position.set(-0.36, 0.89, 0.48);
        column.material = softTrim;
        column.parent = this.cockpitGroup;
        column.isPickable = false;
        const wheel = CreateTorus(
            "steering-wheel",
            { diameter: 0.345, thickness: 0.028, tessellation: 32 },
            this.scene,
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.material = leather;
        wheel.parent = steeringSpin;
        wheel.isPickable = false;
        for (const angle of [0, Math.PI, Math.PI * 1.5]) {
            const spoke = CreateBox(
                "steering-spoke",
                { width: 0.13, height: 0.024, depth: 0.025 },
                this.scene,
            );
            spoke.rotation.z = angle;
            spoke.position.set(Math.cos(angle) * 0.065, Math.sin(angle) * 0.065, 0);
            spoke.material = softTrim;
            spoke.parent = steeringSpin;
            spoke.isPickable = false;
        }
        const hub = CreateCylinder(
            "steering-hub",
            { diameter: 0.085, height: 0.034, tessellation: 20 },
            this.scene,
        );
        hub.rotation.x = Math.PI / 2;
        hub.material = softTrim;
        hub.parent = steeringSpin;
        hub.isPickable = false;
        addBox("stalk-left", 0.12, 0.018, 0.02, -0.49, 0.86, 0.35, softTrim);
        addBox("stalk-right", 0.1, 0.018, 0.02, -0.24, 0.83, 0.35, softTrim);

        const leverBoot = CreateCylinder(
            "gear-boot",
            { diameterTop: 0.055, diameterBottom: 0.14, height: 0.1, tessellation: 14 },
            this.scene,
        );
        leverBoot.position.set(this.leverBase.x, this.leverBase.y - 0.04, this.leverBase.z);
        leverBoot.material = leather;
        leverBoot.parent = this.cockpitGroup;
        const arm = CreateCylinder(
            "gear-lever-arm",
            { diameter: 0.022, height: 1, tessellation: 8 },
            this.scene,
        );
        arm.material = brushedMetal;
        arm.parent = this.cockpitGroup;
        arm.isPickable = false;
        const knob = CreateSphere("gear-knob", { diameter: 0.068, segments: 16 }, this.scene);
        knob.material = leather;
        knob.parent = this.cockpitGroup;
        knob.isPickable = false;

        const pedalPositions: Array<[string, number, PBRMaterial | StandardMaterial]> = [
            ["clutch", -0.55, brushedMetal],
            ["brake", -0.44, brushedMetal],
            ["throttle", -0.33, brushedMetal],
        ];
        for (const [name, x, material] of pedalPositions) {
            const pedal = CreateBox(
                `pedal-${name}`,
                { width: 0.075, height: 0.13, depth: 0.025 },
                this.scene,
            );
            pedal.position.set(x, 0.29, 0.42);
            pedal.rotation.x = -0.35;
            pedal.material = material;
            pedal.parent = this.cockpitGroup;
            pedal.isPickable = false;
            this.pedalMeshes.push({ mesh: pedal, baseY: 0.29, baseRotation: -0.35 });
        }
    }

    private updateGearLever(state: VehicleRenderState): void {
        if (!this.leverArm || !this.leverKnob) return;
        const gateOffset = (state.shifterGate - 1) * 0.085;
        const slotOffset = state.shifterSlot * -0.085;
        const direction = new Vector3(gateOffset + 0.03, 0.36, slotOffset - 0.08).normalize();
        const length = 0.34;
        const quaternion = Quaternion.Identity();
        Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, quaternion);
        this.leverArm.rotationQuaternion = quaternion;
        this.leverArm.position.set(
            this.leverBase.x + direction.x * (length / 2),
            this.leverBase.y + direction.y * (length / 2),
            this.leverBase.z + direction.z * (length / 2),
        );
        this.leverArm.scaling.y = length;
        this.leverKnob.position.set(
            this.leverBase.x + direction.x * length,
            this.leverBase.y + direction.y * length,
            this.leverBase.z + direction.z * length,
        );
    }

    private updatePedals(state: VehicleRenderState): void {
        const values = [state.clutchPedal, state.brake, state.throttle];
        for (let index = 0; index < this.pedalMeshes.length; index += 1) {
            const pedal = this.pedalMeshes[index]!;
            const value = values[index] ?? 0;
            pedal.mesh.position.y = pedal.baseY - value * 0.045;
            pedal.mesh.rotation.x = pedal.baseRotation + value * 0.38;
        }
    }

    private updateLights(state: VehicleRenderState): void {
        const forward = Vector3.TransformNormal(
            new Vector3(0, 0, 1),
            this.carRoot.getWorldMatrix(),
        ).normalize();
        for (let index = 0; index < this.headlightSpots.length; index += 1) {
            const light = this.headlightSpots[index]!;
            const local = new Vector3(
                index === 0 ? -0.58 : 0.58,
                0.86,
                this.config.wheelbaseM * (1 - this.config.frontWeightBias) + 1.15,
            );
            const world = Vector3.TransformCoordinates(local, this.carRoot.getWorldMatrix());
            light.position.copyFrom(world);
            light.direction.copyFrom(forward.add(new Vector3(0, -0.1, 0)).normalize());
            light.intensity = this.headlightsOn ? 80 : 0;
        }
        this.headlightMaterial.emissiveColor = this.headlightsOn
            ? new Color3(1, 0.94, 0.8)
            : new Color3(0.25, 0.25, 0.22);
        this.brakeLightMaterial.emissiveColor =
            state.brake > 0.08 ? new Color3(1, 0.05, 0.03) : new Color3(0.35, 0.015, 0.015);
        this.reverseLightMaterial.emissiveColor =
            state.gear === -1 ? new Color3(1, 1, 0.9) : new Color3(0.18, 0.18, 0.16);
    }

    private updateWipers(dt: number): void {
        if (!this.wiperPivot) return;
        if (this.wipersMode === 0) {
            this.wiperTime = 0;
            this.wiperPivot.rotation.z += (0 - this.wiperPivot.rotation.z) * Math.min(1, dt * 8);
            return;
        }
        const period = this.wipersMode === 1 ? 1.35 : 0.85;
        this.wiperTime += dt;
        const phase = (this.wiperTime % period) / period;
        const sweep = Math.sin(phase * Math.PI * 2);
        this.wiperPivot.rotation.z = -0.65 + sweep * 0.95;
    }
}
