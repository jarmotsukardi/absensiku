ALTER TABLE public.hr_employee_documents
  RENAME COLUMN file_url TO archive_reference;

COMMENT ON COLUMN public.hr_employee_documents.archive_reference IS
'Referensi arsip fisik dokumen pegawai, seperti lemari, rak, map, atau kode lokasi arsip.';
