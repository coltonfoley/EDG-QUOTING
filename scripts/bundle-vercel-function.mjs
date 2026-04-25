import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";

const functionDir = path.resolve(".vercel/output/functions/api/index.func");

if (!existsSync(functionDir)) {
  throw new Error("Missing Vercel function output. Run `vercel build --target=preview` first.");
}

await build({
  entryPoints: ["api/index.ts"],
  bundle: true,
  platform: "node",
  packages: "external",
  external: ["./vite"],
  format: "esm",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  outfile: path.join(functionDir, "api/index.js"),
  sourcemap: true,
});

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const sharpVersion =
  packageJson.dependencies?.sharp ||
  packageJson.devDependencies?.sharp;

if (sharpVersion) {
  const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const sharpLock = packageLock.packages?.["node_modules/sharp"];
  const sharpLinuxArm64Version = sharpLock?.optionalDependencies?.["@img/sharp-linux-arm64"];
  const sharpLibvipsLinuxArm64Version = sharpLock?.optionalDependencies?.["@img/sharp-libvips-linux-arm64"];

  if (!sharpLinuxArm64Version || !sharpLibvipsLinuxArm64Version) {
    throw new Error("Could not determine Linux ARM64 Sharp optional dependency versions from package-lock.json.");
  }

  const sharpTempDir = mkdtempSync(path.join(os.tmpdir(), "rainmaker-sharp-"));
  const install = spawnSync(
    "npm",
    [
      "install",
      "--prefix",
      sharpTempDir,
      "--force",
      `@img/sharp-linux-arm64@${sharpLinuxArm64Version}`,
      `@img/sharp-libvips-linux-arm64@${sharpLibvipsLinuxArm64Version}`,
    ],
    { stdio: "inherit" }
  );

  if (install.status !== 0) {
    throw new Error("Failed to install Linux ARM64 Sharp assets into the Vercel function output.");
  }

  for (const packageName of [
    "@img/sharp-linux-arm64",
    "@img/sharp-libvips-linux-arm64",
  ]) {
    const source = path.join(sharpTempDir, "node_modules", ...packageName.split("/"));
    const destination = path.join(functionDir, "node_modules", ...packageName.split("/"));

    if (!existsSync(source)) {
      throw new Error(`Missing ${packageName} after Linux ARM64 Sharp install.`);
    }

    mkdirSync(path.dirname(destination), { recursive: true });
    rmSync(destination, { recursive: true, force: true });
    cpSync(source, destination, { recursive: true });
  }

  rmSync(sharpTempDir, { recursive: true, force: true });
}

console.log("Bundled api/index.ts into the Vercel function output.");
