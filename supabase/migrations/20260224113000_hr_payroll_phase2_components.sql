-- HR/Payroll Phase-2a schema
-- Scope:
-- 1) Payroll income components
-- 2) Payroll deduction components

CREATE TABLE IF NOT EXISTS public.payroll_income_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  component_type text NOT NULL DEFAULT 'fixed' CHECK (component_type IN ('fixed', 'variable', 'formula')),
  calculation_mode text NOT NULL DEFAULT 'fixed_amount' CHECK (calculation_mode IN ('fixed_amount', 'percentage', 'formula')),
  default_amount numeric(14,2) NOT NULL DEFAULT 0,
  is_taxable boolean NOT NULL DEFAULT true,
  is_mandatory boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_income_components_default_amount_nonnegative CHECK (default_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_income_components_tenant_code
  ON public.payroll_income_components(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_payroll_income_components_tenant_active
  ON public.payroll_income_components(tenant_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.payroll_deduction_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  component_type text NOT NULL DEFAULT 'fixed' CHECK (component_type IN ('fixed', 'variable', 'installment')),
  calculation_mode text NOT NULL DEFAULT 'fixed_amount' CHECK (calculation_mode IN ('fixed_amount', 'percentage', 'formula')),
  default_amount numeric(14,2) NOT NULL DEFAULT 0,
  is_taxable boolean NOT NULL DEFAULT false,
  is_mandatory boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_deduction_components_default_amount_nonnegative CHECK (default_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_deduction_components_tenant_code
  ON public.payroll_deduction_components(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_payroll_deduction_components_tenant_active
  ON public.payroll_deduction_components(tenant_id, is_active, sort_order);

ALTER TABLE public.payroll_income_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_deduction_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll income components tenant read" ON public.payroll_income_components;
CREATE POLICY "Payroll income components tenant read"
ON public.payroll_income_components
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll income components tenant write" ON public.payroll_income_components;
CREATE POLICY "Payroll income components tenant write"
ON public.payroll_income_components
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

DROP POLICY IF EXISTS "Payroll deduction components tenant read" ON public.payroll_deduction_components;
CREATE POLICY "Payroll deduction components tenant read"
ON public.payroll_deduction_components
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll deduction components tenant write" ON public.payroll_deduction_components;
CREATE POLICY "Payroll deduction components tenant write"
ON public.payroll_deduction_components
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

DROP TRIGGER IF EXISTS update_payroll_income_components_updated_at ON public.payroll_income_components;
CREATE TRIGGER update_payroll_income_components_updated_at
BEFORE UPDATE ON public.payroll_income_components
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_deduction_components_updated_at ON public.payroll_deduction_components;
CREATE TRIGGER update_payroll_deduction_components_updated_at
BEFORE UPDATE ON public.payroll_deduction_components
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
