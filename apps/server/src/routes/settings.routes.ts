import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { maskSecret } from "../utils/viewModels.js";

export const settingsRoutes = Router();

function deriveActiveProvider() {
  if (env.PLIVO_AUTH_ID || env.PLIVO_AUTH_TOKEN) {
    return "plivo";
  }

  if (env.EXOTEL_ACCOUNT_SID || env.EXOTEL_API_KEY || env.EXOTEL_API_TOKEN) {
    return "exotel";
  }

  return "";
}

// Helper to safely update env values at runtime
function setEnv(key: string, value: string | undefined) {
  if (value !== undefined && value !== "") {
    (env as Record<string, unknown>)[key] = value;
    process.env[key] = value;
  }
}

// ─── GET all settings ────────────────────────────────────────────────────────
settingsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const team = await prisma.user.findMany({
      where: {
        organizationId: req.auth!.organizationId
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      },
      orderBy: { createdAt: "asc" }
    });

    res.json({
      providers: {
        activeProvider: deriveActiveProvider(),
        plivo: {
          authId: env.PLIVO_AUTH_ID ?? "",
          authToken: maskSecret(env.PLIVO_AUTH_TOKEN),
          defaultNumber: env.PLIVO_DEFAULT_NUMBER ?? ""
        },
        exotel: {
          accountSid: env.EXOTEL_ACCOUNT_SID ?? "",
          apiKey: maskSecret(env.EXOTEL_API_KEY),
          apiToken: maskSecret(env.EXOTEL_API_TOKEN),
          subdomain: env.EXOTEL_SUBDOMAIN ?? "",
          appId: env.EXOTEL_APP_ID ?? "",
          defaultNumber: env.EXOTEL_DEFAULT_NUMBER ?? ""
        }
      },
      aiServices: {
        openai: {
          apiKey: maskSecret(env.OPENAI_API_KEY),
          defaultModel: env.OPENAI_MODEL ?? ""
        },
        gemini: {
          apiKey: maskSecret(env.GEMINI_API_KEY),
          defaultModel: env.GEMINI_MODEL ?? "gemini-2.0-flash-live-001",
          defaultVoice: env.GEMINI_VOICE ?? "Kore"
        },
        cartesia: {
          apiKey: maskSecret(env.CARTESIA_API_KEY),
          defaultVoiceId: env.CARTESIA_DEFAULT_VOICE_ID ?? "",
          sttModel: env.CARTESIA_STT_MODEL ?? "ink-whisper",
          ttsModel: env.CARTESIA_TTS_MODEL ?? "sonic-2"
        },
        deepgram: {
          apiKey: maskSecret(env.DEEPGRAM_API_KEY),
          defaultModel: env.DEEPGRAM_MODEL ?? ""
        },
        elevenlabs: {
          apiKey: maskSecret(env.ELEVENLABS_API_KEY),
          defaultModel: env.ELEVENLABS_DEFAULT_MODEL ?? ""
        }
      },
      storage: {
        accessKeyId: maskSecret(env.AWS_ACCESS_KEY_ID),
        secretAccessKey: maskSecret(env.AWS_SECRET_ACCESS_KEY),
        region: env.AWS_REGION ?? "",
        bucketName: env.AWS_BUCKET_NAME ?? ""
      },
      team
    });
  })
);

// ─── GET providers ───────────────────────────────────────────────────────────
settingsRoutes.get(
  "/providers",
  asyncHandler(async (_req, res) => {
    res.json({
      activeProvider: deriveActiveProvider(),
      plivo: {
        authId: env.PLIVO_AUTH_ID ?? "",
        authToken: maskSecret(env.PLIVO_AUTH_TOKEN),
        defaultNumber: env.PLIVO_DEFAULT_NUMBER ?? ""
      },
      exotel: {
        accountSid: env.EXOTEL_ACCOUNT_SID ?? "",
        apiKey: maskSecret(env.EXOTEL_API_KEY),
        apiToken: maskSecret(env.EXOTEL_API_TOKEN),
        subdomain: env.EXOTEL_SUBDOMAIN ?? "",
        appId: env.EXOTEL_APP_ID ?? "",
        defaultNumber: env.EXOTEL_DEFAULT_NUMBER ?? ""
      }
    });
  })
);

// ─── PUT providers ───────────────────────────────────────────────────────────
settingsRoutes.put(
  "/providers",
  asyncHandler(async (req, res) => {
    const { plivo, exotel } = req.body as Record<string, Record<string, string>>;

    if (plivo) {
      setEnv("PLIVO_AUTH_ID", plivo.authId);
      setEnv("PLIVO_AUTH_TOKEN", plivo.authToken);
      setEnv("PLIVO_DEFAULT_NUMBER", plivo.defaultNumber);
    }

    if (exotel) {
      setEnv("EXOTEL_ACCOUNT_SID", exotel.accountSid);
      setEnv("EXOTEL_API_KEY", exotel.apiKey);
      setEnv("EXOTEL_API_TOKEN", exotel.apiToken);
      setEnv("EXOTEL_SUBDOMAIN", exotel.subdomain);
      setEnv("EXOTEL_APP_ID", exotel.appId);
      setEnv("EXOTEL_DEFAULT_NUMBER", exotel.defaultNumber);
    }

    res.json({
      message: "Provider settings updated for this session.",
      activeProvider: deriveActiveProvider()
    });
  })
);

// ─── GET AI services ─────────────────────────────────────────────────────────
settingsRoutes.get(
  "/ai-services",
  asyncHandler(async (_req, res) => {
    res.json({
      openai: {
        apiKey: maskSecret(env.OPENAI_API_KEY),
        defaultModel: env.OPENAI_MODEL ?? ""
      },
      gemini: {
        apiKey: maskSecret(env.GEMINI_API_KEY),
        defaultModel: env.GEMINI_MODEL ?? "gemini-2.0-flash-live-001",
        defaultVoice: env.GEMINI_VOICE ?? "Kore"
      },
      cartesia: {
        apiKey: maskSecret(env.CARTESIA_API_KEY),
        defaultVoiceId: env.CARTESIA_DEFAULT_VOICE_ID ?? "",
        sttModel: env.CARTESIA_STT_MODEL ?? "ink-whisper",
        ttsModel: env.CARTESIA_TTS_MODEL ?? "sonic-2"
      },
      deepgram: {
        apiKey: maskSecret(env.DEEPGRAM_API_KEY),
        defaultModel: env.DEEPGRAM_MODEL ?? ""
      },
      elevenlabs: {
        apiKey: maskSecret(env.ELEVENLABS_API_KEY),
        defaultModel: env.ELEVENLABS_DEFAULT_MODEL ?? ""
      }
    });
  })
);

// ─── PUT OpenAI ──────────────────────────────────────────────────────────────
settingsRoutes.put(
  "/openai",
  asyncHandler(async (req, res) => {
    const { apiKey, defaultModel } = req.body as Record<string, string>;
    setEnv("OPENAI_API_KEY", apiKey);
    setEnv("OPENAI_MODEL", defaultModel);
    res.json({ message: "OpenAI settings updated for this session." });
  })
);

// ─── PUT Gemini ─────────────────────────────────────────────────────────────
settingsRoutes.put(
  "/gemini",
  asyncHandler(async (req, res) => {
    const { apiKey, defaultModel, defaultVoice } = req.body as Record<string, string>;
    setEnv("GEMINI_API_KEY", apiKey);
    setEnv("GEMINI_MODEL", defaultModel);
    setEnv("GEMINI_VOICE", defaultVoice);
    res.json({ message: "Gemini settings updated for this session." });
  })
);

// ─── PUT Cartesia ────────────────────────────────────────────────────────
settingsRoutes.put(
  "/cartesia",
  asyncHandler(async (req, res) => {
    const { apiKey, defaultVoiceId, sttModel, ttsModel } = req.body as Record<string, string>;
    setEnv("CARTESIA_API_KEY", apiKey);
    setEnv("CARTESIA_DEFAULT_VOICE_ID", defaultVoiceId);
    setEnv("CARTESIA_STT_MODEL", sttModel);
    setEnv("CARTESIA_TTS_MODEL", ttsModel);
    res.json({ message: "Cartesia settings updated for this session." });
  })
);

// ─── PUT Deepgram ────────────────────────────────────────────────────────────
settingsRoutes.put(
  "/deepgram",
  asyncHandler(async (req, res) => {
    const { apiKey, defaultModel } = req.body as Record<string, string>;
    setEnv("DEEPGRAM_API_KEY", apiKey);
    setEnv("DEEPGRAM_MODEL", defaultModel);
    res.json({ message: "Deepgram settings updated for this session." });
  })
);

// ─── PUT ElevenLabs ──────────────────────────────────────────────────────────
settingsRoutes.put(
  "/elevenlabs",
  asyncHandler(async (req, res) => {
    const { apiKey, defaultModel } = req.body as Record<string, string>;
    setEnv("ELEVENLABS_API_KEY", apiKey);
    setEnv("ELEVENLABS_DEFAULT_MODEL", defaultModel);
    res.json({ message: "ElevenLabs settings updated for this session." });
  })
);

// ─── GET storage ─────────────────────────────────────────────────────────────
settingsRoutes.get(
  "/storage",
  asyncHandler(async (_req, res) => {
    res.json({
      accessKeyId: maskSecret(env.AWS_ACCESS_KEY_ID),
      secretAccessKey: maskSecret(env.AWS_SECRET_ACCESS_KEY),
      region: env.AWS_REGION ?? "",
      bucketName: env.AWS_BUCKET_NAME ?? ""
    });
  })
);

// ─── PUT storage ─────────────────────────────────────────────────────────────
settingsRoutes.put(
  "/storage",
  asyncHandler(async (req, res) => {
    const { accessKeyId, secretAccessKey, region, bucketName } = req.body as Record<string, string>;
    setEnv("AWS_ACCESS_KEY_ID", accessKeyId);
    setEnv("AWS_SECRET_ACCESS_KEY", secretAccessKey);
    setEnv("AWS_REGION", region);
    setEnv("AWS_BUCKET_NAME", bucketName);
    res.json({ message: "Storage settings updated for this session." });
  })
);

// ─── GET team ────────────────────────────────────────────────────────────────
settingsRoutes.get(
  "/team",
  asyncHandler(async (req, res) => {
    const team = await prisma.user.findMany({
      where: {
        organizationId: req.auth!.organizationId
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      },
      orderBy: { createdAt: "asc" }
    });

    res.json(team);
  })
);

// ─── Create team member ──────────────────────────────────────────────────────
settingsRoutes.post(
  "/team",
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body as Record<string, string>;

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      res.status(400).json({ message: "name, email, and password are required." });
      return;
    }

    const validRoles = ["admin", "manager", "recruiter", "viewer"];
    const userRole = validRoles.includes(role) ? role : "viewer";

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      res.status(409).json({ message: "A user with this email already exists." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        organizationId: req.auth!.organizationId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        role: userRole
      },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });

    res.status(201).json(user);
  })
);

// ─── Update team member role / status ────────────────────────────────────────
settingsRoutes.patch(
  "/team/:userId",
  asyncHandler(async (req, res) => {
    const userId = String(req.params.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    // Prevent admin from demoting themselves
    if (userId === req.auth!.userId) {
      res.status(400).json({ message: "You cannot change your own role." });
      return;
    }

    const { role, name, isActive } = req.body as Record<string, unknown>;
    const validRoles = ["admin", "manager", "recruiter", "viewer"];

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
        ...(typeof role === "string" && validRoles.includes(role) ? { role } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {})
      },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });

    res.json(updated);
  })
);

// ─── Delete team member ──────────────────────────────────────────────────────
settingsRoutes.delete(
  "/team/:userId",
  asyncHandler(async (req, res) => {
    const userId = String(req.params.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    if (userId === req.auth!.userId) {
      res.status(400).json({ message: "You cannot delete your own account." });
      return;
    }

    await prisma.user.delete({ where: { id: userId } });
    res.status(204).send();
  })
);

// ─── Test provider credentials ───────────────────────────────────────────────
settingsRoutes.post(
  "/providers/test",
  asyncHandler(async (_req, res) => {
    const provider = deriveActiveProvider();

    if (provider === "plivo") {
      if (!env.PLIVO_AUTH_ID || !env.PLIVO_AUTH_TOKEN) {
        res.json({ success: false, message: "Plivo credentials are not configured." });
        return;
      }

      const authHeader = `Basic ${Buffer.from(`${env.PLIVO_AUTH_ID}:${env.PLIVO_AUTH_TOKEN}`).toString("base64")}`;
      const response = await fetch(`https://api.plivo.com/v1/Account/${env.PLIVO_AUTH_ID}/`, {
        headers: { Authorization: authHeader }
      });

      if (response.ok) {
        res.json({ success: true, message: "Plivo credentials are valid." });
      } else {
        res.json({ success: false, message: `Plivo auth failed (${response.status}).` });
      }
      return;
    }

    if (provider === "exotel") {
      if (!env.EXOTEL_API_KEY || !env.EXOTEL_API_TOKEN || !env.EXOTEL_SUBDOMAIN || !env.EXOTEL_ACCOUNT_SID) {
        res.json({ success: false, message: "Exotel credentials are not fully configured." });
        return;
      }

      const authHeader = `Basic ${Buffer.from(`${env.EXOTEL_API_KEY}:${env.EXOTEL_API_TOKEN}`).toString("base64")}`;
      const response = await fetch(
        `https://${env.EXOTEL_SUBDOMAIN}.exotel.com/v1/Accounts/${env.EXOTEL_ACCOUNT_SID}`,
        { headers: { Authorization: authHeader } }
      );

      if (response.ok) {
        res.json({ success: true, message: "Exotel credentials are valid." });
      } else {
        res.json({ success: false, message: `Exotel auth failed (${response.status}).` });
      }
      return;
    }

    res.json({ success: false, message: "No telephony provider configured." });
  })
);

// ─── Test AI service credentials ─────────────────────────────────────────────
settingsRoutes.post(
  "/ai-services/test",
  asyncHandler(async (_req, res) => {
    if (!env.OPENAI_API_KEY) {
      res.json({ success: false, message: "OpenAI API key is not configured." });
      return;
    }

    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }
    });

    if (response.ok) {
      res.json({ success: true, message: "OpenAI API key is valid." });
    } else {
      res.json({ success: false, message: `OpenAI auth failed (${response.status}).` });
    }
  })
);

// ─── Test storage credentials ────────────────────────────────────────────────
settingsRoutes.post(
  "/storage/test",
  asyncHandler(async (_req, res) => {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_BUCKET_NAME) {
      res.json({ success: false, message: "AWS S3 credentials are not fully configured." });
      return;
    }

    try {
      const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({
        region: env.AWS_REGION ?? "us-east-1",
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY
        }
      });

      await s3.send(new HeadBucketCommand({ Bucket: env.AWS_BUCKET_NAME }));
      res.json({ success: true, message: `S3 bucket "${env.AWS_BUCKET_NAME}" is accessible.` });
    } catch (err) {
      const error = err as Error;
      res.json({ success: false, message: `S3 test failed: ${error.message}` });
    }
  })
);
