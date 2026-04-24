import type { IncomingMessage, ServerResponse } from "http";
import type { Express } from "express";

let appPromise: Promise<Express> | null = null;

function restoreExpressPath(req: IncomingMessage) {
  const requestUrl = new URL(req.url || "/", "https://rainmaker.local");
  const expressPath = requestUrl.searchParams.get("__path");

  if (!expressPath) return;

  requestUrl.searchParams.delete("__path");
  req.url = `${expressPath}${requestUrl.search}`;
}

function getRequestPath(req: IncomingMessage) {
  const requestUrl = new URL(req.url || "/", "https://rainmaker.local");
  return requestUrl.pathname;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

async function getApp() {
  appPromise ??= import("../server/app").then(({ createApp }) => createApp({ serveClient: false }).then(({ app }) => app));
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  restoreExpressPath(req);
  const path = getRequestPath(req);

  if (path === "/health") {
    return sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
  }

  if (path === "/api/leads/intake") {
    const { handleLeadIntake } = await import("./lead-intake");
    return handleLeadIntake(req, res);
  }

  const app = await getApp();
  return app(req, res);
}
