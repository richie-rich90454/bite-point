import { FreeCamera, Matrix, Scene, TransformNode, Vector3 } from "./babylon";
import type { VehicleConfig } from "../simulation/config/VehicleConfig";
import type { VehicleRenderState } from "../simulation/vehicle/VehicleTypes";

export type CameraMode = "cockpit" | "hood" | "exterior";

const MODES: CameraMode[] = ["cockpit", "hood", "exterior"];

export class CockpitController {
    readonly camera: FreeCamera;
    mode: CameraMode = "cockpit";
    lookYaw = 0;
    lookPitch = 0;
    private baseFovDegrees = 62;
    private shakeAmount = 0;
    private speedFovBoost = 0;
    private chasePosition: Vector3 | null = null;
    private readonly eyeLocal = new Vector3(-0.36, 1.26, -0.58);
    private readonly hoodLocal = new Vector3(0, 1.14, 1.55);
    private readonly forward = new Vector3(0, 0, 1);

    constructor(
        scene: Scene,
        private readonly carRoot: TransformNode,
        private readonly config: VehicleConfig,
    ) {
        this.camera = new FreeCamera("driver-camera", new Vector3(0, 2, -6), scene);
        this.camera.minZ = 0.04;
        this.camera.maxZ = 20000;
        this.camera.fov = (this.baseFovDegrees * Math.PI) / 180;
        this.camera.inputs.clear();
        scene.activeCamera = this.camera;
    }

    setFov(degrees: number): void {
        this.baseFovDegrees = degrees;
        this.updateFov();
    }

    setShake(amount: number): void {
        this.shakeAmount = Math.max(0, Math.min(1, amount));
    }

    cycle(): CameraMode {
        const index = MODES.indexOf(this.mode);
        this.mode = MODES[(index + 1) % MODES.length]!;
        this.lookYaw = 0;
        this.lookPitch = 0;
        this.chasePosition = null;
        return this.mode;
    }

    setMode(mode: CameraMode): void {
        this.mode = mode;
        this.lookYaw = 0;
        this.lookPitch = 0;
        this.chasePosition = null;
    }

    addLook(deltaYaw: number, deltaPitch: number): void {
        if (this.mode !== "cockpit") return;
        this.lookYaw = Math.max(-1.6, Math.min(1.6, this.lookYaw + deltaYaw));
        this.lookPitch = Math.max(-0.8, Math.min(0.7, this.lookPitch + deltaPitch));
    }

    recenter(): void {
        this.lookYaw = 0;
        this.lookPitch = 0;
    }

    update(state: VehicleRenderState, dt: number): void {
        const targetBoost = Math.min(12, Math.max(0, state.speedMps - 20) * 0.12);
        this.speedFovBoost += (targetBoost - this.speedFovBoost) * (1 - Math.exp(-3 * dt));
        this.updateFov();
        const matrix = this.carRoot.getWorldMatrix();
        const carPosition = new Vector3(matrix.m[12]!, matrix.m[13]!, matrix.m[14]!);
        const carUp = Vector3.TransformNormal(new Vector3(0, 1, 0), matrix).normalize();

        if (this.mode === "exterior") {
            const heading = state.pose.heading;
            const forward = new Vector3(Math.sin(heading), 0, Math.cos(heading));
            const right = new Vector3(Math.cos(heading), 0, -Math.sin(heading));
            const desired = carPosition
                .subtract(forward.scale(7.2))
                .add(right.scale(1.25))
                .add(new Vector3(0, 2.6, 0));
            if (!this.chasePosition) this.chasePosition = desired.clone();
            const smoothing = 1 - Math.exp(-5 * dt);
            this.chasePosition = Vector3.Lerp(this.chasePosition, desired, smoothing);
            this.camera.position.copyFrom(this.chasePosition);
            this.camera.upVector.set(0, 1, 0);
            this.camera.setTarget(carPosition.add(new Vector3(0, 0.85, 0)).add(forward.scale(1.6)));
            return;
        }

        const localEye = this.mode === "cockpit" ? this.eyeLocal : this.hoodLocal;
        const eye = Vector3.TransformCoordinates(localEye, matrix);
        const shake = this.shakeAmount * Math.min(1, state.speedMps / 90);
        if (shake > 0.001) {
            const time = state.timeS;
            eye.x += Math.sin(time * 37.1) * 0.004 * shake;
            eye.y += Math.sin(time * 29.7 + 1.3) * 0.003 * shake;
            eye.z += Math.sin(time * 43.3 + 2.1) * 0.003 * shake;
        }
        this.camera.position.copyFrom(eye);
        this.camera.upVector.copyFrom(carUp);

        let direction = Vector3.TransformNormal(this.forward, matrix).normalize();
        if (this.mode === "hood") {
            direction = direction.add(new Vector3(0, -0.06, 0)).normalize();
        }
        if (this.mode === "cockpit") {
            if (this.lookYaw !== 0) {
                direction = Vector3.TransformNormal(
                    direction,
                    Matrix.RotationAxis(carUp, this.lookYaw),
                ).normalize();
            }
            if (this.lookPitch !== 0) {
                const right = Vector3.Cross(carUp, direction).normalize();
                direction = Vector3.TransformNormal(
                    direction,
                    Matrix.RotationAxis(right, -this.lookPitch),
                ).normalize();
            }
        }
        this.camera.setTarget(eye.add(direction.scale(10)));
    }

    private updateFov(): void {
        const degrees =
            this.mode === "cockpit"
                ? this.baseFovDegrees + this.speedFovBoost
                : this.mode === "hood"
                  ? this.baseFovDegrees + 6 + this.speedFovBoost
                  : 54;
        this.camera.fov = (degrees * Math.PI) / 180;
    }

    dispose(): void {
        this.camera.dispose();
    }
}
