# Gravel Road - asset provenance

- Texture set: Gravel Road
- Author(s): Amal Kumar
- Source page: https://polyhaven.com/a/gravel_road
- Publisher: Poly Haven (https://polyhaven.com)
- License: CC0 1.0 Universal (public domain dedication)
- License URLs: https://creativecommons.org/publicdomain/zero/1.0/ and https://polyhaven.com/license
- Source resolution: 2048 x 2048 pixels per map
- Processing: Poly Haven 2K JPEGs are kept unmodified as the runtime fallback. KTX2 files are deterministically derived from those JPEGs by `node scripts/build-textures.mjs` using ktx2-encoder 0.6.0 (Basis Universal ETC1S, quality 128, compression level 2, full mip chain, no supercompression; normal maps use the normal-map preset and linear color space).

No attribution is required under CC0. Credits and checksums are retained here for provenance.

| Map | Contents | Download | Runtime files (SHA-256) |
| --- | --- | --- | --- |
| color | Diffuse (sRGB albedo) | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/gravel_road/gravel_road_diff_2k.jpg) | `gravel-color.jpg` (6313bb65816f2890a247cb9a5bae003ddef98cf55099d5abaf543a88e0ab3180)<br>`gravel-color.ktx2` (36118e590b76206d173aca77f80d8f667a1089ce9d815afff7d9471f2a052a13) |
| normal | OpenGL tangent-space normal | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/gravel_road/gravel_road_nor_gl_2k.jpg) | `gravel-normal.jpg` (4fc9dfc7ebfe58e531225dc55b9c89d89c1abb51670e62da086f2a8fa4fb71db)<br>`gravel-normal.ktx2` (2fc056102e89d260851b7f010d93e5febae503c4660380005dcef4eafa35f8f4) |
| arm | Ambient occlusion / roughness / metalness | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/gravel_road/gravel_road_arm_2k.jpg) | `gravel-arm.jpg` (0ee75272a5fe1aec2f7f894fa1757bd69fb3a7baa88172383bf35af85b763fb7)<br>`gravel-arm.ktx2` (98d1007076a3e4598bbeb5904f4149001a77aac49d0dfc6f3cf20ee2519f29af) |
