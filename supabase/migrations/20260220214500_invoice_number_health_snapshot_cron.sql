-- Schedule daily invoice number health snapshot.
-- 00:15 WIB = 17:15 UTC (daily, off-peak).

DO $$
DECLARE
  v_has_cron BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') INTO v_has_cron;

  IF NOT v_has_cron THEN
    RAISE NOTICE 'pg_cron not available, skipping invoice-number-health-daily schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoice-number-health-daily') THEN
    PERFORM cron.unschedule('invoice-number-health-daily');
  END IF;

  PERFORM cron.schedule(
    'invoice-number-health-daily',
    '15 17 * * *',
    'SELECT public.capture_invoice_number_health_snapshot(CURRENT_DATE);'
  );
END
$$;

SELECT * FROM public.capture_invoice_number_health_snapshot(CURRENT_DATE);

