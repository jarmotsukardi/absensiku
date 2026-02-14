-- Tambah kolom untuk device binding di employees
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS android_id TEXT,
ADD COLUMN IF NOT EXISTS device_id_reset_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS device_id_last_reset TIMESTAMP WITH TIME ZONE;

-- Buat index untuk lookup cepat
CREATE INDEX IF NOT EXISTS idx_employees_android_id ON public.employees(android_id);

-- Tambah komentar
COMMENT ON COLUMN public.employees.android_id IS 'Android ID perangkat untuk device binding';
COMMENT ON COLUMN public.employees.device_id_reset_count IS 'Jumlah kali pegawai mereset device ID';
COMMENT ON COLUMN public.employees.device_id_last_reset IS 'Terakhir kali device ID direset';