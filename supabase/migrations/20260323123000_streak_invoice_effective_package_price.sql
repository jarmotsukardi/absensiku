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
  v_subscription_last_invoice_id uuid := null;
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
  v_package_id uuid := null;
  v_package_scope text := 'attendance';
  v_package_scope_label text := 'Absensi';
  v_package_name text := 'Streak Billing';
  v_invoice_metadata jsonb := jsonb_build_object('streak_billing', true);
  v_last_invoice_scope text := 'attendance';
  v_resolved_package_base_price numeric := null;
  v_resolved_package_promo_active boolean := false;
  v_resolved_package_promo_price numeric := null;
  v_resolved_package_promo_label text := null;
  v_b2b_threshold integer := 2000;
  v_pricing_reason text := 'package_base';
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

  SELECT
    s.last_invoice_id,
    s.price_per_employee
  INTO
    v_subscription_last_invoice_id,
    v_subscription_price_per_employee
  FROM public.subscriptions s
  WHERE s.tenant_id = p_tenant_id
  ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_subscription_last_invoice_id IS NOT NULL THEN
    SELECT COALESCE(pkg.module_scope, 'attendance')
    INTO v_last_invoice_scope
    FROM public.invoices inv
    LEFT JOIN public.subscription_packages pkg
      ON pkg.id = inv.package_id
    WHERE inv.id = v_subscription_last_invoice_id
    LIMIT 1;
  END IF;

  SELECT
    pkg.id,
    COALESCE(pkg.module_scope, 'attendance'),
    pkg.base_price_per_month,
    COALESCE(pkg.promo_active, false),
    pkg.promo_price_per_month,
    pkg.promo_label
  INTO
    v_package_id,
    v_package_scope,
    v_resolved_package_base_price,
    v_resolved_package_promo_active,
    v_resolved_package_promo_price,
    v_resolved_package_promo_label
  FROM public.subscription_packages pkg
  WHERE COALESCE(pkg.is_active, true) = true
    AND pkg.duration_months = 1
    AND COALESCE(pkg.module_scope, 'attendance') = COALESCE(v_last_invoice_scope, 'attendance')
  ORDER BY pkg.sort_order ASC NULLS LAST, pkg.created_at ASC, pkg.id ASC
  LIMIT 1;

  IF v_package_id IS NULL AND COALESCE(v_last_invoice_scope, 'attendance') <> 'attendance' THEN
    SELECT
      pkg.id,
      COALESCE(pkg.module_scope, 'attendance'),
      pkg.base_price_per_month,
      COALESCE(pkg.promo_active, false),
      pkg.promo_price_per_month,
      pkg.promo_label
    INTO
      v_package_id,
      v_package_scope,
      v_resolved_package_base_price,
      v_resolved_package_promo_active,
      v_resolved_package_promo_price,
      v_resolved_package_promo_label
    FROM public.subscription_packages pkg
    WHERE COALESCE(pkg.is_active, true) = true
      AND pkg.duration_months = 1
      AND COALESCE(pkg.module_scope, 'attendance') = 'attendance'
    ORDER BY pkg.sort_order ASC NULLS LAST, pkg.created_at ASC, pkg.id ASC
    LIMIT 1;
  END IF;

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(value) = 'number' THEN trim(both '"' from value::text)::integer
      WHEN jsonb_typeof(value) = 'string' AND trim(both '"' from value::text) ~ '^[0-9]+$' THEN trim(both '"' from value::text)::integer
      WHEN jsonb_typeof(value->'value') = 'number' THEN (value->>'value')::integer
      WHEN (value->>'value') ~ '^[0-9]+$' THEN (value->>'value')::integer
      ELSE NULL
    END,
    2000
  )
  INTO v_b2b_threshold
  FROM public.system_settings
  WHERE key = 'b2b_negotiation_threshold'
  LIMIT 1;

  v_package_scope := COALESCE(v_package_scope, COALESCE(v_last_invoice_scope, 'attendance'), 'attendance');

  IF v_package_scope = 'attendance'
     AND v_subscription_price_per_employee IS NOT NULL
     AND v_subscription_price_per_employee > 0
     AND v_employee_count >= GREATEST(COALESCE(v_b2b_threshold, 2000), 2000) THEN
    v_price_per_employee := v_subscription_price_per_employee;
    v_pricing_reason := 'negotiated_b2b';
  ELSIF v_resolved_package_promo_active
        AND v_resolved_package_promo_price IS NOT NULL
        AND v_resolved_package_base_price IS NOT NULL
        AND v_resolved_package_promo_price < v_resolved_package_base_price THEN
    v_price_per_employee := v_resolved_package_promo_price;
    v_pricing_reason := 'package_promo';
  ELSIF v_resolved_package_base_price IS NOT NULL
        AND v_resolved_package_base_price > 0 THEN
    v_price_per_employee := v_resolved_package_base_price;
    v_pricing_reason := 'package_base';
  ELSIF v_subscription_price_per_employee IS NOT NULL
        AND v_subscription_price_per_employee > 0 THEN
    v_price_per_employee := v_subscription_price_per_employee;
    v_pricing_reason := 'subscription_snapshot';
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
    v_pricing_reason := 'billing_global';
  END IF;

  v_package_scope_label := CASE v_package_scope
    WHEN 'attendance_hr' THEN 'Absensi + HR'
    WHEN 'attendance_hr_payroll' THEN 'Absensi + HR + Payroll'
    ELSE 'Absensi'
  END;

  IF v_package_id IS NOT NULL THEN
    v_package_name := 'Streak Billing • ' || v_package_scope_label;
  END IF;

  v_invoice_metadata := jsonb_build_object(
    'streak_billing', true,
    'package_scope', v_package_scope,
    'package_display_name', v_package_name,
    'pricing_reason', v_pricing_reason,
    'package_base_price_per_employee', v_resolved_package_base_price,
    'package_promo_active', COALESCE(v_resolved_package_promo_active, false),
    'package_promo_price_per_employee', v_resolved_package_promo_price,
    'package_promo_label', v_resolved_package_promo_label
  );

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

  v_invoice_notes := CASE v_pricing_reason
    WHEN 'negotiated_b2b' THEN 'Tagihan otomatis: target streak tercapai (harga negosiasi B2B)'
    WHEN 'package_promo' THEN 'Tagihan otomatis: target streak tercapai (promo paket aktif)'
    ELSE 'Tagihan otomatis: target streak tercapai'
  END;

  INSERT INTO public.invoices (
    tenant_id,
    invoice_number,
    package_id,
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
    notes,
    metadata
  )
  VALUES (
    p_tenant_id,
    v_invoice_number,
    v_package_id,
    v_package_name,
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
    v_invoice_notes,
    v_invoice_metadata
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
