-- HR/Payroll Phase-3a schema
-- Scope:
-- 1) Payroll slips distribution
-- 2) Payroll payment batches and reconciliation

CREATE TABLE IF NOT EXISTS public.payroll_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  slip_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'published', 'failed')),
  pdf_url text,
  distribution_channel text NOT NULL DEFAULT 'portal' CHECK (distribution_channel IN ('portal', 'email', 'whatsapp', 'manual')),
  distributed_at timestamptz,
  trace_id text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_slips_tenant_slip_number
  ON public.payroll_slips(tenant_id, slip_number);
CREATE INDEX IF NOT EXISTS idx_payroll_slips_tenant_run_status
  ON public.payroll_slips(tenant_id, run_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_slips_trace
  ON public.payroll_slips(tenant_id, trace_id);

CREATE TABLE IF NOT EXISTS public.payroll_payment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  bank_name text,
  bank_file_url text,
  total_employees integer NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'draft' CHECK (payment_status IN ('draft', 'queued', 'processing', 'completed', 'failed', 'reconciled')),
  paid_at timestamptz,
  reconciled_at timestamptz,
  trace_id text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_payment_batches_total_employees_nonnegative CHECK (total_employees >= 0),
  CONSTRAINT payroll_payment_batches_total_amount_nonnegative CHECK (total_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_payment_batches_tenant_batch_number
  ON public.payroll_payment_batches(tenant_id, batch_number);
CREATE INDEX IF NOT EXISTS idx_payroll_payment_batches_tenant_status
  ON public.payroll_payment_batches(tenant_id, payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_payment_batches_trace
  ON public.payroll_payment_batches(tenant_id, trace_id);

ALTER TABLE public.payroll_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_payment_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payroll slips tenant read" ON public.payroll_slips;
CREATE POLICY "Payroll slips tenant read"
ON public.payroll_slips
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll slips tenant write" ON public.payroll_slips;
CREATE POLICY "Payroll slips tenant write"
ON public.payroll_slips
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

DROP POLICY IF EXISTS "Payroll payment batches tenant read" ON public.payroll_payment_batches;
CREATE POLICY "Payroll payment batches tenant read"
ON public.payroll_payment_batches
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Payroll payment batches tenant write" ON public.payroll_payment_batches;
CREATE POLICY "Payroll payment batches tenant write"
ON public.payroll_payment_batches
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

DROP TRIGGER IF EXISTS update_payroll_slips_updated_at ON public.payroll_slips;
CREATE TRIGGER update_payroll_slips_updated_at
BEFORE UPDATE ON public.payroll_slips
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_payroll_payment_batches_updated_at ON public.payroll_payment_batches;
CREATE TRIGGER update_payroll_payment_batches_updated_at
BEFORE UPDATE ON public.payroll_payment_batches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
