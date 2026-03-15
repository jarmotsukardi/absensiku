-- Migration: HR Document Templates Enhancement
-- Tanggal: 2026-03-12
-- Deskripsi: Memastikan tabel hr_document_templates memiliki fields yang diperlukan

-- Buat tabel hr_document_templates jika belum ada
CREATE TABLE IF NOT EXISTS hr_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_type TEXT NOT NULL,
  template_content TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT hr_document_templates_template_name_unique UNIQUE (tenant_id, template_name)
);

-- Indexes untuk performa
CREATE INDEX IF NOT EXISTS hr_document_templates_tenant_id ON hr_document_templates(tenant_id);
CREATE INDEX IF NOT EXISTS hr_document_templates_template_type ON hr_document_templates(template_type);
CREATE INDEX IF NOT EXISTS hr_document_templates_is_active ON hr_document_templates(is_active);
CREATE INDEX IF NOT EXISTS hr_document_templates_created_at ON hr_document_templates(created_at DESC);

-- Trigger untuk auto-update updated_at
DROP TRIGGER IF EXISTS update_hr_document_templates_updated_at ON hr_document_templates;
CREATE TRIGGER update_hr_document_templates_updated_at
  BEFORE UPDATE ON hr_document_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE hr_document_templates IS 'Template dokumen HR untuk kontrak, surat peringatan, dan dokumen lainnya';
COMMENT ON COLUMN hr_document_templates.id IS 'UUID primary key';
COMMENT ON COLUMN hr_document_templates.tenant_id IS 'Referensi ke tenant/organisasi';
COMMENT ON COLUMN hr_document_templates.template_name IS 'Nama template (contoh: Template Kontrak PKWT 2026)';
COMMENT ON COLUMN hr_document_templates.template_type IS 'Jenis template (KONTRAK_PKWT, KONTRAK_PKWTT, SP1, SP2, SP3, MUTASI, PROMOSI, dll)';
COMMENT ON COLUMN hr_document_templates.template_content IS 'Konten template dengan variable substitution ({{nama}}, {{nip}}, dll)';
COMMENT ON COLUMN hr_document_templates.variables IS 'Array variabel yang digunakan dalam template';
COMMENT ON COLUMN hr_document_templates.description IS 'Deskripsi singkat template';
COMMENT ON COLUMN hr_document_templates.is_active IS 'Status aktif/nonaktif template';
COMMENT ON COLUMN hr_document_templates.version IS 'Version number, auto-increment saat update';
COMMENT ON COLUMN hr_document_templates.created_at IS 'Timestamp pembuatan';
COMMENT ON COLUMN hr_document_templates.updated_at IS 'Timestamp update terakhir';

-- Grant permissions
GRANT SELECT ON hr_document_templates TO authenticated;
GRANT ALL ON hr_document_templates TO service_role;

-- Row Level Security (RLS)
ALTER TABLE hr_document_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Admin instansi dapat akses penuh
DROP POLICY IF EXISTS "Admin instansi dapat akses hr_document_templates" ON hr_document_templates;
CREATE POLICY "Admin instansi dapat akses hr_document_templates"
  ON hr_document_templates
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
DROP POLICY IF EXISTS "Super admin dapat akses semua hr_document_templates" ON hr_document_templates;
CREATE POLICY "Super admin dapat akses semua hr_document_templates"
  ON hr_document_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = (auth.uid())::UUID 
        AND ur.role = 'super_admin'
    )
  );

-- Policy: Operator HR dapat read-only
DROP POLICY IF EXISTS "Operator HR dapat read hr_document_templates" ON hr_document_templates;
CREATE POLICY "Operator HR dapat read hr_document_templates"
  ON hr_document_templates
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur
      WHERE ur.user_id = (auth.uid())::UUID 
        AND ur.role = 'operator_hr'
    )
  );

-- Insert seed data (optional - template dasar)
-- COMMENT: Seed data ini hanya contoh, bisa dihapus atau dimodifikasi sesuai kebutuhan

INSERT INTO hr_document_templates (tenant_id, template_name, template_type, template_content, variables, is_active, version)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'Template Kontrak PKWT',
  'KONTRAK_PKWT',
  'SURAT PERJANJIAN KERJA WAKTU TERTENTU (PKWT)
Nomor: {{nomor_surat}}

Yang bertanda tangan di bawah ini:
Nama: {{nama_pejabat}}
NIP: {{nip_pejabat}}
Jabatan: {{jabatan_pejabat}}

Dalam hal ini bertindak untuk dan atas nama instansi, selanjutnya disebut PIHAK PERTAMA.

Nama: {{nama}}
NIP: {{nip}}
Jabatan: {{jabatan}}
Unit Kerja: {{unit_kerja}}

Dalam hal ini disebut PIHAK KEDUA.

Pasal 1
PIHAK KEDUA akan bekerja pada PIHAK PERTAMA terhitung mulai tanggal {{tanggal_mulai}} sampai dengan {{tanggal_selesai}}.

Pasal 2
PIHAK KEDUA akan melaksanakan tugas-tugas sesuai dengan jabatan yang telah ditentukan.

Demikian surat perjanjian ini dibuat untuk dipergunakan sebagaimana mestinya.

{{tanggal_surat}}

PIHAK PERTAMA,

{{nama_pejabat}}
NIP: {{nip_pejabat}}',
  '["{{nama}}", "{{nip}}", "{{jabatan}}", "{{unit_kerja}}", "{{tanggal_lahir}}", "{{alamat}}", "{{tanggal_mulai}}", "{{tanggal_selesai}}", "{{nomor_surat}}", "{{tanggal_surat}}", "{{nama_pejabat}}", "{{nip_pejabat}}", "{{jabatan_pejabat}}"]'::jsonb,
  TRUE,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM hr_document_templates WHERE template_type = 'KONTRAK_PKWT'
);

INSERT INTO hr_document_templates (tenant_id, template_name, template_type, template_content, variables, is_active, version)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'Template Surat Peringatan 1',
  'SP1',
  'SURAT PERINGATAN PERTAMA (SP1)
Nomor: {{nomor_surat}}

Kepada Yth.
Nama: {{nama}}
NIP: {{nip}}
Jabatan: {{jabatan}}
Unit Kerja: {{unit_kerja}}

Berdasarkan hasil evaluasi dan pengawasan terhadap kinerja dan disiplin kerja, dengan ini kami memberikan peringatan pertama kepada Anda karena:

[Keterangan pelanggaran]

Demikian surat peringatan ini disampaikan untuk menjadi perhatian dan segera diperbaiki.

{{tanggal_surat}}

{{nama_pejabat}}
NIP: {{nip_pejabat}}
Jabatan: {{jabatan_pejabat}}',
  '["{{nama}}", "{{nip}}", "{{jabatan}}", "{{unit_kerja}}", "{{nomor_surat}}", "{{tanggal_surat}}", "{{nama_pejabat}}", "{{nip_pejabat}}", "{{jabatan_pejabat}}"]'::jsonb,
  TRUE,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM hr_document_templates WHERE template_type = 'SP1'
);

INSERT INTO hr_document_templates (tenant_id, template_name, template_type, template_content, variables, is_active, version)
SELECT 
  (SELECT id FROM tenants LIMIT 1),
  'Template Surat Mutasi',
  'MUTASI',
  'SURAT PERINTAH MUTASI
Nomor: {{nomor_surat}}

Dasar: [Dasar hukum mutasi]

MEMERINTAHKAN

Kepada:
Nama: {{nama}}
NIP: {{nip}}
Jabatan Lama: {{jabatan}}
Unit Kerja Lama: {{unit_kerja}}

Untuk:
1. Melaksanakan tugas pada jabatan baru di unit kerja baru
2. Melaporkan diri kepada atasan langsung di unit kerja baru paling lambat {{tanggal_mulai}}

Demikian surat perintah mutasi ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.

{{tanggal_surat}}

{{nama_pejabat}}
NIP: {{nip_pejabat}}
Jabatan: {{jabatan_pejabat}}',
  '["{{nama}}", "{{nip}}", "{{jabatan}}", "{{unit_kerja}}", "{{nomor_surat}}", "{{tanggal_mulai}}", "{{tanggal_surat}}", "{{nama_pejabat}}", "{{nip_pejabat}}", "{{jabatan_pejabat}}"]'::jsonb,
  TRUE,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM hr_document_templates WHERE template_type = 'MUTASI'
);
