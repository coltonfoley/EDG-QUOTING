import { randomUUID } from "node:crypto";

const SENSITIVE_PATHS = [
  /^\/api\/signatures\/[^/]+/,
  /^\/api\/planning-agreement-signatures\/[^/]+/,
];

export function createRequestId() {
  return randomUUID();
}

export function redactedRequestPath(path: string) {
  for (const pattern of SENSITIVE_PATHS) {
    if (pattern.test(path)) {
      return path.replace(pattern, (match) => {
        const prefix = match.slice(0, match.lastIndexOf("/") + 1);
        return `${prefix}:token`;
      });
    }
  }

  return path;
}
