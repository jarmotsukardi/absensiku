CREATE OR REPLACE FUNCTION public.update_org_hr_employee_status(
  p_tenant_id UUID,
  p_employee_id UUID,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  employee_id UUID,
  audit_id UUID,
  action TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_actor_tenant_id UUID;
  v_existing public.employees%ROWTYPE;
  v_employee_category TEXT;
  v_is_active BOOLEAN;
  v_effective_date DATE;
  v_reason TEXT;
  v_audit_id UUID;
  v_action TEXT := 'employee_status_update';
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant wajib diisi';
  END IF;
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'Pegawai wajib diisi';
  END IF;

  v_actor_tenant_id := public.get_user_tenant_id(v_user_id);
  IF NOT (
    public.is_super_admin(v_user_id)
    OR (
      public.has_role(v_user_id, 'admin_instansi'::public.app_role)
      AND v_actor_tenant_id = p_tenant_id
    )
  ) THEN
    RAISE EXCEPTION 'Tidak memiliki akses';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload status kepegawaian tidak valid';
  END IF;

  v_employee_category := NULLIF(BTRIM(COALESCE(p_payload->>'employee_category', '')), '');
  v_effective_date := NULLIF(BTRIM(COALESCE(p_payload->>'effective_date', '')), '')::DATE;
  v_reason := NULLIF(BTRIM(COALESCE(p_payload->>'reason', '')), '');

  IF NOT (p_payload ? 'is_active') THEN
    RAISE EXCEPTION 'Status aktif wajib diisi';
  END IF;
  v_is_active := (p_payload->>'is_active')::BOOLEAN;

  IF v_effective_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal efektif wajib diisi';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Alasan perubahan status wajib diisi';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.tenant_id = p_tenant_id
  LIMIT 1;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Data pegawai tidak ditemukan';
  END IF;

  UPDATE public.employees e
  SET
    employee_category = v_employee_category,
    is_active = v_is_active
  WHERE e.id = p_employee_id
    AND e.tenant_id = p_tenant_id;

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    employee_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    p_tenant_id,
    v_user_id,
    p_employee_id,
    v_action,
    'employees',
    p_employee_id,
    jsonb_build_object(
      'employee_category', v_existing.employee_category,
      'is_active', v_existing.is_active,
      'effective_date', NULL,
      'reason', NULL
    ),
    jsonb_build_object(
      'employee_category', v_employee_category,
      'is_active', v_is_active,
      'effective_date', v_effective_date,
      'reason', v_reason
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN QUERY SELECT p_employee_id, v_audit_id, v_action;
END;
$$;

REVOKE ALL ON FUNCTION public.update_org_hr_employee_status(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_org_hr_employee_status(UUID, UUID, JSONB) TO authenticated;
