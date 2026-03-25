import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/attendanceResilience";

const READ_TIMEOUT_MS = 12000;

export interface OrgTenantRoleRow {
  role: string;
  tenant_id: string | null;
  created_at?: string | null;
}

export async function resolveOrgTenantIdForUser(
  userId: string,
  options?: { roleRows?: OrgTenantRoleRow[] | null },
): Promise<string | null> {
  const roleRows = options?.roleRows
    ? options.roleRows
    : (
        await withTimeout(
          () =>
            supabase
              .from("user_roles")
              .select("role, tenant_id, created_at")
              .eq("user_id", userId)
              .in("role", ["admin_instansi", "super_admin"])
              .order("created_at", { ascending: false }),
          READ_TIMEOUT_MS,
          "Permintaan role tenant organisasi timeout.",
        )
      ).data;

  const adminRole = roleRows?.find((row) => row.role === "admin_instansi" && row.tenant_id);
  if (adminRole?.tenant_id) return adminRole.tenant_id;

  const { data: employees, error: employeeError } = await withTimeout(
    () =>
      supabase
        .from("employees")
        .select("tenant_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1),
    READ_TIMEOUT_MS,
    "Permintaan tenant pegawai organisasi timeout.",
  );
  if (employeeError) throw employeeError;

  return employees?.[0]?.tenant_id || null;
}

export async function resolveOrgTenantId(): Promise<string | null> {
  const {
    data: { user },
    error: userError,
  } = await withTimeout(
    () => supabase.auth.getUser(),
    READ_TIMEOUT_MS,
    "Permintaan sesi organisasi timeout.",
  );
  if (userError) throw userError;
  if (!user) return null;

  const { data: roleRows, error: roleError } = await withTimeout(
    () =>
      supabase
        .from("user_roles")
        .select("role, tenant_id, created_at")
        .eq("user_id", user.id)
        .in("role", ["admin_instansi", "super_admin"])
        .order("created_at", { ascending: false }),
    READ_TIMEOUT_MS,
    "Permintaan role organisasi timeout.",
  );
  if (roleError) throw roleError;

  return resolveOrgTenantIdForUser(user.id, { roleRows });
}

export async function resolveOrgTenantIdWithQueryOverride(
  queryTenantId: string | null | undefined,
): Promise<string | null> {
  const {
    data: { user },
    error: userError,
  } = await withTimeout(
    () => supabase.auth.getUser(),
    READ_TIMEOUT_MS,
    "Permintaan sesi organisasi timeout.",
  );
  if (userError) throw userError;
  if (!user) return null;

  const { data: roleRows, error: roleError } = await withTimeout(
    () =>
      supabase
        .from("user_roles")
        .select("role, tenant_id, created_at")
        .eq("user_id", user.id)
        .in("role", ["admin_instansi", "super_admin"])
        .order("created_at", { ascending: false }),
    READ_TIMEOUT_MS,
    "Permintaan role organisasi timeout.",
  );
  if (roleError) throw roleError;

  const hasSuperAdminRole = roleRows?.some((row) => row.role === "super_admin") || false;
  if (hasSuperAdminRole && typeof queryTenantId === "string" && queryTenantId.trim().length > 0) {
    return queryTenantId.trim();
  }

  return resolveOrgTenantIdForUser(user.id, { roleRows });
}

export async function getTenantEmployeeIds(tenantId: string): Promise<string[]> {
  const { data, error } = await withTimeout(
    () =>
      supabase
        .from("employees")
        .select("id")
        .eq("tenant_id", tenantId),
    READ_TIMEOUT_MS,
    "Permintaan daftar pegawai tenant timeout.",
  );
  if (error) throw error;
  return (data || []).map((row) => row.id);
}
