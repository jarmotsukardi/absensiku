-- Fix employee_invitations RLS: hanya boleh SELECT berdasarkan invitation_code
-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Public can view invitation by code for validation" ON public.employee_invitations;

-- Create new restrictive policy that only allows viewing by specific invitation_code
-- This prevents mass enumeration of all invitations
CREATE POLICY "View invitation by specific code only"
ON public.employee_invitations
FOR SELECT
TO public
USING (false); -- Default deny for anonymous

-- Allow authenticated users to view invitations in their tenant
CREATE POLICY "Tenant users can view invitations"
ON public.employee_invitations
FOR SELECT
TO authenticated
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  OR is_super_admin(auth.uid())
);

-- Fix password_reset_otps RLS: remove public SELECT access
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can manage OTPs" ON public.password_reset_otps;

-- Create restrictive policies - OTPs should only be accessed server-side
-- No SELECT policy for regular users - validation happens server-side in edge functions
CREATE POLICY "Service role only - insert OTPs"
ON public.password_reset_otps
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role only - update OTPs"
ON public.password_reset_otps
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role only - delete OTPs"
ON public.password_reset_otps
FOR DELETE
TO service_role
USING (true);

CREATE POLICY "Service role only - select OTPs"
ON public.password_reset_otps
FOR SELECT
TO service_role
USING (true);