-- Migration: HR Leave and Attendance Integration
-- Tanggal: 2026-03-13
-- Deskripsi: Menghubungkan master leave_types HR dengan leave_requests absensi

ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS request_type public.leave_type NOT NULL DEFAULT 'cuti_lainnya',
  ADD COLUMN IF NOT EXISTS approval_type_code TEXT NOT NULL DEFAULT 'LEAVE';

COMMENT ON COLUMN public.leave_types.request_type IS 'Mapping jenis request absensi yang dipakai leave_requests';
COMMENT ON COLUMN public.leave_types.approval_type_code IS 'Kode approval HR yang dipakai untuk alur permohonan terkait';

UPDATE public.leave_types
SET
  request_type = CASE
    WHEN upper(leave_code) IN ('IZIN', 'PERMISSION') THEN 'izin'::public.leave_type
    WHEN upper(leave_code) IN ('ANNUAL', 'CUTI_TAHUNAN') THEN 'cuti_tahunan'::public.leave_type
    WHEN upper(leave_code) IN ('IMPORTANT', 'CUTI_PENTING') THEN 'cuti_penting'::public.leave_type
    WHEN upper(leave_code) IN ('SICK', 'SAKIT') THEN 'sakit'::public.leave_type
    WHEN upper(leave_code) IN ('OFFICIAL_TRAVEL', 'TUGAS_LUAR') THEN 'tugas_luar'::public.leave_type
    ELSE COALESCE(request_type, 'cuti_lainnya'::public.leave_type)
  END,
  approval_type_code = COALESCE(NULLIF(approval_type_code, ''), 'LEAVE');

ALTER TABLE public.leave_quotas
  ALTER COLUMN total_days TYPE NUMERIC(8,1) USING total_days::numeric,
  ALTER COLUMN used_days TYPE NUMERIC(8,1) USING used_days::numeric,
  ALTER COLUMN remaining_days TYPE NUMERIC(8,1) USING remaining_days::numeric,
  ALTER COLUMN carry_over_days TYPE NUMERIC(8,1) USING carry_over_days::numeric,
  ALTER COLUMN expired_days TYPE NUMERIC(8,1) USING expired_days::numeric;

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS leave_type_id UUID REFERENCES public.leave_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leave_requests_leave_type_id_idx ON public.leave_requests(leave_type_id);

WITH ranked_leave_types AS (
  SELECT
    lt.id,
    lt.tenant_id,
    lt.request_type,
    row_number() OVER (
      PARTITION BY lt.tenant_id, lt.request_type
      ORDER BY lt.is_active DESC, lt.created_at ASC, lt.leave_name ASC
    ) AS rn
  FROM public.leave_types lt
)
UPDATE public.leave_requests lr
SET leave_type_id = ranked_leave_types.id
FROM public.employees e
JOIN ranked_leave_types
  ON ranked_leave_types.tenant_id = e.tenant_id
 AND ranked_leave_types.request_type = lr.leave_type
 AND ranked_leave_types.rn = 1
WHERE lr.employee_id = e.id
  AND lr.leave_type_id IS NULL;
