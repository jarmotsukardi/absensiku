import { supabase } from "@/integrations/supabase/client";

export type HrEssSessionEmployee = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  name: string;
  email: string | null;
  nik: string | null;
  nip: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  position: string | null;
  gender: string | null;
  golongan: string | null;
  employee_category: string | null;
  is_active: boolean | null;
  joined_date: string | null;
  office_id: string | null;
  opd_id: string | null;
  work_unit_id: string | null;
  offices?: {
    id?: string | null;
    name?: string | null;
    address?: string | null;
    work_start_time?: string | null;
    work_end_time?: string | null;
  } | null;
  opd?: {
    id?: string | null;
    name?: string | null;
    code?: string | null;
  } | null;
  work_unit?: {
    id?: string | null;
    name?: string | null;
  } | null;
};

type EmployeeRow = HrEssSessionEmployee;

export async function resolveHrEssSessionEmployee(tenantId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user ?? null;
  if (!user) {
    return {
      user: null,
      employee: null,
    };
  }

  const employeeSelect = `
    id,
    tenant_id,
    user_id,
    name,
    email,
    nik,
    nip,
    phone,
    whatsapp,
    address,
    position,
    gender,
    golongan,
    employee_category,
    is_active,
    joined_date:created_at,
    office_id,
    opd_id,
    work_unit_id,
    offices:office_id (id, name, address, work_start_time, work_end_time),
    opd:opd_id (id, name, code),
    work_unit:work_unit_id (id, name)
  `;

  const { data: byUserData, error: byUserError } = await supabase
    .from("employees")
    .select(employeeSelect)
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .limit(1);

  if (byUserError) throw byUserError;

  const byUserEmployee = ((byUserData || [])[0] || null) as EmployeeRow | null;
  if (byUserEmployee) {
    return {
      user,
      employee: byUserEmployee,
    };
  }

  if (!user.email) {
    return {
      user,
      employee: null,
    };
  }

  const { data: byEmailData, error: byEmailError } = await supabase
    .from("employees")
    .select(employeeSelect)
    .eq("tenant_id", tenantId)
    .ilike("email", user.email)
    .limit(1);

  if (byEmailError) throw byEmailError;

  return {
    user,
    employee: (((byEmailData || [])[0] || null) as EmployeeRow | null),
  };
}
