# Runbook Final Sinkronisasi Payroll Remote

## Target

- Project: `zrhgqpjbeyzwpgywelcr`
- Scope: sinkronisasi schema payroll remote yang tertinggal

## Rule

- Jangan jalankan jika project target bukan `zrhgqpjbeyzwpgywelcr`
- Jangan jalankan tanpa backup
- Jangan lanjut ke langkah berikutnya jika langkah sekarang gagal

## Step 1. Cek Env Target

Command:

```bash
cat .env.local | rg 'VITE_SUPABASE_PROJECT_ID|VITE_SUPABASE_URL'
```

Expected:

- muncul `VITE_SUPABASE_PROJECT_ID=zrhgqpjbeyzwpgywelcr`
- URL mengarah ke `https://zrhgqpjbeyzwpgywelcr.supabase.co`

Jika gagal:

- hentikan proses
- perbaiki env target dulu

## Step 2. Backup Wajib

Command:

```bash
npm run db:backup:supabase
```

Expected:

- command sukses
- file backup SQL lokal berhasil dibuat

Jika gagal:

- jangan jalankan migration
- cek kredensial/env Supabase
- jika `.env.local` belum punya `SUPABASE_DB_PASSWORD`, siapkan kredensial DB remote atau `DATABASE_URL`
- ulangi backup sampai berhasil

## Step 3. Jalankan Migration Repo

Command:

```bash
export SUPABASE_DB_PASSWORD='[PASSWORD]'
export DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.zrhgqpjbeyzwpgywelcr.supabase.co:5432/postgres"
supabase db push --db-url "$DATABASE_URL" --dry-run
supabase db push --db-url "$DATABASE_URL"
```

Expected:

- dry-run bisa menampilkan migration yang akan dipush ke remote
- push remote selesai tanpa error fatal
- batch payroll berikut ikut tersinkron:
  - `20260224113000_hr_payroll_phase2_components.sql`
  - `20260224123000_hr_payroll_phase2_engine_flow.sql`
  - `20260224133000_hr_payroll_phase3_distribution_payment.sql`
  - `20260224143000_hr_payroll_phase3_tax_reports_audit.sql`
  - `20260224152000_hr_payroll_phase4_role_assignments.sql`
  - `20260225021000_payroll_errorlog_columns.sql`
  - `20260225075000_payroll_audit_log_state_columns.sql`

Jika gagal:

- hentikan proses
- simpan log output CLI
- jangan lanjut ke test runtime
- cek apakah failure terjadi karena password DB remote, `DATABASE_URL`, konflik schema, atau migration order

Catatan:

- jangan pakai `npm run db:migrate:supabase` untuk remote
- script itu memakai `scripts/dev-db-runner.mjs` dan menarget Docker lokal
- jangan andalkan linked CLI selama auth temp role masih gagal

## Step 4. Verifikasi SQL

Action:

- buka Supabase SQL Editor
- copy query dari file berikut:
  - [sql-verifikasi-pasca-migration-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/sql-verifikasi-pasca-migration-payroll-remote-2026-03-12.md:1)

Expected:

- 11 tabel payroll inti muncul
- RLS aktif
- policy payroll ada
- tabel yang sebelumnya `PGRST205` sekarang bukan `null`

Jika gagal:

- hentikan proses
- jangan lanjut ke test Playwright
- identifikasi tabel mana yang masih hilang atau policy mana yang belum terpasang

## Step 5. Verifikasi Runtime Minimum

Halaman yang dicek:

- `/org/payroll/variable-input`
- `/org/payroll/run-engine`
- `/org/payroll/approval`
- `/org/payroll/slips`
- `/org/payroll/payment`
- `/org/payroll/reports`
- `/org/payroll/tax-compliance`
- `/org/payroll/roles`

Expected:

- tidak ada `PGRST205`
- tidak ada banner fatal karena tabel payroll inti hilang

Jika gagal:

- catat route yang gagal
- catat pesan error dan ref id
- cek kembali hasil SQL verifikasi untuk tabel terkait

## Step 6. Jalankan Validasi Test

Command:

```bash
npx playwright test tests/e2e/org-hr-payroll-smoke.e2e.ts
npx playwright test tests/e2e/org-hr-payroll-crud.e2e.ts
npx playwright test tests/e2e/org-payroll-partial-failure.e2e.ts
```

Expected:

- smoke pass
- CRUD pass
- partial-failure pass pada scope yang sudah didukung remote

Jika gagal:

- jangan asumsikan bug frontend
- cocokkan test failure dengan schema/table yang baru disinkron
- prioritaskan error `PGRST205`, missing policy, atau relasi FK yang masih patah

## Done Condition

Proses dianggap selesai jika:

- env target benar
- backup berhasil
- migration repo sukses
- SQL verifikasi lolos
- runtime minimum lolos
- suite Playwright relevan lolos

## Referensi

- [checklist-operator-sinkronisasi-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/checklist-operator-sinkronisasi-payroll-remote-2026-03-12.md:1)
- [panduan-sinkronisasi-migration-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/panduan-sinkronisasi-migration-payroll-remote-2026-03-12.md:1)
- [sql-verifikasi-pasca-migration-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/sql-verifikasi-pasca-migration-payroll-remote-2026-03-12.md:1)
