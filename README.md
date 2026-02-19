# 📍 Aplikasi Web Absensi Berbasis GPS (Next.js + Supabase + Tailwind + GitHub)

Aplikasi web absensi berbasis GPS yang memungkinkan pengguna melakukan **check-in** dan **check-out** berdasarkan lokasi geografis (GPS) secara real-time.

Stack utama:
- **Next.js (ReactJS)** untuk frontend (dan API routes jika diperlukan)
- **Tailwind CSS** untuk desain UI yang rapi & modern
- **Supabase** untuk Auth + Database (PostgreSQL) + Storage
- **GitHub** untuk version control dan kolaborasi
- (Opsional) **Vercel** untuk deployment otomatis dari GitHub

> Catatan: Semua komunikasi dengan AI Agent/assistant dijelaskan dalam **Bahasa Indonesia**.

---

## 🚀 Fitur Utama

- ✅ Login & Register pengguna (Supabase Auth)
- 📍 Absensi berbasis GPS (HTML5 Geolocation API)
- 🎯 Validasi radius lokasi (mis. lokasi kantor)
- 🕒 Riwayat absensi (check-in & check-out)
- 🔒 Row Level Security (RLS) di Supabase
- 🔄 Sinkronisasi repo ke GitHub (branching + PR)
- ☁️ (Opsional) Auto-deploy ke Vercel dari GitHub

---

## 🧩 Teknologi

- **Next.js** (ReactJS)
- **Tailwind CSS**
- **Supabase** (Auth, Postgres DB, REST/Realtime)
- **GitHub** (Repo, PR, Issues, Actions opsional)
- **Vercel** (opsional untuk hosting Next.js)

---

## ✅ Prasyarat

- Node.js LTS
- Akun GitHub
- Akun Supabase (buat 1 project)

---

## 🏁 Mulai Cepat (Local Development)

### 1) Buat Project Next.js

```bash
npx create-next-app@latest gps-absensi-app
cd gps-absensi-app
npm run dev
```

Buka: `http://localhost:3000`

---

## 🎨 Setup Tailwind CSS (Lengkap)

> Ikuti bagian ini agar UI terlihat bagus dan konsisten.

### A) Install Tailwind

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### B) Konfigurasi `tailwind.config.js`

Pastikan `content` sudah mengarah ke folder yang benar:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

### C) Tambahkan Tailwind ke CSS Global

Jika kamu menggunakan **App Router** (Next.js terbaru), edit:
- `app/globals.css`

Jika kamu menggunakan **Pages Router**, edit:
- `styles/globals.css`

Isi file tersebut dengan:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Opsional: sedikit polishing agar terlihat lebih smooth */
html, body {
  height: 100%;
}
```

### D) Pastikan CSS Global Ter-load

**App Router**: pastikan `app/layout.js` mengimport `globals.css`:

```js
import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
```

**Pages Router**: pastikan `pages/_app.js` mengimport `globals.css`:

```js
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
```

### E) (Opsional tapi Disarankan) Tambah Font yang Lebih Bagus

Pakai `next/font` agar performa bagus:

```js
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

---

## 🔌 Integrasi Supabase

### 2) Install Supabase Client

```bash
npm install @supabase/supabase-js
```

### 3) Konfigurasi Environment

Buat file **`.env.local`** di root project:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Ambil nilai dari: **Supabase Dashboard → Project Settings → API**

> Jangan pernah menaruh **service_role key** di frontend.

### 4) Buat Client Supabase

Buat file: **`/lib/supabaseClient.js`**

```js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

## 🗄️ Struktur Database (Supabase)

### Tabel: `profiles` (opsional, untuk data user)

| Field | Type | Catatan |
|------|------|---------|
| id | uuid | PK, sama dengan auth.users.id |
| name | text | nama user |
| created_at | timestamp | default now() |

### Tabel: `attendance`

| Field | Type | Catatan |
|------|------|---------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users.id |
| check_in | timestamp | waktu check-in |
| check_out | timestamp | waktu check-out |
| latitude | float8 | lokasi user |
| longitude | float8 | lokasi user |
| created_at | timestamp | default now() |

**Rekomendasi:** Aktifkan **RLS** dan buat policy agar user hanya bisa melihat/mengubah data miliknya.

---

## ✨ Contoh UI Tailwind (Kartu Absensi)

Contoh komponen sederhana dengan Tailwind agar tampilannya modern.

Buat file: **`components/AttendanceCard.jsx`**

```jsx
export default function AttendanceCard({ title, subtitle, children }) {
  return (
    <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
```

Contoh penggunaan di halaman:

```jsx
import AttendanceCard from "@/components/AttendanceCard";

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
        <AttendanceCard
          title="Absensi Hari Ini"
          subtitle="Pastikan GPS aktif dan berada dalam radius kantor."
        >
          <button className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800">
            Check-in
          </button>

          <button className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100">
            Check-out
          </button>
        </AttendanceCard>
      </div>
    </main>
  );
}
```

---

## 📍 GPS & Validasi Radius

Gunakan **Geolocation API** di browser untuk mengambil posisi user, lalu validasi jarak dari lokasi kantor.

Contoh util fungsi jarak (Haversine):

```js
export function isWithinRadius(userLat, userLng, officeLat, officeLng, radiusMeters) {
  const R = 6371e3;
  const toRad = (v) => (v * Math.PI) / 180;

  const φ1 = toRad(userLat);
  const φ2 = toRad(officeLat);
  const Δφ = toRad(officeLat - userLat);
  const Δλ = toRad(officeLng - userLng);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance <= radiusMeters;
}
```

> Praktik terbaik: validasi juga di backend (mis. API route Next.js) agar lebih aman dari manipulasi client.

---

## 🔄 Sinkronisasi ke GitHub

### 1) Inisialisasi Git

```bash
git init
git add .
git commit -m "init: nextjs + supabase + tailwind setup"
```

### 2) Buat Repo di GitHub

- Buat repository baru di GitHub (mis. `gps-absensi-app`)
- Copy URL repo, lalu jalankan:

```bash
git remote add origin https://github.com/USERNAME/gps-absensi-app.git
git branch -M main
git push -u origin main
```

---

## ☁️ (Opsional) Deploy ke Vercel

1. Masuk Vercel dan import repo dari GitHub
2. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy

Setiap `git push` ke branch yang dipantau akan memicu auto-deploy.

---

## 🔐 Keamanan

- Aktifkan **RLS** di Supabase untuk tabel `attendance`
- Pastikan policy membatasi akses per user
- Hindari menyimpan data sensitif di client
- Gunakan HTTPS (otomatis jika deploy di Vercel)

---

## 🧭 Roadmap

- [ ] Dashboard Admin (monitor absensi)
- [ ] Export laporan (CSV/Excel)
- [ ] Approval manual untuk kasus khusus
- [ ] Deteksi fake GPS (heuristic + server validation)
- [ ] PWA untuk pengalaman mobile lebih baik

---

## 📜 Lisensi

MIT

---

## 👨‍💻 Catatan Developer

- Gunakan branch per fitur: `feat/...`, `fix/...`
- Gunakan Pull Request sebelum merge ke `main`
- Komunikasi teknis dan dokumentasi menggunakan **Bahasa Indonesia**
---

## ⚙️ Halaman Pengaturan Sistem (API Key Supabase, GitHub, Vercel, Sinkronisasi)

Project ini menyertakan contoh **halaman pengaturan sistem** untuk:
- Menampilkan status konfigurasi **Supabase**, **GitHub**, dan **Vercel**
- Mengatur preferensi sistem (contoh: lokasi kantor, radius absensi)
- (Opsional) Menyimpan token integrasi **secara aman** melalui API server-side

> Rekomendasi terbaik: **jangan pernah menyimpan** `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_TOKEN`, atau `VERCEL_TOKEN` di frontend.  
> Gunakan **Environment Variables** (Vercel / local `.env.local`) dan akses hanya di server.

### File contoh yang disediakan

- `app/settings/page.jsx` → UI pengaturan (Tailwind)
- `app/api/settings/route.js` → API server untuk menyimpan/mengambil pengaturan (server-only)
- `lib/crypto.js` → util enkripsi sederhana (AES-GCM) untuk menyimpan token (opsional)
- `supabase/schema_settings.sql` → contoh tabel `system_settings` (RLS admin-only)

### Env yang direkomendasikan

Tambahkan ini ke `.env.local` (local) / Vercel Environment Variables:

```env
# Supabase (PUBLIC untuk client)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Supabase (SERVER ONLY - jangan pakai prefix NEXT_PUBLIC)
SUPABASE_SERVICE_ROLE_KEY=...

# Token integrasi (SERVER ONLY)
GITHUB_TOKEN=...
VERCEL_TOKEN=...

# Kunci enkripsi untuk menyimpan token secara terenkripsi (SERVER ONLY)
SETTINGS_ENCRYPTION_KEY=base64-32bytes
```

### Rekomendasi terbaik (praktik aman & rapi)

1. **Rahasia/Token simpan sebagai ENV**, bukan di database, kecuali benar-benar butuh UI untuk mengganti token.
2. Jika perlu UI untuk mengganti token:
   - Simpan token **terenkripsi** (AES-GCM) via endpoint server (`app/api/settings`).
   - Batasi akses: hanya role admin (RLS) + validasi session server-side.
3. **Masking** token di UI (tampilkan hanya 4 karakter terakhir).
4. Logging: jangan log token ke console/server log.
5. Buat **audit trail** perubahan (siapa, kapan) jika sistem dipakai tim.
---

## 🧭 Routing yang tersedia (contoh)

- `/` → Landing page (AbsensiKu style SaaS)
- `/auth/login` → Login pegawai
- `/employee` → Dashboard pegawai (absensi + riwayat + pagination)
- `/org/register-admin` → Registrasi admin organisasi
- `/org` → Dashboard admin organisasi (CRUD pegawai + pagination)
- `/admin` → Dashboard superadmin (CRUD organisasi + pagination)
- `/settings` → Pengaturan sistem (Supabase/GitHub/Vercel + preferensi)

## 🧱 Fitur tambahan (mengarah ke konsep “presence guard”)

- Geofence radius lokasi
- Anti kecurangan (opsional: validasi jaringan/perangkat, audit log)
- Selfie/Foto bukti (opsional)
- Shift & jadwal kerja (opsional)
- Izin/cuti/lembur (opsional)
- Dashboard & laporan (opsional)

---

## 🐞 Error Logging (Aktif)

Sistem sudah menambahkan logging error agar masalah lebih cepat dilacak:

- Frontend menangkap:
  - Error runtime (`window.error`)
  - Promise rejection (`window.unhandledrejection`)
  - Error render React via `ErrorBoundary`
  - Error HTTP/API global via interceptor `fetch` (status `>= 400` dan network error)
  - Error dari flow reset/ganti password dengan metadata konteks
- Error frontend disimpan di `localStorage` key: `absensiku:error_logs`
- Error backend Edge Function mengembalikan `trace_id` di respons error (module OTP, billing, registrasi, webhook, dll).
- UI akan menampilkan referensi error saat gagal, format:
  - `Ref: <trace_id>` dari backend
  - `[Log: <ERR-...>]` dari frontend

### Cara cek log cepat di browser

Buka DevTools Console, lalu jalankan:

```js
window.absensikuErrorLogs?.()
```

Hapus log:

```js
window.clearAbsensikuErrorLogs?.()
```

Saat melaporkan bug, kirim `Ref` dan `Log` id agar bisa ditrace cepat.

### Auto-fix cepat

Untuk mencoba perbaikan otomatis saat ada error:

```bash
npm run autofix
```

Perintah ini menjalankan:
- `eslint --fix` (auto-fix lint yang memungkinkan)
- validasi ulang `lint`
- validasi `build`

---

## 🔎 Verifikasi Streak Monitoring (Supabase Remote)

Script ini membantu verifikasi data di `/admin/streak-monitoring` dengan klasifikasi:
- `active`
- `near`
- `suspended`

Perintah:

```bash
npm run streak:summary
```

Seed data sample (3 tenant) + backup otomatis:

```bash
npm run streak:seed-sample
```

Restore dari backup:

```bash
npm run streak:restore -- artifacts/streak-fixtures/backups/<nama-file-backup>.json
```

Lokasi backup:
- `artifacts/streak-fixtures/backups/`

---

## 📩 Notifikasi Invoice Grace Period (Email + WhatsApp)

Sistem sekarang menyediakan Edge Function `billing-grace-notifier` untuk mengirim notifikasi tagihan saat tenant masuk fase grace period streak billing.

### Mekanisme

- Sumber data tenant: `stability_streaks` status `ready_for_invoicing` atau `grace_period`.
- Invoice yang diproses: invoice `PENDING/AWAITING_VERIFICATION` per tenant (prioritas invoice streak).
- Channel yang dipakai:
  - Email: setting `system_settings.key = email_gateway`
  - WhatsApp: setting `system_settings.key = whatsapp_gateway`
- Tahap notifikasi:
  - `GRACE_PERIOD_ENTERED`: kirim awal saat tenant masuk grace period.
  - `GRACE_PERIOD_REMINDER`: pengingat periodik selama grace period belum dibayar.
  - `GRACE_PERIOD_LAST_DAY`: pengingat khusus hari terakhir grace period.
  - `GRACE_PERIOD_EXPIRED`: pengingat saat grace sudah lewat namun status belum tersinkron.
- Anti duplikat:
  - `ENTERED`, `LAST_DAY`, `EXPIRED` hanya dikirim sekali per channel per invoice.
  - `REMINDER` dikirim berkala berdasarkan interval (`BILLING_NOTIFIER_REMINDER_HOURS`).

### Secret yang dibutuhkan

Tambahkan secret Edge Function:

```bash
supabase secrets set BILLING_NOTIFIER_SECRET=isi_secret_acak
```

`BILLING_NOTIFIER_SECRET` dipakai lewat header `x-cron-secret`.
Opsional: `BILLING_NOTIFIER_RETRY_MINUTES` (default `60`) untuk jeda retry agar log gagal tidak spam.
Opsional: `BILLING_NOTIFIER_REMINDER_HOURS` (default `24`) untuk interval kirim ulang reminder.

### Jalankan manual (dry-run)

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/billing-grace-notifier" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: <BILLING_NOTIFIER_SECRET>" \
  -d '{"dry_run": true, "limit": 100}'
```

### Jalankan manual (kirim real)

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/billing-grace-notifier" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: <BILLING_NOTIFIER_SECRET>" \
  -d '{"dry_run": false, "limit": 100}'
```

Respon menyertakan `trace_id` untuk pelacakan error.

### Uji regresi: tidak bayar sampai grace berakhir

```bash
npm run streak:test-grace-expired
```

Script ini akan:
- menyiapkan tenant uji dengan `grace_period_end` yang sudah lewat,
- membuat invoice `PENDING`,
- (opsional) memanggil `billing-grace-notifier` mode dry-run untuk cek reason reminder,
- mengeksekusi `sync_streak_subscription_status`,
- memverifikasi subscription menjadi `expired`.

---

## ⏱️ Halaman Informasi Cron

Halaman baru untuk monitoring seluruh task cron:

- Route: `/admin/cron-jobs`
- Isi:
  - Registry semua cron task sistem (attendance, maintenance, billing).
  - Status schedule aktif dari `pg_cron`.
  - Riwayat run dari `cron.job_run_details`.
  - Log internal dari tabel `cron_job_logs`.
  - Tombol **Sinkron Jadwal** (RPC `ensure_system_cron_jobs`).

Cron task standar yang dikumpulkan:

- `attendance-ingest-worker`
- `cleanup-gps-daily`
- `analyze-partitions-daily`
- `cleanup-audit-logs-weekly`
- `create-next-month-partition-monthly`
- `streak-subscription-sync-daily`
- `billing-grace-notifier-10m`

---

## 🤖 Multi-Model Orchestration (Tetap)

Workflow ini memecah task besar menjadi subtask independen, lalu mengeksekusi subtask tersebut secara paralel dengan model berbeda.

File:
- `scripts/multi-model-orchestrator.mjs`
- `scripts/multi-model.config.json`

### Setup

API key bersifat opsional:

```env
OPENAI_API_KEY=your_api_key
```

Jika `OPENAI_API_KEY` tidak tersedia, orchestrator tetap berjalan dalam mode lokal (tanpa API call).

### Jalankan

Planner + eksekusi subtask paralel:

```bash
npm run orchestrate:models -- --task "Audit dan perbaiki modul /org/ end-to-end"
```

Simulasi tanpa API call:

```bash
npm run orchestrate:models -- --task "Perbaiki performa login" --dry-run
```

Paksa mode lokal (meski API key ada):

```bash
npm run orchestrate:models -- --task "Perbaiki performa login" --local
```

Pakai file subtask sendiri:

```bash
npm run orchestrate:models -- --task-file artifacts/subtasks.json
```

### Output artifacts

Disimpan otomatis ke:
- `artifacts/model-orchestration/<run-id>/run-info.json`
- `artifacts/model-orchestration/<run-id>/plan.json`
- `artifacts/model-orchestration/<run-id>/results.json`
- `artifacts/model-orchestration/<run-id>/summary.md`
- `artifacts/model-orchestration/<run-id>/*.md` (hasil tiap subtask)

### Mapping model default

Default mapping sudah mengikuti preferensi:
- arsitektur: `gpt-5.3-codex`
- implementasi: `gpt-5.2-codex`
- review: `gpt-5.1-codex-max`
- boilerplate: `gpt-5.1-code-mini`
- fallback: `gpt-5.2`

Ubah sesuai kebutuhan di `scripts/multi-model.config.json`.

---

## 🏗️ Builder Mode (Generate → Validate)

Mode ini untuk workflow cepat ala builder: eksekusi task, autofix, lalu validasi paralel.

File:
- `scripts/builder-mode.mjs`

Jalankan cepat:

```bash
npm run builder:quick
```

Jalankan penuh:

```bash
npm run builder:full
```

Dengan task utama (akan memanggil orchestrator dulu):

```bash
npm run builder -- --profile quick --task "Audit dan perbaiki /org/notifications end-to-end"
```

Opsi penting:
- `--max-parallel <n>`: jumlah validasi paralel (default `3`)
- `--with-smoke`: tambah smoke checks
- `--skip-orchestrate`: lewati tahap orchestrator
- `--skip-autofix`: lewati `npm run autofix`
- `--skip-validate`: hanya jalankan tahap awal
- `--skip-faq-offer`: lewati hook penawaran FAQ otomatis
- `--dry-run`: simulasi tanpa eksekusi command

Catatan:
- `builder` sekarang menjalankan hook **penawaran FAQ otomatis** (`npm run faq:offer`) setelah batch selesai, agar setiap perubahan fitur selalu diikuti usulan update FAQ.

### Mekanisme permanen update FAQ

Gunakan command berikut untuk governance FAQ:

```bash
npm run faq:offer   # tampilkan modul terdampak + usulan FAQ
npm run faq:ack     # tandai bahwa FAQ sudah ditinjau/diperbarui
npm run faq:check   # mode ketat (gagal jika perubahan fitur belum di-ack)
```

Artifact otomatis:
- `artifacts/faq-offer/latest.json`
- `artifacts/faq-offer/latest.md`

---

## 🧭 Full Auto Orchestration

Satu command untuk chain otomatis:
- intake spec/task
- model orchestration
- builder pipeline (autofix + quality gates)
- optional migration hook
- optional preview hook
- artifacts report

File:
- `scripts/full-orchestrator.mjs`
- `ops/orchestration-spec.template.md`

Contoh jalankan dengan task:

```bash
npm run orchestrate:full -- --task "Audit dan perbaiki notifikasi /org/ ke /employee end-to-end"
```

Contoh jalankan dari spec file:

```bash
npm run orchestrate:full -- --spec-file ops/orchestration-spec.template.md --profile full --with-smoke
```

Artifacts output:
- `artifacts/full-orchestration/<run-id>/run.json`
- `artifacts/full-orchestration/<run-id>/summary.md`

Catatan:
- Migration hook hanya dijalankan jika script `db:migrate` atau `supabase:push` tersedia.
- Preview hook memberi status kesiapan; deploy tetap manual sesuai policy.

## ⚙️ Local-Native Orchestration (One Command)

Pipeline lokal terpadu untuk generate + validate + preview:

- intake spec/task
- orchestration model lokal (`--local`)
- builder pipeline (`autofix -> lint -> test -> build`)
- optional migration hook
- preview server lokal + smoke check
- artifact report

Command:

```bash
npm run local:orchestrate -- --task "Implementasi fitur X end-to-end"
```

Pakai spec:

```bash
npm run local:orchestrate -- --spec-file ops/orchestration-spec.template.md
```

Dry run:

```bash
npm run local:orchestrate -- --task "Audit /org/dashboard" --dry-run
```

Artifacts output:
- `artifacts/local-orchestration/<run-id>/run.json`
- `artifacts/local-orchestration/<run-id>/summary.md`

---

## ⚡ Ops Readiness (Agar Kerja Lebih Cepat)

Untuk mempercepat pembagian task besar, siapkan data minimum berikut:

- akun uji per role
- dataset uji inti
- rute smoke-check prioritas

Lokasi file:
- `ops/working-profile.json`
- `ops/smoke-routes.json`
- `ops/test-accounts.template.json`
- `ops/test-dataset.template.json`
- `ops/README.md`

Inisialisasi file lokal (tidak dipush):

```bash
npm run ops:readiness -- --init
```

Validasi kelengkapan:

```bash
npm run ops:readiness
```

Jika output `Ops readiness: SIAP`, berarti kebutuhan minimum sudah lengkap untuk eksekusi paralel yang lebih cepat.

Audit route prioritas (`/admin`, `/org`, `/employee`, `/dashboard`):

```bash
npm run routes:trace
```

Perintah ini mengecek:
- route yang didefinisikan di `src/App.tsx`
- path yang dipanggil lewat `navigate/to/href` di `src/`
- kecocokan dengan `ops/smoke-routes.json`
