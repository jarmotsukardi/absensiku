-- HR/Payroll Phase-3b schema
-- Scope:
-- 1) Tax compliance tracking
-- 2) Report snapshots and publication
-- 3) Payroll audit log with trace/log reference

CREATE TABLE IF NOT EXISTS public.payroll_tax_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  filing_code text NOT NULL,
  filing_type text NOT NULL DEFAULT 'pph21' CHECK (filing_type IN ('pph21', 'bpjs_kesehatan', 'bpjs_tk', 'other')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'submitted', 'paid', 'revised', 'failed')),
  due_date date,
  submitted_at timestamptz,
  paid_at timestamptz,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  trace_id text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_tax_filings_total_amount_nonnegative CHECK (total_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_tax_filings_tenant_filing_code
  ON public.payroll_tax_filings(tenant_id, filing_code);
CREATE INDEX IF NOT EXISTS idx_payroll_tax_filings_tenant_status
  ON public.payroll_tax_filings(tenant_id, status, due_date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_tax_filings_trace
  ON public.payroll_tax_filings(tenant_id, trace_id);

CREATE TABLE IF NOT EXISTS public.payroll_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  report_type text NOT NULL DEFAULT 'summary' CHECK (report_type IN ('summary', 'cost_center', 'bank_transfer', 'tax', 'journal', 'custom')),
  snapshot_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'published', 'archived', 'failed')),
  file_url text,
  generated_at timestamptz,
  trace_id text,
  log_id text,
  notes text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_report_snapshots_tenant_status
  ON public.payroll_report_snapshots(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_report_snapshots_tenant_type
  ON public.payroll_report_snapshots(tenant_id, report_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_report_snapshots_trace_log
  ON public.payroll_report_snapshots(tenant_id, trace_id, log_id);

CREATE TABLE IF NOT EXISTS public.payroll_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id text,
  action_type text NOT NULL,
  action_label text NOT NULL,
  actor_user_id uuid,
  actor_role text,
  log_id text NOT NULL,
  trace_id text,
  before_state jsonb,
  after_state jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_tenant_created_at
  ON public.payroll_audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_tenant_entity
  ON public.payroll_audit_logs(tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_logs_trace_log
  ON public.payroll_audit_logs(tenant_id, trace_id, log_id);

ALTER TABLE public.payroll_tax_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll tax filings tenant read" ON public.payroll_tax_filings;
CREATE POLICY "Payroll tax filings tenant read"
ON public.payroll_tax_filings
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll tax filings tenant write" ON public.payroll_tax_filings;
CREATE POLICY "Payroll tax filings tenant write"
ON public.payroll_tax_filings
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

DROP POLICY IF EXISTS "Payroll report snapshots tenant read" ON public.payroll_report_snapshots;
CREATE POLICY "Payroll report snapshots tenant read"
ON public.payroll_report_snapshots
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll report snapshots tenant write" ON public.payroll_report_snapshots;
CREATE POLICY "Payroll report snapshots tenant write"
ON public.payroll_report_snapshots
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

DROP POLICY IF EXISTS "Payroll audit logs tenant read" ON public.payroll_audit_logs;
CREATE POLICY "Payroll audit logs tenant read"
ON public.payroll_audit_logs
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll audit logs tenant write" ON public.payroll_audit_logs;
CREATE POLICY "Payroll audit logs tenant write"
ON public.payroll_audit_logs
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

DROP TRIGGER IF EXISTS update_payroll_tax_filings_updated_at ON public.payroll_tax_filings;
CREATE TRIGGER update_payroll_tax_filings_updated_at
BEFORE UPDATE ON public.payroll_tax_filings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_report_snapshots_updated_at ON public.payroll_report_snapshots;
CREATE TRIGGER update_payroll_report_snapshots_updated_at
BEFORE UPDATE ON public.payroll_report_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
