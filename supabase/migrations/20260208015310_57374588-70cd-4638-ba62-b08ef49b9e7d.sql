-- Allow admin_instansi to update their own tenant
CREATE POLICY "Admin instansi can update own tenant"
ON public.tenants
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin_instansi'::app_role) 
  AND id = get_user_tenant_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin_instansi'::app_role) 
  AND id = get_user_tenant_id(auth.uid())
);