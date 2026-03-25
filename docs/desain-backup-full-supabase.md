# Desain Backup Full Supabase

Dokumen ini menjelaskan desain backup yang benar untuk project Supabase aktif `zrhgqpjbeyzwpgywelcr`, setelah audit menunjukkan bahwa fitur UI `Download Backup Lengkap` saat ini belum mencakup seluruh objek penting Supabase.

## Tujuan

Mendapatkan backup yang layak untuk:

- disaster recovery
- restore lintas project
- audit perubahan
- uji restore berkala

Targetnya bukan hanya data aplikasi `public`, tetapi seluruh aset Supabase yang relevan untuk pemulihan.

## Baseline Project Saat Ini

Berdasarkan audit remote per 8 Maret 2026:

- `public`: `83` tabel
- `auth`: `21` tabel
- `storage`: `8` tabel internal
- `auth.users`: `37` user
- storage bucket aktif: `4`
- edge functions aktif: `26`

## Kekurangan Fitur Backup Saat Ini

Referensi code saat ini:

- [FullBackupManager.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/admin/settings/FullBackupManager.tsx)
- [SupabaseSettings.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/SupabaseSettings.tsx)
- [restore-backup-from-json.mjs](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/scripts/restore-backup-from-json.mjs)

Masalah utama:

- hanya membackup `30` tabel `public`
- tidak membawa schema `auth`
- tidak membawa data `auth.users`
- tidak melakukan introspeksi schema live
- SQL schema dan RLS masih template/placeholder
- daftar edge functions hardcoded dan tertinggal
- daftar storage bucket hardcoded dan tertinggal
- export dilakukan dari browser client sehingga tetap tunduk pada RLS
- tidak membackup source edge function, auth config, atau objects di storage

Kesimpulan: implementasi sekarang cocok untuk backup parsial aplikasi, bukan full backup Supabase.

## Prinsip Desain Baru

Backup full dibagi menjadi `6` lapisan:

1. database logical dump
2. auth inventory
3. storage metadata
4. storage objects
5. edge functions
6. environment/secrets manifest

Semua lapisan disatukan oleh satu `manifest.json` agar restore dan audit deterministik.

## Layer 1: Database Logical Dump

Ini lapisan utama.

Untuk backup yang portable, gunakan perintah resmi Supabase CLI:

```bash
supabase db dump --db-url "$SUPABASE_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql
supabase db dump --db-url "$SUPABASE_DB_URL" -f data.sql --use-copy --data-only
```

Output minimum:

- `roles.sql`
- `schema.sql`
- `data.sql`

Alasan:

- menurut docs Supabase, dump ini membawa schema, data, roles, functions, triggers, RLS policies, dan `auth.users`
- lebih aman untuk restore lintas versi daripada JSON parsial buatan app

Catatan:

- untuk backup rutin internal repo, script `scripts/supabase-backup-sql.mjs` perlu dievolusi agar memakai `supabase db dump`, bukan hanya `pg_dump` langsung
- backup SQL tetap disimpan di `artifacts/db-backups/sql/`

## Layer 2: Auth Inventory

Walau `auth.users` ikut di logical dump resmi, auth tetap perlu manifest terpisah untuk audit.

Simpan:

- total user
- id user
- email
- created_at
- email_confirmed_at
- banned_until
- is_anonymous
- provider identities summary

Jangan simpan:

- plaintext password
- token aktif
- secrets JWT

Output:

- `auth/users_manifest.json`
- `auth/auth_summary.json`

Tujuan:

- memudahkan rekonsiliasi setelah restore
- membedakan data auth yang benar-benar ikut dump vs yang butuh konfigurasi ulang

## Layer 3: Storage Metadata

Backup database tidak sama dengan backup file storage.

Yang perlu diekspor:

- daftar bucket
- `public` flag
- batas ukuran file
- mime type policy
- jumlah object per bucket
- kebijakan akses jika ada dependency SQL

Output:

- `storage/buckets.json`
- `storage/object_counts.json`

Sumber:

- `storage.buckets`
- query agregasi object metadata

## Layer 4: Storage Objects

Ini wajib dipisah dari backup database.

Docs Supabase menyatakan backup database tidak memulihkan object file Storage; yang ikut hanya metadata DB.

Maka perlu:

- export daftar object per bucket
- download object file ke arsip terpisah

Format:

- `storage/objects-manifest.json`
- `storage/files/<bucket>/<path>`

Untuk bucket sekarang minimal:

- `apk-files`
- `news-images`
- `organization-logos`
- `payment-proofs`

## Layer 5: Edge Functions

Backup full harus mencakup:

- daftar function aktif di remote
- versi remote
- `verify_jwt`
- entrypoint path
- checksum jika tersedia
- source code repo `supabase/functions/*`

Output:

- `functions/functions-manifest.json`
- `functions/source/` copy dari `supabase/functions`

Catatan:

- source repo adalah source of truth
- remote manifest dipakai untuk verifikasi bahwa semua fungsi yang penting sudah terdeploy
- secrets edge function tidak boleh dibackup nilainya, hanya inventaris namanya

## Layer 6: Config / Secrets Manifest

Secrets tidak boleh ditaruh dalam backup biasa.

Yang disimpan:

- daftar nama env var yang dibutuhkan
- lingkungan tempat secret dipakai
- apakah wajib / opsional
- owner rotasi

Yang tidak disimpan:

- nilai secret

Contoh:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `XENDIT_SECRET_KEY`
- `GOOGLE_API_KEY`
- `PAYROLL_WEBHOOK_SECRET`

Output:

- `config/required-envs.json`
- `config/restore-checklist.md`

## Struktur Arsip yang Disarankan

```text
backup_<timestamp>/
  manifest.json
  roles.sql
  schema.sql
  data.sql
  auth/
    users_manifest.json
    auth_summary.json
  storage/
    buckets.json
    object_counts.json
    objects-manifest.json
    files/
  functions/
    functions-manifest.json
    source/
  config/
    required-envs.json
    restore-checklist.md
  reports/
    checksums.txt
    validation.json
```

## Manifest Utama

`manifest.json` minimal berisi:

- project ref
- project URL
- created_at
- backup_version
- operator
- row counts penting
- table counts per schema
- auth users count
- bucket count
- function count
- checksum semua file backup

Contoh field:

```json
{
  "project_ref": "zrhgqpjbeyzwpgywelcr",
  "created_at": "2026-03-08T08:00:00.000Z",
  "backup_version": 1,
  "database": {
    "public_tables": 83,
    "auth_tables": 21,
    "storage_tables": 8
  },
  "auth": {
    "users_count": 37
  },
  "storage": {
    "buckets_count": 4
  },
  "functions": {
    "count": 26
  }
}
```

## Strategi Restore

Urutan restore:

1. restore `roles.sql`
2. restore `schema.sql`
3. restore `data.sql`
4. verifikasi `auth.users`
5. restore bucket metadata
6. upload kembali storage objects
7. deploy edge functions dari `functions/source`
8. isi ulang secrets sesuai `required-envs.json`
9. smoke test auth, storage, function, RLS

Jangan restore langsung dari JSON browser export sebagai jalur utama.

## Validasi Pasca Backup

Backup dianggap valid jika:

- file `roles.sql`, `schema.sql`, `data.sql` ada
- checksum seluruh file lolos
- jumlah tabel di manifest cocok dengan remote saat backup
- jumlah `auth.users` di manifest cocok
- jumlah bucket cocok
- jumlah edge function cocok
- restore drill di environment uji berhasil

## Validasi Pasca Restore

Wajib cek:

- `select count(*) from auth.users;`
- `\dt public.*`
- bucket `apk-files`, `news-images`, `organization-logos`, `payment-proofs`
- function OTP, billing, webhook, dan cleanup aktif
- login user test
- upload/download storage object test
- RLS smoke test per role

## Rekomendasi Implementasi di Repo Ini

Tahap implementasi yang disarankan:

1. ganti strategi `Download Backup Lengkap` dari browser JSON menjadi job berbasis server/CLI
2. pertahankan JSON export lama sebagai `partial app export`, bukan `full backup`
3. tambahkan script baru:
   - `scripts/supabase-backup-full.mjs`
   - `scripts/supabase-backup-auth.mjs`
   - `scripts/supabase-backup-storage.mjs`
   - `scripts/supabase-backup-functions.mjs`
4. hasil backup ditulis ke `artifacts/db-backups/full/<timestamp>/`
5. tambahkan `manifest` dan `checksums`
6. tambah restore drill dokumentatif

## Keputusan Teknis

Untuk repo ini, istilah harus dipisah tegas:

- `Full Backup Supabase`: dump SQL resmi + auth manifest + storage metadata/object + function manifest/source + config checklist
- `Partial App Export`: JSON dari tabel aplikasi tertentu untuk kebutuhan migrasi terbatas

UI sekarang harus diubah agar tidak lagi mengklaim JSON export parsial sebagai `Backup Lengkap Database`.

## Sumber Resmi

- Supabase restore to self-hosted:
  - https://supabase.com/docs/guides/self-hosting/restore-from-platform
- Supabase database backups:
  - https://supabase.com/docs/guides/platform/backups
- Supabase troubleshooting logical backup with physical backups:
  - https://supabase.com/docs/guides/troubleshooting/download-logical-backups
- Supabase Postgres roles:
  - https://supabase.com/docs/guides/database/postgres/roles
