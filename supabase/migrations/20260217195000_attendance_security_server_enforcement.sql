-- Enforce attendance security policy on server-side (RPC + queue worker).
-- This hardens /admin/attendance-security so bypass via client-side tampering is reduced.

CREATE OR REPLACE FUNCTION public.validate_attendance_security_context(
  p_employee_id UUID,
  p_client_context JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings JSONB := '{}'::JSONB;
  v_employee RECORD;
  v_mode TEXT := COALESCE(NULLIF(BTRIM(COALESCE(p_client_context->>'client_mode', '')), ''), 'unknown');
  v_device_id TEXT := NULLIF(BTRIM(COALESCE(p_client_context->>'device_id', '')), '');
  v_android_version NUMERIC := NULL;
  v_min_android_version NUMERIC := NULL;
  v_block_all_browsers BOOLEAN := false;
  v_block_desktop_browser BOOLEAN := false;
  v_allow_iphone_safari BOOLEAN := true;
  v_enable_device_binding BOOLEAN := true;
BEGIN
  SELECT value::JSONB
  INTO v_settings
  FROM public.system_settings
  WHERE key = 'attendance_security'
  LIMIT 1;

  v_block_all_browsers := COALESCE((v_settings->>'block_all_browsers')::BOOLEAN, false);
  v_block_desktop_browser := COALESCE((v_settings->>'block_desktop_browser')::BOOLEAN, false);
  v_allow_iphone_safari := COALESCE((v_settings->>'allow_iphone_safari')::BOOLEAN, true);
  v_enable_device_binding := COALESCE((v_settings->>'enable_device_binding')::BOOLEAN, true);
  v_min_android_version := NULLIF(BTRIM(COALESCE(v_settings->>'min_android_version', '')), '')::NUMERIC;

  IF NULLIF(BTRIM(COALESCE(p_client_context->>'android_version', '')), '') IS NOT NULL THEN
    BEGIN
      v_android_version := (p_client_context->>'android_version')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_android_version := NULL;
    END;
  END IF;

  SELECT id, android_id
  INTO v_employee
  FROM public.employees
  WHERE id = p_employee_id
  FOR UPDATE;

  IF v_employee.id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'EMPLOYEE_NOT_FOUND',
      'message', 'Data pegawai tidak ditemukan'
    );
  END IF;

  IF v_block_all_browsers THEN
    IF v_mode <> 'android_webview' AND NOT (v_allow_iphone_safari AND v_mode = 'iphone_safari') THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'SECURITY_BROWSER_BLOCKED',
        'message', 'Absensi hanya diizinkan melalui aplikasi internal/WebView'
      );
    END IF;
  END IF;

  IF v_block_desktop_browser AND v_mode = 'desktop_browser' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'SECURITY_DESKTOP_BLOCKED',
      'message', 'Absensi tidak diizinkan melalui browser desktop'
    );
  END IF;

  IF v_mode = 'android_webview' AND v_min_android_version IS NOT NULL AND v_android_version IS NOT NULL THEN
    IF v_android_version < v_min_android_version THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'ANDROID_VERSION_NOT_SUPPORTED',
        'message', 'Versi Android belum memenuhi minimum keamanan'
      );
    END IF;
  END IF;

  IF v_enable_device_binding THEN
    IF v_device_id IS NULL THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'DEVICE_ID_REQUIRED',
        'message', 'Perangkat belum teridentifikasi untuk proses absensi'
      );
    END IF;

    IF v_employee.android_id IS NULL OR BTRIM(v_employee.android_id) = '' THEN
      UPDATE public.employees
      SET
        android_id = v_device_id,
        updated_at = now()
      WHERE id = p_employee_id;
    ELSIF v_employee.android_id <> v_device_id THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'error', 'DEVICE_BINDING_MISMATCH',
        'message', 'Perangkat berbeda dari yang terdaftar'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true
  );
END;
$$;

DROP FUNCTION IF EXISTS public.process_check_in(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, DATE, TEXT);
DROP FUNCTION IF EXISTS public.process_check_out(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.process_check_in(
  p_employee_id UUID,
  p_office_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_distance_meters NUMERIC,
  p_date DATE DEFAULT CURRENT_DATE,
  p_idempotency_key TEXT DEFAULT NULL,
  p_client_context JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_office RECORD;
  v_status attendance_status;
  v_now TIMESTAMPTZ;
  v_work_start TIME;
  v_tolerance INT;
  v_result JSONB;
  v_new_id UUID;
  v_idempotency_key TEXT := NULLIF(BTRIM(p_idempotency_key), '');
  v_cached_payload JSONB;
  v_event_timestamp_text TEXT;
  v_event_timestamp TIMESTAMPTZ;
  v_security_validation JSONB;
BEGIN
  v_security_validation := public.validate_attendance_security_context(p_employee_id, COALESCE(p_client_context, '{}'::JSONB));
  IF COALESCE((v_security_validation->>'allowed')::BOOLEAN, false) = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', COALESCE(v_security_validation->>'error', 'SECURITY_VALIDATION_FAILED'),
      'message', COALESCE(v_security_validation->>'message', 'Validasi keamanan absensi gagal')
    );
  END IF;

  v_event_timestamp := NULL;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT q.payload->>'timestamp'
    INTO v_event_timestamp_text
    FROM public.attendance_ingest_queue q
    WHERE q.idempotency_key = v_idempotency_key
      AND q.entry_type = 'check_in'
    ORDER BY q.created_at DESC
    LIMIT 1;

    IF v_event_timestamp_text IS NOT NULL AND BTRIM(v_event_timestamp_text) <> '' THEN
      BEGIN
        v_event_timestamp := v_event_timestamp_text::TIMESTAMPTZ;
      EXCEPTION WHEN OTHERS THEN
        v_event_timestamp := NULL;
      END;
    END IF;
  END IF;

  v_now := COALESCE(v_event_timestamp, now());

  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_idempotency_key));

    SELECT response_payload
    INTO v_cached_payload
    FROM public.attendance_idempotency_keys
    WHERE key = v_idempotency_key
      AND event_type = 'check_in'
    LIMIT 1;

    IF v_cached_payload IS NOT NULL THEN
      RETURN v_cached_payload || jsonb_build_object('idempotent_replay', true);
    END IF;

    INSERT INTO public.attendance_idempotency_keys (
      key, event_type, employee_id, attendance_date
    ) VALUES (
      v_idempotency_key, 'check_in', p_employee_id, p_date
    )
    ON CONFLICT (key) DO NOTHING;
  END IF;

  SELECT id, check_in_time, status
  INTO v_existing
  FROM public.attendance_records_partitioned
  WHERE employee_id = p_employee_id
    AND date = p_date
  LIMIT 1;

  IF v_existing.id IS NOT NULL AND v_existing.check_in_time IS NOT NULL THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CHECKED_IN',
      'message', 'Sudah melakukan absen masuk hari ini',
      'id', v_existing.id,
      'status', v_existing.status
    );

    IF v_idempotency_key IS NOT NULL THEN
      UPDATE public.attendance_idempotency_keys
      SET
        attendance_record_id = v_existing.id,
        response_payload = v_result
      WHERE key = v_idempotency_key
        AND event_type = 'check_in';
    END IF;

    RETURN v_result;
  END IF;

  SELECT work_start_time, late_tolerance_minutes
  INTO v_office
  FROM public.offices
  WHERE id = p_office_id;

  v_work_start := COALESCE(v_office.work_start_time, '08:00:00'::TIME);
  v_tolerance := COALESCE(v_office.late_tolerance_minutes, 15);

  IF v_now::TIME > (v_work_start + (v_tolerance || ' minutes')::INTERVAL) THEN
    v_status := 'terlambat';
  ELSE
    v_status := 'hadir';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.attendance_records_partitioned (
      employee_id,
      office_id,
      date,
      check_in_time,
      check_in_latitude,
      check_in_longitude,
      check_in_distance_meters,
      status
    )
    VALUES (
      p_employee_id,
      p_office_id,
      p_date,
      v_now,
      p_latitude,
      p_longitude,
      p_distance_meters,
      v_status
    )
    RETURNING id INTO v_new_id;
  ELSE
    UPDATE public.attendance_records_partitioned
    SET
      office_id = p_office_id,
      check_in_time = v_now,
      check_in_latitude = p_latitude,
      check_in_longitude = p_longitude,
      check_in_distance_meters = p_distance_meters,
      status = v_status,
      updated_at = v_now
    WHERE id = v_existing.id
      AND date = p_date
    RETURNING id INTO v_new_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'status', v_status::TEXT,
    'check_in_time', v_now,
    'message', CASE
      WHEN v_status = 'terlambat' THEN 'Absen masuk tercatat (Terlambat)'
      ELSE 'Absen masuk berhasil'
    END
  );

  IF v_idempotency_key IS NOT NULL THEN
    UPDATE public.attendance_idempotency_keys
    SET
      attendance_record_id = v_new_id,
      response_payload = v_result
    WHERE key = v_idempotency_key
      AND event_type = 'check_in';
  END IF;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'DB_ERROR',
    'message', SQLERRM
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_check_out(
  p_employee_id UUID,
  p_office_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_distance_meters NUMERIC,
  p_date DATE DEFAULT CURRENT_DATE,
  p_idempotency_key TEXT DEFAULT NULL,
  p_client_context JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_office RECORD;
  v_status attendance_status;
  v_now TIMESTAMPTZ;
  v_work_end TIME;
  v_result JSONB;
  v_idempotency_key TEXT := NULLIF(BTRIM(p_idempotency_key), '');
  v_cached_payload JSONB;
  v_event_timestamp_text TEXT;
  v_event_timestamp TIMESTAMPTZ;
  v_security_validation JSONB;
BEGIN
  v_security_validation := public.validate_attendance_security_context(p_employee_id, COALESCE(p_client_context, '{}'::JSONB));
  IF COALESCE((v_security_validation->>'allowed')::BOOLEAN, false) = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', COALESCE(v_security_validation->>'error', 'SECURITY_VALIDATION_FAILED'),
      'message', COALESCE(v_security_validation->>'message', 'Validasi keamanan absensi gagal')
    );
  END IF;

  v_event_timestamp := NULL;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT q.payload->>'timestamp'
    INTO v_event_timestamp_text
    FROM public.attendance_ingest_queue q
    WHERE q.idempotency_key = v_idempotency_key
      AND q.entry_type = 'check_out'
    ORDER BY q.created_at DESC
    LIMIT 1;

    IF v_event_timestamp_text IS NOT NULL AND BTRIM(v_event_timestamp_text) <> '' THEN
      BEGIN
        v_event_timestamp := v_event_timestamp_text::TIMESTAMPTZ;
      EXCEPTION WHEN OTHERS THEN
        v_event_timestamp := NULL;
      END;
    END IF;
  END IF;

  v_now := COALESCE(v_event_timestamp, now());

  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_idempotency_key));

    SELECT response_payload
    INTO v_cached_payload
    FROM public.attendance_idempotency_keys
    WHERE key = v_idempotency_key
      AND event_type = 'check_out'
    LIMIT 1;

    IF v_cached_payload IS NOT NULL THEN
      RETURN v_cached_payload || jsonb_build_object('idempotent_replay', true);
    END IF;

    INSERT INTO public.attendance_idempotency_keys (
      key, event_type, employee_id, attendance_date
    ) VALUES (
      v_idempotency_key, 'check_out', p_employee_id, p_date
    )
    ON CONFLICT (key) DO NOTHING;
  END IF;

  SELECT id, check_in_time, check_out_time, status, date
  INTO v_existing
  FROM public.attendance_records_partitioned
  WHERE employee_id = p_employee_id
    AND date = p_date
  LIMIT 1;

  IF v_existing.id IS NULL OR v_existing.check_in_time IS NULL THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', 'NOT_CHECKED_IN',
      'message', 'Belum melakukan absen masuk'
    );

    IF v_idempotency_key IS NOT NULL THEN
      UPDATE public.attendance_idempotency_keys
      SET response_payload = v_result
      WHERE key = v_idempotency_key
        AND event_type = 'check_out';
    END IF;

    RETURN v_result;
  END IF;

  IF v_existing.check_out_time IS NOT NULL THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CHECKED_OUT',
      'message', 'Sudah melakukan absen pulang hari ini',
      'id', v_existing.id,
      'status', v_existing.status,
      'check_out_time', v_existing.check_out_time
    );

    IF v_idempotency_key IS NOT NULL THEN
      UPDATE public.attendance_idempotency_keys
      SET
        attendance_record_id = v_existing.id,
        response_payload = v_result
      WHERE key = v_idempotency_key
        AND event_type = 'check_out';
    END IF;

    RETURN v_result;
  END IF;

  SELECT work_end_time
  INTO v_office
  FROM public.offices
  WHERE id = p_office_id;

  v_work_end := COALESCE(v_office.work_end_time, '17:00:00'::TIME);

  v_status := v_existing.status;
  IF v_now::TIME < v_work_end THEN
    IF v_existing.status = 'terlambat' THEN
      v_status := 'terlambat_pulang_cepat';
    ELSE
      v_status := 'pulang_cepat';
    END IF;
  END IF;

  UPDATE public.attendance_records_partitioned
  SET
    check_out_time = v_now,
    check_out_latitude = p_latitude,
    check_out_longitude = p_longitude,
    check_out_distance_meters = p_distance_meters,
    status = v_status,
    updated_at = v_now
  WHERE id = v_existing.id
    AND date = v_existing.date;

  v_result := jsonb_build_object(
    'success', true,
    'id', v_existing.id,
    'status', v_status::TEXT,
    'check_out_time', v_now,
    'message', CASE
      WHEN v_status = 'pulang_cepat' THEN 'Absen pulang tercatat (Pulang Cepat)'
      WHEN v_status = 'terlambat_pulang_cepat' THEN 'Absen pulang tercatat (Terlambat + Pulang Cepat)'
      ELSE 'Absen pulang berhasil'
    END
  );

  IF v_idempotency_key IS NOT NULL THEN
    UPDATE public.attendance_idempotency_keys
    SET
      attendance_record_id = v_existing.id,
      response_payload = v_result
    WHERE key = v_idempotency_key
      AND event_type = 'check_out';
  END IF;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'DB_ERROR',
    'message', SQLERRM
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_attendance_queue(
  p_limit INTEGER DEFAULT 100,
  p_trace_id TEXT DEFAULT NULL,
  p_queue_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_retriable BOOLEAN;
  v_backoff_seconds INTEGER;
  v_processed_id UUID;
  v_queue_status TEXT;
  v_trace_id TEXT := COALESCE(
    NULLIF(BTRIM(p_trace_id), ''),
    'db-worker-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || floor(random() * 99999)::TEXT
  );
  v_client_context JSONB;
BEGIN
  FOR v_row IN
    SELECT q.*
    FROM public.attendance_ingest_queue q
    WHERE (
      (
        p_queue_ids IS NOT NULL
        AND q.id = ANY(p_queue_ids)
        AND q.status IN ('queued', 'failed', 'processing')
      )
      OR (
        p_queue_ids IS NULL
        AND q.status IN ('queued', 'failed')
        AND q.next_retry_at <= now()
      )
    )
    ORDER BY q.created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000))
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.attendance_ingest_queue
    SET
      status = 'processing',
      attempts = attempts + 1,
      locked_at = now(),
      locked_by = v_trace_id,
      updated_at = now()
    WHERE id = v_row.id;

    BEGIN
      v_client_context := COALESCE(v_row.payload->'client_context', '{}'::JSONB);

      IF v_row.entry_type = 'check_in' THEN
        SELECT public.process_check_in(
          v_row.employee_id,
          v_row.office_id,
          v_row.latitude,
          v_row.longitude,
          v_row.distance_meters,
          v_row.attendance_date,
          v_row.idempotency_key,
          v_client_context
        ) INTO v_result;
      ELSE
        SELECT public.process_check_out(
          v_row.employee_id,
          v_row.office_id,
          v_row.latitude,
          v_row.longitude,
          v_row.distance_meters,
          v_row.attendance_date,
          v_row.idempotency_key,
          v_client_context
        ) INTO v_result;
      END IF;

      v_processed_id := NULL;
      IF COALESCE(v_result->>'id', '') <> '' THEN
        BEGIN
          v_processed_id := (v_result->>'id')::UUID;
        EXCEPTION WHEN OTHERS THEN
          v_processed_id := NULL;
        END;
      END IF;

      IF COALESCE((v_result->>'success')::BOOLEAN, false) THEN
        UPDATE public.attendance_ingest_queue
        SET
          status = 'processed',
          processed_at = now(),
          attendance_record_id = COALESCE(v_processed_id, attendance_record_id),
          error_message = NULL,
          updated_at = now()
        WHERE id = v_row.id;

        v_queue_status := 'processed';
      ELSE
        v_retriable := COALESCE(v_result->>'error', '') IN (
          'DB_ERROR',
          'TIMEOUT',
          'LOCK_TIMEOUT',
          'SERIALIZATION_FAILURE'
        );

        IF v_retriable AND (v_row.attempts + 1) < 8 THEN
          v_backoff_seconds := LEAST(
            300,
            GREATEST(5, (POWER(2, LEAST(v_row.attempts + 1, 7)) * 5)::INTEGER)
          );

          UPDATE public.attendance_ingest_queue
          SET
            status = 'failed',
            next_retry_at = now() + make_interval(secs => v_backoff_seconds),
            error_message = COALESCE(v_result->>'message', v_result->>'error', 'Unknown queue error'),
            updated_at = now()
          WHERE id = v_row.id;

          v_queue_status := 'failed';
        ELSE
          UPDATE public.attendance_ingest_queue
          SET
            status = 'dead',
            error_message = COALESCE(v_result->>'message', v_result->>'error', 'Unrecoverable queue error'),
            updated_at = now()
          WHERE id = v_row.id;

          v_queue_status := 'dead';
        END IF;
      END IF;

      v_results := v_results || jsonb_build_array(
        (COALESCE(v_result, '{}'::JSONB)) || jsonb_build_object(
          'buffer_id', v_row.buffer_id,
          'queue_id', v_row.id,
          'idempotency_key', v_row.idempotency_key,
          'queue_status', v_queue_status,
          'trace_id', v_trace_id
        )
      );

    EXCEPTION WHEN OTHERS THEN
      v_backoff_seconds := LEAST(
        300,
        GREATEST(5, (POWER(2, LEAST(v_row.attempts + 1, 7)) * 5)::INTEGER)
      );

      UPDATE public.attendance_ingest_queue
      SET
        status = CASE WHEN (v_row.attempts + 1) < 8 THEN 'failed'::public.attendance_ingest_status ELSE 'dead'::public.attendance_ingest_status END,
        next_retry_at = now() + make_interval(secs => v_backoff_seconds),
        error_message = SQLERRM,
        updated_at = now()
      WHERE id = v_row.id;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'success', false,
          'buffer_id', v_row.buffer_id,
          'queue_id', v_row.id,
          'idempotency_key', v_row.idempotency_key,
          'queue_status', CASE WHEN (v_row.attempts + 1) < 8 THEN 'failed' ELSE 'dead' END,
          'message', SQLERRM,
          'trace_id', v_trace_id
        )
      );
    END;
  END LOOP;

  RETURN v_results;
END;
$$;
