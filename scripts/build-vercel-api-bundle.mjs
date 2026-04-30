import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

export async function buildVercelApiBundle(outfile = "dist/api/index.js") {
  const outputPath = path.resolve(outfile);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  rmSync(`${outputPath}.map`, { force: true });

  await build({
    entryPoints: ["server/vercelHandler.ts"],
    bundle: true,
    platform: "node",
    external: ["./vite", "bufferutil", "pg-native", "utf-8-validate"],
    format: "esm",
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
    outfile: outputPath,
    sourcemap: process.env.VERCEL_API_SOURCEMAP === "true",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildVercelApiBundle(process.argv[2]);
}
