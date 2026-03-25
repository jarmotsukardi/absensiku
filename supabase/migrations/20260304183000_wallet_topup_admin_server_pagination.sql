BEGIN;

CREATE OR REPLACE FUNCTION public.get_wallet_topup_requests_admin(
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0,
  p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_rows JSONB := '[]'::jsonb;
  v_total_count BIGINT := 0;
  v_status_filter TEXT := NULLIF(UPPER(BTRIM(COALESCE(p_status, ''))), '');
  v_search_filter TEXT := NULLIF(BTRIM(COALESCE(p_search, '')), '');
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(*)
  INTO v_total_count
  FROM public.wallet_topup_requests r
  LEFT JOIN public.tenants t ON t.id = r.tenant_id
  WHERE
    (v_status_filter IS NULL OR r.status = v_status_filter)
    AND (
      v_search_filter IS NULL
      OR COALESCE(t.name, '') ILIKE '%' || v_search_filter || '%'
      OR COALESCE(t.code, '') ILIKE '%' || v_search_filter || '%'
      OR COALESCE(r.reference_number, '') ILIKE '%' || v_search_filter || '%'
      OR r.id::TEXT ILIKE '%' || v_search_filter || '%'
    );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'tenant_id', q.tenant_id,
        'tenant_name', q.tenant_name,
        'tenant_code', q.tenant_code,
        'requested_amount', q.requested_amount,
        'approved_amount', q.approved_amount,
        'status', q.status,
        'reference_number', q.reference_number,
        'notes', q.notes,
        'rejection_reason', q.rejection_reason,
        'reviewed_at', q.reviewed_at,
        'created_at', q.created_at,
        'updated_at', q.updated_at
      ) ORDER BY q.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      r.*,
      t.name AS tenant_name,
      t.code AS tenant_code
    FROM public.wallet_topup_requests r
    LEFT JOIN public.tenants t ON t.id = r.tenant_id
    WHERE
      (v_status_filter IS NULL OR r.status = v_status_filter)
      AND (
        v_search_filter IS NULL
        OR COALESCE(t.name, '') ILIKE '%' || v_search_filter || '%'
        OR COALESCE(t.code, '') ILIKE '%' || v_search_filter || '%'
        OR COALESCE(r.reference_number, '') ILIKE '%' || v_search_filter || '%'
        OR r.id::TEXT ILIKE '%' || v_search_filter || '%'
      )
    ORDER BY r.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  ) q;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total_count', COALESCE(v_total_count, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_topup_requests_admin(TEXT, INTEGER, INTEGER, TEXT) TO authenticated;

COMMIT;
