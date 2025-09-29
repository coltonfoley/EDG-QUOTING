import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import connectPg from "connect-pg-simple";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  // Only consider it production when NODE_ENV is explicitly set to production
  // REPL_ID exists in both development and production on Replit
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

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

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
        res.status(201).json(user);
      });
    } catch (error) {
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });


}

export function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

// Enhanced authentication that supports both session and API key auth
export async function isAuthenticatedOrApiKey(req: any, res: any, next: any) {
  // Check for session authentication first
  if (req.isAuthenticated()) {
    return next();
  }

  // Check for API key authentication
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    try {
      // Find API key by comparing against all active keys
      const allApiKeys = await storage.getAllApiKeys();
      const activeKeys = allApiKeys.filter(key => key.isActive);
      
      let validApiKey = null;
      for (const storedKey of activeKeys) {
        if (await compareApiKeys(apiKey, storedKey.keyHash)) {
          validApiKey = storedKey;
          break;
        }
      }
      
      if (!validApiKey) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      // Check if API key has expired
      if (validApiKey.expiresAt && new Date() > validApiKey.expiresAt) {
        return res.status(401).json({ message: "API key has expired" });
      }

      // Update last used timestamp
      await storage.updateApiKeyLastUsed(validApiKey.keyHash);

      // Set API key context on request
      req.apiKey = validApiKey;
      req.isApiKeyAuth = true;

      return next();
    } catch (error) {
      console.error("API key validation error:", error);
      return res.status(500).json({ message: "Authentication error" });
    }
  }

  // No valid authentication found
  res.status(401).json({ message: "Unauthorized - Please provide valid session or API key" });
}

// Helper function to compare API key with stored hash
async function compareApiKeys(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}