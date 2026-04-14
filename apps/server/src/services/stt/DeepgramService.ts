import WebSocket from "ws";

export type TranscriptCallback = (
  text: string,
  isFinal: boolean,
  speechFinal: boolean
) => void;

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
   * Returns the WebSocket so the caller can send audio and close it.
   */
  startStreamingSession(
    apiKey: string,
    model: string,
    onTranscript: TranscriptCallback,
    onError?: (err: Error) => void,
    onClose?: () => void,
    endpointingMs?: number
  ): WebSocket {
    // Use agent's endpointing config with sensible floor/ceiling for Deepgram
    const epMs = Math.max(500, Math.min(endpointingMs ?? 1500, 5000));
    const params = new URLSearchParams({
      encoding: "mulaw",
      sample_rate: "8000",
      channels: "1",
      model,
      language: "en",
      interim_results: "true",
      endpointing: String(epMs),
      smart_format: "true",
      utterance_end_ms: String(epMs)
    });

    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
      headers: { Authorization: `Token ${apiKey}` }
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
