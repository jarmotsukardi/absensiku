-- Centralized policy and RPC controls for notification history cleanup.
-- This keeps notification retention configurable (days + cron schedule) and supports manual cleanup.

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'notification_cleanup_policy',
  jsonb_build_object(
    'notification_cleanup_enabled', true,
    'notification_cleanup_cron', '30 20 * * *',
    'notification_retention_days', 30
  ),
  'Kebijakan cron auto clean riwayat notifikasi (retensi hari + jadwal cron).'
)
ON CONFLICT (key) DO UPDATE
SET
  value = jsonb_build_object(
    'notification_cleanup_enabled',
      CASE
        WHEN lower(COALESCE(public.system_settings.value->>'notification_cleanup_enabled', '')) IN ('true', 'false')
          THEN (public.system_settings.value->>'notification_cleanup_enabled')::boolean
        ELSE true
      END,
    'notification_cleanup_cron',
      COALESCE(NULLIF(trim(public.system_settings.value->>'notification_cleanup_cron'), ''), '30 20 * * *'),
    'notification_retention_days',
      CASE
        WHEN COALESCE(NULLIF(trim(public.system_settings.value->>'notification_retention_days'), ''), '') ~ '^[0-9]+$'
          THEN GREATEST((public.system_settings.value->>'notification_retention_days')::integer, 1)
        ELSE 30
      END
  ),
  description = EXCLUDED.description,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_notification_cleanup_policy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_policy jsonb := '{}'::jsonb;
  v_enabled boolean := true;
  v_cron text := '30 20 * * *';
  v_retention_days integer := 30;
  v_raw_retention text := '';
  v_has_cron boolean := false;
  v_current_schedule text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT value
  INTO v_policy
  FROM public.system_settings
  WHERE key = 'notification_cleanup_policy'
  LIMIT 1;

  IF v_policy IS NULL OR jsonb_typeof(v_policy) <> 'object' THEN
    v_policy := '{}'::jsonb;
  END IF;

  IF lower(COALESCE(v_policy->>'notification_cleanup_enabled', '')) IN ('true', 'false') THEN
    v_enabled := (v_policy->>'notification_cleanup_enabled')::boolean;
  END IF;

  v_cron := COALESCE(NULLIF(trim(v_policy->>'notification_cleanup_cron'), ''), v_cron);
  v_cron := trim(regexp_replace(v_cron, '[[:space:]]+', ' ', 'g'));
  IF array_length(string_to_array(v_cron, ' '), 1) <> 5 THEN
    v_cron := '30 20 * * *';
  END IF;

  v_raw_retention := COALESCE(NULLIF(trim(v_policy->>'notification_retention_days'), ''), '');
  IF v_raw_retention ~ '^[0-9]+$' THEN
    v_retention_days := GREATEST(v_raw_retention::integer, 1);
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron')
  INTO v_has_cron;

  IF v_has_cron THEN
    SELECT schedule
    INTO v_current_schedule
    FROM cron.job
    WHERE jobname = 'notifications-retention-daily'
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'settings',
      jsonb_build_object(
        'notification_cleanup_enabled', v_enabled,
        'notification_cleanup_cron', v_cron,
        'notification_retention_days', v_retention_days
      ),
    'runtime',
      jsonb_build_object(
        'cron_available', v_has_cron,
        'notification_job_name', 'notifications-retention-daily',
        'notification_current_schedule', v_current_schedule
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_notifications_retention(
  p_retention_days integer DEFAULT NULL,
  p_limit integer DEFAULT 50000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_policy jsonb := '{}'::jsonb;
  v_retention_days integer := 30;
  v_limit integer := GREATEST(COALESCE(p_limit, 50000), 1);
  v_deleted_count integer := 0;
  v_raw_retention text := '';
BEGIN
  -- Allow cron/auth-less execution; enforce super admin only for interactive calls.
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_retention_days IS NOT NULL THEN
    v_retention_days := GREATEST(p_retention_days, 1);
  ELSE
    SELECT value
    INTO v_policy
    FROM public.system_settings
    WHERE key = 'notification_cleanup_policy'
    LIMIT 1;

    IF v_policy IS NULL OR jsonb_typeof(v_policy) <> 'object' THEN
      v_policy := '{}'::jsonb;
    END IF;

    v_raw_retention := COALESCE(NULLIF(trim(v_policy->>'notification_retention_days'), ''), '');
    IF v_raw_retention ~ '^[0-9]+$' THEN
      v_retention_days := GREATEST(v_raw_retention::integer, 1);
    END IF;
  END IF;

  WITH candidates AS (
    SELECT n.id
    FROM public.notifications n
    WHERE n.created_at < now() - make_interval(days => v_retention_days)
    ORDER BY n.created_at ASC
    LIMIT v_limit
  )
  DELETE FROM public.notifications n
  USING candidates c
  WHERE n.id = c.id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_count', v_deleted_count,
    'retention_days', v_retention_days,
    'limit', v_limit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_notification_cleanup_cron(
  p_enabled boolean DEFAULT NULL,
  p_cron text DEFAULT NULL,
  p_retention_days integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_policy jsonb := '{}'::jsonb;
  v_enabled boolean := true;
  v_cron text := '30 20 * * *';
  v_retention_days integer := 30;
  v_raw_retention text := '';
  v_has_cron boolean := false;
  v_job record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT value
  INTO v_policy
  FROM public.system_settings
  WHERE key = 'notification_cleanup_policy'
  LIMIT 1;

  IF v_policy IS NULL OR jsonb_typeof(v_policy) <> 'object' THEN
    v_policy := '{}'::jsonb;
  END IF;

  IF lower(COALESCE(v_policy->>'notification_cleanup_enabled', '')) IN ('true', 'false') THEN
    v_enabled := (v_policy->>'notification_cleanup_enabled')::boolean;
  END IF;

  v_cron := COALESCE(NULLIF(trim(v_policy->>'notification_cleanup_cron'), ''), v_cron);

  v_raw_retention := COALESCE(NULLIF(trim(v_policy->>'notification_retention_days'), ''), '');
  IF v_raw_retention ~ '^[0-9]+$' THEN
    v_retention_days := GREATEST(v_raw_retention::integer, 1);
  END IF;

  IF p_enabled IS NOT NULL THEN
    v_enabled := p_enabled;
  END IF;

  IF p_cron IS NOT NULL THEN
    v_cron := COALESCE(NULLIF(trim(p_cron), ''), v_cron);
  END IF;

  IF p_retention_days IS NOT NULL THEN
    v_retention_days := GREATEST(p_retention_days, 1);
  END IF;

  v_cron := trim(regexp_replace(v_cron, '[[:space:]]+', ' ', 'g'));
  IF array_length(string_to_array(v_cron, ' '), 1) <> 5 THEN
    RAISE EXCEPTION 'invalid_notification_cron_expression';
  END IF;

  INSERT INTO public.system_settings (key, value, description, updated_at, updated_by)
  VALUES (
    'notification_cleanup_policy',
    jsonb_build_object(
      'notification_cleanup_enabled', v_enabled,
      'notification_cleanup_cron', v_cron,
      'notification_retention_days', v_retention_days
    ),
    'Kebijakan cron auto clean riwayat notifikasi (retensi hari + jadwal cron).',
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

  IF v_has_cron THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notifications-retention-daily') THEN
      PERFORM cron.unschedule('notifications-retention-daily');
    END IF;

    FOR v_job IN
      SELECT jobid
      FROM cron.job
      WHERE command ILIKE '%apply_notifications_retention%'
    LOOP
      PERFORM cron.unschedule(v_job.jobid);
    END LOOP;

    IF v_enabled THEN
      PERFORM cron.schedule(
        'notifications-retention-daily',
        v_cron,
        'SELECT public.apply_notifications_retention();'
      );
    END IF;
  END IF;

  RETURN public.get_notification_cleanup_policy();
END;
$$;

REVOKE ALL ON FUNCTION public.get_notification_cleanup_policy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_notifications_retention(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.configure_notification_cleanup_cron(boolean, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_notification_cleanup_policy() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_notifications_retention(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configure_notification_cleanup_cron(boolean, text, integer) TO authenticated, service_role;

DO $$
BEGIN
  PERFORM public.configure_notification_cleanup_cron();
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'configure_notification_cleanup_cron skipped: %', SQLERRM;
END
$$;
