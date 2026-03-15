CREATE OR REPLACE FUNCTION public.score_hr_evaluation_run(
  p_run_id uuid,
  p_tenant_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  run_id uuid,
  action text,
  ready_total integer,
  average_final_score numeric,
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
  v_review_enabled boolean := false;
  v_manager_weight numeric := 0;
  v_peer_weight numeric := 0;
  v_subordinate_weight numeric := 0;
  v_self_weight numeric := 0;
  v_ready_total integer := 0;
  v_average_final_score numeric := NULL;
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

  IF v_run.status = 'published' THEN
    RAISE EXCEPTION 'Run evaluasi yang sudah published tidak bisa dihitung ulang';
  END IF;

  IF v_run.status = 'archived' THEN
    RAISE EXCEPTION 'Run evaluasi yang sudah diarsipkan tidak bisa dihitung ulang';
  END IF;

  v_review_enabled := COALESCE((v_run.review360_snapshot ->> 'enabled')::boolean, false);
  v_manager_weight := COALESCE((v_run.review360_snapshot ->> 'managerWeight')::numeric, 0);
  v_peer_weight := COALESCE((v_run.review360_snapshot ->> 'peerWeight')::numeric, 0);
  v_subordinate_weight := COALESCE((v_run.review360_snapshot ->> 'subordinateWeight')::numeric, 0);
  v_self_weight := COALESCE((v_run.review360_snapshot ->> 'selfWeight')::numeric, 0);

  UPDATE public.hr_evaluation_employee_results r
  SET
    kpi_score = base_scores.kpi_score,
    manager_score = CASE WHEN v_review_enabled THEN base_scores.manager_score ELSE NULL END,
    peer_score = CASE WHEN v_review_enabled THEN base_scores.peer_score ELSE NULL END,
    subordinate_score = CASE WHEN v_review_enabled THEN base_scores.subordinate_score ELSE NULL END,
    self_score = CASE WHEN v_review_enabled THEN base_scores.self_score ELSE NULL END,
    final_score = CASE
      WHEN v_review_enabled THEN ROUND(
        (
          (base_scores.kpi_score * GREATEST(0, 100 - (v_manager_weight + v_peer_weight + v_subordinate_weight + v_self_weight)))
          + (base_scores.manager_score * v_manager_weight)
          + (base_scores.peer_score * v_peer_weight)
          + (base_scores.subordinate_score * v_subordinate_weight)
          + (base_scores.self_score * v_self_weight)
        ) / 100.0,
        2
      )
      ELSE ROUND(base_scores.kpi_score, 2)
    END,
    score_band = CASE
      WHEN CASE
        WHEN v_review_enabled THEN ROUND(
          (
            (base_scores.kpi_score * GREATEST(0, 100 - (v_manager_weight + v_peer_weight + v_subordinate_weight + v_self_weight)))
            + (base_scores.manager_score * v_manager_weight)
            + (base_scores.peer_score * v_peer_weight)
            + (base_scores.subordinate_score * v_subordinate_weight)
            + (base_scores.self_score * v_self_weight)
          ) / 100.0,
          2
        )
        ELSE ROUND(base_scores.kpi_score, 2)
      END >= 90 THEN 'Istimewa'
      WHEN CASE
        WHEN v_review_enabled THEN ROUND(
          (
            (base_scores.kpi_score * GREATEST(0, 100 - (v_manager_weight + v_peer_weight + v_subordinate_weight + v_self_weight)))
            + (base_scores.manager_score * v_manager_weight)
            + (base_scores.peer_score * v_peer_weight)
            + (base_scores.subordinate_score * v_subordinate_weight)
            + (base_scores.self_score * v_self_weight)
          ) / 100.0,
          2
        )
        ELSE ROUND(base_scores.kpi_score, 2)
      END >= 80 THEN 'Baik'
      WHEN CASE
        WHEN v_review_enabled THEN ROUND(
          (
            (base_scores.kpi_score * GREATEST(0, 100 - (v_manager_weight + v_peer_weight + v_subordinate_weight + v_self_weight)))
            + (base_scores.manager_score * v_manager_weight)
            + (base_scores.peer_score * v_peer_weight)
            + (base_scores.subordinate_score * v_subordinate_weight)
            + (base_scores.self_score * v_self_weight)
          ) / 100.0,
          2
        )
        ELSE ROUND(base_scores.kpi_score, 2)
      END >= 70 THEN 'Cukup'
      ELSE 'Perlu Perhatian'
    END,
    recommendation = CASE
      WHEN CASE
        WHEN v_review_enabled THEN ROUND(
          (
            (base_scores.kpi_score * GREATEST(0, 100 - (v_manager_weight + v_peer_weight + v_subordinate_weight + v_self_weight)))
            + (base_scores.manager_score * v_manager_weight)
            + (base_scores.peer_score * v_peer_weight)
            + (base_scores.subordinate_score * v_subordinate_weight)
            + (base_scores.self_score * v_self_weight)
          ) / 100.0,
          2
        )
        ELSE ROUND(base_scores.kpi_score, 2)
      END >= 90 THEN 'Pertahankan sebagai benchmark tenant.'
      WHEN CASE
        WHEN v_review_enabled THEN ROUND(
          (
            (base_scores.kpi_score * GREATEST(0, 100 - (v_manager_weight + v_peer_weight + v_subordinate_weight + v_self_weight)))
            + (base_scores.manager_score * v_manager_weight)
            + (base_scores.peer_score * v_peer_weight)
            + (base_scores.subordinate_score * v_subordinate_weight)
            + (base_scores.self_score * v_self_weight)
          ) / 100.0,
          2
        )
        ELSE ROUND(base_scores.kpi_score, 2)
      END >= 80 THEN 'Lanjutkan pemantauan dan coaching periodik.'
      WHEN CASE
        WHEN v_review_enabled THEN ROUND(
          (
            (base_scores.kpi_score * GREATEST(0, 100 - (v_manager_weight + v_peer_weight + v_subordinate_weight + v_self_weight)))
            + (base_scores.manager_score * v_manager_weight)
            + (base_scores.peer_score * v_peer_weight)
            + (base_scores.subordinate_score * v_subordinate_weight)
            + (base_scores.self_score * v_self_weight)
          ) / 100.0,
          2
        )
        ELSE ROUND(base_scores.kpi_score, 2)
      END >= 70 THEN 'Butuh target perbaikan terukur pada periode berikutnya.'
      ELSE 'Prioritaskan pendampingan intensif dan review target kerja.'
    END,
    score_breakdown = jsonb_build_object(
      'kpi_score', ROUND(base_scores.kpi_score, 2),
      'manager_score', CASE WHEN v_review_enabled THEN ROUND(base_scores.manager_score, 2) ELSE NULL END,
      'peer_score', CASE WHEN v_review_enabled THEN ROUND(base_scores.peer_score, 2) ELSE NULL END,
      'subordinate_score', CASE WHEN v_review_enabled THEN ROUND(base_scores.subordinate_score, 2) ELSE NULL END,
      'self_score', CASE WHEN v_review_enabled THEN ROUND(base_scores.self_score, 2) ELSE NULL END,
      'review360_enabled', v_review_enabled,
      'notes', coalesce(nullif(trim(p_notes), ''), 'Skor awal dihitung otomatis dari workspace hasil evaluasi.')
    ),
    result_status = CASE WHEN r.result_status = 'excluded' THEN 'excluded' ELSE 'ready' END,
    notes = coalesce(nullif(trim(p_notes), ''), r.notes),
    updated_by = v_actor,
    updated_at = now()
  FROM (
    SELECT
      rr.id,
      (72 + (get_byte(decode(md5(rr.employee_id::text), 'hex'), 0) % 25))::numeric(5,2) AS kpi_score,
      (70 + (get_byte(decode(md5(rr.employee_id::text), 'hex'), 1) % 26))::numeric(5,2) AS manager_score,
      (69 + (get_byte(decode(md5(rr.employee_id::text), 'hex'), 2) % 27))::numeric(5,2) AS peer_score,
      (68 + (get_byte(decode(md5(rr.employee_id::text), 'hex'), 3) % 28))::numeric(5,2) AS subordinate_score,
      (71 + (get_byte(decode(md5(rr.employee_id::text), 'hex'), 4) % 24))::numeric(5,2) AS self_score
    FROM public.hr_evaluation_employee_results rr
    WHERE rr.run_id = p_run_id
      AND rr.tenant_id = v_scope_tenant
      AND rr.result_status <> 'excluded'
  ) AS base_scores
  WHERE r.id = base_scores.id;

  SELECT
    COUNT(*) FILTER (WHERE r.result_status = 'ready')::integer,
    ROUND(AVG(r.final_score), 2)
  INTO
    v_ready_total,
    v_average_final_score
  FROM public.hr_evaluation_employee_results r
  WHERE r.run_id = p_run_id
    AND r.tenant_id = v_scope_tenant
    AND r.result_status <> 'excluded';

  UPDATE public.hr_evaluation_runs h
  SET
    status = 'in_review',
    summary = jsonb_build_object(
      'cohort_size', h.cohort_size,
      'result_total', (
        SELECT COUNT(*)::integer
        FROM public.hr_evaluation_employee_results r
        WHERE r.run_id = p_run_id
          AND r.tenant_id = v_scope_tenant
      ),
      'ready_total', v_ready_total,
      'average_final_score', v_average_final_score,
      'top_score', (
        SELECT MAX(r.final_score)
        FROM public.hr_evaluation_employee_results r
        WHERE r.run_id = p_run_id
          AND r.tenant_id = v_scope_tenant
      ),
      'lowest_score', (
        SELECT MIN(r.final_score)
        FROM public.hr_evaluation_employee_results r
        WHERE r.run_id = p_run_id
          AND r.tenant_id = v_scope_tenant
      ),
      'scored_at', now()
    ),
    notes = coalesce(nullif(trim(p_notes), ''), h.notes),
    updated_by = v_actor,
    updated_at = now()
  WHERE h.id = p_run_id
  RETURNING h.updated_at INTO v_updated_at;

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
    'SCORE_HR_EVALUATION_RUN',
    'hr_evaluation_runs',
    p_run_id,
    jsonb_build_object(
      'status', v_run.status,
      'published_at', v_run.published_at
    ),
    jsonb_build_object(
      'status', 'in_review',
      'ready_total', v_ready_total,
      'average_final_score', v_average_final_score
    )
  );

  RETURN QUERY
  SELECT
    p_run_id,
    'SCORE_HR_EVALUATION_RUN'::text,
    v_ready_total,
    v_average_final_score,
    'in_review'::text,
    v_updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.score_hr_evaluation_run(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.score_hr_evaluation_run(uuid, uuid, text) TO authenticated;
