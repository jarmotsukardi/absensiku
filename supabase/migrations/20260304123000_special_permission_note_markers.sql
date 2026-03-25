-- Add deterministic attendance note markers for approved special permissions:
-- [IZIN_TERLAMBAT_DISETUJUI]
-- [IZIN_PULANG_CEPAT_DISETUJUI]

CREATE OR REPLACE FUNCTION public.normalize_attendance_notes_with_special_permissions(
  p_current_notes text,
  p_has_late_permission boolean,
  p_has_early_permission boolean
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_late_marker CONSTANT text := '[IZIN_TERLAMBAT_DISETUJUI]';
  v_early_marker CONSTANT text := '[IZIN_PULANG_CEPAT_DISETUJUI]';
  v_source text := coalesce(p_current_notes, '');
  v_lines text[];
  v_line text;
  v_clean_lines text[] := ARRAY[]::text[];
  v_result text;
BEGIN
  IF btrim(v_source) <> '' THEN
    v_lines := regexp_split_to_array(v_source, E'\\n+');
    FOREACH v_line IN ARRAY v_lines LOOP
      v_line := btrim(v_line);
      IF v_line = '' THEN
        CONTINUE;
      END IF;
      IF v_line = v_late_marker OR v_line = v_early_marker THEN
        CONTINUE;
      END IF;
      v_clean_lines := array_append(v_clean_lines, v_line);
    END LOOP;
  END IF;

  IF p_has_late_permission THEN
    v_clean_lines := array_append(v_clean_lines, v_late_marker);
  END IF;

  IF p_has_early_permission THEN
    v_clean_lines := array_append(v_clean_lines, v_early_marker);
  END IF;

  v_result := array_to_string(v_clean_lines, E'\n');
  IF v_result IS NULL OR btrim(v_result) = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_result;
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
  IF NEW.employee_id IS NULL OR NEW.date IS NULL OR NEW.check_in_time IS NULL THEN
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

  NEW.notes := public.normalize_attendance_notes_with_special_permissions(
    NEW.notes,
    v_has_late_permission,
    v_has_early_permission
  );

  RETURN NEW;
END;
$$;

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
         notes = public.normalize_attendance_notes_with_special_permissions(
           ar.notes,
           v_has_late_permission,
           v_has_early_permission
         ),
         updated_at = now()
   WHERE ar.employee_id = NEW.employee_id
     AND ar.date = NEW.start_date
     AND ar.check_in_time IS NOT NULL
     AND (
       public.normalize_attendance_status_with_special_permissions(
         ar.status,
         v_has_late_permission,
         v_has_early_permission
       ) <> ar.status
       OR public.normalize_attendance_notes_with_special_permissions(
         ar.notes,
         v_has_late_permission,
         v_has_early_permission
       ) IS DISTINCT FROM ar.notes
     );

  RETURN NEW;
END;
$$;
