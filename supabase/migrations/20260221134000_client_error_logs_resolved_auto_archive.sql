-- Auto-archive resolved critical logs before long-term deletion.
-- This keeps Kritis tab clean while preserving resolved history in Arsip Kritis.

CREATE OR REPLACE FUNCTION public.apply_client_error_logs_retention(
  p_non_critical_archive_after interval DEFAULT interval '3 days',
  p_non_critical_delete_after interval DEFAULT interval '30 days',
  p_resolved_critical_archive_after interval DEFAULT interval '7 days',
  p_critical_delete_after interval DEFAULT interval '180 days'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_archived_non_critical integer := 0;
  v_archived_resolved_critical integer := 0;
  v_deleted_non_critical integer := 0;
  v_deleted_critical integer := 0;
BEGIN
  -- Allow cron/auth-less execution; enforce super admin only for interactive calls.
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.client_error_logs
  SET
    is_archived = true,
    archived_at = COALESCE(archived_at, now()),
    archive_note = COALESCE(NULLIF(archive_note, ''), 'Auto retention non-kritis')
  WHERE
    is_non_critical = true
    AND is_archived = false
    AND occurred_at < now() - p_non_critical_archive_after;
  GET DIAGNOSTICS v_archived_non_critical = ROW_COUNT;

  UPDATE public.client_error_logs
  SET
    is_archived = true,
    archived_at = COALESCE(archived_at, now()),
    archive_note = COALESCE(NULLIF(archive_note, ''), 'Auto retention selesai kritis')
  WHERE
    is_non_critical = false
    AND is_resolved = true
    AND is_archived = false
    AND COALESCE(resolved_at, occurred_at) < now() - p_resolved_critical_archive_after;
  GET DIAGNOSTICS v_archived_resolved_critical = ROW_COUNT;

  DELETE FROM public.client_error_logs
  WHERE
    is_non_critical = true
    AND is_archived = true
    AND COALESCE(archived_at, occurred_at) < now() - p_non_critical_delete_after;
  GET DIAGNOSTICS v_deleted_non_critical = ROW_COUNT;

  DELETE FROM public.client_error_logs
  WHERE
    is_non_critical = false
    AND (
      (is_archived = true AND COALESCE(archived_at, occurred_at) < now() - p_critical_delete_after)
      OR (is_resolved = true AND COALESCE(resolved_at, occurred_at) < now() - p_critical_delete_after)
    );
  GET DIAGNOSTICS v_deleted_critical = ROW_COUNT;

  RETURN jsonb_build_object(
    'archived_non_critical', v_archived_non_critical,
    'archived_resolved_critical', v_archived_resolved_critical,
    'deleted_non_critical', v_deleted_non_critical,
    'deleted_critical', v_deleted_critical
  );
END;
$function$;
