# TODO Android WebView (AbsensiKu)

## Prioritas Tinggi
- Finalisasi policy absensi skala besar: saat jam sibuk simpan absensi di local device dulu, lalu tahan sinkronisasi utama sampai window sibuk lewat.
- Ubah implementasi absensi dari `deferred singkat` menjadi `peak-hour hold + off-peak sync` yang konsisten.
- Pastikan jalur ingest absensi benar-benar `queue-only` pada request user saat peak hour.
- Pastikan UX absensi peak-hour konsisten: catatan langsung muncul di dashboard sebagai optimistic record, tetapi badge/notifikasi harus membedakan `tersimpan di perangkat`, `menunggu sinkronisasi`, dan `sudah tercatat di server`.
- Pertahankan dan dokumentasikan `app_code` native (`BuildConfig.APP_CODE` / `attendance_security.native_app_code`) saat rollout APK baru.
- Pastikan setiap rilis APK publik memakai versi terbaru yang sudah membawa validasi `app_code`.
- Pastikan alur bootstrap sesi stabil di kondisi jaringan lambat.
- Tambah pembersihan cache tenant saat logout.
- Perketat keamanan JS bridge (hanya aktif saat bootstrap).
- Sepakati spesifikasi endpoint mobile auth (login, session, logout, forgot/reset).
- Implementasi API mobile auth yang mengembalikan JSON + Set-Cookie sesi web.
- Sinkronisasi cookie login native ke `CookieManager` sebelum buka `/employee/dashboard`.
- Bypass `/employee/login` di APK ke flow native/bootstrap.
- Terapkan pola API+cookie bridge ke ABSENSIKU sesuai kesepakatan.
- Login native **tanpa captcha**.
- Implementasi penyimpanan username & password (terenkripsi).
- Parity UX login native dengan web: eye, lupa password, reset password, OTP WA/Email.
- Pastikan buffer absensi WebView tidak terhapus (perilaku sama seperti web login).
- Definisikan **kontrak error code + mapping UX native** (termasuk `Ref ID`).
- Tetapkan **rate limit server-side** sebagai pengganti captcha (cukup login saja).
- Tetapkan **sumber kebenaran sesi** (cookie vs token), TTL, refresh, dan kondisi expired.
- Tetapkan **kebijakan logout** (hapus cookie, sesi, cache) yang konsisten.
- Uji **loop redirect** (login → bootstrap → dashboard) dan pastikan fail-closed ke native tanpa loop.
- Pastikan implementasi mengikuti pola `ESYATOUR/android-finance-webview`.
- OTP WA/Email end-to-end di native (request, verify, reset).
- Session restore saat app cold start.
- Logout: pastikan cookie + session + cache clear sesuai kebijakan.
- Uji keamanan: XSS WebView, mixed content, dan host allowlist.
- Uji buffer absensi agar tidak terhapus saat logout/clear WebView.
- Preflight API (status app, maintenance, min version).
- Forced update untuk versi APK minimum.
- App attestation (Play Integrity) untuk hardening APK clone.
- Device binding server-side (fail‑closed jika device berubah).
- Session invalidation policy (logout web memutus APK).
- Offline notice khusus saat WebView gagal load.
- Retry/backoff saat bootstrap atau refresh.
- Pastikan semua error auth punya `Ref ID`.
- Tambahkan CSP di web app untuk mitigasi XSS.
- Pastikan WebView debug nonaktif di release dan `mixedContentMode` aman.
- Tetapkan kebijakan retry login/OTP.
- Pastikan logging tidak menyimpan token/kredensial.
- Buat checklist UAT ringkas khusus login/OTP/logout/session expired.
- Finalisasi kontrak API mobile auth + schema + error code + payload/response (termasuk `Ref ID`).
- Kerjakan implementasi inti APK native login → `/employee/dashboard` terlebih dulu.
- Uji/test dilakukan **setelah** implementasi inti 100% selesai.

## Prioritas Menengah
- Tambah indikator read-only `native_app_code` di panel keamanan admin agar operator tahu kode aktif tanpa mengubah payload lain.
- Siapkan prosedur rotasi `app_code` ringan jika APK lama perlu diputus.
- Tambah `<queries>` di manifest untuk deteksi aplikasi Fake GPS (Android 11+).
- Standarkan error dengan `Ref ID` di semua flow auth.
- Tambah fallback/UX untuk konfigurasi Supabase tidak cocok.
- Siapkan kontrak response JSON dan error code untuk mobile auth.

## Prioritas Rendah
- Dokumentasi uji manual lebih ringkas untuk QA.
- Audit ulang kebijakan cache WebView (IndexedDB/Storage).
