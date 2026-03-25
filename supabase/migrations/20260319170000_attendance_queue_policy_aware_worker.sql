CREATE OR REPLACE FUNCTION public.is_attendance_peak_hour(
  p_windows JSONB DEFAULT NULL,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_windows JSONB := COALESCE(
    p_windows,
    jsonb_build_array(
      jsonb_build_object('name', 'check_in', 'start', '06:30', 'end', '09:00'),
      jsonb_build_object('name', 'check_out', 'start', '16:00', 'end', '18:30')
    )
  );
  v_current_minutes INTEGER;
  v_window JSONB;
  v_start_text TEXT;
  v_end_text TEXT;
  v_start_minutes INTEGER;
  v_end_minutes INTEGER;
BEGIN
  v_current_minutes := (
    EXTRACT(HOUR FROM timezone('Asia/Jakarta', p_now))::INTEGER * 60
    + EXTRACT(MINUTE FROM timezone('Asia/Jakarta', p_now))::INTEGER
  );

  FOR v_window IN
    SELECT value
    FROM jsonb_array_elements(v_windows)
  LOOP
    v_start_text := COALESCE(v_window->>'start', '');
    v_end_text := COALESCE(v_window->>'end', '');

    IF v_start_text !~ '^\d{2}:\d{2}$' OR v_end_text !~ '^\d{2}:\d{2}$' THEN
      CONTINUE;
    END IF;

    v_start_minutes := split_part(v_start_text, ':', 1)::INTEGER * 60 + split_part(v_start_text, ':', 2)::INTEGER;
    v_end_minutes := split_part(v_end_text, ':', 1)::INTEGER * 60 + split_part(v_end_text, ':', 2)::INTEGER;

    IF v_end_minutes >= v_start_minutes THEN
      IF v_current_minutes BETWEEN v_start_minutes AND v_end_minutes THEN
        RETURN true;
      END IF;
    ELSE
      IF v_current_minutes >= v_start_minutes OR v_current_minutes <= v_end_minutes THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_attendance_queue_policy_aware(
  p_limit INTEGER DEFAULT 500,
  p_trace_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting JSONB := '{}'::JSONB;
  v_peak_hour_enabled BOOLEAN := true;
  v_peak_hour_hold_sync BOOLEAN := false;
  v_peak_hour_windows JSONB := NULL;
  v_offpeak_release_strategy TEXT := 'client_after_window';
  v_is_peak BOOLEAN := false;
BEGIN
  SELECT value
  INTO v_setting
  FROM public.system_settings
  WHERE key = 'attendance_scalability'
  LIMIT 1;

  v_peak_hour_enabled := CASE
    WHEN jsonb_typeof(v_setting->'peak_hour_enabled') = 'boolean' THEN (v_setting->>'peak_hour_enabled')::BOOLEAN
    ELSE true
  END;

  v_peak_hour_hold_sync := CASE
    WHEN jsonb_typeof(v_setting->'peak_hour_hold_sync') = 'boolean' THEN (v_setting->>'peak_hour_hold_sync')::BOOLEAN
    ELSE false
  END;

  v_peak_hour_windows := CASE
    WHEN jsonb_typeof(v_setting->'peak_hour_windows') = 'array' THEN v_setting->'peak_hour_windows'
    ELSE NULL
  END;

  v_offpeak_release_strategy := COALESCE(NULLIF(v_setting->>'offpeak_release_strategy', ''), 'client_after_window');
  v_is_peak := public.is_attendance_peak_hour(v_peak_hour_windows, now());

  IF v_peak_hour_enabled AND v_peak_hour_hold_sync AND v_is_peak THEN
    RETURN jsonb_build_array(
      jsonb_build_object(
        'success', true,
        'queue_status', 'queued',
        'message', 'Queue processing skipped during peak-hour hold window',
        'policy_reason', 'peak_hour_hold_sync'
      )
    );
  END IF;

  IF v_offpeak_release_strategy = 'worker_only' OR v_offpeak_release_strategy = 'worker_preferred' OR NOT v_is_peak THEN
    RETURN public.process_attendance_queue(
      GREATEST(1, LEAST(COALESCE(p_limit, 500), 1000)),
      p_trace_id,
      NULL
    );
  END IF;

  RETURN public.process_attendance_queue(
    GREATEST(1, LEAST(COALESCE(p_limit, 500), 1000)),
    p_trace_id,
    NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_attendance_peak_hour(JSONB, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_attendance_queue_policy_aware(INTEGER, TEXT) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'attendance-ingest-worker') THEN
      PERFORM cron.unschedule('attendance-ingest-worker');
    END IF;

    PERFORM cron.schedule(
      'attendance-ingest-worker',
      '* * * * *',
      $job$SELECT public.process_attendance_queue_policy_aware(500, NULL);$job$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'attendance-ingest-worker policy-aware schedule skipped: %', SQLERRM;
END;
$$;
