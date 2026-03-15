-- Granular HR ticket permissions:
-- - Operator (atasan) can take ticket (open -> in_progress) and comment
-- - Operator cannot resolve/reopen/assign
-- - Admin/super_admin keep full ticket control

-- feedback_reports (ticket) visibility and update rights
DROP POLICY IF EXISTS "Users can view own feedback" ON public.feedback_reports;
CREATE POLICY "Users can view own feedback"
ON public.feedback_reports
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
      OR public.has_role(auth.uid(), 'atasan'::public.app_role)
    )
  )
);

DROP POLICY IF EXISTS "Tenant admins/operators can update tickets" ON public.feedback_reports;
CREATE POLICY "Tenant admins/operators can update tickets"
ON public.feedback_reports
FOR UPDATE
USING (
  public.is_super_admin(auth.uid())
  OR (
    feedback_type = 'ticket'
    AND tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
      OR public.has_role(auth.uid(), 'atasan'::public.app_role)
    )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    feedback_type = 'ticket'
    AND tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
      OR (
        public.has_role(auth.uid(), 'atasan'::public.app_role)
        AND status IN ('open', 'in_progress')
      )
    )
  )
);

-- hr_ticket_comments
DROP POLICY IF EXISTS "HR ticket comments read" ON public.hr_ticket_comments;
CREATE POLICY "HR ticket comments read"
ON public.hr_ticket_comments
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
      OR public.has_role(auth.uid(), 'atasan'::public.app_role)
    )
  )
);

DROP POLICY IF EXISTS "HR ticket comments write" ON public.hr_ticket_comments;

DROP POLICY IF EXISTS "HR ticket comments insert" ON public.hr_ticket_comments;
CREATE POLICY "HR ticket comments insert"
ON public.hr_ticket_comments
FOR INSERT
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
      OR public.has_role(auth.uid(), 'atasan'::public.app_role)
    )
  )
);

DROP POLICY IF EXISTS "HR ticket comments admin manage" ON public.hr_ticket_comments;
CREATE POLICY "HR ticket comments admin manage"
ON public.hr_ticket_comments
FOR ALL
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

-- hr_ticket_status_audits
DROP POLICY IF EXISTS "HR ticket status audits read" ON public.hr_ticket_status_audits;
CREATE POLICY "HR ticket status audits read"
ON public.hr_ticket_status_audits
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
      OR public.has_role(auth.uid(), 'atasan'::public.app_role)
    )
  )
);

DROP POLICY IF EXISTS "HR ticket status audits write" ON public.hr_ticket_status_audits;

DROP POLICY IF EXISTS "HR ticket status audits insert" ON public.hr_ticket_status_audits;
CREATE POLICY "HR ticket status audits insert"
ON public.hr_ticket_status_audits
FOR INSERT
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
      OR public.has_role(auth.uid(), 'atasan'::public.app_role)
    )
  )
);

DROP POLICY IF EXISTS "HR ticket status audits admin manage" ON public.hr_ticket_status_audits;
CREATE POLICY "HR ticket status audits admin manage"
ON public.hr_ticket_status_audits
FOR ALL
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
