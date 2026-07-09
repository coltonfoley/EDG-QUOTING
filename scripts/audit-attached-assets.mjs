import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const assetRoot = path.join(root, "attached_assets");
const backupRoot = process.env.RAINMAKER_ASSET_BACKUP_DIR;

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
const trackedAssetFiles = trackedFiles.filter((file) => file.startsWith("attached_assets/"));
const missingTrackedAssets = trackedAssetFiles.filter((file) => !existsSync(path.join(root, file)));
const assetFiles = trackedAssetFiles.filter((file) => existsSync(path.join(root, file)));
const sourceFiles = trackedFiles.filter((file) =>
  !file.startsWith("attached_assets/") &&
  /\.(?:ts|tsx|js|mjs|cjs|json|html|md|css)$/.test(file),
);
const sourceText = sourceFiles.map((file) => {
  try {
    return readFileSync(path.join(root, file), "utf8");
  } catch {
    return "";
  }
}).join("\n");

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const assets = assetFiles.map((file) => {
  const absolutePath = path.join(root, file);
  const filename = path.basename(file);
  const extension = path.extname(file).toLowerCase() || "[none]";
  const bytes = statSync(absolutePath).size;
  const hash = sha256(absolutePath);
  const referenced = sourceText.includes(filename) || sourceText.includes(file);
  let containsPrivateKey = false;

  if ([".txt", ".md", ".json", ".env", "[none]"].includes(extension) && bytes <= 5 * 1024 * 1024) {
    const text = readFileSync(absolutePath, "utf8");
    containsPrivateKey = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text);
  }

  let backupVerified = null;
  if (backupRoot) {
    const backupPath = path.join(backupRoot, path.relative(assetRoot, absolutePath));
    try {
      backupVerified = statSync(backupPath).size === bytes && sha256(backupPath) === hash;
    } catch {
      backupVerified = false;
    }
  }

  return { file, extension, bytes, sha256: hash, referenced, containsPrivateKey, backupVerified };
});

const extensionCounts = Object.fromEntries(
  Array.from(new Set(assets.map((asset) => asset.extension))).sort().map((extension) => [
    extension,
    assets.filter((asset) => asset.extension === extension).length,
  ]),
);

const report = {
  fileCount: assets.length,
  missingTrackedAssets,
  totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
  referencedFiles: assets.filter((asset) => asset.referenced).map((asset) => asset.file),
  unreferencedCount: assets.filter((asset) => !asset.referenced).length,
  privateKeyFiles: assets.filter((asset) => asset.containsPrivateKey).map((asset) => asset.file),
  extensionCounts,
  backup: backupRoot ? {
    directory: backupRoot,
    verified: assets.filter((asset) => asset.backupVerified === true).length,
    failed: assets.filter((asset) => asset.backupVerified === false).map((asset) => asset.file),
  } : null,
};

console.log(JSON.stringify(report, null, 2));

if (report.backup?.failed.length) {
  process.exitCode = 1;
}
