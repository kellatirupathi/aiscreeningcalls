import { Router } from "express";
import multer from "multer";
import { requireRoles } from "../middleware/auth.middleware.js";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { mapCall, mapCampaign, mapStudent } from "../utils/viewModels.js";
import { callQueue } from "../queues/callQueue.js";
import type { CallJobData } from "../workers/callWorker.js";

export const campaignRoutes = Router();

// In-memory CSV upload (max 5 MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── List campaigns ───────────────────────────────────────────────────────────
campaignRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: { organizationId: req.auth!.organizationId },
      include: { agent: true, students: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(campaigns.map(mapCampaign));
  })
);

// ─── Create campaign ──────────────────────────────────────────────────────────
campaignRoutes.post(
  "/",
  requireRoles(["admin", "manager", "recruiter"]),
  asyncHandler(async (req, res) => {
    const { name, agentId, telephonyProvider, fromNumber, maxRetries, retryDelayMinutes, callWindowStart, callWindowEnd, timezone } = req.body as Record<string, unknown>;

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

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: req.auth!.organizationId,
        agentId: String(agentId),
        name: String(name),
        telephonyProvider: String(telephonyProvider).toLowerCase(),
        fromNumber: String(fromNumber),
        maxRetries: Number(maxRetries ?? 3),
        retryDelayMinutes: Number(retryDelayMinutes ?? 30),
        callWindowStart: String(callWindowStart ?? "09:00"),
        callWindowEnd: String(callWindowEnd ?? "21:00"),
        timezone: String(timezone ?? "Asia/Kolkata"),
        status: "draft"
      },
      include: { agent: true, students: true }
    });

    res.status(201).json(mapCampaign(campaign));
  })
);

// ─── Get single campaign ──────────────────────────────────────────────────────
campaignRoutes.get(
  "/:campaignId",
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { agent: true, students: true }
    });

    if (!campaign || campaign.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Campaign not found." });
      return;
    }

    res.json(mapCampaign(campaign));
  })
);

// ─── Update campaign ──────────────────────────────────────────────────────────
campaignRoutes.patch(
  "/:campaignId",
  requireRoles(["admin", "manager", "recruiter"]),
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId);
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

    if (!campaign || campaign.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Campaign not found." });
      return;
    }

    if (campaign.status === "active") {
      res.status(400).json({ message: "Cannot edit an active campaign. Pause it first." });
      return;
    }

    const { name, telephonyProvider, fromNumber, maxRetries, retryDelayMinutes, callWindowStart, callWindowEnd, timezone } = req.body as Record<string, unknown>;

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        ...(name ? { name: String(name) } : {}),
        ...(telephonyProvider ? { telephonyProvider: String(telephonyProvider).toLowerCase() } : {}),
        ...(fromNumber ? { fromNumber: String(fromNumber) } : {}),
        ...(maxRetries !== undefined ? { maxRetries: Number(maxRetries) } : {}),
        ...(retryDelayMinutes !== undefined ? { retryDelayMinutes: Number(retryDelayMinutes) } : {}),
        ...(callWindowStart ? { callWindowStart: String(callWindowStart) } : {}),
        ...(callWindowEnd ? { callWindowEnd: String(callWindowEnd) } : {}),
        ...(timezone ? { timezone: String(timezone) } : {})
      },
      include: { agent: true, students: true }
    });

    res.json(mapCampaign(updated));
  })
);

// ─── Delete campaign ──────────────────────────────────────────────────────────
campaignRoutes.delete(
  "/:campaignId",
  requireRoles(["admin", "manager"]),
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId);
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

    if (!campaign || campaign.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Campaign not found." });
      return;
    }

    if (campaign.status === "active") {
      res.status(400).json({ message: "Cannot delete an active campaign. Pause it first." });
      return;
    }

    await prisma.campaign.delete({ where: { id: campaignId } });
    res.status(204).send();
  })
);

// ─── Start campaign ───────────────────────────────────────────────────────────
campaignRoutes.post(
  "/:campaignId/start",
  requireRoles(["admin", "manager", "recruiter"]),
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { students: true }
    });

    if (!campaign || campaign.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Campaign not found." });
      return;
    }

    if (!["draft", "paused"].includes(campaign.status)) {
      res.status(400).json({ message: `Campaign cannot be started from '${campaign.status}' status.` });
      return;
    }

    const pendingStudents = campaign.students.filter((s) => s.latestStatus === "pending");

    if (pendingStudents.length === 0) {
      res.status(400).json({ message: "No pending students to call. Upload students first." });
      return;
    }

    // Activate campaign
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "active" } });

    // Create a Call record and queue a job for each pending student
    let queued = 0;
    for (const student of pendingStudents) {
      const call = await prisma.call.create({
        data: {
          organizationId: req.auth!.organizationId,
          campaignId,
          studentId: student.id,
          agentId: campaign.agentId,
          targetName: student.name,
          targetPhone: student.phone,
          telephonyProvider: campaign.telephonyProvider,
          status: "queued",
          startedAt: new Date()
        }
      });

      const jobData: CallJobData = {
        callId: call.id,
        organizationId: req.auth!.organizationId,
        campaignId,
        studentId: student.id,
        agentId: campaign.agentId,
        to: student.phone,
        from: campaign.fromNumber,
        provider: campaign.telephonyProvider
      };

      await callQueue.add(jobData, {
        attempts: campaign.maxRetries,
        backoff: { type: "fixed", delay: campaign.retryDelayMinutes * 60 * 1000 },
        removeOnComplete: 100,
        removeOnFail: 200
      });

      queued++;
    }

    res.json({ message: `Campaign started. ${queued} call(s) queued.`, queued });
  })
);

// ─── Pause campaign ───────────────────────────────────────────────────────────
campaignRoutes.post(
  "/:campaignId/pause",
  requireRoles(["admin", "manager", "recruiter"]),
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId);
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

    if (!campaign || campaign.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Campaign not found." });
      return;
    }

    if (campaign.status !== "active") {
      res.status(400).json({ message: "Only active campaigns can be paused." });
      return;
    }

    // Pause the Bull queue (stops picking up new jobs, in-flight jobs still complete)
    await callQueue.pause();
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "paused" } });
    res.json({ message: "Campaign paused." });
  })
);

// ─── Resume campaign ──────────────────────────────────────────────────────────
campaignRoutes.post(
  "/:campaignId/resume",
  requireRoles(["admin", "manager", "recruiter"]),
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId);
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { students: true }
    });

    if (!campaign || campaign.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Campaign not found." });
      return;
    }

    if (campaign.status !== "paused") {
      res.status(400).json({ message: "Only paused campaigns can be resumed." });
      return;
    }

    await callQueue.resume();
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "active" } });
    res.json({ message: "Campaign resumed." });
  })
);

// ─── Upload students (CSV or JSON) ────────────────────────────────────────────
campaignRoutes.post(
  "/:campaignId/students/upload",
  requireRoles(["admin", "manager", "recruiter"]),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId);

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Campaign not found." });
      return;
    }

    type StudentInput = { name: string; phone: string; email?: string };
    let studentsData: StudentInput[] = [];

    const file = (req as unknown as { file?: Express.Multer.File }).file;

    if (file) {
      // Parse CSV file
      const csv = file.buffer.toString("utf-8");
      const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      if (lines.length < 2) {
        res.status(400).json({ message: "CSV must have a header row and at least one data row." });
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const nameIdx = headers.indexOf("name");
      const phoneIdx = headers.indexOf("phone");
      const emailIdx = headers.indexOf("email");

      if (nameIdx === -1 || phoneIdx === -1) {
        res.status(400).json({ message: "CSV must contain 'name' and 'phone' columns." });
        return;
      }

      studentsData = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        return {
          name: cols[nameIdx] ?? "",
          phone: cols[phoneIdx] ?? "",
          email: emailIdx >= 0 ? cols[emailIdx] || undefined : undefined
        };
      }).filter((s) => s.name && s.phone);
    } else {
      // Accept JSON body: { students: [{name, phone, email?}] }
      const body = req.body as { students?: StudentInput[] };
      if (!Array.isArray(body.students) || body.students.length === 0) {
        res.status(400).json({ message: "Provide a CSV file or JSON body with a 'students' array." });
        return;
      }
      studentsData = body.students;
    }

    if (studentsData.length === 0) {
      res.status(400).json({ message: "No valid students found in the upload." });
      return;
    }

    const created = await prisma.student.createMany({
      data: studentsData.map((s) => ({
        campaignId,
        name: s.name,
        phone: s.phone,
        email: s.email ?? null,
        latestStatus: "pending"
      }))
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { totalStudents: { increment: created.count } }
    });

    res.json({ message: `${created.count} student(s) uploaded successfully.`, count: created.count });
  })
);

// ─── Get students ─────────────────────────────────────────────────────────────
campaignRoutes.get(
  "/:campaignId/students",
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId);
    const students = await prisma.student.findMany({
      where: {
        campaignId,
        campaign: { organizationId: req.auth!.organizationId }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(students.map(mapStudent));
  })
);

// ─── Get calls ────────────────────────────────────────────────────────────────
campaignRoutes.get(
  "/:campaignId/calls",
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId);
    const calls = await prisma.call.findMany({
      where: { campaignId, organizationId: req.auth!.organizationId },
      include: {
        student: true,
        campaign: true,
        agent: true,
        turns: { orderBy: { sequence: "asc" } }
      },
      orderBy: { startedAt: "desc" }
    });
    res.json(calls.map(mapCall));
  })
);

// ─── Export campaign data ─────────────────────────────────────────────────────
campaignRoutes.get(
  "/:campaignId/export",
  requireRoles(["admin", "manager", "recruiter"]),
  asyncHandler(async (req, res) => {
    const campaignId = String(req.params.campaignId);

    const calls = await prisma.call.findMany({
      where: { campaignId, organizationId: req.auth!.organizationId },
      include: {
        student: true,
        turns: { orderBy: { sequence: "asc" } }
      },
      orderBy: { startedAt: "desc" }
    });

    const rows = calls.map((call) => ({
      studentName: call.student?.name ?? "",
      phone: call.student?.phone ?? "",
      status: call.status,
      duration: call.durationSeconds ?? 0,
      startedAt: call.startedAt.toISOString(),
      summary: call.summaryText ?? "",
      transcript: call.turns.map((t) => `${t.speaker}: ${t.text}`).join(" | "),
      extractedData: call.extractedDataJson ? JSON.stringify(call.extractedDataJson) : ""
    }));

    const headers = ["studentName", "phone", "status", "duration", "startedAt", "summary", "transcript", "extractedData"];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => `"${String(r[h as keyof typeof r]).replace(/"/g, '""')}"`).join(",")
      )
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaignId}.csv"`);
    res.send(csv);
  })
);
