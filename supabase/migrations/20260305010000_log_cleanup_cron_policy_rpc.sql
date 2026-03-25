-- Centralized policy and RPC controls for log cleanup cron jobs.
-- This keeps audit log + client error log cleanup schedules configurable from one place.

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'log_cleanup_cron_policy',
  jsonb_build_object(
    'audit_cleanup_enabled', true,
    'audit_cleanup_cron', '10 20 * * *',
    'error_cleanup_enabled', true,
    'error_cleanup_cron', '0 18 * * *'
  ),
  'Kebijakan cron auto clean log (audit log + client error log).'
)
ON CONFLICT (key) DO UPDATE
SET
  value = jsonb_build_object(
    'audit_cleanup_enabled',
      CASE
        WHEN lower(COALESCE(public.system_settings.value->>'audit_cleanup_enabled', '')) IN ('true', 'false')
          THEN (public.system_settings.value->>'audit_cleanup_enabled')::boolean
        ELSE true
      END,
    'audit_cleanup_cron',
      COALESCE(NULLIF(trim(public.system_settings.value->>'audit_cleanup_cron'), ''), '10 20 * * *'),
    'error_cleanup_enabled',
      CASE
        WHEN lower(COALESCE(public.system_settings.value->>'error_cleanup_enabled', '')) IN ('true', 'false')
          THEN (public.system_settings.value->>'error_cleanup_enabled')::boolean
        ELSE true
      END,
    'error_cleanup_cron',
      COALESCE(NULLIF(trim(public.system_settings.value->>'error_cleanup_cron'), ''), '0 18 * * *')
  ),
  description = EXCLUDED.description,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_log_cleanup_cron_policy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_policy jsonb := '{}'::jsonb;
  v_audit_enabled boolean := true;
  v_error_enabled boolean := true;
  v_audit_cron text := '10 20 * * *';
  v_error_cron text := '0 18 * * *';
  v_has_cron boolean := false;
  v_audit_current text;
  v_error_current text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
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
    v_audit_enabled := (v_policy->>'audit_cleanup_enabled')::boolean;
  END IF;

  IF lower(COALESCE(v_policy->>'error_cleanup_enabled', '')) IN ('true', 'false') THEN
    v_error_enabled := (v_policy->>'error_cleanup_enabled')::boolean;
  END IF;

  v_audit_cron := COALESCE(NULLIF(trim(v_policy->>'audit_cleanup_cron'), ''), v_audit_cron);
  v_error_cron := COALESCE(NULLIF(trim(v_policy->>'error_cleanup_cron'), ''), v_error_cron);

  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron')
  INTO v_has_cron;

  IF v_has_cron THEN
    SELECT schedule
    INTO v_audit_current
    FROM cron.job
    WHERE jobname = 'cleanup-audit-logs-daily-dynamic'
    LIMIT 1;

    SELECT schedule
    INTO v_error_current
    FROM cron.job
    WHERE jobname = 'client-error-logs-retention-daily'
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'settings',
      jsonb_build_object(
        'audit_cleanup_enabled', v_audit_enabled,
        'audit_cleanup_cron', v_audit_cron,
        'error_cleanup_enabled', v_error_enabled,
        'error_cleanup_cron', v_error_cron
      ),
    'runtime',
      jsonb_build_object(
        'cron_available', v_has_cron,
        'audit_job_name', 'cleanup-audit-logs-daily-dynamic',
        'audit_current_schedule', v_audit_current,
        'error_job_name', 'client-error-logs-retention-daily',
        'error_current_schedule', v_error_current
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_log_cleanup_cron_jobs(
  p_audit_enabled boolean DEFAULT NULL,
  p_audit_cron text DEFAULT NULL,
  p_error_enabled boolean DEFAULT NULL,
  p_error_cron text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_policy jsonb := '{}'::jsonb;
  v_audit_enabled boolean := true;
  v_error_enabled boolean := true;
  v_audit_cron text := '10 20 * * *';
  v_error_cron text := '0 18 * * *';
  v_has_cron boolean := false;
  v_job record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
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
    v_audit_enabled := (v_policy->>'audit_cleanup_enabled')::boolean;
  END IF;

  IF lower(COALESCE(v_policy->>'error_cleanup_enabled', '')) IN ('true', 'false') THEN
    v_error_enabled := (v_policy->>'error_cleanup_enabled')::boolean;
  END IF;

  v_audit_cron := COALESCE(NULLIF(trim(v_policy->>'audit_cleanup_cron'), ''), v_audit_cron);
  v_error_cron := COALESCE(NULLIF(trim(v_policy->>'error_cleanup_cron'), ''), v_error_cron);

  IF p_audit_enabled IS NOT NULL THEN
    v_audit_enabled := p_audit_enabled;
  END IF;

  IF p_error_enabled IS NOT NULL THEN
    v_error_enabled := p_error_enabled;
  END IF;

  IF p_audit_cron IS NOT NULL THEN
    v_audit_cron := COALESCE(NULLIF(trim(p_audit_cron), ''), v_audit_cron);
  END IF;

  IF p_error_cron IS NOT NULL THEN
    v_error_cron := COALESCE(NULLIF(trim(p_error_cron), ''), v_error_cron);
  END IF;

  v_audit_cron := trim(regexp_replace(v_audit_cron, '[[:space:]]+', ' ', 'g'));
  v_error_cron := trim(regexp_replace(v_error_cron, '[[:space:]]+', ' ', 'g'));

  IF array_length(string_to_array(v_audit_cron, ' '), 1) <> 5 THEN
    RAISE EXCEPTION 'invalid_audit_cron_expression';
  END IF;

  IF array_length(string_to_array(v_error_cron, ' '), 1) <> 5 THEN
    RAISE EXCEPTION 'invalid_error_cron_expression';
  END IF;

  INSERT INTO public.system_settings (key, value, description, updated_at, updated_by)
  VALUES (
    'log_cleanup_cron_policy',
    jsonb_build_object(
      'audit_cleanup_enabled', v_audit_enabled,
      'audit_cleanup_cron', v_audit_cron,
      'error_cleanup_enabled', v_error_enabled,
      'error_cleanup_cron', v_error_cron
    ),
    'Kebijakan cron auto clean log (audit log + client error log).',
    now(),
    auth.uid()
  )
  ON CONFLICT (key) DO UPDATE
  SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now(),
    updated_by = auth.uid();

  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron')
  INTO v_has_cron;

  IF NOT v_has_cron THEN
    RETURN jsonb_build_object(
      'cron_available', false,
      'settings', jsonb_build_object(
        'audit_cleanup_enabled', v_audit_enabled,
        'audit_cleanup_cron', v_audit_cron,
        'error_cleanup_enabled', v_error_enabled,
        'error_cleanup_cron', v_error_cron
      )
    );
  END IF;

  -- Remove legacy/duplicate audit cleanup schedules first.
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

  -- Remove previous error retention schedule before re-apply.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'client-error-logs-retention-daily') THEN
    PERFORM cron.unschedule('client-error-logs-retention-daily');
  END IF;

  IF v_audit_enabled THEN
    PERFORM cron.schedule(
      'cleanup-audit-logs-daily-dynamic',
      v_audit_cron,
      'SELECT public.cleanup_old_audit_logs();'
    );
  END IF;

  IF v_error_enabled THEN
    PERFORM cron.schedule(
      'client-error-logs-retention-daily',
      v_error_cron,
      'SELECT public.apply_client_error_logs_retention();'
    );
  END IF;

  RETURN public.get_log_cleanup_cron_policy();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_log_cleanup_cron_policy() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configure_log_cleanup_cron_jobs(boolean, text, boolean, text) TO authenticated, service_role;

DO $$
BEGIN
  PERFORM public.configure_log_cleanup_cron_jobs();
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'configure_log_cleanup_cron_jobs skipped: %', SQLERRM;
END
$$;
