-- Backend summary/save RPC for admin audit activity policy.

CREATE OR REPLACE FUNCTION public.get_audit_activity_policy_summary()
RETURNS TABLE (
  setting_id uuid,
  policy jsonb,
  effective_retention_days integer,
  updated_at timestamptz,
  updated_by uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_setting public.system_settings%ROWTYPE;
  v_policy jsonb := jsonb_build_object(
    'retention_days', 60,
    'default_org_logging_enabled', true,
    'tenant_overrides', jsonb_build_object()
  );
  v_effective_retention integer := 60;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO v_setting
  FROM public.system_settings
  WHERE key = 'audit_logs_activity_policy'
  LIMIT 1;

  IF FOUND AND v_setting.value IS NOT NULL AND jsonb_typeof(v_setting.value) = 'object' THEN
    v_policy := jsonb_build_object(
      'retention_days',
        CASE
          WHEN COALESCE(v_setting.value->>'retention_days', '') ~ '^[0-9]+$'
            THEN GREATEST((v_setting.value->>'retention_days')::integer, 1)
          ELSE 60
        END,
      'default_org_logging_enabled',
        CASE
          WHEN lower(COALESCE(v_setting.value->>'default_org_logging_enabled', '')) IN ('true', 'false')
            THEN (v_setting.value->>'default_org_logging_enabled')::boolean
          ELSE true
        END,
      'tenant_overrides',
        CASE
          WHEN jsonb_typeof(v_setting.value->'tenant_overrides') = 'object'
            THEN v_setting.value->'tenant_overrides'
          ELSE '{}'::jsonb
        END
    );
  END IF;

  v_effective_retention := public.get_audit_logs_retention_days();

  RETURN QUERY
  SELECT
    v_setting.id,
    v_policy,
    v_effective_retention,
    v_setting.updated_at,
    v_setting.updated_by;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_audit_activity_policy(
  p_policy jsonb
)
RETURNS TABLE (
  setting_id uuid,
  policy jsonb,
  effective_retention_days integer,
  updated_at timestamptz,
  updated_by uuid,
  audit_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_previous public.system_settings%ROWTYPE;
  v_setting public.system_settings%ROWTYPE;
  v_policy jsonb;
  v_retention_days integer := 60;
  v_default_enabled boolean := true;
  v_tenant_overrides jsonb := '{}'::jsonb;
  v_retention_raw text;
  v_default_raw text;
  v_audit_id uuid;
  v_action text := 'UPDATE_AUDIT_ACTIVITY_POLICY';
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_policy IS NULL OR jsonb_typeof(p_policy) <> 'object' THEN
    RAISE EXCEPTION 'invalid_policy_payload';
  END IF;

  SELECT *
  INTO v_previous
  FROM public.system_settings
  WHERE key = 'audit_logs_activity_policy'
  LIMIT 1;

  v_retention_raw := p_policy->>'retention_days';
  IF COALESCE(v_retention_raw, '') ~ '^[0-9]+$' THEN
    v_retention_days := GREATEST(v_retention_raw::integer, 1);
  END IF;

  v_default_raw := p_policy->>'default_org_logging_enabled';
  IF lower(COALESCE(v_default_raw, '')) IN ('true', 'false') THEN
    v_default_enabled := v_default_raw::boolean;
  END IF;

  IF jsonb_typeof(p_policy->'tenant_overrides') = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(key, to_jsonb(value::boolean)), '{}'::jsonb)
    INTO v_tenant_overrides
    FROM jsonb_each_text(p_policy->'tenant_overrides')
    WHERE lower(value) IN ('true', 'false');
  END IF;

  v_policy := jsonb_build_object(
    'retention_days', v_retention_days,
    'default_org_logging_enabled', v_default_enabled,
    'tenant_overrides', COALESCE(v_tenant_overrides, '{}'::jsonb)
  );

  INSERT INTO public.system_settings AS ss (
    key,
    value,
    description,
    updated_at,
    updated_by
  )
  VALUES (
    'audit_logs_activity_policy',
    v_policy,
    'Kebijakan log aktivitas organisasi: retensi (hari), status default logging org, dan override per tenant.',
    now(),
    v_actor
  )
  ON CONFLICT (key) DO UPDATE
  SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by
  RETURNING ss.*
  INTO v_setting;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'audit_policy_save_failed';
  END IF;

  IF v_previous.id IS NULL THEN
    v_action := 'CREATE_AUDIT_ACTIVITY_POLICY';
  END IF;

  INSERT INTO public.audit_logs (
    employee_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  )
  VALUES (
    NULL,
    v_action,
    'system_settings',
    v_setting.id,
    CASE WHEN v_previous.id IS NULL THEN NULL ELSE v_previous.value END,
    v_policy
  )
  RETURNING id
  INTO v_audit_id;

  RETURN QUERY
  SELECT
    v_setting.id,
    v_policy,
    public.get_audit_logs_retention_days(),
    v_setting.updated_at,
    v_setting.updated_by,
    v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_audit_activity_policy_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audit_activity_policy_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.save_audit_activity_policy(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_audit_activity_policy(jsonb) TO authenticated;
