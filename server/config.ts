import type { Request } from "express";

function normalizeBaseUrl(url?: string | null): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "");
}

function withHttpsIfNeeded(domainOrUrl?: string | null): string | undefined {
  const normalized = normalizeBaseUrl(domainOrUrl);
  if (!normalized) return undefined;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `https://${normalized}`;
}

function getReplitBaseUrl(): string | undefined {
  const primaryDomain = process.env.REPLIT_DOMAINS?.split(",")
    .map((domain) => domain.trim())
    .find(Boolean);

  return withHttpsIfNeeded(primaryDomain) || withHttpsIfNeeded(process.env.REPLIT_DEV_DOMAIN);
}

function getRequestBaseUrl(req: Request): string {
  const origin = normalizeBaseUrl(req.get("origin"));
  if (origin) return origin;

  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || req.protocol;
  const host = forwardedHost || req.get("host");

  return normalizeBaseUrl(`${protocol}://${host}`)!;
}

export function getServerPort(defaultPort = 5000): number {
  const rawPort = process.env.PORT;
  if (!rawPort) return defaultPort;

  const port = Number.parseInt(rawPort, 10);
  return Number.isFinite(port) && port > 0 ? port : defaultPort;
}

export function getServerHost(): string {
  return process.env.HOST || "0.0.0.0";
}

export function getAppBaseUrl(req?: Request): string {
  const configuredUrl = withHttpsIfNeeded(process.env.APP_BASE_URL);
  if (configuredUrl) return configuredUrl;

  const replitUrl = getReplitBaseUrl();
  if (replitUrl) return replitUrl;

  if (req) return getRequestBaseUrl(req);

  return `http://localhost:${getServerPort()}`;
}

export function buildAppUrl(path: string, req?: Request): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppBaseUrl(req)}${normalizedPath}`;
}

export function getAllowedOrigins(): string[] {
  const origins = new Set<string>();

  origins.add(getAppBaseUrl());

  for (const domain of process.env.REPLIT_DOMAINS?.split(",") || []) {
    const origin = withHttpsIfNeeded(domain);
    if (origin) origins.add(origin);
  }

  for (const origin of process.env.ADDITIONAL_ALLOWED_ORIGINS?.split(",") || []) {
    const normalized = withHttpsIfNeeded(origin);
    if (normalized) origins.add(normalized);
  }

  return Array.from(origins);
}
