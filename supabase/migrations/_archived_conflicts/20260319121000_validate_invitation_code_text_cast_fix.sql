BEGIN;

CREATE OR REPLACE FUNCTION public.validate_invitation_code(p_invitation_code TEXT)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  tenant_name TEXT,
  tenant_code TEXT,
  tenant_logo_url TEXT,
  name TEXT,
  email TEXT,
  nik TEXT,
  opd_id UUID,
  office_id UUID,
  invitation_type TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ
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
    t.name AS tenant_name,
    t.code::text AS tenant_code,
    t.logo_url::text AS tenant_logo_url,
    ei.name,
    ei.email,
    ei.nik,
    ei.opd_id,
    ei.office_id,
    ei.invitation_type::text,
    ei.status::text,
    ei.expires_at
  FROM public.employee_invitations ei
  LEFT JOIN public.tenants t ON t.id = ei.tenant_id
  WHERE ei.invitation_code = p_invitation_code
    AND ei.status = 'pending'
    AND ei.archived_at IS NULL
    AND ei.expires_at > now()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_invitation_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_invitation_code(TEXT) TO authenticated;

COMMIT;
