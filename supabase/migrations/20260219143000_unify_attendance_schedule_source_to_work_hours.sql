-- Unify attendance lateness/early-leave schedule source:
-- 1) Primary source: work_hours (per tenant + day_of_week)
-- 2) Fallback source: offices (legacy compatibility)

CREATE OR REPLACE FUNCTION public.resolve_attendance_schedule(
  p_employee_id UUID,
  p_office_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  schedule_start TIME,
  schedule_end TIME,
  late_tolerance_minutes INTEGER,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_office RECORD;
  v_tenant_id UUID;
  v_org_type TEXT;
  v_work_hour RECORD;
  v_day_of_week INTEGER;
BEGIN
  SELECT
    o.tenant_id,
    o.work_start_time,
    o.work_end_time,
    o.late_tolerance_minutes
  INTO v_office
  FROM public.offices o
  WHERE o.id = p_office_id
  LIMIT 1;

  SELECT e.tenant_id
  INTO v_tenant_id
  FROM public.employees e
  WHERE e.id = p_employee_id
  LIMIT 1;

  v_tenant_id := COALESCE(v_office.tenant_id, v_tenant_id);
  v_day_of_week := EXTRACT(ISODOW FROM COALESCE(p_date, CURRENT_DATE));

  IF v_tenant_id IS NOT NULL THEN
    SELECT CASE
      WHEN t.organization_type::TEXT IN ('pemerintah_daerah', 'instansi_pemerintah') THEN 'pemerintahan'
      WHEN t.organization_type::TEXT = 'sekolah' THEN 'sekolah'
      ELSE 'perusahaan'
    END
    INTO v_org_type
    FROM public.tenants t
    WHERE t.id = v_tenant_id
    LIMIT 1;

    SELECT
      wh.time_in,
      wh.time_out,
      wh.late_tolerance_minutes
    INTO v_work_hour
    FROM public.work_hours wh
    WHERE wh.tenant_id = v_tenant_id
      AND wh.day_of_week = v_day_of_week
      AND COALESCE(wh.is_active, true) = true
    ORDER BY
      CASE
        WHEN wh.institution_type = COALESCE(v_org_type, '') THEN 0
        WHEN wh.institution_type = 'all' THEN 1
        WHEN COALESCE(v_org_type, '') = 'perusahaan' AND wh.institution_type = 'pemerintahan' THEN 2
        ELSE 3
      END,
      wh.updated_at DESC
    LIMIT 1;
  END IF;

  IF v_work_hour IS NOT NULL THEN
    schedule_start := COALESCE(v_work_hour.time_in, v_office.work_start_time, '08:00:00'::TIME);
    schedule_end := COALESCE(v_work_hour.time_out, v_office.work_end_time, '17:00:00'::TIME);
    late_tolerance_minutes := GREATEST(0, COALESCE(v_work_hour.late_tolerance_minutes, v_office.late_tolerance_minutes, 0));
    source := 'work_hours';
  ELSE
    schedule_start := COALESCE(v_office.work_start_time, '08:00:00'::TIME);
    schedule_end := COALESCE(v_office.work_end_time, '17:00:00'::TIME);
    late_tolerance_minutes := GREATEST(0, COALESCE(v_office.late_tolerance_minutes, 0));
    source := 'offices_fallback';
  END IF;

  RETURN NEXT;
END;
$$;

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
  v_schedule RECORD;
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

  SELECT *
  INTO v_schedule
  FROM public.resolve_attendance_schedule(p_employee_id, p_office_id, p_date);

  v_work_start := COALESCE(v_schedule.schedule_start, '08:00:00'::TIME);
  v_tolerance := GREATEST(0, COALESCE(v_schedule.late_tolerance_minutes, 0));

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
    'schedule_source', COALESCE(v_schedule.source, 'unknown'),
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
  v_schedule RECORD;
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

  SELECT *
  INTO v_schedule
  FROM public.resolve_attendance_schedule(p_employee_id, p_office_id, p_date);

  v_work_end := COALESCE(v_schedule.schedule_end, '17:00:00'::TIME);

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
    'schedule_source', COALESCE(v_schedule.source, 'unknown'),
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

