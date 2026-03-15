CREATE OR REPLACE FUNCTION public.archive_hr_evaluation_run(
  p_run_id uuid,
  p_tenant_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  run_id uuid,
  action text,
  published_total integer,
  run_status text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_actor_tenant uuid;
  v_scope_tenant uuid;
  v_run public.hr_evaluation_runs%ROWTYPE;
  v_published_total integer := 0;
  v_updated_at timestamptz := now();
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'Run evaluasi wajib diisi';
  END IF;

  v_actor_tenant := public.get_user_tenant_id(v_actor);

  SELECT *
  INTO v_run
  FROM public.hr_evaluation_runs
  WHERE id = p_run_id;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Run evaluasi tidak ditemukan';
  END IF;

  v_scope_tenant := COALESCE(p_tenant_id, v_run.tenant_id);

  IF v_scope_tenant <> v_run.tenant_id THEN
    RAISE EXCEPTION 'Tenant run evaluasi tidak cocok';
  END IF;

  IF NOT public.is_super_admin(v_actor)
    AND (
      v_actor_tenant IS NULL
      OR v_actor_tenant <> v_scope_tenant
      OR NOT public.has_role(v_actor, 'admin_instansi'::public.app_role)
    ) THEN
    RAISE EXCEPTION 'Tidak memiliki akses tenant evaluasi';
  END IF;

  IF v_run.status = 'archived' THEN
    RAISE EXCEPTION 'Run evaluasi sudah diarsipkan';
  END IF;

  IF v_run.status <> 'published' THEN
    RAISE EXCEPTION 'Hanya run published yang bisa diarsipkan';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_published_total
  FROM public.hr_evaluation_employee_results r
  WHERE r.run_id = p_run_id
    AND r.tenant_id = v_scope_tenant
    AND r.result_status = 'published';

  UPDATE public.hr_evaluation_runs h
  SET
    status = 'archived',
    summary = coalesce(h.summary, '{}'::jsonb) || jsonb_build_object(
      'published_total', v_published_total,
      'archived_at', v_updated_at
    ),
    notes = coalesce(nullif(trim(p_notes), ''), h.notes),
    updated_by = v_actor,
    updated_at = v_updated_at
  WHERE h.id = p_run_id;

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    v_scope_tenant,
    v_actor,
    'ARCHIVE_HR_EVALUATION_RUN',
    'hr_evaluation_runs',
    p_run_id,
    jsonb_build_object(
      'status', v_run.status,
      'published_at', v_run.published_at
    ),
    jsonb_build_object(
      'status', 'archived',
      'published_total', v_published_total,
      'archived_at', v_updated_at
    )
  );

  RETURN QUERY
  SELECT
    p_run_id,
    'ARCHIVE_HR_EVALUATION_RUN'::text,
    v_published_total,
    'archived'::text,
    v_updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_hr_evaluation_run(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_hr_evaluation_run(uuid, uuid, text) TO authenticated;
