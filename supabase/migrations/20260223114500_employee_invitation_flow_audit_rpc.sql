-- Audit RPC for invitation flow events (create/reuse/join-link).
CREATE OR REPLACE FUNCTION public.log_employee_invitation_flow_audit(
  p_tenant_id UUID,
  p_invitation_id UUID,
  p_event TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_employee_id UUID;
  v_audit_id UUID;
  v_event TEXT;
  v_invitation_tenant_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant wajib diisi';
  END IF;
  IF p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'Invitation wajib diisi';
  END IF;

  v_event := UPPER(TRIM(COALESCE(p_event, '')));
  IF v_event = '' THEN
    RAISE EXCEPTION 'Event wajib diisi';
  END IF;

  IF v_event NOT IN (
    'INVITATION_CREATE_NEW',
    'INVITATION_REUSE_EXISTING',
    'INVITATION_JOIN_LINK_EXISTING_EMPLOYEE',
    'INVITATION_JOIN_CREATE_NEW_EMPLOYEE'
  ) THEN
    RAISE EXCEPTION 'Event tidak didukung: %', p_event;
  END IF;

  SELECT ei.tenant_id
  INTO v_invitation_tenant_id
  FROM public.employee_invitations ei
  WHERE ei.id = p_invitation_id
  LIMIT 1;

  IF v_invitation_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Invitation tidak ditemukan';
  END IF;

  IF v_invitation_tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'Invitation tidak sesuai tenant';
  END IF;

  IF NOT (
    public.is_super_admin(v_user_id)
    OR (
      public.has_role(v_user_id, 'admin_instansi'::public.app_role)
      AND public.get_user_tenant_id(v_user_id) = p_tenant_id
    )
  ) THEN
    RAISE EXCEPTION 'Tidak memiliki akses';
  END IF;

  SELECT e.id
  INTO v_employee_id
  FROM public.employees e
  WHERE e.user_id = v_user_id
    AND e.tenant_id = p_tenant_id
  ORDER BY e.created_at DESC
  LIMIT 1;

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    employee_id,
    action,
    table_name,
    record_id,
    new_values
  ) VALUES (
    p_tenant_id,
    v_user_id,
    v_employee_id,
    v_event,
    'employee_invitations',
    p_invitation_id,
    jsonb_build_object(
      'event', v_event,
      'payload', COALESCE(p_payload, '{}'::JSONB),
      'logged_at', now()
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_employee_invitation_flow_audit(UUID, UUID, TEXT, JSONB) TO authenticated;
