# UAT Simulasi Logout Web Saat Sesi WebView Aktif

- Tanggal uji: 2026-03-20
- Domain: Absensi
- Area: Auth Web Umum + Native Login Android
- Environment: localhost UI + remote Supabase
- Metode: Playwright multi-page dengan simulasi bridge Android pada halaman WebView

## Tujuan
Menguji lebih awal apakah logout dari web memutus sesi yang sedang aktif pada runtime WebView, sebelum validasi final dilakukan di APK Android nyata.

## Catatan Metode
- Skenario ini belum memakai APK Android nyata. Runtime native disimulasikan dengan `window.Android` mock pada halaman `/employee/dashboard`.
- Browser profile yang sama dipakai untuk dua halaman:
  - halaman `web` login via `/auth` dan logout via `/dashboard`
  - halaman `native-sim` membuka `/employee/dashboard` dengan bridge Android mock aktif
- Temuan audit paralel: repo ini tidak punya setting invalidation lintas web/native yang terpisah; perilaku logout saat ini bergantung pada `supabase.auth.signOut()` default global dan listener `SIGNED_OUT` di runtime WebView.

## Hasil

| ID | Skenario | Hasil | Bukti | Catatan |
|---|---|---|---|---|
| UAT-WEB-NATIVE-01 | Logout dari web memicu invalidation pada runtime WebView yang aktif | LULUS (simulasi) | `webFinalUrl = /auth`, `nativeFinalUrl = /employee/login?native=1`, event `showNativeLogin` dengan pesan `Sesi telah berakhir. Silakan login kembali.` | Simulasi bridge menunjukkan kontrak event dan redirect bekerja dalam browser profile yang sama |

## Ringkasan
- Simulasi Playwright `1/1` lulus.
- Evidence yang terkumpul cukup untuk menyatakan kontrak invalidation lintas sesi sudah terlihat pada runtime WebView simulasi.
- Namun skenario checklist `Logout dari web saat APK sedang aktif` belum sah ditutup penuh tanpa verifikasi browser web + APK Android/WebView nyata pada dua runtime terpisah.
- Status final checklist tetap `Khusus device nyata`.
