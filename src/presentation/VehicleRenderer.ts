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
    DirectionalLight,
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
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import type { VehicleConfig } from "../simulation/config/VehicleConfig";
import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";
import type { RoadContactProvider } from "../simulation/road/RoadContactProvider";
import type { WorldGenerator } from "../simulation/world/WorldGenerator";
import type { UserSettings } from "../settings/SettingsRepository";
import { DEFAULT_CAR_MODEL_ID, resolveCarModel, type CarModelDefinition } from "./CarModels";
import { CockpitController, type CameraMode } from "./CockpitController";
import { EnvironmentBuilder } from "./EnvironmentBuilder";
import { WorldStreamer } from "./WorldStreamer";
import { CityStreamer } from "./world/CityStreamer";

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
    readonly cityStreamer: CityStreamer;
    private worldMode: "legacy" | "endless" | "city" = "legacy";
    private drawDistanceM = 1400;
    private speedoMaxKph: number;
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
    private readonly importedPaintMaterials: PBRMaterial[] = [];
    private carModelId = DEFAULT_CAR_MODEL_ID;
    private importedModelId: string | null = null;
    private carPaintColor = resolveCarModel(DEFAULT_CAR_MODEL_ID).defaultPaint;
    private carLoadToken = 0;
    private usingImportedCar = false;
    private carAssetPending = true;
    private cockpitLight: PointLight | null = null;
    private readonly cockpitLights: PointLight[] = [];
    private steeringSpinNode: TransformNode | null = null;
    private tachNeedleNode: TransformNode | null = null;
    private speedNeedleNode: TransformNode | null = null;
    private speedDialMaterial: StandardMaterial | null = null;
    private tachDialMaterial: StandardMaterial | null = null;
    private tachMaxRpm = 8000;
    private readonly leverArm: Mesh;
    private readonly leverKnob: Mesh;
    private readonly leverBase = new Vector3(0.03, 0.48, -0.08);
    private handbrakePivot: TransformNode | null = null;
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
        private config: VehicleConfig,
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
            Math.min(1500, Math.ceil((redlineSpeedKph * 1.15) / 20) * 20),
        );
        this.tachMaxRpm = Math.ceil((config.engine.redlineRpm * 1.15) / 1000) * 1000;
        this.engine = new Engine(
            canvas,
            true,
            { preserveDrawingBuffer: false, stencil: true, adaptToDeviceRatio: true },
            true,
        );
        this.scene = new Scene(this.engine);
        this.scene.clearColor = Color4.FromHexString("#b6c9d6ff");
        this.scene.ambientColor = new Color3(0.26, 0.28, 0.31);
        this.scene.fogMode = Scene.FOGMODE_EXP2;
        this.scene.fogDensity = 0.00072;
        this.scene.fogColor = new Color3(0.72, 0.79, 0.85);
        const imageProcessing = this.scene.imageProcessingConfiguration;
        imageProcessing.toneMappingEnabled = true;
        imageProcessing.toneMappingType = 1;
        imageProcessing.exposure = 1.04;
        imageProcessing.contrast = 1.18;
        imageProcessing.vignetteEnabled = true;
        imageProcessing.vignetteWeight = 2.6;
        imageProcessing.vignetteStretch = 0.25;
        imageProcessing.vignetteColor = new Color4(0.015, 0.02, 0.03, 1);
        imageProcessing.colorCurvesEnabled = true;
        const curves = new ColorCurves();
        curves.globalSaturation = 7;
        curves.highlightsDensity = 5;
        curves.highlightsHue = 38;
        curves.shadowsDensity = -5;
        curves.shadowsHue = 214;
        imageProcessing.colorCurves = curves;

        this.environment = new EnvironmentBuilder(this.scene, road);
        this.worldStreamer = world
            ? new WorldStreamer(this.scene, world, this.environment.shadows)
            : null;
        this.cityStreamer = new CityStreamer(
            this.scene,
            this.environment.shadows,
            this.worldStreamer?.sharedMaterials,
        );
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
        this.environment.sun.excludedMeshes = this.cockpitGroup.getChildMeshes();
        this.loadDetailedCar(resolveCarModel(this.carModelId));
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
        this.pipeline.bloomThreshold = 0.88;
        this.pipeline.bloomWeight = 0.16;
        this.pipeline.bloomKernel = 48;
        this.pipeline.sharpenEnabled = true;
        this.pipeline.sharpen.edgeAmount = 0.14;
        this.pipeline.sharpen.colorAmount = 1;
        this.pipeline.chromaticAberrationEnabled = true;
        this.pipeline.chromaticAberration.aberrationAmount = 5;
        this.pipeline.grainEnabled = true;
        this.pipeline.grain.intensity = 2;
        this.pipeline.imageProcessingEnabled = true;
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
            this.pipeline.sharpenEnabled = settings.quality !== "low" && this.adaptiveLevel < 2;
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

    get activeWorldMode(): "legacy" | "endless" | "city" {
        return this.worldMode;
    }

    get activeChunks(): number {
        return this.worldMode === "city"
            ? this.cityStreamer.activeChunks
            : (this.worldStreamer?.activeChunks ?? 0);
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
        if (this.worldMode === "city") {
            const material = this.scene.getMaterialByName(
                "city-road-aligned",
            ) as PBRMaterial | null;
            const albedo = material?.albedoTexture ?? null;
            return {
                material: material?.name ?? null,
                albedo: albedo?.name ?? null,
                albedoReady: albedo?.isReady() ?? false,
                textures: this.scene.textures.length,
                chunks: this.cityStreamer.activeChunks,
                roadMaterial: material?.name ?? null,
                terrainMaterial: this.scene.getMaterialByName("city-ground")?.name ?? null,
                roadVertices: 0,
                terrainVertices: 0,
            };
        }
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

    setWorldMode(mode: "legacy" | "endless" | "city"): void {
        this.worldMode = mode;
        this.environment.setLegacyMode(mode === "legacy");
        this.worldStreamer?.setEnabled(mode === "endless");
        this.cityStreamer?.setEnabled(mode === "city");
        if (mode === "legacy") {
            this.scene.fogColor.set(0.72, 0.8, 0.86);
            this.scene.fogDensity = 0.00085;
        }
    }

    setCitySeed(seed: number): void {
        this.cityStreamer?.setSeed(seed);
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

    get carModel(): string {
        return this.carModelId;
    }

    get speedometerMaxKph(): number {
        return this.speedoMaxKph;
    }

    setConfig(config: VehicleConfig): void {
        this.config = config;
        const topGear = config.gearRatios[config.gearRatios.length - 1] ?? 1;
        const wheelCircumference = 2 * Math.PI * config.wheelRadiusM;
        const redlineSpeedKph =
            (config.engine.redlineRpm / 60) *
            (wheelCircumference / (topGear * config.finalDriveRatio)) *
            3.6;
        this.speedoMaxKph = Math.max(
            200,
            Math.min(600, Math.ceil((redlineSpeedKph * 1.1) / 20) * 20),
        );
        if (this.speedDialMaterial) {
            const previous = this.speedDialMaterial.diffuseTexture;
            const texture = this.createDialTexture(
                "gauge-speed-texture",
                this.speedoMaxKph,
                "km/h",
                0.82,
            );
            this.speedDialMaterial.diffuseTexture = texture;
            this.speedDialMaterial.emissiveTexture = texture;
            if (previous instanceof DynamicTexture && previous !== texture) previous.dispose();
        }
        this.tachMaxRpm = Math.ceil((config.engine.redlineRpm * 1.15) / 1000) * 1000;
        if (this.tachDialMaterial) {
            const previous = this.tachDialMaterial.diffuseTexture;
            const texture = this.createDialTexture(
                "gauge-tach-texture",
                this.tachMaxRpm / 1000,
                "rpm x1000",
                Math.min(0.95, config.engine.redlineRpm / this.tachMaxRpm),
            );
            this.tachDialMaterial.diffuseTexture = texture;
            this.tachDialMaterial.emissiveTexture = texture;
            if (previous instanceof DynamicTexture && previous !== texture) previous.dispose();
        }
    }

    setCarModel(modelId: string, paintColor?: string): void {
        const model = resolveCarModel(modelId);
        const nextPaint = paintColor ?? this.carPaintColor;
        const paintChanged = nextPaint.toLowerCase() !== this.carPaintColor.toLowerCase();
        this.carModelId = model.id;
        this.carPaintColor = nextPaint;
        if (this.usingImportedCar && model.id === this.importedModelId) {
            if (paintChanged) this.applyPaintColor();
            return;
        }
        this.loadDetailedCar(model);
    }

    private applyPaintColor(): void {
        const color = Color3.FromHexString(this.carPaintColor);
        for (const material of this.importedPaintMaterials) {
            material.albedoColor = color;
        }
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
        if (this.worldMode === "city") {
            this.cityStreamer.update(pose.x, pose.y, Math.min(this.drawDistanceM, 640));
        } else {
            this.worldStreamer?.update(
                { x: pose.x, y: pose.y },
                state.speedMps,
                this.worldMode === "endless" ? this.drawDistanceM : 0,
            );
        }

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
            const rpmFraction = Math.min(1, state.rpm / this.tachMaxRpm);
            this.tachNeedleNode.rotation.z = 2.4 - rpmFraction * 4.8;
        }
        if (this.speedNeedleNode) {
            const speedFraction = Math.min(1, state.speedKph / this.speedoMaxKph);
            this.speedNeedleNode.rotation.z = 2.4 - speedFraction * 4.8;
        }

        this.updateGearLever(state);
        this.updateHandbrake(state);
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
        this.cityStreamer?.dispose();
        this.cockpit.dispose();
        this.scene.dispose();
        this.engine.dispose();
    }

    private setCameraMode(mode: CameraMode): void {
        this.lastCameraMode = mode;
        const showExterior = mode !== "cockpit";
        for (const light of this.headlightSpots)
            light.setEnabled(showExterior && this.headlightsOn);
        this.cockpitGroup.setEnabled(!showExterior);
        if (this.cockpitLight) this.cockpitLight.setEnabled(!showExterior);
        for (const light of this.cockpitLights) light.setEnabled(!showExterior);
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
        material.albedoColor = Color3.FromHexString("#39424a");
        material.metallic = 0.82;
        material.roughness = 0.24;
        material.clearCoat.isEnabled = true;
        material.clearCoat.intensity = 1;
        material.clearCoat.roughness = 0.06;
        material.clearCoat.indexOfRefraction = 1.5;
        material.environmentIntensity = 1.05;
        material.backFaceCulling = false;
        return material;
    }

    private createGlassMaterial(): PBRMaterial {
        const material = new PBRMaterial("glass", this.scene);
        material.albedoColor = new Color3(0.012, 0.018, 0.022);
        material.metallic = 0.25;
        material.roughness = 0.045;
        material.alpha = 0.52;
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
        material.environmentIntensity = 1.25;
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
        const trim = this.material("trim", "#202326", 0.18, 0.6);
        const rubber = this.material("rubber", "#0b0c0d", 0.02, 0.92);
        const chrome = this.material("chrome", "#c3c8cc", 1, 0.14);
        const interior = this.material("interior", "#171a1c", 0.04, 0.72);
        const carpet = this.material("carpet", "#0f1113", 0, 0.95);
        const seatMaterial = this.material("seat", "#22262a", 0.02, 0.8);
        const rim = this.material("rim", "#aab0b5", 0.9, 0.2);
        // PBR albedo is linear: scale the authored sRGB hexes down to real interior values.
        trim.albedoColor.scaleInPlace(0.24);
        interior.albedoColor.scaleInPlace(0.4);
        carpet.albedoColor.scaleInPlace(0.4);
        seatMaterial.albedoColor.scaleInPlace(0.3);
        rubber.albedoColor.scaleInPlace(0.2);
        seatMaterial.emissiveColor = new Color3(0.01, 0.011, 0.012);
        trim.environmentIntensity = 0.55;
        interior.environmentIntensity = 0.35;
        carpet.environmentIntensity = 0.3;
        seatMaterial.environmentIntensity = 0.45;
        chrome.environmentIntensity = 1.2;
        rim.environmentIntensity = 1.2;
        rubber.environmentIntensity = 0.4;
        for (const material of [trim, chrome, interior, carpet, seatMaterial, rim, rubber]) {
            material.maxSimultaneousLights = 8;
        }

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
        badgeContext.font = '700 92px "Noto Sans"';
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

    private loadDetailedCar(model: CarModelDefinition): void {
        const token = ++this.carLoadToken;
        if (this.importedCar) {
            this.importedCar.dispose(false, false);
            this.importedCar = null;
        }
        this.importedWheels = [];
        this.importedPaintMaterials.length = 0;
        this.importedModelId = null;
        this.usingImportedCar = false;
        this.carAssetPending = true;
        void ImportMeshAsync(model.url, this.scene)
            .then((result) => {
                if (this.disposed || token !== this.carLoadToken) {
                    result.meshes[0]?.dispose();
                    return;
                }
                const assetRoot = result.meshes[0];
                if (!assetRoot) throw new Error("The car asset has no root mesh.");

                const root = new TransformNode("imported-car", this.scene);
                root.scaling.setAll(model.scale);
                root.position.set(model.offset[0], model.offset[1], model.offset[2]);
                assetRoot.parent = root;
                for (const mesh of result.meshes) mesh.computeWorldMatrix(true);
                const bounds = root.getHierarchyBoundingVectors(true);
                const minY = bounds.min.y;
                if (Number.isFinite(minY) && Math.abs(minY) > 0.004) root.position.y -= minY;

                const wheelEntries: Array<{
                    spin: TransformNode;
                    steer: TransformNode | null;
                    angle: number;
                } | null> = [null, null, null, null];
                const wheelGround: Array<{ x: number; z: number; radius: number }> = [];
                for (const mesh of result.meshes) {
                    mesh.isPickable = false;
                    mesh.receiveShadows = true;
                    const wheelMatch = /wheel_(fl|fr|rl|rr)/i.exec(mesh.name);
                    if (wheelMatch) {
                        const node = mesh as Mesh;
                        node.computeWorldMatrix(true);
                        const groundPosition = node.getAbsolutePosition();
                        const extend = node.getBoundingInfo().boundingBox.extendSize;
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
                        wheelGround.push({
                            x: groundPosition.x,
                            z: groundPosition.z,
                            radius: Math.max(extend.y, extend.z),
                        });
                        this.environment.shadows.addShadowCaster(mesh, true);
                        continue;
                    }
                    const materialName = (mesh.material?.name ?? "").toLowerCase();
                    const isGlass = materialName.includes("window_glass");
                    if (!isGlass && mesh.getTotalVertices() > 0) {
                        this.environment.shadows.addShadowCaster(mesh, true);
                    }
                }
                root.parent = this.carRoot;

                const centerX = (bounds.min.x + bounds.max.x) / 2;
                const centerZ = (bounds.min.z + bounds.max.z) / 2;
                const modelWidth = Math.max(0.6, bounds.max.x - bounds.min.x);
                const modelLength = Math.max(0.6, bounds.max.z - bounds.min.z);
                const shadowTexture = new DynamicTexture(
                    "car-contact-shadow",
                    { width: 512, height: 1024 },
                    this.scene,
                    true,
                );
                const shadowContext = shadowTexture.getContext();
                const shadowW = 512;
                const shadowH = 1024;
                shadowContext.clearRect(0, 0, shadowW, shadowH);
                const left = centerX - (modelWidth * 1.3) / 2;
                const planeWidth = modelWidth * 1.3;
                const planeHeight = modelLength * 1.06;
                const maxZ = centerZ + planeHeight / 2;
                const toCanvas = (x: number, z: number): [number, number] => [
                    ((x - left) / planeWidth) * shadowW,
                    ((maxZ - z) / planeHeight) * shadowH,
                ];
                const bodyShadow = shadowContext.createRadialGradient(
                    shadowW / 2,
                    shadowH / 2,
                    shadowW * 0.04,
                    shadowW / 2,
                    shadowH / 2,
                    shadowW * 0.52,
                );
                bodyShadow.addColorStop(0, "rgba(0,0,0,0.72)");
                bodyShadow.addColorStop(0.55, "rgba(0,0,0,0.5)");
                bodyShadow.addColorStop(0.82, "rgba(0,0,0,0.24)");
                bodyShadow.addColorStop(1, "rgba(0,0,0,0)");
                shadowContext.save();
                shadowContext.translate(shadowW / 2, shadowH / 2);
                shadowContext.scale(1, planeHeight / planeWidth);
                shadowContext.translate(-shadowW / 2, -shadowH / 2);
                shadowContext.fillStyle = bodyShadow;
                shadowContext.fillRect(0, 0, shadowW, shadowH);
                shadowContext.restore();
                for (const wheel of wheelGround) {
                    const [wheelX, wheelY] = toCanvas(wheel.x, wheel.z);
                    const wheelRadius = Math.min(70, (wheel.radius * 2.4 * shadowH) / planeHeight);
                    const wheelShadow = shadowContext.createRadialGradient(
                        wheelX,
                        wheelY,
                        wheelRadius * 0.1,
                        wheelX,
                        wheelY,
                        wheelRadius,
                    );
                    wheelShadow.addColorStop(0, "rgba(0,0,0,0.76)");
                    wheelShadow.addColorStop(0.7, "rgba(0,0,0,0.38)");
                    wheelShadow.addColorStop(1, "rgba(0,0,0,0)");
                    shadowContext.fillStyle = wheelShadow;
                    shadowContext.beginPath();
                    shadowContext.arc(wheelX, wheelY, wheelRadius, 0, Math.PI * 2);
                    shadowContext.fill();
                }
                shadowTexture.update(false);
                shadowTexture.hasAlpha = true;
                const shadowMaterial = new PBRMaterial("car-contact-shadow-material", this.scene);
                shadowMaterial.albedoTexture = shadowTexture;
                shadowMaterial.albedoColor = Color3.White();
                shadowMaterial.useAlphaFromAlbedoTexture = true;
                shadowMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
                shadowMaterial.unlit = true;
                shadowMaterial.backFaceCulling = false;
                shadowMaterial.disableLighting = true;
                const shadowPlane = CreatePlane(
                    "car-contact-shadow-plane",
                    { width: planeWidth / model.scale, height: planeHeight / model.scale },
                    this.scene,
                );
                shadowPlane.rotation.x = Math.PI / 2;
                shadowPlane.position.set(
                    (centerX - root.position.x) / model.scale,
                    (0.035 - root.position.y) / model.scale,
                    (centerZ - root.position.z) / model.scale,
                );
                shadowPlane.material = shadowMaterial;
                shadowPlane.parent = root;
                shadowPlane.isPickable = false;

                const materials = new Set<PBRMaterial>();
                for (const mesh of result.meshes) {
                    if (mesh.material instanceof PBRMaterial) materials.add(mesh.material);
                }
                this.importedPaintMaterials.length = 0;
                for (const material of materials) {
                    const name = material.name.toLowerCase();
                    material.maxSimultaneousLights = 6;
                    if (name.includes(model.paintMaterial.toLowerCase())) {
                        // Grab3D body textures carry their authored paint and trim.
                        // Keep the texture colours instead of multiplying a tint over them.
                        material.albedoColor = Color3.White();
                        material.metallic = 0.72;
                        material.roughness = 0.22;
                        material.clearCoat.isEnabled = true;
                        material.clearCoat.intensity = 1;
                        material.clearCoat.roughness = 0.045;
                        material.clearCoat.indexOfRefraction = 1.52;
                        material.environmentIntensity = 1.2;
                    } else if (name.includes("window_glass")) {
                        material.albedoColor = new Color3(0.045, 0.06, 0.072);
                        material.metallic = 0.12;
                        material.roughness = 0.035;
                        material.alpha = 0.45;
                        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
                        material.backFaceCulling = false;
                        material.environmentIntensity = 1.55;
                        material.indexOfRefraction = 1.5;
                    } else if (name.includes("tire")) {
                        material.metallic = 0;
                        material.roughness = 0.95;
                        material.environmentIntensity = 0.4;
                        material.clearCoat.isEnabled = false;
                    } else if (name.includes("hubcap")) {
                        material.albedoColor = new Color3(0.6, 0.62, 0.64);
                        material.metallic = 0.55;
                        material.roughness = 0.3;
                        material.environmentIntensity = 1.1;
                    } else if (name.includes("_rim")) {
                        material.albedoColor = new Color3(0.72, 0.75, 0.78);
                        material.metallic = 0.95;
                        material.roughness = 0.16;
                        material.environmentIntensity = 1.35;
                        material.clearCoat.isEnabled = true;
                        material.clearCoat.intensity = 0.5;
                        material.clearCoat.roughness = 0.1;
                    } else if (name.includes("trim_charcoal")) {
                        material.albedoColor = new Color3(0.032, 0.034, 0.04);
                        material.metallic = 0.25;
                        material.roughness = 0.42;
                        material.environmentIntensity = 1;
                        material.clearCoat.isEnabled = true;
                        material.clearCoat.intensity = 0.4;
                        material.clearCoat.roughness = 0.22;
                    } else if (name.includes("trim_white")) {
                        material.albedoColor = new Color3(0.9, 0.89, 0.86);
                        material.metallic = 0.05;
                        material.roughness = 0.32;
                        material.environmentIntensity = 1.1;
                    } else if (
                        name.includes("light") ||
                        name.includes("lamp") ||
                        name.includes("lens")
                    ) {
                        material.metallic = 0.1;
                        material.roughness = 0.12;
                        material.clearCoat.isEnabled = true;
                        material.clearCoat.intensity = 1;
                        material.emissiveColor = new Color3(0.5, 0.48, 0.42);
                        material.emissiveIntensity = 0.6;
                        material.environmentIntensity = 1.3;
                    } else if (name.includes("paint_")) {
                        material.metallic = 0.6;
                        material.roughness = 0.25;
                        material.clearCoat.isEnabled = true;
                        material.clearCoat.intensity = 0.8;
                        material.clearCoat.roughness = 0.08;
                        material.environmentIntensity = 1.15;
                    } else if (name.includes("charge_port_ring")) {
                        material.emissiveColor = new Color3(0.12, 0.55, 0.42);
                        material.emissiveIntensity = 1.2;
                        material.roughness = 0.25;
                    }
                }

                this.importedWheels = wheelEntries;
                this.importedCar = root;
                this.importedModelId = model.id;
                this.usingImportedCar = true;
                this.carAssetPending = false;
                this.exteriorCabin.setEnabled(false);
                for (const mesh of this.exteriorMeshes) mesh.setEnabled(false);
                root.setEnabled(this.lastCameraMode !== "cockpit");
                this.scene.getEngine().resize();
            })
            .catch((error: unknown) => {
                if (token !== this.carLoadToken) return;
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
        interior: PBRMaterial,
        seatMaterial: PBRMaterial,
        carpet: PBRMaterial,
        chrome: PBRMaterial,
    ): void {
        const leather = this.material("cockpit-leather", "#2a2523", 0.04, 0.5);
        leather.clearCoat.isEnabled = true;
        leather.clearCoat.intensity = 0.35;
        leather.clearCoat.roughness = 0.38;
        leather.albedoColor.scaleInPlace(0.55);
        leather.emissiveColor = new Color3(0.014, 0.011, 0.009);
        const softTrim = this.material("cockpit-soft-trim", "#33373b", 0.06, 0.62);
        softTrim.albedoColor.scaleInPlace(0.6);
        softTrim.emissiveColor = new Color3(0.012, 0.013, 0.015);
        const headliner = this.material("cockpit-headliner", "#2f3337", 0.02, 0.88);
        headliner.albedoColor.scaleInPlace(0.62);
        headliner.emissiveColor = new Color3(0.02, 0.021, 0.024);
        const brushedMetal = this.material("cockpit-brushed-metal", "#8b9197", 1, 0.32);
        const rubber = this.material("cockpit-rubber", "#141619", 0.02, 0.8);
        brushedMetal.albedoColor.scaleInPlace(0.8);
        rubber.albedoColor.scaleInPlace(0.2);
        leather.environmentIntensity = 0.35;
        softTrim.environmentIntensity = 0.4;
        headliner.environmentIntensity = 0.5;
        brushedMetal.environmentIntensity = 1.05;
        rubber.environmentIntensity = 0.3;

        const leatherGrain = new DynamicTexture(
            "cockpit-leather-grain",
            { width: 256, height: 256 },
            this.scene,
            true,
        );
        const grainContext = leatherGrain.getContext() as unknown as CanvasRenderingContext2D;
        grainContext.fillStyle = "#c8c8c8";
        grainContext.fillRect(0, 0, 256, 256);
        let grainSeed = 7331;
        for (let index = 0; index < 5200; index += 1) {
            grainSeed = (grainSeed * 1664525 + 1013904223) >>> 0;
            const shade = 170 + Math.floor((grainSeed / 4294967296) * 70);
            grainContext.fillStyle = `rgba(${shade},${shade},${shade},0.28)`;
            grainContext.fillRect((grainSeed >>> 8) % 256, (grainSeed >>> 16) % 256, 2, 1);
        }
        grainContext.strokeStyle = "rgba(150,150,150,0.3)";
        grainContext.lineWidth = 1;
        for (let line = 0; line < 8; line += 1) {
            grainContext.beginPath();
            grainContext.moveTo(0, line * 32);
            grainContext.lineTo(256, line * 32);
            grainContext.stroke();
        }
        leatherGrain.update(false);
        leatherGrain.uScale = 4;
        leatherGrain.vScale = 4;
        leatherGrain.wrapU = Texture.WRAP_ADDRESSMODE;
        leatherGrain.wrapV = Texture.WRAP_ADDRESSMODE;
        leather.albedoTexture = leatherGrain;
        softTrim.albedoTexture = leatherGrain;
        seatMaterial.albedoTexture = leatherGrain;
        const stitchMaterial = this.material("cockpit-stitch", "#b8a37d", 0, 0.9);
        stitchMaterial.emissiveColor = new Color3(0.05, 0.042, 0.03);
        const wheelLeather = this.material("cockpit-wheel-leather", "#463a34", 0.03, 0.46);
        wheelLeather.clearCoat.isEnabled = true;
        wheelLeather.clearCoat.intensity = 0.55;
        wheelLeather.clearCoat.roughness = 0.28;
        wheelLeather.albedoColor.scaleInPlace(0.62);
        wheelLeather.albedoTexture = leatherGrain;
        for (const material of [
            leather,
            softTrim,
            headliner,
            rubber,
            trim,
            interior,
            seatMaterial,
            carpet,
            chrome,
        ]) {
            material.maxSimultaneousLights = 8;
        }

        const ambientStripMaterial = new StandardMaterial("cockpit-ambient-strip", this.scene);
        ambientStripMaterial.diffuseColor = Color3.Black();
        ambientStripMaterial.specularColor = Color3.Black();
        ambientStripMaterial.emissiveColor = new Color3(0.85, 0.42, 0.16);
        ambientStripMaterial.disableLighting = true;

        const screenMaterial = new StandardMaterial("cockpit-display", this.scene);
        const screenTexture = new DynamicTexture(
            "cockpit-display-texture",
            { width: 512, height: 320 },
            this.scene,
            true,
        );
        const screenContext = screenTexture.getContext();
        const screenGradient = screenContext.createLinearGradient(0, 0, 0, 320);
        screenGradient.addColorStop(0, "#0d1a24");
        screenGradient.addColorStop(1, "#050a0e");
        screenContext.fillStyle = screenGradient;
        screenContext.fillRect(0, 0, 512, 320);
        screenContext.fillStyle = "rgba(90, 190, 220, 0.16)";
        screenContext.fillRect(0, 44, 512, 2);
        screenContext.fillStyle = "#dfe9ee";
        screenContext.font = '600 30px "Noto Sans"';
        screenContext.fillText("Bite Point", 26, 34);
        screenContext.fillStyle = "#6f8794";
        screenContext.font = '400 17px "Noto Sans"';
        screenContext.fillText("Drive mode  /  Sport", 300, 32);
        for (let index = 0; index < 6; index += 1) {
            const height = 26 + ((index * 37) % 74);
            screenContext.fillStyle = index < 4 ? "#5fc0df" : "#2c4a59";
            screenContext.fillRect(40 + index * 46, 236 - height, 26, height);
        }
        screenContext.fillStyle = "#a8bcc7";
        screenContext.font = '500 18px "Noto Sans"';
        screenContext.fillText("21.5 C", 360, 132);
        screenContext.fillText("Trip  128.4 km", 360, 172);
        screenContext.fillText("Range 412 km", 360, 212);
        screenContext.fillStyle = "#e8b04b";
        screenContext.fillRect(360, 240, 108, 4);
        screenTexture.update(false);
        screenTexture.hasAlpha = false;
        screenMaterial.diffuseTexture = screenTexture;
        screenMaterial.emissiveTexture = screenTexture;
        screenMaterial.emissiveColor = new Color3(0.72, 0.78, 0.82);
        screenMaterial.diffuseColor = Color3.White();
        screenMaterial.specularColor = new Color3(0.05, 0.06, 0.07);
        screenMaterial.maxSimultaneousLights = 8;

        const needleMaterial = new StandardMaterial("cockpit-needle", this.scene);
        needleMaterial.diffuseColor = Color3.Black();
        needleMaterial.specularColor = Color3.Black();
        needleMaterial.emissiveColor = new Color3(1, 0.32, 0.14);
        needleMaterial.disableLighting = true;
        const speedNeedleMaterial = new StandardMaterial("cockpit-speed-needle", this.scene);
        speedNeedleMaterial.diffuseColor = Color3.Black();
        speedNeedleMaterial.specularColor = Color3.Black();
        speedNeedleMaterial.emissiveColor = new Color3(1, 0.62, 0.22);
        speedNeedleMaterial.disableLighting = true;

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

        // Lower cabin shell. The camera sits at 1.20 m, above the seat cushion and
        // below the roof, with the dash top well under the eye line.
        addBox("cockpit-floor", 1.42, 0.035, 1.55, 0, 0.22, 0.0, carpet);
        addBox("driver-footwell", 0.58, 0.02, 0.62, -0.36, 0.25, 0.38, carpet);
        addBox("passenger-footwell", 0.58, 0.02, 0.62, 0.42, 0.25, 0.38, carpet);
        addBox("transmission-tunnel", 0.26, 0.18, 1.35, 0.02, 0.36, -0.18, carpet);
        addBox("centre-console", 0.24, 0.22, 0.72, 0.02, 0.52, -0.03, interior);
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
            new Vector3(-0.04, 1.18, 0.02),
            this.scene,
        );
        cabinLamp.parent = this.cockpitGroup;
        cabinLamp.diffuse = new Color3(1, 0.87, 0.71);
        cabinLamp.specular = new Color3(1, 0.85, 0.68);
        cabinLamp.intensity = 0.72;
        cabinLamp.range = 3.6;
        this.cockpitLight = cabinLamp;

        const roofLampMaterial = new StandardMaterial("cockpit-roof-lamp", this.scene);
        roofLampMaterial.diffuseColor = Color3.Black();
        roofLampMaterial.specularColor = Color3.Black();
        roofLampMaterial.emissiveColor = new Color3(1, 0.85, 0.62);
        roofLampMaterial.disableLighting = true;

        // Main dashboard: a low, deep shelf rather than a vertical slab.
        addBox("dashboard-lower", 1.4, 0.2, 0.18, 0, 0.74, 0.52, leather);
        addBox("dashboard-main", 1.46, 0.16, 0.4, 0, 0.85, 0.7, leather);
        addBox("dashboard-top", 1.48, 0.045, 0.5, 0, 0.93, 0.69, leather).rotation.x = -0.035;
        addBox("dashboard-cowl", 1.42, 0.035, 0.16, 0, 0.945, 0.89, softTrim).rotation.x = -0.08;
        addBox("dash-chrome-rule", 1.24, 0.012, 0.02, 0.0, 0.895, 0.492, brushedMetal);
        addBox("dash-ambient-strip", 1.16, 0.006, 0.012, 0.02, 0.885, 0.4915, ambientStripMaterial);
        addBox("dash-passenger-trim", 0.46, 0.03, 0.02, 0.36, 0.892, 0.492, softTrim);
        addBox("dash-stitch", 1.28, 0.005, 0.006, 0, 0.955, 0.62, stitchMaterial);
        const dashRoll = CreateCylinder(
            "dashboard-roll",
            { diameter: 0.075, height: 1.43, tessellation: 18 },
            this.scene,
        );
        dashRoll.rotation.z = Math.PI / 2;
        dashRoll.position.set(0, 0.925, 0.9);
        dashRoll.material = leather;
        dashRoll.parent = this.cockpitGroup;
        dashRoll.isPickable = false;
        const binnacleHood = CreateCylinder(
            "binnacle-hood",
            { diameter: 0.17, height: 0.56, tessellation: 20 },
            this.scene,
        );
        binnacleHood.rotation.z = Math.PI / 2;
        binnacleHood.position.set(-0.36, 1.07, 0.6);
        binnacleHood.scaling.z = 0.82;
        binnacleHood.material = leather;
        binnacleHood.parent = this.cockpitGroup;
        binnacleHood.isPickable = false;
        addBox("glovebox-seam", 0.42, 0.004, 0.006, 0.39, 0.82, 0.493, brushedMetal);
        addBox("glovebox-handle", 0.11, 0.025, 0.018, 0.39, 0.85, 0.486, brushedMetal);
        const mirror = addBox("rear-view-mirror", 0.21, 0.07, 0.024, 0.03, 1.34, 0.49, softTrim);
        mirror.rotation.x = -0.08;
        addBox("rear-view-stem", 0.014, 0.07, 0.014, 0.03, 1.39, 0.5, brushedMetal);
        addBox("centre-stack", 0.22, 0.3, 0.1, 0.03, 0.7, 0.4, softTrim);
        addBox("centre-stack-stitch", 0.19, 0.004, 0.004, 0.03, 0.83, 0.348, stitchMaterial);
        for (const x of [-0.025, 0.085]) {
            const dial = CreateCylinder(
                "climate-dial",
                { diameter: 0.055, height: 0.022, tessellation: 20 },
                this.scene,
            );
            dial.rotation.x = Math.PI / 2;
            dial.position.set(x, 0.65, 0.347);
            dial.material = brushedMetal;
            dial.parent = this.cockpitGroup;
            dial.isPickable = false;
        }

        for (const x of [-0.61, -0.45, 0.18, 0.34]) {
            const vent = addBox("dash-vent", 0.085, 0.05, 0.02, x, 0.925, 0.492, leather);
            vent.rotation.x = -0.1;
            addBox("dash-vent-slat", 0.072, 0.005, 0.006, x, 0.934, 0.481, brushedMetal);
            addBox("dash-vent-slat", 0.072, 0.005, 0.006, x, 0.916, 0.481, brushedMetal);
        }

        const binnacle = addBox("driver-binnacle", 0.53, 0.07, 0.3, -0.36, 1.06, 0.6, leather);
        binnacle.rotation.x = -0.14;

        const gaugeTilt = new TransformNode("gauge-tilt", this.scene);
        gaugeTilt.parent = this.cockpitGroup;
        gaugeTilt.position.set(-0.36, 1.055, 0.56);
        gaugeTilt.rotation.x = -0.17;
        const tachMaterial = this.createDialMaterial(
            "gauge-tach",
            this.createDialTexture(
                "gauge-tach-texture",
                this.tachMaxRpm / 1000,
                "rpm x1000",
                Math.min(0.95, this.config.engine.redlineRpm / this.tachMaxRpm),
            ),
        );
        this.tachDialMaterial = tachMaterial;
        const speedMaterial = this.createDialMaterial(
            "gauge-speed",
            this.createDialTexture("gauge-speed-texture", this.speedoMaxKph, "km/h", 0.82),
        );
        this.speedDialMaterial = speedMaterial;
        const dials: Array<{
            name: string;
            offset: number;
            face: StandardMaterial;
            needle: StandardMaterial;
        }> = [
            { name: "tach", offset: -0.088, face: tachMaterial, needle: needleMaterial },
            { name: "speed", offset: 0.088, face: speedMaterial, needle: speedNeedleMaterial },
        ];
        for (const dial of dials) {
            const bezel = CreateTorus(
                `gauge-bezel-${dial.name}`,
                { diameter: 0.152, thickness: 0.01, tessellation: 28 },
                this.scene,
            );
            bezel.rotation.x = Math.PI / 2;
            bezel.position.set(dial.offset, 0, 0.002);
            bezel.material = brushedMetal;
            bezel.parent = gaugeTilt;
            bezel.isPickable = false;
            const face = this.createPanel(
                `gauge-face-${dial.name}`,
                0.14,
                0.14,
                dial.face,
                gaugeTilt,
            );
            face.position.set(dial.offset, 0, 0.008);
            const needlePivot = new TransformNode(`gauge-needle-${dial.name}`, this.scene);
            needlePivot.parent = gaugeTilt;
            needlePivot.position.set(dial.offset, 0, 0.013);
            needlePivot.rotation.z = 2.4;
            const needle = CreateBox(
                `gauge-needle-mesh-${dial.name}`,
                { width: 0.005, height: 0.058, depth: 0.003 },
                this.scene,
            );
            needle.position.y = 0.027;
            needle.material = dial.needle;
            needle.parent = needlePivot;
            needle.isPickable = false;
            if (dial.name === "tach") this.tachNeedleNode = needlePivot;
            else this.speedNeedleNode = needlePivot;
        }

        addBox("infotainment-bezel", 0.34, 0.2, 0.024, 0.04, 0.865, 0.478, softTrim).rotation.x =
            -0.12;
        const infoScreen = this.createPanel(
            "infotainment-screen",
            0.3,
            0.17,
            screenMaterial,
            this.cockpitGroup,
        );
        infoScreen.position.set(0.04, 0.865, 0.4645);
        infoScreen.rotation.x = -0.12;
        addBox("hazard-button", 0.05, 0.022, 0.012, 0.04, 0.78, 0.465, this.brakeLightMaterial);
        addBox("start-button", 0.032, 0.032, 0.012, 0.19, 0.8, 0.466, chrome).rotation.z = 0.1;

        // Screen surround and windshield frame. These establish the cabin volume.
        addBox("windshield-header", 1.27, 0.022, 0.07, 0, 1.428, 0.35, headliner);
        addBox("headliner", 1.25, 0.025, 1.4, 0, 1.443, -0.38, headliner);
        addBox("roof-console", 0.24, 0.028, 0.12, 0, 1.421, 0.16, headliner);
        addBox("roof-lamp-left", 0.06, 0.006, 0.045, -0.05, 1.404, 0.16, roofLampMaterial);
        addBox("roof-lamp-right", 0.06, 0.006, 0.045, 0.05, 1.404, 0.16, roofLampMaterial);
        for (const side of [-1, 1]) {
            addBox(
                `windshield-pillar-${side}`,
                0.026,
                0.47,
                0.04,
                side * 0.68,
                1.225,
                0.535,
                softTrim,
            ).rotation.x = -0.68;
            addBox(`window-sill-${side}`, 0.05, 0.035, 1.45, side * 0.705, 1.005, -0.22, softTrim);
            addBox(`door-card-${side}`, 0.06, 0.5, 1.35, side * 0.72, 0.72, -0.22, leather);
            addBox(`door-armrest-${side}`, 0.14, 0.06, 0.44, side * 0.655, 0.82, -0.24, softTrim);
            addBox(`door-handle-${side}`, 0.08, 0.018, 0.12, side * 0.69, 0.92, 0.18, brushedMetal);
            addBox(
                `door-trim-${side}`,
                0.014,
                0.016,
                1.06,
                side * 0.688,
                0.782,
                -0.26,
                brushedMetal,
            );
            const speaker = CreateTorus(
                `door-speaker-${side}`,
                { diameter: 0.15, thickness: 0.011, tessellation: 24 },
                this.scene,
            );
            speaker.rotation.z = Math.PI / 2;
            speaker.position.set(side * 0.694, 0.6, -0.24);
            speaker.material = brushedMetal;
            speaker.parent = this.cockpitGroup;
            speaker.isPickable = false;
            addBox(`b-pillar-trim-${side}`, 0.04, 0.4, 0.055, side * 0.68, 1.18, -0.68, softTrim);
            addBox(`sun-visor-${side}`, 0.42, 0.02, 0.16, side * 0.35, 1.4, 0.2, headliner);
        }

        // Seats sit below the eye line and behind the driver, not in the sight line.
        for (const [side, x] of [
            ["driver", -0.36],
            ["passenger", 0.42],
        ] as Array<[string, number]>) {
            addBox(`${side}-seat-base`, 0.49, 0.13, 0.5, x, 0.46, -0.35, seatMaterial);
            addBox(`${side}-seat-thigh`, 0.47, 0.08, 0.18, x, 0.5, -0.1, seatMaterial);
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
            const shoulder = addBox(
                `${side}-seat-shoulder`,
                0.44,
                0.2,
                0.13,
                x,
                0.98,
                -0.75,
                seatMaterial,
            );
            shoulder.rotation.x = 0.12;
            addBox(`${side}-headrest`, 0.26, 0.21, 0.115, x, 1.1, -0.775, seatMaterial);
            addBox(
                `${side}-headrest-post`,
                0.016,
                0.09,
                0.016,
                x - 0.07,
                1.0,
                -0.775,
                brushedMetal,
            );
            addBox(
                `${side}-headrest-post`,
                0.016,
                0.09,
                0.016,
                x + 0.07,
                1.0,
                -0.775,
                brushedMetal,
            );
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
            addBox(
                `${side}-seat-stitch-left`,
                0.008,
                0.4,
                0.014,
                x - 0.17,
                0.73,
                -0.79,
                stitchMaterial,
            ).rotation.x = 0.12;
            addBox(
                `${side}-seat-stitch-right`,
                0.008,
                0.4,
                0.014,
                x + 0.17,
                0.73,
                -0.79,
                stitchMaterial,
            ).rotation.x = 0.12;
            addBox(`${side}-headrest-stitch`, 0.018, 0.18, 0.01, x, 1.1, -0.72, stitchMaterial);
            addBox(
                `${side}-seatbelt`,
                0.05,
                0.5,
                0.012,
                x + 0.16,
                0.82,
                -0.73,
                softTrim,
            ).rotation.z = 0.08;
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
        plaidMaterial.roughness = 0.92;
        plaidMaterial.environmentIntensity = 0.9;
        plaidMaterial.maxSimultaneousLights = 8;
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
        wheelPivot.position.set(-0.36, 0.9, 0.34);
        wheelPivot.rotation.x = -0.42;
        const steeringSpin = new TransformNode("steering-spin", this.scene);
        steeringSpin.parent = wheelPivot;
        this.steeringSpinNode = steeringSpin;
        const column = CreateCylinder(
            "steering-column",
            { diameter: 0.05, height: 0.3, tessellation: 14 },
            this.scene,
        );
        column.rotation.x = Math.PI / 2;
        column.position.set(-0.36, 0.86, 0.47);
        column.material = softTrim;
        column.parent = this.cockpitGroup;
        column.isPickable = false;
        const wheel = CreateTorus(
            "steering-wheel",
            { diameter: 0.36, thickness: 0.042, tessellation: 48 },
            this.scene,
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.material = wheelLeather;
        wheel.parent = steeringSpin;
        wheel.isPickable = false;
        const rimStitch = CreateTorus(
            "steering-rim-stitch",
            { diameter: 0.363, thickness: 0.007, tessellation: 48 },
            this.scene,
        );
        rimStitch.rotation.x = Math.PI / 2;
        rimStitch.position.z = 0.022;
        rimStitch.material = stitchMaterial;
        rimStitch.parent = steeringSpin;
        rimStitch.isPickable = false;
        for (const angle of [0.04, Math.PI - 0.04, Math.PI * 1.5]) {
            const spoke = CreateCylinder(
                "steering-spoke",
                { diameter: 0.026, height: 0.145, tessellation: 12 },
                this.scene,
            );
            spoke.rotation.z = angle - Math.PI / 2;
            spoke.position.set(Math.cos(angle) * 0.085, Math.sin(angle) * 0.085, 0.004);
            spoke.material = brushedMetal;
            spoke.parent = steeringSpin;
            spoke.isPickable = false;
        }
        const hub = CreateCylinder(
            "steering-hub",
            { diameter: 0.112, height: 0.048, tessellation: 28 },
            this.scene,
        );
        hub.rotation.x = Math.PI / 2;
        hub.material = wheelLeather;
        hub.parent = steeringSpin;
        hub.isPickable = false;
        const hubBadge = CreateCylinder(
            "steering-badge",
            { diameter: 0.05, height: 0.008, tessellation: 24 },
            this.scene,
        );
        hubBadge.rotation.x = Math.PI / 2;
        hubBadge.position.z = 0.026;
        hubBadge.material = brushedMetal;
        hubBadge.parent = steeringSpin;
        hubBadge.isPickable = false;
        for (const side of [-1, 1]) {
            addBox(
                "steering-horn",
                0.035,
                0.026,
                0.012,
                -0.36 + side * 0.048,
                0.878,
                0.31,
                softTrim,
            );
        }
        const columnShroud = CreateCylinder(
            "steering-shroud",
            { diameterTop: 0.06, diameterBottom: 0.115, height: 0.26, tessellation: 18 },
            this.scene,
        );
        columnShroud.rotation.x = Math.PI / 2;
        columnShroud.position.set(-0.36, 0.845, 0.465);
        columnShroud.material = softTrim;
        columnShroud.parent = this.cockpitGroup;
        columnShroud.isPickable = false;
        addBox("stalk-left", 0.13, 0.018, 0.02, -0.48, 0.875, 0.42, softTrim);
        addBox("stalk-left-cap", 0.018, 0.028, 0.028, -0.545, 0.875, 0.42, brushedMetal);
        addBox("stalk-right", 0.11, 0.018, 0.02, -0.24, 0.845, 0.42, softTrim);
        addBox("stalk-right-cap", 0.018, 0.028, 0.028, -0.188, 0.845, 0.42, brushedMetal);

        const leverBoot = CreateCylinder(
            "gear-boot",
            { diameterTop: 0.058, diameterBottom: 0.15, height: 0.11, tessellation: 16 },
            this.scene,
        );
        leverBoot.position.set(this.leverBase.x, this.leverBase.y - 0.045, this.leverBase.z);
        leverBoot.material = leather;
        leverBoot.parent = this.cockpitGroup;
        const arm = CreateCylinder(
            "gear-lever-arm",
            { diameter: 0.022, height: 1, tessellation: 10 },
            this.scene,
        );
        arm.material = brushedMetal;
        arm.parent = this.cockpitGroup;
        arm.isPickable = false;
        const knob = CreateSphere("gear-knob", { diameter: 0.07, segments: 18 }, this.scene);
        knob.material = leather;
        knob.parent = this.cockpitGroup;
        knob.isPickable = false;
        const knobCollar = CreateCylinder(
            "gear-knob-collar",
            { diameterTop: 0.038, diameterBottom: 0.032, height: 0.035, tessellation: 16 },
            this.scene,
        );
        knobCollar.position.y = -0.035;
        knobCollar.material = brushedMetal;
        knobCollar.parent = knob;
        knobCollar.isPickable = false;

        const handbrakePivot = new TransformNode("handbrake-pivot", this.scene);
        handbrakePivot.parent = this.cockpitGroup;
        handbrakePivot.position.set(0.25, 0.5, 0.04);
        handbrakePivot.rotation.x = -0.18;
        this.handbrakePivot = handbrakePivot;
        const handbrakeBoot = CreateCylinder(
            "handbrake-boot",
            { diameterTop: 0.03, diameterBottom: 0.09, height: 0.07, tessellation: 14 },
            this.scene,
        );
        handbrakeBoot.position.y = 0.02;
        handbrakeBoot.material = leather;
        handbrakeBoot.parent = handbrakePivot;
        handbrakeBoot.isPickable = false;
        const handbrakeShaft = CreateCylinder(
            "handbrake-shaft",
            { diameter: 0.016, height: 0.18, tessellation: 12 },
            this.scene,
        );
        handbrakeShaft.position.y = 0.11;
        handbrakeShaft.material = brushedMetal;
        handbrakeShaft.parent = handbrakePivot;
        handbrakeShaft.isPickable = false;
        const handbrakeGrip = CreateCylinder(
            "handbrake-grip",
            { diameterTop: 0.026, diameterBottom: 0.033, height: 0.11, tessellation: 16 },
            this.scene,
        );
        handbrakeGrip.position.y = 0.215;
        handbrakeGrip.material = rubber;
        handbrakeGrip.parent = handbrakePivot;
        handbrakeGrip.isPickable = false;
        const handbrakeButton = CreateCylinder(
            "handbrake-button",
            { diameter: 0.014, height: 0.022, tessellation: 12 },
            this.scene,
        );
        handbrakeButton.position.set(0, 0.272, 0.006);
        handbrakeButton.material = chrome;
        handbrakeButton.parent = handbrakePivot;
        handbrakeButton.isPickable = false;

        const pedalPositions: Array<[string, number, PBRMaterial | StandardMaterial]> = [
            ["clutch", -0.55, brushedMetal],
            ["brake", -0.44, brushedMetal],
            ["throttle", -0.33, brushedMetal],
        ];
        for (const [name, x, material] of pedalPositions) {
            const pedal = CreateBox(
                `pedal-${name}`,
                { width: 0.078, height: 0.135, depth: 0.026 },
                this.scene,
            );
            pedal.position.set(x, 0.29, 0.42);
            pedal.rotation.x = -0.35;
            pedal.material = material;
            pedal.parent = this.cockpitGroup;
            pedal.isPickable = false;
            for (const offset of [-0.036, 0, 0.036]) {
                const grip = CreateBox(
                    `pedal-grip-${name}`,
                    { width: 0.062, height: 0.009, depth: 0.009 },
                    this.scene,
                );
                grip.position.set(0, offset, 0.015);
                grip.material = rubber;
                grip.parent = pedal;
                grip.isPickable = false;
            }
            this.pedalMeshes.push({ mesh: pedal, baseY: 0.29, baseRotation: -0.35 });
        }
        const deadPedal = CreateBox(
            "dead-pedal",
            { width: 0.1, height: 0.17, depth: 0.024 },
            this.scene,
        );
        deadPedal.position.set(-0.65, 0.31, 0.44);
        deadPedal.rotation.x = -0.35;
        deadPedal.rotation.z = 0.12;
        deadPedal.material = brushedMetal;
        deadPedal.parent = this.cockpitGroup;
        deadPedal.isPickable = false;
        for (const offset of [-0.045, 0, 0.045]) {
            const grip = CreateBox(
                "dead-pedal-grip",
                { width: 0.08, height: 0.009, depth: 0.009 },
                this.scene,
            );
            grip.position.set(0, offset, 0.014);
            grip.material = rubber;
            grip.parent = deadPedal;
            grip.isPickable = false;
        }

        // Even fill so the cabin reads without the sun (which is blocked by the roof).
        const cockpitFill = new DirectionalLight(
            "cockpit-fill",
            new Vector3(0.25, -0.9, 0.3),
            this.scene,
        );
        cockpitFill.diffuse = new Color3(1, 0.94, 0.86);
        cockpitFill.specular = new Color3(0.5, 0.47, 0.42);
        cockpitFill.intensity = 1.6;
        cockpitFill.includedOnlyMeshes = this.cockpitGroup.getChildMeshes();
    }

    private createPanel(
        name: string,
        width: number,
        height: number,
        material: StandardMaterial,
        parent: TransformNode,
    ): Mesh {
        const mesh = new Mesh(name, this.scene);
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const positions = [
            -halfWidth,
            halfHeight,
            0,
            halfWidth,
            halfHeight,
            0,
            halfWidth,
            -halfHeight,
            0,
            -halfWidth,
            -halfHeight,
            0,
        ];
        const indices = [0, 1, 2, 0, 2, 3];
        const uvs = [0, 1, 1, 1, 1, 0, 0, 0];
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
        return mesh;
    }

    private createDialMaterial(name: string, texture: DynamicTexture): StandardMaterial {
        const material = new StandardMaterial(name, this.scene);
        material.diffuseTexture = texture;
        material.emissiveTexture = texture;
        material.diffuseColor = Color3.White();
        material.emissiveColor = new Color3(0.85, 0.88, 0.9);
        material.specularColor = Color3.Black();
        material.useAlphaFromDiffuseTexture = true;
        material.backFaceCulling = false;
        return material;
    }

    private createDialTexture(
        name: string,
        maxValue: number,
        label: string,
        redlineFraction: number,
    ): DynamicTexture {
        const size = 256;
        const texture = new DynamicTexture(name, { width: size, height: size }, this.scene, true);
        const context = texture.getContext();
        const textContext = context as unknown as CanvasRenderingContext2D;
        textContext.textAlign = "center";
        textContext.textBaseline = "middle";
        const cx = size / 2;
        const cy = size / 2;
        const radius = size / 2 - 5;
        context.clearRect(0, 0, size, size);
        const face = context.createRadialGradient(cx, cy - 34, 10, cx, cy, radius);
        face.addColorStop(0, "#3a4147");
        face.addColorStop(0.68, "#1b1f23");
        face.addColorStop(1, "#080a0c");
        context.beginPath();
        context.arc(cx, cy, radius, 0, Math.PI * 2);
        context.fillStyle = face;
        context.fill();
        context.lineWidth = 5;
        context.strokeStyle = "#8f969d";
        context.beginPath();
        context.arc(cx, cy, radius - 2, 0, Math.PI * 2);
        context.stroke();

        const pointAt = (fraction: number, r: number): [number, number] => {
            const angle = Math.PI / 2 + 2.4 - 4.8 * fraction;
            return [cx + Math.cos(angle) * r, cy - Math.sin(angle) * r];
        };
        const majorCount = 6;
        const minorPerMajor = 5;
        const tickCount = majorCount * minorPerMajor;
        for (let index = 0; index <= tickCount; index += 1) {
            const fraction = index / tickCount;
            const major = index % minorPerMajor === 0;
            const inner = pointAt(fraction, radius - (major ? 28 : 20));
            const outer = pointAt(fraction, radius - 9);
            context.beginPath();
            context.moveTo(inner[0], inner[1]);
            context.lineTo(outer[0], outer[1]);
            context.lineWidth = major ? 4 : 2;
            context.strokeStyle = major ? "#e2e5e7" : "#889097";
            context.stroke();
        }
        for (let major = 0; major <= majorCount; major += 1) {
            const fraction = major / majorCount;
            const [x, y] = pointAt(fraction, radius - 48);
            context.fillStyle = "#e8ebed";
            context.font = '600 25px "Noto Sans"';
            context.fillText(String(Math.round(maxValue * fraction)), x, y);
        }
        context.beginPath();
        for (let step = 0; step <= 20; step += 1) {
            const fraction = redlineFraction + (1 - redlineFraction) * (step / 20);
            const [x, y] = pointAt(fraction, radius - 12);
            if (step === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        }
        context.lineWidth = 7;
        context.strokeStyle = "#c8331d";
        context.stroke();
        context.fillStyle = "#8d959c";
        context.font = '500 16px "Noto Sans"';
        context.fillText(label, cx, cy + 54);
        context.fillStyle = "#0b0d0f";
        context.beginPath();
        context.arc(cx, cy, 12, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#9aa1a8";
        context.lineWidth = 3;
        context.stroke();
        texture.update(false);
        texture.hasAlpha = true;
        return texture;
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

    private updateHandbrake(state: VehicleRenderState): void {
        if (!this.handbrakePivot) return;
        this.handbrakePivot.rotation.x = -0.18 - (state.handbrake ? 1 : 0) * 0.42;
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
            const on = this.headlightsOn && this.lastCameraMode !== "cockpit";
            light.setEnabled(on);
            light.intensity = on ? 90 : 0;
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
