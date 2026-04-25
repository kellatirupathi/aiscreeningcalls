import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { CallSessionStore } from "./CallSessionStore.js";
import { welcomeAudioCache } from "./WelcomeAudioCache.js";
import { DeepgramService } from "../services/stt/DeepgramService.js";
import { CartesiaSttService } from "../services/stt/CartesiaSttService.js";
import { OpenAIService } from "../services/llm/OpenAIService.js";
import { GroqService } from "../services/llm/GroqService.js";
import { GeminiService } from "../services/llm/GeminiService.js";
import { ElevenLabsService } from "../services/tts/ElevenLabsService.js";
import { CartesiaTtsService } from "../services/tts/CartesiaTtsService.js";
import { SarvamTtsService } from "../services/tts/SarvamTtsService.js";
import { GeminiLiveService } from "../services/gemini/GeminiLiveService.js";
import { AnalyticsService } from "../services/analytics/AnalyticsService.js";
import { S3StorageService } from "../services/storage/S3StorageService.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import type { ConversationMessage } from "../services/llm/OpenAIService.js";
import {
  resolveLlmCredential,
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
const groqService = new GroqService();
const geminiLlmService = new GeminiService();
const elevenLabsService = new ElevenLabsService();
const cartesiaTtsService = new CartesiaTtsService();
const sarvamTtsService = new SarvamTtsService();
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
  language: string;                  // "English" | "Hindi" etc.
  conversationEngine: string;
  geminiModel: string;
  geminiVoice: string;
  systemPrompt: string;
  welcomeMessage: string;
  finalMessage: string | null;
  llmProvider: string;
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
  ttsSampleRate: number;
  keywords: string | null;
  hangupOnSilence: boolean;
  hangupOnSilenceSeconds: number;
  callTimeoutSeconds: number;
  summarizationEnabled: boolean;
  extractionEnabled: boolean;
  extractionPrompt: string | null;
  preciseTranscript: boolean;
  interruptAfterWords: number;
  responseRate: string;
  endpointingMs: number;
  linearDelayMs: number;
  userOnlineDetection: boolean;
}

// Resolved API credentials for a call session — loaded from DB or env fallback
interface ResolvedCredentials {
  llm: ResolvedCredential;      // OpenAI, Groq, or Gemini based on agent.llmProvider
  llmProvider: "openai" | "groq" | "gemini";
  stt: ResolvedCredential;
  tts: ResolvedCredential;
  gemini: ResolvedCredential;
}

async function resolveCredentialsForAgent(agent: AgentConfig): Promise<ResolvedCredentials> {
  const llmProvider: "openai" | "groq" | "gemini" =
    agent.llmProvider === "groq"
      ? "groq"
      : agent.llmProvider === "gemini"
        ? "gemini"
        : "openai";
  const [llm, stt, tts, gemini] = await Promise.all([
    resolveLlmCredential(agent.organizationId, llmProvider, agent.llmCredentialId),
    resolveSttCredential(agent.organizationId, agent.sttProvider, agent.sttCredentialId),
    resolveTtsCredential(agent.organizationId, agent.ttsProvider, agent.ttsCredentialId),
    resolveGeminiCredential(agent.organizationId, agent.geminiCredentialId)
  ]);
  return { llm, llmProvider, stt, tts, gemini };
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
  console.log(`[MediaBridge] Session started for call ${callId}, agent: ${agent.name}, engine: ${agent.conversationEngine}, llmProvider: ${creds.llmProvider} — credentials: llm=${creds.llm.source} stt=${creds.stt.source} tts=${creds.tts.source}`);

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
  // queuedUtterance was deleted — late STT fragments while LLM is busy now
  // trigger a real-time barge-in (abort current LLM+TTS, merge into pending)
  // instead of being silently stored and processed minutes later as a phantom
  // "new turn" (the "inherited." → "Could you explain that a bit more?" bug).
  let carryOverUtterance = ""; // fragments captured while agent was speaking — merged after
  let carryOverUpdatedAt = 0;  // timestamp of last carry-over update (for staleness check)
  let shouldYieldOnCandidateSpeech = false; // true when agent started speaking over a pending candidate continuation
  let currentSpeechTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveCurrentSpeech: (() => void) | null = null;
  type ResponseControl = { aborted: boolean; abortController: AbortController };
  let currentResponseControl: ResponseControl | null = null;
  let isTerminating = false;   // set when closing phrase fires — ignores all further user input
  let consecutiveSkips = 0;    // counts consecutive "I don't know" / skip answers
  let silencePromptStage = 0;  // 0=none, 1="Are you there?", 2="Shall we skip?"
  let extendedSilence = false; // true when candidate said "hold on" — extends silence to 120s
  type InterviewPhase = "availability" | "introduction" | "readiness" | "technical";
  let interviewPhase: InterviewPhase = agent.welcomeMessage.trim() ? "availability" : "technical";
  const synthesizedSpeechCache = new Map<string, Promise<Buffer | null>>();
  const configuredQuestions = extractTechnicalQuestions(agent.systemPrompt);
  let technicalQuestionIndex = 0;
  let lastAskedTechnicalQuestion = "";
  const CARRY_OVER_MAX_AGE_MS = 1500;
  const DUPLICATE_STT_WINDOW_MS = 900;
  const ECHO_GUARD_WINDOW_MS = 1600;
  const PLAYBACK_TAIL_MS = 160;
  const FAST_RESPONSE_TARGET_MS = 1000;
  let lastTranscriptFragmentNormalized = "";
  let lastTranscriptFragmentAt = 0;
  const recentAgentSpeech: Array<{ normalized: string; at: number }> = [];

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
      } else if (agent.ttsProvider === "sarvam" && creds.tts.apiKey) {
        const voiceId = agent.ttsVoiceId ?? creds.tts.defaultVoiceId ?? "";
        if (voiceId) {
          cachedWelcomeAudio = await sarvamTtsService.synthesize(agent.welcomeMessage, {
            apiKey: creds.tts.apiKey,
            modelId: agent.ttsModel,
            voiceId,
            speedRate: agent.ttsSpeedRate,
            sampleRate: agent.ttsSampleRate,
            language: sarvamLangCode(agent.language)
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

  // Map the agent's language setting (stored as "English"/"Hindi" strings)
  // to Sarvam's BCP-47 target_language_code. Defaults to English for safety.
  function sarvamLangCode(lang: string): string {
    switch (lang?.toLowerCase()) {
      case "hindi":    return "hi-IN";
      case "tamil":    return "ta-IN";
      case "telugu":   return "te-IN";
      case "kannada":  return "kn-IN";
      case "malayalam":return "ml-IN";
      case "marathi":  return "mr-IN";
      case "gujarati": return "gu-IN";
      case "bengali":  return "bn-IN";
      case "punjabi":  return "pa-IN";
      case "odia":     return "od-IN";
      default:         return "en-IN";
    }
  }

  function extractTechnicalQuestions(prompt: string): string[] {
    const questions: string[] = [];
    let inQuestionsSection = false;
    for (const rawLine of prompt.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^questions\b/i.test(line)) {
        inQuestionsSection = true;
        continue;
      }
      if (!inQuestionsSection) continue;
      const match = line.match(/^\d+\.\s+(.+?)\s*$/);
      if (match) {
        questions.push(match[1]!);
        continue;
      }
      if (questions.length > 0 && /^[A-Z][A-Z\s]+:?$/.test(line)) {
        break;
      }
    }
    return questions;
  }

  const INTRO_FILLER_WORDS = new Set([
    "okay","ok","k","yeah","yea","ya","yes","yep","yup","hmm","hm","mhm","mm",
    "uh","uhh","um","umm","so","right","sure","well","like","hi","hello","hey",
    "ah","oh","alright","cool","fine"
  ]);

  function countIntroContentWords(text: string): number {
    return text
      .toLowerCase()
      .replace(/[.,!?;:'"()\-]+/g, " ")
      .split(/\s+/)
      .filter((w) => w && !INTRO_FILLER_WORDS.has(w))
      .length;
  }

  // Structured state summary + directive — placed as the LAST system message
  // before the LLM call. Small models (Groq 8B llama-3.1) follow concise,
  // explicit turn instructions much better than prose hints buried in the
  // main prompt. The "override" line is load-bearing: it tells the LLM to
  // prefer these instructions over any scripted lines in the main prompt.
  function buildTurnInstruction(hints: string[]): string {
    const stateLines = [
      `- phase: ${interviewPhase}`,
      `- technical questions asked: ${technicalQuestionIndex}/${configuredQuestions.length || "?"}`,
    ];
    if (lastAskedTechnicalQuestion) {
      stateLines.push(`- last asked question: "${lastAskedTechnicalQuestion}"`);
    }
    if (consecutiveSkips > 0) {
      stateLines.push(`- consecutive skips: ${consecutiveSkips}`);
    }
    const actionBlock = hints.length === 1
      ? hints[0]
      : hints.map((h, i) => `${i + 1}. ${h}`).join("\n");
    return [
      "[TURN INSTRUCTION — override any scripted lines in the main prompt for this turn]",
      "",
      "State:",
      ...stateLines,
      "",
      "Do this now:",
      actionBlock,
      "",
      "Keep your reply to one or two short, natural sentences. Do not quote the main prompt's script verbatim — phrase it naturally."
    ].join("\n");
  }

  // Phrases that indicate candidate wants a moment — extend silence timer
  const HOLD_PHRASES = new Set([
    "hold on", "one moment", "one second", "give me a minute",
    "give me a moment", "give me a sec", "just a moment", "just a second",
    "just a sec", "wait", "wait a moment", "let me think",
    "let me check", "one minute"
  ]);

  function isHoldPhrase(text: string): boolean {
    const lower = text.toLowerCase().replace(/[.,!?]+/g, "").trim();
    if (lower.includes("call me")) return false;
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

  /** Synthesize text to audio via REST API. Returns full audio buffer. */
  async function synthesize(text: string): Promise<Buffer | null> {
    try {
      if (!creds.tts.apiKey) return null;
      const voiceId = agent.ttsVoiceId ?? creds.tts.defaultVoiceId ?? "";
      if (!voiceId) return null;

      if (agent.ttsProvider === "cartesia") {
        return await cartesiaTtsService.synthesize(text, {
          apiKey: creds.tts.apiKey,
          modelId: agent.ttsModel,
          voiceId,
          speedRate: agent.ttsSpeedRate
        });
      }
      if (agent.ttsProvider === "sarvam") {
        return await sarvamTtsService.synthesize(text, {
          apiKey: creds.tts.apiKey,
          modelId: agent.ttsModel,
          voiceId,
          speedRate: agent.ttsSpeedRate,
          sampleRate: agent.ttsSampleRate,
          language: sarvamLangCode(agent.language)
        });
      }
      // Default: ElevenLabs
      return await elevenLabsService.synthesize(text, {
        voiceId,
        modelId: agent.ttsModel,
        apiKey: creds.tts.apiKey,
        stability: agent.ttsStability,
        similarityBoost: agent.ttsSimilarityBoost,
        styleExaggeration: agent.ttsStyleExaggeration,
        speedRate: agent.ttsSpeedRate
      });
    } catch (err) {
      console.error("[MediaBridge] TTS synthesis error:", (err as Error).message);
      return null;
    }
  }

  /** Play audio and wait for estimated playback to complete or an interruption. */
  async function speakAudio(audioBuffer: Buffer): Promise<"completed" | "interrupted"> {
    isSpeaking = true;
    speechStartedAt = Date.now();
    shouldYieldOnCandidateSpeech = false;
    if (utteranceTimer) clearTimeout(utteranceTimer);

    // Wipe stale pending from previous turn (cross-turn leakage fix)
    if (pendingUtterance.trim()) {
      shouldYieldOnCandidateSpeech = true;
      carryOverUtterance = carryOverUtterance
        ? `${carryOverUtterance} ${pendingUtterance}`
        : pendingUtterance;
      carryOverUpdatedAt = Date.now();
      console.log(`[MediaBridge] Moving pending to carry-over on speech start: "${pendingUtterance}"`);
      pendingUtterance = "";
    }

    await playAudio(audioBuffer);

    const playbackMs = Math.ceil((audioBuffer.length / 8000) * 1000) + PLAYBACK_TAIL_MS;
    console.log(`[MediaBridge] Speaking for ~${playbackMs}ms (${audioBuffer.length} bytes)`);

    return await new Promise<"completed" | "interrupted">((resolve) => {
      let finished = false;
      const finish = (reason: "completed" | "interrupted") => {
        if (finished) return;
        finished = true;
        if (currentSpeechTimer) {
          clearTimeout(currentSpeechTimer);
          currentSpeechTimer = null;
        }
        resolveCurrentSpeech = null;
        isSpeaking = false;
        shouldYieldOnCandidateSpeech = false;
        console.log(
          reason === "interrupted"
            ? `[MediaBridge] Speech interrupted, listening immediately`
            : `[MediaBridge] Done speaking, now listening`
        );

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

        resolve(reason);
      };

      resolveCurrentSpeech = () => finish("interrupted");
      currentSpeechTimer = setTimeout(() => {
        finish("completed");
      }, playbackMs);
    });
  }

  /** High-level: synthesize + play + save turn (non-blocking DB) */
  async function speakText(text: string): Promise<void> {
    if (!text.trim() || isClosed) return;
    console.log(`[MediaBridge] TTS: "${text.slice(0, 80)}..." via ${agent.ttsProvider}`);

    const audioBuffer = await getCachedSpeechAudio(text);
    if (!audioBuffer) return;

    syncConfiguredQuestionState(text);
    updatePhaseFromAssistantText(text);
    rememberAgentSpeech(text);
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
      rememberAgentSpeech(text);
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

  // Natural gap removed — LLM + TTS processing latency (~500ms) already
  // creates a natural pause. Adding more just makes the agent feel slow.

  // ─── Streaming conversation turn ────────────────────────────────────────────
  // Uses LLM streaming: each sentence is synthesized & played as it arrives.
  // Sentences are queued and played SEQUENTIALLY (not concurrently).
  // The candidate hears the first sentence in ~500ms instead of waiting 3-5s.
  async function processUserUtterance(transcript: string): Promise<void> {
    if (!transcript.trim() || isClosed || isTerminating) return;

    // BARGE-IN MERGE: if LLM is already running, the candidate kept talking
    // after we mistakenly took the floor. Abort the in-flight response, push
    // the late text into pendingUtterance, and let the post-abort flush
    // re-trigger processing with the FULL combined answer. No queuing,
    // no stale fragments, no phantom "Could you explain that a bit more?".
    if (isProcessing) {
      console.log(`[MediaBridge] Late utterance during LLM — aborting + merging: "${transcript}"`);
      pendingUtterance = pendingUtterance ? `${pendingUtterance} ${transcript}` : transcript;
      if (currentResponseControl) {
        currentResponseControl.aborted = true;
        currentResponseControl.abortController.abort();
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: "clearAudio", streamId: streamSid }));
      }
      if (resolveCurrentSpeech) {
        resolveCurrentSpeech();
      } else {
        isSpeaking = false;
      }
      return;
    }

    isProcessing = true;

    // Pause silence timer while agent is processing + speaking
    // (otherwise silence timer fires during LLM/TTS and kills the call)
    if (silenceTimer) clearTimeout(silenceTimer);

    // Mark when the candidate stopped speaking — used to enforce natural gap
    const utteranceReceivedAt = Date.now();
    let responseControl: ResponseControl | null = null;

    try {
      const normalizedTranscript = normalizeTranscriptText(transcript);
      if (interviewPhase === "technical") {
        const isSkipAnswer = isSkipRequestNormalized(normalizedTranscript);
        if (!isSkipAnswer && transcript.trim().split(/\s+/).length >= 5) {
          consecutiveSkips = 0;
        }
      }

      // Non-blocking DB write for user turn
      sequenceNumber++;
      prisma.callTurn.create({
        data: { callId, speaker: "user", sequence: sequenceNumber, text: transcript }
      }).catch((err) => console.error("[MediaBridge] DB write error:", (err as Error).message));
      sessionStore.append(callId, `Candidate: ${transcript}`);
      conversationHistory.push({ role: "user", content: transcript });

      const deterministicAction = getDeterministicReplyAction(transcript);
      let endAfterLLMReply = false;
      let deterministicLlmHint: string | null = null;

      if (deterministicAction) {
        console.log(
          `[MediaBridge] Deterministic action: ${
            deterministicAction.reply
              ? `(canned) "${deterministicAction.reply}"`
              : `(llm-driven) ${deterministicAction.llmHint ?? ""}`
          }`
        );
        if (deterministicAction.markCallback) {
          prisma.call.update({
            where: { id: callId },
            data: {
              subStatus: "callback-requested",
              extractedDataJson: { callbackNote: transcript, detectedAt: new Date().toISOString() }
            }
          }).catch((err) => console.error("[MediaBridge] Callback note save error:", (err as Error).message));
        }

        // Fast path: canned reply (e.g., exact-wording repeat of a technical question).
        if (deterministicAction.reply) {
          await speakText(deterministicAction.reply);
          if (deterministicAction.endAfterReply) {
            await endCall("completed");
          } else {
            resetSilenceTimer();
          }
          return;
        }

        // LLM path: carry the hint and the end-after flag into the main handler below.
        deterministicLlmHint = deterministicAction.llmHint ?? null;
        endAfterLLMReply = !!deterministicAction.endAfterReply;
      }

      const phaseDirective = getInterviewPhaseDirective(transcript);
      if (phaseDirective) {
        console.log(
          `[MediaBridge] Interview phase -> ${interviewPhase}: ` +
          `${phaseDirective.reply ?? phaseDirective.llmHint ?? ""}`
        );
      }

      if (phaseDirective?.reply) {
        await speakText(phaseDirective.reply);
        resetSilenceTimer();
        return;
      }

      // Note: the hardcoded "Do you know the answer, or should we move to the
      // next question?" clarifier used to fire here on any 1-2 word filler
      // response to a question. It was too aggressive — candidates often say
      // "Okay" as a thinking pause before the real answer, and we were cutting
      // them off. Clarifier logic is now owned entirely by the LLM prompt
      // (which can apply it contextually), and the debounce in
      // getSmartDebounceMs / getVadContinuationGraceMs waits up to 3.5s for
      // the candidate's real answer to follow a filler before committing.

      if (!creds.llm.apiKey) {
        await speakText("I'm sorry, I'm unable to process your response right now.");
        return;
      }

      // Start synthesis as soon as each sentence arrives. Playback remains
      // sequential, but TTS work for sentence N+1 can run while sentence N
      // is still being played.
      let playbackChain = Promise.resolve();
      let closingDetected = false;
      let firstSentencePlayed = false;
      const activeResponseControl: ResponseControl = {
        aborted: false,
        abortController: new AbortController()
      };
      responseControl = activeResponseControl;
      const spokenSentences: string[] = [];
      let bufferedAssistantSentence = "";
      currentResponseControl = activeResponseControl;

      // Collect every hint the code wants to inject for THIS turn and feed
      // them as a single authoritative system message at the END of the
      // history. Placing it last makes small models (Groq 8B) far more
      // likely to follow it over the main system prompt's scripted lines.
      const turnHints: string[] = [];
      if (deterministicLlmHint) turnHints.push(deterministicLlmHint);
      if (phaseDirective?.llmHint) turnHints.push(phaseDirective.llmHint);

      const llmHistory = turnHints.length > 0
        ? [
            ...conversationHistory,
            {
              role: "system" as const,
              content: buildTurnInstruction(turnHints)
            }
          ]
        : conversationHistory;

      const queueAssistantSentence = (rawSentence: string) => {
        const sentence = sanitizeAssistantSentence(rawSentence);
        if (!sentence || isClosed || closingDetected || activeResponseControl.aborted) return;

        console.log(`[MediaBridge] LLM sentence: "${sentence}"`);
        const audioPromise = getCachedSpeechAudio(sentence);

        if (isClosingPhrase(sentence)) {
          closingDetected = true;
          isTerminating = true;
          carryOverUtterance = "";
          carryOverUpdatedAt = 0;
          pendingUtterance = "";
          if (utteranceTimer) clearTimeout(utteranceTimer);
        }

        playbackChain = playbackChain.then(async () => {
          if (isClosed || activeResponseControl.aborted) return;
          const audio = await audioPromise;
          if (!audio || isClosed || activeResponseControl.aborted) return;
          rememberAgentSpeech(sentence);

          if (!firstSentencePlayed) {
            firstSentencePlayed = true;
            const responseLatencyMs = Date.now() - utteranceReceivedAt;
            console.log(
              `[MediaBridge] First audio started in ${responseLatencyMs}ms` +
              (responseLatencyMs <= FAST_RESPONSE_TARGET_MS ? " (within target)" : " (over target)")
            );
          }

          const playbackResult = await speakAudio(audio);
          if (playbackResult === "completed" && !activeResponseControl.aborted) {
            spokenSentences.push(sentence);
          }
        }).catch((err) => {
          console.error(`[MediaBridge] Playback chain error for sentence: "${sentence.slice(0, 40)}":`, (err as Error).message);
          isSpeaking = false;
        });
      };

      const llmService =
        creds.llmProvider === "groq"
          ? groqService
          : creds.llmProvider === "gemini"
            ? geminiLlmService
            : openaiService;
      const fullReply = await llmService.streamNextTurn(
        agent.systemPrompt,
        llmHistory,
        agent.llmModel,
        agent.llmTemperature,
        agent.llmMaxTokens,
        (rawSentence, isLast) => {
          if (isClosed || closingDetected || activeResponseControl.aborted) return;

          const sanitized = sanitizeAssistantSentence(rawSentence);
          if (!sanitized) {
            if (isLast && bufferedAssistantSentence) {
              queueAssistantSentence(bufferedAssistantSentence);
              bufferedAssistantSentence = "";
            }
            return;
          }

          let outboundSentence = sanitized;
          if (bufferedAssistantSentence) {
            outboundSentence = `${bufferedAssistantSentence} ${outboundSentence}`.trim();
            bufferedAssistantSentence = "";
          }

          if (isAckOnlySentence(outboundSentence) && !isLast) {
            bufferedAssistantSentence = outboundSentence;
            return;
          }

          const sentence = outboundSentence;
          console.log(`[MediaBridge] LLM sentence: "${sentence}"`);
          const audioPromise = getCachedSpeechAudio(sentence);

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

          // Playback stays ordered, but synthesis already started above.
          playbackChain = playbackChain.then(async () => {
            if (isClosed || activeResponseControl.aborted) return;
            const audio = await audioPromise;
            if (!audio || isClosed || activeResponseControl.aborted) return;
            rememberAgentSpeech(sentence);

            if (!firstSentencePlayed) {
              firstSentencePlayed = true;
              const responseLatencyMs = Date.now() - utteranceReceivedAt;
              console.log(
                `[MediaBridge] First audio started in ${responseLatencyMs}ms` +
                (responseLatencyMs <= FAST_RESPONSE_TARGET_MS ? " (within target)" : " (over target)")
              );
            }

            const playbackResult = await speakAudio(audio);
            if (playbackResult === "completed" && !activeResponseControl.aborted) {
              spokenSentences.push(sentence);
            }
          }).catch((err) => {
            console.error(`[MediaBridge] Playback chain error for sentence: "${sentence.slice(0, 40)}":`, (err as Error).message);
            isSpeaking = false;
          });
        },
        creds.llm.apiKey,
        activeResponseControl.abortController.signal
      );

      // Wait for ALL sentences to finish playing before continuing
      await playbackChain;

      const assistantTurnText = spokenSentences.length > 0
        ? spokenSentences.join(" ").trim()
        : activeResponseControl.aborted
          ? ""
          : sanitizeAssistantSentence(fullReply.trim());

      // Save only what was actually spoken if the candidate interrupted.
      if (assistantTurnText) {
        syncConfiguredQuestionState(assistantTurnText);
        updatePhaseFromAssistantText(assistantTurnText);
        conversationHistory.push({ role: "assistant", content: assistantTurnText });
        sequenceNumber++;
        prisma.callTurn.create({
          data: { callId, speaker: "assistant", sequence: sequenceNumber, text: assistantTurnText }
        }).catch((err) => console.error("[MediaBridge] DB write error:", (err as Error).message));
        sessionStore.append(callId, `Agent: ${assistantTurnText}`);
      }

      // Resume silence timer now that agent is done speaking
      if (!activeResponseControl.aborted) {
        resetSilenceTimer();
      }

      // Handle closing — end call if the LLM explicitly said a closing
      // phrase, OR if a deterministic action flagged the call should end
      // after this reply (callback, stop intent, negative readiness,
      // 4-consecutive-skips fail-out, final-question-reached).
      if (closingDetected || (endAfterLLMReply && !activeResponseControl.aborted)) {
        const reason = closingDetected ? "closing phrase" : "deterministic end-after-reply";
        console.log(`[MediaBridge] ${reason} — ending call in 1500ms`);
        setTimeout(() => { void endCall("completed"); }, 1500);
        return;
      }
    } catch (err) {
      const message = (err as Error).message;
      const isExpectedAbort =
        responseControl?.aborted ||
        message.toLowerCase().includes("abort") ||
        message.toLowerCase().includes("cancel");
      if (!isExpectedAbort) {
        console.error("[MediaBridge] LLM error:", message);
      }
      // Reset isSpeaking in case the error occurred mid-speech —
      // otherwise the agent stays permanently silent.
      isSpeaking = false;
    } finally {
      if (currentResponseControl === responseControl) {
        currentResponseControl = null;
      }
      isProcessing = false;

      // If the candidate barged in (or kept talking) during this turn, the
      // late text was merged into pendingUtterance. Process the FULL combined
      // answer as a single continuation — never as a stale phantom turn.
      // Staleness safety: if pendingUtterance is older than 1.5s, drop it
      // (probably background noise from before barge-in).
      if (pendingUtterance.trim() && !isClosed && !isTerminating) {
        const merged = pendingUtterance.trim();
        pendingUtterance = "";
        console.log(`[MediaBridge] Processing merged barge-in continuation: "${merged}"`);
        await processUserUtterance(merged);
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
    "ready", "i'm ready", "i m ready", "yes start", "start", "go ahead",
    "begin", "begin start", "yeah begin", "yeah begin start", "yeah start",
    "done", "finished", "that's it", "that s it", "thats it",
    "that's all", "that s all", "thats all", "completed", "no more", "nothing",
    // Greetings — candidate is responding, not stalling
    "hello", "hi", "hey", "okay", "ok", "sure", "fine",
    "great", "thanks", "please"
  ]);

  // Filler words — if an utterance is ONLY one of these, we wait briefly
  // for more speech but STILL process them if nothing else comes.
  // Only true non-word fillers belong here — NOT greetings or acknowledgments.
  const FILLER_WORDS = new Set([
    "hmm", "hm", "uh", "um", "er", "so", "if",
    "right", "whatever"
  ]);

  // Grace periods reduced — Deepgram's UtteranceEnd already proves the
  // candidate stopped, so we only need a tiny safety buffer for trailing
  // syllables, not a second silence-detection window.
  const VAD_SHORT_REPLY_GRACE_MS = 80;
  const VAD_CONTINUATION_GRACE_MS = 120;
  const VAD_LONG_ANSWER_GRACE_MS = 180;
  const FILLER_WAIT_MS = 900;

  function normalizeTranscriptText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[.,!?"'`()\[\]{}:;-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function countWords(text: string): number {
    const normalized = normalizeTranscriptText(text);
    return normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
  }

  function getSpeechCacheKey(text: string): string {
    return [
      agent.ttsProvider,
      agent.ttsModel,
      agent.ttsVoiceId ?? creds.tts.defaultVoiceId ?? "",
      String(agent.ttsSpeedRate),
      String(agent.ttsSampleRate),
      text.replace(/\s+/g, " ").trim()
    ].join("|");
  }

  function getCachedSpeechAudio(text: string): Promise<Buffer | null> {
    const collapsed = text.replace(/\s+/g, " ").trim();
    if (!collapsed) return Promise.resolve(null);
    const key = getSpeechCacheKey(collapsed);
    const existing = synthesizedSpeechCache.get(key);
    if (existing) return existing;
    const promise = synthesize(collapsed);
    synthesizedSpeechCache.set(key, promise);
    return promise;
  }

  function prewarmSpeech(texts: string[]): void {
    const seen = new Set<string>();
    for (const text of texts) {
      const collapsed = text.replace(/\s+/g, " ").trim();
      if (!collapsed || seen.has(collapsed)) continue;
      seen.add(collapsed);
      void getCachedSpeechAudio(collapsed);
    }
  }

  const CALLBACK_REQUEST_PHRASES = [
    "call me later",
    "call me back",
    "call me after",
    "call me tomorrow",
    "not a good time",
    "another time",
    "talk later",
    "i am busy",
    "i m busy",
    "im busy"
  ];

  const STOP_REQUEST_PHRASES = [
    "stop",
    "stop the call",
    "end the call",
    "hang up",
    "cancel the call",
    "disconnect"
  ];

  const HELLO_RECOVERY_PHRASES = [
    "hello",
    "hello are you there",
    "are you there",
    "can you hear me"
  ];

  const REPEAT_REQUEST_PHRASES = [
    "what",
    "what was that",
    "say that again",
    "say again",
    "repeat",
    "repeat please",
    "pardon",
    "come again",
    "could you repeat",
    "i did not catch that",
    "i didn't catch that"
  ];

  const SKIP_REQUEST_PHRASES = [
    "i don't know",
    "i dont know",
    "no idea",
    "not sure",
    "can we skip",
    "skip this",
    "skip it",
    "move to next",
    "next question",
    "move to the next question"
  ];

  const AVAILABLE_CONFIRMATIONS = new Set([
    "yes", "yeah", "yep", "sure", "ok", "okay",
    "go ahead", "start", "yes start", "yeah start",
    "begin", "begin start", "yeah begin", "yeah begin start",
    "ready", "i am ready", "i m ready", "continue", "yes continue"
  ]);
  const AVAILABLE_CONFIRMATION_PHRASES = [
    "go ahead",
    "yes start",
    "yeah start",
    "i am ready",
    "i m ready",
    "yes continue"
  ];

  const READY_CONFIRMATIONS = new Set([
    "yes", "yeah", "yep", "sure", "ok", "okay",
    "go ahead", "start", "yes start", "yeah start",
    "begin", "begin start", "yeah begin", "yeah begin start",
    "ready", "i am ready", "i m ready", "continue", "yes continue",
    "okay start", "okay begin", "yes i am ready", "yes i m ready",
    "yeah i am ready", "yeah i m ready", "ok i am ready", "ok i m ready",
    "okay i am ready", "okay i m ready", "ready to begin", "ready to start",
    "let s begin", "lets begin", "let s start", "lets start",
    "we can start", "you can start", "please start", "please begin"
  ]);
  const READY_CONFIRMATION_PHRASES = [
    "go ahead",
    "yes start",
    "yeah start",
    "begin start",
    "yeah begin",
    "yeah begin start",
    "i am ready",
    "i m ready",
    "yes i am ready",
    "yes i m ready",
    "yeah i am ready",
    "yeah i m ready",
    "ok i am ready",
    "ok i m ready",
    "okay i am ready",
    "okay i m ready",
    "ready to begin",
    "ready to start",
    "let s begin",
    "lets begin",
    "let s start",
    "lets start",
    "we can start",
    "you can start",
    "please start",
    "please begin"
  ];

  const READY_NEGATIONS = [
    "not ready",
    "not now",
    "i am not ready",
    "i m not ready",
    "no i am not ready",
    "no i m not ready",
    "one minute",
    "wait a minute",
    "give me a moment",
    "hold on"
  ];

  const INTRODUCTION_MARKERS = [
    "my name is",
    "i am",
    "i'm",
    "i m",
    "working at",
    "i work at",
    "experience in",
    "experienced in",
    "from next",
    "developer",
    "engineer"
  ];

  const ACK_ONLY_SENTENCES = new Set([
    "got it",
    "thanks",
    "thank you",
    "i see",
    "understood",
    "alright",
    "okay",
    "no problem",
    "interesting",
    "good explanation",
    "that makes sense",
    "thanks for sharing"
  ]);

  function normalizedHasPhrase(normalized: string, phrases: readonly string[]): boolean {
    if (!normalized) return false;
    return phrases.some((phrase) =>
      normalized === phrase ||
      normalized.startsWith(`${phrase} `) ||
      normalized.endsWith(` ${phrase}`) ||
      normalized.includes(` ${phrase} `)
    );
  }

  function isCallbackRequestNormalized(normalized: string): boolean {
    if (!normalized) return false;
    return normalizedHasPhrase(normalized, CALLBACK_REQUEST_PHRASES);
  }

  function isStopIntentNormalized(normalized: string): boolean {
    if (!normalized) return false;
    return normalizedHasPhrase(normalized, STOP_REQUEST_PHRASES);
  }

  function isHelloRecoveryNormalized(normalized: string): boolean {
    if (!normalized) return false;
    return normalizedHasPhrase(normalized, HELLO_RECOVERY_PHRASES);
  }

  function isRepeatRequestNormalized(normalized: string): boolean {
    if (!normalized) return false;
    return normalizedHasPhrase(normalized, REPEAT_REQUEST_PHRASES);
  }

  function isSkipRequestNormalized(normalized: string): boolean {
    if (!normalized) return false;
    return normalizedHasPhrase(normalized, SKIP_REQUEST_PHRASES);
  }

  function isNegativeReadinessNormalized(normalized: string): boolean {
    if (!normalized) return false;
    if (normalized === "no") return interviewPhase === "readiness";
    return normalizedHasPhrase(normalized, READY_NEGATIONS);
  }

  function isAvailabilityConfirmationNormalized(normalized: string): boolean {
    if (!normalized) return false;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (AVAILABLE_CONFIRMATIONS.has(normalized)) return true;
    if (wordCount > 4) return false;
    return normalizedHasPhrase(normalized, AVAILABLE_CONFIRMATION_PHRASES);
  }

  function isReadyConfirmationNormalized(normalized: string): boolean {
    if (!normalized) return false;
    if (normalizedHasPhrase(normalized, READY_NEGATIONS)) return false;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (READY_CONFIRMATIONS.has(normalized)) return true;
    if (wordCount > 5) return false;
    return normalizedHasPhrase(normalized, READY_CONFIRMATION_PHRASES);
  }

  function isAvailabilityConfirmation(text: string): boolean {
    return isAvailabilityConfirmationNormalized(normalizeTranscriptText(text));
  }

  function isReadyConfirmation(text: string): boolean {
    return isReadyConfirmationNormalized(normalizeTranscriptText(text));
  }

  function looksLikeIntroduction(text: string): boolean {
    const normalized = normalizeTranscriptText(text);
    if (!normalized) return false;
    if (countWords(text) >= 5) return true;
    return INTRODUCTION_MARKERS.some((marker) => normalized.includes(marker));
  }

  function isAckOnlySentence(text: string): boolean {
    if (text.includes("?")) return false;
    const normalized = normalizeTranscriptText(text);
    if (!normalized) return false;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    return wordCount <= 4 && ACK_ONLY_SENTENCES.has(normalized);
  }

  function sanitizeAssistantSentence(text: string): string {
    const collapsed = text.replace(/\s+/g, " ").trim();
    if (!collapsed) return "";

    if (/do you know the answer.*move to the next question/i.test(collapsed)) {
      if (interviewPhase === "technical") {
        return "Please explain your answer a bit more.";
      }
      if (interviewPhase === "readiness") {
        return "Are you ready to begin the technical screening?";
      }
      return "Could you briefly introduce yourself?";
    }

    return collapsed;
  }

  function looksLikeIntroPhaseContent(text: string): boolean {
    const normalized = normalizeTranscriptText(text);
    const wordCount = countWords(text);
    if (looksLikeIntroduction(text)) return true;
    if (wordCount < 4) return false;
    if (
      isCallbackRequestNormalized(normalized) ||
      isSkipRequestNormalized(normalized) ||
      isStopIntentNormalized(normalized) ||
      isHelloRecoveryNormalized(normalized) ||
      isRepeatRequestNormalized(normalized)
    ) {
      return false;
    }
    return true;
  }

  function extractCallbackWindow(text: string): string | null {
    const normalized = normalizeTranscriptText(text);
    const match = normalized.match(/\bafter\s+(.+?)$/);
    if (match?.[1]) return match[1].trim();
    if (normalized.includes("tomorrow")) return "tomorrow";
    if (normalized.includes("later")) return "later";
    return null;
  }

  function syncConfiguredQuestionState(text: string): void {
    if (configuredQuestions.length === 0) return;
    const normalizedText = normalizeTranscriptText(text);
    if (!normalizedText) return;
    configuredQuestions.forEach((question, index) => {
      const normalizedQuestion = normalizeTranscriptText(question);
      if (!normalizedQuestion) return;
      if (normalizedText.includes(normalizedQuestion)) {
        lastAskedTechnicalQuestion = question;
        technicalQuestionIndex = Math.max(technicalQuestionIndex, index + 1);
      }
    });
  }

  // Phase transitions driven by WHAT THE LLM JUST SAID, not by trying to
  // pattern-match the candidate's reply.
  //
  // Why: candidates speak naturally ("I'm ready to go ahead", "Right now I'm
  // free") and our narrow `isReadyConfirmation` regex won't match. Meanwhile
  // the LLM happily moves the conversation forward based on full context, so
  // if we anchor phase to candidate-side matching the state machine falls out
  // of sync and starts emitting hints that contradict what the LLM is doing
  // ("The candidate is still elaborating on their introduction" while the
  // LLM is actually asking Q7). The LLM's own output is the ground truth.
  //
  // Rule: phase advances monotonically availability → introduction →
  // readiness → technical. Never goes backward.
  function updatePhaseFromAssistantText(text: string): void {
    if (interviewPhase === "technical") return;

    // Strongest signal: LLM asked (or is asking) a configured technical
    // question — syncConfiguredQuestionState already bumped the counter.
    if (technicalQuestionIndex > 0) {
      console.log(`[MediaBridge] Phase auto-advance: ${interviewPhase} → technical (LLM asked Q${technicalQuestionIndex})`);
      interviewPhase = "technical";
      return;
    }

    const lower = text.toLowerCase();

    // LLM just asked "shall we begin?" / "are you ready?" → readiness.
    const asksReadiness =
      /\bshall we (begin|start)\b/.test(lower) ||
      /\b(ready to (begin|start)|let's (begin|start)|are you ready)\b/.test(lower) ||
      /\bbegin the (technical )?(screening|interview|questions)\b/.test(lower);
    if (asksReadiness && interviewPhase !== "readiness") {
      console.log(`[MediaBridge] Phase auto-advance: ${interviewPhase} → readiness (LLM asked to begin)`);
      interviewPhase = "readiness";
      return;
    }

    // LLM just asked for an introduction → introduction.
    const asksIntro =
      /\bintroduce yourself\b/.test(lower) ||
      /\btell me about yourself\b/.test(lower) ||
      /\b(brief|short) introduction\b/.test(lower);
    if (asksIntro && interviewPhase === "availability") {
      console.log(`[MediaBridge] Phase auto-advance: availability → introduction (LLM asked for intro)`);
      interviewPhase = "introduction";
    }
  }

  function getNextConfiguredQuestion(): string | null {
    const nextQuestion = configuredQuestions[technicalQuestionIndex] ?? null;
    if (!nextQuestion) return null;
    technicalQuestionIndex += 1;
    lastAskedTechnicalQuestion = nextQuestion;
    return nextQuestion;
  }

  function repeatConfiguredQuestion(): string | null {
    if (lastAskedTechnicalQuestion) return lastAskedTechnicalQuestion;
    if (technicalQuestionIndex > 0) {
      return configuredQuestions[technicalQuestionIndex - 1] ?? null;
    }
    return configuredQuestions[0] ?? null;
  }

  function getDeterministicReplyAction(
    transcript: string
  ): {
    reply?: string;
    llmHint?: string;
    endAfterReply?: boolean;
    markCallback?: boolean;
  } | null {
    const normalized = normalizeTranscriptText(transcript);
    if (!normalized) return null;

    if (isStopIntentNormalized(normalized)) {
      return {
        llmHint:
          "The candidate has asked to stop the call. In one warm, respectful sentence, " +
          "thank them for their time and wish them well. This is the final message — end naturally.",
        endAfterReply: true
      };
    }

    if (isCallbackRequestNormalized(normalized)) {
      const callbackWindow = extractCallbackWindow(transcript);
      const windowText = callbackWindow
        ? (callbackWindow === "later" || callbackWindow === "tomorrow"
            ? callbackWindow
            : `in ${callbackWindow}`)
        : "at a later time";
      return {
        llmHint:
          `The candidate is asking to be called back ${windowText}. In one short, polite ` +
          `sentence, confirm the callback and thank them. This is the final message.`,
        endAfterReply: true,
        markCallback: true
      };
    }

    if (interviewPhase !== "technical" && isNegativeReadinessNormalized(normalized)) {
      return {
        llmHint:
          "The candidate isn't ready to proceed right now. In one short, warm sentence, " +
          "say you'll call them back and thank them. This is the final message.",
        endAfterReply: true,
        markCallback: true
      };
    }

    // Check repeat BEFORE hello-recovery. A candidate asking
    // "Could you repeat the question?" often also says "hello?" in the same
    // breath — and hello-recovery used to win and lose the real intent.
    if (interviewPhase === "technical" && isRepeatRequestNormalized(normalized)) {
      const question = repeatConfiguredQuestion();
      if (question) {
        // Repeat the question verbatim — the candidate specifically asked to
        // hear the SAME words again. Going through the LLM risks paraphrasing.
        return { reply: question };
      }
    }

    if (isHelloRecoveryNormalized(normalized)) {
      const ctx =
        interviewPhase === "availability"
          ? "You haven't yet asked if this is a good time. Gently ask if it's a good time for a brief screening."
          : interviewPhase === "introduction"
            ? "You've just asked for an introduction. Warmly ask them again to briefly introduce themselves."
            : interviewPhase === "readiness"
              ? "You were about to start the technical questions. Warmly ask if they're ready."
              : "You were in the middle of technical questions. Warmly ask them to continue.";
      return {
        llmHint:
          `The candidate said "hello" or seems a bit lost. In one short, friendly sentence, ` +
          `reconnect with them. Context: ${ctx}`
      };
    }

    if (interviewPhase === "technical") {
      if (isSkipRequestNormalized(normalized)) {
        consecutiveSkips += 1;
        console.log(`[MediaBridge] Skip detected (${consecutiveSkips} consecutive): "${transcript}"`);
        if (consecutiveSkips >= 4) {
          return {
            llmHint:
              "The candidate has skipped four questions in a row. In one short, kind sentence, " +
              "thank them for their time, gently suggest more preparation might help, and " +
              "say goodbye. This is the final message.",
            endAfterReply: true
          };
        }
        const nextQuestion = getNextConfiguredQuestion();
        if (nextQuestion) {
          return {
            llmHint:
              `The candidate wants to skip the current question. Give one brief, supportive ` +
              `acknowledgment (e.g., "No problem.") and then ask the next question exactly as ` +
              `written, with no extra preamble: "${nextQuestion}"`
          };
        }
        const closingText =
          agent.finalMessage?.trim() ||
          "That's all the questions. Thank you for your time. We'll get back to you soon.";
        return {
          llmHint:
            `The candidate skipped and there are no more questions. In one short, warm ` +
            `sentence thank them and close the call. You may paraphrase: "${closingText}"`,
          endAfterReply: true
        };
      }
    }

    return null;
  }

  // Pure — returns a hint based on the CURRENT phase. Never mutates
  // interviewPhase. Phase transitions happen in updatePhaseFromAssistantText
  // AFTER the LLM has replied, driven by what the LLM actually said.
  function getInterviewPhaseDirective(
    transcript: string
  ): { reply?: string; llmHint?: string } | null {
    if (interviewPhase === "technical") return null;

    if (interviewPhase === "availability") {
      // Whether or not the candidate's words match a canned "yes" regex,
      // if they didn't ask to call later (handled earlier by the
      // deterministic path), we proceed to asking for the introduction.
      // The LLM decides tone; our job is to tell it what to do next.
      return {
        llmHint:
          "The candidate has responded to the welcome. In one short, warm sentence, " +
          "ask them to briefly introduce themselves. Do not repeat the welcome message."
      };
    }

    if (interviewPhase === "introduction") {
      const trimmed = transcript.trim();
      if (!trimmed) {
        return {
          llmHint:
            "Ask the candidate, in one short sentence, to briefly introduce themselves."
        };
      }
      const contentWords = countIntroContentWords(trimmed);
      if (contentWords < 4) {
        // Candidate only said a filler like "Okay" / "Yeah" / "So..." — they're
        // about to start their real introduction. The LLM should gently
        // encourage them to continue; phase stays at introduction.
        return {
          llmHint:
            "The candidate started with a filler word (e.g., 'okay', 'so', 'hmm') but hasn't " +
            "actually introduced themselves yet. In one short, warm sentence encourage them " +
            "to go ahead (e.g., 'Sure, please go ahead.'). Do NOT thank them, do NOT move on, " +
            "do NOT ask the next question."
        };
      }
      return {
        llmHint:
          "The candidate has finished (or is finishing) their introduction. Briefly acknowledge " +
          "(e.g., 'Thanks') and then ask, in your own words: " +
          "\"I'll ask a few questions on ReactJS, NodeJS, and SQLite. Shall we begin?\" " +
          "Keep the entire reply to one or two short sentences."
      };
    }

    if (interviewPhase === "readiness") {
      if (configuredQuestions.length > 0) {
        const firstQuestion = configuredQuestions[0];
        return {
          llmHint:
            `The candidate's latest reply suggests they're ready (or continuing) — move the ` +
            `interview forward. Give a very brief acknowledgment (e.g., 'Great.') and then ask ` +
            `the first technical question verbatim, with no extra preamble: "${firstQuestion}"`
        };
      }
      return {
        llmHint:
          "The candidate has responded after we asked about readiness. Move forward naturally: " +
          "give a brief acknowledgment and ask the first technical question from the prompt."
      };
    }

    return null;
  }

  function uniqueWords(text: string): string[] {
    const normalized = normalizeTranscriptText(text);
    if (!normalized) return [];
    return [...new Set(normalized.split(/\s+/).filter(Boolean))];
  }

  function rememberAgentSpeech(text: string): void {
    const normalized = normalizeTranscriptText(text);
    if (!normalized) return;
    recentAgentSpeech.push({ normalized, at: Date.now() });
    while (recentAgentSpeech.length > 0 && Date.now() - recentAgentSpeech[0]!.at > 10_000) {
      recentAgentSpeech.shift();
    }
  }

  function isLikelyAgentEcho(text: string): boolean {
    const candidateWords = uniqueWords(text);
    if (candidateWords.length === 0) return false;

    const now = Date.now();
    while (recentAgentSpeech.length > 0 && now - recentAgentSpeech[0]!.at > 10_000) {
      recentAgentSpeech.shift();
    }

    return recentAgentSpeech.some((segment) => {
      if (now - segment.at > ECHO_GUARD_WINDOW_MS) return false;

      const segmentWordSet = new Set(segment.normalized.split(/\s+/).filter(Boolean));
      let common = 0;
      for (const word of candidateWords) {
        if (segmentWordSet.has(word)) common += 1;
      }

      if (candidateWords.length <= 2) {
        return common === candidateWords.length;
      }

      return common >= 2 && common / candidateWords.length >= 0.75;
    });
  }

  function isFillerOnly(text: string): boolean {
    const normalized = normalizeTranscriptText(text);
    return countWords(normalized) === 1 && FILLER_WORDS.has(normalized);
  }

  // Pure filler/greeting tokens that are NOT valid answers to an interview question.
  // When candidate responds to a question with only these, we treat it as a
  // non-answer (trigger real-interviewer clarifier).
  const NON_ANSWER_WORDS = new Set([
    "hmm", "hm", "uh", "um", "er", "oh", "ah", "mm",
    "hello", "hi", "hey",
    "okay", "ok", "alright",
    "sure", "fine", "great", "thanks", "please",
    "right", "so"
  ]);

  function isShortReply(text: string): boolean {
    const normalized = normalizeTranscriptText(text);
    const wordCount = normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
    if (!normalized || wordCount > 4) return false;
    return (
      SHORT_REPLIES.has(normalized) ||
      isAvailabilityConfirmationNormalized(normalized) ||
      isReadyConfirmationNormalized(normalized)
    );
  }

  const INCOMPLETE_ENDING_WORDS = new Set([
    "a", "an", "the", "and", "or", "but", "so",
    "to", "for", "of", "in", "on", "at", "with", "from", "by",
    "is", "are", "was", "were", "be", "been", "being",
    "this", "that", "these", "those", "it", "its", "their", "there",
    "using", "use", "used", "build", "create", "make"
  ]);

  function looksLikeIncompleteThought(text: string): boolean {
    const collapsed = text.trim();
    if (!collapsed) return false;
    if (/[,:;/-]\s*$/.test(collapsed)) return true;

    const normalized = normalizeTranscriptText(collapsed);
    if (!normalized) return false;

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length < 3) return false;

    const lastWord = words[words.length - 1] ?? "";
    return INCOMPLETE_ENDING_WORDS.has(lastWord);
  }

  function isSubstantiveCandidateSpeech(text: string): boolean {
    const normalized = normalizeTranscriptText(text);
    const wordCount = normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;
    if (!normalized) return false;
    if (wordCount === 1 && FILLER_WORDS.has(normalized)) return false;
    return wordCount >= 2 || !SHORT_REPLIES.has(normalized);
  }

  function getPatientVadGraceMs(text: string): number {
    const wordCount = countWords(text);

    if (interviewPhase === "availability") return 220;
    if (interviewPhase === "introduction") {
      return looksLikeIntroduction(text) || wordCount >= 5 ? 2200 : 1400;
    }
    if (interviewPhase === "readiness") {
      return isReadyConfirmation(text) ? VAD_SHORT_REPLY_GRACE_MS : 1800;
    }
    if (looksLikeIncompleteThought(text)) return 2200;
    if (wordCount >= 10) return 1400;
    if (wordCount >= 5) return 1000;
    if (wordCount >= 3) return 700;
    return VAD_CONTINUATION_GRACE_MS;
  }

  // After the agent asks a question, candidates fall into two groups:
  //
  //   (A) Complete affirmatives — "Yes", "No", "Yeah", "Sure", "Done",
  //       "Correct", "Ready". These are SELF-CONTAINED answers. Process
  //       immediately — the candidate is done talking.
  //
  //   (B) Ambiguous thinking fillers — "Okay", "Hmm", "Um", "Uh", "Er".
  //       Could be a complete acknowledgment OR a stall before the real
  //       answer ("Okay… so props are..."). Wait ~2s to see if the real
  //       content follows; if nothing comes, process the filler alone.
  //
  // Everything else (technical content) gets normal grace.
  const AMBIGUOUS_FILLER_WAIT_MS = 2000;
  const INTERRUPT_COMMAND_WORDS = new Set([
    "wait", "stop", "sorry", "no", "hold", "hello", "listen"
  ]);

  // Only these words trigger the "wait for continuation" path. "Yes"/"No"/etc.
  // are NOT in this set — they're complete answers that need fast processing.
  const AMBIGUOUS_FILLERS = new Set([
    "okay", "ok", "hmm", "hm", "uh", "um", "er", "oh", "ah", "mm",
    "alright", "so"
  ]);

  function lastAgentAskedQuestion(): boolean {
    const lastAgentTurn = [...conversationHistory].reverse().find((m) => m.role === "assistant");
    return lastAgentTurn?.content.trim().endsWith("?") ?? false;
  }

  function isAmbiguousFiller(text: string): boolean {
    const normalized = normalizeTranscriptText(text);
    if (!normalized) return false;
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 2) return false;
    return words.every((w) => AMBIGUOUS_FILLERS.has(w));
  }

  function getVadContinuationGraceMs(text: string): number {
    // Ambiguous thinking fillers right after a question — wait for possible
    // continuation. Affirmatives like "Yes"/"No" fall through to fast path.
    if (isAmbiguousFiller(text) && lastAgentAskedQuestion()) {
      return Math.max(AMBIGUOUS_FILLER_WAIT_MS, interviewPhase === "technical" ? 2400 : 2800);
    }
    if (looksLikeIncompleteThought(text)) {
      return Math.max(getPatientVadGraceMs(text), 2200);
    }
    if (isShortReply(text)) return VAD_SHORT_REPLY_GRACE_MS;
    return Math.max(getPatientVadGraceMs(text), VAD_LONG_ANSWER_GRACE_MS);
  }

  // Whether we use Deepgram's UtteranceEnd VAD (fast) or fixed debounce (slow)
  const useVadEndpointing = agent.sttProvider !== "cartesia";

  function getSmartDebounceMs(text: string): number {
    const normalized = normalizeTranscriptText(text);
    const wordCount = normalized ? normalized.split(/\s+/).filter(Boolean).length : 0;

    // Same filler-after-question logic applies to the fallback debounce path.
    if (isAmbiguousFiller(text) && lastAgentAskedQuestion()) {
      return AMBIGUOUS_FILLER_WAIT_MS;
    }

    // When using Deepgram VAD: UtteranceEnd fires in ~500-800ms automatically.
    // We only need a SHORT safety debounce as a backup in case UtteranceEnd
    // doesn't fire (rare). The real turn detection comes from handleUtteranceEnd().
    if (useVadEndpointing) {
      if (SHORT_REPLIES.has(normalized)) return 140;
      if (wordCount === 1 && FILLER_WORDS.has(normalized)) return FILLER_WAIT_MS;
      if (interviewPhase === "introduction") return 2200;
      if (interviewPhase === "readiness") return isReadyConfirmation(text) ? 140 : 1600;

      // TECHNICAL PHASE — candidates pause 2-3s between sentences while they
      // think mid-answer. If we fire LLM too early, the candidate's next
      // sentence triggers a late-utterance abort-merge-refire cycle (we saw
      // 3-4 LLM calls for one answer in production logs). Waiting longer
      // here lets chunks merge into a single turn. VAD's utterance_end
      // (1000ms) will still fire immediately if the candidate has truly
      // stopped, so long debounces here don't hurt short-answer latency.
      if (interviewPhase === "technical") {
        if (looksLikeIncompleteThought(text)) return 3000;
        if (wordCount >= 10) return 2600;
        if (wordCount >= 5) return 2200;
        return 1600;
      }

      if (looksLikeIncompleteThought(text)) return 2000;
      if (wordCount >= 10) return 1500;
      if (wordCount >= 5) return 1100;
      return 800;
    }

    // Cartesia fallback: no VAD signal, must use fixed debounce
    if (SHORT_REPLIES.has(normalized)) return 900;
    if (wordCount === 1 && FILLER_WORDS.has(normalized)) return 3200;
    if (interviewPhase === "introduction") return 4200;
    if (interviewPhase === "readiness") return isReadyConfirmation(text) ? 900 : 2800;
    if (looksLikeIncompleteThought(text)) return 3200;
    if (wordCount >= 10) return 3400;
    if (wordCount >= 5) return 2600;
    if (wordCount === 1) return 1800;
    return 2200;
  }

  /**
   * Called by Deepgram's UtteranceEnd event — the speaker truly stopped.
   * This fires ~500-800ms after the last word, much faster than our debounce.
   * When this fires, immediately process whatever we've accumulated.
   */
  function handleUtteranceEnd(): void {
    if (isClosed || isTerminating || isSpeaking || isProcessing) return;
    if (!pendingUtterance.trim()) return;

    // Cancel the safety debounce — VAD says "done" before it fires
    if (utteranceTimer) clearTimeout(utteranceTimer);

    const text = pendingUtterance.trim();

    // If the utterance is ONLY a true filler (hmm, uh, um, etc.),
    // wait briefly for more speech — but ALWAYS process it if nothing else comes.
    // Never silently drop what the candidate said.
    const trimmed = normalizeTranscriptText(text);
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount === 1 && FILLER_WORDS.has(trimmed)) {
      console.log(`[MediaBridge] UtteranceEnd on filler "${text}" — waiting briefly for more speech`);
      utteranceTimer = setTimeout(() => {
        if (!pendingUtterance.trim()) return;
        const full = pendingUtterance;
        pendingUtterance = "";
        console.log(`[MediaBridge] Full utterance (filler, no continuation): "${full}"`);
        void processUserUtterance(full);
      }, FILLER_WAIT_MS);
      return;
    }

    const graceMs = getVadContinuationGraceMs(text);
    utteranceTimer = setTimeout(() => {
      if (!pendingUtterance.trim()) return;
      const full = pendingUtterance;
      pendingUtterance = "";
      console.log(`[MediaBridge] Full utterance (VAD + ${graceMs}ms grace): "${full}"`);
      void processUserUtterance(full);
    }, graceMs);
  }

  function interruptCurrentAgentResponse(reason: string, text: string): void {
    if (currentResponseControl) {
      currentResponseControl.aborted = true;
      currentResponseControl.abortController.abort();
    }
    console.log(`[MediaBridge] ${reason}: "${text}"`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: "clearAudio", streamId: streamSid }));
    }
    if (resolveCurrentSpeech) {
      resolveCurrentSpeech();
    } else {
      isSpeaking = false;
      shouldYieldOnCandidateSpeech = false;
    }
  }

  // Lockout: blocks the first ~300ms of agent speech so the agent's own
  // voice echoing back through the candidate's phone speaker → mic loop
  // doesn't self-trigger an interrupt. On PSTN/mobile calls there is
  // ALWAYS some acoustic echo even with Plivo's built-in echo cancellation;
  // the first few hundred ms of any sentence is when that echo is loudest
  // and most likely to trip VAD. Do NOT lower this without also adding
  // echo cancellation / transcript-vs-agent-text comparison.
  const INTERRUPT_LOCKOUT_MS = 180;

  // ─── Transcript fragment handler with smart endpointing ───────────────────
  function handleTranscriptFragment(
    transcript: string,
    metadata: { isFinal?: boolean; speechFinal?: boolean } = {}
  ) {
    const text = transcript.trim();
    if (!text || isClosed) return;
    const normalizedText = normalizeTranscriptText(text);
    const now = Date.now();

    // Once we've committed to ending the call, ignore all further user input.
    // Prevents the LLM from restarting the intro when the user says "Okay"
    // after the agent has already said goodbye.
    if (isTerminating) {
      console.log(`[MediaBridge] Ignoring fragment during termination: "${text}"`);
      return;
    }

    if (
      normalizedText &&
      normalizedText === lastTranscriptFragmentNormalized &&
      now - lastTranscriptFragmentAt <= DUPLICATE_STT_WINDOW_MS
    ) {
      console.log(`[MediaBridge] Ignoring duplicate STT fragment: "${text}"`);
      return;
    }
    lastTranscriptFragmentNormalized = normalizedText;
    lastTranscriptFragmentAt = now;

    // --- Interruption handling ---
    if (isSpeaking) {
      const elapsedSinceSpeechStart = now - speechStartedAt;
      const wordCount = countWords(text);
      const interruptThreshold = Math.max(0, agent.interruptAfterWords ?? 2);
      const isInterruptCommand =
        wordCount === 1 && INTERRUPT_COMMAND_WORDS.has(normalizedText);

      if (isLikelyAgentEcho(text)) {
        console.log(`[MediaBridge] Ignoring likely agent echo: "${text}"`);
        return;
      }

      // If we started speaking while the candidate still had pending speech,
      // give the floor back immediately when they continue with anything real.
      if (shouldYieldOnCandidateSpeech && isSubstantiveCandidateSpeech(text)) {
        interruptCurrentAgentResponse("Yielding to continuing candidate answer", text);
        if (carryOverUtterance) {
          pendingUtterance = pendingUtterance ? `${pendingUtterance} ${carryOverUtterance}` : carryOverUtterance;
          carryOverUtterance = "";
          carryOverUpdatedAt = 0;
        }
        pendingUtterance = pendingUtterance ? `${pendingUtterance} ${text}` : text;
        const debounceMs = getSmartDebounceMs(pendingUtterance);
        if (utteranceTimer) clearTimeout(utteranceTimer);
        utteranceTimer = setTimeout(() => {
          if (pendingUtterance.trim()) {
            const fullUtterance = pendingUtterance;
            pendingUtterance = "";
            console.log(`[MediaBridge] Full utterance (post-yield continuation): "${fullUtterance}"`);
            void processUserUtterance(fullUtterance);
          }
        }, debounceMs);
        return;
      } else if (elapsedSinceSpeechStart < INTERRUPT_LOCKOUT_MS) {
        carryOverUtterance = carryOverUtterance ? `${carryOverUtterance} ${text}` : text;
        carryOverUpdatedAt = Date.now();
        console.log(`[MediaBridge] Carry-over during lockout (${elapsedSinceSpeechStart}ms): "${text}"`);
        return;
      }

      // Real-phone barge-in — matches a human interviewer's behavior:
      //   ≥2 words                → always barge in
      //   1 substantive word      → barge in ("wait", "stop", "no", "sorry")
      //   1 filler-only word      → carry-over ("um", "hmm", "uh")
      //
      // This lets single-word commands like "wait!" stop the agent instantly,
      // while still absorbing noise fillers that shouldn't take the floor.
      const shouldBarge =
        !isFillerOnly(text) &&
        (isInterruptCommand || wordCount >= Math.max(1, interruptThreshold));
      if (shouldBarge) {
        interruptCurrentAgentResponse(`Candidate interrupted (${wordCount} word${wordCount === 1 ? "" : "s"})`, text);
        // Fall through to accumulate into pendingUtterance below.
      } else {
        // Pure filler during agent speech — carry over, don't take the floor.
        carryOverUtterance = carryOverUtterance ? `${carryOverUtterance} ${text}` : text;
        carryOverUpdatedAt = Date.now();
        console.log(`[MediaBridge] Carry-over during speech (filler-only "${text}")`);
        return;
      }
    }

    // #8: Basic non-English detection
    const hasNonLatin = /[^\u0000-\u007F\u00C0-\u024F]/.test(text);
    if (hasNonLatin && text.length > 10) {
      console.log(`[MediaBridge] Non-English text detected: "${text}"`);
      resetSilenceTimer(); // Fix: was missing — silence timer kept counting during non-English speech
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

    // #11: Detect "hold on" / "give me a minute" → extend silence timer.
    // We intentionally stay SILENT here — interrupting a candidate who asked
    // for a moment with a canned "Sure, take your time." feels robotic. The
    // extended silence window gives them room to think naturally.
    if (isHoldPhrase(text)) {
      console.log(`[MediaBridge] Hold phrase detected: "${text}" — extending silence timer`);
      resetSilenceTimerExtended();
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
    let debounceMs = getSmartDebounceMs(pendingUtterance);
    if (metadata.isFinal && !metadata.speechFinal && isShortReply(pendingUtterance)) {
      debounceMs = Math.min(debounceMs, 140);
    }
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

  prewarmSpeech([
    agent.welcomeMessage,
    agent.finalMessage ?? "",
    "Could you please introduce yourself briefly?",
    "Thanks. Are you ready to begin the technical screening?",
    "Are you ready to begin the technical screening?",
    "Hello! Are you ready to continue?",
    "Hello! Could you please introduce yourself briefly?",
    "Hello! Is this a good time for a brief screening call?",
    "Sure, we'll call you back later. Thank you.",
    "No problem. We'll call you back later. Thank you.",
    "Okay, we'll stop here. Thank you for your time.",
    "It seems you may need more preparation. Thank you for your time.",
    ...configuredQuestions
  ]);

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
            handleTranscriptFragment(transcript, { isFinal: _isFinal, speechFinal });
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
        (transcript, isFinal, speechFinal) => {
          // Process BOTH is_final and speech_final fragments.
          // is_final fires ~500ms FASTER than speech_final (which waits for
          // VAD endpoint detection). By processing is_final we react to the
          // candidate's words the moment Deepgram finalizes a chunk, not
          // after they stop speaking. This cuts barge-in latency roughly
          // in half for mid-utterance interruptions.
          if (isFinal || speechFinal) {
            handleTranscriptFragment(transcript, { isFinal, speechFinal });
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
        Math.max(100, agent.endpointingMs),
        // UtteranceEnd callback — fires when Deepgram's VAD detects speech end
        () => {
          handleUtteranceEnd();
        },
        // SpeechStarted callback — informational only. We used to trigger
        // preemptive barge-in here, but Deepgram's VAD fires on ANY speech
        // energy including the agent's own voice echoing back through the
        // candidate's phone speaker → mic loop. That caused the agent to
        // cut itself off mid-sentence (self-interrupt). Barge-in is now
        // driven exclusively by actual transcripts (is_final / speech_final)
        // which are far harder to confuse with echo than raw VAD events.
        () => {
          if (!isSpeaking || isClosed || isTerminating) return;
          const elapsed = Date.now() - speechStartedAt;
          // Log only — do NOT abort. Transcript path makes the real call.
          if (elapsed >= INTERRUPT_LOCKOUT_MS) {
            console.log(`[MediaBridge] VAD SpeechStarted at +${elapsed}ms (awaiting transcript to confirm)`);
          }
        }
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
