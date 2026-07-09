import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const appName = "Rainmaker";
const defaultHealthUrl = "https://rainmaker-staging.edgpatioshade.com/health";
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;

const requiredScripts = [
  "check",
  "build",
  "env:check",
  "vercel:bundle-function",
  "storage:inventory",
  "storage:migrate-to-blob",
];

const requiredFiles = [
  "api/index.ts",
  "vercel.json",
  "scripts/bundle-vercel-function.mjs",
  "scripts/migrate-quote-images-to-blob.mjs",
  "scripts/storage-inventory.mjs",
  "scripts/validate-env.mjs",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function output(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }

  return result.stdout.trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function checkPackageScripts() {
  const packageJson = readJson("package.json");
  const missing = requiredScripts.filter((script) => !packageJson.scripts?.[script]);

  if (missing.length) {
    throw new Error(`Missing package scripts: ${missing.join(", ")}`);
  }

  console.log(`ok package scripts: ${requiredScripts.join(", ")}`);
}

function checkRequiredFiles() {
  for (const file of requiredFiles) {
    readFileSync(file);
  }

  console.log(`ok required files: ${requiredFiles.length}`);
}

function checkGitStatus() {
  const status = output("git", ["status", "--short"]);

  if (!status) {
    console.log("ok git working tree is clean");
    return;
  }

  console.log("warn git working tree has local changes:");
  console.log(status);

  if (process.env.PREFLIGHT_REQUIRE_CLEAN === "true") {
    throw new Error("Working tree must be clean when PREFLIGHT_REQUIRE_CLEAN=true.");
  }
}

async function checkHealth() {
  const healthUrl = process.env.PREFLIGHT_HEALTH_URL || defaultHealthUrl;

  if (healthUrl === "skip") {
    console.log("skip health check");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${healthUrl} returned HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const payload = JSON.parse(text);
    if (payload.status !== "ok") {
      throw new Error(`${healthUrl} returned unexpected payload: ${text.slice(0, 200)}`);
    }

    console.log(`ok health: ${healthUrl}`);
  } finally {
    clearTimeout(timeout);
  }
}

function runLocalChecks() {
  if (process.env.PREFLIGHT_SKIP_LOCAL_CHECKS === "true") {
    console.log("skip local check/build");
    return;
  }

  run(npmBin, ["run", "check"]);
  run(npmBin, ["run", "build"]);
}

function checkScriptSyntax() {
  run(nodeBin, ["--check", "scripts/migrate-quote-images-to-blob.mjs"]);
  run(nodeBin, ["--check", "scripts/storage-inventory.mjs"]);
  run(nodeBin, ["--check", "scripts/validate-env.mjs"]);
}

async function main() {
  console.log(`${appName} cutover preflight`);
  console.log("===========================");
  checkGitStatus();
  checkPackageScripts();
  checkRequiredFiles();
  checkScriptSyntax();
  await checkHealth();
  runLocalChecks();
  console.log("\nPreflight passed.");
}

main().catch((error) => {
  console.error(`\nPreflight failed: ${error.message}`);
  process.exit(1);
});
