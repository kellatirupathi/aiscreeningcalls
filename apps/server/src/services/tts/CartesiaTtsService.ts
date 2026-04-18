import WebSocket from "ws";

export interface CartesiaSynthesisOptions {
  apiKey: string;
  modelId: string;   // e.g. "sonic-2"
  voiceId: string;   // Cartesia voice UUID
  speedRate?: number;
}

export class CartesiaTtsService {
  /**
   * Synthesizes text using Cartesia Sonic TTS via REST (full audio).
   * Returns a Buffer of raw mulaw 8kHz audio (matching Plivo's expected format).
   * Use this for pre-synthesis (welcome message caching) where latency doesn't matter.
   */
  async synthesize(text: string, options: CartesiaSynthesisOptions): Promise<Buffer> {
    const { apiKey, modelId, voiceId, speedRate } = options;

    if (!voiceId) {
      throw new Error("Cartesia voiceId is not configured on this agent.");
    }

    const body: Record<string, unknown> = {
      model_id: modelId || "sonic-2",
      transcript: text,
      voice: { mode: "id", id: voiceId },
      output_format: {
        container: "raw",
        encoding: "pcm_mulaw",
        sample_rate: 8000
      },
      language: "en"
    };

    if (typeof speedRate === "number" && speedRate !== 1) {
      body.speed = speedRate;
    }

    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Cartesia-Version": "2026-03-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Cartesia TTS failed (${response.status}): ${errBody}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Synthesizes text using Cartesia Sonic TTS via WebSocket STREAMING.
   * Calls onChunk with each audio chunk as soon as it's ready — first chunk
   * typically arrives in ~100ms instead of waiting for the entire audio (~400ms).
   * Calls onDone when all chunks have been received.
   * Returns the total audio buffer for playback duration calculation.
   */
  async synthesizeStreaming(
    text: string,
    options: CartesiaSynthesisOptions,
    onChunk: (chunk: Buffer) => void
  ): Promise<Buffer> {
    const { apiKey, modelId, voiceId, speedRate } = options;

    if (!voiceId) {
      throw new Error("Cartesia voiceId is not configured on this agent.");
    }

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let resolved = false;

      const params = new URLSearchParams({
        api_key: apiKey,
        cartesia_version: "2026-03-01"
      });

      const ws = new WebSocket(`wss://api.cartesia.ai/tts/websocket?${params.toString()}`);

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.terminate();
          reject(new Error("Cartesia streaming TTS timeout (10s)"));
        }
      }, 10_000);

      ws.on("open", () => {
        const request: Record<string, unknown> = {
          model_id: modelId || "sonic-2",
          transcript: text,
          voice: { mode: "id", id: voiceId },
          output_format: {
            container: "raw",
            encoding: "pcm_mulaw",
            sample_rate: 8000
          },
          language: "en"
        };

        if (typeof speedRate === "number" && speedRate !== 1) {
          request.speed = speedRate;
        }

        ws.send(JSON.stringify(request));
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;

          if (msg.type === "chunk" && msg.data) {
            const audioChunk = Buffer.from(msg.data as string, "base64");
            chunks.push(audioChunk);
            onChunk(audioChunk);
          }

          if (msg.done === true || msg.type === "done") {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              ws.close();
              resolve(Buffer.concat(chunks));
            }
          }

          if (msg.type === "error") {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              ws.close();
              reject(new Error(`Cartesia streaming TTS error: ${JSON.stringify(msg)}`));
            }
          }
        } catch {
          // ignore parse errors for binary frames
          if (Buffer.isBuffer(data)) {
            const audioChunk = data as Buffer;
            chunks.push(audioChunk);
            onChunk(audioChunk);
          }
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          reject(new Error(`Cartesia streaming WS error: ${err.message}`));
        }
      });

      ws.on("close", () => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve(Buffer.concat(chunks));
        }
      });
    });
  }
}
