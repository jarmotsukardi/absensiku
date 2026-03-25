-- Attendance Report Queries (Supabase/Postgres)
-- Scope: attendance module only
-- Notes:
-- 1) Ganti nilai di CTE `params` sebelum menjalankan query.
-- 2) Jalankan dengan role yang punya akses tenant target (RLS-aware).
-- 3) Semua waktu lokal default: Asia/Jakarta.

/* ============================================================================
   1) LAPORAN HARIAN (OPERASIONAL)
   Output:
   tanggal,tenant_id,employee_id,nama,unit,shift,jam_masuk,jam_pulang,status_masuk,
   status_pulang,terlambat_menit,durasi_kerja_jam,jarak_masuk_m,jarak_pulang_m,
   inside_geofence,catatan
   ============================================================================ */
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS tenant_id,
    DATE '2026-03-03' AS report_date,
    'Asia/Jakarta'::text AS tz
),
attendance_base AS (
  SELECT
    ar.id,
    ar.date,
    ar.employee_id,
    e.tenant_id,
    e.name,
    COALESCE(wu.name, off.name, 'Tanpa Unit') AS unit,
    ws.shift_name AS shift,
    ar.check_in_time,
    ar.check_out_time,
    ar.check_in_distance_meters,
    ar.check_out_distance_meters,
    ar.status,
    ar.notes,
    off.radius_meters,
    COALESCE(ws.time_start, wh.time_in, off.work_start_time) AS scheduled_start_time,
    COALESCE(ws.tolerance_minutes, wh.late_tolerance_minutes, off.late_tolerance_minutes, 0) AS late_tolerance_minutes
  FROM params p
  JOIN public.attendance_records_partitioned ar
    ON ar.date = p.report_date
  JOIN public.employees e
    ON e.id = ar.employee_id
   AND e.tenant_id = p.tenant_id
  LEFT JOIN public.offices off
    ON off.id = ar.office_id
  LEFT JOIN public.work_units wu
    ON wu.id = e.work_unit_id
  LEFT JOIN public.work_shifts ws
    ON ws.id = ar.shift_id
  LEFT JOIN LATERAL (
    SELECT
      wh.time_in,
      wh.time_out,
      wh.late_tolerance_minutes
    FROM public.work_hours wh
    WHERE wh.tenant_id = e.tenant_id
      AND COALESCE(wh.is_active, true)
      AND wh.day_of_week IN (
        EXTRACT(DOW FROM ar.date)::int,
        CASE WHEN EXTRACT(DOW FROM ar.date)::int = 0 THEN 7 ELSE EXTRACT(DOW FROM ar.date)::int END
      )
    ORDER BY CASE
      WHEN wh.day_of_week = EXTRACT(DOW FROM ar.date)::int THEN 0
      ELSE 1
    END
    LIMIT 1
  ) wh ON true
)
SELECT
  ab.date AS tanggal,
  ab.tenant_id,
  ab.employee_id,
  ab.name AS nama,
  ab.unit,
  COALESCE(ab.shift, 'default') AS shift,
  timezone(p.tz, ab.check_in_time) AS jam_masuk,
  timezone(p.tz, ab.check_out_time) AS jam_pulang,
  CASE
    WHEN ab.check_in_time IS NULL THEN 'belum_check_in'
    WHEN ab.status IN ('terlambat', 'terlambat_pulang_cepat') THEN 'terlambat'
    ELSE 'tepat_waktu'
  END AS status_masuk,
  CASE
    WHEN ab.check_out_time IS NULL THEN 'belum_check_out'
    WHEN ab.status IN ('pulang_cepat', 'terlambat_pulang_cepat') THEN 'pulang_cepat'
    ELSE 'normal'
  END AS status_pulang,
  CASE
    WHEN ab.check_in_time IS NULL OR ab.scheduled_start_time IS NULL THEN NULL
    ELSE GREATEST(
      0,
      FLOOR(
        EXTRACT(
          EPOCH FROM (
            timezone(p.tz, ab.check_in_time)
            - (ab.date::timestamp + ab.scheduled_start_time)
          )
        ) / 60
      )::int - COALESCE(ab.late_tolerance_minutes, 0)
    )
  END AS terlambat_menit,
  CASE
    WHEN ab.check_in_time IS NULL OR ab.check_out_time IS NULL THEN NULL
    ELSE ROUND(EXTRACT(EPOCH FROM (ab.check_out_time - ab.check_in_time)) / 3600.0, 2)
  END AS durasi_kerja_jam,
  ab.check_in_distance_meters AS jarak_masuk_m,
  ab.check_out_distance_meters AS jarak_pulang_m,
  CASE
    WHEN ab.radius_meters IS NULL THEN NULL
    WHEN ab.check_in_distance_meters IS NULL AND ab.check_out_distance_meters IS NULL THEN NULL
    ELSE
      COALESCE(ab.check_in_distance_meters <= ab.radius_meters, true)
      AND COALESCE(ab.check_out_distance_meters <= ab.radius_meters, true)
  END AS inside_geofence,
  ab.notes AS catatan
FROM attendance_base ab
CROSS JOIN params p
ORDER BY ab.name;


/* ============================================================================
   2) LAPORAN MINGGUAN (MONITORING TIM)
   Output:
   minggu_mulai,minggu_selesai,unit,total_pegawai,hari_kerja,total_hadir,total_telat,
   total_tidak_hadir,rata2_terlambat_menit,total_jam_kerja
   ============================================================================ */
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS tenant_id,
    DATE '2026-03-02' AS week_start,
    DATE '2026-03-08' AS week_end,
    'Asia/Jakarta'::text AS tz
),
calendar_days AS (
  SELECT d::date AS day
  FROM params p
  CROSS JOIN generate_series(p.week_start, p.week_end, interval '1 day') d
),
national_holidays_in_range AS (
  SELECT nh.date AS holiday_date
  FROM params p
  JOIN public.national_holidays nh
    ON nh.date BETWEEN p.week_start AND p.week_end
   AND COALESCE(nh.is_active, true)
),
work_holiday_raw AS (
  SELECT
    wh.year,
    wh.month,
    to_date(
      wh.year::text || '-' || lpad(wh.month::text, 2, '0') || '-' || lpad(trim(dd), 2, '0'),
      'YYYY-MM-DD'
    ) AS holiday_date
  FROM params p
  JOIN public.work_holidays wh
    ON wh.tenant_id = p.tenant_id
  CROSS JOIN LATERAL regexp_split_to_table(
    regexp_replace(COALESCE(wh.dates, ''), '[\[\]"]', '', 'g'),
    ','
  ) dd
  WHERE trim(dd) ~ '^[0-9]{1,2}$'
),
work_holidays_in_range AS (
  SELECT r.holiday_date
  FROM work_holiday_raw r
  JOIN params p ON true
  WHERE r.holiday_date BETWEEN p.week_start AND p.week_end
    AND EXTRACT(MONTH FROM r.holiday_date)::int = r.month
    AND EXTRACT(YEAR FROM r.holiday_date)::int = r.year
),
working_days AS (
  SELECT COUNT(*)::int AS hari_kerja
  FROM calendar_days c
  WHERE EXTRACT(DOW FROM c.day) NOT IN (0, 6)
    AND NOT EXISTS (
      SELECT 1 FROM national_holidays_in_range nh WHERE nh.holiday_date = c.day
    )
    AND NOT EXISTS (
      SELECT 1 FROM work_holidays_in_range wh WHERE wh.holiday_date = c.day
    )
),
employee_units AS (
  SELECT
    e.id AS employee_id,
    COALESCE(wu.name, off.name, 'Tanpa Unit') AS unit
  FROM params p
  JOIN public.employees e
    ON e.tenant_id = p.tenant_id
   AND COALESCE(e.is_active, true)
  LEFT JOIN public.work_units wu
    ON wu.id = e.work_unit_id
  LEFT JOIN public.offices off
    ON off.id = e.office_id
),
attendance_detail AS (
  SELECT
    ar.employee_id,
    eu.unit,
    ar.date,
    ar.status,
    ar.check_in_time,
    ar.check_out_time,
    COALESCE(ws.time_start, wh.time_in, off.work_start_time) AS scheduled_start_time,
    COALESCE(ws.tolerance_minutes, wh.late_tolerance_minutes, off.late_tolerance_minutes, 0) AS late_tolerance_minutes
  FROM params p
  JOIN public.attendance_records_partitioned ar
    ON ar.date BETWEEN p.week_start AND p.week_end
  JOIN employee_units eu
    ON eu.employee_id = ar.employee_id
  LEFT JOIN public.offices off
    ON off.id = ar.office_id
  LEFT JOIN public.work_shifts ws
    ON ws.id = ar.shift_id
  LEFT JOIN LATERAL (
    SELECT wh.time_in, wh.time_out, wh.late_tolerance_minutes
    FROM public.work_hours wh
    WHERE wh.tenant_id = p.tenant_id
      AND COALESCE(wh.is_active, true)
      AND wh.day_of_week IN (
        EXTRACT(DOW FROM ar.date)::int,
        CASE WHEN EXTRACT(DOW FROM ar.date)::int = 0 THEN 7 ELSE EXTRACT(DOW FROM ar.date)::int END
      )
    ORDER BY CASE
      WHEN wh.day_of_week = EXTRACT(DOW FROM ar.date)::int THEN 0
      ELSE 1
    END
    LIMIT 1
  ) wh ON true
),
attendance_metric AS (
  SELECT
    d.*,
    CASE
      WHEN d.check_in_time IS NULL OR d.scheduled_start_time IS NULL THEN NULL
      ELSE GREATEST(
        0,
        FLOOR(
          EXTRACT(
            EPOCH FROM (
              timezone((SELECT tz FROM params), d.check_in_time)
              - (d.date::timestamp + d.scheduled_start_time)
            )
          ) / 60
        )::int - COALESCE(d.late_tolerance_minutes, 0)
      )
    END AS late_minutes,
    CASE
      WHEN d.check_in_time IS NULL OR d.check_out_time IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (d.check_out_time - d.check_in_time)) / 3600.0
    END AS work_hours
  FROM attendance_detail d
),
employee_unit_count AS (
  SELECT unit, COUNT(*)::int AS total_pegawai
  FROM employee_units
  GROUP BY unit
),
attendance_agg AS (
  SELECT
    unit,
    COUNT(*) FILTER (
      WHERE status IN ('hadir', 'terlambat', 'pulang_cepat', 'terlambat_pulang_cepat')
    )::int AS total_hadir,
    COUNT(*) FILTER (
      WHERE status IN ('terlambat', 'terlambat_pulang_cepat') OR COALESCE(late_minutes, 0) > 0
    )::int AS total_telat,
    COUNT(*) FILTER (WHERE status = 'tidak_hadir')::int AS recorded_tidak_hadir,
    COUNT(*) FILTER (WHERE status IN ('izin', 'cuti', 'sakit', 'tugas_luar'))::int AS total_excused,
    ROUND(AVG(late_minutes) FILTER (WHERE COALESCE(late_minutes, 0) > 0), 2) AS rata2_terlambat_menit,
    ROUND(SUM(work_hours)::numeric, 2) AS total_jam_kerja
  FROM attendance_metric
  GROUP BY unit
)
SELECT
  p.week_start AS minggu_mulai,
  p.week_end AS minggu_selesai,
  euc.unit,
  euc.total_pegawai,
  wd.hari_kerja,
  COALESCE(aa.total_hadir, 0) AS total_hadir,
  COALESCE(aa.total_telat, 0) AS total_telat,
  GREATEST(
    COALESCE(aa.recorded_tidak_hadir, 0),
    (euc.total_pegawai * wd.hari_kerja) - COALESCE(aa.total_hadir, 0) - COALESCE(aa.total_excused, 0)
  )::int AS total_tidak_hadir,
  COALESCE(aa.rata2_terlambat_menit, 0) AS rata2_terlambat_menit,
  COALESCE(aa.total_jam_kerja, 0) AS total_jam_kerja
FROM params p
CROSS JOIN working_days wd
JOIN employee_unit_count euc ON true
LEFT JOIN attendance_agg aa
  ON aa.unit = euc.unit
ORDER BY euc.unit;


/* ============================================================================
   3) LAPORAN BULANAN (MANAJERIAL)
   Output:
   bulan,unit,total_pegawai,persentase_kehadiran,persentase_ketepatan_waktu,total_telat,
   total_overtime_jam,total_anomali_lokasi,top_5_pegawai_telat,top_5_pegawai_disiplin
   ============================================================================ */
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS tenant_id,
    DATE '2026-03-01' AS month_start,
    (DATE '2026-03-01' + INTERVAL '1 month - 1 day')::date AS month_end,
    'Asia/Jakarta'::text AS tz
),
calendar_days AS (
  SELECT d::date AS day
  FROM params p
  CROSS JOIN generate_series(p.month_start, p.month_end, interval '1 day') d
),
national_holidays_in_range AS (
  SELECT nh.date AS holiday_date
  FROM params p
  JOIN public.national_holidays nh
    ON nh.date BETWEEN p.month_start AND p.month_end
   AND COALESCE(nh.is_active, true)
),
work_holiday_raw AS (
  SELECT
    wh.year,
    wh.month,
    to_date(
      wh.year::text || '-' || lpad(wh.month::text, 2, '0') || '-' || lpad(trim(dd), 2, '0'),
      'YYYY-MM-DD'
    ) AS holiday_date
  FROM params p
  JOIN public.work_holidays wh
    ON wh.tenant_id = p.tenant_id
  CROSS JOIN LATERAL regexp_split_to_table(
    regexp_replace(COALESCE(wh.dates, ''), '[\[\]"]', '', 'g'),
    ','
  ) dd
  WHERE trim(dd) ~ '^[0-9]{1,2}$'
),
work_holidays_in_range AS (
  SELECT r.holiday_date
  FROM work_holiday_raw r
  JOIN params p ON true
  WHERE r.holiday_date BETWEEN p.month_start AND p.month_end
    AND EXTRACT(MONTH FROM r.holiday_date)::int = r.month
    AND EXTRACT(YEAR FROM r.holiday_date)::int = r.year
),
working_days AS (
  SELECT COUNT(*)::int AS hari_kerja
  FROM calendar_days c
  WHERE EXTRACT(DOW FROM c.day) NOT IN (0, 6)
    AND NOT EXISTS (
      SELECT 1 FROM national_holidays_in_range nh WHERE nh.holiday_date = c.day
    )
    AND NOT EXISTS (
      SELECT 1 FROM work_holidays_in_range wh WHERE wh.holiday_date = c.day
    )
),
employee_units AS (
  SELECT
    e.id AS employee_id,
    e.name AS employee_name,
    COALESCE(wu.name, off.name, 'Tanpa Unit') AS unit
  FROM params p
  JOIN public.employees e
    ON e.tenant_id = p.tenant_id
   AND COALESCE(e.is_active, true)
  LEFT JOIN public.work_units wu
    ON wu.id = e.work_unit_id
  LEFT JOIN public.offices off
    ON off.id = e.office_id
),
attendance_detail AS (
  SELECT
    ar.employee_id,
    eu.employee_name,
    eu.unit,
    ar.date,
    ar.status,
    ar.check_in_time,
    ar.check_out_time,
    ar.check_in_distance_meters,
    ar.check_out_distance_meters,
    off.radius_meters,
    COALESCE(ws.time_start, wh.time_in, off.work_start_time) AS scheduled_start_time,
    COALESCE(ws.time_end, wh.time_out, off.work_end_time) AS scheduled_end_time,
    COALESCE(ws.tolerance_minutes, wh.late_tolerance_minutes, off.late_tolerance_minutes, 0) AS late_tolerance_minutes
  FROM params p
  JOIN public.attendance_records_partitioned ar
    ON ar.date BETWEEN p.month_start AND p.month_end
  JOIN employee_units eu
    ON eu.employee_id = ar.employee_id
  LEFT JOIN public.offices off
    ON off.id = ar.office_id
  LEFT JOIN public.work_shifts ws
    ON ws.id = ar.shift_id
  LEFT JOIN LATERAL (
    SELECT wh.time_in, wh.time_out, wh.late_tolerance_minutes
    FROM public.work_hours wh
    WHERE wh.tenant_id = p.tenant_id
      AND COALESCE(wh.is_active, true)
      AND wh.day_of_week IN (
        EXTRACT(DOW FROM ar.date)::int,
        CASE WHEN EXTRACT(DOW FROM ar.date)::int = 0 THEN 7 ELSE EXTRACT(DOW FROM ar.date)::int END
      )
    ORDER BY CASE
      WHEN wh.day_of_week = EXTRACT(DOW FROM ar.date)::int THEN 0
      ELSE 1
    END
    LIMIT 1
  ) wh ON true
),
attendance_metric AS (
  SELECT
    d.*,
    CASE
      WHEN d.check_in_time IS NULL OR d.scheduled_start_time IS NULL THEN NULL
      ELSE GREATEST(
        0,
        FLOOR(
          EXTRACT(
            EPOCH FROM (
              timezone((SELECT tz FROM params), d.check_in_time)
              - (d.date::timestamp + d.scheduled_start_time)
            )
          ) / 60
        )::int - COALESCE(d.late_tolerance_minutes, 0)
      )
    END AS late_minutes,
    CASE
      WHEN d.check_in_time IS NULL OR d.check_out_time IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (d.check_out_time - d.check_in_time)) / 3600.0
    END AS actual_hours,
    CASE
      WHEN d.scheduled_start_time IS NULL OR d.scheduled_end_time IS NULL THEN NULL
      WHEN d.scheduled_end_time >= d.scheduled_start_time
        THEN EXTRACT(EPOCH FROM (d.scheduled_end_time - d.scheduled_start_time)) / 3600.0
      ELSE EXTRACT(EPOCH FROM ((d.scheduled_end_time + interval '24 hours') - d.scheduled_start_time)) / 3600.0
    END AS planned_hours,
    CASE
      WHEN d.radius_meters IS NULL THEN false
      ELSE COALESCE(d.check_in_distance_meters > d.radius_meters, false)
        OR COALESCE(d.check_out_distance_meters > d.radius_meters, false)
    END AS is_location_anomaly
  FROM attendance_detail d
),
employee_unit_count AS (
  SELECT unit, COUNT(*)::int AS total_pegawai
  FROM employee_units
  GROUP BY unit
),
unit_month_agg AS (
  SELECT
    unit,
    COUNT(*) FILTER (
      WHERE status IN ('hadir', 'terlambat', 'pulang_cepat', 'terlambat_pulang_cepat')
    )::int AS hadir_days,
    COUNT(*) FILTER (
      WHERE status IN ('hadir', 'pulang_cepat')
        AND COALESCE(late_minutes, 0) = 0
    )::int AS ontime_days,
    COUNT(*) FILTER (
      WHERE status IN ('terlambat', 'terlambat_pulang_cepat') OR COALESCE(late_minutes, 0) > 0
    )::int AS total_telat,
    ROUND(SUM(GREATEST(COALESCE(actual_hours, 0) - COALESCE(planned_hours, 0), 0))::numeric, 2) AS total_overtime_jam,
    COUNT(*) FILTER (WHERE is_location_anomaly)::int AS total_anomali_lokasi
  FROM attendance_metric
  GROUP BY unit
),
employee_rank_base AS (
  SELECT
    unit,
    employee_id,
    employee_name,
    COUNT(*) FILTER (
      WHERE status IN ('terlambat', 'terlambat_pulang_cepat') OR COALESCE(late_minutes, 0) > 0
    )::int AS late_count,
    COUNT(*) FILTER (
      WHERE status IN ('hadir', 'pulang_cepat') AND COALESCE(late_minutes, 0) = 0
    )::int AS ontime_count,
    COUNT(*) FILTER (
      WHERE status IN ('hadir', 'terlambat', 'pulang_cepat', 'terlambat_pulang_cepat')
    )::int AS hadir_count
  FROM attendance_metric
  GROUP BY unit, employee_id, employee_name
),
rank_telat AS (
  SELECT
    unit,
    employee_name,
    late_count,
    ROW_NUMBER() OVER (PARTITION BY unit ORDER BY late_count DESC, employee_name) AS rn
  FROM employee_rank_base
  WHERE late_count > 0
),
rank_disiplin AS (
  SELECT
    unit,
    employee_name,
    ontime_count,
    late_count,
    ROW_NUMBER() OVER (
      PARTITION BY unit
      ORDER BY ontime_count DESC, late_count ASC, employee_name
    ) AS rn
  FROM employee_rank_base
  WHERE hadir_count > 0
),
agg_top_telat AS (
  SELECT
    unit,
    STRING_AGG(format('%s (%s)', employee_name, late_count), ', ' ORDER BY late_count DESC, employee_name) AS top_5_pegawai_telat
  FROM rank_telat
  WHERE rn <= 5
  GROUP BY unit
),
agg_top_disiplin AS (
  SELECT
    unit,
    STRING_AGG(format('%s (%s hari tepat waktu)', employee_name, ontime_count), ', ' ORDER BY ontime_count DESC, late_count ASC, employee_name) AS top_5_pegawai_disiplin
  FROM rank_disiplin
  WHERE rn <= 5
  GROUP BY unit
)
SELECT
  to_char(p.month_start, 'YYYY-MM') AS bulan,
  euc.unit,
  euc.total_pegawai,
  ROUND(
    (
      COALESCE(uma.hadir_days, 0)::numeric
      / NULLIF((euc.total_pegawai * wd.hari_kerja)::numeric, 0)
    ) * 100,
    2
  ) AS persentase_kehadiran,
  ROUND(
    (
      COALESCE(uma.ontime_days, 0)::numeric
      / NULLIF(COALESCE(uma.hadir_days, 0)::numeric, 0)
    ) * 100,
    2
  ) AS persentase_ketepatan_waktu,
  COALESCE(uma.total_telat, 0) AS total_telat,
  COALESCE(uma.total_overtime_jam, 0) AS total_overtime_jam,
  COALESCE(uma.total_anomali_lokasi, 0) AS total_anomali_lokasi,
  COALESCE(tt.top_5_pegawai_telat, '-') AS top_5_pegawai_telat,
  COALESCE(td.top_5_pegawai_disiplin, '-') AS top_5_pegawai_disiplin
FROM params p
CROSS JOIN working_days wd
JOIN employee_unit_count euc ON true
LEFT JOIN unit_month_agg uma
  ON uma.unit = euc.unit
LEFT JOIN agg_top_telat tt
  ON tt.unit = euc.unit
LEFT JOIN agg_top_disiplin td
  ON td.unit = euc.unit
ORDER BY euc.unit;


/* ============================================================================
   4) LAMPIRAN AUDIT ERROR (TRIASE)
   Output:
   waktu,modul,aksi,error_message,frontend_log_id,backend_trace_id,user_id,route,status
   ============================================================================ */
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS tenant_id,
    NOW() - interval '30 days' AS from_ts
),
frontend_errors AS (
  SELECT
    cel.occurred_at AS waktu,
    'frontend'::text AS modul,
    cel.context AS aksi,
    cel.message AS error_message,
    cel.error_ref AS frontend_log_id,
    NULL::text AS backend_trace_id,
    cel.user_id,
    cel.route,
    CASE
      WHEN cel.is_archived THEN 'archived'
      WHEN cel.is_resolved THEN 'resolved'
      WHEN cel.is_non_critical THEN 'non_critical'
      ELSE 'open'
    END AS status
  FROM params p
  JOIN public.client_error_logs cel
    ON cel.tenant_id = p.tenant_id
   AND cel.occurred_at >= p.from_ts
),
backend_errors AS (
  SELECT
    aiq.created_at AS waktu,
    'backend.attendance_ingest'::text AS modul,
    aiq.entry_type AS aksi,
    COALESCE(aiq.error_message, aiq.payload::text) AS error_message,
    NULL::text AS frontend_log_id,
    aiq.trace_id::text AS backend_trace_id,
    e.user_id,
    '/functions/v1/attendance-ingest-worker'::text AS route,
    aiq.status::text AS status
  FROM params p
  JOIN public.attendance_ingest_queue aiq
    ON aiq.created_at >= p.from_ts
   AND aiq.status IN ('failed', 'dead')
  JOIN public.employees e
    ON e.id = aiq.employee_id
   AND e.tenant_id = p.tenant_id
)
SELECT *
FROM (
  SELECT * FROM frontend_errors
  UNION ALL
  SELECT * FROM backend_errors
) x
ORDER BY waktu DESC;
