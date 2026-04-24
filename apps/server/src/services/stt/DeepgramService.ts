import WebSocket from "ws";

export type TranscriptCallback = (
  text: string,
  isFinal: boolean,
  speechFinal: boolean
) => void;

/** Fired when Deepgram's VAD detects the speaker truly stopped talking. */
export type UtteranceEndCallback = () => void;

/**
 * Fired when Deepgram's VAD detects the speaker JUST STARTED talking.
 * This is the earliest signal we can get — fires within ~50-100ms of speech
 * onset, BEFORE any transcript text is available. Used for preemptive
 * barge-in: stop the agent's audio the moment the human opens their mouth.
 */
export type SpeechStartedCallback = () => void;

interface DeepgramResultMessage {
  type: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives?: Array<{ transcript: string; confidence: number }>;
  };
}

export class DeepgramService {
  /**
   * Opens a Deepgram streaming STT WebSocket session.
   * Sends raw mulaw 8kHz audio chunks (as Buffers).
   * Calls onTranscript whenever a transcript event arrives.
   * Calls onUtteranceEnd when Deepgram's VAD detects end-of-speech
   * (much faster and more accurate than a fixed debounce timer).
   * Returns the WebSocket so the caller can send audio and close it.
   */
  startStreamingSession(
    apiKey: string,
    model: string,
    onTranscript: TranscriptCallback,
    onError?: (err: Error) => void,
    onClose?: () => void,
    endpointingMs?: number,
    onUtteranceEnd?: UtteranceEndCallback,
    onSpeechStarted?: SpeechStartedCallback
  ): WebSocket {
    // Deepgram allows aggressive endpointing down to ~10ms. UtteranceEnd
    // requires a server-side minimum of 1000ms (lower values return HTTP 400).
    // We honour the agent's configured endpointing value to get fast
    // interim→final transitions, which is the signal we actually act on.
    const epMs = Math.max(100, Math.min(endpointingMs ?? 200, 5000));
    const utteranceEndMs = 1000;
    const params = new URLSearchParams({
      encoding: "mulaw",
      sample_rate: "8000",
      channels: "1",
      model,
      language: "en",
      interim_results: "true",
      endpointing: String(epMs),
      smart_format: "true",
      utterance_end_ms: String(utteranceEndMs),
      vad_events: "true"
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    console.log(
      `[Deepgram] Connecting: ${url.replace(/Token [^ ]+/, "Token ***")} ` +
      `(key starts with: ${apiKey.slice(0, 8)}..., endpointing=${epMs}, utterance_end_ms=${utteranceEndMs})`
    );

    const ws = new WebSocket(url, {
      headers: { Authorization: `Token ${apiKey}` }
    });

    ws.on("unexpected-response", (_request, response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk.toString();
      });
      response.on("end", () => {
        const details = body.trim() || response.statusMessage || "Unknown Deepgram error";
        console.error(`[Deepgram] Unexpected response ${response.statusCode}: ${details}`);
      });
    });

    ws.on("message", (data) => {
      try {
        const result = JSON.parse(data.toString()) as DeepgramResultMessage;

        if (result.type === "Results") {
          const transcript = result.channel?.alternatives?.[0]?.transcript ?? "";
          const isFinal = result.is_final ?? false;
          const speechFinal = result.speech_final ?? false;

          if (transcript.trim()) {
            onTranscript(transcript.trim(), isFinal, speechFinal);
          }
        }

        // UtteranceEnd: Deepgram's VAD has detected the speaker stopped.
        // This fires ~500-800ms after the last word — much faster than a
        // fixed debounce timer and much more accurate.
        if (result.type === "UtteranceEnd") {
          onUtteranceEnd?.();
        }

        // SpeechStarted: Deepgram's VAD has detected the speaker started.
        // Fires ~50-100ms after speech onset — earliest possible signal,
        // before any transcript is ready. Use this for preemptive barge-in.
        if (result.type === "SpeechStarted") {
          onSpeechStarted?.();
        }
      } catch {
        // silently ignore parse errors
      }
    });

    ws.on("error", (err) => {
      console.error("[Deepgram] WebSocket error:", err.message);
      onError?.(err);
    });

    ws.on("close", () => {
      onClose?.();
    });

    return ws;
  }

  sendAudio(ws: WebSocket, chunk: Buffer): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk);
    }
  }

  close(ws: WebSocket): void {
    if (ws.readyState === WebSocket.OPEN) {
      // Tell Deepgram we're done streaming
      ws.send(JSON.stringify({ type: "CloseStream" }));
      // Force-terminate after brief grace period
      setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.terminate();
        }
      }, 500);
    }
  }
}
