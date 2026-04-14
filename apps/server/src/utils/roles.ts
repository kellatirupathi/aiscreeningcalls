export const ROLE_VALUES = ["admin", "manager", "recruiter", "viewer"] as const;

export type UserRole = (typeof ROLE_VALUES)[number];

export function normalizeRole(role: string | null | undefined): UserRole {
  const value = (role ?? "").toLowerCase();

  if (ROLE_VALUES.includes(value as UserRole)) {
    return value as UserRole;
  }

  return "viewer";
}
