BEGIN;

CREATE OR REPLACE FUNCTION public.cleanup_e2e_orgadmin_tenants(
  p_hard_delete BOOLEAN DEFAULT true,
  p_archive_fallback BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_auth_role TEXT := LOWER(COALESCE(auth.jwt() ->> 'role', auth.role(), ''));
  v_row RECORD;
  v_deleted_rows INTEGER := 0;
  v_employee_deleted INTEGER := 0;
  v_audit_deleted INTEGER := 0;
  v_tenants_scanned INTEGER := 0;
  v_tenants_deleted INTEGER := 0;
  v_tenants_archived INTEGER := 0;
  v_employees_deleted_total INTEGER := 0;
  v_audit_deleted_total INTEGER := 0;
  v_archive_name TEXT;
  v_errors JSONB := '[]'::jsonb;
  v_err_msg TEXT;
  v_err_constraint TEXT;
BEGIN
  IF v_auth_role <> 'service_role' AND (v_actor IS NULL OR NOT public.is_super_admin(v_actor)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR v_row IN
    SELECT t.id, t.name, t.email
    FROM public.tenants t
    WHERE LOWER(t.name) LIKE 'org e2e %'
      OR LOWER(t.name) LIKE '[arsip e2e] org e2e %'
      OR LOWER(COALESCE(t.email, '')) LIKE 'e2e.orgadmin.%@mailinator.com'
    ORDER BY t.created_at DESC
  LOOP
    v_tenants_scanned := v_tenants_scanned + 1;

    IF COALESCE(p_hard_delete, true) THEN
      BEGIN
        DELETE FROM public.employees
        WHERE tenant_id = v_row.id;
        GET DIAGNOSTICS v_employee_deleted = ROW_COUNT;
        v_employees_deleted_total := v_employees_deleted_total + v_employee_deleted;

        DELETE FROM public.audit_logs
        WHERE tenant_id = v_row.id;
        GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;
        v_audit_deleted_total := v_audit_deleted_total + v_audit_deleted;

        DELETE FROM public.tenants
        WHERE id = v_row.id;
        GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

        IF v_deleted_rows > 0 THEN
          v_tenants_deleted := v_tenants_deleted + 1;
          CONTINUE;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS
            v_err_msg = MESSAGE_TEXT,
            v_err_constraint = CONSTRAINT_NAME;
          IF COALESCE(p_archive_fallback, true) IS NOT TRUE THEN
            v_errors := v_errors || jsonb_build_array(
              jsonb_build_object(
                'tenant_id', v_row.id,
                'constraint', COALESCE(v_err_constraint, ''),
                'message', COALESCE(v_err_msg, 'hard_delete_failed')
              )
            );
            CONTINUE;
          END IF;
      END;
    END IF;

    IF COALESCE(p_archive_fallback, true) THEN
      v_archive_name := COALESCE(v_row.name, 'Org E2E');
      IF LOWER(v_archive_name) NOT LIKE '[arsip e2e]%' THEN
        v_archive_name := '[ARSIP E2E] ' || v_archive_name;
      END IF;

      UPDATE public.tenants
      SET is_active = false,
          name = v_archive_name,
          email = NULL,
          updated_at = now()
      WHERE id = v_row.id;

      GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;
      IF v_deleted_rows > 0 THEN
        v_tenants_archived := v_tenants_archived + 1;
      ELSE
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object(
            'tenant_id', v_row.id,
            'message', 'archive_fallback_failed'
          )
        );
      END IF;
    ELSE
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object(
          'tenant_id', v_row.id,
          'message', 'hard_delete_not_completed'
        )
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'tenants_scanned', v_tenants_scanned,
    'tenants_deleted', v_tenants_deleted,
    'tenants_archived', v_tenants_archived,
    'employees_deleted', v_employees_deleted_total,
    'audit_logs_deleted', v_audit_deleted_total,
    'errors', v_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_e2e_orgadmin_tenants(BOOLEAN, BOOLEAN) TO authenticated, service_role;

COMMIT;

