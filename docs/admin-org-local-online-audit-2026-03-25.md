# Audit Gap Local vs Online Admin/Org

Tanggal audit: 25 Maret 2026

## Tujuan

Mendata area `src/pages/admin/*`, `src/pages/org/*`, `src/components/admin/*`, `src/components/org/*`, `src/lib/*`, dan `src/hooks/*` yang sudah banyak berubah di lokal dan berisiko belum sepenuhnya sama dengan versi online.

Audit ini memakai:

- `git status --porcelain` sebagai sumber perubahan lokal
- snapshot checksum lokal di `artifacts/audit/admin-org-local-checksums-20260325.json`

Catatan penting:

- Snapshot ini adalah **checksum lokal**, bukan checksum bundle online.
- Jadi dokumen ini menjawab: **"seberapa besar gap lokal yang belum aman diasumsikan sudah online"**, bukan bukti 1:1 bahwa file online identik atau berbeda.

## Ringkasan Angka

- Total file berubah dalam scope audit: `266`
- File modified: `195`
- File untracked: `70`
- File deleted: `1`

Sebaran utama:

- `src/pages/admin/*`: `45`
- `src/pages/org/*`: `61`
- `src/components/admin/*`: `58`
- `src/components/org/*`: `10`
- `src/lib/*`: `82`
- `src/hooks/*`: `10`

## Area Paling Berat

Kelompok perubahan terbesar:

- `src/components/admin/settings/*`: `34`
- `src/pages/admin/*` root: `30`
- `src/pages/org/payroll/*`: `23`
- `src/pages/org/*` root: `12`
- `src/pages/admin/hr/*`: `11`
- `src/components/admin/billing/*`: `9`
- `src/pages/org/hr/*`: `9`
- `src/components/admin/organization/*`: `7`
- `src/components/admin/superadmin/*`: `6`
- `src/pages/org/reports/*`: `6`

Interpretasi cepat:

- Gap terbesar bukan hanya di halaman, tetapi di **fondasi bersama** (`lib`, `hooks`) dan **panel admin settings**.
- Area `org/payroll/*` berubah besar walau payroll saat ini bukan fokus rilis utama. Ini perlu diisolasi agar tidak ikut terdorong tanpa sengaja.

## Indikasi Area Berisiko Tinggi

Contoh file kunci yang menunjukkan gap lokal cukup besar:

- Admin billing/monitoring:
  - `src/pages/admin/NotificationManagement.tsx`
  - `src/pages/admin/StreakMonitoring.tsx`
  - `src/pages/admin/SubscriptionManagement.tsx`
  - `src/components/admin/billing/ManualPaymentVerification.tsx`
  - `src/components/admin/billing/InvoicesManager.tsx`
- Admin organization context:
  - `src/pages/admin/OrganizationDetail.tsx`
  - `src/components/admin/organization/OrganizationSubscription.tsx`
  - `src/components/admin/organization/OrganizationSidebar.tsx`
- Org billing/help/notification:
  - `src/pages/org/OrgBilling.tsx`
  - `src/pages/org/OrgDashboard.tsx`
  - `src/pages/org/OrgHelp.tsx`
  - `src/pages/org/OrgNotificationManagement.tsx`
  - `src/components/org/ManualPaymentFlow.tsx`
  - `src/components/org/OrgActivationTab.tsx`
- Fondasi lintas route:
  - `src/lib/billingHeadcountSnapshot.ts`
  - `src/lib/billingSubscriptionJourney.ts`
  - `src/lib/tenantTrialStatus.ts`
  - `src/lib/orgTenantContext.ts`
  - `src/lib/errorLogger.ts`
  - `src/hooks/useBilling.ts`

## Temuan Penting

1. Scope `/admin/*` dan `/org/*` memang **jauh dari kecil**.
2. Perubahan lokal bukan cuma kosmetik route, tetapi sudah menyentuh:
   - billing
   - trial/streak monitoring
   - organization detail/context
   - helper akses workspace HR/Payroll
   - settings panel
   - logging/error handling
3. Ada `70` file untracked. Artinya sebagian perilaku lokal bergantung pada file yang bahkan belum masuk baseline tracked release.
4. Ada `1` file terhapus:
   - `src/pages/org/payroll/OrgPayrollErrorLog.tsx`

## Snapshot Checksum

Artefak checksum lokal:

- `artifacts/audit/admin-org-local-checksums-20260325.json`

Tujuan artefak ini:

- menjadi baseline lokal saat ini
- memudahkan perbandingan berikutnya setelah batch tertentu dinaikkan ke online
- menghindari audit ulang dari nol

## Rekomendasi Batch Rilis

Urutan batch yang paling masuk akal berdasarkan risiko operasional:

1. `Attendance sync + device binding`
   - Prioritas: `Tinggi`
   - Fokus:
     - `src/hooks/useAttendance.ts`
     - `src/hooks/useAttendanceSync.ts`
     - `src/hooks/useDeviceBinding.ts`
     - `src/lib/attendanceClientContext.ts`
     - `src/lib/attendanceDB.ts`
     - `src/lib/attendanceResilience.ts`
     - `src/lib/attendanceSyncPolicy.ts`
     - `src/lib/deviceId.ts`
     - `src/lib/runtimeEnvironment.ts`
   - Risiko jika belum online:
     - absensi bisa tetap nyangkut di HP
     - binding device bisa mismatch
     - localhost write guard belum melindungi data publik

2. `Admin billing + trial monitoring`
   - Prioritas: `Tinggi`
   - Fokus:
     - `src/pages/admin/StreakMonitoring.tsx`
     - `src/pages/admin/SubscriptionManagement.tsx`
     - `src/pages/admin/ManualPaymentsManagement.tsx`
     - `src/components/admin/billing/*`
     - `src/lib/billingHeadcountSnapshot.ts`
     - `src/lib/billingSubscriptionJourney.ts`
     - `src/lib/tenantTrialStatus.ts`
     - `src/lib/trialSeriousness.ts`
     - `src/hooks/useBilling.ts`
   - Risiko jika belum online:
     - sinyal trial, verifikasi pembayaran, aktivasi awal, dan renewal bisa beda dengan yang sudah diuji lokal

3. `Org billing + aktivasi awal`
   - Prioritas: `Tinggi`
   - Fokus:
     - `src/pages/org/OrgBilling.tsx`
     - `src/pages/org/OrgDashboard.tsx`
     - `src/pages/org/OrgHelp.tsx`
     - `src/components/org/ManualPaymentFlow.tsx`
     - `src/components/org/OrgActivationTab.tsx`
   - Risiko jika belum online:
     - admin organisasi tidak melihat flow aktivasi awal, seat kontrak, dan wording billing yang terbaru

4. `Admin/org notifications + FCM`
   - Prioritas: `Tinggi`
   - Fokus:
     - `src/pages/admin/NotificationManagement.tsx`
     - `src/pages/org/OrgNotificationManagement.tsx`
     - `src/components/org/HardRequestNotifications.tsx`
   - Risiko jika belum online:
     - notifikasi broadcast Android dan jalur org notification bisa tidak sesuai dengan yang sudah diuji lokal

5. `Admin organization workspace + follow-up tenant`
   - Prioritas: `Tinggi`
   - Fokus:
     - `src/pages/admin/OrganizationDetail.tsx`
     - `src/pages/admin/Organizations.tsx`
     - `src/components/admin/organization/*`
     - `src/hooks/useAdminOrgContextNavigate.ts`
     - `src/lib/adminOrgOverlay.ts`
     - `src/lib/orgTenantContext.ts`
   - Risiko jika belum online:
     - follow-up tenant, shortcut tab, overlay context, dan triase superadmin masih tertinggal

6. `Org HR access + FAQ + workspace guidance`
   - Prioritas: `Sedang-Tinggi`
   - Fokus:
     - `src/pages/org/hr/*`
     - `src/components/org/hr/*`
     - `src/hooks/useHrPageAccess.ts`
     - `src/hooks/useOrgHrContextNavigate.ts`
     - `src/lib/hrPageAccess.ts`
     - `src/lib/hrRouteAccess.ts`
     - `src/lib/hrPayrollAccessPolicy.ts`
     - `src/lib/orgHrPageGuide.ts`
   - Risiko jika belum online:
     - status akses HR, readonly/editable, dan glosarium bantuan bisa tidak konsisten

7. `Admin settings + public config + UAT monitoring`
   - Prioritas: `Sedang`
   - Fokus:
     - `src/pages/admin/Settings.tsx`
     - `src/pages/admin/HomepageLayoutSettings.tsx`
     - `src/pages/admin/UatMonitoringPage.tsx`
     - `src/components/admin/settings/*`
     - `src/lib/apkDownload.ts`
     - `src/lib/uatChecklist.ts`
     - `src/lib/uatChecklistSettings.ts`
   - Risiko jika belum online:
     - pengaturan operasional, APK/download, dan monitoring UAT tidak mencerminkan kondisi sistem lokal yang terbaru

8. `Org payroll dan route terkait`
   - Prioritas: `Rendah / Tahan`
   - Fokus:
     - `src/pages/org/payroll/*`
     - `src/components/org/payroll/*`
     - `src/lib/payroll*`
   - Risiko jika belum online:
     - gap lokal vs online memang besar, tetapi payroll saat ini masih on-hold dan sebaiknya tidak ikut rilis tanpa instruksi eksplisit

## Langkah Operasional Berikutnya

1. Bekukan snapshot ini sebagai baseline audit lokal.
2. Pilih satu batch prioritas, idealnya `Attendance sync + device binding` atau `Admin billing + trial monitoring`.
3. Buat checksum snapshot kedua setelah batch itu dipilah.
4. Baru lakukan quality gate dan rilis batch tersebut.
5. Ulangi untuk batch berikutnya sampai gap lokal vs online menyempit.

## Kesimpulan

Gap lokal untuk `/admin/*` dan `/org/*` **nyata besar**. Yang paling aman bukan mendorong semuanya sekaligus, tetapi memakai pendekatan batch rilis berbasis domain dengan checksum lokal ini sebagai baseline.
