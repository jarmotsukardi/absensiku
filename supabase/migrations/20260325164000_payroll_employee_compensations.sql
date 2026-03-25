-- Payroll employee compensation master (tenant-aware + RLS)

CREATE TABLE IF NOT EXISTS public.payroll_employee_compensations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  base_salary numeric(14,2) NOT NULL DEFAULT 0,
  ter_category text NOT NULL DEFAULT 'A' CHECK (ter_category IN ('A', 'B', 'C')),
  jkk_risk_level text,
  region_level text NOT NULL DEFAULT 'UMP' CHECK (region_level IN ('UMP', 'UMK')),
  region_code text,
  region_name text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_employee_compensations_salary_nonnegative CHECK (base_salary >= 0),
  CONSTRAINT payroll_employee_compensations_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_employee_compensations_employee_effective
  ON public.payroll_employee_compensations(tenant_id, employee_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_payroll_employee_compensations_active
  ON public.payroll_employee_compensations(tenant_id, employee_id, is_active, effective_from DESC);

ALTER TABLE public.payroll_employee_compensations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll employee compensations tenant read" ON public.payroll_employee_compensations;
CREATE POLICY "Payroll employee compensations tenant read"
ON public.payroll_employee_compensations
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll employee compensations tenant write" ON public.payroll_employee_compensations;
CREATE POLICY "Payroll employee compensations tenant write"
ON public.payroll_employee_compensations
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

DROP TRIGGER IF EXISTS update_payroll_employee_compensations_updated_at ON public.payroll_employee_compensations;
CREATE TRIGGER update_payroll_employee_compensations_updated_at
BEFORE UPDATE ON public.payroll_employee_compensations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
