# SOP per Role

Dokumen ini merangkum SOP ringkas per role kerja di repo `ABSENSIKU`.

Catatan umum:
- [`.env.local`](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/.env.local) dan [`.env.online`](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/.env.online) tetap `hands-off` tanpa perintah eksplisit.
- Database sumber kebenaran adalah Supabase remote.
- Gunakan [docs/cheatsheet-tool-per-task.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/cheatsheet-tool-per-task.md) sebagai panduan tool dasar.

## Frontend

Fokus:
- [src](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src)
- route, halaman, komponen, state UI, dan smoke route

Urutan kerja:
1. Audit route atau file target dengan `rg`
2. Baca konteks file terkait
3. Patch per batch kecil
4. Jalankan lint atau smoke sesuai risiko
5. Update memory dan FAQ offer

Checklist:
- route aktif tetap ada di [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx)
- jangan ubah source sensitif tanpa cek dampak ke `/admin`, `/org`, `/org/hr`, `/org/payroll`, `/employee`
- verifikasi minimal dengan browser jika menyentuh routing atau auth

## Backend dan Supabase

Fokus:
- [api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api)
- [supabase](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase)

Urutan kerja:
1. Audit endpoint atau migration dengan read-only command
2. Backup bila perubahan sensitif
3. Patch file backend atau migration
4. Jalankan validasi yang relevan
5. Catat risiko dan next action di memory

Checklist:
- jangan asumsikan localhost DB sebagai sumber kebenaran
- cek `vercel.json` bila perubahan menyentuh rewrite atau API path
- hati-hati pada delete state migration

## Android

Fokus:
- [android-webview](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview)

Urutan kerja:
1. Build APK
2. Uji login atau flow utama
3. Ambil bukti seperlunya
4. Arsipkan artefak uji
5. Pastikan dokumen aktif dan arsip tetap rapi

Checklist:
- jangan campur source runtime dengan artefak uji
- jangan biarkan screenshot debug menumpuk di root
- update README atau document map jika struktur berubah

## Operator dan Release

Fokus:
- readiness
- smoke route
- quality gate
- handover

Urutan kerja:
1. Cek status local vs git
2. Pastikan perubahan runtime vs dokumentasi terpisah jelas
3. Jalankan smoke test prioritas tinggi
4. Lakukan full gate hanya jika memang menuju release
5. Tutup dengan memory dan FAQ

Checklist:
- jangan deploy otomatis tanpa perintah eksplisit
- verifikasi `local != git != vercel`
- dokumentasikan risiko yang belum selesai

## Dokumentasi dan Cleanup

Fokus:
- [docs](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs)
- arsip
- referensi path

Urutan kerja:
1. Bedakan dokumen aktif dan historis
2. Pindah arsip, jangan hapus sembarangan
3. Patch referensi yang putus
4. Pastikan cleanup tidak menyentuh source runtime

Checklist:
- `apps/` bukan sampah
- `docs/archive` harus tetap punya entry point
- jangan pindahkan file yang dipakai runtime publik tanpa audit
