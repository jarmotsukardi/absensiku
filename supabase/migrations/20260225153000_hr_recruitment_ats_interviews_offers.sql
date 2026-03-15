-- HR Recruitment ATS Phase-2: interviews + offers

CREATE TABLE IF NOT EXISTS public.hr_recruitment_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.hr_recruitment_candidates(id) ON DELETE CASCADE,
  interview_round text NOT NULL DEFAULT 'round_1',
  scheduled_at timestamptz,
  interviewer_name text,
  interviewer_email text,
  location text,
  mode text NOT NULL DEFAULT 'online' CHECK (mode IN ('online', 'offline', 'hybrid')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  score numeric(5,2),
  feedback text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_tenant_candidate
  ON public.hr_recruitment_interviews(tenant_id, candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_tenant_status
  ON public.hr_recruitment_interviews(tenant_id, status, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS public.hr_recruitment_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.hr_recruitment_candidates(id) ON DELETE CASCADE,
  offered_position text,
  offered_salary numeric(14,2),
  currency text NOT NULL DEFAULT 'IDR',
  offered_at timestamptz,
  expiry_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'cancelled')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_offers_tenant_candidate
  ON public.hr_recruitment_offers(tenant_id, candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_offers_tenant_status
  ON public.hr_recruitment_offers(tenant_id, status, offered_at DESC);

ALTER TABLE public.hr_recruitment_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_recruitment_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR recruitment interviews tenant read" ON public.hr_recruitment_interviews;
CREATE POLICY "HR recruitment interviews tenant read"
ON public.hr_recruitment_interviews
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "HR recruitment interviews tenant write" ON public.hr_recruitment_interviews;
CREATE POLICY "HR recruitment interviews tenant write"
ON public.hr_recruitment_interviews
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

DROP POLICY IF EXISTS "HR recruitment offers tenant read" ON public.hr_recruitment_offers;
CREATE POLICY "HR recruitment offers tenant read"
ON public.hr_recruitment_offers
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "HR recruitment offers tenant write" ON public.hr_recruitment_offers;
CREATE POLICY "HR recruitment offers tenant write"
ON public.hr_recruitment_offers
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

DROP TRIGGER IF EXISTS update_hr_recruitment_interviews_updated_at ON public.hr_recruitment_interviews;
CREATE TRIGGER update_hr_recruitment_interviews_updated_at
BEFORE UPDATE ON public.hr_recruitment_interviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_hr_recruitment_offers_updated_at ON public.hr_recruitment_offers;
CREATE TRIGGER update_hr_recruitment_offers_updated_at
BEFORE UPDATE ON public.hr_recruitment_offers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
