import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";

const maxBlobBytes = Number(process.env.HISTORY_KEY_AUDIT_MAX_BLOB_BYTES || 5 * 1024 * 1024);
const failOnFindings = process.env.HISTORY_KEY_AUDIT_FAIL_ON_FINDINGS === "true";

if (!Number.isFinite(maxBlobBytes) || maxBlobBytes <= 0) {
  throw new Error("HISTORY_KEY_AUDIT_MAX_BLOB_BYTES must be a positive number.");
}

const pemDashes = "-----";
const pemBegin = `${pemDashes}BEGIN `;
const pemEnd = `${pemDashes}END `;
const keyMarkers = [
  { name: "PKCS#8 private key", label: "PRIVATE KEY" },
  { name: "encrypted PKCS#8 private key", label: "ENCRYPTED PRIVATE KEY" },
  { name: "RSA private key", label: "RSA PRIVATE KEY" },
  { name: "EC private key", label: "EC PRIVATE KEY" },
  { name: "OpenSSH private key", label: "OPENSSH PRIVATE KEY" },
  { name: "DSA private key", label: "DSA PRIVATE KEY" },
].map((marker) => ({
  name: marker.name,
  pattern: new RegExp(`${pemBegin}${marker.label}${pemDashes}`),
}));

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
}

const reachableObjects = git(["rev-list", "--objects", "--all"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const objectPaths = new Map();
for (const line of reachableObjects) {
  const separator = line.indexOf(" ");
  const objectId = separator === -1 ? line : line.slice(0, separator);
  const path = separator === -1 ? null : line.slice(separator + 1);
  if (!objectPaths.has(objectId)) objectPaths.set(objectId, path);
}

const objectIds = [...objectPaths.keys()];
const batchInput = `${objectIds.join("\n")}\n`;
const checks = git(
  ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
  { input: batchInput, encoding: "utf8" },
).split("\n").filter(Boolean);

const blobSizes = new Map();
const missingObjects = [];
let skippedLargeBlobs = 0;

for (const line of checks) {
  const [objectId, objectType, rawSize] = line.split(" ");
  if (objectType === "missing") {
    missingObjects.push(objectId);
    continue;
  }
  if (objectType !== "blob") continue;

  const size = Number(rawSize);
  if (size > maxBlobBytes) {
    skippedLargeBlobs += 1;
    continue;
  }
  blobSizes.set(objectId, size);
}

const candidateIds = [...blobSizes.keys()];
const contentBatch = candidateIds.length
  ? git(["cat-file", "--batch"], { input: `${candidateIds.join("\n")}\n` })
  : Buffer.alloc(0);

const validPrivateKeys = [];
const unverifiedPrivateKeyMarkers = [];
let offset = 0;

for (const expectedId of candidateIds) {
  const headerEnd = contentBatch.indexOf(0x0a, offset);
  if (headerEnd === -1) throw new Error(`Missing cat-file header for ${expectedId}.`);

  const header = contentBatch.subarray(offset, headerEnd).toString("utf8");
  const [objectId, objectType, rawSize] = header.split(" ");
  if (objectId !== expectedId || objectType !== "blob") {
    throw new Error(`Unexpected cat-file response for ${expectedId}: ${header}`);
  }

  const size = Number(rawSize);
  const contentStart = headerEnd + 1;
  const contentEnd = contentStart + size;
  const content = contentBatch.subarray(contentStart, contentEnd).toString("utf8");
  const normalizedContent = content.replace(/\\n/g, "\n");
  const validatedFingerprints = new Set();

  const pemPattern = new RegExp(
    `${pemBegin}([A-Z0-9 ]*PRIVATE KEY)${pemDashes}[\\s\\S]*?${pemEnd}\\1${pemDashes}`,
    "g",
  );
  for (const match of normalizedContent.matchAll(pemPattern)) {
    try {
      const privateKey = createPrivateKey(match[0]);
      const publicKeyDer = createPublicKey(privateKey).export({ type: "spki", format: "der" });
      const publicKeySha256 = createHash("sha256").update(publicKeyDer).digest("hex");
      if (validatedFingerprints.has(publicKeySha256)) continue;
      validatedFingerprints.add(publicKeySha256);
      validPrivateKeys.push({
        objectId,
        path: objectPaths.get(objectId),
        keyType: privateKey.asymmetricKeyType || "unknown",
        publicKeySha256,
      });
    } catch {
      // Marker-only examples and encrypted keys without a passphrase are
      // reported separately below; key material is never printed.
    }
  }

  for (const marker of keyMarkers) {
    if (marker.pattern.test(normalizedContent) && validatedFingerprints.size === 0) {
      unverifiedPrivateKeyMarkers.push({
        objectId,
        path: objectPaths.get(objectId),
        marker: marker.name,
      });
    }
  }

  offset = contentEnd + 1;
}

const report = {
  reachableObjectCount: objectIds.length,
  scannedBlobCount: candidateIds.length,
  skippedLargeBlobCount: skippedLargeBlobs,
  maxBlobBytes,
  missingObjects,
  validPrivateKeys,
  unverifiedPrivateKeyMarkers,
};

console.log(JSON.stringify(report, null, 2));

if (missingObjects.length) process.exitCode = 3;
if (failOnFindings && (validPrivateKeys.length || unverifiedPrivateKeyMarkers.length)) {
  process.exitCode = 2;
}
