#!/usr/bin/env node
// Converts every source JPG under src/assets/textures/** to a deterministic
// KTX2 (ETC1S + mipmaps) next to it. The JPG is the runtime fallback and the
// offline source of truth; no network access is performed.
//
// Usage:
//   node scripts/build-textures.mjs            # encode missing .ktx2 files
//   node scripts/build-textures.mjs --force    # re-encode everything
//   node scripts/build-textures.mjs --verify   # re-encode and compare SHA-256
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeToKTX2 } from "ktx2-encoder";
import jpeg from "jpeg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const texturesDir = join(root, "src", "assets", "textures");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// ETC1S at quality 128 is deterministic and roughly 10x smaller than UASTC.
// Supercompression is off so any KTX2 transcoder can read the files.
const ENCODE = {
    isUASTC: false,
    generateMipmap: true,
    qualityLevel: 128,
    compressionLevel: 2,
    needSupercompression: false,
};

function roleOptions(role) {
    if (role === "normal") {
        return { ...ENCODE, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false };
    }
    if (role === "arm") {
        return { ...ENCODE, isPerceptual: false, isSetKTX2SRGBTransferFunc: false };
    }
    return { ...ENCODE, isPerceptual: true, isSetKTX2SRGBTransferFunc: true };
}

function roleOf(file) {
    if (file.endsWith("-normal.jpg")) return "normal";
    if (file.endsWith("-arm.jpg")) return "arm";
    if (file.endsWith("-color.jpg")) return "color";
    throw new Error(`Unrecognised texture map name: ${file}`);
}

async function decodeJpeg(buffer) {
    const { width, height, data } = jpeg.decode(buffer, { useTArray: true });
    return { width, height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

async function textureSources() {
    const sets = await readdir(texturesDir, { withFileTypes: true });
    const files = [];
    for (const set of sets) {
        if (!set.isDirectory()) continue;
        const dir = join(texturesDir, set.name);
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith(".jpg")) {
                files.push(join(dir, entry.name));
            }
        }
    }
    return files.sort();
}

const args = new Set(process.argv.slice(2));
const verify = args.has("--verify");
const force = args.has("--force");
const sources = await textureSources();
if (sources.length === 0) throw new Error("No source JPGs found under src/assets/textures");

let encoded = 0;
let skipped = 0;
let failed = 0;
for (const source of sources) {
    const target = source.replace(/\.jpg$/, ".ktx2");
    const rel = relative(root, source).split(sep).join("/");
    const role = roleOf(source);
    if (!verify && !force && (await stat(target).catch(() => null))) {
        skipped += 1;
        continue;
    }
    const input = new Uint8Array(await readFile(source));
    const { width, height } = await decodeJpeg(input);
    const output = await encodeToKTX2(input, {
        ...roleOptions(role),
        imageDecoder: decodeJpeg,
        kvData: { source: rel, role },
    });
    if (verify) {
        const existing = await readFile(target).catch(() => null);
        if (!existing) {
            console.error(`MISSING ${relative(root, target)}`);
            failed += 1;
            continue;
        }
        const actual = sha256(existing);
        const expected = sha256(output);
        if (actual !== expected) {
            console.error(`MISMATCH ${relative(root, target)} (${actual} != ${expected})`);
            failed += 1;
            continue;
        }
        console.log(`OK ${relative(root, target)} ${width}x${height} ${existing.byteLength} B ${actual}`);
    } else {
        await writeFile(target, output);
        console.log(`WROTE ${relative(root, target)} ${width}x${height} ${output.byteLength} B ${sha256(output)}`);
        encoded += 1;
    }
}

console.log(`\n${sources.length} source maps: ${encoded} encoded, ${skipped} up-to-date, ${failed} failed.`);
if (failed > 0) process.exit(1);
