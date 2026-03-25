-- Sync cron registry with dynamic log cleanup policy.
-- This migration ensures:
-- 1) auto clean audit/error logs are first-class jobs in cron registry
-- 2) ensure_system_cron_jobs respects policy from system_settings.log_cleanup_cron_policy

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
  v_auth_role TEXT := auth.role();
  v_has_cron BOOLEAN := false;
  v_has_net BOOLEAN := false;
  v_base_url TEXT := COALESCE(NULLIF(BTRIM(p_public_site_url), ''), 'https://zrhgqpjbeyzwpgywelcr.supabase.co');
  v_endpoint TEXT;
  v_result JSONB := '{}'::jsonb;
  v_jobs JSONB := '[]'::jsonb;
  v_policy JSONB := '{}'::jsonb;
  v_audit_cleanup_enabled BOOLEAN := true;
  v_error_cleanup_enabled BOOLEAN := true;
  v_audit_cleanup_cron TEXT := '10 20 * * *';
  v_error_cleanup_cron TEXT := '0 18 * * *';
  v_job RECORD;
BEGIN
  IF COALESCE(v_auth_role, '') <> 'service_role' AND (v_uid IS NULL OR NOT is_super_admin(v_uid)) THEN
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

  SELECT value
  INTO v_policy
  FROM public.system_settings
  WHERE key = 'log_cleanup_cron_policy'
  LIMIT 1;

  IF v_policy IS NULL OR jsonb_typeof(v_policy) <> 'object' THEN
    v_policy := '{}'::jsonb;
  END IF;

  IF lower(COALESCE(v_policy->>'audit_cleanup_enabled', '')) IN ('true', 'false') THEN
    v_audit_cleanup_enabled := (v_policy->>'audit_cleanup_enabled')::boolean;
  END IF;

  IF lower(COALESCE(v_policy->>'error_cleanup_enabled', '')) IN ('true', 'false') THEN
    v_error_cleanup_enabled := (v_policy->>'error_cleanup_enabled')::boolean;
  END IF;

  v_audit_cleanup_cron := COALESCE(NULLIF(trim(v_policy->>'audit_cleanup_cron'), ''), v_audit_cleanup_cron);
  v_error_cleanup_cron := COALESCE(NULLIF(trim(v_policy->>'error_cleanup_cron'), ''), v_error_cleanup_cron);

  v_audit_cleanup_cron := trim(regexp_replace(v_audit_cleanup_cron, '[[:space:]]+', ' ', 'g'));
  v_error_cleanup_cron := trim(regexp_replace(v_error_cleanup_cron, '[[:space:]]+', ' ', 'g'));

  IF array_length(string_to_array(v_audit_cleanup_cron, ' '), 1) <> 5 THEN
    v_audit_cleanup_cron := '10 20 * * *';
  END IF;

  IF array_length(string_to_array(v_error_cleanup_cron, ' '), 1) <> 5 THEN
    v_error_cleanup_cron := '0 18 * * *';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'attendance-ingest-worker') THEN
    PERFORM cron.unschedule('attendance-ingest-worker');
  END IF;
  PERFORM cron.schedule(
    'attendance-ingest-worker',
    '* * * * *',
    'SELECT public.process_attendance_queue(500, NULL, NULL);'
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'org-dashboard-snapshot-5m') THEN
    PERFORM cron.unschedule('org-dashboard-snapshot-5m');
  END IF;
  PERFORM cron.schedule(
    'org-dashboard-snapshot-5m',
    '*/5 * * * *',
    'SELECT public.refresh_recent_org_dashboard_snapshots_if_off_peak();'
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

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-audit-logs-daily-dynamic') THEN
    PERFORM cron.unschedule('cleanup-audit-logs-daily-dynamic');
  END IF;

  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE command ILIKE '%cleanup_old_audit_logs%'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'client-error-logs-retention-daily') THEN
    PERFORM cron.unschedule('client-error-logs-retention-daily');
  END IF;

  IF v_audit_cleanup_enabled THEN
    PERFORM cron.schedule(
      'cleanup-audit-logs-daily-dynamic',
      v_audit_cleanup_cron,
      'SELECT public.cleanup_old_audit_logs();'
    );
  END IF;

  IF v_error_cleanup_enabled THEN
    PERFORM cron.schedule(
      'client-error-logs-retention-daily',
      v_error_cleanup_cron,
      'SELECT public.apply_client_error_logs_retention();'
    );
  END IF;

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

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoice-number-health-daily') THEN
    PERFORM cron.unschedule('invoice-number-health-daily');
  END IF;
  PERFORM cron.schedule(
    'invoice-number-health-daily',
    '15 17 * * *',
    'SELECT public.capture_invoice_number_health_snapshot(CURRENT_DATE);'
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

  v_result := v_result || jsonb_build_object(
    'audit_cleanup_enabled', v_audit_cleanup_enabled,
    'audit_cleanup_cron', v_audit_cleanup_cron,
    'error_cleanup_enabled', v_error_cleanup_enabled,
    'error_cleanup_cron', v_error_cleanup_cron
  );

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
    'org-dashboard-snapshot-5m',
    'cleanup-gps-daily',
    'analyze-partitions-daily',
    'cleanup-audit-logs-daily-dynamic',
    'client-error-logs-retention-daily',
    'create-next-month-partition-monthly',
    'streak-subscription-sync-daily',
    'invoice-number-health-daily',
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
  v_auth_role TEXT := auth.role();
  v_has_cron BOOLEAN := false;
BEGIN
  IF COALESCE(v_auth_role, '') <> 'service_role' AND (v_uid IS NULL OR NOT is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') INTO v_has_cron;

  IF NOT v_has_cron THEN
    RETURN QUERY
    WITH policy AS (
      SELECT
        CASE
          WHEN lower(COALESCE(ss.value->>'audit_cleanup_enabled', '')) IN ('true', 'false')
            THEN (ss.value->>'audit_cleanup_enabled')::boolean
          ELSE true
        END AS audit_cleanup_enabled,
        CASE
          WHEN lower(COALESCE(ss.value->>'error_cleanup_enabled', '')) IN ('true', 'false')
            THEN (ss.value->>'error_cleanup_enabled')::boolean
          ELSE true
        END AS error_cleanup_enabled,
        COALESCE(NULLIF(trim(ss.value->>'audit_cleanup_cron'), ''), '10 20 * * *') AS audit_cleanup_cron,
        COALESCE(NULLIF(trim(ss.value->>'error_cleanup_cron'), ''), '0 18 * * *') AS error_cleanup_cron
      FROM (
        SELECT COALESCE(
          (
            SELECT value
            FROM public.system_settings
            WHERE key = 'log_cleanup_cron_policy'
            LIMIT 1
          ),
          '{}'::jsonb
        ) AS value
      ) ss
    ),
    catalog AS (
      SELECT *
      FROM (VALUES
        ('attendance-ingest-worker', 'Attendance', 'SQL/RPC', 'Memproses queue absensi offline->DB.', 'UTC (WIB +7)', '* * * * *'),
        ('org-dashboard-snapshot-5m', 'Dashboard', 'SQL/RPC', 'Refresh snapshot dashboard organisasi (skip otomatis saat jam sibuk absensi).', 'UTC (WIB +7)', '*/5 * * * *'),
        ('cleanup-gps-daily', 'Maintenance', 'SQL/RPC', 'Membersihkan GPS lama pada tabel absensi partisi.', 'UTC (WIB +7)', '0 19 * * *'),
        ('analyze-partitions-daily', 'Maintenance', 'SQL/RPC', 'VACUUM ANALYZE partisi absensi harian.', 'UTC (WIB +7)', '0 20 * * *'),
        ('create-next-month-partition-monthly', 'Maintenance', 'SQL/RPC', 'Membuat partisi bulan berikutnya.', 'UTC (WIB +7)', '0 18 24 * *'),
        ('streak-subscription-sync-daily', 'Billing', 'SQL/RPC', 'Sinkron status subscription terhadap grace period streak.', 'UTC (WIB +7)', '10 17 * * *'),
        ('invoice-number-health-daily', 'Billing', 'SQL/RPC', 'Snapshot harian kesehatan nomor faktur (valid vs invalid format).', 'UTC (WIB +7)', '15 17 * * *'),
        ('billing-grace-notifier-10m', 'Billing', 'Edge Function', 'Kirim invoice grace period ke email/WhatsApp.', 'UTC (WIB +7)', '*/10 * * * *')
      ) AS t(job_name, category, target, description, timezone, expected_schedule)
      UNION ALL
      SELECT
        'cleanup-audit-logs-daily-dynamic',
        'Maintenance',
        'SQL/RPC',
        'Pembersihan log audit harian mengikuti retensi aktif.',
        'UTC (WIB +7)',
        p.audit_cleanup_cron
      FROM policy p
      UNION ALL
      SELECT
        'client-error-logs-retention-daily',
        'Maintenance',
        'SQL/RPC',
        'Pembersihan log error client harian sesuai retensi.',
        'UTC (WIB +7)',
        p.error_cleanup_cron
      FROM policy p
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
  WITH policy AS (
    SELECT
      CASE
        WHEN lower(COALESCE(ss.value->>'audit_cleanup_enabled', '')) IN ('true', 'false')
          THEN (ss.value->>'audit_cleanup_enabled')::boolean
        ELSE true
      END AS audit_cleanup_enabled,
      CASE
        WHEN lower(COALESCE(ss.value->>'error_cleanup_enabled', '')) IN ('true', 'false')
          THEN (ss.value->>'error_cleanup_enabled')::boolean
        ELSE true
      END AS error_cleanup_enabled,
      COALESCE(NULLIF(trim(ss.value->>'audit_cleanup_cron'), ''), '10 20 * * *') AS audit_cleanup_cron,
      COALESCE(NULLIF(trim(ss.value->>'error_cleanup_cron'), ''), '0 18 * * *') AS error_cleanup_cron
    FROM (
      SELECT COALESCE(
        (
          SELECT value
          FROM public.system_settings
          WHERE key = 'log_cleanup_cron_policy'
          LIMIT 1
        ),
        '{}'::jsonb
      ) AS value
    ) ss
  ),
  catalog AS (
    SELECT *
    FROM (VALUES
      ('attendance-ingest-worker', 'Attendance', 'SQL/RPC', 'Memproses queue absensi offline->DB.', 'UTC (WIB +7)', '* * * * *'),
      ('org-dashboard-snapshot-5m', 'Dashboard', 'SQL/RPC', 'Refresh snapshot dashboard organisasi (skip otomatis saat jam sibuk absensi).', 'UTC (WIB +7)', '*/5 * * * *'),
      ('cleanup-gps-daily', 'Maintenance', 'SQL/RPC', 'Membersihkan GPS lama pada tabel absensi partisi.', 'UTC (WIB +7)', '0 19 * * *'),
      ('analyze-partitions-daily', 'Maintenance', 'SQL/RPC', 'VACUUM ANALYZE partisi absensi harian.', 'UTC (WIB +7)', '0 20 * * *'),
      ('create-next-month-partition-monthly', 'Maintenance', 'SQL/RPC', 'Membuat partisi bulan berikutnya.', 'UTC (WIB +7)', '0 18 24 * *'),
      ('streak-subscription-sync-daily', 'Billing', 'SQL/RPC', 'Sinkron status subscription terhadap grace period streak.', 'UTC (WIB +7)', '10 17 * * *'),
      ('invoice-number-health-daily', 'Billing', 'SQL/RPC', 'Snapshot harian kesehatan nomor faktur (valid vs invalid format).', 'UTC (WIB +7)', '15 17 * * *'),
      ('billing-grace-notifier-10m', 'Billing', 'Edge Function', 'Kirim invoice grace period ke email/WhatsApp.', 'UTC (WIB +7)', '*/10 * * * *')
    ) AS t(job_name, category, target, description, timezone, expected_schedule)
    UNION ALL
    SELECT
      'cleanup-audit-logs-daily-dynamic',
      'Maintenance',
      'SQL/RPC',
      'Pembersihan log audit harian mengikuti retensi aktif.',
      'UTC (WIB +7)',
      p.audit_cleanup_cron
    FROM policy p
    UNION ALL
    SELECT
      'client-error-logs-retention-daily',
      'Maintenance',
      'SQL/RPC',
      'Pembersihan log error client harian sesuai retensi.',
      'UTC (WIB +7)',
      p.error_cleanup_cron
    FROM policy p
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

GRANT EXECUTE ON FUNCTION public.ensure_system_cron_jobs(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cron_jobs_overview() TO authenticated, service_role;
