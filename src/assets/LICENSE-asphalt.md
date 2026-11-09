# Asphalt 02 - asset provenance

- Texture set: Asphalt 02
- Author(s): Rob Tuytel
- Source page: https://polyhaven.com/a/asphalt_02
- Publisher: Poly Haven (https://polyhaven.com)
- License: CC0 1.0 Universal (public domain dedication)
- License URLs: https://creativecommons.org/publicdomain/zero/1.0/ and https://polyhaven.com/license
- Source resolution: 2048 x 2048 pixels per map
- Processing: Poly Haven 2K JPEGs are kept unmodified as the runtime fallback. KTX2 files are deterministically derived from those JPEGs by `node scripts/build-textures.mjs` using ktx2-encoder 0.6.0 (Basis Universal ETC1S, quality 128, compression level 2, full mip chain, no supercompression; normal maps use the normal-map preset and linear color space).

No attribution is required under CC0. Credits and checksums are retained here for provenance.

| Map | Contents | Download | Runtime files (SHA-256) |
| --- | --- | --- | --- |
| color | Diffuse (sRGB albedo) | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/asphalt_02/asphalt_02_diff_2k.jpg) | `asphalt-color.jpg` (28f5ba8690553f192c0e5e1a5ff40f34765b4b93f4cc7059b1a3e9c795b6c28c)<br>`asphalt-color.ktx2` (7c184a068fdb0d82629ea535a917a3d3e9af048a7a6c508df5c798336a8e35f5) |
| normal | OpenGL tangent-space normal | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/asphalt_02/asphalt_02_nor_gl_2k.jpg) | `asphalt-normal.jpg` (ffe49db71a0fd34c1e259625df66a302a237597d6ef655307987ec4e45bc6f21)<br>`asphalt-normal.ktx2` (891f20755613f43c82067fbf32b73b845b209ef3b6fe256eb0cbfd730cd744cc) |
| arm | Ambient occlusion / roughness / metalness | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/asphalt_02/asphalt_02_arm_2k.jpg) | `asphalt-arm.jpg` (ed70e88640e4ed51cf1c3e57cb20db26983599b20b867c2526439e3a2c849fea)<br>`asphalt-arm.ktx2` (0c3d0f7c7dff404843764f0eb4b02e0d64fcf4291ea20585e4c795834d7807c5) |
