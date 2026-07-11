import type { Express } from "express";
import { isAuthenticated, requireAdmin } from "../auth";
import { redactedErrorType } from "../redactedLogging";
import { storage } from "../storage";

export function registerBusinessEventRoutes(app: Express) {
  app.get("/api/admin/adoption-summary", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const summary = await storage.getAdoptionSummary({ windowDays: 30 });
      res.json(summary);
    } catch (error) {
      console.error("Error fetching adoption summary", {
        errorType: redactedErrorType(error),
      });
      res.status(500).json({ message: "Failed to fetch adoption summary" });
    }
  });
}
