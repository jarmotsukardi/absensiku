-- Configurable retention for client error logs and organization activity logs.
-- Also adds per-tenant activity logging toggle at insert-time guard level.

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'client_error_logs_retention_policy',
  jsonb_build_object(
    'non_critical_archive_days', 3,
    'non_critical_delete_days', 30,
    'resolved_critical_archive_days', 7,
    'critical_delete_days', 180
  ),
  'Kebijakan retensi log error client (hari): arsip non-kritis, hapus non-kritis, arsip kritis selesai, hapus kritis.'
)
ON CONFLICT (key) DO UPDATE
SET
  value = jsonb_build_object(
    'non_critical_archive_days',
      CASE
        WHEN COALESCE(public.system_settings.value->>'non_critical_archive_days', '') ~ '^[0-9]+$'
          THEN GREATEST((public.system_settings.value->>'non_critical_archive_days')::integer, 1)
        ELSE 3
      END,
    'non_critical_delete_days',
      CASE
        WHEN COALESCE(public.system_settings.value->>'non_critical_delete_days', '') ~ '^[0-9]+$'
          THEN GREATEST((public.system_settings.value->>'non_critical_delete_days')::integer, 1)
        ELSE 30
      END,
    'resolved_critical_archive_days',
      CASE
        WHEN COALESCE(public.system_settings.value->>'resolved_critical_archive_days', '') ~ '^[0-9]+$'
          THEN GREATEST((public.system_settings.value->>'resolved_critical_archive_days')::integer, 1)
        ELSE 7
      END,
    'critical_delete_days',
      CASE
        WHEN COALESCE(public.system_settings.value->>'critical_delete_days', '') ~ '^[0-9]+$'
          THEN GREATEST((public.system_settings.value->>'critical_delete_days')::integer, 1)
        ELSE 180
      END
  ),
  description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'audit_logs_activity_policy',
  jsonb_build_object(
    'retention_days', 60,
    'default_org_logging_enabled', true,
    'tenant_overrides', jsonb_build_object()
  ),
  'Kebijakan log aktivitas organisasi: retensi (hari), status default logging org, dan override per tenant.'
)
ON CONFLICT (key) DO UPDATE
SET
  value = jsonb_build_object(
    'retention_days',
      CASE
        WHEN COALESCE(public.system_settings.value->>'retention_days', '') ~ '^[0-9]+$'
          THEN GREATEST((public.system_settings.value->>'retention_days')::integer, 1)
        ELSE 60
      END,
    'default_org_logging_enabled',
      CASE
        WHEN lower(COALESCE(public.system_settings.value->>'default_org_logging_enabled', '')) IN ('true', 'false')
          THEN (public.system_settings.value->>'default_org_logging_enabled')::boolean
        ELSE true
      END,
    'tenant_overrides',
      CASE
        WHEN jsonb_typeof(public.system_settings.value->'tenant_overrides') = 'object'
          THEN public.system_settings.value->'tenant_overrides'
        ELSE '{}'::jsonb
      END
  ),
  description = EXCLUDED.description,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_audit_logs_retention_days()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days integer := 60;
  v_raw text;
BEGIN
  SELECT value->>'retention_days'
  INTO v_raw
  FROM public.system_settings
  WHERE key = 'audit_logs_activity_policy'
  LIMIT 1;

  IF COALESCE(v_raw, '') ~ '^[0-9]+$' THEN
    v_days := GREATEST(v_raw::integer, 1);
  END IF;

  RETURN v_days;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_org_activity_logging_enabled(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_policy jsonb := '{}'::jsonb;
  v_default_enabled boolean := true;
  v_default_raw text;
  v_override_raw text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT value
  INTO v_policy
  FROM public.system_settings
  WHERE key = 'audit_logs_activity_policy'
  LIMIT 1;

  IF v_policy IS NULL OR jsonb_typeof(v_policy) <> 'object' THEN
    RETURN true;
  END IF;

  v_default_raw := v_policy->>'default_org_logging_enabled';
  IF lower(COALESCE(v_default_raw, '')) IN ('true', 'false') THEN
    v_default_enabled := v_default_raw::boolean;
  END IF;

  IF jsonb_typeof(v_policy->'tenant_overrides') = 'object' THEN
    v_override_raw := (v_policy->'tenant_overrides'->>p_tenant_id::text);
    IF lower(COALESCE(v_override_raw, '')) IN ('true', 'false') THEN
      RETURN v_override_raw::boolean;
    END IF;
  END IF;

  RETURN v_default_enabled;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_audit_logs_insert_by_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL AND NOT public.is_org_activity_logging_enabled(NEW.tenant_id) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_audit_logs_insert_by_policy ON public.audit_logs;
CREATE TRIGGER trg_guard_audit_logs_insert_by_policy
BEFORE INSERT ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.guard_audit_logs_insert_by_policy();

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_retention_days integer := public.get_audit_logs_retention_days();
    cutoff_date timestamptz;
    deleted_count integer;
BEGIN
    cutoff_date := NOW() - make_interval(days => v_retention_days);

    DELETE FROM public.audit_logs
    WHERE created_at < cutoff_date
      AND action NOT IN ('CREATE_PARTITION', 'CLEANUP_GPS_DATA_PARTITIONED');

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count > 0 THEN
        INSERT INTO public.audit_logs (action, table_name, new_values)
        VALUES (
            'CLEANUP_AUDIT_LOGS',
            'audit_logs',
            jsonb_build_object(
                'retention_days', v_retention_days,
                'cutoff_date', cutoff_date,
                'deleted_count', deleted_count,
                'executed_at', NOW()
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'retention_days', v_retention_days,
        'cutoff_date', cutoff_date,
        'deleted_count', deleted_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_client_error_logs_retention(
  p_non_critical_archive_after interval DEFAULT NULL,
  p_non_critical_delete_after interval DEFAULT NULL,
  p_resolved_critical_archive_after interval DEFAULT NULL,
  p_critical_delete_after interval DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_policy jsonb := '{}'::jsonb;
  v_archived_non_critical integer := 0;
  v_archived_resolved_critical integer := 0;
  v_deleted_non_critical integer := 0;
  v_deleted_critical integer := 0;
  v_non_critical_archive_days integer := 3;
  v_non_critical_delete_days integer := 30;
  v_resolved_critical_archive_days integer := 7;
  v_critical_delete_days integer := 180;
  v_days_raw text;
BEGIN
  -- Allow cron/auth-less execution; enforce super admin only for interactive calls.
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT value
  INTO v_policy
  FROM public.system_settings
  WHERE key = 'client_error_logs_retention_policy'
  LIMIT 1;

  IF v_policy IS NULL OR jsonb_typeof(v_policy) <> 'object' THEN
    v_policy := '{}'::jsonb;
  END IF;

  IF p_non_critical_archive_after IS NOT NULL THEN
    v_non_critical_archive_days := GREATEST(1, CEIL(EXTRACT(epoch FROM p_non_critical_archive_after) / 86400.0)::integer);
  ELSE
    v_days_raw := v_policy->>'non_critical_archive_days';
    IF COALESCE(v_days_raw, '') ~ '^[0-9]+$' THEN
      v_non_critical_archive_days := GREATEST(v_days_raw::integer, 1);
    END IF;
  END IF;

  IF p_non_critical_delete_after IS NOT NULL THEN
    v_non_critical_delete_days := GREATEST(1, CEIL(EXTRACT(epoch FROM p_non_critical_delete_after) / 86400.0)::integer);
  ELSE
    v_days_raw := v_policy->>'non_critical_delete_days';
    IF COALESCE(v_days_raw, '') ~ '^[0-9]+$' THEN
      v_non_critical_delete_days := GREATEST(v_days_raw::integer, 1);
    END IF;
  END IF;

  IF p_resolved_critical_archive_after IS NOT NULL THEN
    v_resolved_critical_archive_days := GREATEST(1, CEIL(EXTRACT(epoch FROM p_resolved_critical_archive_after) / 86400.0)::integer);
  ELSE
    v_days_raw := v_policy->>'resolved_critical_archive_days';
    IF COALESCE(v_days_raw, '') ~ '^[0-9]+$' THEN
      v_resolved_critical_archive_days := GREATEST(v_days_raw::integer, 1);
    END IF;
  END IF;

  IF p_critical_delete_after IS NOT NULL THEN
    v_critical_delete_days := GREATEST(1, CEIL(EXTRACT(epoch FROM p_critical_delete_after) / 86400.0)::integer);
  ELSE
    v_days_raw := v_policy->>'critical_delete_days';
    IF COALESCE(v_days_raw, '') ~ '^[0-9]+$' THEN
      v_critical_delete_days := GREATEST(v_days_raw::integer, 1);
    END IF;
  END IF;

  UPDATE public.client_error_logs
  SET
    is_archived = true,
    archived_at = COALESCE(archived_at, now()),
    archive_note = COALESCE(NULLIF(archive_note, ''), 'Auto retention non-kritis')
  WHERE
    is_non_critical = true
    AND is_archived = false
    AND occurred_at < now() - make_interval(days => v_non_critical_archive_days);
  GET DIAGNOSTICS v_archived_non_critical = ROW_COUNT;

  UPDATE public.client_error_logs
  SET
    is_archived = true,
    archived_at = COALESCE(archived_at, now()),
    archive_note = COALESCE(NULLIF(archive_note, ''), 'Auto retention selesai kritis')
  WHERE
    is_non_critical = false
    AND is_resolved = true
    AND is_archived = false
    AND COALESCE(resolved_at, occurred_at) < now() - make_interval(days => v_resolved_critical_archive_days);
  GET DIAGNOSTICS v_archived_resolved_critical = ROW_COUNT;

  DELETE FROM public.client_error_logs
  WHERE
    is_non_critical = true
    AND is_archived = true
    AND COALESCE(archived_at, occurred_at) < now() - make_interval(days => v_non_critical_delete_days);
  GET DIAGNOSTICS v_deleted_non_critical = ROW_COUNT;

  DELETE FROM public.client_error_logs
  WHERE
    is_non_critical = false
    AND (
      (is_archived = true AND COALESCE(archived_at, occurred_at) < now() - make_interval(days => v_critical_delete_days))
      OR (is_resolved = true AND COALESCE(resolved_at, occurred_at) < now() - make_interval(days => v_critical_delete_days))
    );
  GET DIAGNOSTICS v_deleted_critical = ROW_COUNT;

  RETURN jsonb_build_object(
    'archived_non_critical', v_archived_non_critical,
    'archived_resolved_critical', v_archived_resolved_critical,
    'deleted_non_critical', v_deleted_non_critical,
    'deleted_critical', v_deleted_critical,
    'retention_days', jsonb_build_object(
      'non_critical_archive_days', v_non_critical_archive_days,
      'non_critical_delete_days', v_non_critical_delete_days,
      'resolved_critical_archive_days', v_resolved_critical_archive_days,
      'critical_delete_days', v_critical_delete_days
    )
  );
END;
$function$;
