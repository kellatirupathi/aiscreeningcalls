import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { CallSessionStore } from "./CallSessionStore.js";
import { welcomeAudioCache } from "./WelcomeAudioCache.js";
import { DeepgramService } from "../services/stt/DeepgramService.js";
import { CartesiaSttService } from "../services/stt/CartesiaSttService.js";
import { OpenAIService } from "../services/llm/OpenAIService.js";
import { ElevenLabsService } from "../services/tts/ElevenLabsService.js";
import { CartesiaTtsService } from "../services/tts/CartesiaTtsService.js";
import { GeminiLiveService } from "../services/gemini/GeminiLiveService.js";
import { AnalyticsService } from "../services/analytics/AnalyticsService.js";
import { S3StorageService } from "../services/storage/S3StorageService.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import type { ConversationMessage } from "../services/llm/OpenAIService.js";
import {
  resolveOpenAiCredential,
  resolveSttCredential,
  resolveTtsCredential,
  resolveGeminiCredential,
  type ResolvedCredential
} from "../services/credentials/CredentialResolver.js";

// Singleton services — shared across all active calls
const sessionStore = new CallSessionStore();
const deepgramService = new DeepgramService();
const cartesiaSttService = new CartesiaSttService();
const openaiService = new OpenAIService();
const elevenLabsService = new ElevenLabsService();
const cartesiaTtsService = new CartesiaTtsService();
const analyticsService = new AnalyticsService();
const s3Service = new S3StorageService();

// Plivo WebSocket message types
interface PlivoMediaMessage {
  event: string;
  sequenceNumber?: string;
  streamSid?: string;
  start?: {
    streamSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: { encoding: string; sampleRate: number; channels: number };
  };
  media?: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string; // base64-encoded mulaw audio
  };
  stop?: {
    streamSid: string;
    callSid: string;
  };
}

// Prisma agent shape used inside this module
interface AgentConfig {
  id: string;
  organizationId: string;
  name: string;
  conversationEngine: string;
  geminiModel: string;
  geminiVoice: string;
  systemPrompt: string;
  welcomeMessage: string;
  finalMessage: string | null;
  llmModel: string;
  llmTemperature: number;
  llmMaxTokens: number;
  llmCredentialId: string | null;
  sttProvider: string;
  sttModel: string;
  sttCredentialId: string | null;
  ttsProvider: string;
  ttsModel: string;
  ttsVoiceId: string | null;
  ttsCredentialId: string | null;
  geminiCredentialId: string | null;
  ttsStability: number;
  ttsSimilarityBoost: number;
  ttsStyleExaggeration: number;
  ttsSpeedRate: number;
  hangupOnSilence: boolean;
  hangupOnSilenceSeconds: number;
  callTimeoutSeconds: number;
  summarizationEnabled: boolean;
  extractionEnabled: boolean;
  extractionPrompt: string | null;
  interruptAfterWords: number;
  endpointingMs: number;
}

// Resolved API credentials for a call session — loaded from DB or env fallback
interface ResolvedCredentials {
  openai: ResolvedCredential;
  stt: ResolvedCredential;
  tts: ResolvedCredential;
  gemini: ResolvedCredential;
}

async function resolveCredentialsForAgent(agent: AgentConfig): Promise<ResolvedCredentials> {
  const [openai, stt, tts, gemini] = await Promise.all([
    resolveOpenAiCredential(agent.organizationId, agent.llmCredentialId),
    resolveSttCredential(agent.organizationId, agent.sttProvider, agent.sttCredentialId),
    resolveTtsCredential(agent.organizationId, agent.ttsProvider, agent.ttsCredentialId),
    resolveGeminiCredential(agent.organizationId, agent.geminiCredentialId)
  ]);
  return { openai, stt, tts, gemini };
}

export function createMediaBridgeServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (!request.url?.startsWith("/ws/media/")) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const callId = request.url!.split("/ws/media/")[1]?.split("?")[0] ?? "unknown";
      void handleCallSession(ws, callId);
    });
  });

  return wss;
}

async function handleCallSession(ws: WebSocket, callId: string): Promise<void> {
  // Load call + agent config from DB
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { agent: true }
  });

  if (!call?.agent) {
    console.error(`[MediaBridge] Call ${callId} not found or has no agent. Closing.`);
    ws.close(1008, "Call not found");
    return;
  }

  const agent: AgentConfig = call.agent as unknown as AgentConfig;
  sessionStore.create(callId, agent.id);

  // Mark call as answered
  await prisma.call.update({
    where: { id: callId },
    data: { status: "in-progress", answeredAt: new Date() }
  });

  // Resolve AI credentials (DB first, env fallback) for this agent
  const creds = await resolveCredentialsForAgent(agent);
  console.log(`[MediaBridge] Session started for call ${callId}, agent: ${agent.name}, engine: ${agent.conversationEngine} — credentials: llm=${creds.openai.source} stt=${creds.stt.source} tts=${creds.tts.source}`);

  // ─── GEMINI LIVE ENGINE (speech-to-speech) ─────────────────────────────────
  if (agent.conversationEngine === "gemini-live") {
    handleGeminiSession(ws, callId, agent, creds);
    return;
  }

  // ─── PIPELINE ENGINE (STT → LLM → TTS) ────────────────────────────────────
  // --- State for this call ---
  const conversationHistory: ConversationMessage[] = [];
  let sequenceNumber = 0;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let callTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let utteranceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingUtterance = ""; // accumulates partial transcripts
  let sttWs: WebSocket | null = null; // active STT WebSocket (Deepgram or Cartesia)
  let isProcessing = false; // prevent overlapping LLM+TTS requests
  let isSpeaking = false; // true while agent TTS audio is being played
  let speechStartedAt = 0; // timestamp when agent started speaking (for interrupt lockout)
  let isClosed = false;
  let streamSid = "";
  let queuedUtterance = ""; // holds user speech that arrived while isProcessing was true
  let carryOverUtterance = ""; // fragments captured while agent was speaking — merged after
  let carryOverUpdatedAt = 0;  // timestamp of last carry-over update (for staleness check)
  let isTerminating = false;   // set when closing phrase fires — ignores all further user input
  let consecutiveSkips = 0;    // counts consecutive "I don't know" / skip answers
  let silencePromptStage = 0;  // 0=none, 1="Are you there?", 2="Shall we skip?"
  let extendedSilence = false; // true when candidate said "hold on" — extends silence to 120s
  const CARRY_OVER_MAX_AGE_MS = 5000;

  // --- Retrieve welcome audio from cache ---
  // callWorker already started synthesizing this in parallel with the dial,
  // so by the time the candidate picks up, the audio is usually ready instantly.
  let cachedWelcomeAudio: Buffer | null = null;
  const welcomePromise = welcomeAudioCache.get(callId);

  if (welcomePromise) {
    const t0 = Date.now();
    cachedWelcomeAudio = await welcomePromise;
    const waitMs = Date.now() - t0;
    welcomeAudioCache.delete(callId);
    if (cachedWelcomeAudio) {
      console.log(`[MediaBridge] Welcome audio retrieved from cache for call ${callId} (waited ${waitMs}ms, ${cachedWelcomeAudio.length} bytes)`);
    }
  } else if (agent.welcomeMessage.trim()) {
    // Fallback: cache miss (e.g. direct test call that bypassed callWorker).
    // Synthesize now — slower but ensures welcome always plays.
    console.log(`[MediaBridge] Cache miss — synthesizing welcome now for call ${callId}`);
    try {
      if (agent.ttsProvider === "cartesia" && creds.tts.apiKey) {
        const voiceId = agent.ttsVoiceId ?? creds.tts.defaultVoiceId ?? "";
        if (voiceId) {
          cachedWelcomeAudio = await cartesiaTtsService.synthesize(agent.welcomeMessage, {
            apiKey: creds.tts.apiKey,
            modelId: agent.ttsModel,
            voiceId,
            speedRate: agent.ttsSpeedRate
          });
        }
      } else if (creds.tts.apiKey) {
        const voiceId = agent.ttsVoiceId ?? creds.tts.defaultVoiceId ?? "";
        if (voiceId) {
          cachedWelcomeAudio = await elevenLabsService.synthesize(agent.welcomeMessage, {
            voiceId,
            modelId: agent.ttsModel,
            apiKey: creds.tts.apiKey,
            stability: agent.ttsStability,
            similarityBoost: agent.ttsSimilarityBoost,
            styleExaggeration: agent.ttsStyleExaggeration,
            speedRate: agent.ttsSpeedRate
          });
        }
      }
    } catch (err) {
      console.error(`[MediaBridge] Fallback welcome synthesis failed:`, (err as Error).message);
    }
  }

  // --- Helpers ---

  // Phrases that indicate candidate wants a moment — extend silence timer
  const HOLD_PHRASES = new Set([
    "hold on", "one moment", "one second", "give me a minute",
    "give me a moment", "give me a sec", "just a moment", "just a second",
    "just a sec", "wait", "wait a moment", "let me think",
    "let me check", "one minute"
  ]);

  function isHoldPhrase(text: string): boolean {
    const lower = text.toLowerCase().replace(/[.,!?]+/g, "").trim();
    return HOLD_PHRASES.has(lower) || Array.from(HOLD_PHRASES).some((p) => lower.includes(p));
  }

  function resetSilenceTimer(): void {
    if (!agent.hangupOnSilence) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silencePromptStage = 0;
    extendedSilence = false;

    // Simple: just hang up after the full timeout. No intermediate prompts.
    silenceTimer = setTimeout(() => {
      if (!isClosed) void endCall("silence-timeout");
    }, agent.hangupOnSilenceSeconds * 1000);
  }

  // Keep this stub so existing callers don't break
  function scheduleNextSilenceStage(_stage1Ms: number, _stage2Ms: number, _stage3Ms: number): void {
    // No-op — progressive prompts removed.
    void _stage1Ms; void _stage2Ms; void _stage3Ms;
  }

  function resetSilenceTimerExtended(): void {
    if (!agent.hangupOnSilence) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silencePromptStage = 0;
    extendedSilence = true;
    // Extended: 120s total, no intermediate prompts
    silenceTimer = setTimeout(() => {
      if (!isClosed) void endCall("silence-timeout");
    }, 120_000);
    console.log(`[MediaBridge] Silence timer extended to 120s (candidate asked for time)`);
  }

  async function playAudio(audioBuffer: Buffer): Promise<void> {
    if (!isClosed && ws.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify({
        event: "playAudio",
        media: {
          contentType: "audio/x-mulaw",
          sampleRate: 8000,
          payload: audioBuffer.toString("base64")
        }
      });
      ws.send(payload);
    }
  }

  /** Synthesize text to audio and return the buffer */
  async function synthesize(text: string): Promise<Buffer | null> {
    try {
      if (agent.ttsProvider === "cartesia") {
        if (!creds.tts.apiKey) return null;
        const voiceId = agent.ttsVoiceId ?? creds.tts.defaultVoiceId ?? "";
        if (!voiceId) return null;
        return await cartesiaTtsService.synthesize(text, {
          apiKey: creds.tts.apiKey,
          modelId: agent.ttsModel,
          voiceId,
          speedRate: agent.ttsSpeedRate
        });
      } else {
        if (!creds.tts.apiKey) return null;
        const voiceId = agent.ttsVoiceId ?? creds.tts.defaultVoiceId ?? "";
        if (!voiceId) return null;
        return await elevenLabsService.synthesize(text, {
          voiceId,
          modelId: agent.ttsModel,
          apiKey: creds.tts.apiKey,
          stability: agent.ttsStability,
          similarityBoost: agent.ttsSimilarityBoost,
          styleExaggeration: agent.ttsStyleExaggeration,
          speedRate: agent.ttsSpeedRate
        });
      }
    } catch (err) {
      console.error("[MediaBridge] TTS synthesis error:", (err as Error).message);
      return null;
    }
  }

  /** Play audio and wait for estimated playback to complete */
  async function speakAudio(audioBuffer: Buffer): Promise<void> {
    isSpeaking = true;
    speechStartedAt = Date.now(); // Track for interrupt lockout
    if (utteranceTimer) clearTimeout(utteranceTimer);

    // Wipe any stale pendingUtterance left over from the PREVIOUS turn.
    // Without this, trailing STT fragments from the last answer leak into
    // the next question's answer ("Express is a framework... No, async is...").
    // If there IS pending text, move it to carry-over so it can still be
    // captured — but it will be discarded if stale (>5s) after speech ends.
    if (pendingUtterance.trim()) {
      carryOverUtterance = carryOverUtterance
        ? `${carryOverUtterance} ${pendingUtterance}`
        : pendingUtterance;
      carryOverUpdatedAt = Date.now();
      console.log(`[MediaBridge] Moving pending to carry-over on speech start: "${pendingUtterance}"`);
      pendingUtterance = "";
    }

    await playAudio(audioBuffer);

    const playbackMs = Math.ceil((audioBuffer.length / 8000) * 1000) + 500;
    console.log(`[MediaBridge] Speaking for ~${playbackMs}ms (${audioBuffer.length} bytes)`);

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        isSpeaking = false;
        console.log(`[MediaBridge] Done speaking, now listening`);

        // Fix 2: flush carry-over captured during agent speech so candidate's
        // mid-speech response is never lost.
        // APPEND carry-over to pendingUtterance (carry-over is chronologically
        // LATER than pendingUtterance — it was captured while the agent was
        // speaking, AFTER pendingUtterance was already accumulated).
        if (carryOverUtterance && !isClosed && !isTerminating) {
          const ageMs = Date.now() - carryOverUpdatedAt;
          if (ageMs <= CARRY_OVER_MAX_AGE_MS) {
            pendingUtterance = pendingUtterance
              ? `${pendingUtterance} ${carryOverUtterance}`
              : carryOverUtterance;
            console.log(`[MediaBridge] Flushing carry-over (${ageMs}ms old): "${carryOverUtterance}"`);

            const debounceMs = getSmartDebounceMs(pendingUtterance);
            if (utteranceTimer) clearTimeout(utteranceTimer);
            utteranceTimer = setTimeout(() => {
              if (pendingUtterance.trim()) {
                const full = pendingUtterance;
                pendingUtterance = "";
                console.log(`[MediaBridge] Full utterance (${debounceMs}ms debounce, post-speech flush): "${full}"`);
                void processUserUtterance(full);
              }
            }, debounceMs);
          } else {
            console.log(`[MediaBridge] Discarding stale carry-over (${ageMs}ms old): "${carryOverUtterance}"`);
          }
          carryOverUtterance = "";
          carryOverUpdatedAt = 0;
        }

        resolve();
      }, playbackMs);
    });
  }

  /** High-level: synthesize + play + save turn (non-blocking DB) */
  async function speakText(text: string): Promise<void> {
    if (!text.trim() || isClosed) return;
    console.log(`[MediaBridge] TTS: "${text.slice(0, 80)}..." via ${agent.ttsProvider}`);

    const audioBuffer = await synthesize(text);
    if (!audioBuffer) return;

    await speakAudio(audioBuffer);

    // Non-blocking DB write — don't block audio pipeline
    sequenceNumber++;
    const seq = sequenceNumber;
    prisma.callTurn.create({
      data: { callId, speaker: "assistant", sequence: seq, text }
    }).catch((err) => console.error("[MediaBridge] DB write error:", (err as Error).message));
    sessionStore.append(callId, `Agent: ${text}`);

    if (!conversationHistory.some((m) => m.role === "assistant" && m.content === text)) {
      conversationHistory.push({ role: "assistant", content: text });
    }
  }

  async function playWelcomeFromCache(audioBuffer: Buffer, text: string): Promise<void> {
    try {
      await speakAudio(audioBuffer);

      // Non-blocking DB write
      sequenceNumber++;
      const seq = sequenceNumber;
      prisma.callTurn.create({
        data: { callId, speaker: "assistant", sequence: seq, text }
      }).catch((err) => console.error("[MediaBridge] DB write error:", (err as Error).message));
      sessionStore.append(callId, `Agent: ${text}`);
      conversationHistory.push({ role: "assistant", content: text });
    } catch (err) {
      console.error("[MediaBridge] Welcome playback error:", (err as Error).message);
      isSpeaking = false;
    }
  }

  // ─── Closing phrase detection ───────────────────────────────────────────────
  // Only match phrases that clearly signal the agent is ENDING the call.
  // Avoid false positives like "thank you for sharing" or "that's all for this question".
  const closingPhrases = [
    "have a good day", "have a great day", "have a nice day",
    "goodbye", "good bye", "bye bye", "take care",
    "we'll call back", "call you back", "call back later",
    "end the call", "end of the call", "ending the call",
    "screening is complete", "this concludes", "that concludes",
    "that's all the questions", "thats all the questions",
    "all the questions are done", "that's all for", "thats all for",
    "thank you for your time", "thanks for your time",
    "we can continue at another time", "continue at another time",
    "we will get back to you", "we'll get back to you",
    "get back to you soon"
  ];

  function isClosingPhrase(text: string): boolean {
    const lower = text.toLowerCase();
    return closingPhrases.some((phrase) => lower.includes(phrase));
  }

  // Natural gap (ms) between candidate finishing and agent starting to speak.
  // This is like a real interviewer briefly pausing to process the answer
  // before responding — feels much more natural than an instant robotic reply.
  const NATURAL_GAP_MS = 800;

  // ─── Streaming conversation turn ────────────────────────────────────────────
  // Uses LLM streaming: each sentence is synthesized & played as it arrives.
  // Sentences are queued and played SEQUENTIALLY (not concurrently).
  // The candidate hears the first sentence in ~500ms instead of waiting 3-5s.
  async function processUserUtterance(transcript: string): Promise<void> {
    if (!transcript.trim() || isClosed || isTerminating) return;

    // If already processing, queue instead of dropping
    if (isProcessing) {
      console.log(`[MediaBridge] Queuing utterance (LLM busy): "${transcript}"`);
      queuedUtterance = queuedUtterance ? `${queuedUtterance} ${transcript}` : transcript;
      return;
    }

    isProcessing = true;

    // Pause silence timer while agent is processing + speaking
    // (otherwise silence timer fires during LLM/TTS and kills the call)
    if (silenceTimer) clearTimeout(silenceTimer);

    // Mark when the candidate stopped speaking — used to enforce natural gap
    const utteranceReceivedAt = Date.now();

    try {
      // #14: Detect skip/don't-know patterns in the user's utterance
      const lowerTranscript = transcript.toLowerCase();
      const isSkipAnswer =
        lowerTranscript.includes("i don't know") ||
        lowerTranscript.includes("i dont know") ||
        lowerTranscript.includes("no idea") ||
        lowerTranscript.includes("not sure") ||
        lowerTranscript.includes("can we skip") ||
        lowerTranscript.includes("skip this") ||
        lowerTranscript.includes("move to next") ||
        lowerTranscript.includes("next question");

      if (isSkipAnswer) {
        consecutiveSkips++;
        console.log(`[MediaBridge] Skip detected (${consecutiveSkips} consecutive): "${transcript}"`);
      } else if (transcript.trim().split(/\s+/).length >= 5) {
        // Only reset skip counter if the candidate gave a real answer (5+ words)
        consecutiveSkips = 0;
      }

      // #14: After 4 consecutive skips, inject a system hint so the LLM wraps up
      if (consecutiveSkips >= 4) {
        console.log(`[MediaBridge] 4+ consecutive skips — injecting early-termination hint`);
        conversationHistory.push({
          role: "system",
          content: "The candidate has said 'I don't know' for 4+ consecutive questions. End the interview now with the closing script. Do not ask more questions."
        });
      }

      // #1: Detect callback request — "call me later" / "I'm busy"
      const isCallbackRequest =
        lowerTranscript.includes("call me later") ||
        lowerTranscript.includes("call me back") ||
        lowerTranscript.includes("call me after") ||
        lowerTranscript.includes("call back") ||
        lowerTranscript.includes("i'm busy") ||
        lowerTranscript.includes("im busy") ||
        lowerTranscript.includes("not a good time") ||
        lowerTranscript.includes("call me tomorrow") ||
        lowerTranscript.includes("busy right now");

      if (isCallbackRequest) {
        console.log(`[MediaBridge] Callback request detected: "${transcript}"`);
        // Store the raw callback note for later extraction
        prisma.call.update({
          where: { id: callId },
          data: {
            subStatus: "callback-requested",
            extractedDataJson: { callbackNote: transcript, detectedAt: new Date().toISOString() }
          }
        }).catch((err) => console.error("[MediaBridge] Callback note save error:", (err as Error).message));
      }

      // Non-blocking DB write for user turn
      sequenceNumber++;
      prisma.callTurn.create({
        data: { callId, speaker: "user", sequence: sequenceNumber, text: transcript }
      }).catch((err) => console.error("[MediaBridge] DB write error:", (err as Error).message));
      sessionStore.append(callId, `Candidate: ${transcript}`);
      conversationHistory.push({ role: "user", content: transcript });

      if (!creds.openai.apiKey) {
        await speakText("I'm sorry, I'm unable to process your response right now.");
        return;
      }

      // --- Streaming LLM + sequential sentence-level TTS ---
      // playbackChain ensures sentences play one after another, not all at once.
      let playbackChain = Promise.resolve();
      let closingDetected = false;
      let firstSentencePlayed = false;

      const fullReply = await openaiService.streamNextTurn(
        agent.systemPrompt,
        conversationHistory,
        agent.llmModel,
        agent.llmTemperature,
        agent.llmMaxTokens,
        (sentence, _isLast) => {
          if (!sentence.trim() || isClosed || closingDetected) return;

          console.log(`[MediaBridge] LLM sentence: "${sentence}"`);

          if (isClosingPhrase(sentence)) {
            closingDetected = true;
            // Block any further transcript fragments the moment the LLM emits
            // a closing phrase — we do NOT want another user turn once we've
            // decided to say goodbye.
            isTerminating = true;
            carryOverUtterance = "";
            carryOverUpdatedAt = 0;
            pendingUtterance = "";
            if (utteranceTimer) clearTimeout(utteranceTimer);
          }

          // Chain each sentence: wait for previous to finish, then synthesize + play.
          // Each link has its own .catch() so one failed sentence doesn't break the chain.
          playbackChain = playbackChain.then(async () => {
            if (isClosed) return;
            const audio = await synthesize(sentence);
            if (!audio || isClosed) return;

            if (!firstSentencePlayed) {
              firstSentencePlayed = true;
              const elapsed = Date.now() - utteranceReceivedAt;
              const remaining = NATURAL_GAP_MS - elapsed;
              if (remaining > 0) {
                console.log(`[MediaBridge] Enforcing natural gap: waiting ${remaining}ms`);
                await new Promise((resolve) => setTimeout(resolve, remaining));
              }
            }

            await speakAudio(audio);
          }).catch((err) => {
            console.error(`[MediaBridge] Playback chain error for sentence: "${sentence.slice(0, 40)}":`, (err as Error).message);
            isSpeaking = false;
          });
        },
        creds.openai.apiKey
      );

      // Wait for ALL sentences to finish playing before continuing
      await playbackChain;

      // Save full response as ONE turn (not per-sentence)
      if (fullReply.trim()) {
        conversationHistory.push({ role: "assistant", content: fullReply });
        sequenceNumber++;
        prisma.callTurn.create({
          data: { callId, speaker: "assistant", sequence: sequenceNumber, text: fullReply }
        }).catch((err) => console.error("[MediaBridge] DB write error:", (err as Error).message));
        sessionStore.append(callId, `Agent: ${fullReply}`);
      }

      // Resume silence timer now that agent is done speaking
      resetSilenceTimer();

      // Handle closing — only end call if the LLM explicitly said a
      // closing phrase (like "goodbye", "have a nice day", etc.)
      // No more arbitrary turn-count limits — interviews can have 30+ turns.
      if (closingDetected) {
        console.log(`[MediaBridge] Closing phrase detected — ending call in 3s`);
        setTimeout(() => { void endCall("completed"); }, 3000);
        return;
      }
    } catch (err) {
      console.error("[MediaBridge] LLM error:", (err as Error).message);
      // Reset isSpeaking in case the error occurred mid-speech —
      // otherwise the agent stays permanently silent.
      isSpeaking = false;
    } finally {
      isProcessing = false;

      // Process any queued utterance that arrived while we were busy.
      // AWAIT (not void) to prevent concurrent processUserUtterance calls
      // which would fire two LLM requests and interleave audio.
      if (queuedUtterance.trim() && !isClosed && !isTerminating) {
        const queued = queuedUtterance;
        queuedUtterance = "";
        console.log(`[MediaBridge] Processing queued utterance: "${queued}"`);
        await processUserUtterance(queued);
      }
    }
  }

  async function endCall(reason: string): Promise<void> {
    if (isClosed) return;
    isClosed = true;

    // Clear timers
    if (silenceTimer) clearTimeout(silenceTimer);
    if (callTimeoutTimer) clearTimeout(callTimeoutTimer);
    if (utteranceTimer) clearTimeout(utteranceTimer);

    // Close STT WebSocket (Deepgram or Cartesia)
    if (sttWs && sttWs.readyState === WebSocket.OPEN) {
      if (agent.sttProvider === "cartesia") {
        cartesiaSttService.close(sttWs);
      } else {
        deepgramService.close(sttWs);
      }
    }

    // Tell Plivo to stop (best-effort)
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "Call ended");
    }

    sessionStore.remove(callId);
    await finalizeCallRecord(callId, reason, agent);
  }

  // ─── Smart Endpointing ───────────────────────────────────────────────────
  // BINARY decision — no middle bucket anymore:
  //   - Clear short reply ("Yes", "No", "Okay", ≤2 words) → 600ms (fast)
  //   - ANYTHING else (even if it ends with punctuation) → 6000ms (patient)
  //
  // Why so long for non-short answers?
  // - Candidates in technical interviews THINK while speaking.
  // - They pause 2-4 seconds between sentences while searching for words.
  // - The old 1200ms bucket caused massive fragmentation — answers like
  //   "Props and state you're asking about right?" ended with ? so we jumped
  //   in at 1200ms, but candidate was still mid-thought.
  // - 6000ms gives 6 seconds of true silence before we assume they're done.
  //   The timer RESETS every new STT fragment, so the total wait is
  //   "time since LAST word spoken", not "total answer time".
  //
  // Trade-off: candidates who give ONE complete sentence and stop will wait
  // 6 seconds. This is acceptable because most technical answers are long.

  // Fix 1: removed filler words ("okay", "ok", "hmm", "sure", "right", "hi",
  // "hello", "hey", "fine", "great", "thanks", "please") — these are things
  // candidates say WHILE THINKING, not terminal answers. Treating them as
  // complete turns caused the agent to jump in before the real answer arrived.
  // Only keep true yes/no acknowledgments and terminal markers.
  const SHORT_REPLIES = new Set([
    "yes", "no", "yeah", "yep", "nope", "correct",
    "ready", "i'm ready", "yes start", "start", "go ahead",
    "done", "finished", "that's it", "thats it",
    "that's all", "thats all", "completed", "no more", "nothing"
  ]);

  // Filler words — if an utterance is ONLY one of these, we wait as long as a
  // long answer (4000 ms) because it's almost certainly a stall, not an answer.
  const FILLER_WORDS = new Set([
    "okay", "ok", "hmm", "hm", "uh", "um", "er", "so", "if", "hello", "hi", "hey",
    "right", "sure", "fine", "great", "thanks", "thank", "please", "whatever"
  ]);

  function getSmartDebounceMs(text: string): number {
    const trimmed = text.trim().toLowerCase().replace(/[.,!?"'-]+$/, "").replace(/^[.,!?"'-]+/, "");
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

    // True short acknowledgments get a fast response (yes, no, yeah, etc.)
    if (SHORT_REPLIES.has(trimmed)) {
      return 1500;
    }

    // Single-word FILLER → wait for real content (4000 ms, same as long answer).
    // Prevents "Okay", "If", "Hmm", "Whatever" from firing the LLM prematurely.
    if (wordCount === 1 && FILLER_WORDS.has(trimmed)) {
      return 4000;
    }

    // Single real word that's not a filler — still give it some patience.
    if (wordCount === 1) {
      return 2500;
    }

    // Everything else: candidates think mid-answer, pause between sentences.
    return 4000;
  }

  // Interrupt lockout: during the first N ms of agent speech, do NOT allow
  // interrupts. This prevents candidates from accidentally triggering interrupts
  // when they're just continuing their thought and the agent happened to start
  // replying to a fragment.
  const INTERRUPT_LOCKOUT_MS = 3000;

  // ─── Transcript fragment handler with smart endpointing ───────────────────
  function handleTranscriptFragment(transcript: string) {
    const text = transcript.trim();
    if (!text || isClosed) return;

    // Once we've committed to ending the call, ignore all further user input.
    // Prevents the LLM from restarting the intro when the user says "Okay"
    // after the agent has already said goodbye.
    if (isTerminating) {
      console.log(`[MediaBridge] Ignoring fragment during termination: "${text}"`);
      return;
    }

    // --- Interruption handling ---
    if (isSpeaking) {
      const elapsedSinceSpeechStart = Date.now() - speechStartedAt;

      // LOCKOUT: Don't allow interrupts during the first N ms of agent speech.
      // Fix 2: instead of discarding these fragments, carry them over so the
      // candidate's mid-speech response is preserved and merged after playback.
      if (elapsedSinceSpeechStart < INTERRUPT_LOCKOUT_MS) {
        carryOverUtterance = carryOverUtterance ? `${carryOverUtterance} ${text}` : text;
        carryOverUpdatedAt = Date.now();
        console.log(`[MediaBridge] Carry-over during lockout (${elapsedSinceSpeechStart}ms): "${text}"`);
        return;
      }

      const wordCount = text.split(/\s+/).length;
      // Fix 4: 8 → 4 words. Combined with carry-over, false interrupts are
      // absorbed by the carry-over path instead of being blocked at the threshold.
      const threshold = Math.max(4, agent.interruptAfterWords);
      if (wordCount >= threshold) {
        console.log(`[MediaBridge] Candidate interrupted (${wordCount} words): "${text}"`);
        isSpeaking = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: "clearAudio", streamId: streamSid }));
        }
        // Fall through to accumulate into pendingUtterance below.
      } else {
        // Fix 2: short fragment during agent speech — carry over, don't discard.
        carryOverUtterance = carryOverUtterance ? `${carryOverUtterance} ${text}` : text;
        carryOverUpdatedAt = Date.now();
        console.log(`[MediaBridge] Carry-over during speech (${wordCount} words < ${threshold}): "${text}"`);
        return;
      }
    }

    // #8: Basic non-English detection — if STT returns text with unusual
    // Unicode (Devanagari, Telugu, etc.) or known non-English markers, inject
    // a language request into the next LLM turn via pending utterance prefix.
    const hasNonLatin = /[^\u0000-\u007F\u00C0-\u024F]/.test(text);
    if (hasNonLatin && text.length > 10) {
      console.log(`[MediaBridge] Non-English text detected: "${text}"`);
      // Prepend a hint so LLM asks candidate to speak English
      pendingUtterance = pendingUtterance
        ? `${pendingUtterance} [The candidate appears to be speaking in a non-English language] ${text}`
        : `[The candidate appears to be speaking in a non-English language] ${text}`;

      const debounceMs = getSmartDebounceMs(pendingUtterance);
      if (utteranceTimer) clearTimeout(utteranceTimer);
      utteranceTimer = setTimeout(() => {
        if (pendingUtterance.trim()) {
          const full = pendingUtterance;
          pendingUtterance = "";
          void processUserUtterance(full);
        }
      }, debounceMs);
      return;
    }

    // #11: Detect "hold on" / "give me a minute" → extend silence timer
    if (isHoldPhrase(text)) {
      console.log(`[MediaBridge] Hold phrase detected: "${text}" — extending silence timer`);
      resetSilenceTimerExtended();
      void speakText("Sure, take your time.");
      return;
    }

    resetSilenceTimer();

    // Fix 2: merge any fresh carry-over from agent speech into pendingUtterance
    // APPEND carry-over (carry-over is chronologically LATER than pendingUtterance).
    if (carryOverUtterance) {
      const ageMs = Date.now() - carryOverUpdatedAt;
      if (ageMs <= CARRY_OVER_MAX_AGE_MS) {
        pendingUtterance = pendingUtterance ? `${pendingUtterance} ${carryOverUtterance}` : carryOverUtterance;
        console.log(`[MediaBridge] Merging carry-over into pending: "${carryOverUtterance}"`);
      } else {
        console.log(`[MediaBridge] Discarding stale carry-over (${ageMs}ms old): "${carryOverUtterance}"`);
      }
      carryOverUtterance = "";
      carryOverUpdatedAt = 0;
    }

    // Accumulate fragments
    pendingUtterance = pendingUtterance ? `${pendingUtterance} ${text}` : text;
    console.log(`[MediaBridge] STT fragment: "${text}" | accumulated: "${pendingUtterance}"`);

    // Smart debounce based on what was said
    const debounceMs = getSmartDebounceMs(pendingUtterance);
    if (utteranceTimer) clearTimeout(utteranceTimer);
    utteranceTimer = setTimeout(() => {
      if (pendingUtterance.trim()) {
        const fullUtterance = pendingUtterance;
        pendingUtterance = "";
        console.log(`[MediaBridge] Full utterance (${debounceMs}ms debounce): "${fullUtterance}"`);
        void processUserUtterance(fullUtterance);
      }
    }, debounceMs);
  }

  // --- Initialize STT with auto-reconnect ---
  function connectStt(): void {
    if (isClosed) return;

    if (agent.sttProvider === "cartesia") {
      if (!creds.stt.apiKey) {
        console.warn("[MediaBridge] Cartesia API key not set — STT disabled");
        return;
      }
      sttWs = cartesiaSttService.startStreamingSession(
        creds.stt.apiKey,
        agent.sttModel,
        (transcript, _isFinal, speechFinal) => {
          if (speechFinal || _isFinal) {
            handleTranscriptFragment(transcript);
          }
        },
        (err) => {
          console.error("[MediaBridge] Cartesia STT error:", err.message);
        },
        () => {
          // Auto-reconnect on close if call is still active
          if (!isClosed) {
            console.log("[MediaBridge] STT disconnected, reconnecting in 500ms...");
            sttWs = null;
            setTimeout(connectStt, 500);
          }
        }
      );
    } else {
      // Default: Deepgram
      if (!creds.stt.apiKey) {
        console.warn("[MediaBridge] Deepgram API key not set — STT disabled");
        return;
      }
      sttWs = deepgramService.startStreamingSession(
        creds.stt.apiKey,
        agent.sttModel,
        (transcript, _isFinal, speechFinal) => {
          if (speechFinal) {
            handleTranscriptFragment(transcript);
          }
        },
        (err) => {
          console.error("[MediaBridge] Deepgram error:", err.message);
        },
        () => {
          if (!isClosed) {
            console.log("[MediaBridge] STT disconnected, reconnecting in 500ms...");
            sttWs = null;
            setTimeout(connectStt, 500);
          }
        },
        Math.max(1500, agent.endpointingMs)
      );
    }
  }

  connectStt();

  // --- Call-level timeout ---
  if (agent.callTimeoutSeconds > 0) {
    callTimeoutTimer = setTimeout(() => {
      void endCall("timeout");
    }, agent.callTimeoutSeconds * 1000);
  }

  // --- WebSocket message handler ---
  let welcomeSent = false;

  ws.on("message", (raw, isBinary) => {
    // If binary, it's raw audio from Plivo — forward to STT
    if (isBinary) {
      const audioChunk = raw as Buffer;
      if (sttWs) {
        if (agent.sttProvider === "cartesia") {
          cartesiaSttService.sendAudio(sttWs, audioChunk);
        } else {
          deepgramService.sendAudio(sttWs, audioChunk);
        }
      }
      return;
    }

    try {
      const msg = JSON.parse(raw.toString()) as PlivoMediaMessage;

      switch (msg.event) {
        case "connected":
        case "start":
          streamSid = msg.start?.streamSid ?? (msg as unknown as Record<string, unknown>).streamId as string ?? msg.streamSid ?? "";
          sessionStore.setStreamSid(callId, streamSid);
          console.log(`[MediaBridge] Plivo ${msg.event} event, stream: ${streamSid}`);
          // Trigger welcome on start/connected
          if (!welcomeSent) {
            welcomeSent = true;
            if (cachedWelcomeAudio) {
              // Play pre-synthesized audio instantly — no TTS wait
              console.log(`[MediaBridge] Playing pre-cached welcome audio for call ${callId}`);
              void playWelcomeFromCache(cachedWelcomeAudio, agent.welcomeMessage);
            } else if (agent.welcomeMessage.trim()) {
              // Fallback: synthesize now (cache miss)
              console.log(`[MediaBridge] Sending welcome message for call ${callId}`);
              void speakText(agent.welcomeMessage);
            } else {
              // No welcome message — ask LLM to start the conversation from the prompt
              console.log(`[MediaBridge] No welcome message, asking LLM to start for call ${callId}`);
              void processUserUtterance("The call has just started. Begin the conversation as instructed in your prompt.");
            }
          }
          resetSilenceTimer();
          break;

        case "media":
          // Trigger welcome on first media if start/connected never arrived
          if (!welcomeSent) {
            welcomeSent = true;
            streamSid = (msg as unknown as Record<string, unknown>).streamId as string ?? msg.streamSid ?? "";
            sessionStore.setStreamSid(callId, streamSid);
            console.log(`[MediaBridge] First media received, triggering welcome for call ${callId}`);
            if (cachedWelcomeAudio) {
              console.log(`[MediaBridge] Playing pre-cached welcome audio for call ${callId}`);
              void playWelcomeFromCache(cachedWelcomeAudio, agent.welcomeMessage);
            } else if (agent.welcomeMessage.trim()) {
              void speakText(agent.welcomeMessage);
            } else {
              console.log(`[MediaBridge] No welcome message, asking LLM to start for call ${callId}`);
              void processUserUtterance("The call has just started. Begin the conversation as instructed in your prompt.");
            }
            resetSilenceTimer();
          }

          if (msg.media?.payload) {
            const audioChunk = Buffer.from(msg.media.payload, "base64");
            if (sttWs) {
              if (agent.sttProvider === "cartesia") {
                cartesiaSttService.sendAudio(sttWs, audioChunk);
              } else {
                deepgramService.sendAudio(sttWs, audioChunk);
              }
            }
          }
          break;

        case "stop":
          console.log(`[MediaBridge] Plivo stop event for call ${callId}`);
          void endCall("completed");
          break;

        case "incorrectPayload":
          // Plivo rejected something we sent — ignore
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("[MediaBridge] message parse error:", (err as Error).message);
    }
  });

  ws.on("close", () => {
    void endCall("disconnected");
  });

  ws.on("error", (err) => {
    console.error("[MediaBridge] WebSocket error:", err.message);
    void endCall("error");
  });
}

// ─── Gemini Live session handler ──────────────────────────────────────────────
function handleGeminiSession(ws: WebSocket, callId: string, agent: AgentConfig, creds: ResolvedCredentials): void {
  const geminiApiKey = creds.gemini.apiKey;
  if (!geminiApiKey) {
    console.error("[MediaBridge] Gemini API key not set — cannot use gemini-live engine");
    ws.close(1008, "Gemini API key not configured");
    return;
  }

  const gemini = new GeminiLiveService();
  let isClosed = false;
  let streamSid = "";
  let sequenceNumber = 0;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let callTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  const transcriptParts: Array<{ speaker: string; text: string }> = [];

  function resetSilenceTimer(): void {
    if (!agent.hangupOnSilence) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (!isClosed) void endCall("silence-timeout");
    }, agent.hangupOnSilenceSeconds * 1000);
  }

  async function endCall(reason: string): Promise<void> {
    if (isClosed) return;
    isClosed = true;
    if (silenceTimer) clearTimeout(silenceTimer);
    if (callTimeoutTimer) clearTimeout(callTimeoutTimer);
    gemini.close();
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "Call ended");
    }
    sessionStore.remove(callId);
    await finalizeCallRecord(callId, reason, agent);
  }

  // Connect to Gemini Live API
  gemini.connect(
    {
      apiKey: geminiApiKey,
      model: agent.geminiModel || "gemini-2.0-flash-live-001",
      systemPrompt: agent.systemPrompt,
      voice: agent.geminiVoice || "Kore"
    },
    {
      onAudioChunk: (mulawChunk) => {
        // Forward Gemini's audio response to Plivo
        if (!isClosed && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            event: "playAudio",
            media: {
              contentType: "audio/x-mulaw",
              sampleRate: 8000,
              payload: mulawChunk.toString("base64")
            }
          }));
        }
        resetSilenceTimer();
      },
      onTranscript: (text, role) => {
        if (!text.trim()) return;
        sequenceNumber++;
        const speaker = role === "assistant" ? "assistant" : "user";
        transcriptParts.push({ speaker, text });
        // Save turn to DB asynchronously
        void prisma.callTurn.create({
          data: { callId, speaker, sequence: sequenceNumber, text }
        }).catch((err) => console.error("[GeminiLive] Failed to save turn:", (err as Error).message));
        sessionStore.append(callId, `${speaker === "assistant" ? "Agent" : "Candidate"}: ${text}`);
      },
      onInterrupted: () => {
        console.log(`[GeminiLive] User interrupted agent for call ${callId}`);
        // Send clearAudio to stop Plivo playback
        if (!isClosed && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: "clearAudio", streamId: streamSid }));
        }
      },
      onError: (err) => {
        console.error(`[GeminiLive] Error for call ${callId}:`, err.message);
        void endCall("error");
      },
      onClose: () => {
        console.log(`[GeminiLive] Connection closed for call ${callId}`);
        if (!isClosed) void endCall("completed");
      }
    }
  );

  // Call-level timeout
  if (agent.callTimeoutSeconds > 0) {
    callTimeoutTimer = setTimeout(() => {
      void endCall("timeout");
    }, agent.callTimeoutSeconds * 1000);
  }

  // WebSocket message handler for Plivo audio
  let welcomeSent = false;
  let audioChunkCount = 0;

  ws.on("message", (raw, isBinary) => {
    if (isBinary) {
      // Binary audio from Plivo — forward to Gemini
      gemini.sendAudio(raw as Buffer);
      audioChunkCount++;
      if (audioChunkCount === 1) console.log(`[GeminiLive] First binary audio chunk forwarded to Gemini`);
      return;
    }

    try {
      const msg = JSON.parse(raw.toString()) as PlivoMediaMessage;

      switch (msg.event) {
        case "connected":
        case "start":
          streamSid = msg.start?.streamSid
            ?? (msg as unknown as Record<string, unknown>).streamId as string
            ?? msg.streamSid ?? "";
          sessionStore.setStreamSid(callId, streamSid);
          console.log(`[GeminiLive] Plivo ${msg.event} event, stream: ${streamSid}`);
          resetSilenceTimer();
          break;

        case "media":
          if (!welcomeSent) {
            welcomeSent = true;
            streamSid = (msg as unknown as Record<string, unknown>).streamId as string
              ?? msg.streamSid ?? streamSid;
            if (!streamSid) sessionStore.setStreamSid(callId, streamSid);
            console.log(`[GeminiLive] First media received for call ${callId}, sending welcome...`);

            // Wait for Gemini setup to complete, then send welcome
            const sendWelcome = () => {
              if (!gemini.isConnected) {
                // Retry in 200ms if setup not done yet
                setTimeout(sendWelcome, 200);
                return;
              }
              if (agent.welcomeMessage.trim()) {
                console.log(`[GeminiLive] Sending welcome text to Gemini`);
                gemini.sendText(
                  `Start the conversation now by saying exactly: "${agent.welcomeMessage}"`
                );
              }
            };
            setTimeout(sendWelcome, 300);
            resetSilenceTimer();
          }

          if (msg.media?.payload) {
            const audioChunk = Buffer.from(msg.media.payload, "base64");
            gemini.sendAudio(audioChunk);
            audioChunkCount++;
            if (audioChunkCount === 1) console.log(`[GeminiLive] First media audio chunk forwarded to Gemini`);
          }
          break;

        case "stop":
          console.log(`[GeminiLive] Plivo stop event for call ${callId}`);
          void endCall("completed");
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("[GeminiLive] message parse error:", (err as Error).message);
    }
  });

  ws.on("close", () => { void endCall("disconnected"); });
  ws.on("error", (err) => {
    console.error("[GeminiLive] WebSocket error:", err.message);
    void endCall("error");
  });
}

async function finalizeCallRecord(callId: string, reason: string, agent: AgentConfig): Promise<void> {
  try {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        turns: { orderBy: { sequence: "asc" } },
        student: true
      }
    });

    if (!call) return;

    // Don't overwrite a terminal status set by the webhook handler
    const alreadyTerminal = ["completed", "failed", "no-answer", "busy"].includes(call.status);

    const statusMap: Record<string, string> = {
      completed: "completed",
      timeout: "completed",
      "silence-timeout": "no-answer",
      disconnected: "completed",
      error: "failed"
    };
    const finalStatus = statusMap[reason] ?? "completed";

    const endedAt = new Date();
    const durationSeconds = Math.floor((endedAt.getTime() - call.startedAt.getTime()) / 1000);

    const transcriptText = call.turns
      .map((t) => `${t.speaker === "assistant" ? "Agent" : "Candidate"}: ${t.text}`)
      .join("\n");

    let summaryText: string | null = null;
    let extractedDataJson: Record<string, unknown> | null = null;

    if (transcriptText.trim()) {
      if (agent.summarizationEnabled) {
        summaryText = await analyticsService.buildSummary(transcriptText, agent.name);
      }
      if (agent.extractionEnabled && agent.extractionPrompt) {
        extractedDataJson = await analyticsService.extractData(transcriptText, agent.extractionPrompt);
      }
    }

    await prisma.call.update({
      where: { id: callId },
      data: {
        status: alreadyTerminal ? call.status : finalStatus,
        endedAt,
        durationSeconds,
        transcriptText: transcriptText || null,
        ...(summaryText ? { summaryText } : {}),
        ...(extractedDataJson
          ? { extractedDataJson: extractedDataJson as Parameters<typeof prisma.call.update>[0]["data"]["extractedDataJson"] }
          : {})
      }
    });

    // Update student status
    if (call.studentId) {
      await prisma.student.update({
        where: { id: call.studentId },
        data: {
          latestStatus: alreadyTerminal ? call.status : finalStatus,
          lastCalledAt: endedAt
        }
      });
    }
  } catch (err) {
    console.error("[finalizeCallRecord] error:", (err as Error).message);
  }
}
