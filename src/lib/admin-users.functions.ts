import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APP_ROLES, SELF_ASSIGNABLE_ROLES, type AppRole } from "@/lib/roles";

export type ManagedUser = {
  id: string;
  fullName: string | null;
  email: string | null;
  organization: string | null;
  role: AppRole | null;
  isActive: boolean;
  createdAt: string;
};

/** Roles are read through the caller's own session — never trusted from the client. */
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const isAdmin = (data ?? []).some((r: { role: string }) => r.role === "ADMIN");
  if (!isAdmin) throw new Error("Forbidden: administrator access required");
}

/** Roles of the signed-in user, resolved server-side. */
export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { userId: context.userId, roles: (data ?? []).map((r) => r.role as AppRole) };
  });

/** First-time (e.g. Google) users pick a non-privileged role once. */
export const completeProfileRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { role: string; fullName?: string | null }) => {
    if (!SELF_ASSIGNABLE_ROLES.includes(input?.role as AppRole)) {
      throw new Error("Please select Researcher or Clinical Coordinator");
    }
    return { role: input.role as AppRole, fullName: input.fullName?.trim() || null };
  })
  .handler(async ({ data, context }) => {
    const { data: existing, error: readError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (readError) throw new Error(readError.message);
    if ((existing ?? []).length > 0) {
      return { role: (existing![0] as { role: AppRole }).role, alreadySet: true };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: data.role });
    if (error) throw new Error(error.message);

    if (data.fullName) {
      await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.fullName })
        .eq("id", context.userId);
    }
    return { role: data.role, alreadySet: false };
  });

/** Admin-only: list every account with its role and status. */
export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, organization, is_active, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);

    const roleByUser = new Map<string, AppRole>();
    for (const row of roles ?? []) {
      const current = roleByUser.get(row.user_id);
      if (!current || row.role === "ADMIN") roleByUser.set(row.user_id, row.role as AppRole);
    }

    return (profiles ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      organization: p.organization,
      role: roleByUser.get(p.id) ?? null,
      isActive: (p as { is_active?: boolean }).is_active ?? true,
      createdAt: p.created_at,
    }));
  });

/** Admin-only: set a user's role (replaces any existing role). */
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: string }) => {
    if (!input?.userId) throw new Error("A user is required");
    if (!APP_ROLES.includes(input.role as AppRole)) throw new Error("Unknown role");
    return { userId: input.userId, role: input.role as AppRole };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && data.role !== "ADMIN") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "ADMIN");
      if ((count ?? 0) <= 1) throw new Error("You are the only administrator — assign another first");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (delError) throw new Error(delError.message);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin-only: activate or deactivate an account. */
export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; isActive: boolean }) => {
    if (!input?.userId) throw new Error("A user is required");
    return { userId: input.userId, isActive: Boolean(input.isActive) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && !data.isActive) {
      throw new Error("You cannot deactivate your own account");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.isActive })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
