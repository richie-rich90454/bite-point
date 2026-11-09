#!/usr/bin/env node
// Fails if a runtime asset under src/assets is missing from assets.json, if a
// registry entry points at a missing file, or if any recorded SHA-256 differs.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "src", "assets");
const registryPath = join(assetsDir, "assets.json");
const runtimeExtensions = new Set([
    ".jpg", ".jpeg", ".png", ".ktx2", ".glb", ".gltf", ".hdr", ".exr",
    ".woff", ".woff2", ".ttf", ".otf",
    ".ogg", ".mp3", ".wav", ".m4a", ".flac",
]);

const toRepoPath = (absolute) => relative(root, absolute).split(sep).join("/");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

async function walk(dir, out = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const absolute = join(dir, entry.name);
        if (entry.isDirectory()) {
            await walk(absolute, out);
        } else if (entry.isFile() && !entry.name.startsWith(".")) {
            out.push(absolute);
        }
    }
    return out;
}

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const entries = Array.isArray(registry) ? registry : registry.assets;
if (!Array.isArray(entries)) throw new Error("assets.json must contain an assets array");

const byPath = new Map(entries.map((entry) => [entry.path, entry]));
const errors = [];
const seen = new Set();

const files = (await walk(assetsDir)).filter((absolute) => {
    const name = relative(assetsDir, absolute).split(sep).join("/");
    if (name === "assets.json") return false;
    if (name.split("/").some((part) => part.startsWith("LICENSE"))) return false;
    return runtimeExtensions.has(extname(absolute).toLowerCase());
});

for (const absolute of files) {
    const path = toRepoPath(absolute);
    seen.add(path);
    const entry = byPath.get(path);
    if (!entry) {
        errors.push(`MISSING registry entry: ${path}`);
        continue;
    }
    const actual = sha256(await readFile(absolute));
    if (entry.sha256 !== actual) {
        errors.push(`SHA-256 mismatch: ${path}\n  registry ${entry.sha256}\n  actual   ${actual}`);
    }
}

for (const entry of entries) {
    if (!seen.has(entry.path)) errors.push(`STALE registry entry (file not found): ${entry.path}`);
}

if (errors.length > 0) {
    console.error(errors.join("\n"));
    console.error(`\n${errors.length} provenance error(s) across ${files.length} runtime asset(s).`);
    process.exit(1);
}

console.log(`All ${files.length} runtime assets match assets.json (SHA-256 verified).`);
