# Manual Uji Coba HR + Payroll (Kab. Maluku Tengah)

Tanggal: 16 Maret 2026

## Tujuan
- Menyiapkan data absensi untuk 5 pegawai Kab. Maluku Tengah (uji coba payroll).
- Menjalankan Playwright suite HR + Payroll (smoke).
- Mendokumentasikan hasil uji coba.

## Prasyarat
- Repo berjalan pada `http://127.0.0.1:5173`.
- Kredensial `org_admin_centralized` valid di `ops/test-accounts.local.json`.
- Gunakan `.env.online` (Supabase remote).

## Ringkasan Data Test
Tenant:
- Kab. Maluku Tengah
- Tenant ID: `ba7603b1-6827-4370-ae86-2e70dc5b09d5`

Pegawai dengan absensi (5):
- bail — `bailkharisma18@gmail.com` (2026-03-15)
- HIDAYAT KILIAN — `kilianhidayat@gmail.com` (2026-03-15)
- Lisal Faisal — `lisalfaisal@gmail.com` (2026-03-15)
- M. AMIN TUANAYA — `amintuanaya@gmail.com` (2026-03-15)
- Susi — `susibangka78@gmail.com` (2026-03-09)

Catatan:
- Empat absensi dibuat sebagai data uji coba dengan status `hadir` dan waktu 08:10–16:45.

## Langkah Uji Coba

### 1. Backup Supabase (wajib sebelum perubahan data)
```bash
npm run db:backup:supabase
```
Output contoh:
- `/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/artifacts/db-backups/sql/supabase_backup_20260316_150955_manual.sql`

### 2. Sisipkan data absensi untuk 4 pegawai tambahan
Catatan: data disimpan di `attendance_records_partitioned` (sumber `v_attendance_records`).

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

### 3. Verifikasi 5 pegawai muncul di view absensi
```bash
set -a; source .env.online; psql "$SUPABASE_DB_URL" -c "
select e.id, e.name, e.email, max(ar.date) as last_attendance_date
from v_attendance_records ar
join employees e on e.id = ar.employee_id
where e.tenant_id = 'ba7603b1-6827-4370-ae86-2e70dc5b09d5'
group by e.id, e.name, e.email
order by last_attendance_date desc, e.name asc
limit 5;"
```

### 4. Preflight sandbox localhost
```bash
npm run ops:sandbox:doctor:strict
```

### 5. Jalankan Playwright HR + Payroll (smoke)
```bash
npm run e2e:hr:payroll:smoke
```

### 6. Jalankan Playwright HR + Payroll (crud)
```bash
npm run e2e:hr:payroll:crud
```

## Hasil Uji Coba
- `ops:sandbox:doctor:strict`: OK.
- Playwright `payroll-smoke`: 11 tests passed.
- Playwright `payroll-crud`: 7 passed, 2 skipped.
- Skip terjadi karena belum ada periode payroll untuk menjalankan run + approval.

## Perubahan Kode Selama Uji Coba
- Update placeholder agar test sinkron dengan UI:
  - `tests/e2e/org-hr-payroll-smoke.e2e.ts`
  - `tests/e2e/org-hr-payroll-crud.e2e.ts`

## Artefak
- Playwright report: `artifacts/playwright-report-hr-payroll-smoke`
- Test results: `test-results/`

## Catatan Risiko
- Absensi test disisipkan langsung ke Supabase remote (data uji).
- Jika ingin membersihkan data test, lakukan cleanup terkontrol sesuai kebijakan data.
