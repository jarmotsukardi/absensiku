-- Fix array parser in unpaid cleanup lifecycle functions.
-- Previous implementation used jsonb_array_elements_text in SELECT list + LIMIT 1,
-- which could collapse values to first item only.

CREATE OR REPLACE FUNCTION public.sync_unpaid_cleanup_schedules(
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id UUID := auth.uid();
  v_jwt_role TEXT := COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  v_scope_tenant UUID := p_tenant_id;
  v_candidate_tenant UUID;
  v_scheduled_count INTEGER := 0;
  v_cancelled_count INTEGER := 0;
  v_protected_codes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_actor_id IS NOT NULL AND NOT is_super_admin(v_actor_id) AND LOWER(v_jwt_role) <> 'service_role' THEN
    v_scope_tenant := get_user_tenant_id(v_actor_id);
  END IF;

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

  FOR v_candidate_tenant IN
    SELECT DISTINCT s.tenant_id
    FROM public.subscriptions s
    JOIN public.stability_streaks st ON st.tenant_id = s.tenant_id
    JOIN public.invoices i
      ON i.tenant_id = s.tenant_id
     AND i.status IN ('PENDING', 'AWAITING_VERIFICATION')
    JOIN public.tenants t ON t.id = s.tenant_id
    WHERE (v_scope_tenant IS NULL OR s.tenant_id = v_scope_tenant)
      AND s.status = 'expired'
      AND st.status <> 'invoiced'
      AND (
        CARDINALITY(v_protected_codes) = 0
        OR UPPER(COALESCE(t.code, '')) <> ALL(v_protected_codes)
      )
  LOOP
    PERFORM public.schedule_unpaid_cleanup(v_candidate_tenant, 'expired_unpaid_streak');
    v_scheduled_count := v_scheduled_count + 1;
  END LOOP;

  FOR v_candidate_tenant IN
    SELECT l.tenant_id
    FROM public.tenant_cleanup_lifecycle l
    JOIN public.tenants t ON t.id = l.tenant_id
    LEFT JOIN LATERAL (
      SELECT 1 AS has_match
      FROM public.subscriptions s
      JOIN public.stability_streaks st ON st.tenant_id = s.tenant_id
      JOIN public.invoices i
        ON i.tenant_id = s.tenant_id
       AND i.status IN ('PENDING', 'AWAITING_VERIFICATION')
      WHERE s.tenant_id = l.tenant_id
        AND s.status = 'expired'
        AND st.status <> 'invoiced'
      LIMIT 1
    ) still_due ON true
    WHERE l.status = 'scheduled'
      AND (v_scope_tenant IS NULL OR l.tenant_id = v_scope_tenant)
      AND still_due.has_match IS NULL
      AND (
        CARDINALITY(v_protected_codes) = 0
        OR UPPER(COALESCE(t.code, '')) <> ALL(v_protected_codes)
      )
  LOOP
    PERFORM public.cancel_unpaid_cleanup(v_candidate_tenant, 'status_recovered');
    v_cancelled_count := v_cancelled_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'scheduled', v_scheduled_count,
    'cancelled', v_cancelled_count,
    'scope_tenant_id', v_scope_tenant,
    'protected_codes', v_protected_codes
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_unpaid_cleanup_lifecycle(
  p_limit INTEGER DEFAULT 100,
  p_dry_run BOOLEAN DEFAULT false,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_actor_id UUID := auth.uid();
  v_jwt_role TEXT := COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  v_enabled BOOLEAN := false;
  v_hard_delete_auth BOOLEAN := false;
  v_limit INTEGER := GREATEST(COALESCE(p_limit, 100), 1);
  v_reminder_days INTEGER[] := ARRAY[14, 7, 3, 1];
  v_protected_codes TEXT[] := ARRAY[]::TEXT[];
  v_sync_result JSONB := '{}'::jsonb;
  v_row RECORD;
  v_days_left INTEGER;
  v_already_reminded BOOLEAN;
  v_recipients UUID[] := ARRAY[]::UUID[];
  v_notifications_inserted INTEGER;
  v_emp_archived INTEGER;
  v_roles_deleted INTEGER;
  v_subscriptions_cancelled INTEGER;
  v_tenant_disabled INTEGER;
  v_auth_user_ids UUID[] := ARRAY[]::UUID[];
  v_auth_deleted INTEGER;
  v_auth_delete_error TEXT;
  v_processed INTEGER := 0;
  v_reminders INTEGER := 0;
  v_purged INTEGER := 0;
  v_notifications_total INTEGER := 0;
  v_title TEXT;
  v_message TEXT;
BEGIN
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

  SELECT
    CASE
      WHEN jsonb_typeof(value) = 'boolean' THEN (value #>> '{}')::BOOLEAN
      WHEN jsonb_typeof(value->'value') = 'boolean' THEN (value->>'value')::BOOLEAN
      WHEN LOWER(value->>'value') IN ('true', 'false') THEN (value->>'value')::BOOLEAN
      ELSE NULL
    END
  INTO v_hard_delete_auth
  FROM public.system_settings
  WHERE key = 'unpaid_cleanup_hard_delete_auth'
  LIMIT 1;

  v_hard_delete_auth := COALESCE(v_hard_delete_auth, false);

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

  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'enabled', false,
      'processed', 0,
      'message', 'unpaid cleanup disabled',
      'protected_codes', v_protected_codes
    );
  END IF;

  v_sync_result := public.sync_unpaid_cleanup_schedules(p_tenant_id);

  FOR v_row IN
    SELECT
      l.id,
      l.tenant_id,
      l.purge_at,
      l.reminder_count,
      l.reminder_history,
      t.name AS tenant_name
    FROM public.tenant_cleanup_lifecycle l
    JOIN public.tenants t ON t.id = l.tenant_id
    WHERE l.status = 'scheduled'
      AND (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
      AND (
        CARDINALITY(v_protected_codes) = 0
        OR UPPER(COALESCE(t.code, '')) <> ALL(v_protected_codes)
      )
    ORDER BY l.purge_at ASC
    LIMIT v_limit
  LOOP
    v_processed := v_processed + 1;
    v_days_left := (v_row.purge_at::DATE - CURRENT_DATE);

    IF v_days_left <= 0 THEN
      v_emp_archived := 0;
      v_roles_deleted := 0;
      v_subscriptions_cancelled := 0;
      v_tenant_disabled := 0;
      v_auth_deleted := 0;
      v_auth_delete_error := NULL;

      SELECT COALESCE(ARRAY_AGG(DISTINCT uid), ARRAY[]::UUID[])
      INTO v_auth_user_ids
      FROM (
        SELECT e.user_id AS uid
        FROM public.employees e
        WHERE e.tenant_id = v_row.tenant_id
          AND e.user_id IS NOT NULL
        UNION
        SELECT ur.user_id AS uid
        FROM public.user_roles ur
        WHERE ur.tenant_id = v_row.tenant_id
          AND ur.user_id IS NOT NULL
      ) user_candidates;

      IF NOT p_dry_run THEN
        UPDATE public.employees
        SET
          is_active = false,
          user_id = NULL,
          updated_at = now()
        WHERE tenant_id = v_row.tenant_id
          AND (
            COALESCE(is_active, true) = true
            OR user_id IS NOT NULL
          );
        GET DIAGNOSTICS v_emp_archived = ROW_COUNT;

        DELETE FROM public.user_roles
        WHERE tenant_id = v_row.tenant_id
          AND role <> 'super_admin';
        GET DIAGNOSTICS v_roles_deleted = ROW_COUNT;

        UPDATE public.subscriptions
        SET
          status = 'cancelled',
          grace_period_end = NULL,
          updated_at = now()
        WHERE tenant_id = v_row.tenant_id
          AND status <> 'cancelled';
        GET DIAGNOSTICS v_subscriptions_cancelled = ROW_COUNT;

        UPDATE public.tenants
        SET
          is_active = false,
          updated_at = now()
        WHERE id = v_row.tenant_id
          AND COALESCE(is_active, true) = true;
        GET DIAGNOSTICS v_tenant_disabled = ROW_COUNT;

        IF v_hard_delete_auth AND CARDINALITY(v_auth_user_ids) > 0 THEN
          BEGIN
            DELETE FROM auth.users
            WHERE id = ANY(v_auth_user_ids);
            GET DIAGNOSTICS v_auth_deleted = ROW_COUNT;
          EXCEPTION
            WHEN OTHERS THEN
              v_auth_delete_error := SQLERRM;
          END;
        END IF;

        UPDATE public.tenant_cleanup_lifecycle
        SET
          status = 'purged',
          purged_at = now(),
          updated_at = now(),
          purge_summary = jsonb_build_object(
            'employees_archived', v_emp_archived,
            'tenant_roles_deleted', v_roles_deleted,
            'subscriptions_cancelled', v_subscriptions_cancelled,
            'tenant_deactivated', v_tenant_disabled,
            'hard_delete_auth_enabled', v_hard_delete_auth,
            'auth_users_deleted', v_auth_deleted,
            'auth_delete_error', v_auth_delete_error
          ),
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'purged_by', COALESCE(v_actor_id::TEXT, 'service_role')
          )
        WHERE id = v_row.id;
      END IF;

      v_purged := v_purged + 1;
      CONTINUE;
    END IF;

    IF v_days_left = ANY(v_reminder_days) THEN
      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_row.reminder_history, '[]'::jsonb)) hist
        WHERE (hist ? 'days_left')
          AND (hist->>'days_left') ~ '^[0-9]+$'
          AND (hist->>'days_left')::INTEGER = v_days_left
      )
      INTO v_already_reminded;

      IF v_already_reminded THEN
        CONTINUE;
      END IF;

      v_title := format('Peringatan Purge Data (%s hari)', v_days_left);
      v_message := format(
        'Tenant %s belum menyelesaikan pembayaran. Data terjadwal dipurge pada %s (UTC). Segera tindak lanjuti pembayaran agar tidak dihapus.',
        COALESCE(v_row.tenant_name, '-'),
        to_char(v_row.purge_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
      );

      SELECT COALESCE(array_agg(DISTINCT ur.user_id), ARRAY[]::UUID[])
      INTO v_recipients
      FROM public.user_roles ur
      WHERE ur.role = 'super_admin'
         OR (ur.role = 'admin_instansi' AND ur.tenant_id = v_row.tenant_id);

      IF NOT p_dry_run AND CARDINALITY(v_recipients) > 0 THEN
        INSERT INTO public.notifications (user_id, title, message, type, is_read, link, metadata)
        SELECT
          uid,
          v_title,
          v_message,
          'warning',
          false,
          '/org/subscription',
          jsonb_build_object(
            'source', 'unpaid_cleanup_lifecycle',
            'tenant_id', v_row.tenant_id,
            'days_left', v_days_left,
            'purge_at', v_row.purge_at,
            'dry_run', p_dry_run
          )
        FROM unnest(v_recipients) AS uid;
        GET DIAGNOSTICS v_notifications_inserted = ROW_COUNT;
        v_notifications_total := v_notifications_total + COALESCE(v_notifications_inserted, 0);

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
          v_row.tenant_id,
          NULL,
          'PUSH',
          'in-app:' || CARDINALITY(v_recipients)::TEXT,
          v_title,
          v_message,
          'SENT',
          now(),
          jsonb_build_object(
            'reason', 'UNPAID_PURGE_REMINDER',
            'days_left', v_days_left,
            'purge_at', v_row.purge_at
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
              'recipients', CARDINALITY(v_recipients)
            )
          ),
          updated_at = now()
        WHERE id = v_row.id;
      END IF;

      v_reminders := v_reminders + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'enabled', true,
    'dry_run', p_dry_run,
    'processed', v_processed,
    'reminders', v_reminders,
    'purged', v_purged,
    'notifications_inserted', v_notifications_total,
    'hard_delete_auth', v_hard_delete_auth,
    'protected_codes', v_protected_codes,
    'sync', v_sync_result
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.sync_unpaid_cleanup_schedules(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_unpaid_cleanup_lifecycle(INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
