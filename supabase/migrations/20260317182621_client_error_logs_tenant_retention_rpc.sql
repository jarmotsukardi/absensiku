-- Tenant-scoped retention RPC for organization HR error log page.
-- Keeps retention policy from system settings but limits execution to one tenant.

CREATE OR REPLACE FUNCTION public.apply_client_error_logs_retention_for_tenant(
  p_tenant_id uuid,
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
  v_actor uuid := auth.uid();
  v_actor_tenant_id uuid;
  v_target_tenant_id uuid;
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
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_required';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.is_super_admin(v_actor) THEN
    v_target_tenant_id := p_tenant_id;
  ELSE
    SELECT ur.tenant_id
    INTO v_actor_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = v_actor
      AND ur.role = 'admin_instansi'::public.app_role
      AND ur.tenant_id IS NOT NULL
    ORDER BY ur.created_at DESC
    LIMIT 1;

    IF v_actor_tenant_id IS NULL THEN
      v_actor_tenant_id := public.get_user_tenant_id(v_actor);
    END IF;

    IF v_actor_tenant_id IS NULL OR v_actor_tenant_id <> p_tenant_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    v_target_tenant_id := v_actor_tenant_id;
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
  WHERE tenant_id = v_target_tenant_id
    AND is_non_critical = true
    AND is_archived = false
    AND occurred_at < now() - make_interval(days => v_non_critical_archive_days);
  GET DIAGNOSTICS v_archived_non_critical = ROW_COUNT;

  UPDATE public.client_error_logs
  SET
    is_archived = true,
    archived_at = COALESCE(archived_at, now()),
    archive_note = COALESCE(NULLIF(archive_note, ''), 'Auto retention selesai kritis')
  WHERE tenant_id = v_target_tenant_id
    AND is_non_critical = false
    AND is_resolved = true
    AND is_archived = false
    AND COALESCE(resolved_at, occurred_at) < now() - make_interval(days => v_resolved_critical_archive_days);
  GET DIAGNOSTICS v_archived_resolved_critical = ROW_COUNT;

  DELETE FROM public.client_error_logs
  WHERE tenant_id = v_target_tenant_id
    AND is_non_critical = true
    AND is_archived = true
    AND COALESCE(archived_at, occurred_at) < now() - make_interval(days => v_non_critical_delete_days);
  GET DIAGNOSTICS v_deleted_non_critical = ROW_COUNT;

  DELETE FROM public.client_error_logs
  WHERE tenant_id = v_target_tenant_id
    AND is_non_critical = false
    AND (
      (is_archived = true AND COALESCE(archived_at, occurred_at) < now() - make_interval(days => v_critical_delete_days))
      OR (is_resolved = true AND COALESCE(resolved_at, occurred_at) < now() - make_interval(days => v_critical_delete_days))
    );
  GET DIAGNOSTICS v_deleted_critical = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_target_tenant_id,
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

GRANT EXECUTE ON FUNCTION public.apply_client_error_logs_retention_for_tenant(uuid, interval, interval, interval, interval) TO authenticated, service_role;
