import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDuration, mapCall, mapCampaign } from "../utils/viewModels.js";

export const dashboardRoutes = Router();

dashboardRoutes.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;

    const [calls, campaigns] = await Promise.all([
      prisma.call.findMany({
        where: { organizationId },
        include: {
          student: true,
          campaign: true,
          agent: true,
          turns: {
            orderBy: { sequence: "asc" }
          }
        },
        orderBy: { startedAt: "desc" }
      }),
      prisma.campaign.findMany({
        where: { organizationId },
        include: {
          agent: true,
          students: true
        },
        orderBy: { createdAt: "desc" }
      })
    ]);

    const completedCalls = calls.filter((call: { status: string }) => call.status === "completed");
    const totalDuration = completedCalls.reduce(
      (sum: number, call: { durationSeconds: number | null }) => sum + (call.durationSeconds ?? 0),
      0
    );
    const totalCost = calls.reduce(
      (sum: number, call: { costEstimate: number | null }) => sum + (call.costEstimate ?? 0),
      0
    );
    const averageDuration = completedCalls.length === 0 ? null : Math.round(totalDuration / completedCalls.length);
    const callsThisWeek = calls.filter(
      (call: { startedAt: Date }) => Date.now() - call.startedAt.getTime() <= 7 * 24 * 60 * 60 * 1000
    );

    const callVolume = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (6 - index));

      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      return {
        day: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(day),
        value: calls.filter((call: { startedAt: Date }) => call.startedAt >= day && call.startedAt < nextDay).length
      };
    });

    res.json({
      stats: [
        {
          label: "Total Calls",
          value: calls.length.toLocaleString("en-IN"),
          change: `${completedCalls.length.toLocaleString("en-IN")} completed`
        },
        {
          label: "Completion Rate",
          value: calls.length === 0 ? "0%" : `${Math.round((completedCalls.length / calls.length) * 100)}%`,
          change: `${campaigns.filter((campaign: { status: string }) => campaign.status === "running").length} active campaigns`
        },
        {
          label: "Avg Duration",
          value: formatDuration(averageDuration),
          change: "Across completed calls"
        },
        {
          label: "Calls This Week",
          value: callsThisWeek.length.toLocaleString("en-IN"),
          change: "Rolling 7 day window"
        }
      ],
      totalCost,
      callVolume,
      activeCampaigns: campaigns.slice(0, 5).map(mapCampaign),
      recentCalls: calls.slice(0, 8).map(mapCall)
    });
  })
);

dashboardRoutes.get(
  "/call-volume",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;

    const calls = await prisma.call.findMany({
      where: { organizationId },
      select: { startedAt: true }
    });

    const data = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (6 - index));

      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      return {
        day: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(day),
        value: calls.filter((call: { startedAt: Date }) => call.startedAt >= day && call.startedAt < nextDay).length
      };
    });

    res.json(data);
  })
);

dashboardRoutes.get(
  "/status-breakdown",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;

    const calls = await prisma.call.findMany({
      where: { organizationId },
      select: { status: true }
    });

    res.json({
      completed: calls.filter((call: { status: string }) => call.status === "completed").length,
      noAnswer: calls.filter((call: { status: string }) => call.status === "no-answer").length,
      failed: calls.filter((call: { status: string }) => call.status === "failed").length
    });
  })
);

dashboardRoutes.get(
  "/recent-calls",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;

    const calls = await prisma.call.findMany({
      where: { organizationId },
      include: {
        student: true,
        campaign: true,
        agent: true,
        turns: {
          orderBy: { sequence: "asc" }
        }
      },
      orderBy: { startedAt: "desc" },
      take: 8
    });

    res.json(calls.map(mapCall));
  })
);
