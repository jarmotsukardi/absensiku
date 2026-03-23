-- Split tax components into dedicated PPN/PPH columns for invoice + financial ledger.
-- Keep legacy vat_* columns for backward compatibility.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ppn_percentage NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pph_percentage NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pph_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.financial_ledger
  ADD COLUMN IF NOT EXISTS ppn_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pph_amount NUMERIC NOT NULL DEFAULT 0;

-- Ensure billing setting for PPH exists.
INSERT INTO public.billing_settings (setting_key, setting_value, description)
SELECT
  'pph_percentage',
  '{"value":2}'::jsonb,
  'Persentase PPH untuk komponen pajak billing internal'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.billing_settings
  WHERE setting_key = 'pph_percentage'
);

-- Backfill invoice tax percentages first.
UPDATE public.invoices
SET
  ppn_percentage = CASE
    WHEN COALESCE(vat_percentage, 0) <= 0 THEN 0
    WHEN COALESCE(vat_percentage, 0) <= 11 THEN COALESCE(vat_percentage, 0)
    ELSE 11
  END,
  pph_percentage = GREATEST(
    COALESCE(vat_percentage, 0)
    - CASE
        WHEN COALESCE(vat_percentage, 0) <= 0 THEN 0
        WHEN COALESCE(vat_percentage, 0) <= 11 THEN COALESCE(vat_percentage, 0)
        ELSE 11
      END,
    0
  );

-- Backfill invoice tax amounts using legacy vat_amount as source-of-truth.
UPDATE public.invoices
SET
  ppn_amount = CASE
    WHEN COALESCE(vat_amount, 0) <= 0 THEN 0
    WHEN COALESCE(vat_percentage, 0) <= 0 THEN COALESCE(vat_amount, 0)
    ELSE ROUND(COALESCE(vat_amount, 0) * (COALESCE(ppn_percentage, 0) / NULLIF(COALESCE(vat_percentage, 0), 0)), 0)
  END,
  pph_amount = GREATEST(
    COALESCE(vat_amount, 0)
    - CASE
        WHEN COALESCE(vat_amount, 0) <= 0 THEN 0
        WHEN COALESCE(vat_percentage, 0) <= 0 THEN COALESCE(vat_amount, 0)
        ELSE ROUND(COALESCE(vat_amount, 0) * (COALESCE(ppn_percentage, 0) / NULLIF(COALESCE(vat_percentage, 0), 0)), 0)
      END,
    0
  );

-- Backfill ledger from linked invoice when available.
UPDATE public.financial_ledger fl
SET
  ppn_amount = COALESCE(inv.ppn_amount, 0),
  pph_amount = COALESCE(inv.pph_amount, 0)
FROM public.invoices inv
WHERE fl.invoice_id = inv.id;

-- Backfill standalone ledger rows without linked invoice.
UPDATE public.financial_ledger
SET
  ppn_amount = COALESCE(vat_amount, 0),
  pph_amount = 0
WHERE invoice_id IS NULL;

CREATE OR REPLACE FUNCTION public.fill_financial_ledger_tax_components()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_ppn numeric := 0;
  v_invoice_pph numeric := 0;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT COALESCE(ppn_amount, 0), COALESCE(pph_amount, 0)
    INTO v_invoice_ppn, v_invoice_pph
    FROM public.invoices
    WHERE id = NEW.invoice_id;
  END IF;

  IF COALESCE(NEW.ppn_amount, 0) = 0 AND COALESCE(NEW.pph_amount, 0) = 0 THEN
    IF v_invoice_ppn > 0 OR v_invoice_pph > 0 THEN
      NEW.ppn_amount := v_invoice_ppn;
      NEW.pph_amount := v_invoice_pph;
    ELSE
      NEW.ppn_amount := COALESCE(NEW.vat_amount, 0);
      NEW.pph_amount := 0;
    END IF;
  END IF;

  IF COALESCE(NEW.vat_amount, 0) = 0 AND (COALESCE(NEW.ppn_amount, 0) > 0 OR COALESCE(NEW.pph_amount, 0) > 0) THEN
    NEW.vat_amount := COALESCE(NEW.ppn_amount, 0) + COALESCE(NEW.pph_amount, 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_financial_ledger_tax_components ON public.financial_ledger;
CREATE TRIGGER trg_fill_financial_ledger_tax_components
BEFORE INSERT OR UPDATE ON public.financial_ledger
FOR EACH ROW
EXECUTE FUNCTION public.fill_financial_ledger_tax_components();

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
    OR NEW.ppn_amount IS DISTINCT FROM OLD.ppn_amount
    OR NEW.pph_amount IS DISTINCT FROM OLD.pph_amount
    OR NEW.ppn_percentage IS DISTINCT FROM OLD.ppn_percentage
    OR NEW.pph_percentage IS DISTINCT FROM OLD.pph_percentage
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

CREATE OR REPLACE FUNCTION public.create_pending_streak_invoice(
  p_tenant_id uuid,
  p_grace_days integer DEFAULT 7
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_tenant_id uuid;
  v_existing_invoice_id uuid;
  v_employee_count integer := 1;
  v_price_per_employee numeric := 15000;
  v_subscription_price_per_employee numeric := null;
  v_ppn_percentage numeric := 11;
  v_pph_percentage numeric := 2;
  v_tax_percentage numeric := 13;
  v_subtotal numeric;
  v_ppn_amount numeric;
  v_pph_amount numeric;
  v_vat_amount numeric;
  v_gross_amount numeric;
  v_invoice_number text;
  v_due_date date;
  v_invoice_id uuid;
  v_invoice_notes text;
BEGIN
  IF v_actor_id IS NOT NULL THEN
    IF NOT is_super_admin(v_actor_id) THEN
      v_actor_tenant_id := get_user_tenant_id(v_actor_id);
      IF v_actor_tenant_id IS NULL OR v_actor_tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'forbidden';
      END IF;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('streak_invoice:' || p_tenant_id::text));

  SELECT id
  INTO v_existing_invoice_id
  FROM public.invoices
  WHERE tenant_id = p_tenant_id
    AND status IN ('PENDING', 'AWAITING_VERIFICATION')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_invoice_id IS NOT NULL THEN
    RETURN v_existing_invoice_id;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_employee_count
  FROM public.employees
  WHERE tenant_id = p_tenant_id
    AND is_active = true;

  v_employee_count := GREATEST(COALESCE(v_employee_count, 0), 1);

  SELECT s.price_per_employee
  INTO v_subscription_price_per_employee
  FROM public.subscriptions s
  WHERE s.tenant_id = p_tenant_id
    AND s.price_per_employee IS NOT NULL
    AND s.price_per_employee > 0
  ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_subscription_price_per_employee IS NOT NULL THEN
    v_price_per_employee := v_subscription_price_per_employee;
  ELSE
    SELECT COALESCE(
      CASE
        WHEN jsonb_typeof(setting_value->'amount') = 'number' THEN (setting_value->>'amount')::numeric
        WHEN (setting_value->>'amount') ~ '^[0-9]+(\.[0-9]+)?$' THEN (setting_value->>'amount')::numeric
        WHEN jsonb_typeof(setting_value->'value') = 'number' THEN (setting_value->>'value')::numeric
        WHEN (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' THEN (setting_value->>'value')::numeric
        ELSE NULL
      END,
      15000
    )
    INTO v_price_per_employee
    FROM public.billing_settings
    WHERE setting_key = 'price_per_employee'
    LIMIT 1;
  END IF;

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(setting_value->'value') = 'number' THEN (setting_value->>'value')::numeric
      WHEN (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' THEN (setting_value->>'value')::numeric
      ELSE NULL
    END,
    11
  )
  INTO v_ppn_percentage
  FROM public.billing_settings
  WHERE setting_key = 'vat_percentage'
  LIMIT 1;

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(setting_value->'value') = 'number' THEN (setting_value->>'value')::numeric
      WHEN (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' THEN (setting_value->>'value')::numeric
      ELSE NULL
    END,
    2
  )
  INTO v_pph_percentage
  FROM public.billing_settings
  WHERE setting_key = 'pph_percentage'
  LIMIT 1;

  v_tax_percentage := v_ppn_percentage + v_pph_percentage;
  v_subtotal := v_employee_count * v_price_per_employee;
  v_ppn_amount := ROUND(v_subtotal * (v_ppn_percentage / 100), 0);
  v_pph_amount := ROUND(v_subtotal * (v_pph_percentage / 100), 0);
  v_vat_amount := v_ppn_amount + v_pph_amount;
  v_gross_amount := v_subtotal + v_vat_amount;
  v_due_date := CURRENT_DATE + GREATEST(COALESCE(p_grace_days, 7), 0);

  SELECT public.generate_invoice_number() INTO v_invoice_number;
  IF COALESCE(v_invoice_number, '') = '' THEN
    v_invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYYMM') || '-AUTO' || TO_CHAR(NOW(), 'DDHH24MISS');
  END IF;

  v_invoice_notes := CASE
    WHEN v_subscription_price_per_employee IS NOT NULL THEN 'Tagihan otomatis: target streak tercapai (harga negosiasi B2B)'
    ELSE 'Tagihan otomatis: target streak tercapai'
  END;

  INSERT INTO public.invoices (
    tenant_id,
    invoice_number,
    package_name,
    package_duration_months,
    employee_count,
    price_per_employee,
    subtotal,
    discount_amount,
    vat_percentage,
    vat_amount,
    ppn_percentage,
    pph_percentage,
    ppn_amount,
    pph_amount,
    gross_amount,
    xendit_fee,
    net_amount,
    status,
    payment_method_type,
    issue_date,
    due_date,
    notes
  )
  VALUES (
    p_tenant_id,
    v_invoice_number,
    'Streak Billing',
    1,
    v_employee_count,
    v_price_per_employee,
    v_subtotal,
    0,
    v_tax_percentage,
    v_vat_amount,
    v_ppn_percentage,
    v_pph_percentage,
    v_ppn_amount,
    v_pph_amount,
    v_gross_amount,
    0,
    v_gross_amount,
    'PENDING',
    'MANUAL_TRANSFER',
    CURRENT_DATE,
    v_due_date,
    v_invoice_notes
  )
  RETURNING id INTO v_invoice_id;

  UPDATE public.subscriptions
  SET
    last_invoice_id = v_invoice_id,
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id;

  RETURN v_invoice_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_or_get_manual_invoice(
  p_tenant_id UUID,
  p_subscription_id UUID,
  p_package_id UUID,
  p_package_name TEXT,
  p_package_duration_months INTEGER,
  p_package_discount_percentage NUMERIC,
  p_employee_count INTEGER,
  p_price_per_employee NUMERIC,
  p_subtotal NUMERIC,
  p_discount_amount NUMERIC,
  p_vat_percentage NUMERIC,
  p_vat_amount NUMERIC,
  p_gross_amount NUMERIC,
  p_xendit_fee NUMERIC,
  p_net_amount NUMERIC,
  p_due_date DATE,
  p_unique_code INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_existing public.invoices%ROWTYPE;
  v_inserted public.invoices%ROWTYPE;
  v_invoice_number TEXT;
  v_ppn_percentage NUMERIC := 11;
  v_pph_percentage NUMERIC := 2;
  v_internal_tax_percentage NUMERIC := 13;
  v_subtotal NUMERIC;
  v_discount_amount NUMERIC;
  v_base_amount NUMERIC;
  v_ppn_amount NUMERIC;
  v_pph_amount NUMERIC;
  v_internal_tax_amount NUMERIC;
  v_gross_amount NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT (
    p_tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Forbidden tenant access';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT, 20260221));

  SELECT *
  INTO v_existing
  FROM public.invoices
  WHERE tenant_id = p_tenant_id
    AND status IN ('PENDING', 'AWAITING_VERIFICATION')
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'invoice_number', v_existing.invoice_number,
      'gross_amount', v_existing.gross_amount,
      'status', v_existing.status,
      'due_date', v_existing.due_date,
      'payment_method_type', v_existing.payment_method_type,
      'unique_code', COALESCE((v_existing.metadata->>'unique_code')::INTEGER, 0),
      'reused', TRUE
    );
  END IF;

  SELECT public.generate_invoice_number() INTO v_invoice_number;
  IF v_invoice_number IS NULL OR btrim(v_invoice_number) = '' THEN
    RAISE EXCEPTION 'Nomor faktur otomatis tidak tersedia';
  END IF;

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(setting_value->'value') = 'number' THEN (setting_value->>'value')::numeric
      WHEN (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' THEN (setting_value->>'value')::numeric
      ELSE NULL
    END,
    11
  )
  INTO v_ppn_percentage
  FROM public.billing_settings
  WHERE setting_key = 'vat_percentage'
  LIMIT 1;

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(setting_value->'value') = 'number' THEN (setting_value->>'value')::numeric
      WHEN (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' THEN (setting_value->>'value')::numeric
      ELSE NULL
    END,
    2
  )
  INTO v_pph_percentage
  FROM public.billing_settings
  WHERE setting_key = 'pph_percentage'
  LIMIT 1;

  v_internal_tax_percentage := v_ppn_percentage + v_pph_percentage;
  v_subtotal := GREATEST(COALESCE(p_subtotal, 0), 0);
  v_discount_amount := GREATEST(COALESCE(p_discount_amount, 0), 0);
  v_base_amount := GREATEST(v_subtotal - v_discount_amount, 0);
  v_ppn_amount := ROUND(v_base_amount * (v_ppn_percentage / 100), 0);
  v_pph_amount := ROUND(v_base_amount * (v_pph_percentage / 100), 0);
  v_internal_tax_amount := v_ppn_amount + v_pph_amount;
  v_gross_amount := v_base_amount + v_internal_tax_amount + GREATEST(COALESCE(p_unique_code, 0), 0);

  INSERT INTO public.invoices (
    tenant_id,
    subscription_id,
    package_id,
    package_name,
    package_duration_months,
    package_discount_percentage,
    employee_count,
    price_per_employee,
    subtotal,
    discount_amount,
    vat_percentage,
    vat_amount,
    ppn_percentage,
    pph_percentage,
    ppn_amount,
    pph_amount,
    gross_amount,
    xendit_fee,
    net_amount,
    invoice_number,
    status,
    payment_method_type,
    due_date,
    metadata,
    notes
  )
  VALUES (
    p_tenant_id,
    p_subscription_id,
    p_package_id,
    p_package_name,
    p_package_duration_months,
    p_package_discount_percentage,
    p_employee_count,
    p_price_per_employee,
    v_subtotal,
    v_discount_amount,
    v_internal_tax_percentage,
    v_internal_tax_amount,
    v_ppn_percentage,
    v_pph_percentage,
    v_ppn_amount,
    v_pph_amount,
    v_gross_amount,
    0,
    v_gross_amount,
    v_invoice_number,
    'PENDING',
    'MANUAL_TRANSFER',
    p_due_date,
    jsonb_build_object('unique_code', p_unique_code),
    COALESCE(p_notes, format('Angka unik: %s', p_unique_code))
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'invoice_number', v_inserted.invoice_number,
    'gross_amount', v_inserted.gross_amount,
    'status', v_inserted.status,
    'due_date', v_inserted.due_date,
    'payment_method_type', v_inserted.payment_method_type,
    'unique_code', p_unique_code,
    'reused', FALSE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_or_get_manual_invoice(
  UUID,
  UUID,
  UUID,
  TEXT,
  INTEGER,
  NUMERIC,
  INTEGER,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  DATE,
  INTEGER,
  TEXT
) TO authenticated;
