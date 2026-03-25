# Manual Uji Coba Payroll (Kab. Maluku Tengah)

Tanggal: 16 Maret 2026

## Tujuan
- Menyiapkan data pendukung payroll dan menjalankan uji coba payroll utama.
- Mendokumentasikan hasil uji coba payroll untuk tenant Kab. Maluku Tengah.

## Prasyarat
- Repo berjalan pada `http://127.0.0.1:5173`.
- Kredensial `org_admin_centralized` valid di `ops/test-accounts.local.json`.
- Gunakan `.env.online` (Supabase remote).

## Ringkasan Tenant
- Tenant: Kab. Maluku Tengah
- Tenant ID: `ba7603b1-6827-4370-ae86-2e70dc5b09d5`

## Data Pendukung Payroll

### 1. Backup Supabase (wajib sebelum perubahan data)
```bash
npm run db:backup:supabase
```
Contoh output:
- `/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/artifacts/db-backups/sql/supabase_backup_20260316_154149_manual.sql`

### 2. Sisipkan data absensi uji coba untuk 4 pegawai
```bash
set -a; source .env.online; psql "$SUPABASE_DB_URL" -c "with candidates as (
  select id, office_id
  from employees
  where tenant_id = 'ba7603b1-6827-4370-ae86-2e70dc5b09d5'
    and is_active = true
    and id <> 'b26b1414-618e-43cf-b084-7fd781019281'
    and office_id is not null
  order by created_at desc
  limit 4
), rows as (
  select
    id as employee_id,
    office_id,
    (current_date - 1) as date,
    (current_date - 1)::timestamp + time '08:10' as check_in_time,
    (current_date - 1)::timestamp + time '16:45' as check_out_time,
    'hadir'::attendance_status as status,
    'seed uji coba payroll'::text as notes
  from candidates
), ins as (
  insert into attendance_records_partitioned (
    employee_id,
    office_id,
    date,
    check_in_time,
    check_out_time,
    status,
    notes
  )
  select r.employee_id, r.office_id, r.date, r.check_in_time, r.check_out_time, r.status, r.notes
  from rows r
  where not exists (
    select 1
    from attendance_records_partitioned ar
    where ar.employee_id = r.employee_id and ar.date = r.date
  )
  returning employee_id
)
select count(*) as inserted_rows from ins;"
```

### 3. Buat periode payroll (draft)
```bash
set -a; source .env.online; psql "$SUPABASE_DB_URL" -c "insert into payroll_periods (
  tenant_id,
  period_key,
  period_start,
  period_end,
  cutoff_date,
  status,
  notes
) values (
  'ba7603b1-6827-4370-ae86-2e70dc5b09d5',
  to_char(current_date, 'YYYY-MM'),
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  'draft',
  'seed periode payroll uji coba'
) returning id, period_key, period_start, period_end, status;"
```

## Langkah Uji Coba Payroll

### 1. Preflight sandbox localhost
```bash
npm run ops:sandbox:doctor:strict
```

### 2. Jalankan Playwright payroll smoke
```bash
npm run e2e:hr:payroll:smoke
```

### 3. Jalankan Playwright payroll CRUD
```bash
npm run e2e:hr:payroll:crud
```

## Hasil Uji Coba
- Playwright `payroll-smoke`: 11 tests passed.
- Playwright `payroll-crud`: 7 passed, 2 skipped.
- Skip terjadi pada flow run + approval (dialog Proses Payroll tidak muncul atau akses terbatas).

## Artefak
- Playwright report: `artifacts/playwright-report-hr-payroll-smoke`
- Playwright report: `artifacts/playwright-report-hr-payroll-crud`
- Test results: `test-results/`

## Catatan Risiko
- Data absensi uji coba tersimpan di Supabase remote.
- Jika perlu coverage penuh run + approval, pastikan akses payroll run engine dan approval aktif.
