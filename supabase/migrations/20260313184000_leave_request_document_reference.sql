ALTER TABLE public.leave_requests
ADD COLUMN IF NOT EXISTS document_reference_number text,
ADD COLUMN IF NOT EXISTS document_reference_date date,
ADD COLUMN IF NOT EXISTS document_reference_issuer text,
ADD COLUMN IF NOT EXISTS document_reference_notes text;

COMMENT ON COLUMN public.leave_requests.document_reference_number IS
  'Nomor dokumen atau surat rujukan yang diverifikasi tanpa mengunggah file.';
COMMENT ON COLUMN public.leave_requests.document_reference_date IS
  'Tanggal dokumen rujukan yang dipakai untuk pengajuan cuti/izin.';
COMMENT ON COLUMN public.leave_requests.document_reference_issuer IS
  'Penerbit atau pihak yang mengeluarkan dokumen rujukan.';
COMMENT ON COLUMN public.leave_requests.document_reference_notes IS
  'Catatan verifikasi atau ringkasan isi dokumen rujukan.';

COMMENT ON COLUMN public.leave_requests.attachment_url IS
  'Kolom lama lampiran file. Dipertahankan sementara untuk kompatibilitas lama, tetapi alur baru memakai referensi dokumen.';
