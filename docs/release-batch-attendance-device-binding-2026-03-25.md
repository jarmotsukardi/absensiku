# Batch Rilis 1: Attendance Sync + Device Binding

Tanggal: 25 Maret 2026

## Tujuan

Menyiapkan batch rilis pertama yang paling kritikal untuk produksi:

- memastikan absensi tidak nyangkut di perangkat
- menyamakan sumber `device_id` di jalur login, dashboard, reset device, dan sync absensi
- mencegah `localhost` yang masih menunjuk ke Supabase production menulis data absensi publik tanpa sengaja

Dokumen ini adalah paket kerja rilis, bukan bukti bahwa batch sudah dideploy.

## Artefak Batch

- Daftar audit global:
  - `docs/admin-org-local-online-audit-2026-03-25.md`
- Checksum subset batch ini:
  - `artifacts/audit/attendance-device-binding-batch-checksums-20260325.json`

## File Wajib Ikut Batch

### Hook dan library inti

- `src/hooks/useAttendance.ts`
- `src/hooks/useAttendanceSync.ts`
- `src/hooks/useDeviceBinding.ts`
- `src/lib/attendanceClientContext.ts`
- `src/lib/attendanceDB.ts`
- `src/lib/attendanceResilience.ts`
- `src/lib/attendanceSyncPolicy.ts`
- `src/lib/deviceId.ts`
- `src/lib/runtimeEnvironment.ts`
- `src/lib/timezone.ts`

### Guard localhost ke production

- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/localhostWriteGuard.ts`
- `src/components/common/LocalhostProductionGuardBanner.tsx`
- `src/App.tsx`

### Jalur pegawai yang menyentuh device binding

- `src/pages/employee/EmployeeLogin.tsx`
- `src/pages/employee/EmployeeDashboardNew.tsx`
- `src/components/employee/DeviceResetDialog.tsx`

### Test pendamping

- `src/lib/attendanceClientContext.test.ts`
- `src/lib/attendanceSyncPolicy.test.ts`
- `src/lib/runtimeEnvironment.test.ts`
- `src/integrations/supabase/localhostWriteGuard.test.ts`

### Kontrak env dan type

- `.env.example`
- `src/vite-env.d.ts`

## File Pendukung yang Perlu Dicek Saat Rilis

File ini tidak harus berubah di batch, tetapi perlu dicek kompatibilitasnya:

- `src/hooks/useSessionManagement.ts`
- `src/hooks/useOptimizedLogin.ts`
- `src/components/employee/AttendanceCard.tsx`
- `src/lib/androidBridge.ts`

Alasannya:

- file-file itu membaca `getAndroidId()` atau memakai data dari hook absensi/device binding
- kalau ada asumsi lama `WEB-*` vs `AND-*`, perilaku UI bisa tidak konsisten walau batch inti sudah naik

## File yang Sebaiknya Tidak Ikut Batch Ini

Tahan di batch lain:

- seluruh `src/pages/admin/*`
- seluruh `src/pages/org/*`
- seluruh `src/components/admin/*`
- seluruh `src/components/org/*` selain `DeviceResetDialog`
- seluruh `src/lib/billing*`
- seluruh `src/lib/payroll*`
- seluruh `src/lib/hr*`
- seluruh `src/pages/org/payroll/*`

Alasan:

- batch ini harus tetap kecil dan fokus ke sinkronisasi absensi + proteksi data publik
- billing, FCM, HR, dan payroll sudah punya scope rilis sendiri

## Dependency Tambahan yang Ikut Saat Rollout

Saat rollout dari worktree bersih, batch inti ternyata belum cukup untuk menghasilkan build yang valid. Baseline source saat ini masih bergantung pada beberapa util/config lokal yang belum masuk baseline git yang rapi. Karena itu rollout final ikut membawa dependency support berikut:

- `src/lib/employeeAuthRoutes.ts`
- `src/lib/scalabilityConfig.ts`
- `src/lib/errorLoggingPolicy.ts`
- `src/lib/apkDownload.ts`
- `src/config/android-apk-release.json`
- `src/lib/attendanceLogoutPolicy.ts`
- `src/lib/auditLoggingPolicy.ts`
- `src/lib/latePermissionRequest.ts`
- `src/lib/supabaseRestClient.ts`
- `src/components/common/TablePaginationFooter.tsx`
- `src/hooks/useOrgHrContextNavigate.ts`
- `src/lib/orgHrOverlay.ts`
- `src/lib/adminHrPageGuide.ts`

Catatan:

- file-file ini ikut **bukan** karena menjadi fokus batch produk, tetapi karena dibutuhkan agar worktree rilis bisa dibuild dan dideploy dari source yang konsisten
- ini menandakan baseline source saat ini masih punya dependency lintas domain yang belum sepenuhnya terisolasi

## Risiko Jika Batch Ini Belum Naik

- absensi bisa berhasil di perangkat tetapi gagal masuk ke server
- status perangkat di UI bisa terlihat `cocok`, padahal server menolak payload absensi
- `localhost` yang masih mengarah ke Supabase production bisa tetap menulis data publik
- queue absensi offline bisa kelihatan sehat di UI tetapi terus gagal diproses di backend

## Risiko Jika Batch Ini Naik Sendiri

- banner guard localhost bisa mengejutkan developer yang `.env.local` masih menunjuk ke production
- mutasi non-absensi dari localhost yang lewat Supabase client juga ikut ditahan bila terdeteksi sebagai write
- perlu sosialisasi singkat ke tim bahwa localhost sekarang aman-by-default, bukan bebas write

## Validasi Minimum Sebelum Rilis

Karena batch ini menyentuh absensi dan proteksi write ke production, quality gate-nya sebaiknya:

1. `npm run autofix`
2. `npx eslint` file batch ini
3. `npx vitest run src/lib/attendanceClientContext.test.ts src/lib/attendanceSyncPolicy.test.ts src/lib/runtimeEnvironment.test.ts src/integrations/supabase/localhostWriteGuard.test.ts`
4. `npx tsc --noEmit --pretty false`
5. `npm run build`

## Konfigurasi Env yang Wajib Dicek

Batch ini memperkenalkan atau memakai:

- `VITE_APP_ENV`
- `VITE_PRODUCTION_SUPABASE_PROJECT_REF`
- `VITE_ALLOW_LOCALHOST_PROD_WRITE`

Nilai yang direkomendasikan:

- local dev:
  - `VITE_APP_ENV=development`
  - `VITE_ALLOW_LOCALHOST_PROD_WRITE=false`
- production:
  - `VITE_APP_ENV=production`
  - `VITE_ALLOW_LOCALHOST_PROD_WRITE=false`

Catatan:

- target ideal tetap memisahkan `.env.local` ke Supabase staging
- guard ini adalah pengaman tambahan, bukan pengganti staging

## Checklist Uji Setelah Rilis

1. Login pegawai dari APK/Android
2. Pastikan device binding tersimpan dengan `AND-*`, bukan `WEB-*`
3. Check-in saat online
4. Check-in saat offline lalu aktifkan internet
5. Verifikasi absensi masuk ke server tanpa status `dead`
6. Jalankan localhost yang masih mengarah ke production
7. Pastikan banner guard muncul dan write absensi ditolak dengan pesan jelas

## Hasil Rollout

Status rollout: `Selesai dideploy ke production`

Validasi rollout:

- quality gate worktree rilis:
  - `npm run lint` -> lolos dengan `3` warning lama non-blocking di spec HR
  - `npm run test` -> `69/69` lolos
  - `npm run build` -> lolos
- `vercel build --prod --yes` -> lolos
- `vercel deploy --prebuilt --prod --yes` -> lolos
- domain utama `https://absensipro.com` -> `HTTP 200`
- route pegawai `https://absensipro.com/employee/login` -> `HTTP 200`

Catatan domain:

- setelah rollout ini, `https://www.absensipro.com` teramati melayani `HTTP 200` langsung, bukan redirect `308` ke apex seperti sebelumnya
- ini bukan blocker untuk batch absensi, tetapi perlu dicek ulang terpisah agar strategi canonical domain tetap konsisten

## Keputusan Rilis

Batch ini layak dijadikan rilis pertama karena:

- dampaknya langsung ke data absensi nyata
- menutup kasus operasional yang sudah terbukti terjadi
- sekaligus mengurangi risiko data publik production ketimpa dari localhost

Setelah batch ini stabil, kandidat batch berikutnya:

1. `Admin billing + trial monitoring`
2. `Org billing + aktivasi awal`
3. `Admin/org notifications + FCM`
