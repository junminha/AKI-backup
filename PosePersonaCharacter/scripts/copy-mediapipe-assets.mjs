import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = resolve(scriptDirectory, "..");
const source = resolve(rootDirectory, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = resolve(rootDirectory, "public", "mediapipe", "wasm");

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });
console.log("MediaPipe WASM assets are ready.");
