-- Split active invoice guard between centralized billing and individual billing.
-- Keep existing schema stable by using invoices.metadata.billing_scope + metadata.employee_id.

-- 1) Backfill missing billing_scope metadata to centralized for existing rows.
UPDATE public.invoices
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('billing_scope', 'centralized')
WHERE COALESCE(metadata->>'billing_scope', '') = '';

-- 2) Enforce default billing_scope for future inserts/metadata updates.
CREATE OR REPLACE FUNCTION public.ensure_invoice_billing_scope_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);

  IF COALESCE(NEW.metadata->>'billing_scope', '') = '' THEN
    NEW.metadata := NEW.metadata || jsonb_build_object('billing_scope', 'centralized');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_invoice_billing_scope_metadata ON public.invoices;
CREATE TRIGGER trg_ensure_invoice_billing_scope_metadata
BEFORE INSERT OR UPDATE OF metadata ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.ensure_invoice_billing_scope_metadata();

-- 3) Replace old active invoice uniqueness (tenant-wide) with split uniqueness:
--    - centralized: one active invoice per tenant
--    - individual : one active invoice per employee in tenant
DROP INDEX IF EXISTS idx_invoices_one_active_per_tenant_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_active_per_tenant_unique
ON public.invoices (tenant_id)
WHERE status IN ('PENDING', 'AWAITING_VERIFICATION')
  AND COALESCE(metadata->>'billing_scope', 'centralized') <> 'individual';

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_active_per_employee_individual
ON public.invoices (tenant_id, ((metadata->>'employee_id')))
WHERE status IN ('PENDING', 'AWAITING_VERIFICATION')
  AND metadata->>'billing_scope' = 'individual'
  AND NULLIF(metadata->>'employee_id', '') IS NOT NULL;
