import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/auth.js";
import { normalizeRole, type UserRole } from "../utils/roles.js";

function readBearerToken(request: Request) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = readBearerToken(req);

  if (!token) {
    res.status(401).json({ message: "Authentication required." });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    req.auth = {
      ...payload,
      role: normalizeRole(payload.role)
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired session." });
  }
}

export function requireRoles(allowedRoles: UserRole[]) {
  return function roleMiddleware(req: Request, res: Response, next: NextFunction) {
    const role = normalizeRole(req.auth?.role);

    if (!allowedRoles.includes(role)) {
      res.status(403).json({ message: "You do not have permission to access this resource." });
      return;
    }

    next();
  };
}
