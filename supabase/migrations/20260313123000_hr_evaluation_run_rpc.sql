CREATE OR REPLACE FUNCTION public.create_hr_evaluation_run(
  p_tenant_id uuid,
  p_period_config_id text,
  p_period_name text,
  p_period_cycle text DEFAULT NULL,
  p_kpi_snapshot jsonb DEFAULT '[]'::jsonb,
  p_form_snapshot jsonb DEFAULT '[]'::jsonb,
  p_review360_snapshot jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  run_id uuid,
  action text,
  cohort_size integer,
  result_total integer,
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
  v_existing_run public.hr_evaluation_runs%ROWTYPE;
  v_run_id uuid;
  v_action text;
  v_cohort_size integer := 0;
  v_result_total integer := 0;
  v_review_weight_total numeric := 0;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant evaluasi wajib diisi';
  END IF;

  v_actor_tenant := public.get_user_tenant_id(v_actor);

  IF NOT public.is_super_admin(v_actor) AND (v_actor_tenant IS NULL OR v_actor_tenant <> p_tenant_id OR NOT public.has_role(v_actor, 'admin_instansi'::public.app_role)) THEN
    RAISE EXCEPTION 'Tidak memiliki akses tenant evaluasi';
  END IF;

  IF coalesce(trim(p_period_config_id), '') = '' OR coalesce(trim(p_period_name), '') = '' THEN
    RAISE EXCEPTION 'Periode evaluasi wajib diisi';
  END IF;

  IF jsonb_typeof(p_kpi_snapshot) <> 'array' OR jsonb_array_length(p_kpi_snapshot) = 0 THEN
    RAISE EXCEPTION 'Minimal satu KPI aktif wajib tersedia';
  END IF;

  IF jsonb_typeof(p_form_snapshot) <> 'array' OR jsonb_array_length(p_form_snapshot) = 0 THEN
    RAISE EXCEPTION 'Minimal satu form aktif wajib tersedia';
  END IF;

  IF jsonb_typeof(p_review360_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Konfigurasi review 360 tidak valid';
  END IF;

  IF coalesce((p_review360_snapshot ->> 'enabled')::boolean, false) THEN
    v_review_weight_total :=
      coalesce((p_review360_snapshot ->> 'managerWeight')::numeric, 0)
      + coalesce((p_review360_snapshot ->> 'peerWeight')::numeric, 0)
      + coalesce((p_review360_snapshot ->> 'subordinateWeight')::numeric, 0)
      + coalesce((p_review360_snapshot ->> 'selfWeight')::numeric, 0);

    IF v_review_weight_total <> 100 THEN
      RAISE EXCEPTION 'Total bobot review 360 harus 100 persen';
    END IF;
  END IF;

  SELECT *
  INTO v_existing_run
  FROM public.hr_evaluation_runs
  WHERE tenant_id = p_tenant_id
    AND period_config_id = p_period_config_id
    AND status IN ('draft', 'in_review')
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_existing_run.id IS NULL THEN
    INSERT INTO public.hr_evaluation_runs (
      tenant_id,
      period_config_id,
      period_name,
      period_cycle,
      status,
      kpi_snapshot,
      form_snapshot,
      review360_snapshot,
      notes,
      created_by,
      updated_by
    ) VALUES (
      p_tenant_id,
      p_period_config_id,
      trim(p_period_name),
      NULLIF(trim(coalesce(p_period_cycle, '')), ''),
      'draft',
      p_kpi_snapshot,
      p_form_snapshot,
      p_review360_snapshot,
      NULLIF(trim(coalesce(p_notes, '')), ''),
      v_actor,
      v_actor
    )
    RETURNING id INTO v_run_id;
    v_action := 'CREATE_HR_EVALUATION_RUN';
  ELSE
    v_run_id := v_existing_run.id;
    UPDATE public.hr_evaluation_runs
    SET
      period_name = trim(p_period_name),
      period_cycle = NULLIF(trim(coalesce(p_period_cycle, '')), ''),
      kpi_snapshot = p_kpi_snapshot,
      form_snapshot = p_form_snapshot,
      review360_snapshot = p_review360_snapshot,
      notes = NULLIF(trim(coalesce(p_notes, '')), ''),
      updated_by = v_actor,
      updated_at = now()
    WHERE id = v_run_id;
    v_action := 'REFRESH_HR_EVALUATION_RUN';

    DELETE FROM public.hr_evaluation_employee_results
    WHERE run_id = v_run_id;
  END IF;

  INSERT INTO public.hr_evaluation_employee_results (
    tenant_id,
    run_id,
    employee_id,
    employee_snapshot,
    result_status,
    created_by,
    updated_by
  )
  SELECT
    e.tenant_id,
    v_run_id,
    e.id,
    jsonb_build_object(
      'name', e.name,
      'email', e.email,
      'nip', e.nip,
      'employee_category', e.employee_category,
      'golongan', e.golongan,
      'position', e.position,
      'position_id', e.position_id,
      'opd_id', e.opd_id,
      'work_unit_id', e.work_unit_id
    ),
    'draft',
    v_actor,
    v_actor
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id
    AND coalesce(e.is_active, true) = true;

  SELECT COUNT(*)
  INTO v_cohort_size
  FROM public.hr_evaluation_employee_results
  WHERE run_id = v_run_id;

  UPDATE public.hr_evaluation_runs
  SET
    cohort_size = v_cohort_size,
    included_employee_ids = (
      SELECT coalesce(array_agg(employee_id ORDER BY employee_id), '{}'::uuid[])
      FROM public.hr_evaluation_employee_results
      WHERE run_id = v_run_id
    ),
    excluded_employee_ids = '{}'::uuid[],
    summary = jsonb_build_object(
      'cohort_size', v_cohort_size,
      'result_total', v_cohort_size,
      'generated_at', now(),
      'period_name', trim(p_period_name)
    ),
    updated_by = v_actor,
    updated_at = now()
  WHERE id = v_run_id;

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    p_tenant_id,
    v_actor,
    v_action,
    'hr_evaluation_runs',
    v_run_id::text,
    CASE
      WHEN v_existing_run.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'run_id', v_existing_run.id,
        'status', v_existing_run.status,
        'cohort_size', v_existing_run.cohort_size
      )
    END,
    jsonb_build_object(
      'run_id', v_run_id,
      'period_config_id', p_period_config_id,
      'period_name', trim(p_period_name),
      'cohort_size', v_cohort_size,
      'status', 'draft'
    )
  );

  SELECT
    count(*)::integer,
    max(updated_at)
  INTO
    v_result_total,
    updated_at
  FROM public.hr_evaluation_employee_results
  WHERE run_id = v_run_id;

  run_id := v_run_id;
  action := v_action;
  cohort_size := v_cohort_size;
  result_total := v_result_total;
  run_status := 'draft';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_hr_evaluation_run(uuid, text, text, text, jsonb, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hr_evaluation_run(uuid, text, text, text, jsonb, jsonb, jsonb, text) TO authenticated;
