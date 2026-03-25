-- Soft archive support tickets in feedback_reports.
-- Ticket rows are hidden from normal lists by `is_archived = false` filter,
-- while still retained for audit and historical traceability.

ALTER TABLE public.feedback_reports
ADD COLUMN IF NOT EXISTS is_archived boolean;

UPDATE public.feedback_reports
SET is_archived = false
WHERE is_archived IS NULL;

ALTER TABLE public.feedback_reports
ALTER COLUMN is_archived SET DEFAULT false,
ALTER COLUMN is_archived SET NOT NULL;

ALTER TABLE public.feedback_reports
ADD COLUMN IF NOT EXISTS archived_at timestamptz,
ADD COLUMN IF NOT EXISTS archived_by uuid,
ADD COLUMN IF NOT EXISTS archive_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feedback_reports_archive_state_check'
      AND conrelid = 'public.feedback_reports'::regclass
  ) THEN
    ALTER TABLE public.feedback_reports
    ADD CONSTRAINT feedback_reports_archive_state_check
    CHECK (
      (NOT is_archived) OR archived_at IS NOT NULL
    );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_feedback_reports_is_archived
  ON public.feedback_reports(is_archived);

CREATE INDEX IF NOT EXISTS idx_feedback_reports_ticket_active_created_at
  ON public.feedback_reports(feedback_type, reporter_role, is_archived, created_at DESC);

DROP POLICY IF EXISTS "Users can view own feedback" ON public.feedback_reports;
CREATE POLICY "Users can view own feedback"
ON public.feedback_reports
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (
    COALESCE(is_archived, false) = false
    AND (
      user_id = auth.uid()
      OR (
        tenant_id = public.get_user_tenant_id(auth.uid())
        AND (
          public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
          OR public.has_role(auth.uid(), 'atasan'::public.app_role)
        )
      )
    )
  )
);

CREATE OR REPLACE FUNCTION public.get_feedback_stats_filtered(
  p_reporter_role TEXT DEFAULT NULL,
  p_feedback_type TEXT DEFAULT NULL,
  p_rating INTEGER DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_count BIGINT,
  avg_rating NUMERIC,
  open_bug_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super_admin BOOLEAN := public.is_super_admin(auth.uid());
  v_search TEXT := NULLIF(BTRIM(COALESCE(p_search, '')), '');
BEGIN
  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'FORBIDDEN: only super admin can access feedback stats';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      fr.id,
      fr.feedback_type,
      fr.status,
      fr.rating
    FROM public.feedback_reports fr
    WHERE
      COALESCE(fr.is_archived, false) = false
      AND (p_reporter_role IS NULL OR fr.reporter_role = p_reporter_role)
      AND (p_feedback_type IS NULL OR fr.feedback_type = p_feedback_type)
      AND (p_rating IS NULL OR fr.rating = p_rating)
      AND (
        v_search IS NULL
        OR fr.message ILIKE '%' || v_search || '%'
        OR COALESCE(fr.reporter_name, '') ILIKE '%' || v_search || '%'
      )
  )
  SELECT
    COUNT(*)::BIGINT AS total_count,
    ROUND(AVG(filtered.rating)::NUMERIC, 1) AS avg_rating,
    COUNT(*) FILTER (WHERE filtered.feedback_type = 'bug' AND filtered.status = 'open')::BIGINT AS open_bug_count
  FROM filtered;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feedback_stats_filtered(TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feedback_stats_filtered(TEXT, TEXT, INTEGER, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.auto_close_stale_support_tickets(
  p_grace_interval interval DEFAULT interval '3 days',
  p_limit integer DEFAULT 2000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed_count integer := 0;
  v_limit integer := GREATEST(COALESCE(p_limit, 2000), 1);
  v_grace interval := COALESCE(p_grace_interval, interval '3 days');
BEGIN
  WITH candidates AS (
    SELECT fr.id
    FROM public.feedback_reports fr
    WHERE fr.feedback_type = 'ticket'
      AND fr.reporter_role = 'admin_organisasi'
      AND fr.status = 'in_progress'
      AND COALESCE(fr.is_archived, false) = false
      AND COALESCE(NULLIF(BTRIM(fr.resolution_notes), ''), '') <> ''
      AND fr.updated_at <= now() - v_grace
    ORDER BY fr.updated_at ASC
    LIMIT v_limit
  )
  UPDATE public.feedback_reports fr
  SET
    status = 'closed',
    resolved_at = COALESCE(fr.resolved_at, now()),
    resolved_by = NULL,
    resolution_notes = concat_ws(
      E'\n\n',
      NULLIF(BTRIM(fr.resolution_notes), ''),
      '[Sistem] Tiket ditutup otomatis karena tidak ada balasan admin organisasi selama 3 hari.'
    ),
    updated_at = now()
  FROM candidates c
  WHERE fr.id = c.id;

  GET DIAGNOSTICS v_closed_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'closed_count', v_closed_count,
    'grace_interval', v_grace::text,
    'limit', v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auto_close_stale_support_tickets(interval, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_close_stale_support_tickets(interval, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_close_stale_support_tickets(interval, integer) TO service_role;
