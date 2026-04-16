import cors from "cors";
import express from "express";
import { authMiddleware, requireRoles } from "./middleware/auth.middleware.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { authRoutes } from "./routes/auth.routes.js";
import { dashboardRoutes } from "./routes/dashboard.routes.js";
import { agentRoutes } from "./routes/agents.routes.js";
import { campaignRoutes } from "./routes/campaigns.routes.js";
import { batchRoutes } from "./routes/batches.routes.js";
import { callRoutes } from "./routes/calls.routes.js";
import { numberRoutes } from "./routes/numbers.routes.js";
import { settingsRoutes } from "./routes/settings.routes.js";
import { voiceRoutes } from "./routes/voices.routes.js";
import { webhookRoutes } from "./routes/webhooks.routes.js";
import { aiCredentialRoutes } from "./routes/aiCredentials.routes.js";
import { ratingRoutes } from "./routes/ratings.routes.js";
import { env } from "./config/env.js";

export function createApp() {
  const app = express();

  const isProduction = env.NODE_ENV === "production";
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    env.SERVER_URL
  ].filter(Boolean);

  app.use(cors({
    origin: isProduction
      ? (origin, callback) => {
          if (!origin || allowedOrigins.some((o) => origin!.startsWith(o))) {
            callback(null, true);
          } else {
            callback(null, false);
          }
        }
      : true,
    credentials: true
  }));
  app.use(express.json());
  // urlencoded needed for Plivo webhook form-posts and Exotel callbacks
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/dashboard", authMiddleware, dashboardRoutes);
  app.use("/api/agents", authMiddleware, agentRoutes);
  app.use("/api/campaigns", authMiddleware, campaignRoutes);
  app.use("/api/batches", authMiddleware, batchRoutes);
  app.use("/api/calls", authMiddleware, callRoutes);
  app.use("/api/ratings", authMiddleware, ratingRoutes);
  app.use("/api/numbers", authMiddleware, numberRoutes);
  app.use("/api/voices", authMiddleware, voiceRoutes);
  app.use("/api/ai-credentials", authMiddleware, requireRoles(["admin", "manager"]), aiCredentialRoutes);
  app.use("/api/settings", authMiddleware, requireRoles(["admin"]), settingsRoutes);

  app.use(errorHandler);

  return app;
}
