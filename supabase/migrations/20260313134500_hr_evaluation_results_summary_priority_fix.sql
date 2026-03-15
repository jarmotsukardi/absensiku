CREATE OR REPLACE FUNCTION public.get_hr_evaluation_results_summary(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  run_id uuid,
  tenant_id uuid,
  period_config_id text,
  period_name text,
  period_cycle text,
  run_status text,
  cohort_size integer,
  result_total integer,
  ready_total integer,
  published_total integer,
  average_final_score numeric,
  top_score numeric,
  lowest_score numeric,
  published_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_scope_tenant uuid;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_scope_tenant := COALESCE(p_tenant_id, public.get_user_tenant_id(v_actor));

  IF v_scope_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant evaluasi tidak ditemukan';
  END IF;

  IF NOT public.is_super_admin(v_actor) AND v_scope_tenant <> public.get_user_tenant_id(v_actor) THEN
    RAISE EXCEPTION 'Tidak memiliki akses tenant evaluasi';
  END IF;

  RETURN QUERY
  WITH latest_run AS (
    SELECT r.*
    FROM public.hr_evaluation_runs r
    WHERE r.tenant_id = v_scope_tenant
    ORDER BY
      CASE r.status
        WHEN 'in_review' THEN 1
        WHEN 'draft' THEN 2
        WHEN 'published' THEN 3
        ELSE 4
      END,
      COALESCE(r.updated_at, r.published_at, r.created_at) DESC
    LIMIT 1
  ),
  score_summary AS (
    SELECT
      rr.run_id,
      COUNT(*)::integer AS result_total,
      COUNT(*) FILTER (WHERE rr.result_status = 'ready')::integer AS ready_total,
      COUNT(*) FILTER (WHERE rr.result_status = 'published')::integer AS published_total,
      ROUND(AVG(rr.final_score), 2) AS average_final_score,
      MAX(rr.final_score) AS top_score,
      MIN(rr.final_score) AS lowest_score
    FROM public.hr_evaluation_employee_results rr
    JOIN latest_run lr ON lr.id = rr.run_id
    GROUP BY rr.run_id
  )
  SELECT
    lr.id,
    lr.tenant_id,
    lr.period_config_id,
    lr.period_name,
    lr.period_cycle,
    lr.status,
    lr.cohort_size,
    COALESCE(ss.result_total, 0),
    COALESCE(ss.ready_total, 0),
    COALESCE(ss.published_total, 0),
    ss.average_final_score,
    ss.top_score,
    ss.lowest_score,
    lr.published_at,
    lr.updated_at
  FROM latest_run lr
  LEFT JOIN score_summary ss ON ss.run_id = lr.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hr_evaluation_results_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hr_evaluation_results_summary(uuid) TO authenticated;
