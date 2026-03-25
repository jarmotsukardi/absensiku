CREATE TABLE IF NOT EXISTS public.uat_execution_logbook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL CHECK (domain IN ('absensi', 'hr', 'payroll')),
  tanggal DATE NOT NULL,
  release_version TEXT,
  subdomain TEXT,
  update_name TEXT NOT NULL,
  tester TEXT,
  reviewer TEXT,
  approver TEXT,
  workflow_status TEXT NOT NULL DEFAULT 'diuji' CHECK (workflow_status IN ('draft', 'diuji', 'sign_off', 'closed')),
  area_diuji TEXT NOT NULL,
  ringkasan_hasil TEXT NOT NULL,
  referensi TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('lolos', 'perlu_tindak_lanjut')),
  source TEXT NOT NULL DEFAULT 'admin_uat_monitoring',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uat_execution_logbook_entries_domain_date
  ON public.uat_execution_logbook_entries(domain, tanggal DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_uat_execution_logbook_entries_release
  ON public.uat_execution_logbook_entries(domain, release_version);

CREATE INDEX IF NOT EXISTS idx_uat_execution_logbook_entries_tester
  ON public.uat_execution_logbook_entries(domain, tester);

CREATE INDEX IF NOT EXISTS idx_uat_execution_logbook_entries_workflow
  ON public.uat_execution_logbook_entries(domain, workflow_status, created_at DESC);

DROP TRIGGER IF EXISTS update_uat_execution_logbook_entries_updated_at ON public.uat_execution_logbook_entries;
CREATE TRIGGER update_uat_execution_logbook_entries_updated_at
BEFORE UPDATE ON public.uat_execution_logbook_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.uat_execution_logbook_entries IS
'Logbook permanen batch UAT per domain untuk admin super.';

COMMENT ON COLUMN public.uat_execution_logbook_entries.domain IS
'Domain produk yang diuji: absensi, hr, atau payroll.';

COMMENT ON COLUMN public.uat_execution_logbook_entries.update_name IS
'Nama batch atau update yang diuji.';

COMMENT ON COLUMN public.uat_execution_logbook_entries.workflow_status IS
'Status workflow batch UAT: draft, diuji, sign_off, atau closed.';

COMMENT ON COLUMN public.uat_execution_logbook_entries.source IS
'Sumber pencatatan batch UAT.';

ALTER TABLE public.uat_execution_logbook_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin dapat kelola uat_execution_logbook_entries" ON public.uat_execution_logbook_entries;
CREATE POLICY "Super admin dapat kelola uat_execution_logbook_entries"
ON public.uat_execution_logbook_entries
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
