-- Ensure audit log cleanup runs daily and always follows dynamic retention policy.
-- Retention days are read at runtime from public.get_audit_logs_retention_days().

DO $$
DECLARE
  v_has_cron boolean := false;
  v_job record;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron')
  INTO v_has_cron;

  IF NOT v_has_cron THEN
    RAISE NOTICE 'pg_cron not available, skipping audit-log daily cleanup schedule';
    RETURN;
  END IF;

  -- Remove old/duplicate cleanup schedules (weekly or legacy names) to avoid double execution.
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE command ILIKE '%cleanup_old_audit_logs%'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  -- 20:10 UTC = 03:10 WIB, low traffic hour.
  PERFORM cron.schedule(
    'cleanup-audit-logs-daily-dynamic',
    '10 20 * * *',
    'SELECT public.cleanup_old_audit_logs();'
  );
END
$$;
