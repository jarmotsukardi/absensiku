-- Allow public invite validation for verified-but-not-yet-used invitations.
-- This keeps the onboarding link usable after admin verification while still
-- enforcing expiry, non-archived rows, and single-use semantics.

DROP POLICY IF EXISTS "Public can validate invitation by code" ON public.employee_invitations;
DROP POLICY IF EXISTS "Public can view invitation by code for validation" ON public.employee_invitations;
DROP POLICY IF EXISTS "View invitation by specific code only" ON public.employee_invitations;
DROP POLICY IF EXISTS "Anyone can view invitation by code" ON public.employee_invitations;

CREATE POLICY "Public can validate invitation by code"
ON public.employee_invitations
FOR SELECT
USING (
  archived_at IS NULL
  AND COALESCE(is_used, false) = false
  AND (expires_at IS NULL OR expires_at > now())
  AND status IN ('pending', 'verified')
);
