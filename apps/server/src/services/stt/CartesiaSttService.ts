import WebSocket from "ws";
import type { TranscriptCallback } from "./DeepgramService.js";

interface CartesiaTranscriptMessage {
  type?: string;
  text?: string;
  is_final?: boolean;
  words?: Array<{ word: string; start: number; end: number }>;
  language?: string;
  duration?: number;
}

/**
 * Convert mulaw 8kHz (from Plivo) → PCM s16le 16kHz (for Cartesia).
 *
 * Steps:
 *   1. Decode each mulaw byte into a 16-bit PCM sample.
 *   2. Upsample from 8 kHz to 16 kHz by duplicating each sample.
 *   3. Return a Buffer of little-endian 16-bit signed integers.
 */

// Mulaw decode table — maps 0..255 to signed 16-bit PCM
const MULAW_DECODE = new Int16Array(256);
(function buildTable() {
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

function mulawToLinear16k(mulaw: Buffer): Buffer {
  const numSamples = mulaw.length;
  // Upsample 8k → 16k: each sample is duplicated
  const pcm = Buffer.alloc(numSamples * 2 * 2); // 2 samples * 2 bytes each
  for (let i = 0; i < numSamples; i++) {
    const sample = MULAW_DECODE[mulaw[i]];
    const offset = i * 4;
    pcm.writeInt16LE(sample, offset);
    pcm.writeInt16LE(sample, offset + 2);
  }
  return pcm;
}

export class CartesiaSttService {
  /**
   * Opens a Cartesia Ink streaming STT WebSocket session.
   * Accepts raw mulaw 8kHz audio from Plivo, converts to PCM s16le 16kHz for Cartesia.
   * Calls onTranscript whenever a transcript arrives.
   * Returns the WebSocket so the caller can send audio and close it.
   */
  startStreamingSession(
    apiKey: string,
    model: string, // e.g. "ink-whisper"
    onTranscript: TranscriptCallback,
    onError?: (err: Error) => void,
    onClose?: () => void
  ): WebSocket {
    const params = new URLSearchParams({
      model,
      language: "en",
      encoding: "pcm_s16le",
      sample_rate: "16000",
      api_key: apiKey,
      // High value to prevent Cartesia from closing the connection during agent speech.
      // Turn-taking silence detection is handled by our own debounce logic, not Cartesia.
      max_silence_duration_secs: "120"
    });

    const url = `wss://api.cartesia.ai/stt/websocket?${params.toString()}`;

    const ws = new WebSocket(url, {
      headers: {
        "Cartesia-Version": "2026-03-01"
      }
    });

    ws.on("open", () => {
      console.log("[CartesiaStt] WebSocket connected");
    });

    ws.on("message", (data) => {
      try {
        const result = JSON.parse(data.toString()) as CartesiaTranscriptMessage;

        if (result.type === "error") {
          console.error("[CartesiaStt] Server error:", data.toString());
          return;
        }

        const transcript = result.text ?? "";
        const isFinal = result.is_final ?? false;
        // Cartesia uses is_final to indicate completed utterances
        const speechFinal = isFinal;

        if (transcript.trim()) {
          onTranscript(transcript.trim(), isFinal, speechFinal);
        }
      } catch {
        // silently ignore parse errors
      }
    });

    ws.on("error", (err) => {
      console.error("[CartesiaStt] WebSocket error:", err.message);
      onError?.(err);
    });

    ws.on("close", () => {
      console.log("[CartesiaStt] WebSocket closed");
      onClose?.();
    });

    return ws;
  }

  /**
   * Send audio to Cartesia STT.
   * Input: raw mulaw 8kHz chunk (from Plivo).
   * Converts to PCM s16le 16kHz before sending.
   */
  sendAudio(ws: WebSocket, chunk: Buffer): void {
    if (ws.readyState === WebSocket.OPEN) {
      const pcm = mulawToLinear16k(chunk);
      ws.send(pcm);
    }
  }

  /**
   * Finalize and close the STT session.
   * Sends "done" command to flush remaining audio and close.
   */
  close(ws: WebSocket): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send("done");
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.terminate();
        }
      }, 2000);
    }
  }
}
