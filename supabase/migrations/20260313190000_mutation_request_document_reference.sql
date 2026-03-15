ALTER TABLE public.mutation_requests
ADD COLUMN IF NOT EXISTS document_reference_number text,
ADD COLUMN IF NOT EXISTS document_reference_date date,
ADD COLUMN IF NOT EXISTS document_reference_issuer text,
ADD COLUMN IF NOT EXISTS document_reference_notes text;

COMMENT ON COLUMN public.mutation_requests.document_reference_number IS
  'Nomor dokumen atau surat rujukan untuk mutasi/perubahan data tanpa unggah file.';
COMMENT ON COLUMN public.mutation_requests.document_reference_date IS
  'Tanggal dokumen rujukan mutasi/perubahan data.';
COMMENT ON COLUMN public.mutation_requests.document_reference_issuer IS
  'Penerbit dokumen rujukan mutasi/perubahan data.';
COMMENT ON COLUMN public.mutation_requests.document_reference_notes IS
  'Catatan referensi tambahan untuk mutasi/perubahan data.';

COMMENT ON COLUMN public.mutation_requests.attachment_url IS
  'Kolom lama lampiran file. Dipertahankan sementara untuk kompatibilitas lama, tetapi alur baru memakai referensi dokumen.';
