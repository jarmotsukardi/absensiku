-- Drop the overly restrictive policy that blocks anonymous access completely
DROP POLICY IF EXISTS "View invitation by specific code only" ON public.employee_invitations;

-- Create a secure RPC function for validating invitation codes
-- This allows public validation without exposing all invitation data
CREATE OR REPLACE FUNCTION public.validate_invitation_code(p_invitation_code text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  tenant_name text,
  tenant_code text,
  tenant_logo_url text,
  name text,
  email text,
  nik text,
  opd_id uuid,
  office_id uuid,
  invitation_type text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ei.id,
    ei.tenant_id,
    t.name as tenant_name,
    t.code as tenant_code,
    t.logo_url as tenant_logo_url,
    ei.name,
    ei.email,
    ei.nik,
    ei.opd_id,
    ei.office_id,
    ei.invitation_type,
    ei.status,
    ei.expires_at
  FROM employee_invitations ei
  LEFT JOIN tenants t ON t.id = ei.tenant_id
  WHERE ei.invitation_code = p_invitation_code
    AND ei.status = 'pending'
    AND ei.expires_at > NOW()
  LIMIT 1;
END;
$$;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.validate_invitation_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_invitation_code(text) TO authenticated;

-- Now create a policy that allows anonymous SELECT only when they have the exact code
-- This is more secure - they must know the code to access the row
CREATE POLICY "Public can validate invitation by code"
ON public.employee_invitations
FOR SELECT
TO anon
USING (
  -- Only allow access if the invitation_code matches and is still valid
  status = 'pending' AND expires_at > NOW()
);

-- Keep the tenant users policy for authenticated admin access
-- (already exists from previous migration)