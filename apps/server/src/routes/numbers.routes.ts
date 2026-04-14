import { Router } from "express";
import { requireRoles } from "../middleware/auth.middleware.js";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { mapPhoneNumber } from "../utils/viewModels.js";

export const numberRoutes = Router();

function readString(value: unknown, fallback = "") {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return fallback;
  }

  return String(value);
}

function readTrimmedString(value: unknown, fallback = "") {
  const nextValue = readString(value, fallback).trim();
  return nextValue || fallback;
}

function readNullableString(value: unknown) {
  const nextValue = readString(value).trim();
  return nextValue ? nextValue : null;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return fallback;
}

numberRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const [numbers, agents] = await Promise.all([
      prisma.phoneNumber.findMany({
        where: {
          organizationId: req.auth!.organizationId
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.agent.findMany({
        where: {
          organizationId: req.auth!.organizationId
        },
        select: { id: true, name: true }
      })
    ]);

    const agentNames = new Map<string, string>(
      agents.map((agent: { id: string; name: string }) => [agent.id, agent.name] as const)
    );

    res.json(
      numbers.map((number: Parameters<typeof mapPhoneNumber>[0]) =>
        mapPhoneNumber(number, agentNames.get(number.assignedAgentId ?? ""))
      )
    );
  })
);

numberRoutes.post(
  "/",
  requireRoles(["admin", "manager"]),
  asyncHandler(async (req, res) => {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const phoneNumber = readTrimmedString(payload.phoneNumber, "");

    if (!phoneNumber) {
      res.status(400).json({ message: "Phone number is required." });
      return;
    }

    const number = await prisma.phoneNumber.create({
      data: {
        organizationId: req.auth!.organizationId,
        provider: readTrimmedString(payload.provider, "plivo").toLowerCase(),
        phoneNumber,
        label: readTrimmedString(payload.label, phoneNumber),
        isActive: readBoolean(payload.isActive, true),
        isDefaultOutbound: readBoolean(payload.isDefaultOutbound, false),
        assignedAgentId: readNullableString(payload.assignedAgentId)
      }
    });

    res.status(201).json(mapPhoneNumber(number));
  })
);

numberRoutes.patch(
  "/:numberId",
  requireRoles(["admin", "manager"]),
  asyncHandler(async (req, res) => {
    const numberId = String(req.params.numberId);
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const existingNumber = await prisma.phoneNumber.findUnique({
      where: { id: numberId }
    });

    if (!existingNumber || existingNumber.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Number not found." });
      return;
    }

    const assignedAgentId = readNullableString(payload.assignedAgentId);

    if (assignedAgentId) {
      const agent = await prisma.agent.findUnique({
        where: { id: assignedAgentId }
      });

      if (!agent || agent.organizationId !== req.auth!.organizationId) {
        res.status(400).json({ message: "Assigned agent is not valid for this workspace." });
        return;
      }
    }

    const number = await prisma.phoneNumber.update({
      where: { id: numberId },
      data: {
        provider: readTrimmedString(payload.provider, existingNumber.provider).toLowerCase(),
        phoneNumber: readTrimmedString(payload.phoneNumber, existingNumber.phoneNumber),
        label: readTrimmedString(payload.label, existingNumber.label),
        isActive: readBoolean(payload.isActive, existingNumber.isActive),
        isDefaultOutbound: readBoolean(payload.isDefaultOutbound, existingNumber.isDefaultOutbound),
        assignedAgentId
      }
    });

    const assignedAgentName = assignedAgentId
      ? (
          await prisma.agent.findUnique({
            where: { id: assignedAgentId },
            select: { name: true }
          })
        )?.name
      : undefined;

    res.json(mapPhoneNumber(number, assignedAgentName));
  })
);

numberRoutes.delete(
  "/:numberId",
  requireRoles(["admin"]),
  asyncHandler(async (req, res) => {
    const numberId = String(req.params.numberId);
    const number = await prisma.phoneNumber.findUnique({
      where: { id: numberId }
    });

    if (!number || number.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Number not found." });
      return;
    }

    await prisma.phoneNumber.delete({
      where: { id: numberId }
    });

    res.status(204).send();
  })
);
