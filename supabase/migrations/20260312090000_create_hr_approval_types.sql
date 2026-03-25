-- Migration: HR Approval Types Table
-- Tanggal: 2026-03-12
-- Deskripsi: Membuat tabel hr_approval_types untuk konfigurasi hierarki approval HR

-- Buat tabel hr_approval_types jika belum ada
CREATE TABLE IF NOT EXISTS hr_approval_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type_name TEXT NOT NULL,
  type_code TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT hr_approval_types_type_code_unique UNIQUE (tenant_id, type_code),
  CONSTRAINT hr_approval_types_type_name_unique UNIQUE (tenant_id, type_name)
);

-- Indexes untuk performa
CREATE INDEX IF NOT EXISTS hr_approval_types_tenant_id ON hr_approval_types(tenant_id);
CREATE INDEX IF NOT EXISTS hr_approval_types_type_code ON hr_approval_types(type_code);
CREATE INDEX IF NOT EXISTS hr_approval_types_is_active ON hr_approval_types(is_active);
CREATE INDEX IF NOT EXISTS hr_approval_types_created_at ON hr_approval_types(created_at DESC);

-- Trigger untuk auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_hr_approval_types_updated_at ON hr_approval_types;
CREATE TRIGGER update_hr_approval_types_updated_at
  BEFORE UPDATE ON hr_approval_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE hr_approval_types IS 'Konfigurasi hierarki approval untuk berbagai jenis permohonan HR (cuti, WFH, lembur, mutasi, dll)';
COMMENT ON COLUMN hr_approval_types.id IS 'UUID primary key';
COMMENT ON COLUMN hr_approval_types.tenant_id IS 'Referensi ke tenant/organisasi';
COMMENT ON COLUMN hr_approval_types.type_name IS 'Nama jenis approval (contoh: Cuti Tahunan, WFH Bulanan)';
COMMENT ON COLUMN hr_approval_types.type_code IS 'Kode jenis approval (LEAVE, WFH, OVERTIME, MUTATION, OTHER)';
COMMENT ON COLUMN hr_approval_types.is_active IS 'Status aktif/nonaktif jenis approval';
COMMENT ON COLUMN hr_approval_types.levels IS 'JSON array level approval: [{level_order, approver_role, sla_hours, notes}]';
COMMENT ON COLUMN hr_approval_types.created_at IS 'Timestamp pembuatan';
COMMENT ON COLUMN hr_approval_types.updated_at IS 'Timestamp update terakhir';

-- Grant permissions
GRANT SELECT ON hr_approval_types TO authenticated;
GRANT ALL ON hr_approval_types TO service_role;

-- Row Level Security (RLS)
ALTER TABLE hr_approval_types ENABLE ROW LEVEL SECURITY;

-- Policy: Admin instansi dapat akses penuh
DROP POLICY IF EXISTS "Admin instansi dapat akses hr_approval_types" ON hr_approval_types;
CREATE POLICY "Admin instansi dapat akses hr_approval_types"
  ON hr_approval_types
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

-- Policy: Super admin dapat akses semua tenant
DROP POLICY IF EXISTS "Super admin dapat akses semua hr_approval_types" ON hr_approval_types;
CREATE POLICY "Super admin dapat akses semua hr_approval_types"
  ON hr_approval_types
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = (auth.uid())::UUID 
        AND ur.role = 'super_admin'
    )
  );

-- Policy: Operator HR dapat read-only
DROP POLICY IF EXISTS "Operator HR dapat read hr_approval_types" ON hr_approval_types;
CREATE POLICY "Operator HR dapat read hr_approval_types"
  ON hr_approval_types
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur
      WHERE ur.user_id = (auth.uid())::UUID 
        AND ur.role = 'operator_hr'
    )
  );

-- Insert seed data (optional - bisa dihapus jika tidak diperlukan)
-- COMMENT: Seed data ini hanya contoh, bisa dihapus atau dimodifikasi sesuai kebutuhan

INSERT INTO hr_approval_types (tenant_id, type_name, type_code, is_active, levels)
SELECT 
  (SELECT id FROM tenants LIMIT 1), -- Gunakan tenant pertama sebagai contoh
  'Cuti dan Izin',
  'LEAVE',
  TRUE,
  '[
    {"level_order": 1, "approver_role": "atasan_langsung", "sla_hours": 24, "notes": "Approval level 1"},
    {"level_order": 2, "approver_role": "kepala_bidang", "sla_hours": 48, "notes": "Approval level 2 jika level 1 tidak merespon"},
    {"level_order": 3, "approver_role": "hr_admin", "sla_hours": 72, "notes": "Final approval dari HR"}
  ]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM hr_approval_types WHERE type_code = 'LEAVE'
);

INSERT INTO hr_approval_types (tenant_id, type_name, type_code, is_active, levels)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'WFH',
  'WFH',
  TRUE,
  '[
    {"level_order": 1, "approver_role": "atasan_langsung", "sla_hours": 12, "notes": "Approval WFH harian"}
  ]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM hr_approval_types WHERE type_code = 'WFH'
);

INSERT INTO hr_approval_types (tenant_id, type_name, type_code, is_active, levels)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'Lembur',
  'OVERTIME',
  TRUE,
  '[
    {"level_order": 1, "approver_role": "atasan_langsung", "sla_hours": 24, "notes": "Approval lembur"},
    {"level_order": 2, "approver_role": "hr_admin", "sla_hours": 48, "notes": "Validasi HR"}
  ]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM hr_approval_types WHERE type_code = 'OVERTIME'
);

INSERT INTO hr_approval_types (tenant_id, type_name, type_code, is_active, levels)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'Mutasi',
  'MUTATION',
  TRUE,
  '[
    {"level_order": 1, "approver_role": "kepala_bidang", "sla_hours": 72, "notes": "Approval kepala bidang"},
    {"level_order": 2, "approver_role": "kepala_dinas", "sla_hours": 120, "notes": "Approval kepala dinas"},
    {"level_order": 3, "approver_role": "hr_admin", "sla_hours": 168, "notes": "Final approval HR"}
  ]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM hr_approval_types WHERE type_code = 'MUTATION'
);
