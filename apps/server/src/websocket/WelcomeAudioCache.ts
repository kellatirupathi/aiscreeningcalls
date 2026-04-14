/**
 * In-memory cache for pre-synthesized welcome audio.
 *
 * Flow:
 *   1. callWorker kicks off TTS synthesis BEFORE dialing Plivo and stores the
 *      Promise<Buffer> here keyed by callId.
 *   2. Plivo rings the candidate's phone (5-15 seconds typical ringing time).
 *   3. TTS synthesis completes in parallel during ringing.
 *   4. When candidate picks up, MediaBridgeServer retrieves the already-resolved
 *      promise from this cache and plays the audio instantly — no TTS wait.
 *
 * Entries auto-expire after 5 minutes to prevent memory leaks if a call is
 * abandoned before pickup.
 */

type CachedEntry = {
  audio: Promise<Buffer | null>;
  expiresAt: number;
};

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CachedEntry>();

export const welcomeAudioCache = {
  set(callId: string, audio: Promise<Buffer | null>): void {
    cache.set(callId, {
      audio,
      expiresAt: Date.now() + TTL_MS
    });
  },

  get(callId: string): Promise<Buffer | null> | null {
    const entry = cache.get(callId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(callId);
      return null;
    }
    return entry.audio;
  },

  delete(callId: string): void {
    cache.delete(callId);
  }
};

// Periodic cleanup: sweep expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [callId, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(callId);
    }
  }
}, 60 * 1000).unref();
