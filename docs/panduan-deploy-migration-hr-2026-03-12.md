# Panduan Deploy Database Migration HR

## Tanggal: 2026-03-12

### Ringkasan

Dokumen ini berisi panduan untuk menjalankan migration database untuk 4 fitur baru HR:
1. Hierarki Persetujuan (Approval Hierarchy)
2. Template Dokumen
3. Status Kepegawaian
4. Riwayat Jabatan

---

## 1. FILE MIGRATION

### **File 1: `20260312_create_hr_approval_types.sql`**

**Tujuan:** Membuat tabel `hr_approval_types` untuk konfigurasi hierarki approval.

**Isi:**
- CREATE TABLE `hr_approval_types`
- Indexes untuk performa
- Trigger auto-update `updated_at`
- RLS policies (admin, super_admin, operator)
- Seed data (5 jenis approval: LEAVE, WFH, OVERTIME, MUTATION, OTHER)

### **File 2: `20260312_enhance_hr_document_templates.sql`**

**Tujuan:** Memastikan tabel `hr_document_templates` memiliki fields yang diperlukan.

**Isi:**
- CREATE TABLE IF NOT EXISTS `hr_document_templates`
- Indexes untuk performa
- Trigger auto-update `updated_at`
- RLS policies (admin, super_admin, operator)
- Seed data (3 template: Kontrak PKWT, SP1, Surat Mutasi)

---

## 2. CARA MENJALANKAN MIGRATION

### **Opsi 1: Via Supabase Dashboard (Recommended)**

1. Login ke **Supabase Dashboard** (https://supabase.com)
2. Pilih project Anda
3. Buka **SQL Editor** (di sidebar kiri)
4. Klik **New Query**
5. Copy-paste isi file `20260312_create_hr_approval_types.sql`
6. Klik **Run** atau tekan `Ctrl+Enter`
7. Pastikan tidak ada error
8. Ulangi untuk file `20260312_enhance_hr_document_templates.sql`

### **Opsi 2: Via Supabase CLI**

```bash
# Install Supabase CLI jika belum
npm install -g supabase

# Login ke Supabase
supabase login

# Link ke project Anda
supabase link --project-ref [YOUR_PROJECT_REF]

# Jalankan migration
supabase db push
```

### **Opsi 3: Via psql (Advanced)**

```bash
# Export database URL dari Supabase Dashboard
# Settings → Database → Connection string → URI

# Jalankan migration
psql [DATABASE_URL] -f supabase/migrations/20260312_create_hr_approval_types.sql
psql [DATABASE_URL] -f supabase/migrations/20260312_enhance_hr_document_templates.sql
```

---

## 3. VERIFIKASI SETELAH MIGRATION

### **Cek Tabel `hr_approval_types`**

```sql
-- Cek apakah tabel ada
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'hr_approval_types';

-- Cek struktur tabel
\d hr_approval_types

-- Cek data seed
SELECT id, type_name, type_code, is_active, jsonb_array_length(levels) as level_count
FROM hr_approval_types
ORDER BY type_name;
```

**Expected Result:**
```
 type_name       | type_code | is_active | level_count
-----------------+-----------+-----------+-------------
 Cuti dan Izin   | LEAVE     | t         | 3
 WFH             | WFH       | t         | 1
 Lembur          | OVERTIME  | t         | 2
 Mutasi          | MUTATION  | t         | 3
```

### **Cek Tabel `hr_document_templates`**

```sql
-- Cek apakah tabel ada
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'hr_document_templates';

-- Cek struktur tabel
\d hr_document_templates

-- Cek data seed
SELECT id, template_name, template_type, version, is_active
FROM hr_document_templates
ORDER BY template_name;
```

**Expected Result:**
```
 template_name          | template_type | version | is_active
------------------------+---------------+---------+-----------
 Template Kontrak PKWT  | KONTRAK_PKWT  | 1       | t
 Template Surat Mutasi  | MUTASI        | 1       | t
 Template Surat Peringatan 1 | SP1      | 1       | t
```

### **Cek RLS Policies**

```sql
-- Cek policies untuk hr_approval_types
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'hr_approval_types';

-- Cek policies untuk hr_document_templates
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'hr_document_templates';
```

**Expected Result:**
- 3 policies per tabel (admin_instansi, super_admin, operator_hr)

---

## 4. TESTING SETELAH MIGRATION

### **Test 1: Insert Approval Hierarchy Baru**

```sql
-- Test insert manual (jika seed data belum ada)
INSERT INTO hr_approval_types (tenant_id, type_name, type_code, is_active, levels)
VALUES (
  (SELECT id FROM tenants LIMIT 1),
  'Test Approval',
  'TEST',
  TRUE,
  '[
    {"level_order": 1, "approver_role": "atasan_langsung", "sla_hours": 24, "notes": "Test level 1"}
  ]'::jsonb
);

-- Verify
SELECT type_name, type_code, is_active FROM hr_approval_types WHERE type_code = 'TEST';

-- Cleanup
DELETE FROM hr_approval_types WHERE type_code = 'TEST';
```

### **Test 2: Insert Document Template Baru**

```sql
-- Test insert manual
INSERT INTO hr_document_templates (tenant_id, template_name, template_type, template_content, variables, is_active, version)
VALUES (
  (SELECT id FROM tenants LIMIT 1),
  'Test Template',
  'LAINNYA',
  'Test content dengan {{nama}}',
  '["{{nama}}"]'::jsonb,
  TRUE,
  1
);

-- Verify
SELECT template_name, template_type, version FROM hr_document_templates WHERE template_type = 'LAINNYA' AND template_name = 'Test Template';

-- Cleanup
DELETE FROM hr_document_templates WHERE template_name = 'Test Template';
```

### **Test 3: RLS Policy**

```sql
-- Test RLS (harus login sebagai user dengan role admin_instansi)
-- Setelah login, coba:
SELECT COUNT(*) FROM hr_approval_types;
SELECT COUNT(*) FROM hr_document_templates;

-- Harus return count > 0 jika RLS berhasil
```

---

## 5. TROUBLESHOOTING

### **Error: "relation already exists"**

**Solusi:** Tabel sudah ada, skip CREATE TABLE atau gunakan `CREATE TABLE IF NOT EXISTS`.

### **Error: "permission denied"**

**Solusi:** Pastikan Anda login sebagai user dengan role `service_role` atau `admin_instansi`.

### **Error: "tenant_id violates foreign key constraint"**

**Solusi:** Pastikan tenant sudah ada di tabel `tenants` sebelum insert data.

### **Seed data tidak muncul**

**Solusi:** Cek WHERE NOT EXISTS clause - mungkin data sudah ada. Jalankan manual INSERT tanpa WHERE clause.

---

## 6. NEXT STEPS SETELAH MIGRATION

1. ✅ **Verifikasi migration berhasil** (lihat section 3)
2. ✅ **Test aplikasi** - buka halaman:
   - `/org/hr/approval-hierarchy`
   - `/org/hr/document-templates`
   - `/org/hr/employee-status`
   - `/org/hr/job-history`
3. ✅ **Test CRUD operations** untuk approval hierarchy dan document templates
4. ✅ **Update FAQ HR** dengan 4 fitur baru
5. ✅ **Deploy ke production** (jika testing sukses)

---

## 7. BACKUP SEBELUM MIGRATION

**PENTING:** Backup database sebelum menjalankan migration!

```bash
# Via Supabase Dashboard
# Settings → Database → Backup → Create Backup

# Via pg_dump
pg_dump [DATABASE_URL] > backup_before_hr_migration_20260312.sql
```

---

## 8. ROLLBACK (Jika Ada Masalah)

```sql
-- Drop tables (HANYA JIKA DARURAT!)
DROP TABLE IF EXISTS hr_approval_types CASCADE;
DROP TABLE IF EXISTS hr_document_templates CASCADE;

-- Atau rollback ke backup sebelumnya
psql [DATABASE_URL] < backup_before_hr_migration_20260312.sql
```

---

## 9. KONTAK SUPPORT

Jika ada masalah:
1. Cek error message di Supabase Dashboard → Logs
2. Sertakan query SQL yang dijalankan
3. Sertakan screenshot error (jika ada)

---

**File Terkait:**
- `supabase/migrations/20260312_create_hr_approval_types.sql`
- `supabase/migrations/20260312_enhance_hr_document_templates.sql`
- `docs/archive/agent-memory/qwen-2026-03-12/memory/tasks/implementasi-4-menu-baru-hr-2026-03-12.md`

**Tanggal Migration:** 2026-03-12
**Status:** ✅ Siap dijalankan
