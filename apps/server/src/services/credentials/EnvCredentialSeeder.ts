import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { encryptJson } from "../../utils/crypto.js";
import type { CredentialConfig } from "../../routes/aiCredentials.routes.js";
import type { TelephonyCredentialConfig } from "../../routes/telephonyCredentials.routes.js";

/**
 * One-time auto-seeder: when an organization has NO credentials for a given
 * provider, and the corresponding env vars ARE set, automatically create a
 * DB credential record labeled "Default (from env)".
 *
 * This runs lazily on the first GET /api/ai-credentials call per organization.
 * After seeding, the user can edit/delete/add more normally through the UI.
 *
 * Idempotent: only seeds providers that don't already have any DB credentials.
 */
export async function seedEnvCredentialsForOrganization(organizationId: string): Promise<number> {
  let seededCount = 0;

  // Get existing provider counts for this org in one query
  const existing = await prisma.aiCredential.findMany({
    where: { organizationId },
    select: { provider: true }
  });
  const existingProviders = new Set(existing.map((c) => c.provider));

  // ─── OpenAI ───
  if (!existingProviders.has("openai") && env.OPENAI_API_KEY) {
    const config: CredentialConfig = {
      apiKey: env.OPENAI_API_KEY,
      defaultModel: env.OPENAI_MODEL || "gpt-4o-mini"
    };
    await prisma.aiCredential.create({
      data: {
        organizationId,
        provider: "openai",
        name: "Default (from .env)",
        credentialsEncrypted: encryptJson(config),
        isDefault: true
      }
    });
    seededCount++;
    console.log(`[EnvSeeder] Seeded OpenAI credential for org ${organizationId}`);
  }

  // ─── Groq ───
  if (!existingProviders.has("groq") && env.GROQ_API_KEY) {
    const config: CredentialConfig = {
      apiKey: env.GROQ_API_KEY,
      defaultModel: env.GROQ_MODEL || "llama-3.1-8b-instant"
    };
    await prisma.aiCredential.create({
      data: {
        organizationId,
        provider: "groq",
        name: "Default (from .env)",
        credentialsEncrypted: encryptJson(config),
        isDefault: true
      }
    });
    seededCount++;
    console.log(`[EnvSeeder] Seeded Groq credential for org ${organizationId}`);
  }

  // ─── Cartesia ───
  if (!existingProviders.has("cartesia") && env.CARTESIA_API_KEY) {
    const config: CredentialConfig = {
      apiKey: env.CARTESIA_API_KEY,
      defaultVoiceId: env.CARTESIA_DEFAULT_VOICE_ID,
      sttModel: env.CARTESIA_STT_MODEL || "ink-whisper",
      ttsModel: env.CARTESIA_TTS_MODEL || "sonic-2"
    };
    await prisma.aiCredential.create({
      data: {
        organizationId,
        provider: "cartesia",
        name: "Default (from .env)",
        credentialsEncrypted: encryptJson(config),
        isDefault: true
      }
    });
    seededCount++;
    console.log(`[EnvSeeder] Seeded Cartesia credential for org ${organizationId}`);
  }

  // ─── ElevenLabs ───
  if (!existingProviders.has("elevenlabs") && env.ELEVENLABS_API_KEY) {
    const config: CredentialConfig = {
      apiKey: env.ELEVENLABS_API_KEY,
      defaultVoiceId: env.ELEVENLABS_DEFAULT_VOICE_ID,
      modelId: env.ELEVENLABS_DEFAULT_MODEL || "eleven_turbo_v2_5"
    };
    await prisma.aiCredential.create({
      data: {
        organizationId,
        provider: "elevenlabs",
        name: "Default (from .env)",
        credentialsEncrypted: encryptJson(config),
        isDefault: true
      }
    });
    seededCount++;
    console.log(`[EnvSeeder] Seeded ElevenLabs credential for org ${organizationId}`);
  }

  // ─── Sarvam ───
  if (!existingProviders.has("sarvam") && env.SARVAM_API_KEY) {
    const config: CredentialConfig = {
      apiKey: env.SARVAM_API_KEY,
      defaultVoiceId: env.SARVAM_DEFAULT_VOICE_ID || "anushka",
      ttsModel: env.SARVAM_TTS_MODEL || "bulbul:v2"
    };
    await prisma.aiCredential.create({
      data: {
        organizationId,
        provider: "sarvam",
        name: "Default (from .env)",
        credentialsEncrypted: encryptJson(config),
        isDefault: true
      }
    });
    seededCount++;
    console.log(`[EnvSeeder] Seeded Sarvam credential for org ${organizationId}`);
  }

  // ─── Deepgram ───
  if (!existingProviders.has("deepgram") && env.DEEPGRAM_API_KEY) {
    const config: CredentialConfig = {
      apiKey: env.DEEPGRAM_API_KEY,
      defaultModel: env.DEEPGRAM_MODEL || "nova-3"
    };
    await prisma.aiCredential.create({
      data: {
        organizationId,
        provider: "deepgram",
        name: "Default (from .env)",
        credentialsEncrypted: encryptJson(config),
        isDefault: true
      }
    });
    seededCount++;
    console.log(`[EnvSeeder] Seeded Deepgram credential for org ${organizationId}`);
  }

  // ─── Gemini ───
  if (!existingProviders.has("gemini") && env.GEMINI_API_KEY) {
    const config: CredentialConfig = {
      apiKey: env.GEMINI_API_KEY,
      defaultModel: env.GEMINI_MODEL || "gemini-2.0-flash-live-001",
      defaultVoice: env.GEMINI_VOICE || "Kore"
    };
    await prisma.aiCredential.create({
      data: {
        organizationId,
        provider: "gemini",
        name: "Default (from .env)",
        credentialsEncrypted: encryptJson(config),
        isDefault: true
      }
    });
    seededCount++;
    console.log(`[EnvSeeder] Seeded Gemini credential for org ${organizationId}`);
  }

  return seededCount;
}

/**
 * Seed telephony credentials (Plivo/Exotel) from env vars on first access.
 * Mirrors seedEnvCredentialsForOrganization for the telephony providers.
 */
export async function seedTelephonyCredentialsForOrganization(organizationId: string): Promise<number> {
  let seededCount = 0;

  const existing = await prisma.telephonyConfig.findMany({
    where: { organizationId },
    select: { provider: true }
  });
  const existingProviders = new Set(existing.map((c) => c.provider));

  // ─── Plivo ───
  if (!existingProviders.has("plivo") && env.PLIVO_AUTH_ID && env.PLIVO_AUTH_TOKEN) {
    const config: TelephonyCredentialConfig = {
      authId: env.PLIVO_AUTH_ID,
      authToken: env.PLIVO_AUTH_TOKEN
    };
    await prisma.telephonyConfig.create({
      data: {
        organizationId,
        provider: "plivo",
        displayName: "Default (from .env)",
        credentialsEncrypted: encryptJson(config),
        defaultFromNumber: env.PLIVO_DEFAULT_NUMBER ?? null,
        isDefault: true,
        status: "configured"
      }
    });
    seededCount++;
    console.log(`[EnvSeeder] Seeded Plivo telephony credential for org ${organizationId}`);
  }

  // ─── Exotel ───
  if (
    !existingProviders.has("exotel") &&
    env.EXOTEL_ACCOUNT_SID &&
    env.EXOTEL_API_KEY &&
    env.EXOTEL_API_TOKEN
  ) {
    const config: TelephonyCredentialConfig = {
      accountSid: env.EXOTEL_ACCOUNT_SID,
      apiKey: env.EXOTEL_API_KEY,
      apiToken: env.EXOTEL_API_TOKEN,
      subdomain: env.EXOTEL_SUBDOMAIN || "api",
      appId: env.EXOTEL_APP_ID ?? ""
    };
    await prisma.telephonyConfig.create({
      data: {
        organizationId,
        provider: "exotel",
        displayName: "Default (from .env)",
        credentialsEncrypted: encryptJson(config),
        defaultFromNumber: env.EXOTEL_DEFAULT_NUMBER ?? null,
        isDefault: true,
        status: "configured"
      }
    });
    seededCount++;
    console.log(`[EnvSeeder] Seeded Exotel telephony credential for org ${organizationId}`);
  }

  return seededCount;
}
