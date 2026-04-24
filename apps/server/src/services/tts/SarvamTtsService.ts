export interface SarvamSynthesisOptions {
  apiKey: string;
  modelId: string;        // "bulbul:v2" | "bulbul:v3"
  voiceId: string;        // speaker name, e.g. "anushka", "meera", "abhilash"
  speedRate?: number;     // 0.3-3.0 for v2, 0.5-2.0 for v3
  language?: string;      // BCP-47 code, e.g. "en-IN", "hi-IN"
  sampleRate?: number;    // 8000 | 22050 | 48000 — source quality requested from Sarvam
}

interface SarvamResponse {
  audios?: string[];
  request_id?: string;
  status_code?: number;
  error?: unknown;
}

// Standard PCM16LE → mu-law (G.711) conversion. Matches the format Plivo
// expects on its media-stream WebSocket (audio/x-mulaw at 8000 Hz).
function pcm16ToMulaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1);
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

// Locate the "data" subchunk in a RIFF/WAVE buffer and return the PCM payload.
// Works whether the header is the common 44-byte layout or has extra chunks.
function extractPcmFromWav(wav: Buffer): Buffer {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") {
    // Not a WAV — assume raw PCM16LE
    return wav;
  }
  // Scan for "data" chunk id after the 12-byte RIFF header
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return wav.subarray(offset + 8, offset + 8 + chunkSize);
    }
    offset += 8 + chunkSize;
  }
  // Fallback: skip standard 44-byte header
  return wav.subarray(44);
}

function pcm16LeToMulawBuffer(pcm: Buffer): Buffer {
  const sampleCount = Math.floor(pcm.length / 2);
  const out = Buffer.allocUnsafe(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const sample = pcm.readInt16LE(i * 2);
    out[i] = pcm16ToMulaw(sample);
  }
  return out;
}

/**
 * Resample PCM16LE from `fromRate` Hz to `toRate` Hz using linear interpolation.
 * Plivo's media stream is fixed at 8 kHz mulaw, so any non-8k Sarvam output
 * must be downsampled here before mulaw conversion. Linear resampling is
 * sufficient for telephony-quality voice — Plivo's codec truncates high
 * frequencies anyway so a proper low-pass isn't audible on phone calls.
 */
function resamplePcm16Le(pcm: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) return pcm;
  const inSamples = Math.floor(pcm.length / 2);
  if (inSamples === 0) return Buffer.alloc(0);
  const outSamples = Math.max(1, Math.floor((inSamples * toRate) / fromRate));
  const out = Buffer.allocUnsafe(outSamples * 2);
  const ratio = inSamples / outSamples;
  for (let i = 0; i < outSamples; i++) {
    const srcIdx = i * ratio;
    const srcIdxFloor = Math.floor(srcIdx);
    const frac = srcIdx - srcIdxFloor;
    const s0 = pcm.readInt16LE(srcIdxFloor * 2);
    const s1 =
      srcIdxFloor + 1 < inSamples ? pcm.readInt16LE((srcIdxFloor + 1) * 2) : s0;
    const interp = Math.round(s0 * (1 - frac) + s1 * frac);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, interp)), i * 2);
  }
  return out;
}

export class SarvamTtsService {
  /**
   * Synthesize text with Sarvam TTS (REST) and return raw mulaw 8kHz audio
   * ready to be streamed to Plivo. Sarvam returns base64-encoded WAV PCM16
   * at the requested sample rate, which we decode and convert.
   */
  async synthesize(text: string, options: SarvamSynthesisOptions): Promise<Buffer> {
    const { apiKey, modelId, voiceId, speedRate, language, sampleRate } = options;

    if (!voiceId) {
      throw new Error("Sarvam voiceId (speaker) is not configured on this agent.");
    }

    const model = modelId || "bulbul:v3";

    // Request whatever sample rate the agent configured (default 8000).
    // Sarvam accepts 8000 / 22050 / 48000. If it's not 8000 we'll downsample
    // to 8kHz before mulaw encoding for Plivo.
    const requestedSampleRate =
      sampleRate && [8000, 16000, 22050, 24000, 48000].includes(sampleRate)
        ? sampleRate
        : 8000;

    const body: Record<string, unknown> = {
      text,
      target_language_code: language || "en-IN",
      speaker: voiceId,
      model,
      speech_sample_rate: requestedSampleRate,
      enable_preprocessing: true
    };

    if (typeof speedRate === "number" && speedRate !== 1) {
      body.pace = speedRate;
    }

    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Sarvam TTS failed (${response.status}): ${errBody}`);
    }

    const json = (await response.json()) as SarvamResponse;
    const first = json.audios?.[0];
    if (!first) {
      throw new Error(`Sarvam TTS returned no audio: ${JSON.stringify(json)}`);
    }

    const wavBuffer = Buffer.from(first, "base64");
    const pcmBuffer = extractPcmFromWav(wavBuffer);

    // Downsample if we asked for anything above telephony rate.
    // Plivo expects 8 kHz mulaw, no exceptions.
    const pcm8k =
      requestedSampleRate === 8000
        ? pcmBuffer
        : resamplePcm16Le(pcmBuffer, requestedSampleRate, 8000);

    return pcm16LeToMulawBuffer(pcm8k);
  }
}
