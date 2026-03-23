-- Prevent stacked active invoices per tenant and provide atomic manual invoice creation

WITH ranked_active AS (
  SELECT
    id,
    tenant_id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.invoices
  WHERE status IN ('PENDING', 'AWAITING_VERIFICATION')
)
UPDATE public.invoices AS i
SET
  status = 'CANCELLED',
  notes = concat_ws(
    E'\n',
    NULLIF(i.notes, ''),
    '[AUTO] Duplicate active invoice cancelled by guard'
  ),
  updated_at = now()
FROM ranked_active AS r
WHERE i.id = r.id
  AND r.rn > 1
  AND i.status IN ('PENDING', 'AWAITING_VERIFICATION');

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_active_per_tenant_unique
ON public.invoices (tenant_id)
WHERE status IN ('PENDING', 'AWAITING_VERIFICATION');

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
    p_subtotal,
    p_discount_amount,
    p_vat_percentage,
    p_vat_amount,
    p_gross_amount,
    p_xendit_fee,
    p_net_amount,
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
) TO authenticated, service_role;
