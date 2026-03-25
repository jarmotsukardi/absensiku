# Onboarding Developer Baru

Dokumen ini adalah pintu masuk cepat untuk developer baru yang mulai bekerja di repo `ABSENSIKU`.

Tujuan:
- memahami arsitektur dasar repo
- menyalakan environment lokal tanpa salah asumsi
- mengetahui command harian yang benar
- menghindari kesalahan operasional di workspace dirty dan `Supabase remote`

Versi turunan yang lebih spesifik:
- [docs/onboarding-frontend.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-frontend.md)
- [docs/onboarding-backend-supabase.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-backend-supabase.md)
- [docs/onboarding-operator-release.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-operator-release.md)

## 1. Pahami Konteks Repo

Repo ini bukan tutorial starter dan bukan project Next.js generik. Kondisi aktual repo:
- frontend utama: `Vite + React + TypeScript`
- backend ringan untuk auth/web bridge: `api/mobile-api/*`
- database utama: `Supabase remote`
- domain aktif default: `absensi` dan `HR`
- `Payroll` ada di repo, tetapi tidak selalu jadi scope kerja default

Folder yang paling sering dipakai:
- [src](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src): frontend utama
- [api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api): endpoint server-side
- [supabase](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase): migration, config, functions
- [tests](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests): E2E dan helpers
- [ops](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops): readiness, memory, test data, command operasional
- [docs](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs): dokumen audit, runbook, panduan

Entry point frontend:
- [src/main.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/main.tsx)
- [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx)

## 2. Baca Dokumen Wajib

Urutan baca yang disarankan:
1. [AGENTS.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/AGENTS.md)
2. [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md)
3. [docs/workflow-aman-workspace-dirty.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/workflow-aman-workspace-dirty.md)
4. [docs/mcp-ops-policy.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/mcp-ops-policy.md)
5. [README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/README.md)

Kalau task menyentuh auth/localhost:
- fokus tambahan ke [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md)

Kalau task menyentuh DB remote:
- baca juga [docs/desain-backup-full-supabase.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/desain-backup-full-supabase.md)

## 3. Setup Lokal

Install dependency:

```bash
npm install
```

Siapkan env lokal:

```bash
cp .env.online .env.local
```

Catatan:
- `.env.local` dan `.env.online` berisi secret sensitif
- jangan commit ulang perubahan nilainya
- `mobile-api` lokal akan membaca `SUPABASE_SERVICE_ROLE_KEY` dari `.env.local`, lalu fallback ke `.env.online`

Jalankan preflight localhost:

```bash
npm run ops:sandbox:doctor:strict
```

Kalau hasilnya `SIAP`, environment lokal aman untuk HTTP localhost + Playwright.

## 4. Pilih Workflow Lokal yang Benar

Frontend saja:

```bash
npm run dev
```

Gunakan ini untuk:
- edit UI umum
- routing/layout
- komponen frontend yang tidak menyentuh auth server-side

`mobile-api` lokal saja:

```bash
npm run dev:mobile-api
```

Gunakan ini untuk:
- debug auth employee
- debug forgot password / OTP
- cek `ref_id`
- cek rate limit

Health check:

```bash
curl http://127.0.0.1:3000/mobile-api/health
```

Frontend + auth lokal bersamaan:

```bash
npm run dev:parity
```

Gunakan ini jika mengerjakan:
- login employee web
- login Android/WebView
- investigasi sesi bootstrap/native
- integrasi frontend dengan `mobile-api`

## 5. Pahami Aturan Auth Baru

Flow auth employee sekarang tidak hanya bergantung ke `supabase.auth.signInWithPassword` di browser.

Yang perlu dipahami:
- login employee web/native lewat `mobile-api`
- respons gagal auth membawa `ref_id`
- rate limit login employee berjalan server-side

Smoke auth lokal cepat:

```bash
curl -X POST http://127.0.0.1:3000/mobile-api/auth/login \
  -H 'content-type: application/json' \
  --data '{"email":"dummy@example.com","password":"salah"}'
```

Respons sehat saat gagal:
- `code`
- `message`
- `ref_id`

Saat triase auth:
1. ambil `ref_id` dari UI atau network
2. cocokan dengan log request/response
3. baru telusuri state rate limit atau respons Supabase Auth

## 6. Aturan Database

Aturan inti:
- source of truth adalah `Supabase remote`
- jangan menjadikan DB localhost sebagai default
- perubahan schema/data penting wajib didahului backup

Sebelum migration atau perubahan data penting:

```bash
npm run db:backup:supabase
```

Kategori yang dianggap sensitif:
- auth
- billing
- role/permission
- migration schema
- cleanup data besar
- trigger/function/policy

## 7. Command Harian yang Paling Penting

Readiness:

```bash
npm run ops:readiness
```

Autofix:

```bash
npm run autofix
```

Quality gate cepat:

```bash
npm run qa:fast
```

Memory task:

```bash
npm run ops:memory:task -- --title "Judul task" --summary "Ringkasan task"
```

FAQ offer:

```bash
npm run faq:offer
```

FAQ ack setelah FAQ benar-benar diperbarui:

```bash
npm run faq:ack
```

## 8. Cara Kerja Aman di Repo Ini

Repo ini sering berada dalam state `dirty`. Jadi jangan bekerja seolah repo selalu bersih.

Aturan praktis:
- tentukan scope file sebelum edit
- jangan menyapu file yang tidak relevan
- jangan pakai `git add .`
- jangan deploy/push tanpa instruksi eksplisit dan audit
- baca diff sebelum stage

Panduan lengkap:
- [docs/workflow-aman-workspace-dirty.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/workflow-aman-workspace-dirty.md)

## 9. Jika Task Menyentuh Area Ini

Auth / localhost:
- mulai dari [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md)

DB remote / migration:
- backup dulu
- baca dokumen DB terkait di [docs/index-operasional.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/index-operasional.md)

Android wrapper:
- lihat [android-webview/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/README.md)

HR:
- lihat [docs/panduan_membangun_hr.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/panduan_membangun_hr.md)

## 10. Ringkasan 30 Menit Pertama

Checklist paling praktis untuk developer baru:
1. baca `AGENTS.md`
2. baca `ops/README.md`
3. `npm install`
4. `cp .env.online .env.local`
5. `npm run ops:sandbox:doctor:strict`
6. jalankan `npm run dev` atau `npm run dev:parity` sesuai task
7. pahami file target sebelum edit
8. jika menyentuh DB remote, backup dulu
9. setelah selesai, update memory task

## 11. Jika Bingung Mulai dari Mana

Mulai dari tiga file ini:
- [README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/README.md)
- [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md)
- [AGENTS.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/AGENTS.md)

Kalau masih bingung, biasanya masalahnya ada di salah satu ini:
- salah pilih command lokal
- belum baca scope task
- mengira DB localhost adalah default
- lupa bahwa repo sedang dirty
