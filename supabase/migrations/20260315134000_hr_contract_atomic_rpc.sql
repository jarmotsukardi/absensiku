CREATE OR REPLACE FUNCTION public.save_org_hr_contract(
  p_tenant_id UUID,
  p_contract_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  contract_id UUID,
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
  v_existing public.hr_contracts%ROWTYPE;
  v_duplicate public.hr_contracts%ROWTYPE;
  v_overlap RECORD;
  v_employee_id UUID;
  v_contract_number TEXT;
  v_contract_type TEXT;
  v_start_date DATE;
  v_end_date DATE;
  v_status TEXT;
  v_effective_date DATE;
  v_status_reason TEXT;
  v_notes TEXT;
  v_saved_id UUID;
  v_audit_id UUID;
  v_action TEXT;
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
    RAISE EXCEPTION 'Payload kontrak tidak valid';
  END IF;

  v_employee_id := NULLIF(BTRIM(COALESCE(p_payload->>'employee_id', '')), '')::UUID;
  v_contract_number := NULLIF(BTRIM(COALESCE(p_payload->>'contract_number', '')), '');
  v_contract_type := NULLIF(BTRIM(COALESCE(p_payload->>'contract_type', '')), '');
  v_start_date := NULLIF(BTRIM(COALESCE(p_payload->>'start_date', '')), '')::DATE;
  v_end_date := NULLIF(BTRIM(COALESCE(p_payload->>'end_date', '')), '')::DATE;
  v_status := NULLIF(BTRIM(COALESCE(p_payload->>'status', '')), '');
  v_effective_date := NULLIF(BTRIM(COALESCE(p_payload->'metadata'->>'effective_date', '')), '')::DATE;
  v_status_reason := NULLIF(BTRIM(COALESCE(p_payload->'metadata'->>'status_reason', '')), '');
  v_notes := NULLIF(BTRIM(COALESCE(p_payload->>'notes', '')), '');

  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Pegawai wajib dipilih';
  END IF;
  IF v_contract_type IS NULL THEN
    RAISE EXCEPTION 'Tipe kontrak wajib diisi';
  END IF;
  IF v_start_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal mulai kontrak wajib diisi';
  END IF;
  IF v_effective_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal efektif kontrak wajib diisi';
  END IF;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Status kontrak wajib diisi';
  END IF;
  IF v_end_date IS NOT NULL AND v_end_date < v_start_date THEN
    RAISE EXCEPTION 'Tanggal berakhir tidak boleh sebelum tanggal mulai';
  END IF;
  IF v_effective_date < v_start_date THEN
    RAISE EXCEPTION 'Tanggal efektif tidak boleh sebelum tanggal mulai kontrak';
  END IF;
  IF v_end_date IS NOT NULL AND v_effective_date > v_end_date THEN
    RAISE EXCEPTION 'Tanggal efektif tidak boleh melewati tanggal berakhir kontrak';
  END IF;
  IF v_status IN ('ended', 'terminated') AND v_end_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal berakhir wajib diisi untuk kontrak berakhir atau terminasi';
  END IF;
  IF v_status IN ('ended', 'terminated') AND v_status_reason IS NULL THEN
    RAISE EXCEPTION 'Alasan status wajib diisi untuk kontrak berakhir atau terminasi';
  END IF;

  IF p_contract_id IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM public.hr_contracts c
    WHERE c.id = p_contract_id
      AND c.tenant_id = p_tenant_id
    LIMIT 1;

    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'Data kontrak tidak ditemukan';
    END IF;
  END IF;

  IF v_contract_number IS NOT NULL THEN
    SELECT *
    INTO v_duplicate
    FROM public.hr_contracts c
    WHERE c.tenant_id = p_tenant_id
      AND c.contract_number = v_contract_number
      AND (p_contract_id IS NULL OR c.id <> p_contract_id)
    LIMIT 1;

    IF v_duplicate.id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Nomor kontrak sudah digunakan. Gunakan nomor lain.';
    END IF;
  END IF;

  SELECT c.id, c.status
  INTO v_overlap
  FROM public.hr_contracts c
  WHERE c.tenant_id = p_tenant_id
    AND c.employee_id = v_employee_id
    AND (p_contract_id IS NULL OR c.id <> p_contract_id)
    AND c.status <> 'terminated'
    AND v_start_date <= COALESCE(c.end_date, DATE '9999-12-31')
    AND c.start_date <= COALESCE(v_end_date, DATE '9999-12-31')
  LIMIT 1;

  IF v_overlap.id IS NOT NULL THEN
    IF v_status = 'active' AND v_overlap.status = 'active' THEN
      RAISE EXCEPTION USING ERRCODE = '23P01', MESSAGE = 'Tidak boleh ada lebih dari satu kontrak aktif yang overlap untuk pegawai yang sama.';
    END IF;
    RAISE EXCEPTION USING ERRCODE = '23P01', MESSAGE = 'Rentang kontrak bentrok dengan kontrak lain untuk pegawai yang sama.';
  END IF;

  IF p_contract_id IS NULL THEN
    INSERT INTO public.hr_contracts (
      tenant_id,
      employee_id,
      contract_number,
      contract_type,
      start_date,
      end_date,
      status,
      metadata,
      notes,
      created_by,
      updated_by
    ) VALUES (
      p_tenant_id,
      v_employee_id,
      v_contract_number,
      v_contract_type,
      v_start_date,
      v_end_date,
      v_status,
      jsonb_build_object(
        'effective_date', v_effective_date,
        'status_reason', v_status_reason
      ),
      v_notes,
      v_user_id,
      v_user_id
    )
    RETURNING id INTO v_saved_id;

    v_action := 'contract_create';

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
      'hr_contracts',
      v_saved_id,
      NULL,
      jsonb_build_object(
        'employee_id', v_employee_id,
        'contract_number', v_contract_number,
        'contract_type', v_contract_type,
        'start_date', v_start_date,
        'end_date', v_end_date,
        'status', v_status,
        'metadata', jsonb_build_object(
          'effective_date', v_effective_date,
          'status_reason', v_status_reason
        ),
        'notes', v_notes
      )
    )
    RETURNING id INTO v_audit_id;
  ELSE
    UPDATE public.hr_contracts c
    SET
      employee_id = v_employee_id,
      contract_number = v_contract_number,
      contract_type = v_contract_type,
      start_date = v_start_date,
      end_date = v_end_date,
      status = v_status,
      metadata = jsonb_build_object(
        'effective_date', v_effective_date,
        'status_reason', v_status_reason
      ),
      notes = v_notes,
      updated_by = v_user_id
    WHERE c.id = p_contract_id
      AND c.tenant_id = p_tenant_id
    RETURNING c.id INTO v_saved_id;

    v_action := 'contract_update';

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
      'hr_contracts',
      v_saved_id,
      to_jsonb(v_existing),
      jsonb_build_object(
        'employee_id', v_employee_id,
        'contract_number', v_contract_number,
        'contract_type', v_contract_type,
        'start_date', v_start_date,
        'end_date', v_end_date,
        'status', v_status,
        'metadata', jsonb_build_object(
          'effective_date', v_effective_date,
          'status_reason', v_status_reason
        ),
        'notes', v_notes
      )
    )
    RETURNING id INTO v_audit_id;
  END IF;

  RETURN QUERY SELECT v_saved_id, v_audit_id, v_action;
END;
$$;

REVOKE ALL ON FUNCTION public.save_org_hr_contract(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_org_hr_contract(UUID, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_org_hr_contract(
  p_tenant_id UUID,
  p_contract_id UUID
)
RETURNS TABLE (
  contract_id UUID,
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
  v_existing public.hr_contracts%ROWTYPE;
  v_audit_id UUID;
  v_action TEXT := 'contract_delete';
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_tenant_id IS NULL OR p_contract_id IS NULL THEN
    RAISE EXCEPTION 'Tenant dan kontrak wajib diisi';
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

  SELECT *
  INTO v_existing
  FROM public.hr_contracts c
  WHERE c.id = p_contract_id
    AND c.tenant_id = p_tenant_id
  LIMIT 1;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Data kontrak tidak ditemukan';
  END IF;

  DELETE FROM public.hr_contracts c
  WHERE c.id = p_contract_id
    AND c.tenant_id = p_tenant_id;

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
    v_existing.employee_id,
    v_action,
    'hr_contracts',
    p_contract_id,
    to_jsonb(v_existing),
    NULL
  )
  RETURNING id INTO v_audit_id;

  RETURN QUERY SELECT p_contract_id, v_audit_id, v_action;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_org_hr_contract(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_org_hr_contract(UUID, UUID) TO authenticated;
