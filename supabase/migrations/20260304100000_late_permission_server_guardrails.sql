-- Server-side guardrails for "Izin Terlambat" submissions
-- Marker format comes from frontend:
-- [IZIN_TERLAMBAT_V1]
-- ETA: HH:mm
-- ALASAN: ...

CREATE OR REPLACE FUNCTION public.guard_late_permission_leave_requests()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prefix CONSTANT text := '[IZIN_TERLAMBAT_V1]%';
  v_duplicate_id uuid;
BEGIN
  IF
    NEW.leave_type = 'izin'
    AND coalesce(NEW.reason, '') LIKE v_prefix
    AND coalesce(NEW.status, 'menunggu') IN ('menunggu', 'disetujui')
  THEN
    IF NEW.start_date IS NULL OR NEW.end_date IS NULL OR NEW.start_date <> NEW.end_date THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Izin terlambat wajib 1 hari (start_date=end_date).';
    END IF;

    SELECT lr.id
      INTO v_duplicate_id
      FROM public.leave_requests lr
     WHERE lr.employee_id = NEW.employee_id
       AND lr.leave_type = 'izin'
       AND lr.start_date = NEW.start_date
       AND lr.end_date = NEW.end_date
       AND coalesce(lr.reason, '') LIKE v_prefix
       AND coalesce(lr.status, 'menunggu') IN ('menunggu', 'disetujui')
       AND (TG_OP = 'INSERT' OR lr.id <> NEW.id)
     LIMIT 1;

    IF v_duplicate_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Permohonan izin terlambat aktif untuk tanggal ini sudah ada.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_late_permission_leave_requests ON public.leave_requests;
CREATE TRIGGER trg_guard_late_permission_leave_requests
BEFORE INSERT OR UPDATE OF leave_type, start_date, end_date, employee_id, reason, status
ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_late_permission_leave_requests();

CREATE INDEX IF NOT EXISTS idx_leave_requests_late_permission_lookup
ON public.leave_requests (employee_id, start_date, status)
WHERE leave_type = 'izin' AND reason LIKE '[IZIN_TERLAMBAT_V1]%';

