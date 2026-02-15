import { supabase } from "@/integrations/supabase/client";

export async function resolveOrgTenantId(): Promise<string | null> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return null;

  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", user.id)
    .in("role", ["admin_instansi", "super_admin"]);
  if (roleError) throw roleError;

  const adminRole = roles?.find((row) => row.role === "admin_instansi" && row.tenant_id);
  if (adminRole?.tenant_id) return adminRole.tenant_id;

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (employeeError) throw employeeError;

  return employee?.tenant_id || null;
}

export async function getTenantEmployeeIds(tenantId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return (data || []).map((row) => row.id);
}

