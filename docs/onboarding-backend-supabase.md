# Onboarding Backend dan Supabase

Dokumen ini untuk developer yang fokus pada `api/*`, migration, function, dan perubahan `Supabase remote`.

## Prinsip Utama

- database utama adalah **Supabase remote**
- jangan jadikan localhost DB sebagai default
- perubahan schema/data penting wajib backup dulu

Backup:

```bash
npm run db:backup:supabase
```

## Area Utama

- [api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api)
- [api/mobile-api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api/mobile-api)
- [supabase/migrations](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase/migrations)
- [supabase/functions](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase/functions)
- [supabase/config.toml](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase/config.toml)

## Workflow Lokal

Jalankan auth lokal:

```bash
npm run dev:mobile-api
```

Health check:

```bash
curl http://127.0.0.1:3000/mobile-api/health
```

Uji login:

```bash
curl -X POST http://127.0.0.1:3000/mobile-api/auth/login \
  -H 'content-type: application/json' \
  --data '{"email":"dummy@example.com","password":"salah"}'
```

## Env yang Penting

- `NEXT_PUBLIC_SUPABASE_URL` atau `VITE_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` atau `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

## Kategori Perubahan Sensitif

- auth
- billing
- role/permission
- migration schema
- cleanup data besar
- trigger/function/policy

Untuk kategori ini:
1. backup dulu
2. verifikasi dampak
3. catat migration/query yang dijalankan

## Command Penting

Lihat histori migration remote:

```bash
supabase migration list --linked
```

Repair histori migration:

```bash
supabase migration repair <version> --status applied --linked --yes
```

Catatan:
- gunakan dengan hati-hati
- pahami dulu apakah object DB memang sudah ada

## Dokumen Rujukan

- [docs/desain-backup-full-supabase.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/desain-backup-full-supabase.md)
- [docs/mcp-ops-policy.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/mcp-ops-policy.md)
- [docs/workflow-aman-workspace-dirty.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/workflow-aman-workspace-dirty.md)
- [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md)

## Checklist Backend/Supabase

1. pastikan task memang perlu sentuh backend/DB
2. backup bila perubahan sensitif
3. uji lokal bila route auth/API terlibat
4. lint/build sesuai risiko
5. update memory task
