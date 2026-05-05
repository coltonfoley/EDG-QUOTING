import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const projectName = "Rainmaker";
const projectRoot = process.cwd();
const nodeEnv = process.env.NODE_ENV || "development";
const envFiles = [
  ".env",
  `.env.${nodeEnv}`,
  ...(nodeEnv === "test" ? [] : [".env.local"]),
  `.env.${nodeEnv}.local`,
];

const env = {};
const loadedFiles = [];

for (const fileName of envFiles) {
  const filePath = path.join(projectRoot, fileName);

  if (!existsSync(filePath)) continue;

  const parsed = dotenv.parse(readFileSync(filePath));
  Object.assign(env, parsed);
  loadedFiles.push(fileName);
}

Object.assign(env, process.env);

const errors = [];
const warnings = [];

function has(name) {
  return typeof env[name] === "string" && env[name].trim().length > 0;
}

function value(name, fallback = "") {
  return has(name) ? env[name].trim() : fallback;
}

function requireVars(names, reason) {
  for (const name of names) {
    if (!has(name)) {
      errors.push(`${name} is required. ${reason}`);
    }
  }
}

function requireOneOf(names, reason) {
  if (!names.some(has)) {
    errors.push(`One of ${names.join(", ")} is required. ${reason}`);
  }
}

function allowValue(name, allowed, fallback) {
  const current = value(name, fallback);

  if (!allowed.includes(current)) {
    errors.push(`${name} must be one of: ${allowed.join(", ")}.`);
  }

  return current;
}

function warnMissing(name, reason) {
  if (!has(name)) {
    warnings.push(`${name} is not set. ${reason}`);
  }
}

const isProduction = value("NODE_ENV") === "production";

requireVars(["DATABASE_URL", "SESSION_SECRET"], "The app needs these before it can start reliably.");

if (isProduction) {
  requireOneOf(["APP_BASE_URL", "VERCEL_URL"], "Production email links and redirects need the public app URL.");
} else if (!has("APP_BASE_URL")) {
  warnings.push("APP_BASE_URL is not set. Local links will fall back to Replit/localhost behavior.");
}

if (isProduction && has("APP_BASE_URL") && value("APP_BASE_URL").includes("localhost")) {
  errors.push("APP_BASE_URL points at localhost in production.");
}

const googleAuthEnabled = has("GOOGLE_AUTH_CLIENT_ID") || has("GOOGLE_AUTH_CLIENT_SECRET");
if (googleAuthEnabled) {
  requireVars(
    ["GOOGLE_AUTH_CLIENT_ID", "GOOGLE_AUTH_CLIENT_SECRET"],
    "Google Workspace sign-in needs OAuth client credentials."
  );

  const allowedDomain = value("GOOGLE_AUTH_ALLOWED_DOMAINS", value("GOOGLE_AUTH_ALLOWED_DOMAIN", "edgpatioshade.com"));
  if (!allowedDomain.includes("edgpatioshade.com")) {
    warnings.push("GOOGLE_AUTH_ALLOWED_DOMAIN(S) does not include edgpatioshade.com.");
  }
} else {
  warnings.push("Google Workspace sign-in is not configured. Password login remains available.");
}

const storageProvider = allowValue("OBJECT_STORAGE_PROVIDER", ["replit", "vercel-blob"], "replit");

if (storageProvider === "replit") {
  requireVars(
    ["PRIVATE_OBJECT_DIR", "PUBLIC_OBJECT_SEARCH_PATHS"],
    "Replit object storage needs the private bucket path and public search paths."
  );
  warnings.push("OBJECT_STORAGE_PROVIDER is still replit. Use vercel-blob for the Vercel storage target.");
} else if (storageProvider === "vercel-blob") {
  requireVars(["BLOB_READ_WRITE_TOKEN"], "Vercel Blob uploads need the project Blob token.");
}

const emailProvider = allowValue(
  "EMAIL_PROVIDER",
  ["replit-gmail", "google-workspace-gmail", "resend"],
  "replit-gmail"
);

if (emailProvider === "replit-gmail") {
  requireVars(["REPLIT_CONNECTORS_HOSTNAME"], "Replit Gmail needs the connector hostname.");
  requireOneOf(["REPL_IDENTITY", "WEB_REPL_RENEWAL"], "Replit Gmail needs one connector token.");
  warnings.push("EMAIL_PROVIDER is still replit-gmail. Use google-workspace-gmail for the Google Workspace target.");
} else if (emailProvider === "google-workspace-gmail") {
  requireVars(
    [
      "GOOGLE_WORKSPACE_CLIENT_ID",
      "GOOGLE_WORKSPACE_CLIENT_SECRET",
      "GOOGLE_WORKSPACE_REFRESH_TOKEN",
    ],
    "Google Workspace Gmail uses OAuth refresh-token credentials."
  );
  warnMissing("GOOGLE_WORKSPACE_EMAIL_FROM", "Set this to the EDG mailbox that should send customer emails.");
} else if (emailProvider === "resend") {
  requireVars(["RESEND_API_KEY"], "Resend transactional email needs an API key.");
  requireOneOf(
    ["RESEND_EMAIL_FROM", "EMAIL_FROM"],
    "Resend needs a verified sender address, for example EDG Patio & Shade <quotes@edgpatioshade.com>."
  );
}

warnMissing("RAINMAKER_API_KEY", "Website lead intake and scripts/smoke-lead-intake.mjs need it.");
warnMissing("OPENAI_API_KEY", "AI assistant, AI product import, and PDF quote extraction will stay unavailable without it.");
warnMissing("VITE_GOOGLE_PLACES_API_KEY", "Address autocomplete will be limited without it.");

console.log(`${projectName} environment check`);
console.log(
  loadedFiles.length
    ? `Loaded env files: ${loadedFiles.join(", ")}`
    : "Loaded env files: none; using process environment only."
);
console.log(`Storage provider: ${storageProvider}`);
console.log(`Email provider: ${emailProvider}`);
console.log(`Google sign-in: ${googleAuthEnabled ? "configured" : "not configured"}`);

if (warnings.length) {
  console.log("\nWarnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (errors.length) {
  console.log("\nMissing or invalid required environment:");
  for (const error of errors) {
    console.log(`- ${error}`);
  }
  process.exit(1);
}

console.log("\nEnvironment looks ready for the selected providers.");
