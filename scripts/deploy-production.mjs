import { spawnSync } from "node:child_process";

const scope = process.env.VERCEL_SCOPE || "edgpatioshade";
const dryRun = process.argv.includes("--dry-run");

const steps = [
  ["npm", ["run", "vercel:build-output"]],
  [
    "npx",
    [
      "vercel@latest",
      "deploy",
      "--prebuilt",
      "--prod",
      "--scope",
      scope,
      "--yes",
    ],
  ],
  ["npm", ["run", "deploy:prod:verify"]],
];

function run(command, args) {
  console.log(`$ ${command} ${args.join(" ")}`);

  if (dryRun) {
    return;
  }

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (dryRun) {
  console.log("Dry run only. No build or deployment will be started.");
}

for (const [command, args] of steps) {
  run(command, args);
}

if (!dryRun) {
  console.log("Production deploy completed and smoke checks passed.");
}
