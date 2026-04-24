import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { decryptJson } from "../../utils/crypto.js";
import type { CredentialConfig } from "../../routes/aiCredentials.routes.js";
import type { TelephonyCredentialConfig } from "../../routes/telephonyCredentials.routes.js";

/**
 * Resolved credential for an agent's AI service.
 * Falls back to env vars if no credentialId is assigned.
 */
export interface ResolvedCredential {
  apiKey: string;
  defaultModel?: string;
  defaultVoiceId?: string;
  sttModel?: string;
  ttsModel?: string;
  defaultVoice?: string;
  modelId?: string;
  source: "database" | "env" | "none";
}

async function loadCredentialFromDb(credentialId: string | null | undefined): Promise<CredentialConfig | null> {
  if (!credentialId) return null;
  try {
    const cred = await prisma.aiCredential.findUnique({ where: { id: credentialId } });
    if (!cred) return null;
    return decryptJson<CredentialConfig>(cred.credentialsEncrypted);
  } catch (err) {
    console.error("[CredentialResolver] Failed to load credential:", (err as Error).message);
    return null;
  }
}

async function loadDefaultForProvider(
  organizationId: string,
  provider: string
): Promise<CredentialConfig | null> {
  try {
    const cred = await prisma.aiCredential.findFirst({
      where: { organizationId, provider, isDefault: true }
    });
    if (!cred) return null;
    return decryptJson<CredentialConfig>(cred.credentialsEncrypted);
  } catch {
    return null;
  }
}

/**
 * Resolve OpenAI credential for an agent.
 * Priority: agent.llmCredentialId → org default for openai → env.OPENAI_API_KEY
 */
export async function resolveOpenAiCredential(
  organizationId: string,
  credentialId?: string | null
): Promise<ResolvedCredential> {
  let config = await loadCredentialFromDb(credentialId);
  if (!config) config = await loadDefaultForProvider(organizationId, "openai");

  if (config?.apiKey) {
    return {
      apiKey: config.apiKey,
      defaultModel: config.defaultModel,
      source: "database"
    };
  }

  if (env.OPENAI_API_KEY) {
    return {
      apiKey: env.OPENAI_API_KEY,
      defaultModel: env.OPENAI_MODEL,
      source: "env"
    };
  }

  return { apiKey: "", source: "none" };
}

/**
 * Resolve Groq credential for an agent.
 * Priority: agent.llmCredentialId → org default for groq → env.GROQ_API_KEY
 */
export async function resolveGroqCredential(
  organizationId: string,
  credentialId?: string | null
): Promise<ResolvedCredential> {
  let config = await loadCredentialFromDb(credentialId);
  if (!config) config = await loadDefaultForProvider(organizationId, "groq");

  if (config?.apiKey) {
    return {
      apiKey: config.apiKey,
      defaultModel: config.defaultModel,
      source: "database"
    };
  }

  if (env.GROQ_API_KEY) {
    return {
      apiKey: env.GROQ_API_KEY,
      defaultModel: env.GROQ_MODEL,
      source: "env"
    };
  }

  return { apiKey: "", source: "none" };
}

/**
 * Resolve the LLM credential for an agent based on its provider config.
 * Routes to OpenAI or Groq based on llmProvider.
 */
export async function resolveLlmCredential(
  organizationId: string,
  llmProvider: string,
  credentialId?: string | null
): Promise<ResolvedCredential> {
  if (llmProvider === "groq") {
    return resolveGroqCredential(organizationId, credentialId);
  }
  return resolveOpenAiCredential(organizationId, credentialId);
}

/**
 * Resolve Cartesia credential (used for both STT and TTS).
 * Priority: specific credentialId → org default for cartesia → env vars
 */
export async function resolveCartesiaCredential(
  organizationId: string,
  credentialId?: string | null
): Promise<ResolvedCredential> {
  let config = await loadCredentialFromDb(credentialId);
  if (!config) config = await loadDefaultForProvider(organizationId, "cartesia");

  if (config?.apiKey) {
    return {
      apiKey: config.apiKey,
      defaultVoiceId: config.defaultVoiceId,
      sttModel: config.sttModel,
      ttsModel: config.ttsModel,
      source: "database"
    };
  }

  if (env.CARTESIA_API_KEY) {
    return {
      apiKey: env.CARTESIA_API_KEY,
      defaultVoiceId: env.CARTESIA_DEFAULT_VOICE_ID,
      sttModel: env.CARTESIA_STT_MODEL,
      ttsModel: env.CARTESIA_TTS_MODEL,
      source: "env"
    };
  }

  return { apiKey: "", source: "none" };
}

/**
 * Resolve ElevenLabs credential.
 */
export async function resolveElevenLabsCredential(
  organizationId: string,
  credentialId?: string | null
): Promise<ResolvedCredential> {
  let config = await loadCredentialFromDb(credentialId);
  if (!config) config = await loadDefaultForProvider(organizationId, "elevenlabs");

  if (config?.apiKey) {
    return {
      apiKey: config.apiKey,
      defaultVoiceId: config.defaultVoiceId,
      modelId: config.modelId,
      source: "database"
    };
  }

  if (env.ELEVENLABS_API_KEY) {
    return {
      apiKey: env.ELEVENLABS_API_KEY,
      defaultVoiceId: env.ELEVENLABS_DEFAULT_VOICE_ID,
      modelId: env.ELEVENLABS_DEFAULT_MODEL,
      source: "env"
    };
  }

  return { apiKey: "", source: "none" };
}

/**
 * Resolve Sarvam credential (TTS provider for Indian languages).
 */
export async function resolveSarvamCredential(
  organizationId: string,
  credentialId?: string | null
): Promise<ResolvedCredential> {
  let config = await loadCredentialFromDb(credentialId);
  if (!config) config = await loadDefaultForProvider(organizationId, "sarvam");

  if (config?.apiKey) {
    return {
      apiKey: config.apiKey,
      defaultVoiceId: config.defaultVoiceId,
      ttsModel: config.ttsModel,
      source: "database"
    };
  }

  if (env.SARVAM_API_KEY) {
    return {
      apiKey: env.SARVAM_API_KEY,
      defaultVoiceId: env.SARVAM_DEFAULT_VOICE_ID,
      ttsModel: env.SARVAM_TTS_MODEL,
      source: "env"
    };
  }

  return { apiKey: "", source: "none" };
}

/**
 * Resolve Deepgram credential.
 */
export async function resolveDeepgramCredential(
  organizationId: string,
  credentialId?: string | null
): Promise<ResolvedCredential> {
  let config = await loadCredentialFromDb(credentialId);
  if (!config) config = await loadDefaultForProvider(organizationId, "deepgram");

  if (config?.apiKey) {
    return {
      apiKey: config.apiKey,
      defaultModel: config.defaultModel,
      source: "database"
    };
  }

  if (env.DEEPGRAM_API_KEY) {
    return {
      apiKey: env.DEEPGRAM_API_KEY,
      defaultModel: env.DEEPGRAM_MODEL,
      source: "env"
    };
  }

  return { apiKey: "", source: "none" };
}

/**
 * Resolve Gemini credential.
 */
export async function resolveGeminiCredential(
  organizationId: string,
  credentialId?: string | null
): Promise<ResolvedCredential> {
  let config = await loadCredentialFromDb(credentialId);
  if (!config) config = await loadDefaultForProvider(organizationId, "gemini");

  if (config?.apiKey) {
    return {
      apiKey: config.apiKey,
      defaultModel: config.defaultModel,
      defaultVoice: config.defaultVoice,
      source: "database"
    };
  }

  if (env.GEMINI_API_KEY) {
    return {
      apiKey: env.GEMINI_API_KEY,
      defaultModel: env.GEMINI_MODEL,
      defaultVoice: env.GEMINI_VOICE,
      source: "env"
    };
  }

  return { apiKey: "", source: "none" };
}

/**
 * Resolve the STT credential for an agent based on its provider config.
 */
export async function resolveSttCredential(
  organizationId: string,
  sttProvider: string,
  credentialId?: string | null
): Promise<ResolvedCredential> {
  if (sttProvider === "cartesia") {
    return resolveCartesiaCredential(organizationId, credentialId);
  }
  if (sttProvider === "deepgram") {
    return resolveDeepgramCredential(organizationId, credentialId);
  }
  return { apiKey: "", source: "none" };
}

/**
 * Resolve the TTS credential for an agent based on its provider config.
 */
export async function resolveTtsCredential(
  organizationId: string,
  ttsProvider: string,
  credentialId?: string | null
): Promise<ResolvedCredential> {
  if (ttsProvider === "cartesia") {
    return resolveCartesiaCredential(organizationId, credentialId);
  }
  if (ttsProvider === "elevenlabs") {
    return resolveElevenLabsCredential(organizationId, credentialId);
  }
  if (ttsProvider === "sarvam") {
    return resolveSarvamCredential(organizationId, credentialId);
  }
  return { apiKey: "", source: "none" };
}

/**
 * Resolved telephony credential for an agent. Combines API credentials
 * with the phone number tied to that account.
 */
export interface ResolvedTelephonyCredential {
  provider: "plivo" | "exotel";
  // Plivo
  authId?: string;
  authToken?: string;
  // Exotel
  accountSid?: string;
  apiKey?: string;
  apiToken?: string;
  subdomain?: string;
  appId?: string;
  // Phone number associated with this credential
  fromNumber?: string;
  source: "database" | "env" | "none";
}

async function loadTelephonyFromDb(credentialId: string | null | undefined) {
  if (!credentialId) return null;
  try {
    const cred = await prisma.telephonyConfig.findUnique({ where: { id: credentialId } });
    if (!cred) return null;
    return cred;
  } catch (err) {
    console.error("[CredentialResolver] Failed to load telephony credential:", (err as Error).message);
    return null;
  }
}

async function loadDefaultTelephonyForProvider(organizationId: string, provider: string) {
  try {
    return await prisma.telephonyConfig.findFirst({
      where: { organizationId, provider, isDefault: true }
    });
  } catch {
    return null;
  }
}

/**
 * Resolve telephony credential for an agent.
 * Priority: agent.telephonyCredentialId → org default for provider → env fallback
 */
export async function resolveTelephonyCredential(
  organizationId: string,
  telephonyProvider: string,
  credentialId?: string | null
): Promise<ResolvedTelephonyCredential> {
  const provider = telephonyProvider === "exotel" ? "exotel" : "plivo";

  let row = await loadTelephonyFromDb(credentialId);
  // Only honor the explicit credential if it matches the requested provider,
  // otherwise fall back to the org default for the provider.
  if (row && row.provider !== provider) row = null;
  if (!row) row = await loadDefaultTelephonyForProvider(organizationId, provider);

  if (row) {
    const config = decryptJson<TelephonyCredentialConfig>(row.credentialsEncrypted) ?? {};
    return {
      provider,
      authId: config.authId,
      authToken: config.authToken,
      accountSid: config.accountSid,
      apiKey: config.apiKey,
      apiToken: config.apiToken,
      subdomain: config.subdomain,
      appId: config.appId,
      fromNumber: row.defaultFromNumber ?? undefined,
      source: "database"
    };
  }

  // Env fallback
  if (provider === "plivo" && env.PLIVO_AUTH_ID && env.PLIVO_AUTH_TOKEN) {
    return {
      provider: "plivo",
      authId: env.PLIVO_AUTH_ID,
      authToken: env.PLIVO_AUTH_TOKEN,
      fromNumber: env.PLIVO_DEFAULT_NUMBER,
      source: "env"
    };
  }
  if (provider === "exotel" && env.EXOTEL_ACCOUNT_SID && env.EXOTEL_API_KEY && env.EXOTEL_API_TOKEN) {
    return {
      provider: "exotel",
      accountSid: env.EXOTEL_ACCOUNT_SID,
      apiKey: env.EXOTEL_API_KEY,
      apiToken: env.EXOTEL_API_TOKEN,
      subdomain: env.EXOTEL_SUBDOMAIN || "api",
      appId: env.EXOTEL_APP_ID ?? "",
      fromNumber: env.EXOTEL_DEFAULT_NUMBER,
      source: "env"
    };
  }

  return { provider, source: "none" };
}
