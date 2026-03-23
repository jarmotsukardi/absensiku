-- Harden manual payment verification for partial/revision flow.
-- 1) Expand org-admin invoice status guard for new verification statuses.
-- 2) Add DB guard to prevent verified total > invoice gross.
-- 3) Add audit RPC for claim-vs-verification mismatch.

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
      (
        OLD.status IN (
          'PENDING',
          'AWAITING_VERIFICATION',
          'AWAITING_VERIFICATION_FULL',
          'PENDING_VERIFICATION_PARTIAL',
          'PARTIALLY_PAID',
          'REJECTED_NEEDS_REVISION',
          'CANCELLED'
        )
        AND NEW.status IN ('AWAITING_VERIFICATION', 'AWAITING_VERIFICATION_FULL', 'PENDING_VERIFICATION_PARTIAL')
      )
      OR (
        OLD.status = 'PENDING'
        AND NEW.status = 'CANCELLED'
      )
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

CREATE OR REPLACE FUNCTION public.guard_manual_payment_verified_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
  v_invoice_gross NUMERIC := 0;
  v_existing_verified_total NUMERIC := 0;
  v_new_verified NUMERIC := 0;
BEGIN
  IF LOWER(COALESCE(NEW.status, '')) <> 'verified' THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NULL OR NEW.invoice_number IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT inv.id, inv.gross_amount
  INTO v_invoice_id, v_invoice_gross
  FROM public.invoices inv
  WHERE inv.tenant_id = NEW.tenant_id
    AND inv.invoice_number = NEW.invoice_number
  ORDER BY inv.created_at DESC
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice manual payment tidak ditemukan (tenant_id=% invoice_number=%)', NEW.tenant_id, NEW.invoice_number;
  END IF;

  v_new_verified := COALESCE(NEW.verified_amount, NEW.amount, 0);

  SELECT COALESCE(SUM(COALESCE(mp.verified_amount, mp.amount, 0)), 0)
  INTO v_existing_verified_total
  FROM public.manual_payments mp
  WHERE mp.tenant_id = NEW.tenant_id
    AND mp.invoice_number = NEW.invoice_number
    AND LOWER(COALESCE(mp.status, '')) = 'verified'
    AND mp.id <> NEW.id;

  IF v_existing_verified_total + v_new_verified > COALESCE(v_invoice_gross, 0) THEN
    RAISE EXCEPTION 'Total pembayaran terverifikasi melebihi total tagihan (verified_total=% invoice_gross=%)',
      v_existing_verified_total + v_new_verified,
      v_invoice_gross;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_manual_payment_verified_total ON public.manual_payments;
CREATE TRIGGER trg_guard_manual_payment_verified_total
BEFORE INSERT OR UPDATE OF status, verified_amount, amount
ON public.manual_payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_manual_payment_verified_total();

CREATE OR REPLACE FUNCTION public.log_manual_payment_verification_audit(
  p_invoice_id UUID,
  p_manual_payment_id UUID,
  p_tenant_id UUID,
  p_claimed_amount INTEGER,
  p_verified_amount INTEGER,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    table_name,
    record_id,
    new_values
  ) VALUES (
    p_tenant_id,
    auth.uid(),
    CASE
      WHEN p_decision = 'reject' THEN 'MANUAL_PAYMENT_REJECTED_NEEDS_REVISION'
      ELSE 'MANUAL_PAYMENT_VERIFICATION_MISMATCH'
    END,
    'manual_payments',
    p_manual_payment_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'manual_payment_id', p_manual_payment_id,
      'claimed_amount', p_claimed_amount,
      'verified_amount', p_verified_amount,
      'decision', p_decision,
      'notes', p_notes,
      'created_at', now()
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_manual_payment_verification_audit(UUID, UUID, UUID, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;
