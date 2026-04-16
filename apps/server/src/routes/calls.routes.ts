import { Router } from "express";
import { requireRoles } from "../middleware/auth.middleware.js";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { mapCall, summarizeTranscript } from "../utils/viewModels.js";
import { callQueue } from "../queues/callQueue.js";
import type { CallJobData } from "../workers/callWorker.js";

export const callRoutes = Router();

callRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const calls = await prisma.call.findMany({
      where: {
        organizationId: req.auth!.organizationId
      },
      include: {
        student: true,
        campaign: true,
        agent: true,
        turns: {
          orderBy: { sequence: "asc" }
        }
      },
      orderBy: { startedAt: "desc" }
    });

    res.json(calls.map(mapCall));
  })
);

callRoutes.get(
  "/:callId",
  asyncHandler(async (req, res) => {
    const callId = String(req.params.callId);

    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        student: true,
        campaign: true,
        agent: true,
        turns: {
          orderBy: { sequence: "asc" }
        }
      }
    });

    if (!call || call.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Call not found." });
      return;
    }

    res.json(mapCall(call));
  })
);

callRoutes.get(
  "/:callId/transcript",
  asyncHandler(async (req, res) => {
    const callId = String(req.params.callId);

    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        turns: {
          orderBy: { sequence: "asc" }
        }
      }
    });

    if (!call || call.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Call not found." });
      return;
    }

    res.json({
      transcriptText: call.transcriptText ?? summarizeTranscript(call.turns),
      turns: call.turns
    });
  })
);

// Fixed: return actual recording URL from DB
callRoutes.get(
  "/:callId/recording",
  asyncHandler(async (req, res) => {
    const callId = String(req.params.callId);

    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: { id: true, organizationId: true, recordingUrl: true }
    });

    if (!call || call.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Call not found." });
      return;
    }

    res.json({ url: call.recordingUrl ?? null, callId });
  })
);

callRoutes.get(
  "/:callId/turns",
  asyncHandler(async (req, res) => {
    const callId = String(req.params.callId);

    const turns = await prisma.callTurn.findMany({
      where: {
        callId,
        call: {
          organizationId: req.auth!.organizationId
        }
      },
      orderBy: { sequence: "asc" }
    });

    res.json(turns);
  })
);

// Fixed: actually re-queue the call through Bull
callRoutes.post(
  "/:callId/redeliver-webhook",
  requireRoles(["admin", "manager"]),
  asyncHandler(async (req, res) => {
    const callId = String(req.params.callId);

    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: { student: true }
    });

    if (!call || call.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Call not found." });
      return;
    }

    if (!call.agentId) {
      res.status(400).json({ message: "Call has no agent assigned — cannot retry." });
      return;
    }

    // Find a from-number for this provider
    const fromNumber = await prisma.phoneNumber.findFirst({
      where: {
        organizationId: call.organizationId,
        provider: call.telephonyProvider,
        isActive: true
      },
      orderBy: { isDefaultOutbound: "desc" }
    });

    if (!fromNumber) {
      res.status(400).json({ message: `No active ${call.telephonyProvider} number found.` });
      return;
    }

    // Reset call status
    await prisma.call.update({
      where: { id: callId },
      data: { status: "queued", errorMessage: null, errorCode: null, endedAt: null }
    });

    const jobData: CallJobData = {
      callId: call.id,
      organizationId: call.organizationId,
      campaignId: call.campaignId ?? undefined,
      studentId: call.studentId ?? undefined,
      agentId: call.agentId,
      to: call.student?.phone ?? call.targetPhone ?? "",
      from: fromNumber.phoneNumber,
      provider: call.telephonyProvider
    };

    await callQueue.add(jobData, {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200
    });

    res.json({ message: `Call ${callId} re-queued successfully.` });
  })
);
