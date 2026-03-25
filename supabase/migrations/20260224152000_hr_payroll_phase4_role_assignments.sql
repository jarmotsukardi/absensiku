-- HR/Payroll Phase-4 schema
-- Scope: per-user payroll role assignment for menu/route permission enforcement

CREATE TABLE IF NOT EXISTS public.payroll_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  payroll_role text NOT NULL CHECK (payroll_role IN ('payroll_admin', 'payroll_officer', 'payroll_finance', 'payroll_approver', 'payroll_auditor')),
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payroll_role_assignments UNIQUE (tenant_id, user_id, payroll_role)
);

CREATE INDEX IF NOT EXISTS idx_payroll_role_assignments_tenant_user
  ON public.payroll_role_assignments(tenant_id, user_id, is_active);

ALTER TABLE public.payroll_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll role assignments tenant read" ON public.payroll_role_assignments;
CREATE POLICY "Payroll role assignments tenant read"
ON public.payroll_role_assignments
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR tenant_id = public.get_user_tenant_id(auth.uid())
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Payroll role assignments tenant write" ON public.payroll_role_assignments;
CREATE POLICY "Payroll role assignments tenant write"
ON public.payroll_role_assignments
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

DROP TRIGGER IF EXISTS update_payroll_role_assignments_updated_at ON public.payroll_role_assignments;
CREATE TRIGGER update_payroll_role_assignments_updated_at
BEFORE UPDATE ON public.payroll_role_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
