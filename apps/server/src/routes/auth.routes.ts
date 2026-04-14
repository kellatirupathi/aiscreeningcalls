import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signAuthToken } from "../utils/auth.js";
import { normalizeRole } from "../utils/roles.js";
import { env } from "../config/env.js";
import { z } from "zod";

export const authRoutes = Router();

const registerSchema = z.object({
  organizationName: z.string().trim().min(2),
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

function slugifyOrganizationName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function createUniqueOrganizationSlug(name: string) {
  const baseSlug = slugifyOrganizationName(name) || "workspace";
  let slug = baseSlug;
  let counter = 2;

  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

function selectUserWithOrganization() {
  return {
    id: true,
    name: true,
    email: true,
    role: true,
    isActive: true,
    organizationId: true,
    organization: {
      select: {
        id: true,
        name: true,
        slug: true,
        _count: {
          select: {
            users: true
          }
        }
      }
    }
  } as const;
}

authRoutes.post(
  "/register",
  asyncHandler(async (req, res) => {
    const payload = registerSchema.parse(req.body);
    const email = payload.email.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existingUser) {
      res.status(409).json({ message: "An account with this email already exists." });
      return;
    }

    const organizationSlug = await createUniqueOrganizationSlug(payload.organizationName);
    const passwordHash = await bcrypt.hash(payload.password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: payload.organizationName,
          slug: organizationSlug
        }
      });

      // Seed default phone numbers from env
      if (env.PLIVO_DEFAULT_NUMBER) {
        await tx.phoneNumber.create({
          data: {
            organizationId: organization.id,
            provider: "plivo",
            phoneNumber: env.PLIVO_DEFAULT_NUMBER,
            label: "Plivo Default",
            isActive: true,
            isDefaultOutbound: true
          }
        });
      }

      if (env.EXOTEL_DEFAULT_NUMBER) {
        await tx.phoneNumber.create({
          data: {
            organizationId: organization.id,
            provider: "exotel",
            phoneNumber: env.EXOTEL_DEFAULT_NUMBER,
            label: "Exotel Default",
            isActive: true,
            isDefaultOutbound: !env.PLIVO_DEFAULT_NUMBER
          }
        });
      }

      return tx.user.create({
        data: {
          organizationId: organization.id,
          name: payload.name,
          email,
          passwordHash,
          role: "admin"
        },
        select: selectUserWithOrganization()
      });
    });

    const token = signAuthToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: normalizeRole(user.role)
    });

    res.status(201).json({
      token,
      user: {
        ...user,
        role: normalizeRole(user.role)
      }
    });
  })
);

authRoutes.post(
  "/login",
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const email = payload.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email },
      select: selectUserWithOrganization()
    });

    if (!user || !user.isActive) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        passwordHash: true
      }
    });

    const isValidPassword = userRecord?.passwordHash
      ? await bcrypt.compare(payload.password, userRecord.passwordHash)
      : false;

    if (!isValidPassword) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const token = signAuthToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: normalizeRole(user.role)
    });

    res.json({
      token,
      user: {
        ...user,
        role: normalizeRole(user.role)
      }
    });
  })
);

authRoutes.post("/logout", (_req, res) => {
  res.status(204).send();
});

authRoutes.get(
  "/me",
  authMiddleware,
  asyncHandler(async (_req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: _req.auth?.userId ?? "" },
      select: selectUserWithOrganization()
    });

    if (!user || !user.isActive) {
      res.status(401).json({ message: "Session not found." });
      return;
    }

    res.json({
      ...user,
      role: normalizeRole(user.role)
    });
  })
);
