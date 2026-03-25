-- Manual purge RPC for centralized client error logs.
-- Super admin only, with mandatory confirmation phrase.

CREATE OR REPLACE FUNCTION public.purge_client_error_logs(
  p_scope text DEFAULT 'archived_or_resolved',
  p_confirmation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_scope text := lower(trim(COALESCE(p_scope, '')));
  v_deleted integer := 0;
  v_confirmation text := COALESCE(p_confirmation, '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_confirmation <> 'HAPUS LOG TERPUSAT' THEN
    RAISE EXCEPTION 'invalid_confirmation';
  END IF;

  IF v_scope = 'non_critical' THEN
    DELETE FROM public.client_error_logs
    WHERE is_non_critical = true;
  ELSIF v_scope = 'archived_or_resolved' THEN
    DELETE FROM public.client_error_logs
    WHERE is_archived = true OR is_resolved = true;
  ELSIF v_scope = 'all' THEN
    DELETE FROM public.client_error_logs;
  ELSE
    RAISE EXCEPTION 'invalid_scope';
  END IF;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'scope', v_scope,
    'deleted', v_deleted,
    'purged_at', now(),
    'purged_by', auth.uid()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.purge_client_error_logs(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_client_error_logs(text, text) TO service_role;
