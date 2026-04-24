import { existsSync } from "node:fs";
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
  external: ["./vite"],
  format: "esm",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  outfile: path.join(functionDir, "api/index.js"),
  sourcemap: true,
});

console.log("Bundled api/index.ts into the Vercel function output.");
