import type { Database } from "@/integrations/supabase/types";

export type AiExtractionRow = Database["public"]["Tables"]["patient_ai_extractions"]["Row"];
export type ExtractionRunStatus = Database["public"]["Enums"]["extraction_run_status"];

export function calculateAge(dateOfBirth: string | null | undefined, fallback?: number | null) {
  if (!dateOfBirth) return fallback ?? null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return fallback ?? null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : (fallback ?? null);
}

export const extractionTone: Record<ExtractionRunStatus, string> = {
  PENDING: "border-muted-foreground/30 bg-muted text-muted-foreground",
  PROCESSING: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  COMPLETED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  FAILED: "border-destructive/40 bg-destructive/10 text-destructive",
};

export const recordStatusTone: Record<string, string> = {
  ACTIVE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  RESOLVED: "border-muted-foreground/30 bg-muted text-muted-foreground",
  IN_REMISSION: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  SUSPECTED: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  DISCONTINUED: "border-muted-foreground/30 bg-muted text-muted-foreground",
  ON_HOLD: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};
