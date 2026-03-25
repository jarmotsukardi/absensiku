-- Fix array parser in manual unpaid-cleanup reminder RPC.
-- Previous implementation used jsonb_array_elements_text in SELECT list + LIMIT 1,
-- which could collapse values to first item only.

CREATE OR REPLACE FUNCTION public.send_unpaid_cleanup_reminder(
  p_tenant_id UUID,
  p_force BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id UUID := auth.uid();
  v_jwt_role TEXT := COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  v_enabled BOOLEAN := false;
  v_sync_result JSONB := '{}'::jsonb;
  v_reminder_days INTEGER[] := ARRAY[14, 7, 3, 1];
  v_protected_codes TEXT[] := ARRAY[]::TEXT[];
  v_lifecycle RECORD;
  v_days_left INTEGER;
  v_already_reminded_today BOOLEAN := false;
  v_recipients UUID[] := ARRAY[]::UUID[];
  v_title TEXT;
  v_message TEXT;
  v_notifications_inserted INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  IF v_actor_id IS NOT NULL AND NOT is_super_admin(v_actor_id) AND LOWER(v_jwt_role) <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    CASE
      WHEN jsonb_typeof(value) = 'boolean' THEN (value #>> '{}')::BOOLEAN
      WHEN jsonb_typeof(value->'value') = 'boolean' THEN (value->>'value')::BOOLEAN
      WHEN LOWER(value->>'value') IN ('true', 'false') THEN (value->>'value')::BOOLEAN
      ELSE NULL
    END
  INTO v_enabled
  FROM public.system_settings
  WHERE key = 'unpaid_cleanup_enabled'
  LIMIT 1;

  v_enabled := COALESCE(v_enabled, false);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'cleanup_disabled',
      'tenant_id', p_tenant_id
    );
  END IF;

  WITH reminder_setting AS (
    SELECT value
    FROM public.system_settings
    WHERE key = 'unpaid_cleanup_reminder_days'
    LIMIT 1
  ),
  reminder_elements AS (
    SELECT jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(value->'days') = 'array' THEN value->'days'
        WHEN jsonb_typeof(value->'value') = 'array' THEN value->'value'
        WHEN jsonb_typeof(value) = 'array' THEN value
        ELSE '[]'::jsonb
      END
    ) AS elem
    FROM reminder_setting
  )
  SELECT COALESCE(ARRAY_AGG(day_value ORDER BY day_value DESC), ARRAY[14, 7, 3, 1])
  INTO v_reminder_days
  FROM (
    SELECT DISTINCT
      CASE
        WHEN elem ~ '^[0-9]+$' THEN elem::INTEGER
        ELSE NULL
      END AS day_value
    FROM reminder_elements
  ) parsed_days
  WHERE day_value IS NOT NULL
    AND day_value >= 0;

  WITH protected_setting AS (
    SELECT value
    FROM public.system_settings
    WHERE key = 'unpaid_cleanup_protected_tenant_codes'
    LIMIT 1
  ),
  protected_elements AS (
    SELECT jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(value->'codes') = 'array' THEN value->'codes'
        WHEN jsonb_typeof(value->'value') = 'array' THEN value->'value'
        WHEN jsonb_typeof(value) = 'array' THEN value
        ELSE '[]'::jsonb
      END
    ) AS code_value
    FROM protected_setting
  )
  SELECT COALESCE(ARRAY_AGG(DISTINCT UPPER(TRIM(code_value))), ARRAY[]::TEXT[])
  INTO v_protected_codes
  FROM protected_elements
  WHERE TRIM(code_value) <> '';

  v_sync_result := public.sync_unpaid_cleanup_schedules(p_tenant_id);

  SELECT
    l.id,
    l.tenant_id,
    l.status,
    l.purge_at,
    l.reminder_count,
    l.reminder_history,
    t.name AS tenant_name,
    t.code AS tenant_code
  INTO v_lifecycle
  FROM public.tenant_cleanup_lifecycle l
  JOIN public.tenants t ON t.id = l.tenant_id
  WHERE l.tenant_id = p_tenant_id
  ORDER BY
    CASE WHEN l.status = 'scheduled' THEN 0 ELSE 1 END,
    l.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'lifecycle_not_found',
      'tenant_id', p_tenant_id,
      'sync', v_sync_result
    );
  END IF;

  IF CARDINALITY(v_protected_codes) > 0
     AND UPPER(COALESCE(v_lifecycle.tenant_code, '')) = ANY(v_protected_codes) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'protected_tenant',
      'tenant_id', p_tenant_id,
      'tenant_code', v_lifecycle.tenant_code,
      'protected_codes', v_protected_codes,
      'sync', v_sync_result
    );
  END IF;

  IF COALESCE(v_lifecycle.status, '') <> 'scheduled' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_scheduled',
      'tenant_id', p_tenant_id,
      'status', v_lifecycle.status,
      'sync', v_sync_result
    );
  END IF;

  v_days_left := (v_lifecycle.purge_at::DATE - CURRENT_DATE);
  IF v_days_left < 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'past_purge',
      'tenant_id', p_tenant_id,
      'days_left', v_days_left,
      'purge_at', v_lifecycle.purge_at,
      'sync', v_sync_result
    );
  END IF;

  IF NOT p_force AND NOT (v_days_left = ANY(v_reminder_days)) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'outside_schedule',
      'tenant_id', p_tenant_id,
      'days_left', v_days_left,
      'allowed_days', v_reminder_days,
      'sync', v_sync_result
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_lifecycle.reminder_history, '[]'::jsonb)) hist
    WHERE (hist ? 'days_left')
      AND (hist->>'days_left') ~ '^[0-9]+$'
      AND (hist->>'days_left')::INTEGER = v_days_left
      AND (
        (
          (hist ? 'sent_date')
          AND (hist->>'sent_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND (hist->>'sent_date')::DATE = CURRENT_DATE
        )
        OR (
          (hist ? 'sent_at')
          AND (hist->>'sent_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          AND (hist->>'sent_at')::DATE = CURRENT_DATE
        )
      )
  )
  INTO v_already_reminded_today;

  IF v_already_reminded_today THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_sent_today',
      'tenant_id', p_tenant_id,
      'days_left', v_days_left,
      'purge_at', v_lifecycle.purge_at,
      'sync', v_sync_result
    );
  END IF;

  SELECT COALESCE(array_agg(DISTINCT ur.user_id), ARRAY[]::UUID[])
  INTO v_recipients
  FROM public.user_roles ur
  WHERE ur.role = 'super_admin'
     OR (ur.role = 'admin_instansi' AND ur.tenant_id = p_tenant_id);

  IF CARDINALITY(v_recipients) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'no_recipients',
      'tenant_id', p_tenant_id,
      'days_left', v_days_left,
      'purge_at', v_lifecycle.purge_at,
      'sync', v_sync_result
    );
  END IF;

  v_title := format('Reminder Manual Purge Data (%s hari)', v_days_left);
  v_message := format(
    'Tenant %s belum menyelesaikan pembayaran. Data terjadwal dipurge pada %s (UTC). Mohon tindak lanjut pembayaran segera.',
    COALESCE(v_lifecycle.tenant_name, '-'),
    to_char(v_lifecycle.purge_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
  );

  INSERT INTO public.notifications (user_id, title, message, type, is_read, link, metadata)
  SELECT
    uid,
    v_title,
    v_message,
    'warning',
    false,
    '/org/subscription',
    jsonb_build_object(
      'source', 'unpaid_cleanup_manual_reminder',
      'tenant_id', p_tenant_id,
      'days_left', v_days_left,
      'purge_at', v_lifecycle.purge_at,
      'forced', p_force
    )
  FROM unnest(v_recipients) AS uid;
  GET DIAGNOSTICS v_notifications_inserted = ROW_COUNT;

  INSERT INTO public.billing_notification_logs (
    tenant_id,
    invoice_id,
    notification_type,
    recipient,
    subject,
    message,
    status,
    sent_at,
    metadata
  )
  VALUES (
    p_tenant_id,
    NULL,
    'PUSH',
    'in-app:' || CARDINALITY(v_recipients)::TEXT,
    v_title,
    v_message,
    'SENT',
    now(),
    jsonb_build_object(
      'reason', 'UNPAID_PURGE_REMINDER_MANUAL',
      'days_left', v_days_left,
      'purge_at', v_lifecycle.purge_at,
      'forced', p_force
    )
  );

  UPDATE public.tenant_cleanup_lifecycle
  SET
    reminder_count = reminder_count + 1,
    last_reminder_at = now(),
    reminder_history = COALESCE(reminder_history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'days_left', v_days_left,
        'sent_at', now(),
        'sent_date', CURRENT_DATE::TEXT,
        'recipients', CARDINALITY(v_recipients),
        'source', 'manual_rpc',
        'forced', p_force,
        'triggered_by', COALESCE(v_actor_id::TEXT, 'service_role')
      )
    ),
    updated_at = now()
  WHERE id = v_lifecycle.id;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'sent',
    'tenant_id', p_tenant_id,
    'tenant_name', v_lifecycle.tenant_name,
    'days_left', v_days_left,
    'purge_at', v_lifecycle.purge_at,
    'forced', p_force,
    'notifications_inserted', v_notifications_inserted,
    'recipients', CARDINALITY(v_recipients),
    'sync', v_sync_result
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.send_unpaid_cleanup_reminder(UUID, BOOLEAN) TO authenticated, service_role;
