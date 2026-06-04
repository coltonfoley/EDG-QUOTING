import type { IncomingMessage, ServerResponse } from "http";

type VercelHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

const generatedHandlerUrl = new URL("../dist/api/index.js", import.meta.url).href;
let handlerPromise: Promise<{ default: VercelHandler }> | null = null;

function getRequestPath(req: IncomingMessage) {
  const requestUrl = new URL(req.url || "/", "https://rainmaker.local");
  return requestUrl.searchParams.get("__path") || requestUrl.pathname;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function getBundledHandler() {
  handlerPromise ??= import(generatedHandlerUrl) as Promise<{ default: VercelHandler }>;
  return handlerPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (getRequestPath(req) === "/health") {
    return sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
  }

  const { default: bundledHandler } = await getBundledHandler();
  return bundledHandler(req, res);
}
