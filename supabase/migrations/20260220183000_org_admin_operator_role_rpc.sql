-- Secure RPC for organization admin to manage operator/admin role mapping
-- while keeping direct table writes protected by RLS.

CREATE OR REPLACE FUNCTION public.org_list_admin_operator_members()
RETURNS TABLE (
  role_id uuid,
  user_id uuid,
  role public.app_role,
  created_at timestamptz,
  employee_name text,
  employee_email text,
  employee_nik text,
  employee_is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role(v_uid, 'admin_instansi'::public.app_role) AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_tenant_id := public.get_user_tenant_id(v_uid);
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant tidak ditemukan';
  END IF;

  RETURN QUERY
  SELECT
    ur.id AS role_id,
    ur.user_id,
    ur.role,
    ur.created_at,
    COALESCE(e.name, 'User ' || LEFT(ur.user_id::text, 8)) AS employee_name,
    COALESCE(e.email, '-') AS employee_email,
    COALESCE(e.nik, '-') AS employee_nik,
    COALESCE(e.is_active, true) AS employee_is_active
  FROM public.user_roles ur
  LEFT JOIN public.employees e
    ON e.user_id = ur.user_id
   AND e.tenant_id = ur.tenant_id
  WHERE ur.tenant_id = v_tenant_id
    AND ur.role IN ('admin_instansi'::public.app_role, 'atasan'::public.app_role)
  ORDER BY ur.created_at ASC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.org_update_admin_operator_role(
  _role_id uuid,
  _target_role public.app_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
  v_current_role public.app_role;
  v_admin_count bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role(v_uid, 'admin_instansi'::public.app_role) AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _target_role NOT IN ('admin_instansi'::public.app_role, 'atasan'::public.app_role) THEN
    RAISE EXCEPTION 'Role tujuan tidak valid';
  END IF;

  v_tenant_id := public.get_user_tenant_id(v_uid);
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant tidak ditemukan';
  END IF;

  SELECT ur.role
    INTO v_current_role
  FROM public.user_roles ur
  WHERE ur.id = _role_id
    AND ur.tenant_id = v_tenant_id
    AND ur.role IN ('admin_instansi'::public.app_role, 'atasan'::public.app_role)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data role tidak ditemukan';
  END IF;

  IF v_current_role = _target_role THEN
    RETURN;
  END IF;

  IF v_current_role = 'admin_instansi'::public.app_role AND _target_role = 'atasan'::public.app_role THEN
    SELECT COUNT(*)
      INTO v_admin_count
    FROM public.user_roles ur
    WHERE ur.tenant_id = v_tenant_id
      AND ur.role = 'admin_instansi'::public.app_role;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Minimal harus ada 1 Admin Organisasi aktif';
    END IF;
  END IF;

  UPDATE public.user_roles
     SET role = _target_role
   WHERE id = _role_id
     AND tenant_id = v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_list_admin_operator_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_update_admin_operator_role(uuid, public.app_role) TO authenticated;
