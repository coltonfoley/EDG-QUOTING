import { createApp } from "./app";
import { log } from "./logger";
import { getServerHost, getServerPort } from "./config";

(async () => {
  const { server } = await createApp();
  const port = getServerPort();
  const host = getServerHost();

  server.listen({
    port,
    host,
    reusePort: true,
  }, () => {
    log(`serving on ${host}:${port}`);
  });
})();
