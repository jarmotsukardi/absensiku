# HR Deployment Checklist

## Tanggal: 2026-03-12
## Status: Review sebelum migrasi remote Supabase

Dokumen ini adalah checklist deploy terbatas untuk perubahan HR yang memang sudah siap dipromosikan.

Checklist ini tidak berarti seluruh domain HR sudah production-ready.
Untuk status produk dan boundary domain, tetap rujuk:
- `docs/panduan_membangun_hr.md`
- `apps/hr/README.md`

## Guardrail utama

- Source of truth database adalah Supabase remote, bukan localhost.
- Sebelum migration penting, wajib jalankan:

```bash
npm run db:backup:supabase
```

- Jangan anggap badge `Tunda` atau `Internal` sebagai error deploy otomatis.
- Route `Tunda` dan `Internal` masih sah selama memang sesuai boundary HR saat ini.
- Jangan deploy dengan asumsi `/org/hr` sudah 100% final hanya karena migration tertentu sudah selesai.

## Pre-deployment

### 1. Verifikasi file migration

```bash
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU
ls -lh supabase/migrations/20260312_*.sql
```

Expected:

```text
20260312_create_hr_approval_types.sql
20260312_enhance_hr_document_templates.sql
20260312_create_hr_leave_management.sql
```

### 2. Backup database remote

```bash
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU
npm run db:backup:supabase
```

Catatan:
- langkah ini wajib sebelum menjalankan migration schema/data HR
- jika backup gagal, jangan lanjut migration

### 3. Jalankan migration ke Supabase remote

Opsi yang disarankan:

```bash
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU
npm run db:migrate:supabase
```

Jika harus manual via Supabase SQL Editor:
- jalankan file migration satu per satu
- verifikasi hasil setiap file sebelum lanjut ke file berikutnya

### 4. Verifikasi tabel dan seed data

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_name IN (
  'hr_approval_types',
  'hr_document_templates',
  'leave_types',
  'leave_quotas'
)
ORDER BY table_name;
```

Expected:
- `hr_approval_types`
- `hr_document_templates`
- `leave_quotas`
- `leave_types`

Verifikasi seed:

```sql
SELECT leave_code, leave_name, max_days_per_year
FROM leave_types
ORDER BY leave_code;
```

### 5. Verifikasi aplikasi

Manual smoke minimum:

```text
1. Buka /org/hr
2. Pastikan halaman inti load tanpa error fatal
3. Uji route yang memang terkait migration ini:
   - /org/hr/leave-types
   - /org/hr/leave-quota
4. Uji alias settings bila relevan:
   - /org/hr/approval-hierarchy -> harus redirect/bridge ke /org/hr/settings sesuai policy saat ini
5. Pastikan data tampil atau empty-state tampil jelas tanpa crash
```

Catatan penting:
- keberadaan badge `Tunda` atau `Internal` tidak otomatis berarti deploy gagal
- yang harus dicek adalah apakah badge itu masih sesuai status route yang disepakati

### 6. Validasi test yang relevan

```bash
cd /Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU
npx playwright test tests/e2e/hr-quick-button-audit.e2e.ts --reporter=list
```

Jika ada suite HR lain yang relevan dengan perubahan:
- jalankan hanya suite terdampak
- jangan klaim seluruh HR selesai hanya dari satu suite audit

## Deployment verification

- [ ] File migration ada
- [ ] Backup Supabase remote berhasil
- [ ] Migration ke Supabase remote berhasil
- [ ] Tabel target terbuat
- [ ] Seed data target terisi
- [ ] RLS policies aktif
- [ ] Route inti HR yang terdampak migration load tanpa error fatal
- [ ] Route bridge/alias tetap berperilaku sesuai policy saat ini
- [ ] Badge `Tunda` dan `Internal` masih konsisten dengan status route
- [ ] Test terdampak lulus

## Post-deployment

- cek log Supabase
- cek error aplikasi untuk route HR terdampak
- cek apakah ada query yang gagal karena tabel/policy baru
- cek apakah empty-state, loading-state, dan error-state tetap jelas

## Jangan disimpulkan dari checklist ini

Checklist ini tidak boleh dipakai untuk menyatakan:
- seluruh `/org/hr` sudah final
- seluruh `/admin/hr` sudah final
- semua badge `Tunda`/`Internal` harus hilang
- domain HR sudah lepas sepenuhnya dari boundary absensi

## Referensi

- `docs/panduan_membangun_hr.md`
- `docs/DEPLOY-HR-MIGRATION-GUIDE.md`
- `docs/archive/2026-03-historical/HR-STATUS-FINAL-SUMMARY.md`
- `apps/hr/README.md`
