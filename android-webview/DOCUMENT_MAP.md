# Peta Dokumen Android WebView

Dokumen di folder `android-webview` sudah cukup banyak. File ini menentukan mana yang menjadi sumber utama, mana yang referensi operasional, dan mana yang bersifat historis.

Dokumen historis, audit, laporan uji, dan setup environment sekarang sudah dipindahkan ke subfolder `android-webview/docs/` agar root folder tetap fokus pada dokumen aktif.

## Sumber utama

Dokumen yang seharusnya dibaca lebih dulu:

- [README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/README.md)
  ringkasan arsitektur, status implementasi, kebijakan keamanan, build, dan katalog error
- [ARCHITECTURE_SECURITY.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/ARCHITECTURE_SECURITY.md)
  rincian arsitektur hybrid, kebijakan keamanan, kontrak bridge, dan kebijakan sesi/buffer
- [panduan.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/panduan.md)
  arah arsitektur hybrid, kontrak API mobile auth, dan gap desain yang masih relevan
- [todo.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/todo.md)
  backlog aktif untuk pekerjaan Android WebView

## Operasional dan pengujian

Dokumen yang dipakai saat install, smoke test, atau investigasi runtime:

- [TEST_GUIDE.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/TEST_GUIDE.md)
- [TEST_CREDENTIALS.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/TEST_CREDENTIALS.md)
- [TROUBLESHOOTING_LOGIN.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/TROUBLESHOOTING_LOGIN.md)

## Referensi audit dan perbandingan

Masih berguna untuk memahami parity web vs native, tetapi bukan sumber status implementasi harian:

- [AUDIT_MEKANISME_1TO1.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/audit/AUDIT_MEKANISME_1TO1.md)
- [NATIVE_VS_WEB_COMPARISON.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/audit/NATIVE_VS_WEB_COMPARISON.md)
- [UI_GAP_ANALYSIS.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/audit/UI_GAP_ANALYSIS.md)

## Histori implementasi

Dokumen di bawah ini lebih tepat dibaca sebagai jejak perubahan, catatan fix, atau eksperimen yang sudah lewat:

- [BOOTSTRAP_FIX.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/history/BOOTSTRAP_FIX.md)
- [BOOTSTRAP_DEBUG_GUIDE.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/history/BOOTSTRAP_DEBUG_GUIDE.md)
- [DYNAMIC_TENANT_BRANDING.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/history/DYNAMIC_TENANT_BRANDING.md)
- [FINAL_UI_FIXES.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/history/FINAL_UI_FIXES.md)
- [UI_FIX_SUMMARY.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/history/UI_FIX_SUMMARY.md)
- [ORG_DIALOG_FIX.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/history/ORG_DIALOG_FIX.md)
- [FIX_SUMMARY.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/history/FIX_SUMMARY.md)
- [qwen.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/history/qwen.md)

## Laporan uji historis

Dokumen ini menyimpan bukti eksekusi uji pada waktu tertentu. Gunakan sebagai arsip, bukan sebagai status terbaru:

- [TEST_REPORT_2026-03-10.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/reports/TEST_REPORT_2026-03-10.md)
- [TEST_REPORT_LOGIN_ATTEMPT.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/reports/TEST_REPORT_LOGIN_ATTEMPT.md)
- [FINAL_TEST_REPORT.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/reports/FINAL_TEST_REPORT.md)

## Setup environment

Dokumen setup berikut tetap berguna, tetapi hanya saat benar-benar butuh emulator atau akses remote:

- [EMULATOR_SETUP.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/setup/EMULATOR_SETUP.md)
- [GENYMOTION_SETUP_QUICK.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/setup/GENYMOTION_SETUP_QUICK.md)
- [REMOTE_ACCESS_GUIDE.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/setup/REMOTE_ACCESS_GUIDE.md)

## Aturan baca cepat

- Jika ingin tahu kondisi modul saat ini, mulai dari `README.md`.
- Jika butuh detail arsitektur dan keamanan yang lebih dalam, lanjutkan ke `ARCHITECTURE_SECURITY.md`.
- Jika ingin tahu arah desain yang belum selesai, lanjut ke `panduan.md` lalu `todo.md`.
- Jika sedang menguji APK, pakai `TEST_GUIDE.md` dan `TROUBLESHOOTING_LOGIN.md`.
- Jika menemukan dokumen yang isinya bertabrakan dengan `README.md`, anggap `README.md` sebagai sumber utama kecuali ada catatan eksplisit yang lebih baru.
