-- Allow org admin to cancel own pending invoice with audit note.
-- Keep financial fields immutable and forbid paid/verified mutations.

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
        OLD.status IN ('PENDING', 'AWAITING_VERIFICATION', 'CANCELLED')
        AND NEW.status = 'AWAITING_VERIFICATION'
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
