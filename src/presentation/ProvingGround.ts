import {
    Color3,
    CreateBox,
    CreateCylinder,
    CreateGround,
    CreatePlane,
    DynamicTexture,
    Mesh,
    PBRMaterial,
    Scene,
    ShadowGenerator,
    StandardMaterial,
    Texture,
    Vector3,
    VertexBuffer,
    VertexData,
} from "./babylon";
import { createRoadMaterial } from "./RoadMaterial";
import { PROVING_STRAIGHT } from "../simulation/road/RoadLayout";

/** Local, deterministic assets: no network textures or runtime asset services. */
export class ProvingGround {
    private seed = 71483;
    private batches = new Map<PBRMaterial, Mesh[]>();
    private random = (): number => {
        this.seed = (1664525 * this.seed + 1013904223) >>> 0;
        return this.seed / 4294967296;
    };

    constructor(
        private scene: Scene,
        private shadows: ShadowGenerator,
    ) {
        this.landscape();
        this.straight();
        this.vegetation();
        for (const meshes of this.batches.values()) {
            const merged = Mesh.MergeMeshes(meshes, true, true);
            if (merged) {
                merged.freezeWorldMatrix();
                merged.receiveShadows = true;
            }
        }
        this.batches.clear();
    }

    private material(name: string, color: string, roughness = 0.9): PBRMaterial {
        const material = new PBRMaterial(name, this.scene);
        material.albedoColor = Color3.FromHexString(color);
        material.roughness = roughness;
        material.metallic = 0;
        return material;
    }

    private box(
        name: string,
        x: number,
        y: number,
        z: number,
        length: number,
        width: number,
        height: number,
        material: PBRMaterial,
    ): Mesh {
        const mesh = CreateBox(name, { width, height, depth: length }, this.scene);
        mesh.position.set(y, z + height / 2, x);
        mesh.material = material;
        mesh.receiveShadows = true;
        mesh.isPickable = false;
        mesh.freezeWorldMatrix();
        const batch = this.batches.get(material) ?? [];
        batch.push(mesh);
        this.batches.set(material, batch);
        return mesh;
    }

    private landscape(): void {
        const grass = this.material("meadow", "#788166");
        const texture = new DynamicTexture("meadow-detail", 512, this.scene, true);
        const ctx = texture.getContext();
        ctx.fillStyle = "#7b8062";
        ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 22000; i++) {
            ctx.fillStyle = this.random() > 0.5 ? "rgba(34,51,29,.22)" : "rgba(184,167,110,.24)";
            ctx.fillRect(
                this.random() * 512,
                this.random() * 512,
                1 + this.random() * 3,
                1 + this.random() * 6,
            );
        }
        texture.uScale = 180;
        texture.vScale = 180;
        texture.anisotropicFilteringLevel = 16;
        texture.wrapU = texture.wrapV = Texture.WRAP_ADDRESSMODE;
        texture.update();
        grass.albedoTexture = texture;
        const meadow = CreateGround(
            "surrounding-meadow",
            { width: 9000, height: 12000, subdivisions: 96 },
            this.scene,
        );
        meadow.position.set(0, -0.08, 2500);
        meadow.material = grass;
        meadow.receiveShadows = true;
        meadow.freezeWorldMatrix();

        // Continuous irregular ridgelines, rather than isolated low-poly hill spheres.
        for (const side of [-1, 1]) {
            const ridge = CreateGround(
                "coastal-ridgeline",
                { width: 2200, height: 11000, subdivisions: 80 },
                this.scene,
            );
            ridge.position.set(side * 1800, -12, 2400);
            const positions = ridge.getVerticesData(VertexBuffer.PositionKind)!;
            const indices = ridge.getIndices()!;
            for (let i = 0; i < positions.length; i += 3) {
                const u = positions[i]!;
                const v = positions[i + 2]!;
                const envelope = Math.sin(Math.PI * (u / 2200 + 0.5));
                positions[i + 1] =
                    envelope *
                    (170 +
                        90 * Math.sin(v * 0.0019 + side) +
                        55 * Math.cos(u * 0.006 + v * 0.003) +
                        18 * Math.sin(v * 0.017 + u * 0.021));
            }
            const normals = new Float32Array(positions.length);
            VertexData.ComputeNormals(positions, indices, normals);
            ridge.setVerticesData(VertexBuffer.PositionKind, positions);
            ridge.setVerticesData(VertexBuffer.NormalKind, normals);
            ridge.refreshBoundingInfo();
            ridge.material = this.material(`ridge-${side}`, side === 1 ? "#69796c" : "#78847b");
            ridge.freezeWorldMatrix();
        }
    }

    private straight(): void {
        const { startX, endX, centerY } = PROVING_STRAIGHT;
        const asphalt = createRoadMaterial(this.scene, "proving-asphalt", 20, endX - startX);
        const road = CreateGround(
            "six-kilometre-proving-straight",
            { width: 20, height: endX - startX, subdivisionsX: 1, subdivisionsY: 320 },
            this.scene,
        );
        road.position.set(centerY, 0.004, (startX + endX) / 2);
        road.material = asphalt;
        road.receiveShadows = true;
        road.freezeWorldMatrix();
        const paint = this.material("road-paint", "#e2e0d0");
        const concrete = this.material("shoulder-gravel", "#aaa799");
        const metal = this.material("galvanised-steel", "#a4acaf", 0.36);
        metal.metallic = 0.7;
        const reflector = this.material("reflector-amber", "#d9a447", 0.4);
        for (const side of [-1, 1]) {
            this.box(
                "gravel-shoulder",
                2850,
                centerY + side * 11.5,
                -0.035,
                6300,
                3,
                0.035,
                concrete,
            );
            this.box("edge-line", 2850, centerY + side * 9, 0.012, 6300, 0.16, 0.005, paint);
            for (let x = startX; x < endX; x += 100) {
                this.box("guardrail", x + 50, centerY + side * 14, 0.65, 100, 0.12, 0.27, metal);
                for (let offset = 0; offset < 100; offset += 25) {
                    this.box(
                        "rail-post",
                        x + offset,
                        centerY + side * 14,
                        0,
                        0.12,
                        0.16,
                        0.85,
                        metal,
                    );
                    this.box(
                        "amber-reflector",
                        x + offset,
                        centerY + side * 13.9,
                        0.78,
                        0.16,
                        0.04,
                        0.09,
                        reflector,
                    );
                }
            }
        }
        for (let x = startX; x < endX; x += 18)
            this.box("lane-dash", x + 3, centerY, 0.012, 6, 0.15, 0.005, paint);
        // Access apron touches the existing lot, without crossing the training hills.
        this.box(
            "access-apron",
            -40,
            -91,
            -0.01,
            60,
            40,
            0.014,
            createRoadMaterial(this.scene, "apron-asphalt", 40, 60),
        );
        for (let x = 0; x <= 6000; x += 500) {
            this.distanceBoard(
                x,
                centerY - 17,
                x === 6000 ? "Brake" : `${(x / 1000).toFixed(1)} km`,
            );
        }
        this.distanceBoard(-100, centerY - 17, "6 km straight");
    }

    private distanceBoard(x: number, y: number, label: string): void {
        const texture = new DynamicTexture(
            `distance-${x}`,
            { width: 512, height: 192 },
            this.scene,
            true,
        );
        const ctx = texture.getContext();
        ctx.fillStyle = "#1e3539";
        ctx.fillRect(0, 0, 512, 192);
        ctx.strokeStyle = "#d8dfd7";
        ctx.lineWidth = 8;
        ctx.strokeRect(12, 12, 488, 168);
        ctx.font = '600 52px "Noto Sans", sans-serif';
        ctx.fillStyle = "#f2f3e9";
        ctx.fillText(label, (512 - ctx.measureText(label).width) / 2, 115);
        texture.update();
        const material = new StandardMaterial(`distance-material-${x}`, this.scene);
        material.diffuseTexture = texture;
        material.specularColor = Color3.Black();
        const board = CreateBox(
            `distance-board-${x}`,
            { width: 3.8, height: 1.4, depth: 0.08 },
            this.scene,
        );
        board.position.set(y, 2.8, x);
        board.material = material;
        const post = CreateCylinder(
            `distance-post-${x}`,
            { diameter: 0.12, height: 2.8, tessellation: 8 },
            this.scene,
        );
        post.position.set(y, 1.4, x);
        post.material = material;
    }

    private vegetation(): void {
        const bark = this.material("bark", "#635b49");
        const leaves = ["#465d3e", "#53694a", "#667349"].map((color, i) =>
            this.material(`leaves-${i}`, color),
        );
        const trunk = CreateCylinder(
            "tree-trunk-source",
            { diameterTop: 0.17, diameterBottom: 0.38, height: 5, tessellation: 8 },
            this.scene,
        );
        trunk.material = bark;
        const crowns = leaves.map((material, i) => {
            // Crossed alpha-tested leaf clusters retain an irregular silhouette from
            // every driving angle without rendering thousands of individual leaves.
            const detail = new DynamicTexture(`leaf-detail-${i}`, 512, this.scene, true);
            const ctx = detail.getContext();
            ctx.clearRect(0, 0, 512, 512);
            for (let leaf = 0; leaf < 6500; leaf++) {
                const angle = this.random() * Math.PI * 2;
                const distance = Math.sqrt(this.random());
                const contour = 0.83 + 0.09 * Math.sin(angle * 7 + i) + 0.06 * Math.cos(angle * 11);
                const x = 256 + Math.cos(angle) * distance * 238 * contour;
                const y = 256 + Math.sin(angle) * distance * 222 * contour;
                const shade = Math.floor(38 + this.random() * 68 + (1 - y / 512) * 30);
                ctx.fillStyle = `rgb(${shade * 0.82},${shade},${shade * 0.56})`;
                ctx.beginPath();
                ctx.arc(x, y, 2 + this.random() * 5, 0, Math.PI * 2);
                ctx.fill();
            }
            detail.hasAlpha = true;
            detail.anisotropicFilteringLevel = 8;
            detail.update();
            material.albedoTexture = detail;
            material.albedoColor = Color3.FromHexString("#c3cbb7");
            material.useAlphaFromAlbedoTexture = true;
            material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
            material.alphaCutOff = 0.45;
            material.backFaceCulling = false;
            material.roughness = 1;
            const planes = [0, Math.PI / 3, (Math.PI * 2) / 3].map((angle) => {
                const plane = CreatePlane(
                    `leaf-card-${i}`,
                    { size: 1, sideOrientation: Mesh.DOUBLESIDE },
                    this.scene,
                );
                plane.rotation.y = angle;
                plane.material = material;
                return plane;
            });
            const mesh = Mesh.MergeMeshes(planes, true)!;
            mesh.name = `canopy-source-${i}`;
            return mesh;
        });
        for (let i = 0; i < 320; i++) {
            const x = i < 100 ? -150 + this.random() * 400 : -300 + this.random() * 6600;
            let y = -110 + (this.random() < 0.5 ? -1 : 1) * (24 + this.random() * 150);
            if (x > -95 && x < 110 && y > -95 && y < 95) y = -155 - this.random() * 70;
            const height = 5 + this.random() * 5;
            const stem = trunk.createInstance(`trunk-${i}`);
            stem.position.set(y, height / 2, x);
            stem.scaling.y = height / 5;
            stem.freezeWorldMatrix();
            for (let clump = 0; clump < 4; clump++) {
                const crown = crowns[i % 3]!.createInstance(`canopy-${i}-${clump}`);
                const spread = height * (0.42 + this.random() * 0.15);
                crown.position.set(
                    y + (this.random() - 0.5) * height * 0.45,
                    height * (0.73 + this.random() * 0.32),
                    x + (this.random() - 0.5) * height * 0.45,
                );
                crown.scaling = new Vector3(spread, spread * 0.72, spread);
                crown.rotation.y = this.random() * Math.PI;
                crown.freezeWorldMatrix();
                if (i < 40) this.shadows.addShadowCaster(crown);
            }
        }
        trunk.isVisible = false;
        crowns.forEach((mesh) => {
            mesh.isVisible = false;
        });
    }
}
