-- Add purge audit trail and preview RPC for centralized client error logs.

CREATE TABLE IF NOT EXISTS public.client_error_logs_purge_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purged_at timestamptz NOT NULL DEFAULT now(),
  purged_by uuid,
  scope text NOT NULL,
  deleted_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_purge_audits_purged_at
  ON public.client_error_logs_purge_audits (purged_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_purge_audits_scope
  ON public.client_error_logs_purge_audits (scope);

ALTER TABLE public.client_error_logs_purge_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin can read purge audits" ON public.client_error_logs_purge_audits;
CREATE POLICY "Super admin can read purge audits"
ON public.client_error_logs_purge_audits
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.preview_client_error_logs_purge(
  p_scope text DEFAULT 'archived_or_resolved'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_scope text := lower(trim(COALESCE(p_scope, '')));
  v_candidate_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_scope = 'non_critical' THEN
    SELECT COUNT(*) INTO v_candidate_count
    FROM public.client_error_logs
    WHERE is_non_critical = true;
  ELSIF v_scope = 'archived_or_resolved' THEN
    SELECT COUNT(*) INTO v_candidate_count
    FROM public.client_error_logs
    WHERE is_archived = true OR is_resolved = true;
  ELSIF v_scope = 'all' THEN
    SELECT COUNT(*) INTO v_candidate_count
    FROM public.client_error_logs;
  ELSE
    RAISE EXCEPTION 'invalid_scope';
  END IF;

  RETURN jsonb_build_object(
    'scope', v_scope,
    'candidate_count', v_candidate_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.preview_client_error_logs_purge(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_client_error_logs_purge(text) TO service_role;

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
  v_audit_id uuid;
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

  INSERT INTO public.client_error_logs_purge_audits (
    purged_by,
    scope,
    deleted_count,
    details
  ) VALUES (
    auth.uid(),
    v_scope,
    v_deleted,
    jsonb_build_object(
      'source', 'admin.error_logs',
      'confirmation', v_confirmation
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'scope', v_scope,
    'deleted', v_deleted,
    'purged_at', now(),
    'purged_by', auth.uid(),
    'audit_id', v_audit_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.purge_client_error_logs(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_client_error_logs(text, text) TO service_role;
