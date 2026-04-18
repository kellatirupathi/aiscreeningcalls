import WebSocket from "ws";

export type TranscriptCallback = (
  text: string,
  isFinal: boolean,
  speechFinal: boolean
) => void;

/** Fired when Deepgram's VAD detects the speaker truly stopped talking. */
export type UtteranceEndCallback = () => void;

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
    onUtteranceEnd?: UtteranceEndCallback
  ): WebSocket {
    // Deepgram allows aggressive endpointing, but UtteranceEnd requires a
    // minimum of 1000ms (server-side enforced — lower values return HTTP 400).
    // Endpointing floor lowered 500→300ms so interim→final transitions fire
    // faster, giving us a usable signal before UtteranceEnd.
    const epMs = Math.max(300, Math.min(endpointingMs ?? 400, 5000));
    const utteranceEndMs = Math.max(1000, Math.min(endpointingMs ?? 1000, 5000));
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
