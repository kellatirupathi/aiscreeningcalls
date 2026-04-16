import { ratingQueue, type RatingJobData } from "../queues/ratingQueue.js";
import { prisma } from "../db/prisma.js";
import { ratingService } from "../services/rating/RatingService.js";

const BATCH_SIZE = 20;

// Process up to 3 rating jobs concurrently (OpenAI rate-limit friendly)
ratingQueue.process(3, async (job) => {
  const { callId } = job.data as RatingJobData;

  // Skip the repeatable tick job — it just triggers enqueuePendingRatings
  if (callId === "__tick__") {
    void enqueuePendingRatings()
      .then((n) => {
        if (n > 0) console.log(`[ratingWorker] Auto-tick enqueued ${n} pending ratings`);
      })
      .catch((err) => console.error("[ratingWorker] Auto-tick error:", (err as Error).message));
    return { callId, status: "tick" };
  }

  const result = await ratingService.rateCall(callId);
  return { callId, ...result };
});

ratingQueue.on("completed", (job, result) => {
  console.log(`[ratingQueue] Job ${job.id} completed:`, result);
});

ratingQueue.on("failed", (job, err) => {
  console.error(`[ratingQueue] Job ${job.id} failed:`, err.message);
});

ratingQueue.on("error", (err) => {
  console.error("[ratingQueue] Queue error:", err.message);
});

// Detect stalled jobs (worker crashed mid-processing)
ratingQueue.on("stalled", (job) => {
  console.warn(`[ratingQueue] Job ${job.id} stalled — will be retried`);
});

/**
 * Enqueue all pending calls that are ready for rating.
 * Returns the number of jobs enqueued.
 */
export async function enqueuePendingRatings(organizationId?: string): Promise<number> {
  const pending = await prisma.call.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      ratingStatus: "pending",
      status: { in: ["completed", "timeout", "silence-timeout"] },
      transcriptText: { not: null }
    },
    select: { id: true },
    take: BATCH_SIZE,
    orderBy: { endedAt: "desc" }
  });

  if (pending.length === 0) return 0;

  for (const call of pending) {
    // Check if a job for this callId is already in the queue to prevent duplicates
    const existing = await ratingQueue.getJobs(["waiting", "active", "delayed"]);
    const alreadyQueued = existing.some((j) => j.data?.callId === call.id);
    if (alreadyQueued) continue;

    await ratingQueue.add(
      { callId: call.id },
      {
        attempts: 2,
        backoff: { type: "fixed", delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
        timeout: 60_000 // 60s hard timeout per rating job
      }
    );
  }
  return pending.length;
}

// Use Bull's built-in repeatable job instead of setInterval.
// This survives process restarts cleanly (no duplicate intervals).
void ratingQueue.add(
  { callId: "__tick__" },
  {
    repeat: { every: 5 * 60 * 1000 },
    jobId: "rating-auto-tick",
    removeOnComplete: true,
    removeOnFail: true
  }
).catch(() => undefined);

// Startup tick after 30s
setTimeout(() => {
  void enqueuePendingRatings()
    .then((n) => {
      if (n > 0) console.log(`[ratingWorker] Startup tick enqueued ${n} pending ratings`);
    })
    .catch(() => undefined);
}, 30_000);
