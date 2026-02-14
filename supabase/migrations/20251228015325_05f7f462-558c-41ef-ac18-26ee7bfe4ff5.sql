-- 1. Tambah nilai enum baru 'terlambat_pulang_cepat' ke attendance_status
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'terlambat_pulang_cepat';

-- 2. Tambah kolom allow_wfh ke tabel organization_settings
-- Ini akan dikelola per-tenant melalui organization_settings dengan setting_key = 'allow_wfh'

-- 3. Tambah kolom is_wfh di attendance_records untuk menandai absensi WFH
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS is_wfh boolean DEFAULT false;