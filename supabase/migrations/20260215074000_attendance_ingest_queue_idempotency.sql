-- =====================================================
-- Attendance Ingestion Queue + Idempotency + Health Metrics
-- =====================================================

-- 0) Status enum for ingestion queue
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'attendance_ingest_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.attendance_ingest_status AS ENUM (
      'queued',
      'processing',
      'failed',
      'processed',
      'dead'
    );
  END IF;
END;
$$;

-- 1) Idempotency registry for attendance events
CREATE TABLE IF NOT EXISTS public.attendance_idempotency_keys (
  key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('check_in', 'check_out')),
  employee_id UUID NOT NULL,
  attendance_date DATE NOT NULL,
  attendance_record_id UUID NULL,
  response_payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_idempotency_employee_date
  ON public.attendance_idempotency_keys (employee_id, attendance_date DESC);

-- 2) Queue table (ingestion-first)
CREATE TABLE IF NOT EXISTS public.attendance_ingest_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  buffer_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('check_in', 'check_out')),
  employee_id UUID NOT NULL,
  office_id UUID NOT NULL,
  attendance_date DATE NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  distance_meters NUMERIC NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status public.attendance_ingest_status NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ NULL,
  locked_by TEXT NULL,
  processed_at TIMESTAMPTZ NULL,
  attendance_record_id UUID NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_ingest_queue_status_retry
  ON public.attendance_ingest_queue (status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_attendance_ingest_queue_employee_date
  ON public.attendance_ingest_queue (employee_id, attendance_date DESC, entry_type);

CREATE INDEX IF NOT EXISTS idx_attendance_ingest_queue_trace
  ON public.attendance_ingest_queue (trace_id, created_at DESC);

-- 3) Updated-at trigger helper
CREATE OR REPLACE FUNCTION public.set_attendance_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_idempotency_keys_updated_at ON public.attendance_idempotency_keys;
CREATE TRIGGER trg_attendance_idempotency_keys_updated_at
BEFORE UPDATE ON public.attendance_idempotency_keys
FOR EACH ROW
EXECUTE FUNCTION public.set_attendance_updated_at();

DROP TRIGGER IF EXISTS trg_attendance_ingest_queue_updated_at ON public.attendance_ingest_queue;
CREATE TRIGGER trg_attendance_ingest_queue_updated_at
BEFORE UPDATE ON public.attendance_ingest_queue
FOR EACH ROW
EXECUTE FUNCTION public.set_attendance_updated_at();

-- 4) Harden partitioned attendance indexes for burst read patterns
CREATE INDEX IF NOT EXISTS idx_attendance_part_emp_date_checkin
  ON public.attendance_records_partitioned (employee_id, date DESC, check_in_time DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_part_emp_date_checkout
  ON public.attendance_records_partitioned (employee_id, date DESC, check_out_time DESC);

-- 5) Replace process_check_in with idempotency-aware version
DROP FUNCTION IF EXISTS public.process_check_in(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, DATE);

CREATE OR REPLACE FUNCTION public.process_check_in(
  p_employee_id UUID,
  p_office_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_distance_meters NUMERIC,
  p_date DATE DEFAULT CURRENT_DATE,
  p_idempotency_key TEXT DEFAULT NULL
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
  v_now TIMESTAMPTZ := now();
  v_work_start TIME;
  v_tolerance INT;
  v_result JSONB;
  v_new_id UUID;
  v_idempotency_key TEXT := NULLIF(BTRIM(p_idempotency_key), '');
  v_cached_payload JSONB;
BEGIN
  -- Idempotency short-circuit
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

  -- Validate existing attendance
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

  -- Office config for status
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

  -- Insert new row or fill existing placeholder row
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

-- 6) Replace process_check_out with idempotency-aware version
DROP FUNCTION IF EXISTS public.process_check_out(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, DATE);

CREATE OR REPLACE FUNCTION public.process_check_out(
  p_employee_id UUID,
  p_office_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_distance_meters NUMERIC,
  p_date DATE DEFAULT CURRENT_DATE,
  p_idempotency_key TEXT DEFAULT NULL
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
  v_now TIMESTAMPTZ := now();
  v_work_end TIME;
  v_result JSONB;
  v_idempotency_key TEXT := NULLIF(BTRIM(p_idempotency_key), '');
  v_cached_payload JSONB;
BEGIN
  -- Idempotency short-circuit
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

  -- Validate check-in/check-out state
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

  -- Office config for status
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

-- 7) Enqueue batch entries first (ingestion queue)
CREATE OR REPLACE FUNCTION public.enqueue_attendance_batch(
  p_entries JSONB,
  p_trace_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry JSONB;
  v_results JSONB := '[]'::JSONB;
  v_idempotency_key TEXT;
  v_trace_id TEXT := COALESCE(
    NULLIF(BTRIM(p_trace_id), ''),
    'db-enqueue-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || floor(random() * 99999)::TEXT
  );
  v_queue_row RECORD;
  v_payload JSONB;
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
    RETURN jsonb_build_array(
      jsonb_build_object(
        'success', false,
        'message', 'No entries provided',
        'trace_id', v_trace_id
      )
    );
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    BEGIN
      v_idempotency_key := COALESCE(
        NULLIF(BTRIM(v_entry->>'idempotency_key'), ''),
        md5(
          COALESCE(v_entry->>'employee_id', '') || ':' ||
          COALESCE(v_entry->>'date', '') || ':' ||
          COALESCE(v_entry->>'type', '') || ':' ||
          COALESCE(v_entry->>'buffer_id', '')
        )
      );

      v_payload := v_entry - 'latitude' - 'longitude' - 'distance_meters';

      INSERT INTO public.attendance_ingest_queue (
        trace_id,
        idempotency_key,
        buffer_id,
        entry_type,
        employee_id,
        office_id,
        attendance_date,
        latitude,
        longitude,
        distance_meters,
        payload,
        status,
        next_retry_at
      )
      VALUES (
        v_trace_id,
        v_idempotency_key,
        COALESCE(v_entry->>'buffer_id', ''),
        COALESCE(v_entry->>'type', ''),
        (v_entry->>'employee_id')::UUID,
        (v_entry->>'office_id')::UUID,
        COALESCE((v_entry->>'date')::DATE, CURRENT_DATE),
        COALESCE((v_entry->>'latitude')::NUMERIC, 0),
        COALESCE((v_entry->>'longitude')::NUMERIC, 0),
        COALESCE((v_entry->>'distance_meters')::NUMERIC, 0),
        COALESCE(v_payload, '{}'::JSONB),
        'queued',
        now()
      )
      ON CONFLICT (idempotency_key)
      DO UPDATE SET
        trace_id = EXCLUDED.trace_id,
        status = CASE
          WHEN public.attendance_ingest_queue.attendance_record_id IS NULL
            THEN 'queued'::public.attendance_ingest_status
          ELSE public.attendance_ingest_queue.status
        END,
        next_retry_at = CASE
          WHEN public.attendance_ingest_queue.attendance_record_id IS NULL
            THEN now()
          ELSE public.attendance_ingest_queue.next_retry_at
        END,
        error_message = CASE
          WHEN public.attendance_ingest_queue.attendance_record_id IS NULL
            THEN NULL
          ELSE public.attendance_ingest_queue.error_message
        END,
        updated_at = now()
      RETURNING id, status, attendance_record_id, error_message
      INTO v_queue_row;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'success', true,
          'buffer_id', COALESCE(v_entry->>'buffer_id', ''),
          'queue_id', v_queue_row.id,
          'idempotency_key', v_idempotency_key,
          'queue_status', v_queue_row.status,
          'attendance_record_id', v_queue_row.attendance_record_id,
          'message', CASE
            WHEN v_queue_row.attendance_record_id IS NOT NULL THEN 'Already processed'
            ELSE 'Queued'
          END,
          'trace_id', v_trace_id
        )
      );

    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'success', false,
          'buffer_id', COALESCE(v_entry->>'buffer_id', ''),
          'idempotency_key', COALESCE(v_idempotency_key, ''),
          'message', SQLERRM,
          'trace_id', v_trace_id
        )
      );
    END;
  END LOOP;

  RETURN v_results;
END;
$$;

-- 8) Process queue rows (can be called by cron/worker/edge)
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
      IF v_row.entry_type = 'check_in' THEN
        SELECT public.process_check_in(
          v_row.employee_id,
          v_row.office_id,
          v_row.latitude,
          v_row.longitude,
          v_row.distance_meters,
          v_row.attendance_date,
          v_row.idempotency_key
        ) INTO v_result;
      ELSE
        SELECT public.process_check_out(
          v_row.employee_id,
          v_row.office_id,
          v_row.latitude,
          v_row.longitude,
          v_row.distance_meters,
          v_row.attendance_date,
          v_row.idempotency_key
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

-- 9) Keep backward compatibility for existing edge function/RPC callers
CREATE OR REPLACE FUNCTION public.process_attendance_batch(
  p_entries JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trace_id TEXT := 'db-batch-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || floor(random() * 99999)::TEXT;
  v_enqueued JSONB;
  v_queue_ids UUID[];
BEGIN
  v_enqueued := public.enqueue_attendance_batch(p_entries, v_trace_id);

  SELECT array_agg((row->>'queue_id')::UUID)
  INTO v_queue_ids
  FROM jsonb_array_elements(v_enqueued) row
  WHERE COALESCE(row->>'queue_id', '') <> '';

  IF v_queue_ids IS NULL OR array_length(v_queue_ids, 1) IS NULL THEN
    RETURN v_enqueued;
  END IF;

  RETURN public.process_attendance_queue(array_length(v_queue_ids, 1), v_trace_id, v_queue_ids);
END;
$$;

-- 10) Queue health view for observability dashboards
CREATE OR REPLACE VIEW public.v_attendance_ingest_health AS
WITH stats AS (
  SELECT
    COUNT(*) FILTER (WHERE status IN ('queued', 'failed')) AS queue_depth,
    COUNT(*) FILTER (WHERE status = 'processing') AS processing_count,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
    COUNT(*) FILTER (WHERE status = 'dead') AS dead_count,
    COUNT(*) FILTER (WHERE status = 'processed' AND processed_at >= now() - INTERVAL '5 minutes') AS processed_last_5m,
    COUNT(*) FILTER (WHERE status = 'processed' AND processed_at >= now() - INTERVAL '60 minutes') AS processed_last_60m,
    AVG(
      EXTRACT(EPOCH FROM (COALESCE(processed_at, now()) - created_at))
    ) FILTER (WHERE status = 'processed') AS avg_lag_seconds,
    percentile_cont(0.95) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (COALESCE(processed_at, now()) - created_at))
    ) FILTER (WHERE status = 'processed') AS p95_lag_seconds,
    MAX(EXTRACT(EPOCH FROM (now() - created_at))) FILTER (WHERE status IN ('queued', 'failed')) AS max_pending_age_seconds,
    MAX(processed_at) AS last_processed_at
  FROM public.attendance_ingest_queue
)
SELECT
  queue_depth::BIGINT,
  processing_count::BIGINT,
  failed_count::BIGINT,
  dead_count::BIGINT,
  processed_last_5m::BIGINT,
  processed_last_60m::BIGINT,
  COALESCE(avg_lag_seconds, 0)::NUMERIC(12,2) AS avg_lag_seconds,
  COALESCE(p95_lag_seconds, 0)::NUMERIC(12,2) AS p95_lag_seconds,
  COALESCE(max_pending_age_seconds, 0)::NUMERIC(12,2) AS max_pending_age_seconds,
  last_processed_at
FROM stats;

CREATE OR REPLACE FUNCTION public.get_attendance_ingest_health()
RETURNS TABLE(
  queue_depth BIGINT,
  processing_count BIGINT,
  failed_count BIGINT,
  dead_count BIGINT,
  processed_last_5m BIGINT,
  processed_last_60m BIGINT,
  avg_lag_seconds NUMERIC,
  p95_lag_seconds NUMERIC,
  max_pending_age_seconds NUMERIC,
  last_processed_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.v_attendance_ingest_health;
$$;

-- 11) Grant least access (health read via view/function)
ALTER TABLE public.attendance_ingest_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_idempotency_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.attendance_ingest_queue FROM anon;
REVOKE ALL ON TABLE public.attendance_ingest_queue FROM authenticated;
REVOKE ALL ON TABLE public.attendance_idempotency_keys FROM anon;
REVOKE ALL ON TABLE public.attendance_idempotency_keys FROM authenticated;

GRANT SELECT ON public.v_attendance_ingest_health TO authenticated;
GRANT SELECT ON public.v_attendance_ingest_health TO service_role;
GRANT EXECUTE ON FUNCTION public.get_attendance_ingest_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_ingest_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_attendance_batch(JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_attendance_queue(INTEGER, TEXT, UUID[]) TO service_role;

-- 12) Schedule periodic queue worker (best-effort, if pg_cron available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'attendance-ingest-worker') THEN
      PERFORM cron.unschedule('attendance-ingest-worker');
    END IF;

    PERFORM cron.schedule(
      'attendance-ingest-worker',
      '* * * * *',
      $job$SELECT public.process_attendance_queue(500, NULL, NULL);$job$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'attendance-ingest-worker schedule skipped: %', SQLERRM;
END;
$$;
