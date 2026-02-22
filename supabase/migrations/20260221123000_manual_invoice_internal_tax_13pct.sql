-- Enforce internal tax formula for manual invoice creation at DB level.
-- Formula: base_after_discount + (11% + 2%)

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

  v_internal_tax_percentage := v_ppn_percentage + v_pph_percentage;
  v_subtotal := GREATEST(COALESCE(p_subtotal, 0), 0);
  v_discount_amount := GREATEST(COALESCE(p_discount_amount, 0), 0);
  v_base_amount := GREATEST(v_subtotal - v_discount_amount, 0);
  v_internal_tax_amount := ROUND(v_base_amount * (v_internal_tax_percentage / 100), 0);
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
