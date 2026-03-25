# SQL Verifikasi Pasca-Migration Payroll Remote

## Tujuan

File ini berisi query siap copy-paste ke Supabase SQL Editor setelah migration payroll remote selesai dijalankan.

Target remote:

- `zrhgqpjbeyzwpgywelcr`

## 1. Cek Tabel Payroll Inti

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

- 11 baris kembali

## 2. Cek RLS Aktif

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
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
ORDER BY tablename;
```

Expected:

- semua `rowsecurity = true`

## 3. Cek Policy Payroll

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
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
ORDER BY tablename, policyname, cmd;
```

Expected:

- policy read/write tenant tersedia untuk tabel payroll inti

## 4. Cek Foreign Key Kritis

```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS referenced_table_name,
  ccu.column_name AS referenced_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
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
ORDER BY tc.table_name, kcu.column_name;
```

Expected minimal:

- `payroll_variable_inputs.period_id -> payroll_periods.id`
- `payroll_runs.period_id -> payroll_periods.id`
- `payroll_approvals.run_id -> payroll_runs.id`
- `payroll_slips.run_id -> payroll_runs.id`
- `payroll_payment_batches.run_id -> payroll_runs.id`
- `payroll_tax_filings.run_id -> payroll_runs.id` atau nullable FK yang valid
- `payroll_report_snapshots.run_id -> payroll_runs.id` atau nullable FK yang valid
- `payroll_audit_logs.run_id -> payroll_runs.id` atau nullable FK yang valid

## 5. Cek Index Penting

```sql
SELECT
  tablename,
  indexname
FROM pg_indexes
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
ORDER BY tablename, indexname;
```

Checklist minimum:

- [ ] ada index trace/status utama
- [ ] ada index tenant + created_at atau tenant + status
- [ ] ada unique index yang sesuai untuk `payroll_runs`, `payroll_approvals`, `payroll_slips`, `payroll_payment_batches`

## 6. Cek Kolom Patch Audit Log Payroll

```sql
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_audit_logs'
  AND column_name IN (
    'severity',
    'status',
    'source_route',
    'resolved_at',
    'resolved_by',
    'resolution_note',
    'archived_at',
    'archived_by',
    'archive_note'
  )
ORDER BY column_name;
```

Expected:

- semua kolom patch audit log muncul

## 7. Smoke Row Count

```sql
SELECT 'payroll_income_components' AS table_name, count(*) AS row_count FROM public.payroll_income_components
UNION ALL
SELECT 'payroll_deduction_components', count(*) FROM public.payroll_deduction_components
UNION ALL
SELECT 'payroll_variable_inputs', count(*) FROM public.payroll_variable_inputs
UNION ALL
SELECT 'payroll_runs', count(*) FROM public.payroll_runs
UNION ALL
SELECT 'payroll_approvals', count(*) FROM public.payroll_approvals
UNION ALL
SELECT 'payroll_slips', count(*) FROM public.payroll_slips
UNION ALL
SELECT 'payroll_payment_batches', count(*) FROM public.payroll_payment_batches
UNION ALL
SELECT 'payroll_tax_filings', count(*) FROM public.payroll_tax_filings
UNION ALL
SELECT 'payroll_report_snapshots', count(*) FROM public.payroll_report_snapshots
UNION ALL
SELECT 'payroll_audit_logs', count(*) FROM public.payroll_audit_logs
UNION ALL
SELECT 'payroll_role_assignments', count(*) FROM public.payroll_role_assignments
ORDER BY table_name;
```

Catatan:

- count `0` masih valid
- yang penting tabel bisa diquery tanpa `PGRST205`

## 8. Cek Tabel Inti Yang Sebelumnya Error

```sql
SELECT to_regclass('public.payroll_variable_inputs') AS payroll_variable_inputs;
SELECT to_regclass('public.payroll_runs') AS payroll_runs;
SELECT to_regclass('public.payroll_approvals') AS payroll_approvals;
SELECT to_regclass('public.payroll_slips') AS payroll_slips;
SELECT to_regclass('public.payroll_role_assignments') AS payroll_role_assignments;
```

Expected:

- semua hasil bukan `null`

## 9. Kesimpulan Manual

Checklist operator:

- [ ] semua tabel payroll inti ada
- [ ] RLS aktif
- [ ] policy payroll ada
- [ ] FK inti valid
- [ ] index inti valid
- [ ] patch kolom audit log payroll sudah masuk
- [ ] query ke tabel yang sebelumnya `PGRST205` sekarang berhasil

## Referensi

- [panduan-sinkronisasi-migration-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/panduan-sinkronisasi-migration-payroll-remote-2026-03-12.md:1)
- [checklist-operator-sinkronisasi-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/checklist-operator-sinkronisasi-payroll-remote-2026-03-12.md:1)
