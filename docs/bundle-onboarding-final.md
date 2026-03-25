# Bundle Onboarding Final

Dokumen ini adalah pintu masuk paling ringkas untuk developer baru atau operator yang baru masuk ke repo `ABSENSIKU`.

Gunakan dokumen ini jika ingin memahami repo dengan cepat tanpa membuka terlalu banyak file di awal.

## 1. Konteks Repo

- Fokus utama repo: aplikasi absensi
- HR aktif sebagai domain kerja lanjutan di repo yang sama
- Payroll ada di repo yang sama dan harus diperlakukan hati-hati sesuai konteks task aktif
- Database sumber kebenaran: Supabase remote

Catatan tetap:
- [`.env.local`](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/.env.local) dan [`.env.online`](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/.env.online) `hands-off` tanpa perintah eksplisit
- [apps](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/apps) adalah area penting HR dan Payroll, bukan sampah

## 2. Folder Penting

- [src](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src)
  frontend utama
- [api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api)
  endpoint server-side
- [supabase](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase)
  migration, function, dan konfigurasi backend DB
- [android-webview](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview)
  wrapper Android hybrid
- [docs](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs)
  dokumentasi operasional
- [scripts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/scripts)
  utilitas operasional, smoke, dan automation

## 3. Baca Dulu Ini

Urutan baca paling efektif:
1. [AGENTS.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/AGENTS.md)
2. [docs/index-operasional.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/index-operasional.md)
3. [docs/cheatsheet-tool-per-task.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/cheatsheet-tool-per-task.md)
4. [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md)

Jika task Anda spesifik:
- route/auth: [docs/cheatsheet-audit-route-auth.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/cheatsheet-audit-route-auth.md)
- deploy/release: [docs/cheatsheet-deploy-release.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/cheatsheet-deploy-release.md)
- SOP kerja: [docs/sop-per-role.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/sop-per-role.md)

## 4. Command Harian

Lokal umum:

```bash
npm run dev
```

Doctor localhost:

```bash
npm run ops:sandbox:doctor:strict
```

Auth/mobile parity:

```bash
npm run dev:mobile-api
npm run dev:parity
```

Memory dan FAQ:

```bash
npm run ops:memory:task -- --title "judul" --summary "ringkasan"
npm run faq:offer
```

## 5. Jalur Kerja Aman

Jika task menyentuh route, login, atau workspace:
1. audit route di [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx)
2. gunakan browser smoke
3. verifikasi `/admin`, `/org`, `/org/hr`, `/org/payroll`, `/employee`

Jika task menyentuh database:
1. backup dulu
2. audit migration
3. jangan asumsikan localhost DB

Jika task menyentuh cleanup:
1. bedakan source runtime dan arsip
2. jangan pindahkan file runtime publik tanpa audit
3. jangan sentuh `apps/`, `src/`, `api/`, `supabase` tanpa alasan jelas

## 6. Watchlist Sensitif

Area paling sensitif sebelum commit/deploy:
- [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx)
- [src/pages/admin](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin)
- [src/pages/org](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org)
- [src/pages/employee](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/employee)
- [api/mobile-api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api/mobile-api)
- [supabase/migrations](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase/migrations)
- [vercel.json](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/vercel.json)

## 7. Kesimpulan Praktis

Kalau bingung harus mulai dari mana:
- baca `AGENTS.md`
- buka `docs/index-operasional.md`
- gunakan `docs/cheatsheet-tool-per-task.md`
- jangan sentuh env
- jangan anggap `apps/` sebagai arsip
- cek route utama jika ada kekhawatiran runtime
