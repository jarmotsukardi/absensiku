-- Register device push dispatcher cron job in ensure_system_cron_jobs.

CREATE OR REPLACE FUNCTION public.ensure_system_cron_jobs(
  p_billing_notifier_secret TEXT DEFAULT NULL,
  p_public_site_url TEXT DEFAULT NULL,
  p_billing_interval TEXT DEFAULT '*/10 * * * *',
  p_push_dispatcher_secret TEXT DEFAULT NULL,
  p_push_dispatcher_interval TEXT DEFAULT '*/5 * * * *'
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
  v_billing_endpoint TEXT;
  v_push_endpoint TEXT;
  v_result JSONB := '{}'::jsonb;
  v_jobs JSONB := '[]'::jsonb;
  v_policy JSONB := '{}'::jsonb;
  v_audit_cleanup_enabled BOOLEAN := true;
  v_error_cleanup_enabled BOOLEAN := true;
  v_audit_cleanup_cron TEXT := '10 20 * * *';
  v_error_cleanup_cron TEXT := '0 18 * * *';
  v_push_secret TEXT := NULL;
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
    v_billing_endpoint := RTRIM(v_base_url, '/') || '/functions/v1/billing-grace-notifier';

    PERFORM cron.schedule(
      'billing-grace-notifier-10m',
      COALESCE(NULLIF(BTRIM(p_billing_interval), ''), '*/10 * * * *'),
      format(
        'SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-cron-secret'', %L), body := %L::jsonb);',
        v_billing_endpoint,
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

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'device-push-dispatcher-5m') THEN
    PERFORM cron.unschedule('device-push-dispatcher-5m');
  END IF;

  v_push_secret := NULLIF(BTRIM(p_push_dispatcher_secret), '');
  IF v_push_secret IS NULL THEN
    v_push_secret := NULLIF(BTRIM(p_billing_notifier_secret), '');
  END IF;

  IF v_has_net AND v_push_secret IS NOT NULL THEN
    v_push_endpoint := RTRIM(v_base_url, '/') || '/functions/v1/dispatch-device-pushes';

    PERFORM cron.schedule(
      'device-push-dispatcher-5m',
      COALESCE(NULLIF(BTRIM(p_push_dispatcher_interval), ''), '*/5 * * * *'),
      format(
        'SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-cron-secret'', %L), body := %L::jsonb);',
        v_push_endpoint,
        v_push_secret,
        '{"dry_run":false,"limit":200}'
      )
    );

    v_result := v_result || jsonb_build_object('device_push_dispatcher', 'scheduled');
  ELSE
    v_result := v_result || jsonb_build_object(
      'device_push_dispatcher',
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
    'billing-grace-notifier-10m',
    'device-push-dispatcher-5m'
  ]);

  RETURN jsonb_build_object(
    'success', true,
    'detail', v_result,
    'jobs', v_jobs
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_system_cron_jobs(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
