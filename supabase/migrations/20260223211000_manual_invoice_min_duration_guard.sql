-- Enforce minimum billing duration for manual invoice flow
-- based on billing mode and tenant organization type.

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
  v_wallet_apply_result JSONB := '{}'::jsonb;
  v_tenant_billing_mode TEXT := 'centralized';
  v_tenant_org_type TEXT := 'perusahaan';
  v_min_duration_setting_key TEXT := 'individual_min_duration_months';
  v_min_duration_default INTEGER := 6;
  v_min_duration_months INTEGER := 1;
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
    v_wallet_apply_result := public.apply_wallet_to_invoice_if_possible(v_existing.id, auth.uid());

    SELECT * INTO v_existing FROM public.invoices WHERE id = v_existing.id LIMIT 1;

    RETURN jsonb_build_object(
      'id', v_existing.id,
      'invoice_number', v_existing.invoice_number,
      'gross_amount', v_existing.gross_amount,
      'status', v_existing.status,
      'due_date', v_existing.due_date,
      'payment_method_type', v_existing.payment_method_type,
      'unique_code', COALESCE((v_existing.metadata->>'unique_code')::INTEGER, 0),
      'reused', TRUE,
      'wallet_applied', COALESCE((v_wallet_apply_result->>'applied')::BOOLEAN, FALSE),
      'wallet_apply', v_wallet_apply_result
    );
  END IF;

  SELECT
    COALESCE(t.billing_mode, 'centralized'),
    COALESCE(t.organization_type::TEXT, 'perusahaan')
  INTO
    v_tenant_billing_mode,
    v_tenant_org_type
  FROM public.tenants t
  WHERE t.id = p_tenant_id
  LIMIT 1;

  IF v_tenant_billing_mode = 'individual' THEN
    v_min_duration_setting_key := 'individual_min_duration_months';
    v_min_duration_default := 6;
  ELSE
    CASE v_tenant_org_type
      WHEN 'pemerintah_daerah' THEN
        v_min_duration_setting_key := 'centralized_min_duration_pemerintah_daerah_months';
        v_min_duration_default := 12;
      WHEN 'instansi_pemerintah' THEN
        v_min_duration_setting_key := 'centralized_min_duration_instansi_pemerintah_months';
        v_min_duration_default := 1;
      WHEN 'sekolah' THEN
        v_min_duration_setting_key := 'centralized_min_duration_sekolah_months';
        v_min_duration_default := 6;
      ELSE
        v_min_duration_setting_key := 'centralized_min_duration_perusahaan_months';
        v_min_duration_default := 1;
    END CASE;
  END IF;

  SELECT
    CASE
      WHEN jsonb_typeof(setting_value->'value') = 'number' THEN (setting_value->>'value')::INTEGER
      WHEN (setting_value->>'value') ~ '^[0-9]+$' THEN (setting_value->>'value')::INTEGER
      ELSE NULL
    END
  INTO v_min_duration_months
  FROM public.billing_settings
  WHERE setting_key = v_min_duration_setting_key
  LIMIT 1;

  v_min_duration_months := COALESCE(v_min_duration_months, v_min_duration_default);

  IF v_min_duration_months NOT IN (1, 3, 6, 12) THEN
    v_min_duration_months := v_min_duration_default;
  END IF;

  IF COALESCE(p_package_duration_months, 0) < v_min_duration_months THEN
    RAISE EXCEPTION USING
      MESSAGE = format('Durasi minimum pembayaran untuk tenant ini adalah %s bulan.', v_min_duration_months),
      DETAIL = format(
        'requested_duration=%s; minimum_duration=%s; billing_mode=%s; organization_type=%s',
        COALESCE(p_package_duration_months, 0),
        v_min_duration_months,
        v_tenant_billing_mode,
        v_tenant_org_type
      ),
      HINT = 'Pilih paket dengan durasi yang memenuhi minimum kebijakan billing.';
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

  v_wallet_apply_result := public.apply_wallet_to_invoice_if_possible(v_inserted.id, auth.uid());

  SELECT * INTO v_inserted FROM public.invoices WHERE id = v_inserted.id LIMIT 1;

  RETURN jsonb_build_object(
    'id', v_inserted.id,
    'invoice_number', v_inserted.invoice_number,
    'gross_amount', v_inserted.gross_amount,
    'status', v_inserted.status,
    'due_date', v_inserted.due_date,
    'payment_method_type', v_inserted.payment_method_type,
    'unique_code', p_unique_code,
    'reused', FALSE,
    'wallet_applied', COALESCE((v_wallet_apply_result->>'applied')::BOOLEAN, FALSE),
    'wallet_apply', v_wallet_apply_result
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
