# Checklist Operator Sinkronisasi Payroll Remote

## Target

- Project Supabase: `zrhgqpjbeyzwpgywelcr`
- Tujuan: melengkapi schema payroll remote yang masih tertinggal

## Stop Condition

Jangan lanjut jika salah satu kondisi ini belum benar:

- [ ] project target bukan `zrhgqpjbeyzwpgywelcr`
- [ ] backup SQL belum dibuat
- [ ] ada deploy atau migration lain yang sedang berjalan
- [ ] `SUPABASE_DB_PASSWORD` atau `DATABASE_URL` remote belum siap
- [ ] `supabase db push --db-url "$DATABASE_URL" --dry-run` masih gagal

## Langkah 1. Backup Wajib

Jalankan:

```bash
npm run db:backup:supabase
```

Checklist:

- [ ] command sukses
- [ ] file backup SQL lokal berhasil dibuat
- [ ] backup disimpan sebelum migration dijalankan
- [ ] `SUPABASE_DB_PASSWORD` tersedia atau `DATABASE_URL` remote siap

## Langkah 2. Dry-Run Mental Checklist

Pastikan gap yang memang ingin ditutup adalah tabel berikut:

- [ ] `payroll_income_components`
- [ ] `payroll_deduction_components`
- [ ] `payroll_variable_inputs`
- [ ] `payroll_runs`
- [ ] `payroll_approvals`
- [ ] `payroll_slips`
- [ ] `payroll_payment_batches`
- [ ] `payroll_tax_filings`
- [ ] `payroll_report_snapshots`
- [ ] `payroll_audit_logs`
- [ ] `payroll_role_assignments`

## Langkah 3. Eksekusi Workflow Repo

Jalankan:

```bash
export SUPABASE_DB_PASSWORD='[PASSWORD]'
export DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.zrhgqpjbeyzwpgywelcr.supabase.co:5432/postgres"
supabase db push --db-url "$DATABASE_URL" --dry-run
supabase db push --db-url "$DATABASE_URL"
```

Batch yang harus ikut terbawa:

- [ ] `20260224113000_hr_payroll_phase2_components.sql`
- [ ] `20260224123000_hr_payroll_phase2_engine_flow.sql`
- [ ] `20260224133000_hr_payroll_phase3_distribution_payment.sql`
- [ ] `20260224143000_hr_payroll_phase3_tax_reports_audit.sql`
- [ ] `20260224152000_hr_payroll_phase4_role_assignments.sql`
- [ ] `20260225021000_payroll_errorlog_columns.sql`
- [ ] `20260225075000_payroll_audit_log_state_columns.sql`

Catatan:

- jangan pakai `npm run db:migrate:supabase` untuk remote
- script repo itu menjalankan Docker lokal, bukan remote Supabase
- jangan andalkan linked CLI selama auth temp role masih gagal

## Langkah 4. Verifikasi Schema

Jalankan query ini di SQL Editor:

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

Checklist:

- [ ] semua tabel muncul
- [ ] tidak ada lagi tabel payroll inti yang hilang

## Langkah 5. Verifikasi Runtime Minimum

Setelah migration selesai, cek halaman berikut:

- [ ] `/org/payroll/variable-input`
- [ ] `/org/payroll/run-engine`
- [ ] `/org/payroll/approval`
- [ ] `/org/payroll/slips`
- [ ] `/org/payroll/payment`
- [ ] `/org/payroll/reports`
- [ ] `/org/payroll/tax-compliance`
- [ ] `/org/payroll/roles`

Ekspektasi:

- [ ] tidak ada `PGRST205`
- [ ] tidak ada banner fatal karena tabel payroll inti hilang

## Langkah 6. Validasi Test

Jalankan:

```bash
npx playwright test tests/e2e/org-hr-payroll-smoke.e2e.ts
npx playwright test tests/e2e/org-hr-payroll-crud.e2e.ts
npx playwright test tests/e2e/org-payroll-partial-failure.e2e.ts
```

Checklist:

- [ ] smoke pass
- [ ] CRUD pass
- [ ] partial-failure pass atau setidaknya bisa diperluas ke halaman yang sebelumnya terblokir schema

## Referensi Dokumen Lengkap

Gunakan dokumen ini untuk konteks lengkap dan alasan urutan migration:

- [runbook-final-sinkronisasi-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/runbook-final-sinkronisasi-payroll-remote-2026-03-12.md:1)
- [panduan-sinkronisasi-migration-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/panduan-sinkronisasi-migration-payroll-remote-2026-03-12.md:1)
- [sql-verifikasi-pasca-migration-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/sql-verifikasi-pasca-migration-payroll-remote-2026-03-12.md:1)
