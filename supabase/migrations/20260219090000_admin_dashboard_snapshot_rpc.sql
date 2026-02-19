-- Snapshot cache for Super Admin dashboard KPI.
-- Tujuan: menghindari hitung ulang metrik berat pada setiap page load /admin/dashboard.

CREATE TABLE IF NOT EXISTS public.admin_dashboard_snapshots (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count_mode TEXT NOT NULL DEFAULT 'snapshot',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE public.admin_dashboard_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_dashboard_snapshots FROM anon;
REVOKE ALL ON TABLE public.admin_dashboard_snapshots FROM authenticated;

INSERT INTO public.system_settings (key, value, description)
VALUES
  (
    'dashboard_snapshot_skip_peak_hours',
    'true'::jsonb,
    'Jika true, snapshot dashboard admin tidak dihitung ulang pada jam sibuk absensi.'
  ),
  (
    'dashboard_snapshot_peak_windows',
    '[{"start":"06:00","end":"09:00"},{"start":"15:00","end":"18:30"}]'::jsonb,
    'Rentang jam sibuk absensi (lokal timezone) untuk menunda refresh snapshot dashboard admin.'
  ),
  (
    'dashboard_snapshot_timezone',
    '"Asia/Jakarta"'::jsonb,
    'Timezone yang dipakai untuk evaluasi jam sibuk snapshot dashboard admin.'
  )
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

CREATE OR REPLACE FUNCTION public.parse_hhmm_to_minutes(p_time_text TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT := BTRIM(COALESCE(p_time_text, ''));
  v_hour INTEGER := 0;
  v_min INTEGER := 0;
BEGIN
  IF v_clean !~ '^\d{1,2}:\d{2}$' THEN
    RETURN NULL;
  END IF;

  v_hour := SPLIT_PART(v_clean, ':', 1)::INTEGER;
  v_min := SPLIT_PART(v_clean, ':', 2)::INTEGER;

  IF v_hour < 0 OR v_hour > 23 OR v_min < 0 OR v_min > 59 THEN
    RETURN NULL;
  END IF;

  RETURN v_hour * 60 + v_min;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_minute_in_window(
  p_current_minute INTEGER,
  p_start_minute INTEGER,
  p_end_minute INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_current_minute IS NULL OR p_start_minute IS NULL OR p_end_minute IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_start_minute = p_end_minute THEN
    RETURN TRUE;
  END IF;

  IF p_start_minute < p_end_minute THEN
    RETURN p_current_minute >= p_start_minute AND p_current_minute < p_end_minute;
  END IF;

  -- Window melewati tengah malam (contoh 22:00 - 02:00)
  RETURN p_current_minute >= p_start_minute OR p_current_minute < p_end_minute;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_dashboard_peak_hour(
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skip_peak BOOLEAN := TRUE;
  v_timezone TEXT := 'Asia/Jakarta';
  v_windows JSONB := '[]'::JSONB;
  v_local_ts TIMESTAMP;
  v_current_minute INTEGER;
  v_window JSONB;
  v_start_minute INTEGER;
  v_end_minute INTEGER;
BEGIN
  SELECT COALESCE(value, 'true'::jsonb)::BOOLEAN
  INTO v_skip_peak
  FROM public.system_settings
  WHERE key = 'dashboard_snapshot_skip_peak_hours'
  LIMIT 1;

  IF NOT COALESCE(v_skip_peak, TRUE) THEN
    RETURN FALSE;
  END IF;

  SELECT NULLIF(BTRIM(COALESCE(value #>> '{}', '')), '')
  INTO v_timezone
  FROM public.system_settings
  WHERE key = 'dashboard_snapshot_timezone'
  LIMIT 1;

  v_timezone := COALESCE(v_timezone, 'Asia/Jakarta');

  SELECT COALESCE(value, '[]'::jsonb)
  INTO v_windows
  FROM public.system_settings
  WHERE key = 'dashboard_snapshot_peak_windows'
  LIMIT 1;

  IF jsonb_typeof(v_windows) <> 'array' THEN
    v_windows := '[]'::jsonb;
  END IF;

  v_local_ts := p_now AT TIME ZONE v_timezone;
  v_current_minute := EXTRACT(HOUR FROM v_local_ts)::INTEGER * 60 + EXTRACT(MINUTE FROM v_local_ts)::INTEGER;

  FOR v_window IN
    SELECT value FROM jsonb_array_elements(v_windows)
  LOOP
    v_start_minute := public.parse_hhmm_to_minutes(v_window->>'start');
    v_end_minute := public.parse_hhmm_to_minutes(v_window->>'end');
    IF public.is_minute_in_window(v_current_minute, v_start_minute, v_end_minute) THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_pct_trend(
  p_current BIGINT,
  p_previous BIGINT,
  p_suffix TEXT DEFAULT 'vs periode lalu'
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_diff NUMERIC := 0;
  v_label TEXT;
  v_up BOOLEAN := TRUE;
BEGIN
  IF COALESCE(p_current, 0) = 0 AND COALESCE(p_previous, 0) = 0 THEN
    v_label := '0% ' || COALESCE(p_suffix, 'vs periode lalu');
    RETURN jsonb_build_object('label', v_label, 'trendUp', TRUE);
  END IF;

  IF COALESCE(p_previous, 0) = 0 THEN
    v_label := '+' || COALESCE(p_current, 0)::TEXT || ' baru';
    RETURN jsonb_build_object('label', v_label, 'trendUp', TRUE);
  END IF;

  v_diff := ((COALESCE(p_current, 0) - COALESCE(p_previous, 0))::NUMERIC / NULLIF(p_previous::NUMERIC, 0)) * 100;
  v_up := v_diff >= 0;
  v_label := CASE WHEN v_up THEN '+' ELSE '-' END
    || TRIM(TO_CHAR(ROUND(ABS(v_diff), 1), 'FM999999990.0'))
    || '% '
    || COALESCE(p_suffix, 'vs periode lalu');

  RETURN jsonb_build_object('label', v_label, 'trendUp', v_up);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_admin_dashboard_snapshot()
RETURNS TABLE (
  payload JSONB,
  computed_at TIMESTAMPTZ,
  count_mode TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_yesterday DATE := ((NOW() AT TIME ZONE 'UTC')::DATE - INTERVAL '1 day')::DATE;
  v_thirty_days_ago TIMESTAMPTZ := NOW() - INTERVAL '30 days';
  v_sixty_days_ago TIMESTAMPTZ := NOW() - INTERVAL '60 days';
  v_day_ago TIMESTAMPTZ := NOW() - INTERVAL '24 hours';

  v_total_tenants BIGINT := 0;
  v_active_tenants BIGINT := 0;
  v_total_employees BIGINT := 0;
  v_active_subscriptions BIGINT := 0;
  v_trial_subscriptions BIGINT := 0;
  v_expired_subscriptions BIGINT := 0;
  v_today_attendance BIGINT := 0;
  v_yesterday_attendance BIGINT := 0;
  v_pending_leaves BIGINT := 0;
  v_ready_for_invoicing BIGINT := 0;
  v_pending_invoices BIGINT := 0;
  v_awaiting_invoices BIGINT := 0;
  v_overdue_invoices BIGINT := 0;
  v_failed_cron_runs_24h BIGINT := 0;
  v_open_feedback BIGINT := 0;
  v_open_bugs BIGINT := 0;
  v_locked_otp_users BIGINT := 0;
  v_tenants_new_30 BIGINT := 0;
  v_tenants_prev_30 BIGINT := 0;
  v_employees_new_30 BIGINT := 0;
  v_employees_prev_30 BIGINT := 0;
  v_active_subs_new_30 BIGINT := 0;
  v_active_subs_prev_30 BIGINT := 0;

  v_payload JSONB;
BEGIN
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE is_active IS TRUE)::BIGINT
  INTO
    v_total_tenants,
    v_active_tenants
  FROM public.tenants;

  SELECT COUNT(*)::BIGINT
  INTO v_total_employees
  FROM public.employees
  WHERE is_active IS TRUE;

  SELECT
    COUNT(*) FILTER (WHERE status = 'active')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'trial')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'expired')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'active' AND created_at >= v_thirty_days_ago)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'active' AND created_at >= v_sixty_days_ago AND created_at < v_thirty_days_ago)::BIGINT
  INTO
    v_active_subscriptions,
    v_trial_subscriptions,
    v_expired_subscriptions,
    v_active_subs_new_30,
    v_active_subs_prev_30
  FROM public.subscriptions;

  SELECT
    COUNT(*) FILTER (WHERE date = v_today)::BIGINT,
    COUNT(*) FILTER (WHERE date = v_yesterday)::BIGINT
  INTO
    v_today_attendance,
    v_yesterday_attendance
  FROM public.attendance_records_partitioned
  WHERE date IN (v_today, v_yesterday);

  SELECT COUNT(*)::BIGINT
  INTO v_pending_leaves
  FROM public.leave_requests
  WHERE status = 'menunggu';

  SELECT COUNT(*)::BIGINT
  INTO v_ready_for_invoicing
  FROM public.stability_streaks
  WHERE status = 'ready_for_invoicing';

  SELECT
    COUNT(*) FILTER (WHERE status = 'PENDING')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'AWAITING_VERIFICATION')::BIGINT,
    COUNT(*) FILTER (WHERE status IN ('PENDING', 'AWAITING_VERIFICATION') AND due_date < v_today)::BIGINT
  INTO
    v_pending_invoices,
    v_awaiting_invoices,
    v_overdue_invoices
  FROM public.invoices;

  SELECT COUNT(*)::BIGINT
  INTO v_failed_cron_runs_24h
  FROM public.cron_job_logs
  WHERE started_at >= v_day_ago
    AND (status ILIKE '%fail%' OR status ILIKE '%error%');

  SELECT
    COUNT(*) FILTER (WHERE status = 'open')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'open' AND feedback_type = 'bug')::BIGINT
  INTO
    v_open_feedback,
    v_open_bugs
  FROM public.feedback_reports;

  SELECT COUNT(*)::BIGINT
  INTO v_locked_otp_users
  FROM public.rate_limit_otp
  WHERE locked_until > v_now;

  SELECT
    COUNT(*) FILTER (WHERE created_at >= v_thirty_days_ago)::BIGINT,
    COUNT(*) FILTER (WHERE created_at >= v_sixty_days_ago AND created_at < v_thirty_days_ago)::BIGINT
  INTO
    v_tenants_new_30,
    v_tenants_prev_30
  FROM public.tenants;

  SELECT
    COUNT(*) FILTER (WHERE created_at >= v_thirty_days_ago)::BIGINT,
    COUNT(*) FILTER (WHERE created_at >= v_sixty_days_ago AND created_at < v_thirty_days_ago)::BIGINT
  INTO
    v_employees_new_30,
    v_employees_prev_30
  FROM public.employees;

  v_payload := jsonb_build_object(
    'totalTenants', v_total_tenants,
    'activeTenants', v_active_tenants,
    'totalEmployees', v_total_employees,
    'activeSubscriptions', v_active_subscriptions,
    'trialSubscriptions', v_trial_subscriptions,
    'expiredSubscriptions', v_expired_subscriptions,
    'todayAttendance', v_today_attendance,
    'pendingLeaves', v_pending_leaves,
    'readyForInvoicing', v_ready_for_invoicing,
    'pendingInvoices', (v_pending_invoices + v_awaiting_invoices),
    'overdueInvoices', v_overdue_invoices,
    'failedCronRuns24h', v_failed_cron_runs_24h,
    'openFeedbacks', v_open_feedback,
    'openBugs', v_open_bugs,
    'lockedOtpUsers', v_locked_otp_users,
    'trends', jsonb_build_object(
      'tenants', public.dashboard_pct_trend(v_tenants_new_30, v_tenants_prev_30, 'vs periode lalu'),
      'employees', public.dashboard_pct_trend(v_employees_new_30, v_employees_prev_30, 'vs periode lalu'),
      'subscriptions', public.dashboard_pct_trend(v_active_subs_new_30, v_active_subs_prev_30, 'vs periode lalu'),
      'attendance', public.dashboard_pct_trend(v_today_attendance, v_yesterday_attendance, 'vs kemarin')
    )
  );

  INSERT INTO public.admin_dashboard_snapshots (
    id,
    payload,
    computed_at,
    count_mode,
    updated_at
  )
  VALUES (
    TRUE,
    v_payload,
    v_now,
    'snapshot',
    v_now
  )
  ON CONFLICT (id) DO UPDATE
  SET
    payload = EXCLUDED.payload,
    computed_at = EXCLUDED.computed_at,
    count_mode = EXCLUDED.count_mode,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY
  SELECT v_payload, v_now, 'snapshot'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_snapshot(
  p_force_refresh BOOLEAN DEFAULT FALSE,
  p_max_age_seconds INTEGER DEFAULT 180
)
RETURNS TABLE (
  payload JSONB,
  computed_at TIMESTAMPTZ,
  source TEXT,
  count_mode TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := LOWER(COALESCE((auth.jwt() ->> 'role'), ''));
  v_max_age_seconds INTEGER := GREATEST(COALESCE(p_max_age_seconds, 180), 30);
  v_cached public.admin_dashboard_snapshots%ROWTYPE;
BEGIN
  IF v_role <> 'service_role' AND (v_uid IS NULL OR NOT public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN: only super admin can access admin dashboard snapshot';
  END IF;

  SELECT *
  INTO v_cached
  FROM public.admin_dashboard_snapshots
  WHERE id IS TRUE;

  IF NOT COALESCE(p_force_refresh, FALSE)
     AND public.is_dashboard_peak_hour(NOW())
     AND v_cached.computed_at IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_cached.payload,
      v_cached.computed_at,
      'peak_cache'::TEXT,
      COALESCE(v_cached.count_mode, 'snapshot');
    RETURN;
  END IF;

  IF NOT COALESCE(p_force_refresh, FALSE)
     AND v_cached.computed_at IS NOT NULL
     AND v_cached.computed_at >= NOW() - MAKE_INTERVAL(secs => v_max_age_seconds) THEN
    RETURN QUERY
    SELECT
      v_cached.payload,
      v_cached.computed_at,
      'cache'::TEXT,
      COALESCE(v_cached.count_mode, 'snapshot');
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fresh.payload,
    fresh.computed_at,
    'fresh'::TEXT,
    fresh.count_mode
  FROM public.refresh_admin_dashboard_snapshot() fresh;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_admin_dashboard_snapshot_if_off_peak()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result RECORD;
BEGIN
  IF public.is_dashboard_peak_hour(NOW()) THEN
    RETURN jsonb_build_object(
      'status', 'skipped_peak_hour',
      'refreshed', FALSE
    );
  END IF;

  SELECT *
  INTO v_result
  FROM public.refresh_admin_dashboard_snapshot()
  LIMIT 1;

  RETURN jsonb_build_object(
    'status', 'refreshed',
    'refreshed', TRUE,
    'computed_at', v_result.computed_at,
    'count_mode', v_result.count_mode
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_admin_dashboard_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_admin_dashboard_snapshot() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_admin_dashboard_snapshot() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_admin_dashboard_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_admin_dashboard_snapshot_if_off_peak() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_snapshot(BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_snapshot(BOOLEAN, INTEGER) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'admin-dashboard-snapshot-5m') THEN
      PERFORM cron.unschedule('admin-dashboard-snapshot-5m');
    END IF;

    PERFORM cron.schedule(
      'admin-dashboard-snapshot-5m',
      '*/5 * * * *',
      'SELECT public.refresh_admin_dashboard_snapshot_if_off_peak();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- pg_cron opsional; jangan blok migration jika ekstensi belum aktif.
    RAISE NOTICE 'admin-dashboard-snapshot-5m schedule skipped: %', SQLERRM;
END;
$$;

-- Warm first snapshot after migration.
SELECT public.refresh_admin_dashboard_snapshot();
