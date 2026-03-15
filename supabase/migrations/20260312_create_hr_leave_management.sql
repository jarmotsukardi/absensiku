-- Migration: HR Leave Management Schema
-- Tanggal: 2026-03-12
-- Deskripsi: Membuat tabel leave_types dan leave_quotas untuk manajemen cuti HR

-- ============================================
-- TABEL: leave_types
-- ============================================
CREATE TABLE IF NOT EXISTS public.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  leave_name TEXT NOT NULL,
  leave_code TEXT NOT NULL,
  description TEXT,
  is_paid BOOLEAN DEFAULT TRUE,
  requires_document BOOLEAN DEFAULT FALSE,
  max_days_per_year INTEGER DEFAULT 12,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT leave_types_code_unique UNIQUE (tenant_id, leave_code),
  CONSTRAINT leave_types_name_unique UNIQUE (tenant_id, leave_name),
  CONSTRAINT leave_types_max_days_check CHECK (max_days_per_year >= 0 AND max_days_per_year <= 365)
);

CREATE INDEX IF NOT EXISTS leave_types_tenant_id ON leave_types(tenant_id);
CREATE INDEX IF NOT EXISTS leave_types_code ON leave_types(leave_code);
CREATE INDEX IF NOT EXISTS leave_types_is_active ON leave_types(is_active);

-- ============================================
-- TABEL: leave_quotas
-- ============================================
CREATE TABLE IF NOT EXISTS public.leave_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id UUID REFERENCES leave_types(id) ON DELETE CASCADE,
  quota_year INTEGER NOT NULL,
  total_days INTEGER DEFAULT 0,
  used_days INTEGER DEFAULT 0,
  remaining_days INTEGER DEFAULT 0,
  carry_over_days INTEGER DEFAULT 0,
  expired_days INTEGER DEFAULT 0,
  valid_from DATE,
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT leave_quotas_unique UNIQUE (tenant_id, employee_id, leave_type_id, quota_year),
  CONSTRAINT leave_quotas_days_check CHECK (
    total_days >= 0 AND 
    used_days >= 0 AND 
    remaining_days >= 0 AND 
    carry_over_days >= 0 AND 
    expired_days >= 0
  ),
  CONSTRAINT leave_quotas_year_check CHECK (quota_year >= 2000 AND quota_year <= 2100)
);

CREATE INDEX IF NOT EXISTS leave_quotas_tenant_id ON leave_quotas(tenant_id);
CREATE INDEX IF NOT EXISTS leave_quotas_employee_id ON leave_quotas(employee_id);
CREATE INDEX IF NOT EXISTS leave_quotas_leave_type_id ON leave_quotas(leave_type_id);
CREATE INDEX IF NOT EXISTS leave_quotas_year ON leave_quotas(quota_year);
CREATE INDEX IF NOT EXISTS leave_quotas_valid_until ON leave_quotas(valid_until);

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger: Auto-update updated_at untuk leave_types
DROP TRIGGER IF EXISTS update_leave_types_updated_at ON leave_types;
CREATE TRIGGER update_leave_types_updated_at
  BEFORE UPDATE ON leave_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-update updated_at untuk leave_quotas
DROP TRIGGER IF EXISTS update_leave_quotas_updated_at ON leave_quotas;
CREATE TRIGGER update_leave_quotas_updated_at
  BEFORE UPDATE ON leave_quotas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Auto-calculate remaining_days untuk leave_quotas
CREATE OR REPLACE FUNCTION calculate_leave_quota_remaining()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_days = NEW.total_days + NEW.carry_over_days - NEW.used_days - NEW.expired_days;
  IF NEW.remaining_days < 0 THEN
    NEW.remaining_days = 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_leave_quota_before_save ON leave_quotas;
CREATE TRIGGER calculate_leave_quota_before_save
  BEFORE INSERT OR UPDATE ON leave_quotas
  FOR EACH ROW
  EXECUTE FUNCTION calculate_leave_quota_remaining();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE leave_types IS 'Jenis cuti dan izin yang tersedia di organisasi';
COMMENT ON COLUMN leave_types.id IS 'UUID primary key';
COMMENT ON COLUMN leave_types.tenant_id IS 'Referensi ke tenant/organisasi';
COMMENT ON COLUMN leave_types.leave_name IS 'Nama jenis cuti (contoh: Cuti Tahunan, Cuti Sakit)';
COMMENT ON COLUMN leave_types.leave_code IS 'Kode unik jenis cuti (contoh: ANNUAL, SICK)';
COMMENT ON COLUMN leave_types.description IS 'Deskripsi jenis cuti';
COMMENT ON COLUMN leave_types.is_paid IS 'Apakah cuti berbayar atau tidak';
COMMENT ON COLUMN leave_types.requires_document IS 'Apakah memerlukan dokumen pendukung';
COMMENT ON COLUMN leave_types.max_days_per_year IS 'Maksimal hari cuti per tahun';
COMMENT ON COLUMN leave_types.is_active IS 'Status aktif/nonaktif jenis cuti';

COMMENT ON TABLE leave_quotas IS 'Kuota cuti per pegawai per tahun';
COMMENT ON COLUMN leave_quotas.id IS 'UUID primary key';
COMMENT ON COLUMN leave_quotas.tenant_id IS 'Referensi ke tenant/organisasi';
COMMENT ON COLUMN leave_quotas.employee_id IS 'Referensi ke pegawai';
COMMENT ON COLUMN leave_quotas.leave_type_id IS 'Referensi ke jenis cuti';
COMMENT ON COLUMN leave_quotas.quota_year IS 'Tahun kuota (contoh: 2026)';
COMMENT ON COLUMN leave_quotas.total_days IS 'Total kuota hari';
COMMENT ON COLUMN leave_quotas.used_days IS 'Jumlah hari yang sudah dipakai';
COMMENT ON COLUMN leave_quotas.remaining_days IS 'Sisa hari (auto-calculated)';
COMMENT ON COLUMN leave_quotas.carry_over_days IS 'Hari carry-over dari tahun sebelumnya';
COMMENT ON COLUMN leave_quotas.expired_days IS 'Hari yang kadaluarsa';
COMMENT ON COLUMN leave_quotas.valid_from IS 'Tanggal mulai berlaku';
COMMENT ON COLUMN leave_quotas.valid_until IS 'Tanggal kadaluarsa';

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_quotas ENABLE ROW LEVEL SECURITY;

-- Policy: Admin instansi dapat akses leave_types
DROP POLICY IF EXISTS "Admin instansi dapat akses leave_types" ON leave_types;
CREATE POLICY "Admin instansi dapat akses leave_types"
  ON leave_types
  FOR ALL
  USING (
    tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur
      WHERE ur.user_id = (auth.uid())::UUID 
        AND ur.role IN ('admin_instansi', 'super_admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur
      WHERE ur.user_id = (auth.uid())::UUID 
        AND ur.role IN ('admin_instansi', 'super_admin')
    )
  );

-- Policy: Operator HR dapat read leave_types
DROP POLICY IF EXISTS "Operator HR dapat read leave_types" ON leave_types;
CREATE POLICY "Operator HR dapat read leave_types"
  ON leave_types
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur
      WHERE ur.user_id = (auth.uid())::UUID 
        AND ur.role = 'operator_hr'
    )
  );

-- Policy: Admin instansi dapat akses leave_quotas
DROP POLICY IF EXISTS "Admin instansi dapat akses leave_quotas" ON leave_quotas;
CREATE POLICY "Admin instansi dapat akses leave_quotas"
  ON leave_quotas
  FOR ALL
  USING (
    tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur
      WHERE ur.user_id = (auth.uid())::UUID 
        AND ur.role IN ('admin_instansi', 'super_admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur
      WHERE ur.user_id = (auth.uid())::UUID 
        AND ur.role IN ('admin_instansi', 'super_admin')
    )
  );

-- Policy: Operator HR dapat read leave_quotas
DROP POLICY IF EXISTS "Operator HR dapat read leave_quotas" ON leave_quotas;
CREATE POLICY "Operator HR dapat read leave_quotas"
  ON leave_quotas
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur
      WHERE ur.user_id = (auth.uid())::UUID 
        AND ur.role = 'operator_hr'
    )
  );

-- Policy: Pegawai dapat read quota sendiri
DROP POLICY IF EXISTS "Pegawai dapat read quota sendiri" ON leave_quotas;
CREATE POLICY "Pegawai dapat read quota sendiri"
  ON leave_quotas
  FOR SELECT
  USING (
    employee_id = (auth.uid())::UUID
  );

-- ============================================
-- SEED DATA
-- ============================================

-- Cuti Tahunan
INSERT INTO leave_types (tenant_id, leave_name, leave_code, description, is_paid, requires_document, max_days_per_year, is_active)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'Cuti Tahunan',
  'ANNUAL',
  'Cuti tahunan untuk pegawai',
  TRUE,
  FALSE,
  12,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE leave_code = 'ANNUAL');

-- Cuti Sakit
INSERT INTO leave_types (tenant_id, leave_name, leave_code, description, is_paid, requires_document, max_days_per_year, is_active)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'Cuti Sakit',
  'SICK',
  'Cuti karena sakit dengan surat dokter',
  TRUE,
  TRUE,
  30,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE leave_code = 'SICK');

-- Cuti Melahirkan
INSERT INTO leave_types (tenant_id, leave_name, leave_code, description, is_paid, requires_document, max_days_per_year, is_active)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'Cuti Melahirkan',
  'MATERNITY',
  'Cuti melahirkan untuk pegawai perempuan',
  TRUE,
  TRUE,
  90,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE leave_code = 'MATERNITY');

-- Cuti Tanpa Gaji
INSERT INTO leave_types (tenant_id, leave_name, leave_code, description, is_paid, requires_document, max_days_per_year, is_active)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'Cuti Tanpa Gaji',
  'UNPAID',
  'Cuti tanpa gaji untuk keperluan pribadi',
  FALSE,
  FALSE,
  30,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE leave_code = 'UNPAID');

-- Izin Khusus
INSERT INTO leave_types (tenant_id, leave_name, leave_code, description, is_paid, requires_document, max_days_per_year, is_active)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'Izin Khusus',
  'SPECIAL',
  'Izin untuk keperluan khusus (menikah, khitan, kematian)',
  TRUE,
  TRUE,
  10,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE leave_code = 'SPECIAL');
