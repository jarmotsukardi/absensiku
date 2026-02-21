-- Add resolved lifecycle fields, retention automation, and alert settings seed.

ALTER TABLE public.client_error_logs
ADD COLUMN IF NOT EXISTS is_resolved boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
ADD COLUMN IF NOT EXISTS resolved_by text,
ADD COLUMN IF NOT EXISTS resolution_note text;

CREATE INDEX IF NOT EXISTS idx_client_error_logs_is_resolved
  ON public.client_error_logs (is_resolved);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_triage
  ON public.client_error_logs (is_non_critical, is_archived, is_resolved, occurred_at DESC);

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'error_alert_settings',
  jsonb_build_object(
    'enable_realtime_alerts', false,
    'webhook_url', '',
    'slack_webhook_url', '',
    'whatsapp_webhook_url', '',
    'email_webhook_url', ''
  ),
  'Pengaturan notifikasi realtime log error kritis (webhook/slack/whatsapp/email).'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.apply_client_error_logs_retention(
  p_non_critical_archive_after interval DEFAULT interval '3 days',
  p_non_critical_delete_after interval DEFAULT interval '30 days',
  p_critical_delete_after interval DEFAULT interval '180 days'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_archived_non_critical integer := 0;
  v_deleted_non_critical integer := 0;
  v_deleted_critical integer := 0;
BEGIN
  -- Allow cron/auth-less execution; enforce super admin only for interactive calls.
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.client_error_logs
  SET
    is_archived = true,
    archived_at = COALESCE(archived_at, now()),
    archive_note = COALESCE(NULLIF(archive_note, ''), 'Auto retention non-kritis')
  WHERE
    is_non_critical = true
    AND is_archived = false
    AND occurred_at < now() - p_non_critical_archive_after;
  GET DIAGNOSTICS v_archived_non_critical = ROW_COUNT;

  DELETE FROM public.client_error_logs
  WHERE
    is_non_critical = true
    AND is_archived = true
    AND COALESCE(archived_at, occurred_at) < now() - p_non_critical_delete_after;
  GET DIAGNOSTICS v_deleted_non_critical = ROW_COUNT;

  DELETE FROM public.client_error_logs
  WHERE
    is_non_critical = false
    AND (
      (is_archived = true AND COALESCE(archived_at, occurred_at) < now() - p_critical_delete_after)
      OR (is_resolved = true AND COALESCE(resolved_at, occurred_at) < now() - p_critical_delete_after)
    );
  GET DIAGNOSTICS v_deleted_critical = ROW_COUNT;

  RETURN jsonb_build_object(
    'archived_non_critical', v_archived_non_critical,
    'deleted_non_critical', v_deleted_non_critical,
    'deleted_critical', v_deleted_critical
  );
END;
$function$;

DO $$
DECLARE
  v_has_cron boolean := false;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') INTO v_has_cron;
  IF NOT v_has_cron THEN
    RAISE NOTICE 'pg_cron not available, skipping client-error-logs-retention-daily schedule';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'client-error-logs-retention-daily') THEN
    PERFORM cron.unschedule('client-error-logs-retention-daily');
  END IF;

  -- 01:00 WIB = 18:00 UTC, low traffic hour.
  PERFORM cron.schedule(
    'client-error-logs-retention-daily',
    '0 18 * * *',
    'SELECT public.apply_client_error_logs_retention();'
  );
END
$$;
