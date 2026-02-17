-- Optimasi laporan organisasi: pindahkan agregasi/filter berat ke SQL RPC

CREATE OR REPLACE FUNCTION public.org_get_attendance_report_page(
  p_start_date date,
  p_end_date date,
  p_opd_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_keterangan text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  date date,
  check_in_time timestamptz,
  check_out_time timestamptz,
  raw_status text,
  employee_id uuid,
  employee_name text,
  employee_nip text,
  employee_opd_id uuid,
  employee_opd_code text,
  office_name text,
  status_label text,
  keterangan text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 200);
  v_offset integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  v_tenant_id := public.get_user_tenant_id(v_uid);
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND';
  END IF;

  IF NOT public.has_role(v_uid, 'admin_instansi'::public.app_role) AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  RETURN QUERY
  WITH base AS (
    SELECT
      ar.id,
      ar.date,
      ar.check_in_time,
      ar.check_out_time,
      ar.status::text AS raw_status,
      e.id AS employee_id,
      e.name AS employee_name,
      e.nip AS employee_nip,
      e.opd_id AS employee_opd_id,
      o.code AS employee_opd_code,
      off.name AS office_name,
      wh.time_in AS scheduled_time_in,
      wh.time_out AS scheduled_time_out
    FROM public.attendance_records_partitioned ar
    JOIN public.employees e ON e.id = ar.employee_id
    LEFT JOIN public.opd o ON o.id = e.opd_id
    LEFT JOIN public.offices off ON off.id = ar.office_id
    LEFT JOIN public.work_hours wh ON wh.tenant_id = v_tenant_id
      AND wh.day_of_week = EXTRACT(ISODOW FROM ar.date)::integer
      AND wh.institution_type = 'pemerintahan'
      AND wh.is_active = true
    WHERE e.tenant_id = v_tenant_id
      AND ar.date BETWEEN p_start_date AND p_end_date
      AND (p_opd_id IS NULL OR e.opd_id = p_opd_id)
      AND (
        p_search IS NULL OR btrim(p_search) = ''
        OR e.name ILIKE '%' || p_search || '%'
        OR COALESCE(e.nip, '') ILIKE '%' || p_search || '%'
      )
  ),
  decorated AS (
    SELECT
      b.*,
      CASE
        WHEN b.check_in_time IS NULL THEN
          CASE b.raw_status
            WHEN 'izin' THEN 'Izin'
            WHEN 'cuti' THEN 'Cuti'
            WHEN 'sakit' THEN 'Sakit'
            WHEN 'tugas_luar' THEN 'Tugas Luar'
            ELSE 'Tidak Hadir'
          END
        ELSE 'Hadir'
      END AS status_label,
      CASE
        WHEN b.check_in_time IS NULL THEN '-'
        WHEN b.check_out_time IS NULL THEN
          CASE
            WHEN b.scheduled_time_in IS NULL THEN
              CASE WHEN b.raw_status = 'terlambat' THEN 'Telat (Belum Pulang)' ELSE 'Tidak Absen Pulang' END
            WHEN (timezone('Asia/Jakarta', b.check_in_time)::time) > (b.scheduled_time_in + interval '15 minutes') THEN 'Telat (Belum Pulang)'
            ELSE 'Tidak Absen Pulang'
          END
        ELSE
          CASE
            WHEN b.scheduled_time_in IS NULL OR b.scheduled_time_out IS NULL THEN
              CASE b.raw_status
                WHEN 'terlambat_pulang_cepat' THEN 'Telat + Pulang Cepat'
                WHEN 'terlambat' THEN 'Telat'
                WHEN 'pulang_cepat' THEN 'Pulang Cepat'
                ELSE 'Hadir'
              END
            ELSE
              CASE
                WHEN (timezone('Asia/Jakarta', b.check_in_time)::time) > (b.scheduled_time_in + interval '15 minutes')
                  AND (timezone('Asia/Jakarta', b.check_out_time)::time) < (b.scheduled_time_out - interval '15 minutes')
                  THEN 'Telat + Pulang Cepat'
                WHEN (timezone('Asia/Jakarta', b.check_in_time)::time) > (b.scheduled_time_in + interval '15 minutes')
                  THEN 'Telat'
                WHEN (timezone('Asia/Jakarta', b.check_out_time)::time) < (b.scheduled_time_out - interval '15 minutes')
                  THEN 'Pulang Cepat'
                ELSE 'Hadir'
              END
          END
      END AS keterangan
    FROM base b
  ),
  filtered AS (
    SELECT *
    FROM decorated d
    WHERE (p_status IS NULL OR btrim(p_status) = '' OR d.status_label = p_status)
      AND (p_keterangan IS NULL OR btrim(p_keterangan) = '' OR d.keterangan = p_keterangan)
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS total_count FROM filtered
  )
  SELECT
    f.id,
    f.date,
    f.check_in_time,
    f.check_out_time,
    f.raw_status,
    f.employee_id,
    f.employee_name,
    f.employee_nip,
    f.employee_opd_id,
    f.employee_opd_code,
    f.office_name,
    f.status_label,
    f.keterangan,
    c.total_count
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.date DESC, f.check_in_time DESC NULLS LAST, f.employee_name ASC
  OFFSET v_offset
  LIMIT v_page_size;
END;
$$;

CREATE OR REPLACE FUNCTION public.org_get_attendance_recap_page(
  p_year integer,
  p_month integer,
  p_opd_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 15
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  employee_nip text,
  opd_code text,
  hadir bigint,
  terlambat bigint,
  pulang_cepat bigint,
  terlambat_pulang_cepat bigint,
  tidak_hadir bigint,
  izin bigint,
  cuti bigint,
  sakit bigint,
  tugas_luar bigint,
  wfh bigint,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
  v_start_date date;
  v_end_date date;
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 15), 1), 200);
  v_offset integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  v_tenant_id := public.get_user_tenant_id(v_uid);
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND';
  END IF;

  IF NOT public.has_role(v_uid, 'admin_instansi'::public.app_role) AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_year IS NULL OR p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'INVALID_PERIOD';
  END IF;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + interval '1 month' - interval '1 day')::date;
  v_offset := (v_page - 1) * v_page_size;

  RETURN QUERY
  WITH base AS (
    SELECT
      e.id AS employee_id,
      e.name AS employee_name,
      e.nip AS employee_nip,
      o.code AS opd_code,
      COUNT(*) FILTER (WHERE ar.status = 'hadir')::bigint AS hadir,
      COUNT(*) FILTER (WHERE ar.status = 'terlambat')::bigint AS terlambat,
      COUNT(*) FILTER (WHERE ar.status = 'pulang_cepat')::bigint AS pulang_cepat,
      COUNT(*) FILTER (WHERE ar.status = 'terlambat_pulang_cepat')::bigint AS terlambat_pulang_cepat,
      COUNT(*) FILTER (WHERE ar.status = 'tidak_hadir')::bigint AS tidak_hadir,
      COUNT(*) FILTER (WHERE ar.status = 'izin')::bigint AS izin,
      COUNT(*) FILTER (WHERE ar.status = 'cuti')::bigint AS cuti,
      COUNT(*) FILTER (WHERE ar.status = 'sakit')::bigint AS sakit,
      COUNT(*) FILTER (WHERE ar.status = 'tugas_luar')::bigint AS tugas_luar,
      COUNT(*) FILTER (WHERE ar.is_wfh IS TRUE)::bigint AS wfh
    FROM public.employees e
    LEFT JOIN public.opd o ON o.id = e.opd_id
    JOIN public.attendance_records_partitioned ar ON ar.employee_id = e.id
      AND ar.date BETWEEN v_start_date AND v_end_date
    WHERE e.tenant_id = v_tenant_id
      AND e.is_active = true
      AND (p_opd_id IS NULL OR e.opd_id = p_opd_id)
      AND (
        p_search IS NULL OR btrim(p_search) = ''
        OR e.name ILIKE '%' || p_search || '%'
        OR COALESCE(e.nip, '') ILIKE '%' || p_search || '%'
      )
    GROUP BY e.id, e.name, e.nip, o.code
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS total_count FROM base
  )
  SELECT
    b.employee_id,
    b.employee_name,
    b.employee_nip,
    b.opd_code,
    b.hadir,
    b.terlambat,
    b.pulang_cepat,
    b.terlambat_pulang_cepat,
    b.tidak_hadir,
    b.izin,
    b.cuti,
    b.sakit,
    b.tugas_luar,
    b.wfh,
    c.total_count
  FROM base b
  CROSS JOIN counted c
  ORDER BY b.employee_name ASC
  OFFSET v_offset
  LIMIT v_page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_get_attendance_report_page(date, date, uuid, text, text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_get_attendance_recap_page(integer, integer, uuid, text, integer, integer) TO authenticated, service_role;
