import passport from "passport";
import * as oidc from "openid-client";
import { Strategy as OidcStrategy, type VerifyFunction } from "openid-client/passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import connectPg from "connect-pg-simple";
import { User as SelectUser } from "@shared/schema";
import { buildAppUrl } from "./config";

type PublicUser = Omit<
  SelectUser,
  "password" | "googleAccessToken" | "googleRefreshToken"
>;

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const googleStrategyName = "google-workspace";
let googleStrategyPromise: Promise<boolean> | undefined;
let googleStrategyRegistered = false;

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

function listEnv(name: string, fallback = "") {
  return (process.env[name] || fallback)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getAllowedGoogleDomains() {
  return listEnv("GOOGLE_AUTH_ALLOWED_DOMAINS", process.env.GOOGLE_AUTH_ALLOWED_DOMAIN || "edgpatioshade.com");
}

function getGoogleAdminEmails() {
  return listEnv("GOOGLE_AUTH_ADMIN_EMAILS");
}

function readBoolean(name: string, fallback = false) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function getGoogleClientId() {
  return process.env.GOOGLE_AUTH_CLIENT_ID?.trim();
}

function getGoogleClientSecret() {
  return process.env.GOOGLE_AUTH_CLIENT_SECRET?.trim();
}

export function isGoogleAuthConfigured() {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

function makeGoogleOnlyPassword(email: string) {
  return `google-oauth:${email}:${randomBytes(24).toString("hex")}`;
}

async function makeUniqueUsername(email: string) {
  const localPart = email.split("@")[0] || "user";
  const base = localPart
    .replace(/[^a-z0-9._-]+/gi, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48) || "user";

  let candidate = base;
  let counter = 2;
  while (await storage.getUserByUsername(candidate)) {
    candidate = `${base}.${counter}`;
    counter += 1;
  }
  return candidate;
}

async function findOrCreateGoogleUser(claims: any): Promise<SelectUser | null> {
  const email = String(claims?.email || "").trim().toLowerCase();
  const emailVerified = claims?.email_verified === true || claims?.email_verified === "true";

  if (!email || !emailVerified) {
    return null;
  }

  const domain = email.split("@")[1];
  const allowedDomains = getAllowedGoogleDomains();
  if (!domain || !allowedDomains.includes(domain)) {
    return null;
  }

  const existingByEmail = await storage.getUserByEmail(email);
  if (existingByEmail) {
    return existingByEmail;
  }

  if (!readBoolean("GOOGLE_AUTH_AUTO_CREATE_USERS", false)) {
    return null;
  }

  const adminEmails = getGoogleAdminEmails();
  const role = adminEmails.includes(email) ? "admin" : "user";
  const username = await makeUniqueUsername(email);

  return await storage.createUser({
    username,
    email,
    password: makeGoogleOnlyPassword(email),
    role,
    firstName: typeof claims?.given_name === "string" ? claims.given_name : undefined,
    lastName: typeof claims?.family_name === "string" ? claims.family_name : undefined,
  });
}

export function sanitizeUser(user: SelectUser): PublicUser;
export function sanitizeUser(user: SelectUser | null | undefined): PublicUser | null;
export function sanitizeUser(user: SelectUser | null | undefined): PublicUser | null {
  if (!user) return null;

  const {
    password: _password,
    googleAccessToken: _googleAccessToken,
    googleRefreshToken: _googleRefreshToken,
    ...publicUser
  } = user;

  return publicUser;
}

export function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: isProduction, // Use secure cookies in production
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      sameSite: isProduction ? 'none' : 'lax' // 'none' for production with HTTPS, 'lax' for development
    },
    name: 'sessionId', // Custom session name for security
  };

  // Note: trust proxy is set in server/index.ts before rate limiting
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());
  
  // Add API key validation middleware globally
  // This runs after session middleware and checks for API keys
  app.use(validateApiKey);

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  async function ensureGoogleStrategy() {
    if (!isGoogleAuthConfigured()) return false;
    if (googleStrategyRegistered) return true;

    googleStrategyPromise ??= (async () => {
      const clientId = getGoogleClientId();
      const clientSecret = getGoogleClientSecret();
      if (!clientId || !clientSecret) return false;

      const config = await oidc.discovery(
        new URL("https://accounts.google.com"),
        clientId,
        clientSecret,
      );

      const verify: VerifyFunction = async (tokens, verified) => {
        try {
          const user = await findOrCreateGoogleUser(tokens.claims());
          if (!user) {
            return verified(null, false, {
              message: "Use an EDG Google Workspace account that has app access.",
            });
          }
          return verified(null, user);
        } catch (error) {
          return verified(error);
        }
      };

      passport.use(
        googleStrategyName,
        new OidcStrategy(
          {
            name: googleStrategyName,
            config,
            scope: "openid email profile",
            callbackURL: buildAppUrl("/api/auth/google/callback"),
          },
          verify,
        ),
      );

      googleStrategyRegistered = true;
      return true;
    })();

    return googleStrategyPromise;
  }

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(sanitizeUser(user));
      });
    } catch (error) {
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(sanitizeUser(req.user));
  });

  app.get("/api/auth/google/status", (_req, res) => {
    res.json({
      enabled: isGoogleAuthConfigured(),
      allowedDomains: getAllowedGoogleDomains(),
    });
  });

  app.get("/api/auth/google", async (_req, res, next) => {
    try {
      if (!(await ensureGoogleStrategy())) {
        return res.status(404).json({ message: "Google sign-in is not configured." });
      }
      passport.authenticate(googleStrategyName, {
        prompt: "select_account",
        scope: ["openid", "email", "profile"],
      })(_req, res, next);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/google/callback", async (req, res, next) => {
    try {
      if (!(await ensureGoogleStrategy())) {
        return res.redirect("/auth?google_error=not_configured");
      }

      passport.authenticate(
        googleStrategyName,
        (authError: unknown, user: SelectUser | false | null) => {
          if (authError) {
            return next(authError);
          }

          if (!user) {
            return res.redirect("/auth?google_error=access_denied");
          }

          req.login(user, (loginError) => {
            if (loginError) {
              return next(loginError);
            }

            req.session.save((sessionError) => {
              if (sessionError) {
                return next(sessionError);
              }

              return res.redirect("/");
            });
          });
        },
      )(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });


}

// Helper function to hash API keys using SHA-256 (deterministic)
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

// Middleware to validate API keys for app-to-app authentication
export async function validateApiKey(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  
  // If no Authorization header, skip API key validation
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    // Extract the API key from the Authorization header
    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Hash the provided key using SHA-256 (deterministic, not salted)
    const keyHash = hashApiKey(apiKey);
    
    // Look up the key in the database
    const storedKey = await storage.getApiKeyByHash(keyHash);
    
    if (storedKey) {
      // API key is valid - mark request as authenticated
      req.apiKeyAuthenticated = true;
      req.apiKey = storedKey;
      
      // Update last used timestamp (don't await, fire and forget)
      storage.updateApiKeyLastUsed(storedKey.id).catch(err => 
        console.error('Failed to update API key last used:', err)
      );
    }
    
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    // Continue to next middleware even on error - don't block the request
    next();
  }
}

export function isAuthenticated(req: any, res: any, next: any) {
  // Accept EITHER session authentication OR API key authentication
  if (req.isAuthenticated() || req.apiKeyAuthenticated) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}
