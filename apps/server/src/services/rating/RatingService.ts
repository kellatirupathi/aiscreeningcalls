import OpenAI from "openai";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { resolveOpenAiCredential } from "../credentials/CredentialResolver.js";

export interface SkillRating {
  rating: number | null;
  reason: string;
  evidence: string;
}

export interface RatingResult {
  selfIntro: { rating: number | null; reason: string };
  communication: { rating: number | null; reason: string };
  skills: Record<string, SkillRating>;
}

const FALLBACK_SKILLS = ["Communication", "Clarity"];

function normalizeRatingValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded >= 1 && rounded <= 5 ? rounded : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const match = trimmed.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;

    const parsed = Number.parseFloat(match[0]);
    if (!Number.isFinite(parsed)) return null;

    const rounded = Math.round(parsed);
    return rounded >= 1 && rounded <= 5 ? rounded : null;
  }

  return null;
}

/**
 * Attempts to auto-extract technical skills from an agent's system prompt.
 * Looks for common patterns like "on ReactJS, NodeJS, and SQLite".
 */
export function extractSkillsFromPrompt(systemPrompt: string): string[] {
  if (!systemPrompt) return [];
  const patterns = [
    /(?:interview(?:er)?|screening|assessment|questions?)\s+on\s+([A-Za-z0-9 ,.+\-/]+?)(?:\.|\n|$)/i,
    /(?:technologies|skills|stack)\s*[:\-]\s*([A-Za-z0-9 ,.+\-/]+?)(?:\.|\n|$)/i,
    /assessing\s+([A-Za-z0-9 ,.+\-/]+?)(?:\.|\n|$)/i
  ];
  for (const re of patterns) {
    const m = systemPrompt.match(re);
    if (m?.[1]) {
      return m[1]
        .split(/,|and|&|\//i)
        .map((s) => s.trim())
        .filter((s) => s.length > 1 && s.length < 40);
    }
  }
  return [];
}

export class RatingService {
  private async getClient(organizationId: string, llmCredentialId?: string | null): Promise<{ client: OpenAI; model: string }> {
    const cred = await resolveOpenAiCredential(organizationId, llmCredentialId ?? null);
    const apiKey = cred.apiKey || env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured for rating generation");
    const model = cred.defaultModel || env.OPENAI_MODEL || "gpt-4o-mini";
    return { client: new OpenAI({ apiKey }), model };
  }

  /**
   * Generate a structured rating for a completed call.
   * Returns parsed rating + the model name used.
   */
  async generate(
    organizationId: string,
    transcript: string,
    skills: string[],
    llmCredentialId?: string | null
  ): Promise<{ result: RatingResult; model: string }> {
    const skillList = skills.length > 0 ? skills : FALLBACK_SKILLS;
    const { client, model } = await this.getClient(organizationId, llmCredentialId);

    // 30s timeout so a hung OpenAI call doesn't block the Bull worker slot forever
    const abortController = new AbortController();
    const abortTimeout = setTimeout(() => abortController.abort(), 30_000);

    const systemPrompt =
      "You are an impartial technical interview evaluator. Based ONLY on the transcript, rate the candidate. " +
      "For each skill, give an integer rating 1-5, a one-sentence reason (<= 25 words), and a short exact quote from the candidate as evidence (<= 20 words). " +
      "Rating scale: 1=no knowledge/wrong, 2=vague/partial, 3=basic correct, 4=solid with specifics, 5=expert-level with examples. " +
      "If a skill was never discussed, set rating to null and reason to 'not assessed'. " +
      "Also rate selfIntro (clarity, relevance, confidence) and communication (fluency across the call). " +
      "Return STRICT JSON only, no markdown.";

    const schemaHint = {
      selfIntro: { rating: "1-5 or null", reason: "<=25 words" },
      communication: { rating: "1-5 or null", reason: "<=25 words" },
      skills: skillList.reduce((acc, s) => {
        acc[s] = { rating: "1-5 or null", reason: "<=25 words", evidence: "<=20 words exact quote" };
        return acc;
      }, {} as Record<string, unknown>)
    };

    const userPrompt = `Skills to rate: ${JSON.stringify(skillList)}
Expected JSON shape: ${JSON.stringify(schemaHint)}

Transcript:
${transcript}`;

    let completion;
    try {
      completion = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 900,
          response_format: { type: "json_object" }
        },
        { signal: abortController.signal as AbortSignal }
      );
    } finally {
      clearTimeout(abortTimeout);
    }

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<RatingResult>;

    // Normalize: ensure every configured skill is present in result
    const skills_ = (parsed.skills ?? {}) as Record<string, Partial<SkillRating>>;
    const normalizedSkills: Record<string, SkillRating> = {};
    for (const s of skillList) {
      const v = skills_[s] ?? {};
      normalizedSkills[s] = {
        rating: normalizeRatingValue(v.rating),
        reason: typeof v.reason === "string" ? v.reason : "not assessed",
        evidence: typeof v.evidence === "string" ? v.evidence : ""
      };
    }

    const result: RatingResult = {
      selfIntro: {
        rating: normalizeRatingValue(parsed.selfIntro?.rating),
        reason: typeof parsed.selfIntro?.reason === "string" ? parsed.selfIntro.reason : "not assessed"
      },
      communication: {
        rating: normalizeRatingValue(parsed.communication?.rating),
        reason: typeof parsed.communication?.reason === "string" ? parsed.communication.reason : "not assessed"
      },
      skills: normalizedSkills
    };

    return { result, model };
  }

  /**
   * Generate and persist a rating for a single call.
   * Idempotent: overwrites existing rating row for the call.
   */
  async rateCall(callId: string): Promise<{ status: "rated" | "skipped" | "failed"; reason?: string }> {
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        agent: true,
        student: true,
        turns: { orderBy: { sequence: "asc" } }
      }
    });

    if (!call) return { status: "failed", reason: "call not found" };
    if (!call.agent) return { status: "failed", reason: "call has no agent" };

    const candidatePhone = call.student?.phone ?? call.targetPhone ?? null;
    const candidateName = call.student?.name ?? call.targetName ?? null;

    const duration = call.durationSeconds ?? 0;
    const transcript =
      call.transcriptText?.trim() ||
      call.turns
        .map((t) => `${t.speaker === "assistant" ? "Agent" : "Candidate"}: ${t.text}`)
        .join("\n");

    if (duration < 30 || transcript.length < 200) {
      await prisma.call.update({ where: { id: callId }, data: { ratingStatus: "skipped" } });
      return { status: "skipped", reason: "call too short for meaningful rating" };
    }

    // Pull skills from agent.ratingSkills (Json), else auto-extract from prompt
    const agentSkills = (call.agent as unknown as { ratingSkills: unknown }).ratingSkills;
    let skills: string[] = [];
    if (Array.isArray(agentSkills)) {
      skills = (agentSkills as unknown[]).filter((v): v is string => typeof v === "string");
    }
    if (skills.length === 0) {
      skills = extractSkillsFromPrompt(call.agent.systemPrompt ?? "");
    }

    try {
      const { result, model } = await this.generate(
        call.organizationId,
        transcript,
        skills,
        call.agent.llmCredentialId
      );

      // Compute overall rating as weighted average of all numeric ratings
      const numeric: number[] = [];
      if (typeof result.selfIntro.rating === "number") numeric.push(result.selfIntro.rating);
      if (typeof result.communication.rating === "number") numeric.push(result.communication.rating);
      for (const s of Object.values(result.skills)) {
        if (typeof s.rating === "number") numeric.push(s.rating);
      }
      const overall = numeric.length > 0 ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null;

      await prisma.callRating.upsert({
        where: { callId },
        create: {
          callId,
          organizationId: call.organizationId,
          agentId: call.agentId ?? null,
          candidatePhone,
          candidateName,
          selfIntroRating: result.selfIntro.rating ?? null,
          selfIntroReason: result.selfIntro.reason,
          communicationRating: result.communication.rating ?? null,
          communicationReason: result.communication.reason,
          skillRatings: result.skills as unknown as object,
          overallRating: overall,
          model,
          status: "rated",
          errorMessage: null
        },
        update: {
          agentId: call.agentId ?? null,
          candidatePhone,
          candidateName,
          selfIntroRating: result.selfIntro.rating ?? null,
          selfIntroReason: result.selfIntro.reason,
          communicationRating: result.communication.rating ?? null,
          communicationReason: result.communication.reason,
          skillRatings: result.skills as unknown as object,
          overallRating: overall,
          model,
          status: "rated",
          errorMessage: null,
          generatedAt: new Date()
        }
      });

      await prisma.call.update({ where: { id: callId }, data: { ratingStatus: "rated" } });
      return { status: "rated" };
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[RatingService] Failed for call ${callId}:`, msg);
      await prisma.callRating
        .upsert({
          where: { callId },
          create: {
            callId,
            organizationId: call.organizationId,
            agentId: call.agentId ?? null,
            skillRatings: {} as object,
            model: "",
            status: "failed",
            errorMessage: msg
          },
          update: {
            status: "failed",
            errorMessage: msg,
            generatedAt: new Date()
          }
        })
        .catch(() => undefined);
      await prisma.call.update({ where: { id: callId }, data: { ratingStatus: "failed" } });
      return { status: "failed", reason: msg };
    }
  }
}

export const ratingService = new RatingService();
