-- Schedule HR ticket SLA automation job (best-effort if pg_cron exists)
DO $$
DECLARE
  v_has_cron boolean := false;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') INTO v_has_cron;

  IF NOT v_has_cron THEN
    RAISE NOTICE 'pg_cron not available, skipping hr-ticket-sla-automation-hourly schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-ticket-sla-automation-hourly') THEN
    PERFORM cron.unschedule('hr-ticket-sla-automation-hourly');
  END IF;

  PERFORM cron.schedule(
    'hr-ticket-sla-automation-hourly',
    '0 * * * *',
    'SELECT public.hr_ticket_run_sla_automation(NULL);'
  );
END $$;
