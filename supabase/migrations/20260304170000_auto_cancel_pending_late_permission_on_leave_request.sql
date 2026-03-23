-- Auto-cancel pending late-permission requests when request arrives
-- after employee check-in is already recorded as on-time.
-- This complements attendance-trigger automation and handles reverse sync order.

CREATE OR REPLACE FUNCTION public.auto_cancel_pending_late_permission_on_leave_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_late_prefix CONSTANT text := '[IZIN_TERLAMBAT_V1]%';
  v_rejection_reason CONSTANT text := '[AUTO_CANCEL_ON_TIME] Otomatis dibatalkan karena absen masuk tercatat tepat waktu.';
  v_has_ontime_checkin boolean := false;
BEGIN
  IF NEW.employee_id IS NULL OR NEW.start_date IS NULL OR NEW.end_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.leave_type <> 'izin' THEN
    RETURN NEW;
  END IF;

  IF NEW.start_date <> NEW.end_date THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.status, 'menunggu') <> 'menunggu' THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.reason, '') NOT LIKE v_late_prefix THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.attendance_records_partitioned ar
     WHERE ar.employee_id = NEW.employee_id
       AND ar.date = NEW.start_date
       AND ar.check_in_time IS NOT NULL
       AND ar.status IN ('hadir', 'pulang_cepat')
     LIMIT 1
  )
  INTO v_has_ontime_checkin;

  IF v_has_ontime_checkin THEN
    NEW.status := 'ditolak';
    NEW.rejection_reason := v_rejection_reason;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block leave request flow because of automation guard.
    RAISE NOTICE 'auto_cancel_pending_late_permission_on_leave_request failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_cancel_pending_late_permission_on_leave_request ON public.leave_requests;
CREATE TRIGGER trg_auto_cancel_pending_late_permission_on_leave_request
BEFORE INSERT OR UPDATE OF leave_type, start_date, end_date, employee_id, reason, status
ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.auto_cancel_pending_late_permission_on_leave_request();

-- Backfill stale pending rows that should already be auto-canceled.
UPDATE public.leave_requests lr
   SET status = 'ditolak',
       rejection_reason = '[AUTO_CANCEL_ON_TIME] Otomatis dibatalkan karena absen masuk tercatat tepat waktu.',
       updated_at = now()
 WHERE lr.leave_type = 'izin'
   AND lr.start_date = lr.end_date
   AND coalesce(lr.status, 'menunggu') = 'menunggu'
   AND coalesce(lr.reason, '') LIKE '[IZIN_TERLAMBAT_V1]%'
   AND EXISTS (
     SELECT 1
       FROM public.attendance_records_partitioned ar
      WHERE ar.employee_id = lr.employee_id
        AND ar.date = lr.start_date
        AND ar.check_in_time IS NOT NULL
        AND ar.status IN ('hadir', 'pulang_cepat')
   );
