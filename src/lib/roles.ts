export type AppRole = "RESEARCHER" | "CLINICAL_COORDINATOR" | "ADMIN";

export const APP_ROLES: AppRole[] = ["RESEARCHER", "CLINICAL_COORDINATOR", "ADMIN"];

/** Roles a user may pick for themselves. ADMIN is never self-assignable. */
export const SELF_ASSIGNABLE_ROLES: AppRole[] = ["RESEARCHER", "CLINICAL_COORDINATOR"];

export const roleLabels: Record<AppRole, string> = {
  RESEARCHER: "Researcher",
  CLINICAL_COORDINATOR: "Clinical Coordinator",
  ADMIN: "Administrator",
};

export const roleDescriptions: Record<AppRole, string> = {
  RESEARCHER:
    "Find and screen patients for clinical trials, review extracted records, and analyze trial matches.",
  CLINICAL_COORDINATOR:
    "Manage patient records, clinical trial workflows, documents, compliance, and screening activities.",
  ADMIN: "Manage users, roles, system settings, and overall application administration.",
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as string[]).includes(value);
}

/** Highest-privilege role for display purposes. */
export function primaryRole(roles: AppRole[] | undefined | null): AppRole | null {
  if (!roles || roles.length === 0) return null;
  if (roles.includes("ADMIN")) return "ADMIN";
  if (roles.includes("CLINICAL_COORDINATOR")) return "CLINICAL_COORDINATOR";
  return roles[0] ?? null;
}
