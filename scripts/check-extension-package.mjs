import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packageRoot = ".";
const requiredFiles = [
  "manifest.json",
  "index.html",
  "background.js",
  "samuel.webp",
  "assets"
];

const missing = requiredFiles.filter((file) => !existsSync(join(packageRoot, file)));

if (missing.length > 0) {
  console.error("Chrome Store package check failed.");
  console.error("Missing from dist/:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(packageRoot, "manifest.json"), "utf8"));
const assets = readdirSync(join(packageRoot, "assets"));

if (manifest.manifest_version !== 3) {
  console.error("Chrome Store package check failed: manifest_version must be 3.");
  process.exit(1);
}

if (manifest.background?.service_worker !== "background.js") {
  console.error("Chrome Store package check failed: manifest.json must point to background.js.");
  process.exit(1);
}

if (!assets.some((file) => file.endsWith(".css")) || !assets.some((file) => file.endsWith(".js"))) {
  console.error("Chrome Store package check failed: assets/ must include built JS and CSS files.");
  process.exit(1);
}

console.log("Chrome Store package check passed.");
console.log(`Checked ${packageRoot}/`);
console.log("Zip the extension files from this folder so manifest.json is at the zip root.");
