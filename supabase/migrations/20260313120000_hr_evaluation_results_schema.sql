-- HR evaluation results schema: run snapshot + per-employee output summary.

CREATE TABLE IF NOT EXISTS public.hr_evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_config_id text NOT NULL,
  period_name text NOT NULL,
  period_cycle text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'published', 'archived')),
  cohort_size integer NOT NULL DEFAULT 0 CHECK (cohort_size >= 0),
  included_employee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  excluded_employee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  kpi_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  form_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  review360_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  published_at timestamptz,
  published_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_evaluation_runs_tenant_status
  ON public.hr_evaluation_runs(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_evaluation_runs_tenant_period
  ON public.hr_evaluation_runs(tenant_id, period_config_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hr_evaluation_employee_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.hr_evaluation_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  kpi_score numeric(5,2),
  manager_score numeric(5,2),
  peer_score numeric(5,2),
  subordinate_score numeric(5,2),
  self_score numeric(5,2),
  final_score numeric(5,2),
  score_band text,
  result_status text NOT NULL DEFAULT 'draft' CHECK (result_status IN ('draft', 'ready', 'published', 'excluded')),
  recommendation text,
  notes text,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_evaluation_employee_results_run_employee_key UNIQUE (run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_evaluation_results_tenant_run
  ON public.hr_evaluation_employee_results(tenant_id, run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_evaluation_results_tenant_status
  ON public.hr_evaluation_employee_results(tenant_id, result_status, final_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_hr_evaluation_results_employee
  ON public.hr_evaluation_employee_results(employee_id, created_at DESC);

ALTER TABLE public.hr_evaluation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_evaluation_employee_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR evaluation runs tenant read" ON public.hr_evaluation_runs;
CREATE POLICY "HR evaluation runs tenant read"
ON public.hr_evaluation_runs
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "HR evaluation runs tenant write" ON public.hr_evaluation_runs;
CREATE POLICY "HR evaluation runs tenant write"
ON public.hr_evaluation_runs
FOR ALL
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

DROP POLICY IF EXISTS "HR evaluation results tenant read" ON public.hr_evaluation_employee_results;
CREATE POLICY "HR evaluation results tenant read"
ON public.hr_evaluation_employee_results
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "HR evaluation results tenant write" ON public.hr_evaluation_employee_results;
CREATE POLICY "HR evaluation results tenant write"
ON public.hr_evaluation_employee_results
FOR ALL
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

DROP TRIGGER IF EXISTS update_hr_evaluation_runs_updated_at ON public.hr_evaluation_runs;
CREATE TRIGGER update_hr_evaluation_runs_updated_at
BEFORE UPDATE ON public.hr_evaluation_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_hr_evaluation_employee_results_updated_at ON public.hr_evaluation_employee_results;
CREATE TRIGGER update_hr_evaluation_employee_results_updated_at
BEFORE UPDATE ON public.hr_evaluation_employee_results
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

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
        WHEN 'published' THEN 1
        WHEN 'in_review' THEN 2
        WHEN 'draft' THEN 3
        ELSE 4
      END,
      COALESCE(r.published_at, r.updated_at, r.created_at) DESC
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
