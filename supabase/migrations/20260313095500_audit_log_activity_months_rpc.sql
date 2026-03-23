-- Aggregated month suggestions for admin audit log filters.
CREATE OR REPLACE FUNCTION public.get_audit_log_activity_months(
  p_action text DEFAULT NULL,
  p_table_name text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 4
)
RETURNS TABLE (
  month_value text,
  latest_created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_search text := btrim(COALESCE(p_search, ''));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 4), 1), 12);
  v_is_uuid boolean := false;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_is_uuid := v_search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  RETURN QUERY
  WITH filtered AS (
    SELECT al.created_at
    FROM public.audit_logs al
    WHERE (p_action IS NULL OR p_action = '' OR al.action = p_action)
      AND (p_table_name IS NULL OR p_table_name = '' OR al.table_name = p_table_name)
      AND (
        v_search = ''
        OR position(lower(v_search) in lower(COALESCE(al.action, ''))) > 0
        OR position(lower(v_search) in lower(COALESCE(al.table_name, ''))) > 0
        OR position(lower(v_search) in lower(COALESCE(al.ip_address, ''))) > 0
        OR (v_is_uuid AND al.record_id::text = v_search)
      )
  )
  SELECT
    to_char(date_trunc('month', created_at), 'YYYY-MM') AS month_value,
    max(created_at) AS latest_created_at
  FROM filtered
  GROUP BY 1
  ORDER BY max(created_at) DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_audit_log_activity_months(text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audit_log_activity_months(text, text, text, integer) TO authenticated;
