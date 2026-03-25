# UAT Quality Gate Rilis

## Metadata
- Tanggal: 2026-03-20
- Scope: quality gate penuh sebelum rilis web dan APK debug
- Environment: lokal repo `ABSENSIKU`
- Device / Browser: terminal lokal
- Build / Versi: source tree per 2026-03-20
- Penguji: Codex

## Ringkasan hasil
- Total skenario diuji: 6
- Lulus: 6
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-QG-01 | Quality Gate | `npm run autofix` selesai tanpa error | LULUS | `npm run autofix` selesai dan menutup lint + build internal | - | Tersisa 4 warning non-blocking: 1 `react-hooks/exhaustive-deps` dan 3 `@typescript-eslint/no-explicit-any` |
| UAT-QG-02 | Quality Gate | `npm run lint` lolos | LULUS | `autofix` memvalidasi `eslint .` dan selesai sukses | - | Warning yang tersisa tidak memblokir gate |
| UAT-QG-03 | Quality Gate | `npm test` lolos | LULUS | Vitest: `25` file test lulus, `119` test lulus, durasi `4.70s` | - | Tidak ada test gagal |
| UAT-QG-04 | Quality Gate | `npm run build` lolos | LULUS | Vite build produksi sukses, termasuk `prebuild` sitemap dan output `✓ built in 45.94s` | - | Ada warning `Browserslist` data lama, tidak memblokir build |
| UAT-QG-05 | Quality Gate | `./gradlew --no-daemon assembleDebug -Pkotlin.incremental=false` lolos | LULUS | Gradle `BUILD SUCCESSFUL in 1m 19s`, task `:app:assembleDebug` selesai | - | Ada warning AGP `8.5.2` vs `compileSdk=35` dan beberapa warning deprecated Kotlin/Android, tetapi APK debug tetap terbangun |
| UAT-QG-06 | Quality Gate | Verifikasi live endpoint utama setelah deploy lolos | LULUS | `curl -I -L` ke `https://absensiku-alpha.vercel.app/`, `/download`, `/auth`, `/org/login`, `/employee/dashboard`, dan `/downloads/AbsensiKu-Android-1.0.7.apk` semuanya merespons `HTTP 200`; Playwright production memverifikasi halaman `/download` menampilkan `Unduh Aplikasi Android AbsensiKu` dan `/auth` menampilkan form `Login Pegawai AbsensiKu` | - | APK live merespons `content-type: application/vnd.android.package-archive`, sehingga endpoint publik dan auth utama production terjangkau normal pada 20 Maret 2026 |

## Risiko tersisa
- Warning lint non-blocking masih ada di:
  - `src/pages/employee/EmployeeDashboardNew.tsx`
  - `tests/e2e/hr-complete-button-audit.e2e.ts`
  - `tests/e2e/hr-quick-button-audit.e2e.ts`
- Warning Android build masih ada untuk kompatibilitas AGP `8.5.2` dengan `compileSdk=35`.
- Gate ini belum mencakup device nyata dan belum membuktikan runtime Android yang masih terbuka seperti `session expired`, `host allowlist`, dan `origin geolocation allowlist`.

## Tindak lanjut
- Rapikan warning lint tersisa agar gate rilis benar-benar bersih tanpa warning.
- Pertimbangkan upgrade Android Gradle Plugin agar warning `compileSdk=35` hilang.
- Lanjutkan batch Android runtime di emulator/device nyata untuk gap yang masih tersisa.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
