-- ============================================
-- 1. FITUR AUTO-SHIFT: Pastikan kolom yang diperlukan sudah ada di work_units
-- ============================================

-- Tambah kolom enable_auto_shift dan auto_shift_tolerance_minutes jika belum ada
ALTER TABLE work_units 
ADD COLUMN IF NOT EXISTS enable_auto_shift BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_shift_tolerance_minutes INTEGER DEFAULT 30;

-- ============================================
-- 2. FITUR ABSENSI KHUSUS (Flexible Attendance)
-- ============================================

-- Tambah kolom allow_flexible_attendance di employees
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS allow_flexible_attendance BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS flexible_attendance_limit INTEGER DEFAULT NULL;

-- Tambah kolom flexible_attendance_reason di attendance_records
ALTER TABLE attendance_records
ADD COLUMN IF NOT EXISTS flexible_attendance_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_flexible_attendance BOOLEAN DEFAULT false;

-- Tambah ke partitioned table juga
ALTER TABLE attendance_records_partitioned
ADD COLUMN IF NOT EXISTS flexible_attendance_reason TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_flexible_attendance BOOLEAN DEFAULT false;

-- ============================================
-- 3. HOMEPAGE STATISTICS SETTINGS
-- ============================================

-- Insert section statistics jika belum ada
INSERT INTO homepage_sections (section_key, section_name, is_enabled, sort_order, settings)
SELECT 'statistics', 'Statistik Pengguna', true, 5, 
       '{"title": "Platform Terpercaya", "subtitle": "Dipercaya oleh berbagai instansi di seluruh Indonesia", "show_active_institutions": true, "show_employees": true, "show_provinces": true, "show_uptime": true, "institutions_count": 500, "employees_count": 50000, "provinces_count": 34, "uptime_percent": 99.9}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM homepage_sections WHERE section_key = 'statistics');

-- Insert section news/articles jika belum ada
INSERT INTO homepage_sections (section_key, section_name, is_enabled, sort_order, settings)
SELECT 'news', 'Berita & Artikel', true, 6,
       '{"title": "Berita Terbaru", "subtitle": "Update terbaru seputar AbsensiKu", "max_display": 6}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM homepage_sections WHERE section_key = 'news');

-- ============================================
-- 4. TABEL ARTICLES JIKA BELUM ADA (untuk berita)
-- ============================================

-- Articles table sudah ada dari schema, pastikan ada kategori dan status
-- Tambah category enum jika diperlukan
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'article_category') THEN
    CREATE TYPE article_category AS ENUM ('berita', 'tutorial', 'update', 'tips');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 5. FIX PERHITUNGAN TERLAMBAT: Tambah toleransi yang lebih akurat
-- ============================================

-- Tambah kolom late_tolerance_minutes di work_hours jika belum ada
ALTER TABLE work_hours
ADD COLUMN IF NOT EXISTS late_tolerance_minutes INTEGER DEFAULT 0;

-- Update work_hours dengan tolerance 0 (strict) untuk yang belum diset
UPDATE work_hours SET late_tolerance_minutes = 0 WHERE late_tolerance_minutes IS NULL;