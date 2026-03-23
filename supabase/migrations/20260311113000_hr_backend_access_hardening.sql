-- Harden backend access for /org/hr v1:
-- 1. Restrict sensitive organization_settings reads for HR keys.
-- 2. Remove broad atasan UPDATE access to feedback_reports tickets.
-- 3. Add RPC for limited atasan/admin "take ticket" transition.
-- 4. Restrict client_error_logs tenant read/update to admin_instansi only.
-- 5. Add admin-only attendance insights RPC for HR internal analytics.

-- organization_settings: replace broad tenant SELECT with scoped access for sensitive HR keys.
DROP POLICY IF EXISTS "Users can view organization_settings in their tenant" ON public.organization_settings;

CREATE POLICY "Users can view organization_settings in their tenant"
ON public.organization_settings
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND setting_key NOT IN ('hr_error_alert_settings_v1', 'hr_ticket_policy_settings_v1')
  )
);

DROP POLICY IF EXISTS "Tenant can view HR ticket policy settings" ON public.organization_settings;
CREATE POLICY "Tenant can view HR ticket policy settings"
ON public.organization_settings
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND setting_key = 'hr_ticket_policy_settings_v1'
    AND (
      public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
      OR public.has_role(auth.uid(), 'atasan'::public.app_role)
    )
  )
);

DROP POLICY IF EXISTS "Admin can view HR error alert settings" ON public.organization_settings;
CREATE POLICY "Admin can view HR error alert settings"
ON public.organization_settings
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND setting_key = 'hr_error_alert_settings_v1'
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

-- feedback_reports: remove broad atasan UPDATE path. Admin/super_admin keep row updates.
DROP POLICY IF EXISTS "Tenant admins/operators can update tickets" ON public.feedback_reports;
CREATE POLICY "Tenant admins can update tickets"
ON public.feedback_reports
FOR UPDATE
USING (
  public.is_super_admin(auth.uid())
  OR (
    feedback_type = 'ticket'
    AND tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    feedback_type = 'ticket'
    AND tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

CREATE OR REPLACE FUNCTION public.hr_ticket_take(p_ticket_id uuid)
RETURNS public.feedback_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket public.feedback_reports%ROWTYPE;
  v_can_take boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO v_ticket
  FROM public.feedback_reports
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found';
  END IF;

  IF v_ticket.feedback_type <> 'ticket' THEN
    RAISE EXCEPTION 'invalid_ticket_type';
  END IF;

  IF v_ticket.tenant_id IS NULL OR v_ticket.tenant_id <> public.get_user_tenant_id(auth.uid()) THEN
    IF NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  v_can_take := public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
    OR public.has_role(auth.uid(), 'atasan'::public.app_role);

  IF NOT v_can_take THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_ticket.status NOT IN ('open', 'in_progress') THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;

  UPDATE public.feedback_reports
  SET
    status = 'in_progress',
    resolved_at = NULL,
    resolved_by = NULL,
    updated_at = now()
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_ticket_take(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_ticket_take(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ticket_take(uuid) TO service_role;

-- client_error_logs: internal HR/admin pages must not be accessible by atasan.
DROP POLICY IF EXISTS "Org tenant can read client error logs" ON public.client_error_logs;
CREATE POLICY "Org tenant can read client error logs"
ON public.client_error_logs
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Org tenant can update client error logs" ON public.client_error_logs;
CREATE POLICY "Org tenant can update client error logs"
ON public.client_error_logs
FOR UPDATE
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

CREATE OR REPLACE FUNCTION public.get_org_hr_attendance_insights(
  p_tenant_id uuid,
  p_start_date date,
  p_end_date date,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  date date,
  status public.attendance_status,
  check_in_time timestamptz,
  check_out_time timestamptz,
  is_wfh boolean,
  employee_name text,
  employee_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.is_super_admin(auth.uid()) THEN
    IF p_tenant_id IS NULL OR p_tenant_id <> public.get_user_tenant_id(auth.uid()) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    IF NOT public.has_role(auth.uid(), 'admin_instansi'::public.app_role) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    ar.id,
    ar.date,
    ar.status,
    ar.check_in_time,
    ar.check_out_time,
    ar.is_wfh,
    e.name,
    e.email
  FROM public.attendance_records ar
  JOIN public.employees e ON e.id = ar.employee_id
  WHERE e.tenant_id = p_tenant_id
    AND ar.date >= p_start_date
    AND ar.date <= p_end_date
  ORDER BY ar.date DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_hr_attendance_insights(uuid, date, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_hr_attendance_insights(uuid, date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_hr_attendance_insights(uuid, date, date, integer) TO service_role;
