-- HR/Payroll Phase-1 schema baseline (tenant-aware + RLS)
-- Scope:
-- 1) HR contracts
-- 2) Payroll policies
-- 3) Payroll periods
-- 4) Payroll validation runs

CREATE TABLE IF NOT EXISTS public.hr_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contract_number text,
  contract_type text NOT NULL DEFAULT 'PKWT' CHECK (contract_type IN ('PKWT', 'PKWTT', 'MAGANG', 'KONTRAK_LAIN')),
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'ended', 'terminated')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_contracts_date_order_check CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_hr_contracts_tenant_id ON public.hr_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_contracts_employee_id ON public.hr_contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_contracts_status ON public.hr_contracts(status);

CREATE TABLE IF NOT EXISTS public.payroll_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cutoff_day smallint NOT NULL DEFAULT 25 CHECK (cutoff_day BETWEEN 1 AND 31),
  prorate_enabled boolean NOT NULL DEFAULT true,
  rounding_mode text NOT NULL DEFAULT 'nearest_100' CHECK (rounding_mode IN ('none', 'up', 'down', 'nearest_1', 'nearest_10', 'nearest_100', 'nearest_1000')),
  overtime_source text NOT NULL DEFAULT 'attendance' CHECK (overtime_source IN ('attendance', 'manual', 'hybrid')),
  late_penalty_enabled boolean NOT NULL DEFAULT false,
  late_penalty_per_minute numeric(14,2) NOT NULL DEFAULT 0,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_policies_late_penalty_nonnegative CHECK (late_penalty_per_minute >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_policies_tenant_effective_date
  ON public.payroll_policies(tenant_id, effective_date, is_active);
CREATE INDEX IF NOT EXISTS idx_payroll_policies_tenant_id ON public.payroll_policies(tenant_id);

CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  cutoff_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'paid', 'archived')),
  locked_at timestamptz,
  locked_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz,
  paid_by uuid,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_periods_date_order_check CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_periods_tenant_period_key
  ON public.payroll_periods(tenant_id, period_key);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_tenant_status
  ON public.payroll_periods(tenant_id, status);

CREATE TABLE IF NOT EXISTS public.payroll_validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'warning' CHECK (status IN ('passed', 'failed', 'warning')),
  issue_count integer NOT NULL DEFAULT 0,
  critical_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace_id text,
  executed_by uuid,
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_validation_runs_issue_nonnegative CHECK (issue_count >= 0),
  CONSTRAINT payroll_validation_runs_critical_nonnegative CHECK (critical_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_payroll_validation_runs_tenant_period
  ON public.payroll_validation_runs(tenant_id, period_id, executed_at DESC);

ALTER TABLE public.hr_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_validation_runs ENABLE ROW LEVEL SECURITY;

-- hr_contracts policies
DROP POLICY IF EXISTS "HR contracts tenant read" ON public.hr_contracts;
CREATE POLICY "HR contracts tenant read"
ON public.hr_contracts
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "HR contracts tenant write" ON public.hr_contracts;
CREATE POLICY "HR contracts tenant write"
ON public.hr_contracts
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

-- payroll_policies policies
DROP POLICY IF EXISTS "Payroll policies tenant read" ON public.payroll_policies;
CREATE POLICY "Payroll policies tenant read"
ON public.payroll_policies
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll policies tenant write" ON public.payroll_policies;
CREATE POLICY "Payroll policies tenant write"
ON public.payroll_policies
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

-- payroll_periods policies
DROP POLICY IF EXISTS "Payroll periods tenant read" ON public.payroll_periods;
CREATE POLICY "Payroll periods tenant read"
ON public.payroll_periods
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll periods tenant write" ON public.payroll_periods;
CREATE POLICY "Payroll periods tenant write"
ON public.payroll_periods
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

-- payroll_validation_runs policies
DROP POLICY IF EXISTS "Payroll validation runs tenant read" ON public.payroll_validation_runs;
CREATE POLICY "Payroll validation runs tenant read"
ON public.payroll_validation_runs
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll validation runs tenant write" ON public.payroll_validation_runs;
CREATE POLICY "Payroll validation runs tenant write"
ON public.payroll_validation_runs
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

DROP TRIGGER IF EXISTS update_hr_contracts_updated_at ON public.hr_contracts;
CREATE TRIGGER update_hr_contracts_updated_at
BEFORE UPDATE ON public.hr_contracts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_policies_updated_at ON public.payroll_policies;
CREATE TRIGGER update_payroll_policies_updated_at
BEFORE UPDATE ON public.payroll_policies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_periods_updated_at ON public.payroll_periods;
CREATE TRIGGER update_payroll_periods_updated_at
BEFORE UPDATE ON public.payroll_periods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
