# Rock Face - asset provenance

- Texture set: Rock Face
- Author(s): Greg Zaal (photography), Dario Barresi (processing)
- Source page: https://polyhaven.com/a/rock_face
- Publisher: Poly Haven (https://polyhaven.com)
- License: CC0 1.0 Universal (public domain dedication)
- License URLs: https://creativecommons.org/publicdomain/zero/1.0/ and https://polyhaven.com/license
- Source resolution: 2048 x 2048 pixels per map
- Processing: Poly Haven 2K JPEGs are kept unmodified as the runtime fallback. KTX2 files are deterministically derived from those JPEGs by `node scripts/build-textures.mjs` using ktx2-encoder 0.6.0 (Basis Universal ETC1S, quality 128, compression level 2, full mip chain, no supercompression; normal maps use the normal-map preset and linear color space).

No attribution is required under CC0. Credits and checksums are retained here for provenance.

| Map | Contents | Download | Runtime files (SHA-256) |
| --- | --- | --- | --- |
| color | Diffuse (sRGB albedo) | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rock_face/rock_face_diff_2k.jpg) | `rock-color.jpg` (b989c832327538a9e546cca359417acb9a657d041f300407e8398daaf743f5bc)<br>`rock-color.ktx2` (10332f29add6c75e21c175e71a390cba20abe8262a924645fdb9bbd82e3fb497) |
| normal | OpenGL tangent-space normal | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rock_face/rock_face_nor_gl_2k.jpg) | `rock-normal.jpg` (352b87db2502d54487b0ed8abdfb621fae2abf7d360a281b419f567346178cf0)<br>`rock-normal.ktx2` (5bcf692dd2a5bc53dbcf3ea30349cefa79487836a15d4eccbaed595ef930e4f0) |
| arm | Ambient occlusion / roughness / metalness | [download](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rock_face/rock_face_arm_2k.jpg) | `rock-arm.jpg` (7cb37a227ba58b0048289a9032e386656d10190cdf89d90e57625b3ef75a8c7a)<br>`rock-arm.ktx2` (452d1e02b5ccdff0bcd5a7682d7f1fc6d2698fe314d061fe64cdedb755b91c28) |
