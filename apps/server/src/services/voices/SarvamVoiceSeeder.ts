import { prisma } from "../../db/prisma.js";

interface SeedVoice {
  name: string;
  voiceId: string;
  language: "en" | "hi";
  gender: "male" | "female";
  description: string;
}

// Sarvam bulbul:v3 speakers — taken directly from Sarvam's live playground
// at dashboard.sarvam.ai/text-to-speech (as of April 2026).
// Language-agnostic: the same speaker can produce English or Hindi audio
// (controlled by target_language_code at API call time).
interface SarvamSpeaker {
  displayName: string;
  voiceId: string;     // lowercase API identifier
  gender: "male" | "female";
  tagline: string;
}

const SARVAM_V3_SPEAKERS: SarvamSpeaker[] = [
  { displayName: "Sumit",   voiceId: "sumit",   gender: "male",   tagline: "Balanced warmth with professionalism" },
  { displayName: "Ritu",    voiceId: "ritu",    gender: "female", tagline: "Soft, approachable voice for customer interactions" },
  { displayName: "Shubh",   voiceId: "shubh",   gender: "male",   tagline: "Friendly default voice for IVR and support" },
  { displayName: "Amit",    voiceId: "amit",    gender: "male",   tagline: "Formal voice for business communications" },
  { displayName: "Pooja",   voiceId: "pooja",   gender: "female", tagline: "Encouraging voice for assistance flows" },
  { displayName: "Manan",   voiceId: "manan",   gender: "male",   tagline: "Consistent voice for automated systems" },
  { displayName: "Simran",  voiceId: "simran",  gender: "female", tagline: "Warm voice for conversational interfaces" },
  { displayName: "Rahul",   voiceId: "rahul",   gender: "male",   tagline: "Composed voice that builds trust" },
  { displayName: "Kavya",   voiceId: "kavya",   gender: "female", tagline: "Everyday conversational tone" },
  { displayName: "Ratan",   voiceId: "ratan",   gender: "male",   tagline: "Sharp articulation for clarity" },
  { displayName: "Priya",   voiceId: "priya",   gender: "female", tagline: "Upbeat voice with personality" },
  { displayName: "Ishita",  voiceId: "ishita",  gender: "female", tagline: "Polished voice for enterprise use" },
  { displayName: "Shreya",  voiceId: "shreya",  gender: "female", tagline: "Precise pronunciation and enunciation" },
  { displayName: "Shruti",  voiceId: "shruti",  gender: "female", tagline: "Sweet and melodious voice" }
];

// Build one English and one Hindi entry per speaker so both show up in
// the agent's Voice dropdown depending on the agent's language setting.
const SARVAM_VOICES: SeedVoice[] = SARVAM_V3_SPEAKERS.flatMap((s) => [
  {
    name: `${s.displayName} (English)`,
    voiceId: s.voiceId,
    language: "en" as const,
    gender: s.gender,
    description: `${s.tagline} — English (bulbul:v3)`
  },
  {
    name: `${s.displayName} (Hindi)`,
    voiceId: s.voiceId,
    language: "hi" as const,
    gender: s.gender,
    description: `${s.tagline} — Hindi (bulbul:v3)`
  }
]);

/**
 * Auto-seeds Sarvam bulbul:v3 voices (English + Hindi) for an organization.
 * Runs lazily on the first GET /api/voices call per org.
 *
 * Per-voice idempotent: only adds voices keyed by (voiceId, language) that
 * are missing. Adding new entries to SARVAM_V3_SPEAKERS will backfill
 * existing orgs on the next /api/voices load.
 *
 * Ritu (English) is marked as default on a fresh seed.
 */
export async function seedSarvamVoicesForOrganization(organizationId: string): Promise<number> {
  const existing = await prisma.voice.findMany({
    where: { organizationId, provider: "sarvam" },
    select: { voiceId: true, language: true }
  });
  const existingKeys = new Set(existing.map((v) => `${v.voiceId}::${v.language}`));
  const hasAnyVoices = existing.length > 0;

  let seeded = 0;
  for (const v of SARVAM_VOICES) {
    const key = `${v.voiceId}::${v.language}`;
    if (existingKeys.has(key)) continue;

    await prisma.voice.create({
      data: {
        organizationId,
        name: v.name,
        provider: "sarvam",
        voiceId: v.voiceId,
        language: v.language,
        gender: v.gender,
        description: v.description,
        isDefault: !hasAnyVoices && v.voiceId === "ritu" && v.language === "en"
      }
    });
    seeded++;
  }

  if (seeded > 0) {
    console.log(`[SarvamVoiceSeeder] Seeded ${seeded} Sarvam voices for org ${organizationId}`);
  }
  return seeded;
}
