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
  Mesh,
  PBRMaterial,
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
import type { UserSettings } from "../settings/SettingsRepository";
import { CockpitController, type CameraMode } from "./CockpitController";
import { EnvironmentBuilder } from "./EnvironmentBuilder";

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
  private adaptiveLevel = 0;
  private lastSettings: UserSettings;
  private pipeline: DefaultRenderingPipeline | null = null;
  private readonly carRoot: TransformNode;
  private readonly exteriorCabin: TransformNode;
  private readonly cockpitGroup: TransformNode;
  private readonly exteriorMeshes: AbstractMesh[] = [];
  private readonly wheels: WheelVisual[] = [];
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
  ) {
    this.lastSettings = settings;
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, adaptToDeviceRatio: true }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString("#a9c0d2ff");
    this.scene.ambientColor = new Color3(0.3, 0.32, 0.35);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0038;
    this.scene.fogColor = new Color3(0.72, 0.8, 0.86);
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.imageProcessingConfiguration.exposure = 0.84;
    this.scene.imageProcessingConfiguration.contrast = 1.14;

    this.environment = new EnvironmentBuilder(this.scene, road);
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
    const cockpitMeshes = new Set(this.cockpitGroup.getChildMeshes());
    for (const mesh of this.carRoot.getChildMeshes()) {
      if (!cockpitMeshes.has(mesh)) this.exteriorMeshes.push(mesh);
    }
    this.leverArm = this.scene.getMeshByName("gear-lever-arm") as Mesh;
    this.leverKnob = this.scene.getMeshByName("gear-knob") as Mesh;
    this.wiperPivot = this.carRoot.getChildTransformNodes().find((node) => node.name === "wiper-pivot") as TransformNode;

    this.cockpit = new CockpitController(this.scene, this.carRoot, this.config);
    this.pipeline = new DefaultRenderingPipeline("post-pipeline", true, this.scene, [this.cockpit.camera]);
    this.pipeline.fxaaEnabled = true;
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomThreshold = 0.92;
    this.pipeline.bloomWeight = 0.12;
    this.pipeline.bloomKernel = 32;
    this.pipeline.sharpenEnabled = false;
    this.applySettings(settings);
    this.setCameraMode("cockpit");
    this.resizeHandler = () => this.engine.resize();
    window.addEventListener("resize", this.resizeHandler);
  }

  get cameraMode(): CameraMode {
    return this.lastCameraMode;
  }

  get cameraModeLabel(): string {
    return this.lastCameraMode === "cockpit" ? "Cockpit" : this.lastCameraMode === "hood" ? "Hood" : "Exterior";
  }

  applySettings(settings: UserSettings): void {
    this.lastSettings = settings;
    const adaptiveScale = this.adaptiveLevel === 0 ? 1 : this.adaptiveLevel === 1 ? 0.82 : 0.65;
    this.engine.setHardwareScalingLevel(1 / (settings.renderScale * adaptiveScale));
    this.scene.shadowsEnabled = settings.shadows && this.adaptiveLevel < 2;
    if (this.pipeline) {
      this.pipeline.bloomEnabled = settings.quality !== "low" && this.adaptiveLevel < 2;
      this.pipeline.fxaaEnabled = settings.quality !== "low";
    }
    this.cockpit.setFov(settings.fovDegrees);
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
    this.carRoot.rotationQuaternion = Quaternion.RotationYawPitchRoll(pose.heading, -pose.pitch, -pose.roll);
    this.carRoot.computeWorldMatrix(true);

    for (let index = 0; index < this.wheels.length; index += 1) {
      const wheel = this.wheels[index]!;
      const wheelState = state.wheels[index]!;
      wheel.root.rotation.y = wheelState.steerAngleRad;
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
      const speedFraction = Math.min(1, state.speedKph / 220);
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
    this.cockpit.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  private setCameraMode(mode: CameraMode): void {
    this.lastCameraMode = mode;
    const showExterior = mode !== "cockpit";
    this.exteriorCabin.setEnabled(showExterior);
    for (const mesh of this.exteriorMeshes) mesh.setEnabled(showExterior);
    this.cockpitGroup.setEnabled(!showExterior);
  }

  private createPaintMaterial(): PBRMaterial {
    const material = new PBRMaterial("paint", this.scene);
    material.albedoColor = Color3.FromHexString("#6e0d13");
    material.metallic = 0.45;
    material.roughness = 0.32;
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = 0.85;
    material.clearCoat.roughness = 0.14;
    material.environmentIntensity = 0.65;
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
    const lowerBody = this.createLoft("body-shell", bodySections, this.paintMaterial, this.carRoot);
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
    this.createCabinLoft("greenhouse", greenhouseSections, this.glassMaterial, this.exteriorCabin);
    addBox("roof-skin", 1.16, 0.045, 1.4, 0, 1.497, -0.38, this.paintMaterial, this.exteriorCabin, false);
    addBox("roof-skin-front", 0.9, 0.04, 0.32, 0, 1.49, 0.18, this.paintMaterial, this.exteriorCabin, false);

    const sideWindowAt = (side: number, name: string, z0: number, y0: number, z1: number, y1: number): Mesh => {
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
      addBox(`side-window-panel-front-${side}`, 0.02, 0.32, 0.5, side * 0.9, 1.255, 0.06, this.glassMaterial, this.exteriorCabin, false);
      addBox(`side-window-panel-rear-${side}`, 0.02, 0.3, 1.1, side * 0.9, 1.25, -0.82, this.glassMaterial, this.exteriorCabin, false);
      addBox(`window-trim-${side}`, 0.016, 0.022, 1.65, side * 0.902, 1.075, -0.55, highChrome, this.exteriorCabin, false);
      addBox(`window-top-trim-${side}`, 0.016, 0.02, 1.55, side * 0.902, 1.425, -0.62, highChrome, this.exteriorCabin, false);
      addBox(`b-pillar-outer-${side}`, 0.045, 0.4, 0.065, side * 0.716, 1.28, -0.235, familyFace, this.exteriorCabin, false);
      addBox(`door-seam-${side}`, 0.012, 0.5, 0.012, side * 0.902, 0.68, 0.36, familyFace, this.carRoot, false);
      addBox(`door-seam-rear-${side}`, 0.012, 0.5, 0.012, side * 0.902, 0.68, -0.82, familyFace, this.carRoot, false);
      addBox(`door-handle-${side}`, 0.13, 0.035, 0.035, side * 0.916, 0.93, 0.08, highChrome, this.carRoot, false);
      addBox(`door-handle-rear-${side}`, 0.12, 0.03, 0.03, side * 0.912, 0.93, -0.86, highChrome, this.carRoot, false);
      addBox(`side-skirt-${side}`, 0.1, 0.1, 2.5, side * 0.87, 0.37, -0.22, familyFace, this.carRoot, false);
      addBox(`beltline-${side}`, 0.018, 0.022, 2.35, side * 0.872, 1.045, -0.3, highChrome, this.carRoot, false);
      addBox(`mirror-stalk-${side}`, 0.14, 0.045, 0.045, side * 0.955, 1.08, 0.55, trim, this.carRoot, false);
      addBox(`mirror-housing-${side}`, 0.2, 0.105, 0.11, side * 1.06, 1.09, 0.55, this.paintMaterial, this.carRoot, false);
      addBox(`mirror-glass-${side}`, 0.15, 0.075, 0.012, side * 1.06, 1.09, 0.61, chrome, this.carRoot, false);
      addBox(`fender-trim-${side}`, 0.025, 0.15, 0.85, side * 0.91, 0.66, frontAxle, familyFace, this.carRoot, false);
      addBox(`fender-trim-rear-${side}`, 0.025, 0.15, 0.85, side * 0.91, 0.66, rearAxle, familyFace, this.carRoot, false);
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
      addBox(`a-pillar-outer-${side}`, 0.032, 0.53, 0.04, side * 0.735, 1.24, 0.47, familyFace, this.exteriorCabin, false).rotation.x = -0.66;
      addBox(`c-pillar-outer-${side}`, 0.05, 0.44, 0.16, side * 0.7, 1.23, -1.55, this.paintMaterial, this.exteriorCabin, false).rotation.x = 0.58;
    }
    addBox("shark-fin", 0.04, 0.07, 0.18, 0, 1.55, -1.31, familyFace, this.exteriorCabin, false);
    addBox("rear-spoiler", 1.2, 0.035, 0.24, 0, 1.46, -1.52, this.paintMaterial, this.exteriorCabin, false).rotation.x = 0.1;
    addBox("rear-body-cap", 1.05, 0.46, 0.04, 0, 0.58, -2.14, this.paintMaterial, this.carRoot, false);
    addBox("front-body-cap", 1.05, 0.46, 0.04, 0, 0.58, 2.12, this.paintMaterial, this.carRoot, false);
    addBox("rear-bulkhead", 1.16, 0.42, 0.04, 0, 1.2, -1.62, interior, this.cockpitGroup, false);
    addBox("parcel-shelf", 1.2, 0.04, 0.34, 0, 1.18, -1.4, carpet, this.cockpitGroup, false);

    addBox("front-bumper", 1.8, 0.38, 0.2, 0, 0.55, frontAxle + 1.1, this.paintMaterial);
    addBox("rear-bumper", 1.78, 0.4, 0.2, 0, 0.54, -2.2, this.paintMaterial);
    addBox("front-lip", 1.62, 0.12, 0.16, 0, 0.34, frontAxle + 1.14, familyFace, this.carRoot, false);
    addBox("rear-diffuser", 1.5, 0.14, 0.15, 0, 0.32, -2.27, familyFace, this.carRoot, false);
    addBox("grille", 0.92, 0.19, 0.07, 0, 0.74, frontAxle + 1.16, familyFace, this.carRoot, false);
    addBox("grille-slat-top", 0.92, 0.015, 0.02, 0, 0.8, frontAxle + 1.198, highChrome, this.carRoot, false);
    addBox("grille-slat-low", 0.92, 0.012, 0.02, 0, 0.7, frontAxle + 1.198, highChrome, this.carRoot, false);
    addBox("lower-intake", 1.02, 0.13, 0.08, 0, 0.43, frontAxle + 1.17, familyFace, this.carRoot, false);
    addBox("front-plate", 0.44, 0.11, 0.025, 0, 0.57, frontAxle + 1.205, chrome, this.carRoot, false);
    const badge = CreateCylinder("front-badge", { diameter: 0.105, height: 0.02, tessellation: 24 }, this.scene);
    badge.rotation.x = Math.PI / 2;
    badge.position.set(0, 0.74, frontAxle + 1.21);
    badge.material = highChrome;
    badge.parent = this.carRoot;
    badge.isPickable = false;
    const badgeInner = CreateCylinder("front-badge-inner", { diameter: 0.065, height: 0.022, tessellation: 20 }, this.scene);
    badgeInner.rotation.x = Math.PI / 2;
    badgeInner.position.set(0, 0.74, frontAxle + 1.215);
    badgeInner.material = familyFace;
    badgeInner.parent = this.carRoot;
    badgeInner.isPickable = false;

    for (const side of [-1, 1]) {
      addBox(`headlamp-${side}`, 0.48, 0.17, 0.1, side * 0.55, 0.9, frontAxle + 1.13, headlamp, this.carRoot, false);
      addBox(`drl-${side}`, 0.34, 0.018, 0.025, side * 0.55, 0.95, frontAxle + 1.19, this.headlightMaterial, this.carRoot, false);
      const projector = CreateCylinder(`projector-${side}`, { diameter: 0.105, height: 0.035, tessellation: 20 }, this.scene);
      projector.rotation.x = Math.PI / 2;
      projector.position.set(side * 0.55, 0.89, frontAxle + 1.2);
      projector.material = highChrome;
      projector.parent = this.carRoot;
      projector.isPickable = false;
      addBox(`fog-${side}`, 0.12, 0.06, 0.03, side * 0.63, 0.43, frontAxle + 1.19, amberLens, this.carRoot, false);
      addBox(`taillight-${side}`, 0.49, 0.18, 0.055, side * 0.55, 0.92, -2.16, redLens, this.carRoot, false);
      addBox(`taillight-led-${side}`, 0.42, 0.02, 0.01, side * 0.55, 0.98, -2.195, this.brakeLightMaterial, this.carRoot, false);
      addBox(`reverse-light-${side}`, 0.11, 0.05, 0.02, side * 0.72, 0.82, -2.19, this.reverseLightMaterial, this.carRoot, false);
      addBox(`reflector-${side}`, 0.1, 0.045, 0.02, side * 0.65, 0.5, -2.2, redLens, this.carRoot, false);
      addBox(`exhaust-${side}`, 0.09, 0.09, 0.16, side * 0.34, 0.3, -2.24, highChrome, this.carRoot, false);
    }
    addBox("rear-plate", 0.44, 0.11, 0.02, 0, 0.6, -2.24, chrome, this.carRoot, false);
    const badgeTexture = new DynamicTexture("golf-badge-texture", { width: 512, height: 128 }, this.scene, true);
    const badgeContext = badgeTexture.getContext() as unknown as CanvasRenderingContext2D;
    badgeContext.clearRect(0, 0, 512, 128);
    badgeContext.fillStyle = "#c9d0d4";
    badgeContext.font = "700 92px Segoe UI, sans-serif";
    badgeContext.textAlign = "center";
    badgeContext.textBaseline = "middle";
    badgeContext.fillText("GOLF", 256, 66);
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
    addBox("brake-light-bar", 0.55, 0.025, 0.02, 0, 1.42, -1.66, this.brakeLightMaterial, this.exteriorCabin, false);

    const headlightLeft = new SpotLight("headlight-spot-left", new Vector3(0, 0, 0), new Vector3(0, -0.1, 1), Math.PI / 6.5, 4, this.scene);
    const headlightRight = new SpotLight("headlight-spot-right", new Vector3(0, 0, 0), new Vector3(0, -0.1, 1), Math.PI / 6.5, 4, this.scene);
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
      wheelRoot.position.set(left ? -(halfWidth + 0.085) : halfWidth + 0.085, wheelRadius, front ? frontAxle : rearAxle);
      const spin = new TransformNode(`wheel-spin-${index}`, this.scene);
      spin.parent = wheelRoot;
      const tire = CreateCylinder(`tire-${index}`, { diameter: wheelRadius * 2.02, height: wheelWidth, tessellation: 40 }, this.scene);
      tire.rotation.z = Math.PI / 2;
      tire.material = rubber;
      tire.parent = spin;
      tire.isPickable = false;
      tire.receiveShadows = true;
      this.environment.shadows.addShadowCaster(tire, true);
      const sidewall = CreateTorus(`sidewall-${index}`, { diameter: wheelRadius * 1.55, thickness: 0.035, tessellation: 32 }, this.scene);
      sidewall.rotation.z = Math.PI / 2;
      sidewall.material = rubber;
      sidewall.parent = spin;
      sidewall.isPickable = false;
      const rimMesh = CreateCylinder(`rim-${index}`, { diameter: wheelRadius * 1.3, height: wheelWidth + 0.015, tessellation: 32 }, this.scene);
      rimMesh.rotation.z = Math.PI / 2;
      rimMesh.material = lowChrome;
      rimMesh.parent = spin;
      rimMesh.isPickable = false;
      const rimFace = CreateCylinder(`rim-face-${index}`, { diameter: wheelRadius * 1.16, height: wheelWidth + 0.02, tessellation: 32 }, this.scene);
      rimFace.rotation.z = Math.PI / 2;
      rimFace.material = rim;
      rimFace.parent = spin;
      rimFace.isPickable = false;
      for (let spokeIndex = 0; spokeIndex < 5; spokeIndex += 1) {
        const spoke = CreateBox(`spoke-${index}-${spokeIndex}`, { width: 0.035, height: 0.24, depth: 0.035 }, this.scene);
        spoke.position.set(0, 0.12, 0);
        const spokePivot = new TransformNode(`spoke-pivot-${index}-${spokeIndex}`, this.scene);
        spokePivot.parent = spin;
        spokePivot.rotation.x = (spokeIndex / 5) * Math.PI * 2;
        spoke.parent = spokePivot;
        spoke.material = highChrome;
        spoke.isPickable = false;
      }
      const hub = CreateCylinder(`hub-${index}`, { diameter: 0.12, height: wheelWidth + 0.05, tessellation: 20 }, this.scene);
      hub.rotation.z = Math.PI / 2;
      hub.material = highChrome;
      hub.parent = spin;
      hub.isPickable = false;
      const disc = CreateCylinder(`brake-disc-${index}`, { diameter: 0.31, height: 0.025, tessellation: 28 }, this.scene);
      disc.rotation.z = Math.PI / 2;
      disc.position.set(left ? 0.08 : -0.08, 0, 0);
      disc.material = lowChrome;
      disc.parent = wheelRoot;
      disc.isPickable = false;
      const caliper = CreateBox(`caliper-${index}`, { width: 0.045, height: 0.11, depth: 0.06 }, this.scene);
      caliper.position.set(left ? 0.09 : -0.09, 0.11, -0.13);
      caliper.material = redLens;
      caliper.parent = wheelRoot;
      caliper.isPickable = false;
      const arch = CreateTorus(`wheel-arch-${index}`, { diameter: wheelRadius * 2.25, thickness: 0.035, tessellation: 28 }, this.scene);
      arch.rotation.z = Math.PI / 2;
      arch.position.set(left ? -0.1 : 0.1, 0, 0);
      arch.material = familyFace;
      arch.parent = wheelRoot;
      arch.isPickable = false;
      this.wheels.push({ root: wheelRoot, spin, angle: 0 });
    }

    this.buildInterior(trim, interior, seatMaterial, carpet, chrome, rim);
  }

  private createLoft(
    name: string,
    sections: Array<{ z: number; w: number; bottom: number; shoulder: number; top: number; topWidth: number }>,
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
    const mesh = CreateRibbon(name, { pathArray: paths, closePath: true, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
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
    const mesh = CreateRibbon(name, { pathArray: paths, closePath: true, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
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
    rim: PBRMaterial,
  ): void {
    const halfWidth = this.config.trackM / 2;
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

    addBox("dashboard", halfWidth * 2 - 0.16, 0.22, 0.5, 0, 0.99, 0.68, interior);
    addBox("dashboard-top", halfWidth * 2 - 0.2, 0.05, 0.46, 0, 1.105, 0.66, trim);
    addBox("dashboard-chrome", halfWidth * 2 - 0.28, 0.018, 0.03, 0, 1.08, 0.44, chrome);
    addBox("center-console", 0.22, 0.24, 0.9, 0.02, 0.56, -0.05, interior);
    addBox("tunnel-carpet", 1.1, 0.05, 1.7, 0, 0.31, -0.15, carpet);
    addBox("headliner", halfWidth * 2 - 0.28, 0.035, 0.8, 0, 1.61, -0.95, interior);

    const screenMaterial = new StandardMaterial("infotainment-screen", this.scene);
    screenMaterial.diffuseColor = new Color3(0.02, 0.03, 0.04);
    screenMaterial.emissiveColor = new Color3(0.02, 0.09, 0.14);
    const screen = addBox("infotainment-screen", 0.34, 0.2, 0.02, 0.04, 1.11, 0.735, screenMaterial);
    screen.rotation.x = -0.08;
    addBox("infotainment-bezel", 0.38, 0.235, 0.015, 0.04, 1.11, 0.745, trim);
    const clusterMaterial = new StandardMaterial("digital-cluster", this.scene);
    clusterMaterial.diffuseColor = new Color3(0.01, 0.02, 0.03);
    clusterMaterial.emissiveColor = new Color3(0.02, 0.07, 0.11);
    addBox("digital-cluster", 0.34, 0.135, 0.015, -0.36, 1.08, 0.455, clusterMaterial).rotation.x = -0.28;
    for (const [x, y, z] of [
      [-0.14, 1.115, 0.61],
      [0.18, 1.115, 0.61],
    ] as Array<[number, number, number]>) {
      const vent = addBox("dash-vent", 0.18, 0.055, 0.02, x, y, z, trim);
      vent.rotation.x = -0.2;
    }
    addBox("hazard-button", 0.06, 0.03, 0.01, 0.04, 1.08, 0.62, this.brakeLightMaterial);
    addBox("engine-start-button", 0.035, 0.035, 0.01, 0.18, 1.01, 0.44, chrome);

    addBox("cockpit-floor", 1.42, 0.035, 1.55, 0, 0.35, 0.0, carpet);
    addBox("cockpit-cowl", 1.5, 0.06, 0.55, 0, 1.06, 0.55, trim);
    addBox("cockpit-hood", 1.4, 0.035, 1.5, 0, 1.01, 1.55, this.paintMaterial);
    for (const side of [-1, 1]) {
      addBox(`door-card-${side}`, 0.05, 0.5, 1.6, side * (halfWidth - 0.13), 0.82, -0.25, interior);
      addBox(`armrest-${side}`, 0.12, 0.08, 0.55, side * (halfWidth - 0.2), 0.92, -0.15, trim);
      addBox(`b-pillar-${side}`, 0.05, 0.52, 0.06, side * (halfWidth - 0.05), 1.3, -0.9, trim);
    }

    const seatBack = addBox("driver-seat-back", 0.5, 0.66, 0.16, -0.36, 0.86, -0.74, seatMaterial);
    seatBack.rotation.x = 0.13;
    addBox("driver-seat-base", 0.5, 0.14, 0.52, -0.36, 0.52, -0.35, seatMaterial);
    addBox("driver-headrest", 0.26, 0.22, 0.12, -0.36, 1.28, -0.8, seatMaterial);
    const passengerBack = addBox("passenger-seat-back", 0.5, 0.66, 0.16, 0.42, 0.86, -0.74, seatMaterial);
    passengerBack.rotation.x = 0.13;
    addBox("passenger-seat-base", 0.5, 0.14, 0.52, 0.42, 0.52, -0.35, seatMaterial);

    const plaidTexture = new DynamicTexture("golf-plaid", { width: 256, height: 256 }, this.scene, true);
    const plaidContext = plaidTexture.getContext();
    plaidContext.fillStyle = "#121315";
    plaidContext.fillRect(0, 0, 256, 256);
    for (let index = 0; index < 8; index += 1) {
      plaidContext.fillStyle = index % 2 === 0 ? "rgba(150,25,30,0.65)" : "rgba(210,210,205,0.26)";
      plaidContext.fillRect(index * 32, 0, 9, 256);
      plaidContext.fillRect(0, index * 32, 256, 7);
    }
    plaidTexture.update(false);
    plaidTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    plaidTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    plaidTexture.uScale = 2;
    plaidTexture.vScale = 2;
    const plaidMaterial = new PBRMaterial("golf-plaid-material", this.scene);
    plaidMaterial.albedoTexture = plaidTexture;
    plaidMaterial.roughness = 0.92;
    plaidMaterial.metallic = 0;
    for (const side of [-0.36, 0.42]) {
      const seatCenter = addBox("seat-plaid-center", 0.34, 0.46, 0.015, side, 0.88, -0.648, plaidMaterial);
      seatCenter.rotation.x = 0.13;
      addBox("seat-plaid-base", 0.34, 0.02, 0.4, side, 0.595, -0.34, plaidMaterial);
      addBox("seat-bolster-left", 0.07, 0.56, 0.18, side - 0.205, 0.86, -0.73, seatMaterial).rotation.x = 0.13;
      addBox("seat-bolster-right", 0.07, 0.56, 0.18, side + 0.205, 0.86, -0.73, seatMaterial).rotation.x = 0.13;
    }

    const wheelPivot = new TransformNode("steering-pivot", this.scene);
    wheelPivot.parent = this.cockpitGroup;
    wheelPivot.position.set(-0.36, 0.96, 0.34);
    wheelPivot.rotation.x = -0.42;
    const steeringSpin = new TransformNode("steering-spin", this.scene);
    steeringSpin.parent = wheelPivot;
    this.steeringSpinNode = steeringSpin;
    const wheel = CreateTorus("steering-wheel", { diameter: 0.32, thickness: 0.027, tessellation: 28 }, this.scene);
    wheel.rotation.x = Math.PI / 2;
    wheel.material = trim;
    wheel.parent = steeringSpin;
    wheel.isPickable = false;
    for (const angle of [0, Math.PI * 0.66, Math.PI * 1.33]) {
      const spoke = CreateBox("steering-spoke", { width: 0.15, height: 0.028, depth: 0.024 }, this.scene);
      spoke.rotation.z = angle;
      spoke.position.set(Math.cos(angle) * 0.07, Math.sin(angle) * 0.07, 0);
      spoke.parent = steeringSpin;
      spoke.material = trim;
      spoke.isPickable = false;
    }
    const hub = CreateCylinder("steering-hub", { diameter: 0.1, height: 0.04, tessellation: 16 }, this.scene);
    hub.rotation.x = Math.PI / 2;
    hub.material = chrome;
    hub.parent = steeringSpin;
    hub.isPickable = false;

    addBox("instrument-binnacle", 0.5, 0.17, 0.16, -0.36, 1.04, 0.57, trim);
    const gaugePivot = new TransformNode("gauge-pivot", this.scene);
    gaugePivot.parent = this.cockpitGroup;
    gaugePivot.position.set(-0.36, 1.05, 0.44);
    for (const [name, x] of [
      ["tach", -0.1],
      ["speed", 0.1],
    ] as const) {
      const face = CreateCylinder(`gauge-${name}`, { diameter: 0.16, height: 0.012, tessellation: 24 }, this.scene);
      face.rotation.x = Math.PI / 2;
      face.position.set(x, 0, 0);
      face.material = interior;
      face.parent = gaugePivot;
      face.isPickable = false;
      const needlePivot = new TransformNode(`${name === "tach" ? "tach" : "speed"}-needle`, this.scene);
      needlePivot.parent = gaugePivot;
      needlePivot.position.set(x, 0, -0.012);
      if (name === "tach") this.tachNeedleNode = needlePivot;
      else this.speedNeedleNode = needlePivot;
      const needle = CreateBox(`gauge-needle-${name}`, { width: 0.012, height: 0.065, depth: 0.005 }, this.scene);
      needle.position.set(0, 0.027, 0);
      needle.material = chrome;
      needle.parent = needlePivot;
      needle.isPickable = false;
    }

    const leverBoot = CreateCylinder("gear-boot", { diameterTop: 0.06, diameterBottom: 0.16, height: 0.1, tessellation: 12 }, this.scene);
    leverBoot.position.set(this.leverBase.x, this.leverBase.y - 0.03, this.leverBase.z);
    leverBoot.material = trim;
    leverBoot.parent = this.cockpitGroup;
    const arm = CreateCylinder("gear-lever-arm", { diameter: 0.025, height: 1, tessellation: 8 }, this.scene);
    arm.material = chrome;
    arm.parent = this.cockpitGroup;
    arm.isPickable = false;
    const knob = CreateSphere("gear-knob", { diameter: 0.075, segments: 12 }, this.scene);
    knob.material = trim;
    knob.parent = this.cockpitGroup;
    knob.isPickable = false;

    const pedalPositions: Array<[string, number, PBRMaterial]> = [
      ["clutch", -0.55, trim],
      ["brake", -0.44, trim],
      ["throttle", -0.33, rim],
    ];
    for (const [name, x, material] of pedalPositions) {
      const pedal = CreateBox(`pedal-${name}`, { width: 0.08, height: 0.14, depth: 0.03 }, this.scene);
      pedal.position.set(x, 0.3, 0.47);
      pedal.rotation.x = -0.35;
      pedal.material = material;
      pedal.parent = this.cockpitGroup;
      pedal.isPickable = false;
      this.pedalMeshes.push({ mesh: pedal, baseY: 0.3, baseRotation: -0.35 });
    }

    const wiperPivot = new TransformNode("wiper-pivot", this.scene);
    wiperPivot.parent = this.carRoot;
    wiperPivot.position.set(0, 1.19, 0.62);
    const wiperArm = CreateBox("wiper-arm", { width: 0.7, height: 0.018, depth: 0.02 }, this.scene);
    wiperArm.position.set(0.3, 0, 0);
    wiperArm.material = trim;
    wiperArm.parent = wiperPivot;
    wiperArm.isPickable = false;

    addBox("driver-footwell", 0.6, 0.02, 0.7, -0.36, 0.22, 0.15, carpet);
    addBox("passenger-footwell", 0.6, 0.02, 0.7, 0.42, 0.22, 0.15, carpet);
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
    const forward = Vector3.TransformNormal(new Vector3(0, 0, 1), this.carRoot.getWorldMatrix()).normalize();
    for (let index = 0; index < this.headlightSpots.length; index += 1) {
      const light = this.headlightSpots[index]!;
      const local = new Vector3(index === 0 ? -0.58 : 0.58, 0.86, this.config.wheelbaseM * (1 - this.config.frontWeightBias) + 1.15);
      const world = Vector3.TransformCoordinates(local, this.carRoot.getWorldMatrix());
      light.position.copyFrom(world);
      light.direction.copyFrom(forward.add(new Vector3(0, -0.1, 0)).normalize());
      light.intensity = this.headlightsOn ? 80 : 0;
    }
    this.headlightMaterial.emissiveColor = this.headlightsOn ? new Color3(1, 0.94, 0.8) : new Color3(0.25, 0.25, 0.22);
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
