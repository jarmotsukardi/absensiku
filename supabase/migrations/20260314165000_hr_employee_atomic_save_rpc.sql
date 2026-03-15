CREATE OR REPLACE FUNCTION public.save_org_hr_employee(
  p_tenant_id UUID,
  p_employee_id UUID DEFAULT NULL,
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
  v_duplicate public.employees%ROWTYPE;
  v_name TEXT;
  v_email TEXT;
  v_nik TEXT;
  v_nip TEXT;
  v_employee_category TEXT;
  v_golongan TEXT;
  v_position TEXT;
  v_position_id UUID;
  v_opd_id UUID;
  v_work_unit_id UUID;
  v_office_id UUID;
  v_is_active BOOLEAN;
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
    RAISE EXCEPTION 'Payload pegawai tidak valid';
  END IF;

  v_name := NULLIF(BTRIM(COALESCE(p_payload->>'name', '')), '');
  v_email := LOWER(NULLIF(BTRIM(COALESCE(p_payload->>'email', '')), ''));
  v_nik := NULLIF(BTRIM(COALESCE(p_payload->>'nik', '')), '');
  v_nip := NULLIF(BTRIM(COALESCE(p_payload->>'nip', '')), '');
  v_employee_category := NULLIF(BTRIM(COALESCE(p_payload->>'employee_category', '')), '');
  v_golongan := NULLIF(BTRIM(COALESCE(p_payload->>'golongan', '')), '');
  v_position := NULLIF(BTRIM(COALESCE(p_payload->>'position', '')), '');
  v_position_id := NULLIF(BTRIM(COALESCE(p_payload->>'position_id', '')), '')::UUID;
  v_opd_id := NULLIF(BTRIM(COALESCE(p_payload->>'opd_id', '')), '')::UUID;
  v_work_unit_id := NULLIF(BTRIM(COALESCE(p_payload->>'work_unit_id', '')), '')::UUID;
  v_office_id := NULLIF(BTRIM(COALESCE(p_payload->>'office_id', '')), '')::UUID;
  v_is_active := COALESCE((p_payload->>'is_active')::BOOLEAN, TRUE);

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Nama pegawai wajib diisi';
  END IF;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email pegawai wajib diisi';
  END IF;
  IF v_nik IS NULL THEN
    RAISE EXCEPTION 'NIK pegawai wajib diisi';
  END IF;
  IF v_employee_category IS NULL THEN
    RAISE EXCEPTION 'Kategori pegawai wajib diisi';
  END IF;
  IF v_position IS NULL THEN
    RAISE EXCEPTION 'Jabatan pegawai wajib diisi';
  END IF;

  IF p_employee_id IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.tenant_id = p_tenant_id
    LIMIT 1;

    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'Data pegawai tidak ditemukan';
    END IF;
  END IF;

  SELECT *
  INTO v_duplicate
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id
    AND (p_employee_id IS NULL OR e.id <> p_employee_id)
    AND (
      LOWER(BTRIM(COALESCE(e.email, ''))) = v_email
      OR BTRIM(COALESCE(e.nik, '')) = v_nik
      OR (v_nip IS NOT NULL AND BTRIM(COALESCE(e.nip, '')) = v_nip)
    )
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_duplicate.id IS NOT NULL THEN
    IF LOWER(BTRIM(COALESCE(v_duplicate.email, ''))) = v_email THEN
      RAISE EXCEPTION 'Email pegawai sudah digunakan. Gunakan email lain.';
    END IF;
    IF BTRIM(COALESCE(v_duplicate.nik, '')) = v_nik THEN
      RAISE EXCEPTION 'NIK pegawai sudah digunakan. Gunakan NIK lain.';
    END IF;
    RAISE EXCEPTION 'NIP pegawai sudah digunakan. Gunakan NIP lain.';
  END IF;

  IF p_employee_id IS NULL THEN
    INSERT INTO public.employees (
      tenant_id,
      name,
      email,
      nik,
      nip,
      employee_category,
      golongan,
      position,
      position_id,
      opd_id,
      work_unit_id,
      office_id,
      is_active
    ) VALUES (
      p_tenant_id,
      v_name,
      v_email,
      v_nik,
      v_nip,
      v_employee_category,
      v_golongan,
      v_position,
      v_position_id,
      v_opd_id,
      v_work_unit_id,
      v_office_id,
      v_is_active
    )
    RETURNING id INTO v_saved_id;

    v_action := 'employee_create_hr';

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
      v_saved_id,
      v_action,
      'employees',
      v_saved_id,
      NULL,
      jsonb_build_object(
        'name', v_name,
        'email', v_email,
        'nik', v_nik,
        'nip', v_nip,
        'employee_category', v_employee_category,
        'golongan', v_golongan,
        'position', v_position,
        'position_id', v_position_id,
        'opd_id', v_opd_id,
        'work_unit_id', v_work_unit_id,
        'office_id', v_office_id,
        'is_active', v_is_active
      )
    )
    RETURNING id INTO v_audit_id;
  ELSE
    UPDATE public.employees e
    SET
      name = v_name,
      email = v_email,
      nik = v_nik,
      nip = v_nip,
      employee_category = v_employee_category,
      golongan = v_golongan,
      position = v_position,
      position_id = v_position_id,
      opd_id = v_opd_id,
      work_unit_id = v_work_unit_id,
      office_id = v_office_id,
      is_active = v_is_active
    WHERE e.id = p_employee_id
      AND e.tenant_id = p_tenant_id
    RETURNING e.id INTO v_saved_id;

    v_action := 'employee_update_hr';

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
      v_saved_id,
      v_action,
      'employees',
      v_saved_id,
      to_jsonb(v_existing),
      jsonb_build_object(
        'name', v_name,
        'email', v_email,
        'nik', v_nik,
        'nip', v_nip,
        'employee_category', v_employee_category,
        'golongan', v_golongan,
        'position', v_position,
        'position_id', v_position_id,
        'opd_id', v_opd_id,
        'work_unit_id', v_work_unit_id,
        'office_id', v_office_id,
        'is_active', v_is_active
      )
    )
    RETURNING id INTO v_audit_id;
  END IF;

  RETURN QUERY SELECT v_saved_id, v_audit_id, v_action;
END;
$$;

REVOKE ALL ON FUNCTION public.save_org_hr_employee(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_org_hr_employee(UUID, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.bulk_fill_org_hr_employee_category(
  p_tenant_id UUID,
  p_employee_ids UUID[],
  p_category TEXT
)
RETURNS TABLE (
  affected_count INTEGER,
  audit_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_actor_tenant_id UUID;
  v_category TEXT;
  v_affected_count INTEGER := 0;
  v_audit_count INTEGER := 0;
  v_row public.employees%ROWTYPE;
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

  v_category := NULLIF(BTRIM(COALESCE(p_category, '')), '');
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Kategori wajib diisi';
  END IF;

  IF COALESCE(array_length(p_employee_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Daftar pegawai wajib diisi';
  END IF;

  FOR v_row IN
    SELECT *
    FROM public.employees e
    WHERE e.tenant_id = p_tenant_id
      AND e.id = ANY(p_employee_ids)
  LOOP
    UPDATE public.employees
    SET employee_category = v_category
    WHERE id = v_row.id
      AND tenant_id = p_tenant_id;

    v_affected_count := v_affected_count + 1;

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
      v_row.id,
      'employee_bulk_category_fill_hr',
      'employees',
      v_row.id,
      jsonb_build_object('employee_category', v_row.employee_category),
      jsonb_build_object('employee_category', v_category)
    );

    v_audit_count := v_audit_count + 1;
  END LOOP;

  IF v_affected_count = 0 THEN
    RAISE EXCEPTION 'Tidak ada pegawai tenant yang cocok untuk bulk kategori';
  END IF;

  RETURN QUERY SELECT v_affected_count, v_audit_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_fill_org_hr_employee_category(UUID, UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_fill_org_hr_employee_category(UUID, UUID[], TEXT) TO authenticated;
