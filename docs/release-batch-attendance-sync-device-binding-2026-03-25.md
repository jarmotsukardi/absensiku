# Batch Rilis 1: Attendance Sync + Device Binding

Tanggal: 25 Maret 2026

## Tujuan

Menyiapkan batch rilis pertama yang paling kritikal secara operasional:

- mencegah absensi tersimpan lama di HP karena mismatch device ID
- menyamakan sumber device ID antara login, dashboard, reset perangkat, dan payload absensi
- mencegah `localhost` menulis ke Supabase production tanpa sadar

## File Wajib Ikut

File berikut sebaiknya dirilis dalam satu batch yang sama:

- `src/hooks/useAttendance.ts`
- `src/hooks/useAttendanceSync.ts`
- `src/hooks/useDeviceBinding.ts`
- `src/lib/attendanceClientContext.ts`
- `src/lib/attendanceDB.ts`
- `src/lib/attendanceResilience.ts`
- `src/lib/attendanceSyncPolicy.ts`
- `src/lib/deviceId.ts`
- `src/lib/runtimeEnvironment.ts`
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/localhostWriteGuard.ts`
- `src/components/common/LocalhostProductionGuardBanner.tsx`
- `src/App.tsx`
- `src/pages/employee/EmployeeLogin.tsx`
- `src/pages/employee/EmployeeDashboardNew.tsx`
- `src/components/employee/DeviceResetDialog.tsx`
- `src/lib/timezone.ts`

Alasan:

- Hook absensi sekarang bergantung pada `attendanceClientContext`, `deviceId`, `runtimeEnvironment`, dan `attendanceSyncPolicy`.
- `localhostWriteGuard` baru efektif jika `client.ts` dan `App.tsx` ikut.
- Perbaikan mismatch `WEB-*` vs `AND-*` tidak lengkap jika `EmployeeLogin`, `EmployeeDashboardNew`, dan `DeviceResetDialog` tidak ikut.

## File Pendamping yang Sebaiknya Ikut

- `src/vite-env.d.ts`
- `.env.example`

Alasan:

- Menjelaskan env baru yang dipakai guard localhost.
- Mengurangi risiko env drift di sesi kerja berikutnya.

## File Test yang Sebaiknya Ikut ke Baseline Repo

- `src/lib/runtimeEnvironment.test.ts`
- `src/integrations/supabase/localhostWriteGuard.test.ts`
- `src/lib/attendanceClientContext.test.ts`
- `src/lib/attendanceSyncPolicy.test.ts`

Alasan:

- Batch ini menyentuh jalur data absensi dan proteksi production.
- Test menjadi bukti regresi paling minimal agar batch bisa dipromosikan ke online dengan aman.

## File yang Sebaiknya Jangan Diikutkan di Batch Ini

File berikut terhubung ke domain yang sama, tetapi tidak perlu ikut jika target batch ini murni sinkronisasi absensi dan device binding:

- `src/pages/admin/*`
- `src/pages/org/*`
- `src/components/admin/*`
- `src/components/org/*`
- `src/pages/org/payroll/*`
- `src/components/org/payroll/*`
- `src/lib/billing*`
- `src/lib/payroll*`
- `src/lib/tenantTrialStatus.ts`
- `src/lib/trialSeriousness.ts`
- `src/hooks/useBilling.ts`

Alasan:

- Area tersebut adalah batch rilis terpisah: billing, trial, notifications, workspace admin, dan HR/payroll.
- Mendorongnya bersamaan akan mencampur bugfix operasional absensi dengan perubahan bisnis/UI yang lebih besar.

## File Lokal Saja

File berikut dicatat untuk audit, tetapi tidak boleh diperlakukan sebagai file yang langsung "naik ke online":

- `.env.local`
- `.env.online`

Yang benar untuk online:

- nilai env disetel di Vercel/runtime secret
- repo cukup membawa `.env.example` dan `src/vite-env.d.ts`

## Dependensi Penting di Luar Scope Inti

Walau tidak ada di daftar inti awal, file di bawah ini nyata diperlukan agar batch tidak pecah saat dirilis sendiri:

- `src/integrations/supabase/client.ts`
  - tanpa ini, guard write localhost tidak aktif
- `src/integrations/supabase/localhostWriteGuard.ts`
  - ini inti proteksi localhost ke production
- `src/components/common/LocalhostProductionGuardBanner.tsx`
  - ini umpan balik visual agar operator sadar browser lokal sedang mengarah ke production
- `src/App.tsx`
  - memuat banner guard
- `src/pages/employee/EmployeeLogin.tsx`
  - salah satu sumber mismatch device ID sebelumnya
- `src/pages/employee/EmployeeDashboardNew.tsx`
  - menampilkan status perangkat dan memanggil hook absensi
- `src/components/employee/DeviceResetDialog.tsx`
  - jalur reset binding harus memakai sumber device ID yang sama

## Risiko Jika Batch Dirilis Sendiri

Risiko yang masih tersisa walau batch ini dirilis sendiri:

- `useSessionManagement.ts` dan `useOptimizedLogin.ts` masih memakai `getAndroidId`, tetapi file tersebut tidak berubah di batch ini. Selama perilaku `getAndroidId` kompatibel, ini aman. Kalau nanti ada perubahan semantik baru pada ID, dua file itu perlu diaudit ulang.
- Batch ini tidak menyamakan panel `/admin/*` atau `/org/*` yang masih tertinggal dari online.
- Batch ini fokus ke jalur pegawai dan proteksi localhost. Jadi masih perlu batch lanjutan untuk billing, notifications, dan workspace admin/org.

## Checksum Batch

Snapshot checksum batch ini:

- `artifacts/audit/attendance-sync-device-binding-batch-checksums-20260325.json`

Tujuannya:

- menjadi baseline rilis batch pertama
- memudahkan perbandingan setelah batch ini benar-benar dinaikkan ke online
- memisahkan audit batch ini dari audit besar `/admin/*` dan `/org/*`

## Validasi yang Layak Dipakai Sebelum Rilis

Minimal:

- lint file terkait
- `npx tsc --noEmit --pretty false`
- test:
  - `src/lib/runtimeEnvironment.test.ts`
  - `src/integrations/supabase/localhostWriteGuard.test.ts`
  - `src/lib/attendanceClientContext.test.ts`
  - `src/lib/attendanceSyncPolicy.test.ts`

Sebelum rilis final:

- `npm run autofix`
- `npm run lint`
- `npm run test`
- `npm run build`

## Keputusan Praktis

Batch ini **layak dipisah** dari rilis besar `/admin/*` dan `/org/*`, karena:

- dampaknya langsung ke data absensi nyata
- scope fungsionalnya jelas
- dependensinya masih bisa dikontrol
- tidak perlu membawa billing, HR guidance, notifications, atau payroll sekaligus
