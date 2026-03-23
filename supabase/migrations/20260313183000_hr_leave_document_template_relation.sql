ALTER TABLE public.leave_types
ADD COLUMN IF NOT EXISTS document_template_id uuid REFERENCES public.hr_document_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leave_types_document_template_id
  ON public.leave_types(document_template_id);

COMMENT ON COLUMN public.leave_types.document_template_id IS
  'Template dokumen HR rujukan untuk jenis cuti/izin yang membutuhkan nomor dokumen atau surat pendukung.';
