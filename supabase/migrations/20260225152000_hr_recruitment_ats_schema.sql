-- HR Recruitment (ATS) baseline schema (tenant-aware + RLS)

CREATE TABLE IF NOT EXISTS public.hr_recruitment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_code text,
  title text NOT NULL,
  department text,
  employment_type text NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship')),
  location text,
  opening_count integer NOT NULL DEFAULT 1 CHECK (opening_count >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'cancelled')),
  description text,
  published_at timestamptz,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_recruitment_jobs_tenant_job_code UNIQUE (tenant_id, job_code)
);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_tenant_status
  ON public.hr_recruitment_jobs(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_tenant_title
  ON public.hr_recruitment_jobs(tenant_id, title);

CREATE TABLE IF NOT EXISTS public.hr_recruitment_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.hr_recruitment_jobs(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  source text,
  stage text NOT NULL DEFAULT 'applied' CHECK (stage IN ('applied', 'screening', 'interview', 'offered', 'hired', 'rejected')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hold', 'withdrawn', 'hired', 'rejected')),
  score numeric(5,2),
  notes text,
  hired_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  applied_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_tenant_stage
  ON public.hr_recruitment_candidates(tenant_id, stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_tenant_job
  ON public.hr_recruitment_candidates(tenant_id, job_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_tenant_email
  ON public.hr_recruitment_candidates(tenant_id, email);

ALTER TABLE public.hr_recruitment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_recruitment_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR recruitment jobs tenant read" ON public.hr_recruitment_jobs;
CREATE POLICY "HR recruitment jobs tenant read"
ON public.hr_recruitment_jobs
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "HR recruitment jobs tenant write" ON public.hr_recruitment_jobs;
CREATE POLICY "HR recruitment jobs tenant write"
ON public.hr_recruitment_jobs
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

DROP POLICY IF EXISTS "HR recruitment candidates tenant read" ON public.hr_recruitment_candidates;
CREATE POLICY "HR recruitment candidates tenant read"
ON public.hr_recruitment_candidates
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "HR recruitment candidates tenant write" ON public.hr_recruitment_candidates;
CREATE POLICY "HR recruitment candidates tenant write"
ON public.hr_recruitment_candidates
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

DROP TRIGGER IF EXISTS update_hr_recruitment_jobs_updated_at ON public.hr_recruitment_jobs;
CREATE TRIGGER update_hr_recruitment_jobs_updated_at
BEFORE UPDATE ON public.hr_recruitment_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_hr_recruitment_candidates_updated_at ON public.hr_recruitment_candidates;
CREATE TRIGGER update_hr_recruitment_candidates_updated_at
BEFORE UPDATE ON public.hr_recruitment_candidates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
