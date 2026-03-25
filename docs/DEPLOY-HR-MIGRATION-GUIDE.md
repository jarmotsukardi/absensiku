# Panduan Deploy Migration HR

## Tujuan

Dokumen ini menjelaskan cara menjalankan migration HR ke Supabase remote dengan aman.

Dokumen ini tidak menyatakan seluruh modul HR sudah selesai.
Migration hanya mencakup bagian schema/data yang memang sudah siap diterapkan.

## Guardrail wajib

### 1. Gunakan Supabase remote

- source of truth adalah database Supabase remote
- jangan jadikan localhost sebagai target migration default

### 2. Backup dulu

Sebelum migration penting:

```bash
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU
npm run db:backup:supabase
```

Jika backup gagal, hentikan proses.

### 3. Gunakan workflow repo

Jalankan migration resmi repo:

```bash
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU
npm run db:migrate:supabase
```

Jangan mengandalkan script `.bat` yang tidak ada di repo.

## Migration yang dicakup

- `20260312_create_hr_approval_types.sql`
- `20260312_enhance_hr_document_templates.sql`
- `20260312_create_hr_leave_management.sql`

## Verifikasi database

### Tabel

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'hr_approval_types',
    'hr_document_templates',
    'leave_types',
    'leave_quotas'
  )
ORDER BY table_name;
```

### Seed data

```sql
SELECT leave_code, leave_name, max_days_per_year
FROM leave_types
ORDER BY leave_code;
```

### Policy

```sql
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN (
  'hr_approval_types',
  'leave_types',
  'leave_quotas'
)
ORDER BY tablename, policyname;
```

## Verifikasi aplikasi

Setelah migration:

```text
1. Buka /org/hr/leave-types
2. Buka /org/hr/leave-quota
3. Pastikan keduanya tidak crash
4. Jika data kosong, pastikan empty-state jelas
5. Buka /org/hr/approval-hierarchy dan pastikan route mengikuti policy saat ini
```

Catatan:
- `/org/hr/approval-hierarchy` saat ini adalah alias/bridge ke pengaturan HR, bukan halaman mandiri final
- badge `Tunda` atau `Internal` yang masih ada tidak otomatis menandakan migration gagal

## Re-run test yang relevan

```bash
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU
npx playwright test tests/e2e/hr-quick-button-audit.e2e.ts --reporter=list
```

Jika ada test HR lain yang memang terdampak migration ini, jalankan juga suite terkait.

## Troubleshooting

### Relation already exists

Jangan langsung drop tabel produksi.
Pastikan dulu:
- migration sudah pernah dijalankan atau belum
- schema saat ini cocok atau drift
- apakah perlu migration korektif, bukan drop manual

### Permission denied

- cek koneksi remote Supabase
- cek role yang dipakai untuk migration
- cek policy dan hak akses ke schema target

### Route masih tidak menampilkan data

- cek apakah migration benar-benar sukses
- cek seed data
- cek RLS policy
- cek query frontend dan error log

## Referensi

- `docs/HR-DEPLOYMENT-CHECKLIST.md`
- `docs/archive/2026-03-historical/HR-STATUS-FINAL-SUMMARY.md`
- `docs/panduan_membangun_hr.md`
