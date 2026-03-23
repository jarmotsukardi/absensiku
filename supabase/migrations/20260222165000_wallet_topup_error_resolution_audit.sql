-- Audit trail untuk aksi resolve+archive error log dari flow topup saldo.

CREATE OR REPLACE FUNCTION public.log_wallet_topup_error_resolution_audit(
  p_error_ref TEXT,
  p_topup_request_id UUID,
  p_tenant_id UUID DEFAULT NULL,
  p_resolved_count INTEGER DEFAULT 0,
  p_archived_count INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_employee_id UUID := NULL;
  v_audit_id UUID;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT e.id
  INTO v_employee_id
  FROM public.employees e
  WHERE e.user_id = v_actor
  ORDER BY e.created_at DESC
  LIMIT 1;

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    employee_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    user_agent
  ) VALUES (
    p_tenant_id,
    v_actor,
    v_employee_id,
    'RESOLVE_ARCHIVE_FROM_TOPUP',
    'client_error_logs',
    NULL,
    jsonb_build_object(
      'error_ref', p_error_ref
    ),
    jsonb_build_object(
      'error_ref', p_error_ref,
      'topup_request_id', p_topup_request_id,
      'resolved_count', GREATEST(COALESCE(p_resolved_count, 0), 0),
      'archived_count', GREATEST(COALESCE(p_archived_count, 0), 0),
      'source', 'admin.billing.wallet_topup'
    ),
    'web'
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_wallet_topup_error_resolution_audit(TEXT, UUID, UUID, INTEGER, INTEGER) TO authenticated;
