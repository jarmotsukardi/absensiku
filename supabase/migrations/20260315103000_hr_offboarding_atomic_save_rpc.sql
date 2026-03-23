CREATE OR REPLACE FUNCTION public.create_org_hr_offboarding(
  p_tenant_id UUID,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  mutation_request_id UUID,
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
  v_employee public.employees%ROWTYPE;
  v_employee_id UUID;
  v_offboarding_type TEXT;
  v_offboarding_date DATE;
  v_notes TEXT;
  v_document_reference_number TEXT;
  v_document_reference_date DATE;
  v_document_reference_issuer TEXT;
  v_reason TEXT;
  v_request_id UUID;
  v_audit_id UUID;
  v_action TEXT := 'employee_offboarding_create_hr';
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant wajib diisi';
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
    RAISE EXCEPTION 'Payload offboarding tidak valid';
  END IF;

  v_employee_id := NULLIF(BTRIM(COALESCE(p_payload->>'employee_id', '')), '')::UUID;
  v_offboarding_type := NULLIF(BTRIM(COALESCE(p_payload->>'offboarding_type', '')), '');
  v_offboarding_date := NULLIF(BTRIM(COALESCE(p_payload->>'offboarding_date', '')), '')::DATE;
  v_notes := NULLIF(BTRIM(COALESCE(p_payload->>'notes', '')), '');
  v_document_reference_number := NULLIF(BTRIM(COALESCE(p_payload->>'document_reference_number', '')), '');
  v_document_reference_date := NULLIF(BTRIM(COALESCE(p_payload->>'document_reference_date', '')), '')::DATE;
  v_document_reference_issuer := NULLIF(BTRIM(COALESCE(p_payload->>'document_reference_issuer', '')), '');

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Pegawai wajib dipilih';
  END IF;
  IF v_offboarding_type IS NULL THEN
    RAISE EXCEPTION 'Tipe offboarding wajib diisi';
  END IF;
  IF v_offboarding_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal offboarding wajib diisi';
  END IF;

  SELECT *
  INTO v_employee
  FROM public.employees e
  WHERE e.id = v_employee_id
    AND e.tenant_id = p_tenant_id
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RAISE EXCEPTION 'Data pegawai tidak ditemukan';
  END IF;
  IF COALESCE(v_employee.is_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'Pegawai sudah nonaktif';
  END IF;

  v_reason := COALESCE(v_notes, FORMAT('Offboarding %s', v_offboarding_type));

  INSERT INTO public.mutation_requests (
    tenant_id,
    employee_id,
    mutation_type,
    requested_changes,
    original_data,
    reason,
    status,
    approved_by,
    approved_at,
    document_reference_number,
    document_reference_date,
    document_reference_issuer
  ) VALUES (
    p_tenant_id,
    v_employee_id,
    'profile_change',
    jsonb_build_object(
      'offboarding_type', v_offboarding_type,
      'offboarding_date', v_offboarding_date,
      'employee_active', FALSE
    ),
    jsonb_build_object(
      'is_active', TRUE,
      'employee_name', v_employee.name,
      'employee_nip', v_employee.nip,
      'position', v_employee.position
    ),
    v_reason,
    'disetujui',
    v_user_id,
    NOW(),
    v_document_reference_number,
    v_document_reference_date,
    v_document_reference_issuer
  )
  RETURNING id INTO v_request_id;

  UPDATE public.employees e
  SET is_active = FALSE
  WHERE e.id = v_employee_id
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
    v_employee_id,
    v_action,
    'mutation_requests',
    v_request_id,
    NULL,
    jsonb_build_object(
      'offboarding_type', v_offboarding_type,
      'offboarding_date', v_offboarding_date,
      'notes', v_notes,
      'document_reference_number', v_document_reference_number,
      'document_reference_date', v_document_reference_date,
      'document_reference_issuer', v_document_reference_issuer,
      'employee_active', FALSE
    )
  )
  RETURNING id INTO v_audit_id;

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
    v_employee_id,
    'employee_offboarding_deactivate',
    'employees',
    v_employee_id,
    jsonb_build_object(
      'is_active', TRUE,
      'employee_name', v_employee.name,
      'employee_nip', v_employee.nip
    ),
    jsonb_build_object(
      'is_active', FALSE,
      'offboarding_type', v_offboarding_type,
      'offboarding_date', v_offboarding_date
    )
  );

  RETURN QUERY SELECT v_request_id, v_employee_id, v_audit_id, v_action;
END;
$$;

REVOKE ALL ON FUNCTION public.create_org_hr_offboarding(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_org_hr_offboarding(UUID, JSONB) TO authenticated;
