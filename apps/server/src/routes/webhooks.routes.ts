import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";
import { S3StorageService } from "../services/storage/S3StorageService.js";
import { createTelephonyProvider } from "../services/telephony/TelephonyFactory.js";
import type { TelephonyProvider } from "@screening/shared";

export const webhookRoutes = Router();
const s3 = new S3StorageService();

// ─────────────────────────────────────────────────────────────────────────────
// PLIVO — Answer URL
// Plivo GETs this when a candidate answers the call.
// We return Plivo XML that starts the bidirectional media stream.
// ─────────────────────────────────────────────────────────────────────────────
webhookRoutes.get(
  "/plivo/answer/:callId",
  asyncHandler(async (req, res) => {
    const callId = String(req.params.callId);

    // Derive WebSocket URL from SERVER_URL (http→ws, https→wss)
    const wsUrl = env.SERVER_URL.replace(/^http/, "ws");
    const mediaStreamUrl = `${wsUrl}/ws/media/${callId}`;

    // Return Plivo XML — starts bidirectional mulaw 8kHz audio stream
    // keepCallAlive="true" prevents Plivo from hanging up after XML execution
    res.setHeader("Content-Type", "application/xml");
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<Response>\n` +
        `  <Stream streamTimeout="86400" keepCallAlive="true" bidirectional="true" contentType="audio/x-mulaw;rate=8000">\n` +
        `    ${mediaStreamUrl}\n` +
        `  </Stream>\n` +
        `</Response>`
    );
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PLIVO — Call status webhook
// Plivo POSTs to this when a call status changes (answered, completed, etc.)
// ─────────────────────────────────────────────────────────────────────────────
webhookRoutes.post(
  "/plivo/status",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, string>;
    const providerCallId = body.CallUUID ?? body.RequestUUID;
    const plivoStatus = body.CallStatus ?? body.Status ?? "";
    const duration = parseInt(body.Duration ?? "0", 10);
    const answeredTime = body.AnsweredTime ? new Date(parseInt(body.AnsweredTime) * 1000) : undefined;
    const endTime = body.EndTime ? new Date(parseInt(body.EndTime) * 1000) : new Date();

    if (!providerCallId) {
      res.json({ accepted: true });
      return;
    }

    const statusMap: Record<string, string> = {
      answered: "in-progress",
      "in-progress": "in-progress",
      completed: "completed",
      busy: "busy",
      failed: "failed",
      "no-answer": "no-answer",
      canceled: "failed",
      ringing: "ringing"
    };
    const normalizedStatus = statusMap[plivoStatus.toLowerCase()] ?? "failed";

    const call = await prisma.call.findFirst({
      where: { providerCallId }
    });

    if (!call) {
      res.json({ accepted: true });
      return;
    }

    const isTerminal = ["completed", "busy", "failed", "no-answer"].includes(normalizedStatus);

    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: normalizedStatus,
        ...(duration > 0 ? { durationSeconds: duration } : {}),
        ...(answeredTime ? { answeredAt: answeredTime } : {}),
        ...(isTerminal ? { endedAt: endTime } : {})
      }
    });

    // Update student status on terminal events
    if (isTerminal && call.studentId) {
      await prisma.student.update({
        where: { id: call.studentId },
        data: { latestStatus: normalizedStatus, lastCalledAt: endTime }
      });
    }

    res.json({ accepted: true });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PLIVO — Recording webhook
// Plivo POSTs recording details after the call ends.
// ─────────────────────────────────────────────────────────────────────────────
webhookRoutes.post(
  "/plivo/recording",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, string>;
    const providerCallId = body.CallUUID;
    const recordingUrl = body.RecordingUrl;

    if (!providerCallId || !recordingUrl) {
      res.json({ accepted: true });
      return;
    }

    const call = await prisma.call.findFirst({ where: { providerCallId } });
    if (!call) {
      res.json({ accepted: true });
      return;
    }

    let finalUrl = recordingUrl;

    // Upload to S3 if configured
    if (env.AWS_BUCKET_NAME && env.AWS_ACCESS_KEY_ID) {
      try {
        finalUrl = await s3.uploadRecordingFromUrl(call.id, recordingUrl);
      } catch (err) {
        console.error("[webhook/plivo/recording] S3 upload failed:", (err as Error).message);
        // Fall back to Plivo URL
      }
    }

    await prisma.call.update({
      where: { id: call.id },
      data: { recordingUrl: finalUrl }
    });

    res.json({ accepted: true });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// EXOTEL — Status webhook
// ─────────────────────────────────────────────────────────────────────────────
webhookRoutes.post(
  "/exotel/status",
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, string>;
    const providerCallId = body.CallSid;
    const exotelStatus = body.Status ?? body.CallStatus ?? "";
    const duration = parseInt(body.ConversationDuration ?? body.Duration ?? "0", 10);
    const customField = body.CustomField; // our callId stored in CustomField

    if (!providerCallId && !customField) {
      res.json({ accepted: true });
      return;
    }

    const statusMap: Record<string, string> = {
      completed: "completed",
      "no-answer": "no-answer",
      busy: "busy",
      failed: "failed",
      canceled: "failed",
      "in-progress": "in-progress"
    };
    const normalizedStatus = statusMap[exotelStatus.toLowerCase()] ?? "failed";

    // Look up by our callId (in CustomField) or providerCallId
    const call = await prisma.call.findFirst({
      where: {
        OR: [
          ...(providerCallId ? [{ providerCallId }] : []),
          ...(customField ? [{ id: customField }] : [])
        ]
      }
    });

    if (!call) {
      res.json({ accepted: true });
      return;
    }

    const isTerminal = ["completed", "busy", "failed", "no-answer"].includes(normalizedStatus);

    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: normalizedStatus,
        providerCallId: providerCallId ?? call.providerCallId,
        ...(duration > 0 ? { durationSeconds: duration } : {}),
        ...(isTerminal ? { endedAt: new Date() } : {})
      }
    });

    if (isTerminal && call.studentId) {
      await prisma.student.update({
        where: { id: call.studentId },
        data: { latestStatus: normalizedStatus, lastCalledAt: new Date() }
      });
    }

    // Fetch and upload recording if call completed
    if (normalizedStatus === "completed" && call.telephonyProvider === "exotel") {
      void (async () => {
        try {
          const provider = createTelephonyProvider(call.telephonyProvider as TelephonyProvider);
          const { recordingUrl } = await provider.fetchRecording(providerCallId ?? "");
          if (recordingUrl) {
            let finalUrl = recordingUrl;
            if (env.AWS_BUCKET_NAME && env.AWS_ACCESS_KEY_ID) {
              finalUrl = await s3.uploadRecordingFromUrl(call.id, recordingUrl);
            }
            await prisma.call.update({
              where: { id: call.id },
              data: { recordingUrl: finalUrl }
            });
          }
        } catch (err) {
          console.error("[webhook/exotel/status] Recording fetch failed:", (err as Error).message);
        }
      })();
    }

    res.json({ accepted: true });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// EXOTEL — Passthrough webhook
// ─────────────────────────────────────────────────────────────────────────────
webhookRoutes.post("/exotel/passthrough", (_req, res) => {
  res.json({ accepted: true, provider: "exotel", type: "passthrough" });
});
