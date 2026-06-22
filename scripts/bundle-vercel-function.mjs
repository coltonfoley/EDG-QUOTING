import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";

const outputDir = path.resolve(".vercel/output");
const staticSourceDir = path.resolve("dist/public");
const staticOutputDir = path.join(outputDir, "static");
const functionDir = path.resolve(".vercel/output/functions/api/index.func");

if (!existsSync(staticSourceDir)) {
  throw new Error("Missing dist/public. Run `npm run build` before bundling the Vercel output.");
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(staticSourceDir, staticOutputDir, { recursive: true });
mkdirSync(path.join(functionDir, "api"), { recursive: true });

await build({
  entryPoints: ["server/vercelHandler.ts"],
  bundle: true,
  platform: "node",
  external: ["./vite", "bufferutil", "pg-native", "utf-8-validate"],
  format: "esm",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  outfile: path.join(functionDir, "api/index.js"),
  sourcemap: true,
});

writeFileSync(
  path.join(functionDir, "package.json"),
  JSON.stringify({ type: "module" }, null, 2),
);

writeFileSync(
  path.join(functionDir, ".vc-config.json"),
  JSON.stringify(
    {
      handler: "api/index.js",
      runtime: "nodejs22.x",
      architecture: "arm64",
      maxDuration: 300,
      environment: {},
      shouldDisableAutomaticFetchInstrumentation: false,
      launcherType: "Nodejs",
      shouldAddHelpers: true,
      shouldAddSourcemapSupport: true,
      awsLambdaHandler: "",
    },
    null,
    2,
  ),
);

writeFileSync(
  path.join(outputDir, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: "filesystem" },
        { src: "^/health$", dest: "/api/index?__path=%2Fhealth", check: true },
        { src: "^/api$", dest: "/api/index?__path=%2Fapi", check: true },
        { src: "^/api(?:/(.*))$", dest: "/api/index?__path=%2Fapi%2F$1", check: true },
        { src: "^/quote-images(?:/(.*))$", dest: "/api/index?__path=%2Fquote-images%2F$1", check: true },
        { src: "^(?:/(.*))$", dest: "/index.html", check: true },
      ],
      framework: {
        version: "5.4.19",
      },
      crons: [],
    },
    null,
    2,
  ),
);

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

console.log("Prepared static assets and bundled api/index.ts into .vercel/output.");
