import express, { type Express, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import type { Server } from "http";
import { registerRoutes } from "./routes";
import { getAllowedOrigins } from "./config";
import { log } from "./logger";
import { checkDatabaseReadiness } from "./db";
import { redactedErrorType } from "./redactedLogging";
import { createRequestId, redactedRequestPath } from "./requestLogging";

type CreateAppOptions = {
  serveClient?: boolean;
};

export async function createApp(options: CreateAppOptions = {}): Promise<{
  app: Express;
  server: Server;
}> {
  const { serveClient = true } = options;
  const app = express();

  // Trust proxy must be set before rate limiting so req.ip correctly identifies clients behind proxies.
  app.set("trust proxy", 1);

  const isProduction = process.env.NODE_ENV === "production";

  app.use((req, res, next) => {
    const requestId = createRequestId();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/ready", async (_req, res) => {
    try {
      const schemaStatus = await checkDatabaseReadiness();
      res.status(200).json({
        status: "ready",
        database: "ready",
        schema: schemaStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[ready] Database readiness check failed", {
        errorType: redactedErrorType(error),
      });
      res.status(503).json({
        status: "not_ready",
        database: "unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.use(helmet({
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://maps.googleapis.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        // OpenAI requests run server-side; the retired browser AI chat must not
        // retain a client-side network permission for the provider.
        connectSrc: ["'self'", "https://maps.googleapis.com"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    } : false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));

  const corsOptions: cors.CorsOptions = {
    origin: isProduction ? getAllowedOrigins() : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["X-Request-Id"],
  };
  app.use(cors(corsOptions));

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { message: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !req.path.startsWith("/api"),
  });
  app.use(globalLimiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: "Too many authentication attempts, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/auth/google", authLimiter);

  const publicActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { message: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/signatures", publicActionLimiter);
  app.use("/api/planning-agreement-signatures", publicActionLimiter);

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false, limit: "10mb" }));

  app.use((req, res, next) => {
    const start = Date.now();
    const path = redactedRequestPath(req.path);

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        log(`[${res.locals.requestId}] ${req.method} ${path} ${res.statusCode} in ${duration}ms`);
      }
    });

    next();
  });

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 ? "Internal Server Error" : err.message || "Request failed";
    const requestId = res.locals.requestId;

    console.error("Unhandled request error", {
      requestId,
      errorType: redactedErrorType(err),
      status,
    });
    if (!res.headersSent) {
      res.status(status).json({ message, requestId });
    }
  });

  if (serveClient) {
    const { setupVite, serveStatic } = await import("./vite");

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }

  return { app, server };
}
