export interface SynthesisOptions {
  voiceId: string;
  modelId: string;
  apiKey: string;
  stability?: number;
  similarityBoost?: number;
  styleExaggeration?: number;
  speedRate?: number;
}

export class ElevenLabsService {
  /**
   * Synthesizes text to mulaw 8kHz audio (matching Plivo's expected format).
   * Returns a Buffer of raw mulaw audio bytes.
   */
  async synthesize(text: string, options: SynthesisOptions): Promise<Buffer> {
    const { voiceId, modelId, apiKey, stability, similarityBoost, styleExaggeration, speedRate } = options;

    if (!voiceId) {
      throw new Error("ElevenLabs voiceId is not configured on this agent.");
    }

    // ulaw_8000 = mulaw 8kHz, matches Plivo's audio format exactly (no conversion needed)
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=ulaw_8000`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: stability ?? 0.5,
          similarity_boost: similarityBoost ?? 0.75,
          style: styleExaggeration ?? 0,
          speed: speedRate ?? 1.0
        }
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`ElevenLabs synthesis failed (${response.status}): ${errBody}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
