import jwt from "jsonwebtoken";
import type { UserRole } from "./roles.js";
import { env } from "../config/env.js";

export interface AuthTokenPayload {
  userId: string;
  organizationId: string;
  role: UserRole;
}

export function signAuthToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "7d"
  });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
