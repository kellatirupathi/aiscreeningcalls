import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { decryptJson } from "../../utils/crypto.js";
import type { CredentialConfig } from "../../routes/aiCredentials.routes.js";

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
  return { apiKey: "", source: "none" };
}
