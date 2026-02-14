-- Make streak threshold and grace period dynamic from system_settings:
-- - streak_threshold
-- - streak_grace_period_days
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
BEGIN
  -- Read dynamic settings from system_settings with safe fallback.
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

  -- Get or create streak record.
  INSERT INTO stability_streaks (tenant_id, streak_count, last_activity_date, streak_started_at)
  VALUES (p_tenant_id, 0, NULL, NULL)
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT * INTO v_streak FROM stability_streaks WHERE tenant_id = p_tenant_id FOR UPDATE;

  IF v_streak.reached_target THEN
    RETURN;
  END IF;

  IF v_streak.last_activity_date = v_today THEN
    RETURN;
  END IF;

  -- Find the last workday before today (skip weekends, national holidays, tenant holidays).
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

  -- Check if streak continues or resets.
  IF v_streak.last_activity_date IS NULL OR v_streak.last_activity_date < v_yesterday THEN
    UPDATE stability_streaks SET
      streak_count = 1,
      last_activity_date = v_today,
      streak_started_at = v_today,
      updated_at = now()
    WHERE tenant_id = p_tenant_id;
  ELSE
    UPDATE stability_streaks SET
      streak_count = streak_count + 1,
      last_activity_date = v_today,
      reached_target = CASE WHEN streak_count + 1 >= v_threshold THEN true ELSE false END,
      reached_target_at = CASE WHEN streak_count + 1 >= v_threshold THEN now() ELSE NULL END,
      status = CASE WHEN streak_count + 1 >= v_threshold THEN 'ready_for_invoicing' ELSE 'tracking' END,
      grace_period_end = CASE WHEN streak_count + 1 >= v_threshold THEN (CURRENT_DATE + v_grace_days) ELSE NULL END,
      updated_at = now()
    WHERE tenant_id = p_tenant_id;
  END IF;
END;
$function$;
