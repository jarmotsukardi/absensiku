-- Drop existing INSERT policy that only allows self-insert
DROP POLICY IF EXISTS "Users can create their own mutation requests" ON public.mutation_requests;

-- Create new INSERT policy that allows:
-- 1. Users to create their own mutation requests
-- 2. Admin instansi to create mutation requests for employees in their tenant
CREATE POLICY "Users and admins can create mutation requests" 
ON public.mutation_requests 
FOR INSERT 
WITH CHECK (
  (employee_id = get_user_employee_id(auth.uid()))
  OR is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin_instansi'::app_role) 
    AND tenant_id = get_user_tenant_id(auth.uid())
  )
);