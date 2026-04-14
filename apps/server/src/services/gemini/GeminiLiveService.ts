import WebSocket from "ws";

/**
 * GeminiLiveService — connects to Gemini Multimodal Live API for
 * speech-to-speech conversations. Handles audio format conversion
 * between Plivo's mulaw 8kHz and Gemini's PCM 16kHz/24kHz.
 */

// ── Mulaw decode table (mulaw byte → signed 16-bit PCM) ──────────────────────
const MULAW_DECODE = new Int16Array(256);
(function buildDecodeTable() {
  for (let i = 0; i < 256; i++) {
    let mu = ~i & 0xff;
    const sign = mu & 0x80 ? -1 : 1;
    mu &= 0x7f;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0f;
    let sample = ((mantissa << 1) + 33) << (exponent + 2);
    sample -= 0x84;
    MULAW_DECODE[i] = sign * sample;
  }
})();

// ── Mulaw encode table (13-bit magnitude → mulaw byte) ───────────────────────
const MULAW_ENCODE = new Uint8Array(8192);
(function buildEncodeTable() {
  const BIAS = 0x84;
  const CLIP = 32635;
  for (let i = 0; i < 8192; i++) {
    let sample = Math.min(i, CLIP);
    sample += BIAS;
    let exponent = 7;
    for (let expMask = 0x4000; exponent > 0; exponent--, expMask >>= 1) {
      if (sample & expMask) break;
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    MULAW_ENCODE[i] = ~(((exponent << 4) | mantissa)) & 0xff;
  }
})();

function linearToMulaw(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0;
  const magnitude = Math.min(Math.abs(sample), 32635);
  return MULAW_ENCODE[magnitude] | sign;
}

/** Decode mulaw 8kHz buffer → PCM s16le 16kHz buffer (upsample 2x) */
export function mulawToLinear16k(mulaw: Buffer): Buffer {
  const numSamples = mulaw.length;
  const pcm = Buffer.alloc(numSamples * 2 * 2); // 2x upsample, 2 bytes per sample
  for (let i = 0; i < numSamples; i++) {
    const sample = MULAW_DECODE[mulaw[i]];
    const offset = i * 4;
    pcm.writeInt16LE(sample, offset);
    pcm.writeInt16LE(sample, offset + 2); // duplicate for 8k → 16k
  }
  return pcm;
}

/** Downsample PCM s16le 24kHz → mulaw 8kHz (3:1 ratio) */
export function linear24kToMulaw8k(pcm24k: Buffer): Buffer {
  const sampleCount = pcm24k.length / 2; // 2 bytes per sample
  const outCount = Math.floor(sampleCount / 3); // 24k → 8k = 3:1
  const mulaw = Buffer.alloc(outCount);
  for (let i = 0; i < outCount; i++) {
    const srcIndex = i * 3; // pick every 3rd sample
    const sample = pcm24k.readInt16LE(srcIndex * 2);
    mulaw[i] = linearToMulaw(sample);
  }
  return mulaw;
}

export interface GeminiSessionConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  voice?: string;
}

export interface GeminiCallbacks {
  onAudioChunk: (mulawChunk: Buffer) => void;
  onTranscript: (text: string, role: "user" | "assistant") => void;
  onInterrupted: () => void;
  onError: (err: Error) => void;
  onClose: () => void;
}

export class GeminiLiveService {
  private ws: WebSocket | null = null;
  private isSetupDone = false;

  /**
   * Opens a WebSocket to Gemini Live API and returns the connection.
   * The caller streams Plivo mulaw audio in, and receives mulaw audio out via callbacks.
   */
  connect(config: GeminiSessionConfig, callbacks: GeminiCallbacks): void {
    const url =
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${config.apiKey}`;

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("[GeminiLive] WebSocket connected, sending setup...");
      this.sendSetup(config);
    });

    this.ws.on("message", (data) => {
      try {
        const raw = data.toString();
        const msg = JSON.parse(raw);

        // Log errors from Gemini
        if (msg.error) {
          console.error("[GeminiLive] API error:", JSON.stringify(msg.error));
          callbacks.onError(new Error(msg.error.message ?? JSON.stringify(msg.error)));
          return;
        }

        this.handleServerMessage(msg, callbacks);
      } catch (err) {
        // Log unparseable messages for debugging
        const preview = data.toString().slice(0, 200);
        if (preview.trim()) {
          console.warn("[GeminiLive] Unparseable message:", preview);
        }
      }
    });

    this.ws.on("error", (err) => {
      console.error("[GeminiLive] WebSocket error:", err.message);
      callbacks.onError(err);
    });

    this.ws.on("close", (code, reason) => {
      console.log(`[GeminiLive] WebSocket closed (code: ${code}, reason: ${reason?.toString() || "none"})`);
      callbacks.onClose();
    });
  }

  /** Send the initial BidiGenerateContentSetup message */
  private sendSetup(config: GeminiSessionConfig): void {
    const setup: Record<string, unknown> = {
      setup: {
        model: `models/${config.model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: config.voice || "Kore"
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: config.systemPrompt }]
        }
      }
    };

    this.send(setup);
  }

  /** Handle incoming server messages */
  private handleServerMessage(msg: Record<string, unknown>, callbacks: GeminiCallbacks): void {
    // Setup complete
    if (msg.setupComplete) {
      this.isSetupDone = true;
      console.log("[GeminiLive] Session setup complete");
      return;
    }

    // Server content (audio response or text)
    const serverContent = msg.serverContent as Record<string, unknown> | undefined;
    if (serverContent) {
      // Check for interruption
      if (serverContent.interrupted === true) {
        console.log("[GeminiLive] Response interrupted by user speech");
        callbacks.onInterrupted();
        return;
      }

      // Extract audio parts from modelTurn
      const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined;
      if (modelTurn?.parts) {
        const parts = modelTurn.parts as Array<Record<string, unknown>>;
        for (const part of parts) {
          // Audio data
          const inlineData = part.inlineData as Record<string, unknown> | undefined;
          if (inlineData?.data) {
            const pcm24kBuffer = Buffer.from(inlineData.data as string, "base64");
            // Convert PCM 24kHz → mulaw 8kHz for Plivo
            const mulawBuffer = linear24kToMulaw8k(pcm24kBuffer);
            if (mulawBuffer.length > 0) {
              callbacks.onAudioChunk(mulawBuffer);
            }
          }

          // Text part (transcript of what the model said)
          if (typeof part.text === "string") {
            callbacks.onTranscript(part.text, "assistant");
          }
        }
      }

      // Turn complete — the model finished its response
      if (serverContent.turnComplete === true) {
        // nothing extra needed
      }

      return;
    }

    // Tool calls (future use)
    const toolCall = msg.toolCall as Record<string, unknown> | undefined;
    if (toolCall) {
      console.log("[GeminiLive] Tool call received (not implemented):", JSON.stringify(toolCall));
    }
  }

  /**
   * Stream audio from Plivo to Gemini.
   * Input: raw mulaw 8kHz chunk from Plivo media event.
   */
  sendAudio(mulawChunk: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSetupDone) {
      return;
    }

    // Convert mulaw 8kHz → PCM 16kHz for Gemini input
    const pcm16k = mulawToLinear16k(mulawChunk);

    this.send({
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: pcm16k.toString("base64")
          }
        ]
      }
    });
  }

  /** Send a text message to Gemini (e.g., for the welcome message context) */
  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSetupDone) {
      return;
    }

    this.send({
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text }]
          }
        ],
        turnComplete: true
      }
    });
  }

  /** Close the Gemini WebSocket connection */
  close(): void {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, "Call ended");
      }
      this.ws = null;
    }
    this.isSetupDone = false;
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.isSetupDone;
  }

  private send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}
