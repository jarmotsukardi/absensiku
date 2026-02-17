-- Aggregated feedback stats for super admin dashboard (with filter support).

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
      (p_reporter_role IS NULL OR fr.reporter_role = p_reporter_role)
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
