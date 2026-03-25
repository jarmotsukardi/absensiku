BEGIN;

DROP FUNCTION IF EXISTS public.validate_invitation_code(TEXT);

CREATE FUNCTION public.validate_invitation_code(p_invitation_code TEXT)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  tenant_name TEXT,
  tenant_code TEXT,
  tenant_logo_url TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  nik TEXT,
  opd_id UUID,
  office_id UUID,
  invitation_type TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  is_used BOOLEAN,
  validation_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_row public.employee_invitations%ROWTYPE;
  tenant_row public.tenants%ROWTYPE;
BEGIN
  SELECT *
  INTO invitation_row
  FROM public.employee_invitations AS ei
  WHERE ei.invitation_code = p_invitation_code
    AND ei.archived_at IS NULL
  ORDER BY ei.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      NULL::UUID,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::UUID,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ,
      NULL::BOOLEAN,
      'invalid'::TEXT;
    RETURN;
  END IF;

  SELECT *
  INTO tenant_row
  FROM public.tenants AS t
  WHERE t.id = invitation_row.tenant_id;

  RETURN QUERY
  SELECT
    invitation_row.id,
    invitation_row.tenant_id,
    tenant_row.name::TEXT,
    tenant_row.code::TEXT,
    tenant_row.logo_url::TEXT,
    invitation_row.name::TEXT,
    invitation_row.email::TEXT,
    invitation_row.phone::TEXT,
    invitation_row.nik::TEXT,
    invitation_row.opd_id,
    invitation_row.office_id,
    invitation_row.invitation_type::TEXT,
    invitation_row.status::TEXT,
    invitation_row.expires_at,
    invitation_row.verified_at,
    invitation_row.is_used,
    CASE
      WHEN invitation_row.is_used THEN 'used'
      WHEN invitation_row.expires_at IS NOT NULL AND invitation_row.expires_at <= now() THEN 'expired'
      WHEN invitation_row.status IN ('pending', 'verified') THEN 'valid'
      ELSE 'invalid'
    END::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_invitation_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_invitation_code(TEXT) TO authenticated;

COMMIT;
