import { Router } from "express";
import multer from "multer";
import { requireRoles } from "../middleware/auth.middleware.js";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { mapBatch, mapCall } from "../utils/viewModels.js";
import { callQueue } from "../queues/callQueue.js";
import type { CallJobData } from "../workers/callWorker.js";

export const batchRoutes = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── List batches ─────────────────────────────────────────────────────────────
batchRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const [batches, agents] = await Promise.all([
      prisma.batch.findMany({
        where: { organizationId: req.auth!.organizationId },
        orderBy: { createdAt: "desc" }
      }),
      prisma.agent.findMany({
        where: { organizationId: req.auth!.organizationId },
        select: { id: true, name: true }
      })
    ]);

    const agentNames = new Map(agents.map((a) => [a.id, a.name]));
    res.json(batches.map((b) => mapBatch(b, agentNames.get(b.agentId))));
  })
);

// ─── Create batch ─────────────────────────────────────────────────────────────
batchRoutes.post(
  "/",
  requireRoles(["admin", "manager", "recruiter"]),
  asyncHandler(async (req, res) => {
    const { name, agentId, telephonyProvider, fromNumber } = req.body as Record<string, unknown>;

    if (!name || !agentId || !telephonyProvider || !fromNumber) {
      res.status(400).json({ message: "name, agentId, telephonyProvider, and fromNumber are required." });
      return;
    }

    const agent = await prisma.agent.findFirst({
      where: { id: String(agentId), organizationId: req.auth!.organizationId }
    });
    if (!agent) {
      res.status(404).json({ message: "Agent not found." });
      return;
    }

    const batch = await prisma.batch.create({
      data: {
        organizationId: req.auth!.organizationId,
        agentId: String(agentId),
        name: String(name),
        telephonyProvider: String(telephonyProvider).toLowerCase(),
        fromNumber: String(fromNumber),
        status: "draft"
      }
    });

    res.status(201).json(mapBatch(batch, agent.name));
  })
);

// ─── Get single batch ─────────────────────────────────────────────────────────
batchRoutes.get(
  "/:batchId",
  asyncHandler(async (req, res) => {
    const batchId = String(req.params.batchId);
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });

    if (!batch || batch.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Batch not found." });
      return;
    }

    const agent = await prisma.agent.findFirst({
      where: { id: batch.agentId, organizationId: req.auth!.organizationId },
      select: { name: true }
    });

    res.json(mapBatch(batch, agent?.name));
  })
);

// ─── Update batch ─────────────────────────────────────────────────────────────
batchRoutes.patch(
  "/:batchId",
  requireRoles(["admin", "manager", "recruiter"]),
  asyncHandler(async (req, res) => {
    const batchId = String(req.params.batchId);
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });

    if (!batch || batch.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Batch not found." });
      return;
    }

    if (batch.status === "active") {
      res.status(400).json({ message: "Cannot edit an active batch. Pause it first." });
      return;
    }

    const { name, telephonyProvider, fromNumber } = req.body as Record<string, unknown>;

    const updated = await prisma.batch.update({
      where: { id: batchId },
      data: {
        ...(name ? { name: String(name) } : {}),
        ...(telephonyProvider ? { telephonyProvider: String(telephonyProvider).toLowerCase() } : {}),
        ...(fromNumber ? { fromNumber: String(fromNumber) } : {})
      }
    });

    const agent = await prisma.agent.findFirst({
      where: { id: updated.agentId },
      select: { name: true }
    });

    res.json(mapBatch(updated, agent?.name));
  })
);

// ─── Delete batch ─────────────────────────────────────────────────────────────
batchRoutes.delete(
  "/:batchId",
  requireRoles(["admin", "manager"]),
  asyncHandler(async (req, res) => {
    const batchId = String(req.params.batchId);
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });

    if (!batch || batch.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Batch not found." });
      return;
    }

    if (batch.status === "active") {
      res.status(400).json({ message: "Cannot delete an active batch. Pause it first." });
      return;
    }

    await prisma.batch.delete({ where: { id: batchId } });
    res.status(204).send();
  })
);

// ─── Start batch ──────────────────────────────────────────────────────────────
// Accepts: { items: [{ name, phone, email? }] } in body OR uploaded CSV file
batchRoutes.post(
  "/:batchId/start",
  requireRoles(["admin", "manager", "recruiter"]),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const batchId = String(req.params.batchId);
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });

    if (!batch || batch.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Batch not found." });
      return;
    }

    if (!["draft", "paused"].includes(batch.status)) {
      res.status(400).json({ message: `Batch cannot be started from '${batch.status}' status.` });
      return;
    }

    type ItemInput = { name: string; phone: string };
    let items: ItemInput[] = [];

    const file = (req as unknown as { file?: Express.Multer.File }).file;

    if (file) {
      const csv = file.buffer.toString("utf-8");
      const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        res.status(400).json({ message: "CSV must have a header and at least one row." });
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const nameIdx = headers.indexOf("name");
      const phoneIdx = headers.indexOf("phone");
      if (nameIdx === -1 || phoneIdx === -1) {
        res.status(400).json({ message: "CSV must have 'name' and 'phone' columns." });
        return;
      }
      items = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        return { name: cols[nameIdx] ?? "", phone: cols[phoneIdx] ?? "" };
      }).filter((i) => i.name && i.phone);
    } else {
      const body = req.body as { items?: ItemInput[] };
      if (!Array.isArray(body.items) || body.items.length === 0) {
        res.status(400).json({ message: "Provide a CSV file or JSON body with 'items' array [{name, phone}]." });
        return;
      }
      items = body.items;
    }

    if (items.length === 0) {
      res.status(400).json({ message: "No valid items found." });
      return;
    }

    await prisma.batch.update({
      where: { id: batchId },
      data: { status: "active", totalItems: { increment: items.length } }
    });

    let queued = 0;
    for (const item of items) {
      const call = await prisma.call.create({
        data: {
          organizationId: req.auth!.organizationId,
          agentId: batch.agentId,
          telephonyProvider: batch.telephonyProvider,
          status: "queued",
          startedAt: new Date()
        }
      });

      const jobData: CallJobData = {
        callId: call.id,
        organizationId: req.auth!.organizationId,
        agentId: batch.agentId,
        to: item.phone,
        from: batch.fromNumber,
        provider: batch.telephonyProvider
      };

      await callQueue.add(jobData, {
        attempts: 3,
        backoff: { type: "fixed", delay: 5 * 60 * 1000 },
        removeOnComplete: 100,
        removeOnFail: 200
      });

      queued++;
    }

    res.json({ message: `Batch started. ${queued} call(s) queued.`, queued });
  })
);

// ─── Pause batch ──────────────────────────────────────────────────────────────
batchRoutes.post(
  "/:batchId/pause",
  requireRoles(["admin", "manager", "recruiter"]),
  asyncHandler(async (req, res) => {
    const batchId = String(req.params.batchId);
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });

    if (!batch || batch.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Batch not found." });
      return;
    }

    if (batch.status !== "active") {
      res.status(400).json({ message: "Only active batches can be paused." });
      return;
    }

    await callQueue.pause();
    await prisma.batch.update({ where: { id: batchId }, data: { status: "paused" } });
    res.json({ message: "Batch paused." });
  })
);

// ─── Resume batch ─────────────────────────────────────────────────────────────
batchRoutes.post(
  "/:batchId/resume",
  requireRoles(["admin", "manager", "recruiter"]),
  asyncHandler(async (req, res) => {
    const batchId = String(req.params.batchId);
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });

    if (!batch || batch.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Batch not found." });
      return;
    }

    if (batch.status !== "paused") {
      res.status(400).json({ message: "Only paused batches can be resumed." });
      return;
    }

    await callQueue.resume();
    await prisma.batch.update({ where: { id: batchId }, data: { status: "active" } });
    res.json({ message: "Batch resumed." });
  })
);

// ─── Get batch calls ──────────────────────────────────────────────────────────
batchRoutes.get(
  "/:batchId/items",
  asyncHandler(async (req, res) => {
    const batchId = String(req.params.batchId);
    const batch = await prisma.batch.findUnique({ where: { id: batchId } });

    if (!batch || batch.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Batch not found." });
      return;
    }

    // Batches don't have a separate Student model — return calls linked to this agent
    // that are not part of a campaign (ad-hoc batch calls)
    const calls = await prisma.call.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        agentId: batch.agentId,
        campaignId: null
      },
      include: {
        student: true,
        campaign: true,
        agent: true,
        turns: { orderBy: { sequence: "asc" } }
      },
      orderBy: { startedAt: "desc" },
      take: 100
    });

    res.json(calls.map(mapCall));
  })
);
