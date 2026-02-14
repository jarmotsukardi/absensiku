-- Tambah kolom penanggung jawab di tabel tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS pic_name text,
ADD COLUMN IF NOT EXISTS pic_whatsapp text;

-- Tambah comment untuk dokumentasi
COMMENT ON COLUMN public.tenants.pic_name IS 'Nama penanggung jawab organisasi';
COMMENT ON COLUMN public.tenants.pic_whatsapp IS 'Nomor WhatsApp penanggung jawab';