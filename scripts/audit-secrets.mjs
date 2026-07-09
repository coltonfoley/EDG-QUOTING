import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const MAX_SCANNED_FILE_BYTES = 5 * 1024 * 1024;

const secretPatterns = [
  { name: "PEM private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: "GitHub personal access token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "OpenAI API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
];

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  return output.split("\0").filter(Boolean);
}

const findings = [];
let scannedFiles = 0;
let skippedLargeFiles = 0;
let skippedBinaryFiles = 0;

for (const file of trackedFiles()) {
  if (!existsSync(file)) {
    continue;
  }

  const size = statSync(file).size;
  if (size > MAX_SCANNED_FILE_BYTES) {
    skippedLargeFiles += 1;
    continue;
  }

  const buffer = readFileSync(file);
  if (buffer.includes(0)) {
    skippedBinaryFiles += 1;
    continue;
  }

  scannedFiles += 1;
  const text = buffer.toString("utf8");
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(text)) {
      findings.push({ file, type: name });
    }
  }
}

console.log(JSON.stringify({
  scannedFiles,
  skippedLargeFiles,
  skippedBinaryFiles,
  findings,
}, null, 2));

if (findings.length > 0) {
  console.error("Secret audit failed. Remove or rotate the reported tracked credentials.");
  process.exitCode = 1;
}
