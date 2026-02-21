-- Enable org billing payment proof submission from /org/billing.
-- 1) Storage bucket for proof upload
-- 2) Scoped invoice UPDATE policy for org admin
-- 3) Trigger guard so org admin cannot self-mark PAID or alter billing amounts

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authenticated can view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Org admin can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Org admin can update payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Org admin can delete payment proofs" ON storage.objects;

CREATE POLICY "Authenticated can view payment proofs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-proofs'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Org admin can upload payment proofs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

CREATE POLICY "Org admin can update payment proofs"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

CREATE POLICY "Org admin can delete payment proofs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'payment-proofs'
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Tenant admin can submit payment proof" ON public.invoices;
CREATE POLICY "Tenant admin can submit payment proof"
ON public.invoices FOR UPDATE
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.guard_invoice_update_for_org_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_jwt_role TEXT := LOWER(COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), ''));
BEGIN
  IF v_uid IS NULL OR v_jwt_role = 'service_role' OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_role(v_uid, 'admin_instansi'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id invoice tidak dapat diubah';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      OLD.status IN ('PENDING', 'AWAITING_VERIFICATION', 'CANCELLED')
      AND NEW.status = 'AWAITING_VERIFICATION'
    ) THEN
      RAISE EXCEPTION 'Perubahan status invoice tidak diizinkan untuk role admin_instansi';
    END IF;
  END IF;

  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
    OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
    OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
    RAISE EXCEPTION 'Field verifikasi invoice hanya dapat diubah super admin';
  END IF;

  IF NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
    OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
    OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
    OR NEW.vat_percentage IS DISTINCT FROM OLD.vat_percentage
    OR NEW.xendit_fee IS DISTINCT FROM OLD.xendit_fee
    OR NEW.price_per_employee IS DISTINCT FROM OLD.price_per_employee
    OR NEW.employee_count IS DISTINCT FROM OLD.employee_count
    OR NEW.package_id IS DISTINCT FROM OLD.package_id
    OR NEW.package_name IS DISTINCT FROM OLD.package_name
    OR NEW.package_duration_months IS DISTINCT FROM OLD.package_duration_months
    OR NEW.package_discount_percentage IS DISTINCT FROM OLD.package_discount_percentage THEN
    RAISE EXCEPTION 'Nilai finansial invoice tidak dapat diubah oleh admin_instansi';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_update_for_org_admin ON public.invoices;
CREATE TRIGGER trg_guard_invoice_update_for_org_admin
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.guard_invoice_update_for_org_admin();
