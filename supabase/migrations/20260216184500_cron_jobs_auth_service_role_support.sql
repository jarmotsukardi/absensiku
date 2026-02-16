-- Allow service_role context for cron RPC functions while keeping super_admin gating for user JWTs.

CREATE OR REPLACE FUNCTION public.ensure_system_cron_jobs(
  p_billing_notifier_secret TEXT DEFAULT NULL,
  p_public_site_url TEXT DEFAULT NULL,
  p_billing_interval TEXT DEFAULT '*/10 * * * *'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := NULLIF(current_setting('request.jwt.claim.role', true), '');
  v_has_cron BOOLEAN := false;
  v_has_net BOOLEAN := false;
  v_base_url TEXT := COALESCE(NULLIF(BTRIM(p_public_site_url), ''), 'https://zrhgqpjbeyzwpgywelcr.supabase.co');
  v_endpoint TEXT;
  v_result JSONB := '{}'::jsonb;
  v_jobs JSONB := '[]'::jsonb;
BEGIN
  IF COALESCE(v_role, '') <> 'service_role' AND (v_uid IS NULL OR NOT is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') INTO v_has_cron;
  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') INTO v_has_net;

  IF NOT v_has_cron THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'pg_cron_not_available'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'attendance-ingest-worker') THEN
    PERFORM cron.unschedule('attendance-ingest-worker');
  END IF;
  PERFORM cron.schedule(
    'attendance-ingest-worker',
    '* * * * *',
    'SELECT public.process_attendance_queue(500, NULL, NULL);'
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-gps-daily') THEN
    PERFORM cron.unschedule('cleanup-gps-daily');
  END IF;
  PERFORM cron.schedule(
    'cleanup-gps-daily',
    '0 19 * * *',
    'SELECT public.cleanup_gps_data_partitioned();'
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analyze-partitions-daily') THEN
    PERFORM cron.unschedule('analyze-partitions-daily');
  END IF;
  PERFORM cron.schedule(
    'analyze-partitions-daily',
    '0 20 * * *',
    'SELECT public.analyze_attendance_partitions();'
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-audit-logs-weekly') THEN
    PERFORM cron.unschedule('cleanup-audit-logs-weekly');
  END IF;
  PERFORM cron.schedule(
    'cleanup-audit-logs-weekly',
    '0 20 * * 6',
    'SELECT public.cleanup_old_audit_logs();'
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create-next-month-partition-monthly') THEN
    PERFORM cron.unschedule('create-next-month-partition-monthly');
  END IF;
  PERFORM cron.schedule(
    'create-next-month-partition-monthly',
    '0 18 24 * *',
    'SELECT public.create_next_month_partition();'
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'streak-subscription-sync-daily') THEN
    PERFORM cron.unschedule('streak-subscription-sync-daily');
  END IF;
  PERFORM cron.schedule(
    'streak-subscription-sync-daily',
    '10 17 * * *',
    'SELECT public.sync_streak_subscription_status();'
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-grace-notifier-10m') THEN
    PERFORM cron.unschedule('billing-grace-notifier-10m');
  END IF;

  IF v_has_net AND NULLIF(BTRIM(p_billing_notifier_secret), '') IS NOT NULL THEN
    v_endpoint := RTRIM(v_base_url, '/') || '/functions/v1/billing-grace-notifier';

    PERFORM cron.schedule(
      'billing-grace-notifier-10m',
      COALESCE(NULLIF(BTRIM(p_billing_interval), ''), '*/10 * * * *'),
      format(
        'SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-cron-secret'', %L), body := %L::jsonb);',
        v_endpoint,
        p_billing_notifier_secret,
        '{"dry_run":false,"limit":200}'
      )
    );

    v_result := v_result || jsonb_build_object('billing_grace_notifier', 'scheduled');
  ELSE
    v_result := v_result || jsonb_build_object(
      'billing_grace_notifier',
      CASE
        WHEN NOT v_has_net THEN 'skipped_net_extension_unavailable'
        ELSE 'skipped_missing_secret'
      END
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'jobname', j.jobname,
        'schedule', j.schedule,
        'active', j.active
      )
      ORDER BY j.jobname
    ),
    '[]'::jsonb
  )
  INTO v_jobs
  FROM cron.job j
  WHERE j.jobname = ANY (ARRAY[
    'attendance-ingest-worker',
    'cleanup-gps-daily',
    'analyze-partitions-daily',
    'cleanup-audit-logs-weekly',
    'create-next-month-partition-monthly',
    'streak-subscription-sync-daily',
    'billing-grace-notifier-10m'
  ]);

  RETURN jsonb_build_object(
    'success', true,
    'detail', v_result,
    'jobs', v_jobs
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_cron_jobs_overview()
RETURNS TABLE(
  job_name TEXT,
  category TEXT,
  target TEXT,
  description TEXT,
  timezone TEXT,
  expected_schedule TEXT,
  current_schedule TEXT,
  is_scheduled BOOLEAN,
  is_active BOOLEAN,
  command_preview TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := NULLIF(current_setting('request.jwt.claim.role', true), '');
  v_has_cron BOOLEAN := false;
BEGIN
  IF COALESCE(v_role, '') <> 'service_role' AND (v_uid IS NULL OR NOT is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') INTO v_has_cron;

  IF NOT v_has_cron THEN
    RETURN QUERY
    WITH catalog AS (
      SELECT *
      FROM (VALUES
        ('attendance-ingest-worker', 'Attendance', 'SQL/RPC', 'Memproses queue absensi offline->DB.', 'UTC (WIB +7)', '* * * * *'),
        ('cleanup-gps-daily', 'Maintenance', 'SQL/RPC', 'Membersihkan GPS lama pada tabel absensi partisi.', 'UTC (WIB +7)', '0 19 * * *'),
        ('analyze-partitions-daily', 'Maintenance', 'SQL/RPC', 'VACUUM ANALYZE partisi absensi harian.', 'UTC (WIB +7)', '0 20 * * *'),
        ('cleanup-audit-logs-weekly', 'Maintenance', 'SQL/RPC', 'Pembersihan log audit mingguan.', 'UTC (WIB +7)', '0 20 * * 6'),
        ('create-next-month-partition-monthly', 'Maintenance', 'SQL/RPC', 'Membuat partisi bulan berikutnya.', 'UTC (WIB +7)', '0 18 24 * *'),
        ('streak-subscription-sync-daily', 'Billing', 'SQL/RPC', 'Sinkron status subscription terhadap grace period streak.', 'UTC (WIB +7)', '10 17 * * *'),
        ('billing-grace-notifier-10m', 'Billing', 'Edge Function', 'Kirim invoice grace period ke email/WhatsApp.', 'UTC (WIB +7)', '*/10 * * * *')
      ) AS t(job_name, category, target, description, timezone, expected_schedule)
    )
    SELECT
      c.job_name,
      c.category,
      c.target,
      c.description,
      c.timezone,
      c.expected_schedule,
      NULL::TEXT AS current_schedule,
      false AS is_scheduled,
      false AS is_active,
      NULL::TEXT AS command_preview
    FROM catalog c
    ORDER BY c.category, c.job_name;
    RETURN;
  END IF;

  RETURN QUERY
  WITH catalog AS (
    SELECT *
    FROM (VALUES
      ('attendance-ingest-worker', 'Attendance', 'SQL/RPC', 'Memproses queue absensi offline->DB.', 'UTC (WIB +7)', '* * * * *'),
      ('cleanup-gps-daily', 'Maintenance', 'SQL/RPC', 'Membersihkan GPS lama pada tabel absensi partisi.', 'UTC (WIB +7)', '0 19 * * *'),
      ('analyze-partitions-daily', 'Maintenance', 'SQL/RPC', 'VACUUM ANALYZE partisi absensi harian.', 'UTC (WIB +7)', '0 20 * * *'),
      ('cleanup-audit-logs-weekly', 'Maintenance', 'SQL/RPC', 'Pembersihan log audit mingguan.', 'UTC (WIB +7)', '0 20 * * 6'),
      ('create-next-month-partition-monthly', 'Maintenance', 'SQL/RPC', 'Membuat partisi bulan berikutnya.', 'UTC (WIB +7)', '0 18 24 * *'),
      ('streak-subscription-sync-daily', 'Billing', 'SQL/RPC', 'Sinkron status subscription terhadap grace period streak.', 'UTC (WIB +7)', '10 17 * * *'),
      ('billing-grace-notifier-10m', 'Billing', 'Edge Function', 'Kirim invoice grace period ke email/WhatsApp.', 'UTC (WIB +7)', '*/10 * * * *')
    ) AS t(job_name, category, target, description, timezone, expected_schedule)
  )
  SELECT
    c.job_name,
    c.category,
    c.target,
    c.description,
    c.timezone,
    c.expected_schedule,
    j.schedule AS current_schedule,
    (j.jobid IS NOT NULL) AS is_scheduled,
    COALESCE(j.active, false) AS is_active,
    CASE
      WHEN j.jobid IS NULL THEN NULL
      WHEN c.job_name = 'billing-grace-notifier-10m' THEN '[masked http command]'
      ELSE LEFT(j.command, 160)
    END AS command_preview
  FROM catalog c
  LEFT JOIN cron.job j ON j.jobname = c.job_name
  ORDER BY c.category, c.job_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_cron_recent_runs(p_limit INTEGER DEFAULT 100)
RETURNS TABLE(
  run_id BIGINT,
  job_name TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_seconds NUMERIC,
  return_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := NULLIF(current_setting('request.jwt.claim.role', true), '');
  v_has_cron BOOLEAN := false;
BEGIN
  IF COALESCE(v_role, '') <> 'service_role' AND (v_uid IS NULL OR NOT is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') INTO v_has_cron;
  IF NOT v_has_cron THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.runid AS run_id,
    COALESCE(j.jobname, 'job#' || d.jobid::TEXT) AS job_name,
    d.status,
    d.start_time::timestamptz AS started_at,
    d.end_time::timestamptz AS finished_at,
    CASE
      WHEN d.end_time IS NULL THEN NULL
      ELSE ROUND(EXTRACT(EPOCH FROM (d.end_time - d.start_time))::NUMERIC, 2)
    END AS duration_seconds,
    d.return_message
  FROM cron.job_run_details d
  LEFT JOIN cron.job j ON j.jobid = d.jobid
  ORDER BY d.start_time DESC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_system_cron_jobs(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cron_jobs_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cron_recent_runs(INTEGER) TO authenticated, service_role;
