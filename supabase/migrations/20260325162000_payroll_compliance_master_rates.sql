-- Payroll compliance master data: TER, BPJS, UMP/UMK (tenant-aware + RLS)

CREATE TABLE IF NOT EXISTS public.payroll_tax_ter_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('A', 'B', 'C')),
  income_from numeric(14,2) NOT NULL DEFAULT 0,
  income_to numeric(14,2),
  rate_percent numeric(7,4) NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_tax_ter_rates_income_range CHECK (income_to IS NULL OR income_to >= income_from),
  CONSTRAINT payroll_tax_ter_rates_rate_bounds CHECK (rate_percent >= 0 AND rate_percent <= 100),
  CONSTRAINT payroll_tax_ter_rates_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_tax_ter_rates_range
  ON public.payroll_tax_ter_rates(tenant_id, category, income_from, effective_from);
CREATE INDEX IF NOT EXISTS idx_payroll_tax_ter_rates_tenant_active
  ON public.payroll_tax_ter_rates(tenant_id, is_active, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.payroll_bpjs_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  program text NOT NULL CHECK (program IN ('kesehatan', 'jht', 'jkk', 'jkm', 'jp', 'jkp')),
  risk_level text,
  employer_rate_percent numeric(7,4) NOT NULL DEFAULT 0,
  employee_rate_percent numeric(7,4) NOT NULL DEFAULT 0,
  wage_cap numeric(14,2),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_bpjs_rates_rate_bounds CHECK (
    employer_rate_percent >= 0
    AND employee_rate_percent >= 0
    AND employer_rate_percent <= 100
    AND employee_rate_percent <= 100
  ),
  CONSTRAINT payroll_bpjs_rates_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT payroll_bpjs_rates_jkk_risk_required CHECK (
    (program = 'jkk' AND risk_level IS NOT NULL) OR (program <> 'jkk')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_bpjs_rates_key
  ON public.payroll_bpjs_rates(tenant_id, program, COALESCE(risk_level, ''), effective_from);
CREATE INDEX IF NOT EXISTS idx_payroll_bpjs_rates_tenant_active
  ON public.payroll_bpjs_rates(tenant_id, program, is_active, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.payroll_minimum_wages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  region_level text NOT NULL CHECK (region_level IN ('UMP', 'UMK')),
  region_code text NOT NULL,
  region_name text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_minimum_wages_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT payroll_minimum_wages_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_minimum_wages_region
  ON public.payroll_minimum_wages(tenant_id, region_level, region_code, effective_from);
CREATE INDEX IF NOT EXISTS idx_payroll_minimum_wages_tenant_active
  ON public.payroll_minimum_wages(tenant_id, region_level, is_active, effective_from DESC);

ALTER TABLE public.payroll_tax_ter_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_bpjs_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_minimum_wages ENABLE ROW LEVEL SECURITY;

-- payroll_tax_ter_rates policies
DROP POLICY IF EXISTS "Payroll TER rates tenant read" ON public.payroll_tax_ter_rates;
CREATE POLICY "Payroll TER rates tenant read"
ON public.payroll_tax_ter_rates
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll TER rates tenant write" ON public.payroll_tax_ter_rates;
CREATE POLICY "Payroll TER rates tenant write"
ON public.payroll_tax_ter_rates
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

-- payroll_bpjs_rates policies
DROP POLICY IF EXISTS "Payroll BPJS rates tenant read" ON public.payroll_bpjs_rates;
CREATE POLICY "Payroll BPJS rates tenant read"
ON public.payroll_bpjs_rates
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll BPJS rates tenant write" ON public.payroll_bpjs_rates;
CREATE POLICY "Payroll BPJS rates tenant write"
ON public.payroll_bpjs_rates
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

-- payroll_minimum_wages policies
DROP POLICY IF EXISTS "Payroll minimum wages tenant read" ON public.payroll_minimum_wages;
CREATE POLICY "Payroll minimum wages tenant read"
ON public.payroll_minimum_wages
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll minimum wages tenant write" ON public.payroll_minimum_wages;
CREATE POLICY "Payroll minimum wages tenant write"
ON public.payroll_minimum_wages
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

DROP TRIGGER IF EXISTS update_payroll_tax_ter_rates_updated_at ON public.payroll_tax_ter_rates;
CREATE TRIGGER update_payroll_tax_ter_rates_updated_at
BEFORE UPDATE ON public.payroll_tax_ter_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_bpjs_rates_updated_at ON public.payroll_bpjs_rates;
CREATE TRIGGER update_payroll_bpjs_rates_updated_at
BEFORE UPDATE ON public.payroll_bpjs_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_minimum_wages_updated_at ON public.payroll_minimum_wages;
CREATE TRIGGER update_payroll_minimum_wages_updated_at
BEFORE UPDATE ON public.payroll_minimum_wages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
