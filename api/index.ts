import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "../server/app";

const appPromise = createApp({ serveClient: false }).then(({ app }) => app);

function restoreExpressPath(req: IncomingMessage) {
  const requestUrl = new URL(req.url || "/", "https://rainmaker.local");
  const expressPath = requestUrl.searchParams.get("__path");

  if (!expressPath) return;

  requestUrl.searchParams.delete("__path");
  req.url = `${expressPath}${requestUrl.search}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  restoreExpressPath(req);
  const app = await appPromise;
  return app(req, res);
}
