CREATE TABLE IF NOT EXISTS public.hr_employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  document_title TEXT NOT NULL,
  document_category TEXT NOT NULL,
  document_number TEXT,
  document_date DATE,
  issuer TEXT,
  notes TEXT,
  file_url TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_tenant_id
  ON public.hr_employee_documents(tenant_id);

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_employee_id
  ON public.hr_employee_documents(employee_id);

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_category
  ON public.hr_employee_documents(document_category);

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_document_date
  ON public.hr_employee_documents(document_date DESC);

CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_archived
  ON public.hr_employee_documents(is_archived);

DROP TRIGGER IF EXISTS update_hr_employee_documents_updated_at ON public.hr_employee_documents;
CREATE TRIGGER update_hr_employee_documents_updated_at
BEFORE UPDATE ON public.hr_employee_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.hr_employee_documents IS
'Repository metadata dokumen pegawai HR per tenant.';

COMMENT ON COLUMN public.hr_employee_documents.document_title IS
'Judul atau nama arsip dokumen pegawai.';

COMMENT ON COLUMN public.hr_employee_documents.document_category IS
'Kategori dokumen pegawai (kontrak, identitas, perpajakan, evaluasi, dll).';

COMMENT ON COLUMN public.hr_employee_documents.file_url IS
'URL file dokumen bila arsip tersedia di storage atau sistem lain.';

ALTER TABLE public.hr_employee_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin instansi dapat akses hr_employee_documents" ON public.hr_employee_documents;
CREATE POLICY "Admin instansi dapat akses hr_employee_documents"
ON public.hr_employee_documents
FOR ALL
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
    AND tenant_id = public.get_user_tenant_id(auth.uid())
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
    AND tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Atasan dapat read hr_employee_documents" ON public.hr_employee_documents;
CREATE POLICY "Atasan dapat read hr_employee_documents"
ON public.hr_employee_documents
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
    AND tenant_id = public.get_user_tenant_id(auth.uid())
  )
  OR (
    public.has_role(auth.uid(), 'atasan'::public.app_role)
    AND tenant_id = public.get_user_tenant_id(auth.uid())
  )
);
