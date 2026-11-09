# Grass Ground - asset provenance

- Texture set: Grass Ground
- Author(s): Charlotte Baglioni
- Source page: https://polyhaven.com/a/grass_ground
- Publisher: Poly Haven (https://polyhaven.com)
- License: CC0 1.0 Universal (public domain dedication)
- License URLs: https://creativecommons.org/publicdomain/zero/1.0/ and https://polyhaven.com/license
- Source resolution: 2048 x 2048 pixels per map
- Processing: Poly Haven 2K JPEGs are kept unmodified as the runtime fallback. KTX2 files are deterministically derived from those JPEGs by `node scripts/build-textures.mjs` using ktx2-encoder 0.6.0 (Basis Universal ETC1S, quality 128, compression level 2, full mip chain, no supercompression; normal maps use the normal-map preset and linear color space).

No attribution is required under CC0. Credits and checksums are retained here for provenance.

| Map | Contents | Download | Runtime files (SHA-256) |
| --- | --- | --- | --- |
| color | Diffuse (sRGB albedo) | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/grass_ground/grass_ground_diff_2k.jpg) | `grass-color.jpg` (4272bddc71a7fa659d1deeb13a9df8c42e68a5ac8cde7523187e4a081e028258)<br>`grass-color.ktx2` (cd537ef9ad4bbb15f5e3a5c71d10e7cd3701c1ebda2dc1039f1c704b684317a4) |
| normal | OpenGL tangent-space normal | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/grass_ground/grass_ground_nor_gl_2k.jpg) | `grass-normal.jpg` (effa95c06af273c974476d9a74a234668a1c9292f60fffb4fa40348d638ee7f3)<br>`grass-normal.ktx2` (d9934d4ad3ede800545c84c0127eef4e4dbe251a870ead8bf2d6456c8238e358) |
| arm | Ambient occlusion / roughness / metalness | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/grass_ground/grass_ground_arm_2k.jpg) | `grass-arm.jpg` (79554d3cb2c1cbf4351960e16bc6bba004fa3112d256ff1b500ac994694b5673)<br>`grass-arm.ktx2` (4799e055ae56d585281a0dd6771ca01f3424b649e3769676f6d50853c55e1038) |
