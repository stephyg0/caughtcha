import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const required = ["manifest.json", "index.html", "background.js", "samuel.webp", "assets"];

for (const item of required) {
  if (!existsSync(join("dist", item))) {
    console.error(`Missing dist/${item}. Build did not produce a complete extension package.`);
    process.exit(1);
  }
}

rmSync("assets", { recursive: true, force: true });

for (const item of required) {
  cpSync(join("dist", item), item, { recursive: true });
}

console.log("Synced built extension files to the caughtcha folder root.");
