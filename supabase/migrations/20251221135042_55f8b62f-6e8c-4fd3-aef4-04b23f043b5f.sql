-- Add DELETE policy for positions table
CREATE POLICY "Admin can delete positions" 
ON public.positions 
FOR DELETE 
USING (is_super_admin(auth.uid()) OR ((tenant_id = get_user_tenant_id(auth.uid())) AND has_role(auth.uid(), 'admin_instansi'::app_role)));