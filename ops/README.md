# Ops Quickstart

Folder ini berisi data minimum agar eksekusi task besar bisa lebih cepat dan terukur.

## File Inti

- `working-profile.json`:
  konfigurasi kebijakan kerja tetap (prioritas, paralel, validasi).
- `smoke-routes.json`:
  daftar route prioritas untuk smoke-check.
- `test-accounts.template.json`:
  template akun uji per role.
- `test-dataset.template.json`:
  template dataset uji skenario inti.
- `orchestration-spec.template.md`:
  template intake spec untuk `npm run orchestrate:full`.
- `feature-sprint-template.md`:
  template workflow sprint fitur cepat (MCP-first, batch implementasi, validasi paralel).

## File Lokal (Rahasia)

Jangan commit data sensitif. Isi file lokal berikut:

- `test-accounts.local.json`
- `test-dataset.local.json`

## Perintah

Inisialisasi file lokal dari template:

```bash
npm run ops:readiness -- --init
```

Cek readiness:

```bash
npm run ops:readiness
```

Jika output `Ops readiness: SIAP`, berarti data minimum sudah lengkap.

Quality gate cepat (autofix -> lint/test/build paralel):

```bash
npm run qa:fast
```

Validasi prasyarat E2E (tanpa menjalankan suite):

```bash
npm run e2e:smoke:check
```

Jalankan suite smoke E2E paralel:

```bash
npm run e2e:smoke
```

Jalankan Playwright test runner:

```bash
npm run e2e:install
npm run e2e:pw
```

## Docker Hybrid (Direkomendasikan)

Mode ini menjaga app utama tetap lokal (`npm run dev`), sementara service pendukung dijalankan di Docker.

Naikkan service:

```bash
npm run docker:up
npm run docker:ps
```

Lihat log realtime:

```bash
npm run docker:logs
```

Hentikan service:

```bash
npm run docker:down
```

Reset total volume (destruktif untuk data local dev):

```bash
npm run docker:reset
```

Jalankan migration/seed local DB:

```bash
npm run db:migrate
npm run db:seed
```

Catatan:
- Migration local dibaca dari `docker/postgres/migrations/*.sql`.
- Seed default dibaca dari `docker/postgres/seed.sql` (bisa override: `npm run db:seed -- --file path/to/file.sql`).

Mode sinkronisasi Supabase migration (agar DB Docker lebih mendekati schema utama):

```bash
npm run db:migrate:all        # jalankan local bootstrap + seluruh supabase/migrations
npm run db:migrate:supabase   # jalankan hanya supabase/migrations
npm run db:migrate:sync       # mirror file supabase/migrations ke docker/postgres/migrations/supabase
```

## Observability Baseline

- Frontend:
  - `src/lib/errorLogger.ts` menyimpan `Ref: ERR-*` lokal + log console terstruktur.
  - Sentry aktif otomatis jika `.env.local` berisi `VITE_SENTRY_DSN`.
- Backend:
  - Edge Function memakai `trace_id` pada response error.
  - Saat triase, selalu cocokkan `Ref: ERR-*` (frontend) dengan `trace_id` (backend) di log Supabase.

## Mode Cepat Permanen (Lovable-like)

Mode default repo ini sekarang pakai fastlane berikut:

```bash
npm run lovable -- --task "Audit dan perbaiki modul /org/notifications end-to-end"
```

Variasi:

```bash
npm run lovable -- --task "Perbaikan cepat UI /dashboard" --dry-run
npm run lovable:full -- --task "Batch besar lintas /admin + /org"
```

Fastlane ini menjalankan:
- intake task
- orchestrasi model
- autofix
- validasi paralel (lint/test/build + smoke)

Alternatif one-command lokal-native:

```bash
npm run local:orchestrate -- --task "Implementasi batch modul /org/"
```

Hasil run disimpan di:
- `artifacts/local-orchestration/<run-id>/run.json`
- `artifacts/local-orchestration/<run-id>/summary.md`

Aturan deploy tetap sama: push/deploy manual hanya jika ada perintah eksplisit.

Gunakan `ops/test-accounts.local.json` sebagai sumber kredensial tetap untuk uji login:

```bash
npm run smoke:login
```

Aturan record untuk smoke login/dashboard:

- Runner boleh membuat record sementara di `ops/test-runs.local.jsonl` saat proses berjalan.
- Setelah selesai, record tersebut wajib dihapus otomatis (`record_cleanup: DELETED_MANDATORY`).

Uji login per role:

```bash
npm run smoke:login:employee
npm run smoke:login:org
npm run smoke:login:superadmin
```

Uji dashboard pegawai (mengambil akun `employee` dari file yang sama):

```bash
npm run smoke:dashboard
```

## Mekanisme Resmi Uji Absensi

Gunakan command berikut sebagai jalur resmi:

```bash
npm run smoke:attendance
```

Aturan mekanisme resmi:

- Setiap run boleh direcord sementara ke `ops/test-runs.local.jsonl` untuk proses eksekusi.
- Setelah run selesai, record hasil uji **wajib dihapus otomatis** (`record_cleanup: DELETED_MANDATORY`).
- Test absensi penuh hanya dijalankan pada hari kerja non-libur.
- Jika hari ini libur (nasional/work_holiday/legacy holiday) atau weekend, run ditandai `SKIPPED_NON_WORKING_DAY` dan menyimpan rekomendasi tanggal kerja berikutnya.
- Referensi error (`app_error_ids`) ikut tercatat agar triase cepat.
