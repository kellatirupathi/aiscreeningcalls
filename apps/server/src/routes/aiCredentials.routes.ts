import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { encryptJson, decryptJson } from "../utils/crypto.js";
import { seedEnvCredentialsForOrganization } from "../services/credentials/EnvCredentialSeeder.js";

export const aiCredentialRoutes = Router();

const VALID_PROVIDERS = new Set(["openai", "groq", "cartesia", "elevenlabs", "deepgram", "gemini", "sarvam"]);

// Config blob shape stored in credentialsEncrypted per provider
export interface CredentialConfig {
  apiKey: string;
  // OpenAI
  defaultModel?: string;
  // Cartesia
  defaultVoiceId?: string;
  sttModel?: string;
  ttsModel?: string;
  // Gemini
  defaultVoice?: string;
  // ElevenLabs
  modelId?: string;
}

function toViewModel(c: { id: string; provider: string; name: string; isDefault: boolean; credentialsEncrypted: string; createdAt: Date; updatedAt: Date }) {
  const config = decryptJson<CredentialConfig>(c.credentialsEncrypted) ?? { apiKey: "" };
  return {
    id: c.id,
    provider: c.provider,
    name: c.name,
    isDefault: c.isDefault,
    // Return full plaintext apiKey to the frontend for editing/viewing.
    apiKey: config.apiKey ?? "",
    defaultModel: config.defaultModel ?? "",
    defaultVoiceId: config.defaultVoiceId ?? "",
    sttModel: config.sttModel ?? "",
    ttsModel: config.ttsModel ?? "",
    defaultVoice: config.defaultVoice ?? "",
    modelId: config.modelId ?? "",
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString()
  };
}

function readStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

// ─── GET /api/ai-credentials?provider=openai ──────────────────────────────
aiCredentialRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const provider = typeof req.query.provider === "string" ? req.query.provider : undefined;

    // Lazy auto-seed: if this org is missing any provider credentials
    // AND the corresponding env vars are set, create DB records from env.
    // This runs once per org (idempotent — won't duplicate existing entries).
    try {
      await seedEnvCredentialsForOrganization(orgId);
    } catch (err) {
      console.error("[aiCredentials] Auto-seed from env failed:", (err as Error).message);
      // Don't block the list — continue showing whatever DB credentials exist
    }

    const where: { organizationId: string; provider?: string } = { organizationId: orgId };
    if (provider) where.provider = provider;

    const credentials = await prisma.aiCredential.findMany({
      where,
      orderBy: [{ provider: "asc" }, { createdAt: "asc" }]
    });

    res.json({
      credentials: credentials.map(toViewModel)
    });
  })
);

// ─── GET /api/ai-credentials/:id ──────────────────────────────────────────
aiCredentialRoutes.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const credential = await prisma.aiCredential.findUnique({
      where: { id: String(req.params.id) }
    });

    if (!credential || credential.organizationId !== orgId) {
      res.status(404).json({ message: "Credential not found." });
      return;
    }

    res.json({ credential: toViewModel(credential) });
  })
);

// ─── POST /api/ai-credentials ─────────────────────────────────────────────
aiCredentialRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const provider = readStr(body.provider).toLowerCase();
    const name = readStr(body.name).trim();
    const apiKey = readStr(body.apiKey).trim();

    if (!VALID_PROVIDERS.has(provider)) {
      res.status(400).json({ message: `Invalid provider. Must be one of: ${Array.from(VALID_PROVIDERS).join(", ")}` });
      return;
    }
    if (!name) {
      res.status(400).json({ message: "Name is required." });
      return;
    }
    if (!apiKey) {
      res.status(400).json({ message: "API key is required." });
      return;
    }

    const config: CredentialConfig = {
      apiKey,
      defaultModel: readStr(body.defaultModel) || undefined,
      defaultVoiceId: readStr(body.defaultVoiceId) || undefined,
      sttModel: readStr(body.sttModel) || undefined,
      ttsModel: readStr(body.ttsModel) || undefined,
      defaultVoice: readStr(body.defaultVoice) || undefined,
      modelId: readStr(body.modelId) || undefined
    };

    // Check if this is the first credential for this provider — auto-mark as default
    const existingCount = await prisma.aiCredential.count({
      where: { organizationId: orgId, provider }
    });
    const isDefault = existingCount === 0 || body.isDefault === true;

    // If marking as default, clear other defaults for this provider
    if (isDefault) {
      await prisma.aiCredential.updateMany({
        where: { organizationId: orgId, provider, isDefault: true },
        data: { isDefault: false }
      });
    }

    const created = await prisma.aiCredential.create({
      data: {
        organizationId: orgId,
        provider,
        name,
        credentialsEncrypted: encryptJson(config),
        isDefault
      }
    });

    res.status(201).json({ credential: toViewModel(created) });
  })
);

// ─── PATCH /api/ai-credentials/:id ────────────────────────────────────────
aiCredentialRoutes.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const existing = await prisma.aiCredential.findUnique({
      where: { id: String(req.params.id) }
    });

    if (!existing || existing.organizationId !== orgId) {
      res.status(404).json({ message: "Credential not found." });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const existingConfig = decryptJson<CredentialConfig>(existing.credentialsEncrypted) ?? { apiKey: "" };

    const newApiKey = readStr(body.apiKey).trim();
    const newConfig: CredentialConfig = {
      apiKey: newApiKey || existingConfig.apiKey,
      defaultModel: "defaultModel" in body ? readStr(body.defaultModel) || undefined : existingConfig.defaultModel,
      defaultVoiceId: "defaultVoiceId" in body ? readStr(body.defaultVoiceId) || undefined : existingConfig.defaultVoiceId,
      sttModel: "sttModel" in body ? readStr(body.sttModel) || undefined : existingConfig.sttModel,
      ttsModel: "ttsModel" in body ? readStr(body.ttsModel) || undefined : existingConfig.ttsModel,
      defaultVoice: "defaultVoice" in body ? readStr(body.defaultVoice) || undefined : existingConfig.defaultVoice,
      modelId: "modelId" in body ? readStr(body.modelId) || undefined : existingConfig.modelId
    };

    const newName = "name" in body ? readStr(body.name).trim() || existing.name : existing.name;
    const newIsDefault = typeof body.isDefault === "boolean" ? body.isDefault : existing.isDefault;

    // If setting as default, clear other defaults for same provider
    if (newIsDefault && !existing.isDefault) {
      await prisma.aiCredential.updateMany({
        where: { organizationId: orgId, provider: existing.provider, isDefault: true },
        data: { isDefault: false }
      });
    }

    const updated = await prisma.aiCredential.update({
      where: { id: existing.id },
      data: {
        name: newName,
        credentialsEncrypted: encryptJson(newConfig),
        isDefault: newIsDefault
      }
    });

    res.json({ credential: toViewModel(updated) });
  })
);

// ─── POST /api/ai-credentials/:id/set-default ─────────────────────────────
aiCredentialRoutes.post(
  "/:id/set-default",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const credential = await prisma.aiCredential.findUnique({
      where: { id: String(req.params.id) }
    });

    if (!credential || credential.organizationId !== orgId) {
      res.status(404).json({ message: "Credential not found." });
      return;
    }

    // Clear any existing default for this provider
    await prisma.aiCredential.updateMany({
      where: { organizationId: orgId, provider: credential.provider, isDefault: true },
      data: { isDefault: false }
    });

    const updated = await prisma.aiCredential.update({
      where: { id: credential.id },
      data: { isDefault: true }
    });

    res.json({ credential: toViewModel(updated) });
  })
);

// ─── DELETE /api/ai-credentials/:id ───────────────────────────────────────
aiCredentialRoutes.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const credential = await prisma.aiCredential.findUnique({
      where: { id: String(req.params.id) }
    });

    if (!credential || credential.organizationId !== orgId) {
      res.status(404).json({ message: "Credential not found." });
      return;
    }

    // Block deletion if any agent is using this credential
    const inUseBy = await prisma.agent.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { llmCredentialId: credential.id },
          { sttCredentialId: credential.id },
          { ttsCredentialId: credential.id },
          { geminiCredentialId: credential.id }
        ]
      },
      select: { id: true, name: true }
    });

    if (inUseBy.length > 0) {
      res.status(400).json({
        message: `Cannot delete — used by ${inUseBy.length} agent(s): ${inUseBy.map((a) => a.name).join(", ")}`,
        agentsUsing: inUseBy
      });
      return;
    }

    await prisma.aiCredential.delete({ where: { id: credential.id } });
    res.json({ success: true });
  })
);
