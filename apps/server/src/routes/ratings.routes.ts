import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { mapRatedCall, type RatedCallEntity } from "../utils/viewModels.js";
import { ratingQueue } from "../queues/ratingQueue.js";
import { enqueuePendingRatings } from "../workers/ratingWorker.js";
import { ratingService } from "../services/rating/RatingService.js";

export const ratingRoutes = Router();

/**
 * GET /api/ratings
 * List all calls with their ratings, filtered by source / agent / campaign / date.
 * Query params: source=test|campaign, agentId, campaignId, from, to, search
 */
ratingRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const source = String(req.query.source ?? "all");
    const agentId = req.query.agentId ? String(req.query.agentId) : undefined;
    const campaignId = req.query.campaignId ? String(req.query.campaignId) : undefined;
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const search = req.query.search ? String(req.query.search).toLowerCase() : "";

    const where: Record<string, unknown> = {
      organizationId: orgId,
      status: { in: ["completed", "timeout", "silence-timeout"] }
    };
    if (agentId) where.agentId = agentId;
    if (source === "campaign") where.campaignId = { not: null };
    if (source === "test") where.campaignId = null;
    if (campaignId) where.campaignId = campaignId;
    if (from || to) {
      where.startedAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {})
      };
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
    const skip = (page - 1) * limit;

    const calls = await prisma.call.findMany({
      where,
      include: {
        student: true,
        campaign: true,
        agent: true,
        rating: true
      },
      orderBy: { startedAt: "desc" },
      skip,
      take: limit
    });

    let mapped = calls.map((c) => mapRatedCall(c as unknown as RatedCallEntity));
    if (search) {
      mapped = mapped.filter(
        (r) =>
          r.candidateName.toLowerCase().includes(search) ||
          r.phone.toLowerCase().includes(search) ||
          r.agentName.toLowerCase().includes(search)
      );
    }

    // Compute the union of all skill columns across rated rows so the UI can
    // render a stable column set even when filters span multiple agents.
    const skillColumnsSet = new Set<string>();
    for (const row of mapped) {
      for (const s of row.agentSkills) skillColumnsSet.add(s);
      for (const s of Object.keys(row.skillRatings)) skillColumnsSet.add(s);
    }

    res.json({
      rows: mapped,
      skillColumns: Array.from(skillColumnsSet).sort(),
      pendingCount: mapped.filter((r) => r.ratingStatus === "pending").length
    });
  })
);

/**
 * GET /api/ratings/stats — counts for filter chips.
 */
ratingRoutes.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;
    const [total, rated, pending, failed, skipped] = await Promise.all([
      prisma.call.count({ where: { organizationId: orgId, status: { in: ["completed", "timeout", "silence-timeout"] } } }),
      prisma.call.count({ where: { organizationId: orgId, ratingStatus: "rated" } }),
      prisma.call.count({ where: { organizationId: orgId, ratingStatus: "pending", status: { in: ["completed", "timeout", "silence-timeout"] } } }),
      prisma.call.count({ where: { organizationId: orgId, ratingStatus: "failed" } }),
      prisma.call.count({ where: { organizationId: orgId, ratingStatus: "skipped" } })
    ]);
    res.json({ total, rated, pending, failed, skipped });
  })
);

/**
 * POST /api/ratings/reload
 * Immediately enqueues all pending ratings (bypasses the 5-min auto-tick).
 */
ratingRoutes.post(
  "/reload",
  asyncHandler(async (req, res) => {
    const enqueued = await enqueuePendingRatings(req.auth!.organizationId);
    res.json({ enqueued });
  })
);

/**
 * GET /api/ratings/by-phone/:phone
 * Returns all rating rows across all calls for a given candidate phone number,
 * newest first — shows the full history of attempts for one candidate.
 */
ratingRoutes.get(
  "/by-phone/:phone",
  asyncHandler(async (req, res) => {
    const phone = String(req.params.phone);
    const ratings = await prisma.callRating.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        candidatePhone: phone
      },
      include: {
        call: {
          include: {
            student: true,
            campaign: true,
            agent: true
          }
        }
      },
      orderBy: { generatedAt: "desc" }
    });

    const rows = ratings
      .filter((r) => r.call)
      .map((r) =>
        mapRatedCall({
          ...r.call,
          rating: r
        } as unknown as RatedCallEntity)
      );

    res.json({ phone, rows, total: rows.length });
  })
);

/**
 * GET /api/ratings/:callId — full rating detail for one call.
 */
ratingRoutes.get(
  "/:callId",
  asyncHandler(async (req, res) => {
    const callId = String(req.params.callId);
    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        student: true,
        campaign: true,
        agent: true,
        rating: true,
        turns: { orderBy: { sequence: "asc" } }
      }
    });
    if (!call || call.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Call not found." });
      return;
    }
    const mapped = mapRatedCall(call as unknown as RatedCallEntity);
    res.json({
      ...mapped,
      transcript: call.turns.map((t) => ({
        speaker: t.speaker === "assistant" ? "Agent" : "Candidate",
        text: t.text
      })),
      summary: call.summaryText ?? ""
    });
  })
);

/**
 * POST /api/ratings/:callId/regenerate — force re-run the rating for one call.
 */
ratingRoutes.post(
  "/:callId/regenerate",
  asyncHandler(async (req, res) => {
    const callId = String(req.params.callId);
    const call = await prisma.call.findUnique({ where: { id: callId }, select: { organizationId: true } });
    if (!call || call.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Call not found." });
      return;
    }
    // Reset status so the worker picks it up, and enqueue immediately.
    await prisma.call.update({ where: { id: callId }, data: { ratingStatus: "pending" } });
    await ratingQueue.add(
      { callId },
      { attempts: 2, removeOnComplete: 100, removeOnFail: 200 }
    );
    res.json({ message: "Rating queued for regeneration." });
  })
);

/**
 * POST /api/ratings/:callId/rate-now — synchronous (blocking) regeneration for
 * testing / manual use. Avoid in high-volume paths.
 */
ratingRoutes.post(
  "/:callId/rate-now",
  asyncHandler(async (req, res) => {
    const callId = String(req.params.callId);
    const call = await prisma.call.findUnique({ where: { id: callId }, select: { organizationId: true } });
    if (!call || call.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Call not found." });
      return;
    }
    const result = await ratingService.rateCall(callId);
    res.json(result);
  })
);
