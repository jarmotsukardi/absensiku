# Template Env Operator Payroll Remote

## Tujuan

Template ini dipakai operator saat akan menjalankan backup dan migration payroll ke remote Supabase.

Target:

- project `zrhgqpjbeyzwpgywelcr`

## Prinsip

- jangan commit secret ke git
- isi hanya di `.env.local` lokal operator
- jangan menimpa env production lain yang tidak diperlukan

## Field Minimal

```env
# Target project
VITE_SUPABASE_PROJECT_ID=zrhgqpjbeyzwpgywelcr
VITE_SUPABASE_URL=https://zrhgqpjbeyzwpgywelcr.supabase.co
SUPABASE_PROJECT_REF=zrhgqpjbeyzwpgywelcr

# Public key browser app
VITE_SUPABASE_PUBLISHABLE_KEY=[ISI_DARI_PROJECT_REMOTE]

# Server-side / direct DB access untuk backup + migration remote
SUPABASE_DB_PASSWORD=[PASSWORD_DATABASE_REMOTE]
DATABASE_URL=postgresql://postgres:[PASSWORD_DATABASE_REMOTE]@db.zrhgqpjbeyzwpgywelcr.supabase.co:5432/postgres

# Optional jika ingin pakai URL langsung terpisah
SUPABASE_DB_URL=postgresql://postgres:[PASSWORD_DATABASE_REMOTE]@db.zrhgqpjbeyzwpgywelcr.supabase.co:5432/postgres
SUPABASE_DB_DIRECT_URL=postgresql://postgres:[PASSWORD_DATABASE_REMOTE]@db.zrhgqpjbeyzwpgywelcr.supabase.co:5432/postgres
```

## Field Yang Boleh Kosong

Field ini tidak wajib untuk backup/migration payroll remote:

```env
SUPABASE_ACCESS_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=
```

Catatan:

- `SUPABASE_ACCESS_TOKEN` tidak menyelesaikan masalah jika temp role DB linked CLI tetap gagal auth
- untuk eksekusi aman saat ini, jalur utama tetap `SUPABASE_DB_PASSWORD` atau `DATABASE_URL`

## Template Shell Export

Jika operator tidak ingin menyimpan password di file, pakai export sementara:

```bash
export SUPABASE_DB_PASSWORD='[PASSWORD_DATABASE_REMOTE]'
export DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.zrhgqpjbeyzwpgywelcr.supabase.co:5432/postgres"
```

## Validasi Cepat

Sebelum backup/migration:

```bash
cat .env.local | rg 'VITE_SUPABASE_PROJECT_ID|VITE_SUPABASE_URL|SUPABASE_PROJECT_REF'
```

Expected:

- `VITE_SUPABASE_PROJECT_ID=zrhgqpjbeyzwpgywelcr`
- `VITE_SUPABASE_URL=https://zrhgqpjbeyzwpgywelcr.supabase.co`
- `SUPABASE_PROJECT_REF=zrhgqpjbeyzwpgywelcr`

## Referensi

- [runbook-final-sinkronisasi-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/runbook-final-sinkronisasi-payroll-remote-2026-03-12.md:1)
- [checklist-operator-sinkronisasi-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/checklist-operator-sinkronisasi-payroll-remote-2026-03-12.md:1)
