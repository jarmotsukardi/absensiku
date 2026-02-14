
-- Stored Procedure: process_check_in
-- Memproses absen masuk dalam satu transaksi tunggal pada partitioned table
CREATE OR REPLACE FUNCTION public.process_check_in(
  p_employee_id UUID,
  p_office_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_distance_meters NUMERIC,
  p_date DATE DEFAULT CURRENT_DATE
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
BEGIN
  -- 1. Validasi: Cek apakah sudah absen hari ini
  SELECT id, check_in_time INTO v_existing
  FROM attendance_records_partitioned
  WHERE employee_id = p_employee_id AND date = p_date
  LIMIT 1;

  IF v_existing.check_in_time IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CHECKED_IN',
      'message', 'Sudah melakukan absen masuk hari ini'
    );
  END IF;

  -- 2. Ambil data kantor untuk validasi jam kerja
  SELECT work_start_time, late_tolerance_minutes
  INTO v_office
  FROM offices
  WHERE id = p_office_id;

  v_work_start := COALESCE(v_office.work_start_time, '08:00:00'::TIME);
  v_tolerance := COALESCE(v_office.late_tolerance_minutes, 15);

  -- 3. Tentukan status berdasarkan waktu
  IF v_now::TIME > (v_work_start + (v_tolerance || ' minutes')::INTERVAL) THEN
    v_status := 'terlambat';
  ELSE
    v_status := 'hadir';
  END IF;

  -- 4. Insert ke partitioned table (single transaction)
  INSERT INTO attendance_records_partitioned (
    employee_id, office_id, date,
    check_in_time, check_in_latitude, check_in_longitude, check_in_distance_meters,
    status
  ) VALUES (
    p_employee_id, p_office_id, p_date,
    v_now, p_latitude, p_longitude, p_distance_meters,
    v_status
  )
  RETURNING id INTO v_new_id;

  -- 5. Return result
  RETURN jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'status', v_status::TEXT,
    'check_in_time', v_now,
    'message', CASE WHEN v_status = 'terlambat' THEN 'Absen masuk tercatat (Terlambat)' ELSE 'Absen masuk berhasil' END
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'DB_ERROR',
    'message', SQLERRM
  );
END;
$$;

-- Stored Procedure: process_check_out
-- Memproses absen pulang dalam satu transaksi tunggal
CREATE OR REPLACE FUNCTION public.process_check_out(
  p_employee_id UUID,
  p_office_id UUID,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_distance_meters NUMERIC,
  p_date DATE DEFAULT CURRENT_DATE
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
BEGIN
  -- 1. Validasi: Cek absen masuk hari ini
  SELECT id, check_in_time, check_out_time, status, date
  INTO v_existing
  FROM attendance_records_partitioned
  WHERE employee_id = p_employee_id AND date = p_date
  LIMIT 1;

  IF v_existing.id IS NULL OR v_existing.check_in_time IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_CHECKED_IN',
      'message', 'Belum melakukan absen masuk'
    );
  END IF;

  IF v_existing.check_out_time IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CHECKED_OUT',
      'message', 'Sudah melakukan absen pulang hari ini'
    );
  END IF;

  -- 2. Ambil data kantor
  SELECT work_end_time INTO v_office
  FROM offices WHERE id = p_office_id;

  v_work_end := COALESCE(v_office.work_end_time, '17:00:00'::TIME);

  -- 3. Tentukan status
  v_status := v_existing.status;
  IF v_now::TIME < v_work_end THEN
    IF v_existing.status = 'terlambat' THEN
      v_status := 'terlambat_pulang_cepat';
    ELSE
      v_status := 'pulang_cepat';
    END IF;
  END IF;

  -- 4. Update record (single transaction, with partition pruning via date)
  UPDATE attendance_records_partitioned
  SET
    check_out_time = v_now,
    check_out_latitude = p_latitude,
    check_out_longitude = p_longitude,
    check_out_distance_meters = p_distance_meters,
    status = v_status,
    updated_at = v_now
  WHERE id = v_existing.id AND date = v_existing.date;

  -- 5. Return result
  RETURN jsonb_build_object(
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

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'DB_ERROR',
    'message', SQLERRM
  );
END;
$$;
