-- Streak-Billing-Payment automation:
-- 1) Auto-create pending invoice when streak reaches threshold
-- 2) Mark streak invoiced when payment is paid
-- 3) Expire subscriptions when grace period ends without payment

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

CREATE OR REPLACE FUNCTION public.mark_streak_invoiced(
  p_tenant_id uuid,
  p_invoice_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_tenant_id uuid;
BEGIN
  IF v_actor_id IS NOT NULL THEN
    IF NOT is_super_admin(v_actor_id) THEN
      v_actor_tenant_id := get_user_tenant_id(v_actor_id);
      IF v_actor_tenant_id IS NULL OR v_actor_tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'forbidden';
      END IF;
    END IF;
  END IF;

  UPDATE public.stability_streaks
  SET
    status = 'invoiced',
    reached_target = true,
    reached_target_at = COALESCE(reached_target_at, NOW()),
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id;

  UPDATE public.subscriptions
  SET
    status = 'active',
    grace_period_end = NULL,
    last_invoice_id = COALESCE(p_invoice_id, last_invoice_id),
    updated_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND status <> 'cancelled';
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_streak_subscription_status(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_scope_tenant_id uuid := p_tenant_id;
  v_threshold integer := 30;
  v_grace_days integer := 7;
  v_expired_count integer := 0;
BEGIN
  IF v_actor_id IS NOT NULL AND NOT is_super_admin(v_actor_id) THEN
    v_scope_tenant_id := get_user_tenant_id(v_actor_id);
  END IF;

  SELECT
    CASE
      WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::integer
      WHEN jsonb_typeof(value->'value') = 'number' THEN (value->>'value')::integer
      WHEN (value->>'value') ~ '^[0-9]+$' THEN (value->>'value')::integer
      ELSE NULL
    END
  INTO v_threshold
  FROM public.system_settings
  WHERE key = 'streak_threshold'
  LIMIT 1;

  SELECT
    CASE
      WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::integer
      WHEN jsonb_typeof(value->'value') = 'number' THEN (value->>'value')::integer
      WHEN (value->>'value') ~ '^[0-9]+$' THEN (value->>'value')::integer
      ELSE NULL
    END
  INTO v_grace_days
  FROM public.system_settings
  WHERE key = 'streak_grace_period_days'
  LIMIT 1;

  v_threshold := GREATEST(COALESCE(v_threshold, 30), 1);
  v_grace_days := GREATEST(COALESCE(v_grace_days, 7), 0);

  WITH streak_candidates AS (
    SELECT
      st.tenant_id,
      COALESCE(
        st.grace_period_end,
        (st.reached_target_at AT TIME ZONE 'UTC')::date + v_grace_days
      ) AS effective_grace_end
    FROM public.stability_streaks st
    WHERE (v_scope_tenant_id IS NULL OR st.tenant_id = v_scope_tenant_id)
      AND st.status <> 'invoiced'
      AND (
        COALESCE(st.reached_target, false) = true
        OR st.streak_count >= v_threshold
      )
  )
  UPDATE public.subscriptions s
  SET
    status = 'expired',
    updated_at = NOW()
  FROM streak_candidates c
  WHERE s.tenant_id = c.tenant_id
    AND c.effective_grace_end IS NOT NULL
    AND c.effective_grace_end < CURRENT_DATE
    AND s.status NOT IN ('expired', 'cancelled');

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_subscriptions', v_expired_count,
    'scope_tenant_id', v_scope_tenant_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_tenant_streak(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE;
  v_streak RECORD;
  v_check_date DATE;
  v_day_of_week INTEGER;
  v_is_tenant_holiday BOOLEAN;
  v_threshold INTEGER := 30;
  v_grace_days INTEGER := 7;
  v_new_streak_count INTEGER := 0;
BEGIN
  SELECT
    CASE
      WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::INTEGER
      WHEN jsonb_typeof(value->'value') = 'number' THEN (value->>'value')::INTEGER
      WHEN (value->>'value') ~ '^[0-9]+$' THEN (value->>'value')::INTEGER
      ELSE NULL
    END
  INTO v_threshold
  FROM public.system_settings
  WHERE key = 'streak_threshold'
  LIMIT 1;

  SELECT
    CASE
      WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::INTEGER
      WHEN jsonb_typeof(value->'value') = 'number' THEN (value->>'value')::INTEGER
      WHEN (value->>'value') ~ '^[0-9]+$' THEN (value->>'value')::INTEGER
      ELSE NULL
    END
  INTO v_grace_days
  FROM public.system_settings
  WHERE key = 'streak_grace_period_days'
  LIMIT 1;

  v_threshold := GREATEST(COALESCE(v_threshold, 30), 1);
  v_grace_days := GREATEST(COALESCE(v_grace_days, 7), 0);

  INSERT INTO stability_streaks (tenant_id, streak_count, last_activity_date, streak_started_at)
  VALUES (p_tenant_id, 0, NULL, NULL)
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT * INTO v_streak FROM stability_streaks WHERE tenant_id = p_tenant_id FOR UPDATE;

  IF v_streak.reached_target THEN
    IF v_streak.status <> 'invoiced' THEN
      PERFORM public.create_pending_streak_invoice(p_tenant_id, v_grace_days);
    END IF;
    RETURN;
  END IF;

  IF v_streak.last_activity_date = v_today THEN
    RETURN;
  END IF;

  v_check_date := v_today - INTERVAL '1 day';
  LOOP
    v_day_of_week := EXTRACT(DOW FROM v_check_date);
    IF v_day_of_week IN (0, 6) THEN
      v_check_date := v_check_date - INTERVAL '1 day';
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM national_holidays
      WHERE date = v_check_date
        AND is_active = true
    ) THEN
      v_check_date := v_check_date - INTERVAL '1 day';
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM work_holidays wh
      WHERE wh.tenant_id = p_tenant_id
        AND wh.year = EXTRACT(YEAR FROM v_check_date)::INTEGER
        AND wh.month = EXTRACT(MONTH FROM v_check_date)::INTEGER
        AND EXTRACT(DAY FROM v_check_date)::TEXT = ANY(wh.dates)
    ) INTO v_is_tenant_holiday;

    IF v_is_tenant_holiday THEN
      v_check_date := v_check_date - INTERVAL '1 day';
      CONTINUE;
    END IF;

    EXIT;
  END LOOP;

  v_yesterday := v_check_date;

  IF v_streak.last_activity_date IS NULL OR v_streak.last_activity_date < v_yesterday THEN
    v_new_streak_count := 1;
    UPDATE stability_streaks SET
      streak_count = v_new_streak_count,
      last_activity_date = v_today,
      streak_started_at = v_today,
      updated_at = now()
    WHERE tenant_id = p_tenant_id;
  ELSE
    v_new_streak_count := v_streak.streak_count + 1;
    UPDATE stability_streaks SET
      streak_count = v_new_streak_count,
      last_activity_date = v_today,
      reached_target = CASE WHEN v_new_streak_count >= v_threshold THEN true ELSE false END,
      reached_target_at = CASE WHEN v_new_streak_count >= v_threshold THEN now() ELSE NULL END,
      status = CASE WHEN v_new_streak_count >= v_threshold THEN 'ready_for_invoicing' ELSE 'tracking' END,
      grace_period_end = CASE WHEN v_new_streak_count >= v_threshold THEN (CURRENT_DATE + v_grace_days) ELSE NULL END,
      updated_at = now()
    WHERE tenant_id = p_tenant_id;

    IF v_new_streak_count >= v_threshold THEN
      PERFORM public.create_pending_streak_invoice(p_tenant_id, v_grace_days);
    END IF;
  END IF;
END;
$function$;
