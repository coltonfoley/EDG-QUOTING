import type { IncomingMessage, ServerResponse } from "http";

type VercelHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

const generatedHandlerUrl = new URL("../dist/api/index.js", import.meta.url).href;
const handlerPromise = import(generatedHandlerUrl) as Promise<{ default: VercelHandler }>;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const { default: bundledHandler } = await handlerPromise;
  return bundledHandler(req, res);
}
