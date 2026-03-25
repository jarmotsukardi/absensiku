# ABSENSIKU

Aplikasi absensi berbasis GPS dengan domain lanjutan HR dan Payroll dalam satu repo.

Stack utama:
- `Vite + React + TypeScript`
- `Tailwind CSS`
- `Supabase` untuk Auth, Postgres, Storage, dan function
- `Vercel` untuk frontend + `mobile-api`

Catatan operasional:
- bahasa kerja repo ini: **Bahasa Indonesia**
- database sumber kebenaran: **Supabase remote**
- jangan anggap localhost DB sebagai default

## Scope Aktif

- fokus utama: **absensi**
- **HR** aktif di repo ini
- **Payroll** bisa ada di repo ini, tetapi dikerjakan hanya jika ada arahan eksplisit pada sesi aktif

## Struktur Utama

- [src](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src): aplikasi frontend
- [api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api): endpoint server-side, termasuk `mobile-api`
- [supabase](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase): migration, config, dan functions
- [android-webview](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview): wrapper Android/WebView untuk flow employee
- [tests](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests): Playwright/E2E
- [ops](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops): quickstart operasional, test data, memory, readiness
- [docs](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs): dokumen operasional dan audit

Entry point frontend:
- [src/main.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/main.tsx)
- [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx)

## Quickstart

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
- `mobile-api` lokal membaca `SUPABASE_SERVICE_ROLE_KEY` dari `.env.local`, lalu fallback ke `.env.online`

Preflight localhost:

```bash
npm run ops:sandbox:doctor:strict
```

## Workflow Lokal

Frontend saja:

```bash
npm run dev
```

Hasil:
- frontend Vite di `http://127.0.0.1:5173`

`mobile-api` lokal saja:

```bash
npm run dev:mobile-api
```

Hasil:
- `mobile-api` lokal di `http://127.0.0.1:3000`

Health check:

```bash
curl http://127.0.0.1:3000/mobile-api/health
```

Frontend + `mobile-api` bersamaan:

```bash
npm run dev:parity
```

Gunakan `dev:parity` saat mengerjakan:
- login employee web
- login Android/WebView
- forgot password / OTP
- rate limit / lockout
- investigasi `ref_id` auth

Ringkasan:
- `npm run dev`: frontend saja
- `npm run dev:mobile-api`: auth server-side lokal saja
- `npm run dev:parity`: frontend + auth lokal dengan perilaku setara production

## Auth Lokal

Smoke auth cepat:

```bash
curl -X POST http://127.0.0.1:3000/mobile-api/auth/login \
  -H 'content-type: application/json' \
  --data '{"email":"dummy@example.com","password":"salah"}'
```

Respons gagal yang sehat akan mengandung:
- `code`
- `message`
- `ref_id` seperti `MOB-LOGIN-*`

Rate limit login employee sekarang berjalan **server-side**, bukan hanya `localStorage` browser.

## Environment Minimal

Nilai minimal yang biasanya dibutuhkan:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DB_URL=...
```

Catatan:
- `NEXT_PUBLIC_*` dipakai frontend
- `SUPABASE_SERVICE_ROLE_KEY` dipakai `mobile-api` untuk flow auth server-side dan rate limit
- jangan expose `SUPABASE_SERVICE_ROLE_KEY` ke bundle frontend

## Database

Aturan utama:
- database utama adalah **Supabase remote**
- sebelum perubahan schema/data penting, backup dulu:

```bash
npm run db:backup:supabase
```

Migration berada di:
- [supabase/migrations](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase/migrations)

Config project Supabase:
- [supabase/config.toml](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase/config.toml)

## Command Penting

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

FAQ ack setelah benar-benar diperbarui:

```bash
npm run faq:ack
```

## Observability

Frontend:
- global error logging diinisialisasi dari [src/main.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/main.tsx)
- gunakan `ref/log id` saat triase bug frontend

Backend/auth:
- `mobile-api` mengembalikan `ref_id`
- function/backend lain dapat mengembalikan `trace_id`

Saat triase auth:
- prioritaskan `ref_id`
- cocokkan dengan request network dan log backend

## Rute Penting

Publik:
- `/`
- `/faq`
- `/about`

Employee:
- `/employee/login`
- `/employee/dashboard`
- `/employee/profile`
- `/employee/help`

Organisasi:
- `/org/login`
- `/org`
- `/org/hr/*`
- `/org/payroll/*`

Admin:
- `/admin/login`
- `/admin`

## Dokumen Operasional

Mulai dari dokumen berikut:
- [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md)
- [AGENTS.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/AGENTS.md)
- [docs/index-operasional.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/index-operasional.md)
- [autopilot.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/autopilot.md)
- [kerja_paralel.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/kerja_paralel.md)
- [memperkuat_memory.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/memperkuat_memory.md)

## Catatan

- repo ini bisa berada dalam worktree yang sangat kotor; jangan asumsikan status git bersih
- jangan jalankan push/deploy tanpa instruksi eksplisit user
- untuk task auth/localhost, baca juga [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md) karena di sana ada FAQ operasional terbaru
