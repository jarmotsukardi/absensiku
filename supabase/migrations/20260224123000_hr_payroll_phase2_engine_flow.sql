-- HR/Payroll Phase-2b schema
-- Scope:
-- 1) Payroll variable inputs
-- 2) Payroll run engine records
-- 3) Payroll approval stages

CREATE TABLE IF NOT EXISTS public.payroll_variable_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  component_scope text NOT NULL DEFAULT 'income' CHECK (component_scope IN ('income', 'deduction')),
  component_code text NOT NULL,
  component_name text NOT NULL,
  input_type text NOT NULL DEFAULT 'adjustment' CHECK (input_type IN ('bonus', 'overtime', 'correction', 'allowance', 'deduction_adjustment', 'adjustment', 'other')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'integration', 'system')),
  trace_id text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_variable_inputs_tenant_period
  ON public.payroll_variable_inputs(tenant_id, period_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_variable_inputs_tenant_scope
  ON public.payroll_variable_inputs(tenant_id, component_scope, input_type);
CREATE INDEX IF NOT EXISTS idx_payroll_variable_inputs_trace
  ON public.payroll_variable_inputs(tenant_id, trace_id);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  run_sequence integer NOT NULL DEFAULT 1,
  run_type text NOT NULL DEFAULT 'simulation' CHECK (run_type IN ('simulation', 'final')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'paid', 'archived', 'failed', 'processing')),
  trace_id text,
  started_at timestamptz,
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_tenant_period_sequence
  ON public.payroll_runs(tenant_id, period_id, run_sequence);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant_status
  ON public.payroll_runs(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_trace
  ON public.payroll_runs(tenant_id, trace_id);

CREATE TABLE IF NOT EXISTS public.payroll_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  approval_stage text NOT NULL CHECK (approval_stage IN ('hr', 'finance', 'executive')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approver_user_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  comment text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_approvals_run_stage
  ON public.payroll_approvals(run_id, approval_stage);
CREATE INDEX IF NOT EXISTS idx_payroll_approvals_tenant_status
  ON public.payroll_approvals(tenant_id, status, approval_stage);

ALTER TABLE public.payroll_variable_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll variable inputs tenant read" ON public.payroll_variable_inputs;
CREATE POLICY "Payroll variable inputs tenant read"
ON public.payroll_variable_inputs
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll variable inputs tenant write" ON public.payroll_variable_inputs;
CREATE POLICY "Payroll variable inputs tenant write"
ON public.payroll_variable_inputs
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

DROP POLICY IF EXISTS "Payroll runs tenant read" ON public.payroll_runs;
CREATE POLICY "Payroll runs tenant read"
ON public.payroll_runs
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll runs tenant write" ON public.payroll_runs;
CREATE POLICY "Payroll runs tenant write"
ON public.payroll_runs
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

DROP POLICY IF EXISTS "Payroll approvals tenant read" ON public.payroll_approvals;
CREATE POLICY "Payroll approvals tenant read"
ON public.payroll_approvals
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll approvals tenant write" ON public.payroll_approvals;
CREATE POLICY "Payroll approvals tenant write"
ON public.payroll_approvals
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

DROP TRIGGER IF EXISTS update_payroll_variable_inputs_updated_at ON public.payroll_variable_inputs;
CREATE TRIGGER update_payroll_variable_inputs_updated_at
BEFORE UPDATE ON public.payroll_variable_inputs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_runs_updated_at ON public.payroll_runs;
CREATE TRIGGER update_payroll_runs_updated_at
BEFORE UPDATE ON public.payroll_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_approvals_updated_at ON public.payroll_approvals;
CREATE TRIGGER update_payroll_approvals_updated_at
BEFORE UPDATE ON public.payroll_approvals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
