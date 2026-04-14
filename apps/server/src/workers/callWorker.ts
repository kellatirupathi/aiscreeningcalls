import { callQueue } from "../queues/callQueue.js";
import { prisma } from "../db/prisma.js";
import { createTelephonyProvider } from "../services/telephony/TelephonyFactory.js";
import { env } from "../config/env.js";
import type { TelephonyProvider } from "@screening/shared";
import { CartesiaTtsService } from "../services/tts/CartesiaTtsService.js";
import { ElevenLabsService } from "../services/tts/ElevenLabsService.js";
import { welcomeAudioCache } from "../websocket/WelcomeAudioCache.js";
import { resolveTtsCredential } from "../services/credentials/CredentialResolver.js";

const cartesiaTtsService = new CartesiaTtsService();
const elevenLabsService = new ElevenLabsService();

/**
 * Synthesize welcome audio for a call. Returns a Promise that resolves to the
 * audio buffer (or null if no welcome / TTS fails).
 * Used to pre-synthesize in parallel with Plivo dialing.
 */
async function synthesizeWelcome(agentId: string): Promise<Buffer | null> {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || !agent.welcomeMessage?.trim()) return null;

    // Resolve TTS credential (DB first, env fallback)
    const ttsCred = await resolveTtsCredential(
      agent.organizationId,
      agent.ttsProvider,
      (agent as unknown as { ttsCredentialId?: string | null }).ttsCredentialId
    );

    if (!ttsCred.apiKey) return null;

    if (agent.ttsProvider === "cartesia") {
      const voiceId = agent.ttsVoiceId ?? ttsCred.defaultVoiceId ?? "";
      if (!voiceId) return null;
      return await cartesiaTtsService.synthesize(agent.welcomeMessage, {
        apiKey: ttsCred.apiKey,
        modelId: agent.ttsModel,
        voiceId,
        speedRate: agent.ttsSpeedRate
      });
    } else {
      const voiceId = agent.ttsVoiceId ?? ttsCred.defaultVoiceId ?? "";
      if (!voiceId) return null;
      return await elevenLabsService.synthesize(agent.welcomeMessage, {
        voiceId,
        modelId: agent.ttsModel,
        apiKey: ttsCred.apiKey,
        stability: agent.ttsStability,
        similarityBoost: agent.ttsSimilarityBoost,
        styleExaggeration: agent.ttsStyleExaggeration,
        speedRate: agent.ttsSpeedRate
      });
    }
  } catch (err) {
    console.error(`[callWorker] Welcome synthesis failed for agent ${agentId}:`, (err as Error).message);
    return null;
  }
}

export interface CallJobData {
  callId: string;
  organizationId: string;
  campaignId?: string;
  studentId?: string;
  agentId: string;
  to: string;
  from: string;
  provider: string;
}

// Process up to 5 calls concurrently
callQueue.process(5, async (job) => {
  const data = job.data as CallJobData;
  const { callId, studentId, agentId, to, from, provider } = data;

  console.log(`[callWorker] Processing call ${callId} → ${to} via ${provider}`);

  try {
    // Mark call as ringing
    await prisma.call.update({
      where: { id: callId },
      data: { status: "ringing", startedAt: new Date() }
    });

    // ⚡ CRITICAL: Kick off welcome audio synthesis BEFORE dialing.
    // This runs IN PARALLEL with Plivo dialing the number. By the time the
    // candidate picks up (5-15 seconds of ringing), the audio is already
    // synthesized and sitting in the cache, ready to play instantly.
    console.log(`[callWorker] Pre-synthesizing welcome audio for call ${callId} (parallel with dial)`);
    const welcomePromise = synthesizeWelcome(agentId);
    welcomeAudioCache.set(callId, welcomePromise);

    // Build WebSocket media stream URL (http→ws, https→wss)
    const wsUrl = env.SERVER_URL.replace(/^http/, "ws");
    const mediaStreamUrl = `${wsUrl}/ws/media/${callId}`;

    // Dial the candidate (runs concurrently with welcome synthesis above)
    const telephonyProvider = createTelephonyProvider(provider as TelephonyProvider);
    const result = await telephonyProvider.makeOutboundCall({ to, from, callId, mediaStreamUrl });

    // Store the provider's call ID for webhook correlation
    await prisma.call.update({
      where: { id: callId },
      data: { providerCallId: result.providerCallId }
    });

    console.log(`[callWorker] Call ${callId} dialed. Provider call ID: ${result.providerCallId}`);
    return { success: true, callId, providerCallId: result.providerCallId };
  } catch (err) {
    const error = err as Error;
    console.error(`[callWorker] Call ${callId} failed:`, error.message);

    // Clean up welcome audio cache since call never reached pickup
    welcomeAudioCache.delete(callId);

    // Mark the call as failed in DB
    await prisma.call.update({
      where: { id: callId },
      data: {
        status: "failed",
        errorMessage: error.message,
        endedAt: new Date()
      }
    });

    // Update student status if linked
    if (studentId) {
      await prisma.student.update({
        where: { id: studentId },
        data: { latestStatus: "failed", lastCalledAt: new Date() }
      });
    }

    throw err; // Let Bull handle retries
  }
});

callQueue.on("completed", (job) => {
  console.log(`[callQueue] Job ${job.id} completed.`);
});

callQueue.on("failed", (job, err) => {
  console.error(`[callQueue] Job ${job.id} permanently failed:`, err.message);
});

callQueue.on("error", (err) => {
  console.error("[callQueue] Queue error:", err.message);
});
