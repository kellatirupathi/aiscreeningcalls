import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDuration, mapCall, mapCampaign } from "../utils/viewModels.js";

export const dashboardRoutes = Router();

dashboardRoutes.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth!.organizationId;

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalCalls, completedCount, weekCalls, campaigns, recentCalls] = await Promise.all([
      prisma.call.count({ where: { organizationId } }),
      prisma.call.count({ where: { organizationId, status: "completed" } }),
      prisma.call.count({ where: { organizationId, startedAt: { gte: oneWeekAgo } } }),
      prisma.campaign.findMany({
        where: { organizationId },
        include: { agent: true, students: true },
        orderBy: { createdAt: "desc" },
        take: 5
      }),
      prisma.call.findMany({
        where: { organizationId },
        include: { student: true, campaign: true, agent: true, turns: { orderBy: { sequence: "asc" } } },
        orderBy: { startedAt: "desc" },
        take: 8
      })
    ]);

    // Avg duration: aggregate only completed calls (bounded query)
    const completedCalls = await prisma.call.findMany({
      where: { organizationId, status: "completed", durationSeconds: { not: null } },
      select: { durationSeconds: true, costEstimate: true },
      take: 1000
    });
    const totalDuration = completedCalls.reduce((s, c) => s + (c.durationSeconds ?? 0), 0);
    const totalCost = completedCalls.reduce((s, c) => s + (c.costEstimate ?? 0), 0);
    const averageDuration = completedCalls.length === 0 ? null : Math.round(totalDuration / completedCalls.length);

    // Call volume: use DB counts per day (bounded)
    const volumeCalls = await prisma.call.findMany({
      where: { organizationId, startedAt: { gte: oneWeekAgo } },
      select: { startedAt: true }
    });
    const callVolume = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (6 - index));
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      return {
        day: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(day),
        value: volumeCalls.filter((c) => c.startedAt >= day && c.startedAt < nextDay).length
      };
    });

    const activeCampaignCount = campaigns.filter((c) => c.status === "running").length;

    res.json({
      stats: [
        {
          label: "Total Calls",
          value: totalCalls.toLocaleString("en-IN"),
          change: `${completedCount.toLocaleString("en-IN")} completed`
        },
        {
          label: "Completion Rate",
          value: totalCalls === 0 ? "0%" : `${Math.round((completedCount / totalCalls) * 100)}%`,
          change: `${activeCampaignCount} active campaigns`
        },
        {
          label: "Avg Duration",
          value: formatDuration(averageDuration),
          change: "Across completed calls"
        },
        {
          label: "Calls This Week",
          value: weekCalls.toLocaleString("en-IN"),
          change: "Rolling 7 day window"
        }
      ],
      totalCost,
      callVolume,
      activeCampaigns: campaigns.map(mapCampaign),
      recentCalls: recentCalls.map(mapCall)
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
