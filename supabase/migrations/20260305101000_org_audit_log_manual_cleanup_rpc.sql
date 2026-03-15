-- Tenant-scoped manual cleanup RPC for organization audit log page.
-- Keeps auto-clean policy from global retention but limits deletion to one tenant.

CREATE OR REPLACE FUNCTION public.cleanup_org_audit_logs(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_tenant_id uuid;
  v_target_tenant_id uuid;
  v_retention_days integer := public.get_audit_logs_retention_days();
  v_cutoff_date timestamptz;
  v_deleted_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.is_super_admin(v_actor) THEN
    v_target_tenant_id := p_tenant_id;
  ELSE
    SELECT ur.tenant_id
    INTO v_actor_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = v_actor
      AND ur.role = 'admin_instansi'::public.app_role
      AND ur.tenant_id IS NOT NULL
    ORDER BY ur.created_at DESC
    LIMIT 1;

    IF v_actor_tenant_id IS NULL THEN
      v_actor_tenant_id := public.get_user_tenant_id(v_actor);
    END IF;

    IF v_actor_tenant_id IS NULL THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_actor_tenant_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    v_target_tenant_id := v_actor_tenant_id;
  END IF;

  IF v_target_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_required';
  END IF;

  v_cutoff_date := now() - make_interval(days => v_retention_days);

  DELETE FROM public.audit_logs
  WHERE tenant_id = v_target_tenant_id
    AND created_at < v_cutoff_date
    AND action NOT IN ('CREATE_PARTITION', 'CLEANUP_GPS_DATA_PARTITIONED');

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_target_tenant_id,
    'retention_days', v_retention_days,
    'cutoff_date', v_cutoff_date,
    'deleted_count', v_deleted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_org_audit_logs(uuid) TO authenticated, service_role;
