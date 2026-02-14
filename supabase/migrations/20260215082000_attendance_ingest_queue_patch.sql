-- Patch after initial attendance ingestion deployment:
-- - update enqueue conflict handling
-- - update queue processor selection for queue_ids
-- - harden table access with RLS + revoke

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

ALTER TABLE public.attendance_ingest_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_idempotency_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.attendance_ingest_queue FROM anon;
REVOKE ALL ON TABLE public.attendance_ingest_queue FROM authenticated;
REVOKE ALL ON TABLE public.attendance_idempotency_keys FROM anon;
REVOKE ALL ON TABLE public.attendance_idempotency_keys FROM authenticated;
