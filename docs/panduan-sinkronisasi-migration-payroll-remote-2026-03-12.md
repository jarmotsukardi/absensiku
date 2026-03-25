# Panduan Sinkronisasi Migration Payroll Remote

## Tanggal

2026-03-12

## Konteks

Project Supabase remote aktif untuk repo ini adalah `zrhgqpjbeyzwpgywelcr`.

Hasil audit menunjukkan remote belum sinkron dengan migration payroll lokal. Gejalanya:

- halaman payroll tertentu memunculkan `PGRST205`
- tabel inti payroll lanjutan belum ada di schema cache remote
- test partial-failure untuk beberapa halaman payroll menjadi misleading karena tabel utama belum tersedia

Dokumen ini tidak menjalankan deploy. Dokumen ini hanya menetapkan urutan eksekusi resmi repo yang aman.

## Temuan Audit Remote

Tabel payroll yang sudah ada di remote:

- `payroll_policies`
- `payroll_periods`
- `payroll_validation_runs`

Tabel payroll yang belum ada di remote:

- `payroll_income_components`
- `payroll_deduction_components`
- `payroll_variable_inputs`
- `payroll_runs`
- `payroll_approvals`
- `payroll_slips`
- `payroll_payment_batches`
- `payroll_tax_filings`
- `payroll_report_snapshots`
- `payroll_audit_logs`
- `payroll_role_assignments`

Implikasi langsung:

- `/org/payroll/approval` belum bisa stabil selama `payroll_approvals` dan `payroll_runs` belum ada
- `/org/payroll/slips` belum bisa stabil selama `payroll_slips` belum ada
- `/org/payroll/variable-input` belum bisa stabil selama `payroll_variable_inputs` belum ada
- guard dan assignment payroll belum final selama `payroll_role_assignments` belum ada

## Guardrail Wajib

Sebelum menjalankan migration apa pun ke remote:

```bash
npm run db:backup:supabase
```

Jangan pakai localhost DB sebagai default.

Jangan lompat langsung ke migration phase akhir. Terapkan berurutan.

Gunakan workflow remote yang aman:

```bash
supabase db push --db-url "postgresql://postgres:[PASSWORD]@db.zrhgqpjbeyzwpgywelcr.supabase.co:5432/postgres"
```

Catatan penting:

- `npm run db:migrate:supabase` di repo ini menjalankan `scripts/dev-db-runner.mjs`
- runner tersebut memakai Docker Compose lokal, bukan remote Supabase
- jadi command itu tidak boleh dipakai sebagai eksekusi migration remote
- `supabase migration list --linked` berhasil untuk membaca linked project
- tetapi `supabase db dump --linked --dry-run` dan `supabase db push --linked --dry-run` gagal auth temp role pada audit tanggal 2026-03-12
- selama linked CLI belum sehat, prioritaskan jalur direct DB credential

## Command Sequence Operator

Urutan command yang dipakai operator:

```bash
# 1. pastikan project env mengarah ke remote aktif
cat .env.local | rg 'VITE_SUPABASE_PROJECT_ID|VITE_SUPABASE_URL'

# 2. backup wajib sebelum migration
npm run db:backup:supabase

# 3. siapkan direct db url atau password
export SUPABASE_DB_PASSWORD='[PASSWORD]'
export DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.zrhgqpjbeyzwpgywelcr.supabase.co:5432/postgres"

# 4. dry-run remote migration via direct credential
supabase db push --db-url "$DATABASE_URL" --dry-run

# 5. baru jalankan push ke remote
supabase db push --db-url "$DATABASE_URL"

# 6. setelah migration, lanjut verifikasi runtime/test seperlunya
npx playwright test tests/e2e/org-hr-payroll-smoke.e2e.ts
npx playwright test tests/e2e/org-hr-payroll-crud.e2e.ts
npx playwright test tests/e2e/org-payroll-partial-failure.e2e.ts
```

## Batch Migration Wajib

Urutan aman yang harus tersedia di remote adalah:

1. `20260224113000_hr_payroll_phase2_components.sql`
2. `20260224123000_hr_payroll_phase2_engine_flow.sql`
3. `20260224133000_hr_payroll_phase3_distribution_payment.sql`
4. `20260224143000_hr_payroll_phase3_tax_reports_audit.sql`
5. `20260224152000_hr_payroll_phase4_role_assignments.sql`
6. `20260225021000_payroll_errorlog_columns.sql`
7. `20260225075000_payroll_audit_log_state_columns.sql`

## Kenapa Urutannya Begitu

`20260224113000_hr_payroll_phase2_components.sql`

- membuat `payroll_income_components`
- membuat `payroll_deduction_components`
- aman dijalankan lebih dulu karena hanya bergantung pada `tenants`

`20260224123000_hr_payroll_phase2_engine_flow.sql`

- membuat `payroll_variable_inputs`
- membuat `payroll_runs`
- membuat `payroll_approvals`
- bergantung pada `payroll_periods` yang sudah ada di remote

`20260224133000_hr_payroll_phase3_distribution_payment.sql`

- membuat `payroll_slips`
- membuat `payroll_payment_batches`
- bergantung pada `payroll_runs`

`20260224143000_hr_payroll_phase3_tax_reports_audit.sql`

- membuat `payroll_tax_filings`
- membuat `payroll_report_snapshots`
- membuat `payroll_audit_logs`
- sebagian relasinya bergantung pada `payroll_runs` dan `payroll_periods`

`20260224152000_hr_payroll_phase4_role_assignments.sql`

- membuat `payroll_role_assignments`
- dipakai untuk guard akses payroll yang lebih presisi

`20260225021000_payroll_errorlog_columns.sql`

- menambah kolom triase ke `payroll_audit_logs`
- hanya berguna setelah `payroll_audit_logs` sudah dibuat

`20260225075000_payroll_audit_log_state_columns.sql`

- menambah state lanjutan untuk `payroll_audit_logs`
- harus setelah `payroll_audit_logs` dan aman setelah patch `20260225021000`

## Checklist Eksekusi

### 1. Backup

```bash
npm run db:backup:supabase
```

Checklist:

- [ ] backup SQL lokal berhasil dibuat
- [ ] project target adalah `zrhgqpjbeyzwpgywelcr`
- [ ] tidak ada deploy lain yang sedang berjalan

### 2. Sinkronkan Migration

Gunakan workflow remote:

```bash
supabase db push --db-url "$DATABASE_URL"
```

Sebelum push ke remote, jalankan:

```bash
supabase db push --db-url "$DATABASE_URL" --dry-run
```

Jika dry-run gagal, jangan lanjut.

Saat push ke remote dijalankan, pastikan batch berikut memang ikut terbawa:

- [ ] `20260224113000_hr_payroll_phase2_components.sql`
- [ ] `20260224123000_hr_payroll_phase2_engine_flow.sql`
- [ ] `20260224133000_hr_payroll_phase3_distribution_payment.sql`
- [ ] `20260224143000_hr_payroll_phase3_tax_reports_audit.sql`
- [ ] `20260224152000_hr_payroll_phase4_role_assignments.sql`
- [ ] `20260225021000_payroll_errorlog_columns.sql`
- [ ] `20260225075000_payroll_audit_log_state_columns.sql`

### 3. Verifikasi Schema Setelah Migration

Verifikasi minimum:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'payroll_income_components',
    'payroll_deduction_components',
    'payroll_variable_inputs',
    'payroll_runs',
    'payroll_approvals',
    'payroll_slips',
    'payroll_payment_batches',
    'payroll_tax_filings',
    'payroll_report_snapshots',
    'payroll_audit_logs',
    'payroll_role_assignments'
  )
ORDER BY table_name;
```

Expected:

- semua tabel di atas muncul

Verifikasi index/policy inti:

```sql
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'payroll_variable_inputs',
    'payroll_runs',
    'payroll_approvals',
    'payroll_slips',
    'payroll_payment_batches',
    'payroll_tax_filings',
    'payroll_report_snapshots',
    'payroll_audit_logs',
    'payroll_role_assignments'
  )
ORDER BY tablename, policyname;
```

Expected:

- policy tenant read/write tersedia untuk tabel payroll inti

### 4. Verifikasi Runtime Minimum

Setelah schema lengkap, halaman berikut minimal harus bisa dibuka tanpa `PGRST205`:

- [ ] `/org/payroll/variable-input`
- [ ] `/org/payroll/run-engine`
- [ ] `/org/payroll/approval`
- [ ] `/org/payroll/slips`
- [ ] `/org/payroll/payment`
- [ ] `/org/payroll/reports`
- [ ] `/org/payroll/tax-compliance`
- [ ] `/org/payroll/roles`

### 5. Verifikasi Test

Setelah migration remote selesai, jalankan validasi yang relevan:

```bash
npx playwright test tests/e2e/org-hr-payroll-smoke.e2e.ts
npx playwright test tests/e2e/org-hr-payroll-crud.e2e.ts
npx playwright test tests/e2e/org-payroll-partial-failure.e2e.ts
```

Catatan:

- sebelum schema remote lengkap, `org-payroll-partial-failure` hanya valid untuk subset halaman yang tabel utamanya memang ada
- setelah schema lengkap, suite ini bisa diperluas lagi ke `approval`, `slips`, dan `variable-input`

## Apa Yang Tidak Perlu Diulang

Jangan ulang migration phase-1 mentah-mentah hanya karena nama migration remote berbeda.

Alasannya:

- remote sudah punya hasil setara phase-1
- tabel `hr_contracts`, `payroll_policies`, `payroll_periods`, dan `payroll_validation_runs` sudah ada
- fokus gap saat ini adalah phase-2, phase-3, phase-4, dan patch audit log payroll

## Risiko Tersisa

- selama migration payroll lanjutan belum masuk remote, UI payroll tertentu akan tetap menampilkan banner fatal
- test CRUD payroll pada beberapa halaman akan terus fallback atau gagal karena schema remote belum lengkap
- audit partial-failure akan menghasilkan false signal jika dipaksa pada halaman yang tabel utamanya belum ada

## Output Yang Diharapkan Setelah Sinkron

Jika sinkronisasi berhasil, maka:

- error `PGRST205` untuk tabel payroll inti hilang
- halaman payroll yang sebelumnya fatal bisa masuk ke mode runtime normal
- suite payroll bisa diperluas dari smoke/fallback menjadi coverage CRUD dan partial-failure yang lebih lengkap
- guard akses payroll berbasis `payroll_role_assignments` bisa divalidasi penuh
