-- Harden notifications multi-tenant security and improve query performance.

CREATE OR REPLACE FUNCTION public.get_notification_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ur.tenant_id
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.tenant_id IS NOT NULL
      ORDER BY
        CASE ur.role
          WHEN 'admin_instansi'::public.app_role THEN 1
          WHEN 'atasan'::public.app_role THEN 2
          WHEN 'pegawai'::public.app_role THEN 3
          ELSE 9
        END,
        ur.created_at ASC
      LIMIT 1
    ),
    (
      SELECT e.tenant_id
      FROM public.employees e
      WHERE e.user_id = _user_id
      LIMIT 1
    )
  )
$$;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Super admins can manage all notifications" ON public.notifications;

CREATE POLICY "Super admins can manage all notifications"
ON public.notifications
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Tenant admin can view tenant notifications"
ON public.notifications
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  AND public.get_notification_user_tenant_id(auth.uid()) IS NOT NULL
  AND public.get_notification_user_tenant_id(user_id) = public.get_notification_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Tenant admin can delete tenant notifications"
ON public.notifications
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  AND public.get_notification_user_tenant_id(auth.uid()) IS NOT NULL
  AND public.get_notification_user_tenant_id(user_id) = public.get_notification_user_tenant_id(auth.uid())
);

CREATE POLICY "Scoped admins can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    (public.has_role(auth.uid(), 'admin_instansi'::public.app_role) OR public.has_role(auth.uid(), 'atasan'::public.app_role))
    AND public.get_notification_user_tenant_id(auth.uid()) IS NOT NULL
    AND public.get_notification_user_tenant_id(user_id) = public.get_notification_user_tenant_id(auth.uid())
  )
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type_created_at ON public.notifications(type, created_at DESC);
