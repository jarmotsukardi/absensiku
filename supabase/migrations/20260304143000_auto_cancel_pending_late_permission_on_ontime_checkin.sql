-- Auto-cancel pending late-permission requests when check-in is actually on time.
-- Keep audit trail by retaining leave_requests row and marking it as rejected by system.

CREATE OR REPLACE FUNCTION public.auto_cancel_pending_late_permission_on_ontime_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_late_prefix CONSTANT text := '[IZIN_TERLAMBAT_V1]%';
  v_rejection_reason CONSTANT text := '[AUTO_CANCEL_ON_TIME] Otomatis dibatalkan karena absen masuk tercatat tepat waktu.';
BEGIN
  IF NEW.employee_id IS NULL OR NEW.date IS NULL OR NEW.check_in_time IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('hadir', 'pulang_cepat') THEN
    RETURN NEW;
  END IF;

  UPDATE public.leave_requests lr
     SET status = 'ditolak',
         rejection_reason = v_rejection_reason,
         updated_at = now()
   WHERE lr.employee_id = NEW.employee_id
     AND lr.leave_type = 'izin'
     AND lr.start_date = NEW.date
     AND lr.end_date = NEW.date
     AND coalesce(lr.status, 'menunggu') = 'menunggu'
     AND coalesce(lr.reason, '') LIKE v_late_prefix;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block attendance flow because of post-check-in automation.
    RAISE NOTICE 'auto_cancel_pending_late_permission_on_ontime_checkin failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_cancel_pending_late_permission_on_ontime_checkin ON public.attendance_records_partitioned;
CREATE TRIGGER trg_auto_cancel_pending_late_permission_on_ontime_checkin
AFTER INSERT OR UPDATE OF check_in_time, status
ON public.attendance_records_partitioned
FOR EACH ROW
EXECUTE FUNCTION public.auto_cancel_pending_late_permission_on_ontime_checkin();
