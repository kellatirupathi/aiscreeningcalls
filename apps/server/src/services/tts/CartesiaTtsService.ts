export interface CartesiaSynthesisOptions {
  apiKey: string;
  modelId: string;   // e.g. "sonic-2"
  voiceId: string;   // Cartesia voice UUID
  speedRate?: number;
}

export class CartesiaTtsService {
  /**
   * Synthesizes text using Cartesia Sonic TTS.
   * Returns a Buffer of raw mulaw 8kHz audio (matching Plivo's expected format).
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

    // Cartesia accepts speed as a float (1.0 = normal)
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
}
