# Checklist Harian Per Role

Dokumen ini memberi checklist ringkas per role kerja agar eksekusi harian di repo `ABSENSIKU` lebih konsisten.

## Frontend

Mulai kerja:
1. tentukan route/halaman target
2. pastikan apakah task menyentuh auth server-side
3. pilih command lokal yang benar:
   `npm run dev` atau `npm run dev:parity`
4. cek file scope sebelum edit

Saat implementasi:
1. edit hanya file dalam scope
2. jika task menyentuh login/OTP/rate limit, pastikan auth lokal aktif
3. baca diff per file sebelum lanjut batch berikutnya

Sebelum selesai:
1. lint file terkait
2. jika perubahan auth/role kritikal, jalankan build
3. catat risiko tersisa
4. update memory task
5. tawarkan/update FAQ bila relevan

## Backend / Supabase

Mulai kerja:
1. tentukan apakah task benar-benar perlu sentuh `api/*` atau `supabase/*`
2. cek apakah perubahan termasuk kategori sensitif
3. bila sensitif, backup dulu:
   `npm run db:backup:supabase`
4. siapkan auth lokal jika route API perlu diuji

Saat implementasi:
1. jaga scope file tetap kecil
2. catat migration/query penting
3. jangan anggap DB localhost sebagai default
4. verifikasi object/schema sebelum `repair` atau perubahan remote

Sebelum selesai:
1. lint/build sesuai risiko
2. verifikasi route API atau schema yang berubah
3. tulis validation dan risk ke memory task
4. tawarkan/update FAQ bila perubahan berdampak ke operasional

## Operator / Release

Mulai kerja:
1. tentukan target verifikasi
2. cek apakah butuh localhost:
   `npm run ops:sandbox:doctor:strict`
3. pilih command validasi sesuai risiko
4. cek apakah workspace sedang dirty dan file mana yang relevan

Saat verifikasi:
1. jalankan readiness/smoke yang relevan
2. catat hasil, error, dan `ref_id`/`trace_id` bila ada
3. kalau auth flow diuji, gunakan `dev:parity` bila perlu

Sebelum selesai:
1. pastikan hasil validasi tercatat
2. update memory task
3. jalankan `npm run faq:offer` bila perubahan berdampak operasional
4. jangan push/deploy tanpa instruksi eksplisit

## Semua Role

Checklist universal:
1. baca scope task dengan jelas
2. jangan menyapu file di luar scope
3. jangan pakai `git add .`
4. jangan ubah remote DB tanpa sadar bahwa itu live
5. tutup task dengan perubahan, validasi, dan risiko tersisa
