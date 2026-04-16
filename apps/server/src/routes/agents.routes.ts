import { Router } from "express";
import { requireRoles } from "../middleware/auth.middleware.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { mapAgent } from "../utils/viewModels.js";
import { callQueue } from "../queues/callQueue.js";
import type { CallJobData } from "../workers/callWorker.js";

export const agentRoutes = Router();

const TELEPHONY_PROVIDERS = new Set(["plivo", "exotel"]);
const DEFAULT_AGENT_NAME = "New Agent";

function readString(value: unknown, fallback = "") {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return fallback;
  }

  return String(value);
}

function readTrimmedString(value: unknown, fallback = "") {
  const nextValue = readString(value, fallback).trim();
  return nextValue || fallback;
}

function readNullableString(value: unknown) {
  const nextValue = readString(value).trim();
  return nextValue ? nextValue : null;
}

function readNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return fallback;
}

function readProvider(value: unknown, fallback: string, allowed?: Set<string>) {
  const normalized = readTrimmedString(value, fallback).toLowerCase();

  if (allowed && !allowed.has(normalized)) {
    return fallback;
  }

  return normalized;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "agent";
}

/**
 * Build full agent write input for CREATE — includes all fields with defaults.
 * Used for POST /agents only.
 */
function buildAgentCreateInput(payload: Record<string, unknown>) {
  const name = readTrimmedString(payload.name, DEFAULT_AGENT_NAME);
  return {
    name,
    slug: slugify(name),
    status: readTrimmedString(payload.status, "draft"),
    conversationEngine: readTrimmedString(payload.conversationEngine, "pipeline"),
    geminiModel: readTrimmedString(payload.geminiModel, "gemini-2.0-flash-live-001"),
    geminiVoice: readTrimmedString(payload.geminiVoice, "Kore"),
    welcomeMessage: readString(payload.welcomeMessage, ""),
    systemPrompt: readString(payload.prompt ?? payload.systemPrompt, ""),
    finalMessage: readNullableString(payload.finalCallMessage ?? payload.finalMessage),
    llmProvider: readProvider(payload.llmProvider, "openai"),
    llmModel: readTrimmedString(payload.llmModel, "gpt-4o-mini"),
    llmTemperature: readNumber(payload.llmTemperature, 0.2),
    llmMaxTokens: Math.max(1, Math.round(readNumber(payload.llmTokens ?? payload.llmMaxTokens, 450))),
    language: readTrimmedString(payload.language, "English"),
    sttProvider: readProvider(payload.sttProvider, "cartesia"),
    sttModel: readTrimmedString(payload.sttModel, "ink-whisper"),
    keywords: readNullableString(payload.keywords),
    ttsProvider: readProvider(payload.ttsProvider, "cartesia"),
    ttsModel: readTrimmedString(payload.ttsModel, "sonic-2"),
    ttsVoiceId: readNullableString(payload.ttsVoiceName ?? payload.ttsVoiceId) ?? env.CARTESIA_DEFAULT_VOICE_ID ?? null,
    ttsBufferSize: Math.max(0, Math.round(readNumber(payload.ttsBufferSize, 200))),
    ttsSpeedRate: readNumber(payload.ttsSpeedRate, 1),
    ttsSimilarityBoost: readNumber(payload.ttsSimilarityBoost, 0.75),
    ttsStability: readNumber(payload.ttsStability, 0.5),
    ttsStyleExaggeration: readNumber(payload.ttsStyleExaggeration, 0),
    preciseTranscript: readBoolean(payload.preciseTranscript, false),
    interruptAfterWords: Math.max(0, Math.round(readNumber(payload.interruptAfterWords, 2))),
    responseRate: readTrimmedString(payload.responseRate, "Balanced"),
    telephonyProvider: readProvider(payload.telephonyProvider, "plivo", TELEPHONY_PROVIDERS),
    endpointingMs: Math.max(0, Math.round(readNumber(payload.endpointingMs, 100))),
    linearDelayMs: Math.max(0, Math.round(readNumber(payload.linearDelayMs, 200))),
    userOnlineDetection: readBoolean(payload.userOnlineDetection, false),
    userOnlinePrompt: readNullableString(payload.userOnlinePrompt),
    invokeAfterSeconds: Math.max(0, Math.round(readNumber(payload.invokeAfterSeconds, 9))),
    ambientNoise: readTrimmedString(payload.ambientNoise, "None"),
    noiseCancellation: readBoolean(payload.noiseCancellation, false),
    voicemailDetection: readBoolean(payload.voicemailDetection, false),
    dtmfEnabled: readBoolean(payload.dtmfEnabled, false),
    autoReschedule: readBoolean(payload.autoReschedule, false),
    hangupOnSilence: readBoolean(payload.hangupOnSilence, true),
    hangupOnSilenceSeconds: Math.max(0, Math.round(readNumber(payload.hangupOnSilenceSeconds, 20))),
    callTimeoutSeconds: Math.max(0, Math.round(readNumber(payload.callTimeoutSeconds, 600))),
    summarizationEnabled: readBoolean(payload.summarizationEnabled, false),
    extractionEnabled: readBoolean(payload.extractionEnabled, false),
    extractionPrompt: readNullableString(payload.extractionPrompt),
    analyticsWebhookUrl: readNullableString(payload.analyticsWebhookUrl),
    inboundNumberId: readNullableString(payload.inboundNumberId),
    llmCredentialId: readNullableString(payload.llmCredentialId) ?? null,
    sttCredentialId: readNullableString(payload.sttCredentialId) ?? null,
    ttsCredentialId: readNullableString(payload.ttsCredentialId) ?? null,
    geminiCredentialId: readNullableString(payload.geminiCredentialId) ?? null
  };
}

/**
 * Build PARTIAL agent update input — only includes fields actually present
 * in the payload. Critical for MongoDB Atlas which has a 50-field pipeline
 * limit on updates. Also more efficient (only touches what changed).
 */
function buildAgentUpdateInput(payload: Record<string, unknown>): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const has = (key: string) => key in payload && payload[key] !== undefined;

  if (has("name")) {
    const name = readTrimmedString(payload.name, DEFAULT_AGENT_NAME);
    update.name = name;
    update.slug = slugify(name);
  }
  if (has("status")) update.status = readTrimmedString(payload.status, "draft");
  if (has("conversationEngine")) update.conversationEngine = readTrimmedString(payload.conversationEngine, "pipeline");
  if (has("geminiModel")) update.geminiModel = readTrimmedString(payload.geminiModel, "gemini-2.0-flash-live-001");
  if (has("geminiVoice")) update.geminiVoice = readTrimmedString(payload.geminiVoice, "Kore");
  if (has("welcomeMessage")) update.welcomeMessage = readString(payload.welcomeMessage, "");
  if (has("prompt") || has("systemPrompt")) {
    update.systemPrompt = readString(payload.prompt ?? payload.systemPrompt, "");
  }
  if (has("finalCallMessage") || has("finalMessage")) {
    update.finalMessage = readNullableString(payload.finalCallMessage ?? payload.finalMessage);
  }
  if (has("llmProvider")) update.llmProvider = readProvider(payload.llmProvider, "openai");
  if (has("llmModel")) update.llmModel = readTrimmedString(payload.llmModel, "gpt-4o-mini");
  if (has("llmTemperature")) update.llmTemperature = readNumber(payload.llmTemperature, 0.2);
  if (has("llmTokens") || has("llmMaxTokens")) {
    update.llmMaxTokens = Math.max(1, Math.round(readNumber(payload.llmTokens ?? payload.llmMaxTokens, 450)));
  }
  if (has("llmCredentialId")) update.llmCredentialId = readNullableString(payload.llmCredentialId);
  if (has("language")) update.language = readTrimmedString(payload.language, "English");
  if (has("sttProvider")) update.sttProvider = readProvider(payload.sttProvider, "cartesia");
  if (has("sttModel")) update.sttModel = readTrimmedString(payload.sttModel, "ink-whisper");
  if (has("sttCredentialId")) update.sttCredentialId = readNullableString(payload.sttCredentialId);
  if (has("keywords")) update.keywords = readNullableString(payload.keywords);
  if (has("ttsProvider")) update.ttsProvider = readProvider(payload.ttsProvider, "cartesia");
  if (has("ttsModel")) update.ttsModel = readTrimmedString(payload.ttsModel, "sonic-2");
  if (has("ttsVoiceName") || has("ttsVoiceId")) {
    update.ttsVoiceId = readNullableString(payload.ttsVoiceName ?? payload.ttsVoiceId);
  }
  if (has("ttsCredentialId")) update.ttsCredentialId = readNullableString(payload.ttsCredentialId);
  if (has("geminiCredentialId")) update.geminiCredentialId = readNullableString(payload.geminiCredentialId);
  if (has("ttsBufferSize")) update.ttsBufferSize = Math.max(0, Math.round(readNumber(payload.ttsBufferSize, 200)));
  if (has("ttsSpeedRate")) update.ttsSpeedRate = readNumber(payload.ttsSpeedRate, 1);
  if (has("ttsSimilarityBoost")) update.ttsSimilarityBoost = readNumber(payload.ttsSimilarityBoost, 0.75);
  if (has("ttsStability")) update.ttsStability = readNumber(payload.ttsStability, 0.5);
  if (has("ttsStyleExaggeration")) update.ttsStyleExaggeration = readNumber(payload.ttsStyleExaggeration, 0);
  if (has("preciseTranscript")) update.preciseTranscript = readBoolean(payload.preciseTranscript, false);
  if (has("interruptAfterWords")) {
    update.interruptAfterWords = Math.max(0, Math.round(readNumber(payload.interruptAfterWords, 2)));
  }
  if (has("responseRate")) update.responseRate = readTrimmedString(payload.responseRate, "Balanced");
  if (has("telephonyProvider")) {
    update.telephonyProvider = readProvider(payload.telephonyProvider, "plivo", TELEPHONY_PROVIDERS);
  }
  if (has("endpointingMs")) update.endpointingMs = Math.max(0, Math.round(readNumber(payload.endpointingMs, 100)));
  if (has("linearDelayMs")) update.linearDelayMs = Math.max(0, Math.round(readNumber(payload.linearDelayMs, 200)));
  if (has("userOnlineDetection")) update.userOnlineDetection = readBoolean(payload.userOnlineDetection, false);
  if (has("userOnlinePrompt")) update.userOnlinePrompt = readNullableString(payload.userOnlinePrompt);
  if (has("invokeAfterSeconds")) {
    update.invokeAfterSeconds = Math.max(0, Math.round(readNumber(payload.invokeAfterSeconds, 9)));
  }
  if (has("ambientNoise")) update.ambientNoise = readTrimmedString(payload.ambientNoise, "None");
  if (has("noiseCancellation")) update.noiseCancellation = readBoolean(payload.noiseCancellation, false);
  if (has("voicemailDetection")) update.voicemailDetection = readBoolean(payload.voicemailDetection, false);
  if (has("dtmfEnabled")) update.dtmfEnabled = readBoolean(payload.dtmfEnabled, false);
  if (has("autoReschedule")) update.autoReschedule = readBoolean(payload.autoReschedule, false);
  if (has("hangupOnSilence")) update.hangupOnSilence = readBoolean(payload.hangupOnSilence, true);
  if (has("hangupOnSilenceSeconds")) {
    update.hangupOnSilenceSeconds = Math.max(0, Math.round(readNumber(payload.hangupOnSilenceSeconds, 20)));
  }
  if (has("callTimeoutSeconds")) {
    update.callTimeoutSeconds = Math.max(0, Math.round(readNumber(payload.callTimeoutSeconds, 600)));
  }
  if (has("summarizationEnabled")) update.summarizationEnabled = readBoolean(payload.summarizationEnabled, false);
  if (has("extractionEnabled")) update.extractionEnabled = readBoolean(payload.extractionEnabled, false);
  if (has("extractionPrompt")) update.extractionPrompt = readNullableString(payload.extractionPrompt);
  if (has("analyticsWebhookUrl")) update.analyticsWebhookUrl = readNullableString(payload.analyticsWebhookUrl);
  if (has("inboundNumberId")) update.inboundNumberId = readNullableString(payload.inboundNumberId);

  return update;
}

agentRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const agents = await prisma.agent.findMany({
      where: {
        organizationId: req.auth!.organizationId
      },
      orderBy: { updatedAt: "desc" }
    });

    res.json(agents.map(mapAgent));
  })
);

agentRoutes.post(
  "/",
  requireRoles(["admin", "manager"]),
  asyncHandler(async (req, res) => {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const agent = await prisma.agent.create({
      data: {
        organizationId: req.auth!.organizationId,
        ...buildAgentCreateInput(payload)
      }
    });

    res.status(201).json(mapAgent(agent));
  })
);

agentRoutes.get(
  "/:agentId",
  asyncHandler(async (req, res) => {
    const agentId = String(req.params.agentId);

    const agent = await prisma.agent.findUnique({
      where: { id: agentId }
    });

    if (!agent || agent.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Agent not found." });
      return;
    }

    res.json(mapAgent(agent));
  })
);

agentRoutes.patch(
  "/:agentId",
  requireRoles(["admin", "manager"]),
  asyncHandler(async (req, res) => {
    const agentId = String(req.params.agentId);

    const existingAgent = await prisma.agent.findUnique({
      where: { id: agentId }
    });

    if (!existingAgent || existingAgent.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Agent not found." });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const updateData = buildAgentUpdateInput(payload);

    // If nothing to update, just return the existing agent
    if (Object.keys(updateData).length === 0) {
      res.json(mapAgent(existingAgent));
      return;
    }

    const agent = await prisma.agent.update({
      where: { id: agentId },
      data: updateData
    });

    res.json(mapAgent(agent));
  })
);

agentRoutes.delete(
  "/:agentId",
  requireRoles(["admin"]),
  asyncHandler(async (req, res) => {
    const agentId = String(req.params.agentId);
    const organizationId = req.auth!.organizationId;

    const [agent, campaignCount, callCount] = await Promise.all([
      prisma.agent.findUnique({
        where: { id: agentId }
      }),
      prisma.campaign.count({
        where: {
          organizationId,
          agentId
        }
      }),
      prisma.call.count({
        where: {
          organizationId,
          agentId
        }
      })
    ]);

    if (!agent || agent.organizationId !== organizationId) {
      res.status(404).json({ message: "Agent not found." });
      return;
    }

    if (campaignCount > 0 || callCount > 0) {
      res.status(409).json({
        message: "This agent is already connected to campaigns or calls and cannot be deleted."
      });
      return;
    }

    await Promise.all([
      prisma.phoneNumber.updateMany({
        where: {
          organizationId,
          assignedAgentId: agentId
        },
        data: {
          assignedAgentId: null
        }
      }),
      prisma.agent.delete({
        where: { id: agentId }
      })
    ]);

    res.status(204).send();
  })
);

// ─── Chat with agent (text-based prompt testing) ────────────────────────────
agentRoutes.post(
  "/:agentId/chat",
  asyncHandler(async (req, res) => {
    const agentId = String(req.params.agentId);
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });

    if (!agent || agent.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Agent not found." });
      return;
    }

    const { messages, systemPrompt } = req.body as {
      messages: Array<{ role: string; content: string }>;
      systemPrompt?: string;
    };

    if (!env.OPENAI_API_KEY) {
      res.status(400).json({ message: "OpenAI API key is not configured." });
      return;
    }

    const { OpenAIService } = await import("../services/llm/OpenAIService.js");
    const openai = new OpenAIService();
    const prompt = systemPrompt || agent.systemPrompt;
    const history = (messages || []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));

    const reply = await openai.generateNextTurn(
      prompt,
      history,
      agent.llmModel,
      agent.llmTemperature,
      agent.llmMaxTokens
    );

    res.json({ reply });
  })
);

agentRoutes.post(
  "/:agentId/test-call",
  requireRoles(["admin", "manager"]),
  asyncHandler(async (req, res) => {
    const agentId = String(req.params.agentId);
    const agent = await prisma.agent.findUnique({
      where: { id: agentId }
    });

    if (!agent || agent.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Agent not found." });
      return;
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;
    const phoneNumber = readTrimmedString(payload.phoneNumber, "");

    if (!phoneNumber) {
      res.status(400).json({ message: "Provide a phone number to trigger a test call." });
      return;
    }

    // Find a from-number for this agent's telephony provider
    const fromNumber = await prisma.phoneNumber.findFirst({
      where: {
        organizationId: req.auth!.organizationId,
        provider: agent.telephonyProvider,
        isActive: true
      },
      orderBy: { isDefaultOutbound: "desc" }
    });

    if (!fromNumber) {
      res.status(400).json({
        message: `No active ${agent.telephonyProvider} phone number found. Add one in My Numbers first.`
      });
      return;
    }

    // Create a Call record
    const call = await prisma.call.create({
      data: {
        organizationId: req.auth!.organizationId,
        agentId: agent.id,
        targetName: "Test Caller",
        targetPhone: phoneNumber,
        telephonyProvider: agent.telephonyProvider,
        status: "queued"
      }
    });

    // Queue the call job
    const jobData: CallJobData = {
      callId: call.id,
      organizationId: req.auth!.organizationId,
      agentId: agent.id,
      to: phoneNumber,
      from: fromNumber.phoneNumber,
      provider: agent.telephonyProvider
    };

    await callQueue.add(jobData, {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200
    });

    res.json({
      message: `Test call queued to ${phoneNumber} via ${agent.telephonyProvider}. You should receive a call shortly.`,
      callId: call.id,
      phoneNumber
    });
  })
);
