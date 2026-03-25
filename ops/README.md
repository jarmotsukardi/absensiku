# Ops Quickstart

Folder ini berisi data minimum agar eksekusi task besar bisa lebih cepat dan terukur.

## Scope Aktif (Per 3 Maret 2026)

- Dokumen ini memakai fokus operasional **attendance-first**.
- HR tetap aktif sebagai domain kerja lanjutan di repo ini.
- Payroll tetap berada di repo ini, tetapi bukan workflow default kecuali ada arahan eksplisit pada sesi aktif.
- Database utama: **Supabase remote** (`*.supabase.co`), bukan DB localhost.

## File Inti

- `working-profile.json`:
  konfigurasi kebijakan kerja tetap (prioritas, paralel, validasi).
- `smoke-routes.json`:
  daftar route prioritas untuk smoke-check.
- `test-accounts.template.json`:
  template akun uji per role.
- `test-dataset.template.json`:
  template dataset uji skenario inti.
- `attendance-security-rollout-checklist.md`:
  checklist operator untuk aktivasi ulang policy keamanan absensi, termasuk smoke test device binding, browser blocking, dan lokasi realtime.
- `attendance-security-operator-replies.md`:
  jawaban cepat operator untuk menangani komplain user terkait perangkat terdaftar, browser yang diblok, dan reset device.
- `sql/attendance-security-rollout-template.sql`:
  template SQL operator untuk preview akun `WEB-*`, dry-run reset binding tenant uji, apply policy, dan rollback bertahap.
- `sql/attendance-security-global-cutover-two-accounts.sql`:
  template SQL final untuk cutover global setelah membersihkan dua akun existing binding `WEB-*` yang sudah teridentifikasi.
- `orchestration-spec.template.md`:
  template intake spec untuk `npm run orchestrate:full`.
- `feature-sprint-template.md`:
  template workflow sprint fitur cepat (MCP-first, batch implementasi, validasi paralel).
- `../autopilot.md`:
  kontrak autopilot global (trigger, guardrail, stop condition, handover).
- `../kerja_paralel.md`:
  aturan paralel-by-default untuk scan, implementasi, dan validasi.
- `../memperkuat_memory.md`:
  standar penyimpanan memory file lintas sesi.
- `../docs/index-operasional.md`:
  indeks cepat dokumen operasional repo.
- `../docs/mcp-recommended-stack.md`:
  rekomendasi stack MCP untuk repo ini.
- `../docs/mcp-ops-policy.md`:
  policy operasional MCP, termasuk akses read-only vs explicit-only.
- `../docs/mcp-availability-2026-03-14.md`:
  audit MCP aktual yang tersedia di sesi kerja dibanding target setup.

## File Lokal (Rahasia)

Jangan commit data sensitif. Isi file lokal berikut:

- `test-accounts.local.json`
- `test-dataset.local.json`

## Perintah Harian

### Uji manual dispatcher push APK

Jika perlu memanggil `dispatch-device-pushes` tanpa browser, gunakan script lokal ini.
Script akan login memakai akun valid dari `ops/test-accounts.local.json`, lalu mengirim request ke Edge Function dengan session JWT yang sah.

Contoh `super_admin`:

```bash
npm run push:dispatch:manual -- --role=superadmin --source=admin_broadcast --dry-run
```

Contoh `admin organisasi`:

```bash
npm run push:dispatch:manual -- --role=org_admin_centralized --source=org_notification --dry-run
```

Contoh satu perintah untuk uji penuh lalu bersih lagi:

```bash
npm run push:dispatch:manual -- --role=superadmin --seed --source=admin_broadcast --wait-delivery --cleanup-after
npm run push:dispatch:manual -- --role=org_admin_centralized --seed --source=org_notification --wait-delivery --cleanup-after
```

Opsi penting:
- `--notification-id=<uuid>` untuk target satu notifikasi tertentu
- `--notification-ids=<uuid1,uuid2>` untuk beberapa notifikasi
- `--tenant-id=<uuid>` untuk override tenant target
- `--user-id=<uuid>` untuk filter user tertentu
- `--limit=<angka>` untuk batas maksimum notifikasi yang discan
- `--seed` untuk membuat notifikasi uji lebih dulu
- `--wait-delivery` untuk menunggu row `notification_push_deliveries`
- `--cleanup-after` untuk menghapus notifikasi uji setelah selesai
- `--json` agar output mudah diproses ulang

Catatan:
- jalur ini sengaja memakai sesi user valid, bukan `SUPABASE_SERVICE_ROLE_KEY`
- aman dipakai untuk triase auth `dispatch-device-pushes` saat service-role lokal tidak sinkron dengan secret remote

## FAQ Operasional Auth & Localhost

### Kapan memakai `npm run dev`, `npm run dev:mobile-api`, atau `npm run dev:parity`?

- `npm run dev`:
  jalankan hanya frontend Vite di `http://127.0.0.1:5173`.
- `npm run dev:mobile-api`:
  jalankan hanya server auth lokal `mobile-api` di `http://127.0.0.1:3000`.
- `npm run dev:parity`:
  jalankan keduanya sekaligus agar browser/web employee berbicara ke auth lokal dengan perilaku yang sama seperti production.

### Kapan developer perlu `dev:mobile-api` atau `dev:parity`?

Gunakan saat mengerjakan:
- login employee web
- login native Android/WebView
- lockout/rate limit
- forgot password / OTP
- kebutuhan investigasi `ref_id` auth

Jika hanya mengubah UI umum yang tidak menyentuh auth server-side, `npm run dev` saja cukup.

### Dari mana `mobile-api` lokal membaca env?

Urutan file env untuk script lokal sekarang:
- `.env.local`
- `.env.online`
- `.env`

Khusus auth server-side, nilai penting yang wajib tersedia:
- `NEXT_PUBLIC_SUPABASE_URL` atau `VITE_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` atau `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Bagaimana mengecek `mobile-api` lokal sehat?

Health check:

```bash
curl http://127.0.0.1:3000/mobile-api/health
```

Hasil sehat:

```json
{"ok":true,"service":"mobile-api-local"}
```

### Bagaimana membaca error login employee setelah cutover server-side auth?

Semua respons gagal auth sekarang membawa `ref_id`.

Contoh:
- `invalid_credentials`:
  `MOB-LOGIN-*`
- `rate_limited`:
  `MOB-LOGIN-*`
- error backend lain:
  tetap baca `ref_id` dari respons/toast UI

Saat triase:
- cocokkan `ref_id` dari UI/browser/network
- cek log backend/mobile-api
- lalu cocokkan dengan state rate limit atau respons Supabase Auth

### Kapan user akan kena rate limit login?

Rate limit login employee sekarang dikontrol server-side dari setting backend, bukan hanya `localStorage`.

Perilaku yang sudah tervalidasi:
- kredensial salah beberapa kali akan tetap `invalid_credentials`
- setelah melewati ambang, respons berubah menjadi `rate_limited`
- UI menampilkan pesan lock dan `ref_id`

### Apa perbedaan `ref_id` dan `trace_id`?

- `ref_id`:
  identitas error/attempt dari `mobile-api` atau frontend auth flow
- `trace_id`:
  identitas error backend lain, terutama function/edge/backend runtime

Untuk auth employee web/native, prioritaskan `ref_id` terlebih dahulu.

### Stack Tools Akselerasi (1-5)

Default percepatan eksekusi di repo ini:

1. `multi_tool_use.parallel`
2. `functions.exec_command`
3. `mcp__codebase__*` (`get_files_context`, `semantic_search`, `find_similar`, `get_dependents`)
4. `Supabase/Postgres remote MCP` jika tersedia
5. `mcp__playwright__*`

Catatan:
- Gunakan `1+2` untuk scan/validasi paralel harian.
- Gunakan `3` untuk discovery dan impact analysis sebelum edit.
- Gunakan `4` saat perubahan menyentuh DB/migration, tetapi tetap default `read-only` dan wajib backup sebelum write action penting.
- Gunakan `5` untuk smoke flow kritikal setelah implementasi.

Catatan penting:
- pada sesi yang sedang aktif, MCP `Supabase/Postgres remote` bisa belum tersedia walaupun direkomendasikan oleh repo
- lihat audit sesi di `../docs/mcp-availability-2026-03-14.md`

Backup SQL lokal sebelum perubahan DB penting:

```bash
npm run db:backup:supabase
```

Kebutuhan env (salah satu):
- `SUPABASE_DB_URL`
- `SUPABASE_DB_DIRECT_URL`
- `DATABASE_URL`

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

Quality gate cepat khusus billing (autofix -> lint/test + e2e billing minimal paralel):

```bash
npm run qa:billing:quick
```

Catatan: perintah billing quick butuh app lokal aktif di `http://127.0.0.1:5173` agar Playwright bisa berjalan.

Inisialisasi memory lokal lintas sesi:

```bash
npm run ops:memory:init
```

Update memory otomatis setelah tiap task:

```bash
npm run ops:memory:task -- --title "Perbaikan billing" --summary "Sinkronisasi alur verifikasi"
```

Opsional field detail (pisahkan list dengan `;`):

```bash
npm run ops:memory:task -- \
  --title "Task billing mandiri" \
  --changes "Update modal verifikasi;Update invoice detail" \
  --validation "Playwright smoke pass;lint targeted pass" \
  --risks "Perlu uji edge-case invoice lama" \
  --next "Uji regresi role employee;Sinkronkan FAQ" \
  --decision "Mode payment fallback manual saat Xendit nonaktif" \
  --issue "Data invoice lama masih memakai tarif historis"
```

File memory:
- `ops/memory/current-state.local.md`
- `ops/memory/decisions.local.md`
- `ops/memory/open-issues.local.md`
- `ops/memory/next-actions.local.md`
- `ops/memory/task-log.local.jsonl`

Sinkronisasi hasil UAT ke Monitoring UAT:

```bash
npm run uat:sync-monitoring -- --domain=absensi --file docs/checklist-uji-aplikasi.md
npm run uat:sync-monitoring -- --domain=hr --file docs/uat/uat-YYYY-MM-DD-hr-<scope>.md
npm run uat:sync-monitoring -- --domain=payroll --file docs/uat/uat-YYYY-MM-DD-payroll-<scope>.md
```

Mekanisme tetap saat UAT menemukan temuan:
- jalankan `npm run autofix`
- lanjutkan perbaikan manual untuk sisa masalah
- retest skenario yang gagal
- update file `docs/uat/*.md`
- sync ulang ke Monitoring UAT

Validasi prasyarat E2E (tanpa menjalankan suite):

```bash
npm run e2e:smoke:check
```

Validasi akses localhost anti-block (Playwright + HTTP localhost):

```bash
npm run ops:sandbox:doctor:strict
```

Opsional jika ingin sekaligus cek `psql` localhost:

```bash
npm run ops:sandbox:doctor:strict:localdb
```

Catatan: `npm run e2e:pw`, `npm run e2e:pw:headed`, `npm run e2e:smoke`, dan `npm run e2e:smoke:attendance` sekarang otomatis menjalankan preflight sandbox doctor terlebih dahulu.

Jika gagal dengan Ref sandbox (mis. `SBX-LOCAL-PLAYWRIGHT-1100`), jalankan task di mode full-access atau whitelist prefix command localhost terlebih dahulu.

Jalankan suite smoke E2E paralel:

```bash
npm run e2e:smoke
```

Jalankan smoke resmi absensi:

```bash
npm run e2e:smoke:attendance
```

Jalankan Playwright test runner:

```bash
npm run e2e:install
npm run e2e:pw
```

Catatan: suite HR/Payroll sementara tidak dijalankan di workflow harian sampai ada arahan eksplisit user.

## Docker Hybrid (Legacy/Opsional)

Mode ini dipertahankan untuk kebutuhan khusus. Untuk database operasional harian, gunakan Supabase remote.

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
npm run smoke:login:org:centralized
npm run smoke:login:superadmin
```

Catatan:
- `smoke:login:org:centralized` dipakai untuk memverifikasi akun tenant billing terpusat dan sekarang tidak lagi bergantung pada fallback tenant mandiri.

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
