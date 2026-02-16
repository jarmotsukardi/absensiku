-- Hardening streak workflow:
-- 1) Ensure streak trigger runs for partitioned attendance table.
-- 2) Add advisory lock in streak invoice creation to prevent duplicate pending invoices on race.

DO $$
BEGIN
  IF to_regclass('public.attendance_records_partitioned') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_update_streak_on_checkin_partitioned ON public.attendance_records_partitioned;
    CREATE TRIGGER trg_update_streak_on_checkin_partitioned
    AFTER INSERT ON public.attendance_records_partitioned
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_update_streak_on_attendance();
  END IF;
END $$;

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
  v_vat_percentage numeric := 11;
  v_subtotal numeric;
  v_vat_amount numeric;
  v_gross_amount numeric;
  v_invoice_number text;
  v_due_date date;
  v_invoice_id uuid;
BEGIN
  IF v_actor_id IS NOT NULL THEN
    IF NOT is_super_admin(v_actor_id) THEN
      v_actor_tenant_id := get_user_tenant_id(v_actor_id);
      IF v_actor_tenant_id IS NULL OR v_actor_tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'forbidden';
      END IF;
    END IF;
  END IF;

  -- Serialize pending streak invoice creation per tenant to avoid race duplicates.
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

  SELECT COALESCE(
    CASE
      WHEN jsonb_typeof(setting_value->'value') = 'number' THEN (setting_value->>'value')::numeric
      WHEN (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' THEN (setting_value->>'value')::numeric
      ELSE NULL
    END,
    11
  )
  INTO v_vat_percentage
  FROM public.billing_settings
  WHERE setting_key = 'vat_percentage'
  LIMIT 1;

  v_subtotal := v_employee_count * v_price_per_employee;
  v_vat_amount := ROUND(v_subtotal * (v_vat_percentage / 100), 0);
  v_gross_amount := v_subtotal + v_vat_amount;
  v_due_date := CURRENT_DATE + GREATEST(COALESCE(p_grace_days, 7), 0);

  SELECT public.generate_invoice_number() INTO v_invoice_number;
  IF COALESCE(v_invoice_number, '') = '' THEN
    v_invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYYMM') || '-AUTO' || TO_CHAR(NOW(), 'DDHH24MISS');
  END IF;

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
    v_vat_percentage,
    v_vat_amount,
    v_gross_amount,
    0,
    v_gross_amount,
    'PENDING',
    'MANUAL_TRANSFER',
    CURRENT_DATE,
    v_due_date,
    'Tagihan otomatis: target streak tercapai'
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
