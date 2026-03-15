-- Guardrails + attendance normalization for:
-- [IZIN_TERLAMBAT_V1]
-- [IZIN_PULANG_CEPAT_V1]

CREATE OR REPLACE FUNCTION public.guard_special_permission_leave_requests()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_late_prefix CONSTANT text := '[IZIN_TERLAMBAT_V1]%';
  v_early_prefix CONSTANT text := '[IZIN_PULANG_CEPAT_V1]%';
  v_permission_kind text := NULL;
  v_duplicate_id uuid;
BEGIN
  IF NEW.leave_type = 'izin' THEN
    IF coalesce(NEW.reason, '') LIKE v_late_prefix THEN
      v_permission_kind := 'late';
    ELSIF coalesce(NEW.reason, '') LIKE v_early_prefix THEN
      v_permission_kind := 'early';
    END IF;
  END IF;

  IF
    v_permission_kind IS NOT NULL
    AND coalesce(NEW.status, 'menunggu') IN ('menunggu', 'disetujui')
  THEN
    IF NEW.start_date IS NULL OR NEW.end_date IS NULL OR NEW.start_date <> NEW.end_date THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Izin terlambat/pulang cepat wajib 1 hari (start_date=end_date).';
    END IF;

    SELECT lr.id
      INTO v_duplicate_id
      FROM public.leave_requests lr
     WHERE lr.employee_id = NEW.employee_id
       AND lr.leave_type = 'izin'
       AND lr.start_date = NEW.start_date
       AND lr.end_date = NEW.end_date
       AND coalesce(lr.status, 'menunggu') IN ('menunggu', 'disetujui')
       AND (
         (v_permission_kind = 'late' AND coalesce(lr.reason, '') LIKE v_late_prefix)
         OR
         (v_permission_kind = 'early' AND coalesce(lr.reason, '') LIKE v_early_prefix)
       )
       AND (TG_OP = 'INSERT' OR lr.id <> NEW.id)
     LIMIT 1;

    IF v_duplicate_id IS NOT NULL THEN
      IF v_permission_kind = 'late' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          MESSAGE = 'Permohonan izin terlambat aktif untuk tanggal ini sudah ada.';
      END IF;

      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Permohonan izin pulang cepat aktif untuk tanggal ini sudah ada.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_late_permission_leave_requests ON public.leave_requests;
DROP TRIGGER IF EXISTS trg_guard_special_permission_leave_requests ON public.leave_requests;
CREATE TRIGGER trg_guard_special_permission_leave_requests
BEFORE INSERT OR UPDATE OF leave_type, start_date, end_date, employee_id, reason, status
ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_special_permission_leave_requests();

CREATE OR REPLACE FUNCTION public.normalize_attendance_status_with_special_permissions(
  p_current_status public.attendance_status,
  p_has_late_permission boolean,
  p_has_early_permission boolean
)
RETURNS public.attendance_status
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_current_status = 'terlambat_pulang_cepat' THEN
    IF p_has_late_permission AND p_has_early_permission THEN
      RETURN 'hadir'::public.attendance_status;
    ELSIF p_has_late_permission THEN
      RETURN 'pulang_cepat'::public.attendance_status;
    ELSIF p_has_early_permission THEN
      RETURN 'terlambat'::public.attendance_status;
    END IF;
    RETURN p_current_status;
  END IF;

  IF p_current_status = 'terlambat' AND p_has_late_permission THEN
    RETURN 'hadir'::public.attendance_status;
  END IF;

  IF p_current_status = 'pulang_cepat' AND p_has_early_permission THEN
    RETURN 'hadir'::public.attendance_status;
  END IF;

  RETURN p_current_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_special_permission_override_on_attendance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_late_prefix CONSTANT text := '[IZIN_TERLAMBAT_V1]%';
  v_early_prefix CONSTANT text := '[IZIN_PULANG_CEPAT_V1]%';
  v_has_late_permission boolean := false;
  v_has_early_permission boolean := false;
BEGIN
  IF NEW.employee_id IS NULL OR NEW.date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('terlambat', 'pulang_cepat', 'terlambat_pulang_cepat') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.leave_requests lr
     WHERE lr.employee_id = NEW.employee_id
       AND lr.leave_type = 'izin'
       AND lr.start_date = NEW.date
       AND lr.end_date = NEW.date
       AND lr.status = 'disetujui'
       AND coalesce(lr.reason, '') LIKE v_late_prefix
  )
    INTO v_has_late_permission;

  SELECT EXISTS (
    SELECT 1
      FROM public.leave_requests lr
     WHERE lr.employee_id = NEW.employee_id
       AND lr.leave_type = 'izin'
       AND lr.start_date = NEW.date
       AND lr.end_date = NEW.date
       AND lr.status = 'disetujui'
       AND coalesce(lr.reason, '') LIKE v_early_prefix
  )
    INTO v_has_early_permission;

  NEW.status := public.normalize_attendance_status_with_special_permissions(
    NEW.status,
    v_has_late_permission,
    v_has_early_permission
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_special_permission_override_on_attendance ON public.attendance_records_partitioned;
CREATE TRIGGER trg_apply_special_permission_override_on_attendance
BEFORE INSERT OR UPDATE OF status, employee_id, date
ON public.attendance_records_partitioned
FOR EACH ROW
EXECUTE FUNCTION public.apply_special_permission_override_on_attendance();

CREATE OR REPLACE FUNCTION public.sync_attendance_on_special_permission_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_late_prefix CONSTANT text := '[IZIN_TERLAMBAT_V1]%';
  v_early_prefix CONSTANT text := '[IZIN_PULANG_CEPAT_V1]%';
  v_has_late_permission boolean := false;
  v_has_early_permission boolean := false;
BEGIN
  IF NEW.leave_type <> 'izin' THEN
    RETURN NEW;
  END IF;

  IF NEW.start_date IS NULL OR NEW.end_date IS NULL OR NEW.start_date <> NEW.end_date THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.status, 'menunggu') <> 'disetujui' THEN
    RETURN NEW;
  END IF;

  IF
    coalesce(NEW.reason, '') NOT LIKE v_late_prefix
    AND coalesce(NEW.reason, '') NOT LIKE v_early_prefix
  THEN
    RETURN NEW;
  END IF;

  IF
    TG_OP = 'UPDATE'
    AND coalesce(OLD.status, 'menunggu') = 'disetujui'
    AND OLD.employee_id IS NOT DISTINCT FROM NEW.employee_id
    AND OLD.start_date IS NOT DISTINCT FROM NEW.start_date
    AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date
    AND OLD.reason IS NOT DISTINCT FROM NEW.reason
  THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.leave_requests lr
     WHERE lr.employee_id = NEW.employee_id
       AND lr.leave_type = 'izin'
       AND lr.start_date = NEW.start_date
       AND lr.end_date = NEW.end_date
       AND lr.status = 'disetujui'
       AND coalesce(lr.reason, '') LIKE v_late_prefix
  )
    INTO v_has_late_permission;

  SELECT EXISTS (
    SELECT 1
      FROM public.leave_requests lr
     WHERE lr.employee_id = NEW.employee_id
       AND lr.leave_type = 'izin'
       AND lr.start_date = NEW.start_date
       AND lr.end_date = NEW.end_date
       AND lr.status = 'disetujui'
       AND coalesce(lr.reason, '') LIKE v_early_prefix
  )
    INTO v_has_early_permission;

  UPDATE public.attendance_records_partitioned ar
     SET status = public.normalize_attendance_status_with_special_permissions(
       ar.status,
       v_has_late_permission,
       v_has_early_permission
     ),
         updated_at = now()
   WHERE ar.employee_id = NEW.employee_id
     AND ar.date = NEW.start_date
     AND ar.status IN ('terlambat', 'pulang_cepat', 'terlambat_pulang_cepat')
     AND public.normalize_attendance_status_with_special_permissions(
       ar.status,
       v_has_late_permission,
       v_has_early_permission
     ) <> ar.status;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_attendance_on_special_permission_approval ON public.leave_requests;
CREATE TRIGGER trg_sync_attendance_on_special_permission_approval
AFTER INSERT OR UPDATE OF status, reason, start_date, end_date, employee_id
ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_attendance_on_special_permission_approval();

CREATE INDEX IF NOT EXISTS idx_leave_requests_late_permission_lookup
ON public.leave_requests (employee_id, start_date, status)
WHERE leave_type = 'izin' AND reason LIKE '[IZIN_TERLAMBAT_V1]%';

CREATE INDEX IF NOT EXISTS idx_leave_requests_early_permission_lookup
ON public.leave_requests (employee_id, start_date, status)
WHERE leave_type = 'izin' AND reason LIKE '[IZIN_PULANG_CEPAT_V1]%';
