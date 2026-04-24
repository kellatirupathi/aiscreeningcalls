import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { encryptJson, decryptJson } from "../utils/crypto.js";
import { seedTelephonyCredentialsForOrganization } from "../services/credentials/EnvCredentialSeeder.js";

export const telephonyCredentialRoutes = Router();

const VALID_PROVIDERS = new Set(["plivo", "exotel"]);

// Encrypted blob shape per provider
export interface TelephonyCredentialConfig {
  // Plivo
  authId?: string;
  authToken?: string;
  // Exotel
  accountSid?: string;
  apiKey?: string;
  apiToken?: string;
  subdomain?: string;
  appId?: string;
}

function toViewModel(c: {
  id: string;
  provider: string;
  displayName: string;
  isDefault: boolean;
  status: string;
  credentialsEncrypted: string;
  defaultFromNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const config = decryptJson<TelephonyCredentialConfig>(c.credentialsEncrypted) ?? {};
  return {
    id: c.id,
    provider: c.provider,
    name: c.displayName,
    isDefault: c.isDefault,
    status: c.status,
    phoneNumber: c.defaultFromNumber ?? "",
    authId: config.authId ?? "",
    authToken: config.authToken ?? "",
    accountSid: config.accountSid ?? "",
    apiKey: config.apiKey ?? "",
    apiToken: config.apiToken ?? "",
    subdomain: config.subdomain ?? "",
    appId: config.appId ?? "",
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString()
  };
}

function readStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

// ─── GET /api/telephony-credentials?provider=plivo ────────────────────────
telephonyCredentialRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const provider = typeof req.query.provider === "string" ? req.query.provider : undefined;

    try {
      await seedTelephonyCredentialsForOrganization(orgId);
    } catch (err) {
      console.error("[telephonyCredentials] Auto-seed from env failed:", (err as Error).message);
    }

    const where: { organizationId: string; provider?: string } = { organizationId: orgId };
    if (provider) where.provider = provider;

    const credentials = await prisma.telephonyConfig.findMany({
      where,
      orderBy: [{ provider: "asc" }, { createdAt: "asc" }]
    });

    res.json({
      credentials: credentials.map(toViewModel)
    });
  })
);

// ─── POST /api/telephony-credentials ──────────────────────────────────────
telephonyCredentialRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const provider = readStr(body.provider).toLowerCase();
    const name = readStr(body.name).trim();
    const phoneNumber = readStr(body.phoneNumber).trim();

    if (!VALID_PROVIDERS.has(provider)) {
      res.status(400).json({ message: `Invalid provider. Must be one of: ${Array.from(VALID_PROVIDERS).join(", ")}` });
      return;
    }
    if (!name) {
      res.status(400).json({ message: "Name is required." });
      return;
    }
    if (!phoneNumber) {
      res.status(400).json({ message: "Phone number is required." });
      return;
    }

    const config: TelephonyCredentialConfig = {};
    if (provider === "plivo") {
      const authId = readStr(body.authId).trim();
      const authToken = readStr(body.authToken).trim();
      if (!authId || !authToken) {
        res.status(400).json({ message: "Auth ID and Auth Token are required for Plivo." });
        return;
      }
      config.authId = authId;
      config.authToken = authToken;
    } else {
      const accountSid = readStr(body.accountSid).trim();
      const apiKey = readStr(body.apiKey).trim();
      const apiToken = readStr(body.apiToken).trim();
      if (!accountSid || !apiKey || !apiToken) {
        res.status(400).json({ message: "Account SID, API Key, and API Token are required for Exotel." });
        return;
      }
      config.accountSid = accountSid;
      config.apiKey = apiKey;
      config.apiToken = apiToken;
      config.subdomain = readStr(body.subdomain).trim() || "api";
      config.appId = readStr(body.appId).trim();
    }

    const existingCount = await prisma.telephonyConfig.count({
      where: { organizationId: orgId, provider }
    });
    const isDefault = existingCount === 0 || body.isDefault === true;

    if (isDefault) {
      await prisma.telephonyConfig.updateMany({
        where: { organizationId: orgId, provider, isDefault: true },
        data: { isDefault: false }
      });
    }

    const created = await prisma.telephonyConfig.create({
      data: {
        organizationId: orgId,
        provider,
        displayName: name,
        credentialsEncrypted: encryptJson(config),
        defaultFromNumber: phoneNumber,
        isDefault,
        status: "configured"
      }
    });

    res.status(201).json({ credential: toViewModel(created) });
  })
);

// ─── PATCH /api/telephony-credentials/:id ─────────────────────────────────
telephonyCredentialRoutes.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const existing = await prisma.telephonyConfig.findUnique({
      where: { id: String(req.params.id) }
    });

    if (!existing || existing.organizationId !== orgId) {
      res.status(404).json({ message: "Credential not found." });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const existingConfig = decryptJson<TelephonyCredentialConfig>(existing.credentialsEncrypted) ?? {};

    const newConfig: TelephonyCredentialConfig = { ...existingConfig };
    if (existing.provider === "plivo") {
      const authId = readStr(body.authId).trim();
      const authToken = readStr(body.authToken).trim();
      if (authId) newConfig.authId = authId;
      if (authToken) newConfig.authToken = authToken;
    } else {
      if ("accountSid" in body) newConfig.accountSid = readStr(body.accountSid).trim() || existingConfig.accountSid;
      if ("apiKey" in body) newConfig.apiKey = readStr(body.apiKey).trim() || existingConfig.apiKey;
      if ("apiToken" in body) newConfig.apiToken = readStr(body.apiToken).trim() || existingConfig.apiToken;
      if ("subdomain" in body) newConfig.subdomain = readStr(body.subdomain).trim() || existingConfig.subdomain;
      if ("appId" in body) newConfig.appId = readStr(body.appId).trim();
    }

    const newName = "name" in body ? readStr(body.name).trim() || existing.displayName : existing.displayName;
    const newPhoneNumber = "phoneNumber" in body
      ? readStr(body.phoneNumber).trim() || existing.defaultFromNumber
      : existing.defaultFromNumber;
    const newIsDefault = typeof body.isDefault === "boolean" ? body.isDefault : existing.isDefault;

    if (newIsDefault && !existing.isDefault) {
      await prisma.telephonyConfig.updateMany({
        where: { organizationId: orgId, provider: existing.provider, isDefault: true },
        data: { isDefault: false }
      });
    }

    const updated = await prisma.telephonyConfig.update({
      where: { id: existing.id },
      data: {
        displayName: newName,
        credentialsEncrypted: encryptJson(newConfig),
        defaultFromNumber: newPhoneNumber,
        isDefault: newIsDefault
      }
    });

    res.json({ credential: toViewModel(updated) });
  })
);

// ─── POST /api/telephony-credentials/:id/set-default ──────────────────────
telephonyCredentialRoutes.post(
  "/:id/set-default",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const credential = await prisma.telephonyConfig.findUnique({
      where: { id: String(req.params.id) }
    });

    if (!credential || credential.organizationId !== orgId) {
      res.status(404).json({ message: "Credential not found." });
      return;
    }

    await prisma.telephonyConfig.updateMany({
      where: { organizationId: orgId, provider: credential.provider, isDefault: true },
      data: { isDefault: false }
    });

    const updated = await prisma.telephonyConfig.update({
      where: { id: credential.id },
      data: { isDefault: true }
    });

    res.json({ credential: toViewModel(updated) });
  })
);

// ─── DELETE /api/telephony-credentials/:id ────────────────────────────────
telephonyCredentialRoutes.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const credential = await prisma.telephonyConfig.findUnique({
      where: { id: String(req.params.id) }
    });

    if (!credential || credential.organizationId !== orgId) {
      res.status(404).json({ message: "Credential not found." });
      return;
    }

    const inUseBy = await prisma.agent.findMany({
      where: { organizationId: orgId, telephonyCredentialId: credential.id },
      select: { id: true, name: true }
    });

    if (inUseBy.length > 0) {
      res.status(400).json({
        message: `Cannot delete — used by ${inUseBy.length} agent(s): ${inUseBy.map((a) => a.name).join(", ")}`,
        agentsUsing: inUseBy
      });
      return;
    }

    await prisma.telephonyConfig.delete({ where: { id: credential.id } });
    res.json({ success: true });
  })
);
