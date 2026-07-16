export function safeDimension(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 100);
  if (!normalized || /@/.test(normalized) || /\d{7,}/.test(normalized)) return null;
  return /^[a-zA-Z0-9 _./:+-]+$/.test(normalized) ? normalized : null;
}

export function safePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (/@/.test(value) || /\d{7,}/.test(value)) return null;
  try {
    const parsed = new URL(value, "https://edgpatioshade.com");
    const allowedHost =
      parsed.hostname === "edgpatioshade.com" ||
      parsed.hostname === "www.edgpatioshade.com";
    const safeRoute = /^\/[a-zA-Z0-9/_-]*\/?$/.test(parsed.pathname);
    return allowedHost && safeRoute ? parsed.pathname.slice(0, 300) : null;
  } catch {
    return null;
  }
}
