
-- =====================================================
-- STRATEGY 4: Database Tuning - Composite Indexes
-- STRATEGY 5: Read/Write Separation - Materialized View for fast reads
-- =====================================================

-- 1. Composite indexes on partitioned table for attendance lookups
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date 
ON attendance_records_partitioned (employee_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_date_status 
ON attendance_records_partitioned (employee_id, date, status);

-- 2. Index on attendance_records (legacy/compatibility)
CREATE INDEX IF NOT EXISTS idx_attendance_records_emp_date 
ON attendance_records (employee_id, date DESC);

-- 3. Partial index for today's active attendance (most queried)
CREATE INDEX IF NOT EXISTS idx_attendance_today_checkin 
ON attendance_records_partitioned (employee_id, date) 
WHERE check_in_time IS NOT NULL;

-- 4. Materialized view for monthly stats (read separation)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_attendance_stats AS
SELECT 
  employee_id,
  date_trunc('month', date)::date AS month,
  COUNT(*) FILTER (WHERE status = 'hadir') AS hadir,
  COUNT(*) FILTER (WHERE status = 'terlambat') AS terlambat,
  COUNT(*) FILTER (WHERE status = 'pulang_cepat') AS pulang_cepat,
  COUNT(*) FILTER (WHERE status = 'terlambat_pulang_cepat') AS terlambat_pulang_cepat,
  COUNT(*) FILTER (WHERE status = 'izin') AS izin,
  COUNT(*) FILTER (WHERE status = 'cuti') AS cuti,
  COUNT(*) FILTER (WHERE status = 'sakit') AS sakit,
  COUNT(*) FILTER (WHERE status = 'tidak_hadir') AS tidak_hadir,
  COUNT(*) FILTER (WHERE status = 'tugas_luar') AS tugas_luar,
  COUNT(*) AS total
FROM attendance_records_partitioned
GROUP BY employee_id, date_trunc('month', date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_stats_emp_month
ON mv_monthly_attendance_stats (employee_id, month);

-- 5. Function to refresh materialized view (called periodically)
CREATE OR REPLACE FUNCTION refresh_monthly_attendance_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_attendance_stats;
END;
$$;

-- 6. RPC function for fast monthly stats read (Strategy 5: Read separation)
CREATE OR REPLACE FUNCTION get_monthly_stats(
  p_employee_id UUID,
  p_month_start DATE
)
RETURNS TABLE(
  hadir BIGINT,
  terlambat BIGINT,
  pulang_cepat BIGINT,
  terlambat_pulang_cepat BIGINT,
  izin BIGINT,
  cuti BIGINT,
  sakit BIGINT,
  tidak_hadir BIGINT,
  tugas_luar BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Try materialized view first (fast read)
  RETURN QUERY
  SELECT 
    mv.hadir, mv.terlambat, mv.pulang_cepat, mv.terlambat_pulang_cepat,
    mv.izin, mv.cuti, mv.sakit, mv.tidak_hadir, mv.tugas_luar
  FROM mv_monthly_attendance_stats mv
  WHERE mv.employee_id = p_employee_id
    AND mv.month = p_month_start;
  
  -- If no rows from MV, fallback to direct query
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      COUNT(*) FILTER (WHERE ar.status = 'hadir'),
      COUNT(*) FILTER (WHERE ar.status = 'terlambat'),
      COUNT(*) FILTER (WHERE ar.status = 'pulang_cepat'),
      COUNT(*) FILTER (WHERE ar.status = 'terlambat_pulang_cepat'),
      COUNT(*) FILTER (WHERE ar.status = 'izin'),
      COUNT(*) FILTER (WHERE ar.status = 'cuti'),
      COUNT(*) FILTER (WHERE ar.status = 'sakit'),
      COUNT(*) FILTER (WHERE ar.status = 'tidak_hadir'),
      COUNT(*) FILTER (WHERE ar.status = 'tugas_luar')
    FROM attendance_records_partitioned ar
    WHERE ar.employee_id = p_employee_id
      AND ar.date >= p_month_start
      AND ar.date < (p_month_start + INTERVAL '1 month')::date;
  END IF;
END;
$$;

-- 7. Batch attendance processor for Edge Function queue (Strategy 2)
CREATE OR REPLACE FUNCTION process_attendance_batch(
  p_entries JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry JSONB;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
  v_type TEXT;
BEGIN
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_type := v_entry->>'type';
    
    BEGIN
      IF v_type = 'check_in' THEN
        -- Reuse existing process_check_in logic
        SELECT row_to_json(r)::JSONB INTO v_result
        FROM (
          SELECT * FROM process_check_in(
            (v_entry->>'employee_id')::UUID,
            (v_entry->>'office_id')::UUID,
            (v_entry->>'latitude')::NUMERIC,
            (v_entry->>'longitude')::NUMERIC,
            (v_entry->>'distance_meters')::NUMERIC,
            (v_entry->>'date')::DATE
          )
        ) r;
      ELSIF v_type = 'check_out' THEN
        SELECT row_to_json(r)::JSONB INTO v_result
        FROM (
          SELECT * FROM process_check_out(
            (v_entry->>'employee_id')::UUID,
            (v_entry->>'office_id')::UUID,
            (v_entry->>'latitude')::NUMERIC,
            (v_entry->>'longitude')::NUMERIC,
            (v_entry->>'distance_meters')::NUMERIC,
            (v_entry->>'date')::DATE
          )
        ) r;
      END IF;
      
      v_result := v_result || jsonb_build_object('buffer_id', v_entry->>'buffer_id');
      v_results := v_results || jsonb_build_array(v_result);
      
    EXCEPTION WHEN OTHERS THEN
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'success', false,
          'buffer_id', v_entry->>'buffer_id',
          'message', SQLERRM
        )
      );
    END;
  END LOOP;
  
  RETURN v_results;
END;
$$;
