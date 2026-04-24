import { Router } from "express";
import { requireRoles } from "../middleware/auth.middleware.js";
import { prisma } from "../db/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { seedSarvamVoicesForOrganization } from "../services/voices/SarvamVoiceSeeder.js";

export const voiceRoutes = Router();

// List all voices for the org
voiceRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const orgId = req.auth!.organizationId;

    // Lazy auto-seed: if this org has no Sarvam voices yet, create the
    // standard speaker set so the agent's Voice dropdown is populated
    // without the user manually adding each one.
    try {
      await seedSarvamVoicesForOrganization(orgId);
    } catch (err) {
      console.error("[voices] Sarvam voice seed failed:", (err as Error).message);
      // Don't block listing — continue with whatever voices already exist
    }

    const voices = await prisma.voice.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" }
    });
    res.json(voices);
  })
);

// Create a voice
voiceRoutes.post(
  "/",
  requireRoles(["admin", "manager"]),
  asyncHandler(async (req, res) => {
    const { name, provider, voiceId, language, gender, description, isDefault } = req.body as Record<string, unknown>;

    if (!name || !voiceId) {
      res.status(400).json({ message: "name and voiceId are required." });
      return;
    }

    // If marking as default, unset other defaults for same provider
    if (isDefault) {
      await prisma.voice.updateMany({
        where: {
          organizationId: req.auth!.organizationId,
          provider: String(provider || "cartesia").toLowerCase(),
          isDefault: true
        },
        data: { isDefault: false }
      });
    }

    const voice = await prisma.voice.create({
      data: {
        organizationId: req.auth!.organizationId,
        name: String(name).trim(),
        provider: String(provider || "cartesia").toLowerCase(),
        voiceId: String(voiceId).trim(),
        language: String(language || "en"),
        gender: gender ? String(gender).trim() : null,
        description: description ? String(description).trim() : null,
        isDefault: Boolean(isDefault)
      }
    });

    res.status(201).json(voice);
  })
);

// Update a voice
voiceRoutes.patch(
  "/:id",
  requireRoles(["admin", "manager"]),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.voice.findUnique({ where: { id } });

    if (!existing || existing.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Voice not found." });
      return;
    }

    const { name, voiceId, language, gender, description, isDefault } = req.body as Record<string, unknown>;

    if (isDefault) {
      await prisma.voice.updateMany({
        where: {
          organizationId: req.auth!.organizationId,
          provider: existing.provider,
          isDefault: true,
          id: { not: id }
        },
        data: { isDefault: false }
      });
    }

    const voice = await prisma.voice.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(voiceId !== undefined ? { voiceId: String(voiceId).trim() } : {}),
        ...(language !== undefined ? { language: String(language) } : {}),
        ...(gender !== undefined ? { gender: gender ? String(gender).trim() : null } : {}),
        ...(description !== undefined ? { description: description ? String(description).trim() : null } : {}),
        ...(isDefault !== undefined ? { isDefault: Boolean(isDefault) } : {})
      }
    });

    res.json(voice);
  })
);

// Delete a voice
voiceRoutes.delete(
  "/:id",
  requireRoles(["admin"]),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.voice.findUnique({ where: { id } });

    if (!existing || existing.organizationId !== req.auth!.organizationId) {
      res.status(404).json({ message: "Voice not found." });
      return;
    }

    await prisma.voice.delete({ where: { id } });
    res.status(204).send();
  })
);
