BEGIN;

ALTER TABLE public.employee_invitations
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_emp_inv_archived_at
  ON public.employee_invitations (archived_at);

CREATE INDEX IF NOT EXISTS idx_emp_inv_tenant_active_created_at
  ON public.employee_invitations (tenant_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.archive_and_purge_employee_invitations(
  p_archive_after_days INTEGER DEFAULT 30,
  p_delete_after_archive_days INTEGER DEFAULT 30,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_archive_cutoff TIMESTAMPTZ;
  v_delete_cutoff TIMESTAMPTZ;
  v_archived_count INTEGER := 0;
  v_deleted_count INTEGER := 0;
BEGIN
  IF COALESCE(p_archive_after_days, 0) < 1 THEN
    RAISE EXCEPTION 'p_archive_after_days harus >= 1';
  END IF;

  IF COALESCE(p_delete_after_archive_days, 0) < 1 THEN
    RAISE EXCEPTION 'p_delete_after_archive_days harus >= 1';
  END IF;

  IF v_actor IS NOT NULL AND NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_archive_cutoff := now() - make_interval(days => p_archive_after_days);

  UPDATE public.employee_invitations ei
  SET archived_at = now(),
      updated_at = now()
  WHERE ei.archived_at IS NULL
    AND ei.created_at < v_archive_cutoff
    AND (p_tenant_id IS NULL OR ei.tenant_id = p_tenant_id);

  GET DIAGNOSTICS v_archived_count = ROW_COUNT;

  v_delete_cutoff := now() - make_interval(days => p_delete_after_archive_days);

  DELETE FROM public.employee_invitations ei
  WHERE ei.archived_at IS NOT NULL
    AND ei.archived_at < v_delete_cutoff
    AND (p_tenant_id IS NULL OR ei.tenant_id = p_tenant_id);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'archived_count', v_archived_count,
    'deleted_count', v_deleted_count,
    'archive_after_days', p_archive_after_days,
    'delete_after_archive_days', p_delete_after_archive_days,
    'tenant_id', p_tenant_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_and_purge_employee_invitations(INTEGER, INTEGER, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_employee_invitation_link(
  p_invite_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_inv public.employee_invitations%ROWTYPE;
  v_employee_id UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_inv
  FROM public.employee_invitations
  WHERE invitation_code = p_invite_code
    AND archived_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode undangan tidak valid';
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'Kode undangan sudah kedaluwarsa';
  END IF;

  IF COALESCE(v_inv.is_used, false) = true THEN
    RAISE EXCEPTION 'Kode undangan sudah digunakan';
  END IF;

  IF v_inv.status <> 'verified' THEN
    RAISE EXCEPTION 'Akun masih menunggu aktivasi admin';
  END IF;

  SELECT id
  INTO v_employee_id
  FROM public.employees
  WHERE tenant_id = v_inv.tenant_id
    AND lower(email) = lower(v_inv.email)
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    INSERT INTO public.employees (
      user_id,
      tenant_id,
      name,
      email,
      nik,
      phone,
      office_id,
      opd_id,
      is_active
    )
    VALUES (
      v_user,
      v_inv.tenant_id,
      v_inv.name,
      v_inv.email,
      v_inv.nik,
      v_inv.phone,
      v_inv.office_id,
      v_inv.opd_id,
      true
    )
    RETURNING id INTO v_employee_id;
  ELSE
    UPDATE public.employees
    SET user_id = v_user,
        office_id = COALESCE(office_id, v_inv.office_id),
        opd_id = COALESCE(opd_id, v_inv.opd_id),
        is_active = true,
        updated_at = now()
    WHERE id = v_employee_id;
  END IF;

  UPDATE public.employee_invitations
  SET is_used = true,
      used_at = now(),
      updated_at = now()
  WHERE id = v_inv.id;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  SELECT v_user, v_inv.tenant_id, 'pegawai'::public.app_role
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_user
      AND ur.tenant_id = v_inv.tenant_id
      AND ur.role = 'pegawai'::public.app_role
  );

  RETURN v_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_invitation_code(p_invitation_code TEXT)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  tenant_name TEXT,
  tenant_code TEXT,
  tenant_logo_url TEXT,
  name TEXT,
  email TEXT,
  nik TEXT,
  opd_id UUID,
  office_id UUID,
  invitation_type TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ei.id,
    ei.tenant_id,
    t.name AS tenant_name,
    t.code AS tenant_code,
    t.logo_url AS tenant_logo_url,
    ei.name,
    ei.email,
    ei.nik,
    ei.opd_id,
    ei.office_id,
    ei.invitation_type,
    ei.status,
    ei.expires_at
  FROM public.employee_invitations ei
  LEFT JOIN public.tenants t ON t.id = ei.tenant_id
  WHERE ei.invitation_code = p_invitation_code
    AND ei.status = 'pending'
    AND ei.archived_at IS NULL
    AND ei.expires_at > now()
  LIMIT 1;
END;
$$;

DO $$
DECLARE
  v_has_cron BOOLEAN := false;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') INTO v_has_cron;

  IF NOT v_has_cron THEN
    RAISE NOTICE 'pg_cron not available, skipping employee-invitations-archive-purge-daily schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'employee-invitations-archive-purge-daily') THEN
    PERFORM cron.unschedule('employee-invitations-archive-purge-daily');
  END IF;

  PERFORM cron.schedule(
    'employee-invitations-archive-purge-daily',
    '0 19 * * *',
    'SELECT public.archive_and_purge_employee_invitations(30, 30, NULL::UUID);'
  );
END $$;

COMMIT;
