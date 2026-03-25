# Checklist Uji Aplikasi AbsensiKu

Dokumen ini adalah daftar uji utama lintas web, admin organisasi, pegawai, dan APK Android. Tujuannya agar pengujian tidak tercecer di banyak file dan setiap rilis punya baseline yang sama.

Referensi pendukung yang sudah ada:
- [panduan Android WebView](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/panduan.md)
- [README Android WebView](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/README.md)
- [runbook attendance security rollout](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/runbook-attendance-security-rollout.md)
- [keputusan operasional peak-hour buffering](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/keputusan-operasional-peak-hour-buffering.md)
- [UAT Android runtime 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-android-runtime.md)
- [Sign-off Android runtime 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/sign-off-2026-03-20-android-runtime.md)
- [Go / No-Go Android runtime 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/go-no-go-2026-03-20-android-runtime.md)

## Cara pakai
- Gunakan checklist ini sebagai baseline sebelum UAT, rilis APK, atau deploy web.
- Untuk perubahan kecil, pilih bagian yang terdampak saja.
- Untuk rilis besar, jalankan seluruh bagian yang relevan.
- Setiap error harus dicatat bersama `Ref ID` atau `trace_id`.
- Setiap update yang sudah diuji wajib dicatat juga di bagian `Log Update yang Sudah Diuji` pada dokumen ini agar status terbaru tidak tercecer.
- Setiap batch UAT yang selesai harus lebih dulu memperbarui status item checklist yang terdampak agar summary `Monitoring UAT` tetap akurat.
- Jika batch UAT menemukan temuan, wajib jalankan `npm run autofix` lebih dulu bila relevan, lanjutkan perbaikan manual jika masih perlu, lalu tandai item terkait sebagai `Perlu retest` sampai lolos verifikasi ulang.
- Setelah menambah atau mengubah baris pada `Log Update yang Sudah Diuji`, wajib jalankan `npm run uat:sync-monitoring -- --domain=absensi` agar hasilnya masuk ke halaman `Monitoring UAT`.
- Setiap skenario yang benar-benar diuji dan berhasil harus dicatat ke file UAT terpisah di [docs/uat/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/README.md).
- Gunakan [template-uat-aplikasi.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/template-uat-aplikasi.md) untuk pencatatan hasil uji.
- Untuk penutupan akhir Android di perangkat fisik, gunakan [checklist-device-nyata-android.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/checklist-device-nyata-android.md).
- Untuk eksekusi cepat verifikasi perangkat fisik, gunakan juga [runsheet-device-nyata-android.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/runsheet-device-nyata-android.md).
- Untuk membagi batch UAT absensi berikutnya ke browser, emulator, dan device nyata, gunakan [runsheet-uat-absensi-tahap-berikutnya.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/runsheet-uat-absensi-tahap-berikutnya.md).

## Log Update yang Sudah Diuji
Gunakan format ringkas ini setiap kali ada update yang benar-benar sudah diuji:

| Tanggal | Update | Area diuji | Ringkasan hasil | Referensi |
|---|---|---|---|---|
| 2026-03-20 | Android runtime `v1.0.5` | Native login, dashboard/WebView, offline/reconnect, `remember session`, check-in lokal -> final server, check-out manual | `15/15` lulus, status `siap dengan catatan` | [UAT Android runtime 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-android-runtime.md), [Sign-off 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/sign-off-2026-03-20-android-runtime.md), [Go / No-Go 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/go-no-go-2026-03-20-android-runtime.md) |
| 2026-03-20 | Auth web umum dan publik/download | Login web `/auth`, rate limit, logout, forgot password entry point, deep link reset, session expired browser, halaman download, retensi artefak APK, dan checksum file publik | `14/14` lulus, status `siap dengan catatan` | [UAT Auth Web Umum 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-auth-web-umum.md) |
| 2026-03-20 | Reset password web umum end-to-end | Generate recovery link valid via service role, buka `/auth/reset-password`, ubah password, login ulang dengan password baru, lalu restore password akun uji | `1/1` lulus, status `siap dengan catatan` | [UAT Auth Web Reset Password Sampai Selesai 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-auth-web-reset-complete.md) |
| 2026-03-20 | Negative case OTP registrasi | Verifikasi `verify-registration-otp` untuk OTP salah dan OTP expired dengan row OTP dummy terkontrol di remote DB | `2/2` lulus, status `siap dengan catatan` | [UAT OTP Registrasi Salah atau Expired 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-registration-otp-negative-cases.md) |
| 2026-03-20 | Negative case kode undangan invalid dan expired | Registrasi pegawai via `/employee/login?invite=...` untuk kode undangan invalid dan expired, plus retest UI setelah fix RPC validasi undangan | `2/2` lulus, status `siap dengan catatan` | [UAT Kode Undangan Invalid atau Expired 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-invitation-invalid-expired.md) |
| 2026-03-20 | Simulasi invalidation sesi web vs WebView | Login pegawai via `/auth`, buka `/employee/dashboard` dengan bridge Android mock, lalu logout dari web untuk memverifikasi redirect native-sim ke login dan event `showNativeLogin` | `simulasi lulus, perlu tindak lanjut APK nyata` | [UAT Simulasi Logout Web Saat Sesi WebView Aktif 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-web-logout-vs-native-session-simulation.md) |
| 2026-03-20 | Browser admin organisasi, undangan pegawai, dan pengaturan keamanan absensi | Login admin organisasi, daftar pegawai aktif, pembuatan undangan, verifikasi undangan, registrasi invite sampai `used`, hapus undangan kedaluwarsa, kirim reset password pegawai, kirim ulang email undangan, simpan pengaturan keamanan absensi | `15/15` lulus, status `siap dengan catatan` | [UAT Admin Organisasi dan Undangan 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-admin-organisasi-dan-undangan.md) |
| 2026-03-20 | Validasi `app_code` native auth dan absensi | Login native via `/mobile-api/auth/login`, RPC `validate_attendance_security_context`, dan `process_check_in` dengan `app_code` benar/salah/kosong | `6/6` lulus, status `siap dengan catatan` | [UAT Validasi App Code Native 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-app-code-security.md) |
| 2026-03-20 | Edge case absensi server-side | `check-out` sebelum `check-in`, retry idempotency, anti-duplikasi server-side, dan cleanup data uji remote DB | `4/4` lulus, status `siap dengan catatan` | [UAT Edge Case Absensi Server-side 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-absensi-edge-case-server.md) |
| 2026-03-20 | Logout policy saat ada pending attendance | Guard logout pegawai untuk `block_logout`, `keep_local_pending`, dan `warn_then_logout` dengan pending local buffer di IndexedDB | `4/4` lulus, status `siap dengan catatan` | [UAT Logout Saat Ada Pending Attendance 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-logout-pending-policy.md) |
| 2026-03-20 | Attempt check-in tanpa lokasi valid | Device binding berhasil disamakan, tetapi flow uji tertahan oleh gate `billing mandiri` pada akun pertama dan `hari libur` pada akun kedua | `perlu tindak lanjut` | [UAT Attempt Check-in Tanpa Lokasi Valid 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-checkin-invalid-location-attempt.md) |
| 2026-03-20 | Retest check-in tanpa lokasi valid | Retest browser dengan akun billing terpusat, device binding cocok, override hari kerja, dan geolocation di luar radius kantor | `1/1` lulus, status `siap dengan catatan` | [UAT Retest Check-in Tanpa Lokasi Valid 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-checkin-invalid-location-retest.md) |
| 2026-03-20 | Retest double tap tombol absen | Double click sinkron pada `Absen Masuk` setelah fix lock submit, dengan verifikasi toast duplikasi dan IndexedDB lokal | `1/1` lulus, status `siap dengan catatan` | [UAT Retest Double Tap Tombol Absen 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-double-tap-checkin.md) |
| 2026-03-20 | Pending sync terlalu lama warning | Injeksi 1 entry pending tua di IndexedDB dan verifikasi banner warning stale pending muncul di dashboard pegawai utama | `1/1` lulus, status `siap dengan catatan` | [UAT Pending Sync Terlalu Lama Menampilkan Warning 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-pending-sync-warning.md) |
| 2026-03-20 | Wording status lokal vs final server | Check-in local-only `worker_only`, verifikasi toast, kartu status, tombol aksi, dan catatan absensi tidak memberi kesan final server | `2/2` lulus, status `siap dengan catatan` | [UAT Notifikasi Lokal vs Final Server 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-local-vs-final-notification-wording.md) |
| 2026-03-20 | Refresh dashboard tetap di route dashboard | Login pegawai via `/auth`, masuk ke `/employee/dashboard?tab=home`, lalu refresh halaman untuk memastikan tidak mental ke homepage | `1/1` lulus, status `siap dengan catatan` | [UAT Refresh Dashboard Tetap di Dashboard 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-refresh-dashboard-stays-on-dashboard.md) |
| 2026-03-20 | Operasional admin dan data | Audit log undangan, backup Supabase, tabel remote hasil migration, dan trace error edge function | `4/4` lulus, status `siap dengan catatan` | [UAT Operasional Admin dan Data 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-operasional-admin-dan-data.md) |
| 2026-03-20 | Quality gate rilis | `autofix`, `lint`, `test`, `build`, `assembleDebug`, dan verifikasi live endpoint production | `6/6` lulus, status `siap dengan catatan` | [UAT Quality Gate Rilis 2026-03-20](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-quality-gate-rilis.md) |

Aturan isi log:
- Tambah 1 baris baru setiap ada batch update yang selesai diuji.
- Perbarui status item checklist yang terdampak pada seksi terkait sebelum menambah baris log.
- Isi `Area diuji` dengan modul atau flow yang benar-benar disentuh, bukan daftar rencana.
- Isi `Ringkasan hasil` dengan format singkat seperti `3/3 lulus`, `8/10 lulus`, `siap dengan catatan`, atau `perlu tindak lanjut` jika temuan belum tertutup.
- Isi `Referensi` dengan file UAT, sign-off, atau checklist device nyata yang menjadi bukti.
- Jika ada temuan, catat juga `Ref ID` atau `trace_id` di file UAT terkait lalu lakukan `autofix/perbaikan -> retest -> sync monitoring`.
- Setelah baris ditambahkan, sinkronkan ke monitoring dengan `npm run uat:sync-monitoring -- --domain=absensi`.
- Jika update belum diuji, jangan dicatat di tabel ini.

## Legenda Operasional
- Status item:
  `Belum diuji`, `Sudah diuji`, `Perlu retest`, `Khusus device nyata`
- Prioritas:
  `P0` = blocker rilis / flow inti, `P1` = penting non-blocker, `P2` = pelengkap / hardening
- Metode uji:
  `Manual`, `Otomatis`, `Emulator`, `Device nyata`, `Remote production`
- Penandaan yang dipakai di checklist:
  tulis singkat di akhir poin, misalnya `Status: Sudah diuji | Prioritas: P0 | Metode: Manual, Emulator, Remote production`
- Aturan status:
  jika ada perubahan pada flow terkait, ubah item yang sebelumnya lulus menjadi `Perlu retest` sampai diverifikasi lagi

## Trigger Retest
- Retest `Auth Web Umum` dan `Native Login Android` jika ada perubahan di login, logout, reset password, session bootstrap, invalidation sesi, atau policy `remember session`.
- Retest `Dashboard Pegawai dan WebView` jika ada perubahan routing, host allowlist, bootstrap native, guard redirect, atau bundle runtime Android.
- Retest `Koneksi dan Reliability` jika ada perubahan fallback offline, retry, state recovery, WebView error handler, atau sync policy.
- Retest `Absensi dan Sinkronisasi` jika ada perubahan check-in/check-out, queue sync, peak-hour buffering, device binding, lokasi, atau penyimpanan lokal.
- Retest `Keamanan Dasar` jika ada perubahan `app_code`, validasi device, fake GPS detection, geolocation policy, atau distribusi APK.
- Retest `Publik dan Landing` jika ada perubahan halaman download, daftar versi APK, CTA, artefak publik, atau file `/public/downloads`.
- Retest `Admin Organisasi` dan `Daftar Pegawai` jika ada perubahan invitation, OTP, email gateway, audit log, atau onboarding tenant.

## Ringkasan Cakupan Tertutup Saat Ini
- Sudah tertutup pada batch `2026-03-20`:
  `Native Login Android`, `Dashboard Pegawai dan WebView` inti, `Koneksi dan Reliability` inti, dan `Absensi dan Sinkronisasi` inti pada emulator Android.
- Masih perlu retest / belum tertutup penuh:
  auth web umum, pendaftaran pegawai, admin organisasi, keamanan device nyata, halaman publik/download, quality gate rilis penuh, dan seluruh validasi device Android nyata.

## 1. Publik dan Landing
Status seksi: `Belum diuji` | Prioritas default: `P1` | Metode umum: `Manual, Otomatis, Remote production`
- [ ] Homepage termuat normal tanpa error console besar. `Status: Belum diuji | Prioritas: P1`
- [ ] CTA utama mengarah ke halaman yang benar. `Status: Belum diuji | Prioritas: P1`
- [ ] Halaman [download](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/DownloadApk.tsx) tampil normal. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Versi Android terbaru tampil di urutan paling atas. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] File Android terbaru bisa diunduh dan merespons `200`. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] File Android lama yang sudah dibuang tidak lagi bisa diunduh. `Status: Sudah diuji 2026-03-20 | Prioritas: P1`

## 2. Auth Web Umum
Status seksi: `Belum diuji` | Prioritas default: `P0` | Metode umum: `Manual, Otomatis, Remote production`
- [ ] Login web biasa berhasil dengan akun valid. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Login web gagal dengan password salah. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Rate limit auth menampilkan pesan yang jelas. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Logout web mengakhiri sesi dengan benar. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Lupa password berjalan sampai reset selesai. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Deep link reset tidak menghasilkan loop atau halaman kosong. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Session expired di browser kembali ke login dengan perilaku yang benar. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Logout dari web saat APK sedang aktif mengikuti policy invalidation yang dipilih. `Status: Khusus device nyata | Prioritas: P0`

## 3. Native Login Android
Status seksi: `Sudah diuji sebagian` | Prioritas default: `P0` | Metode umum: `Manual, Emulator, Remote production`
- [ ] Login native berhasil dengan akun valid. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Login native gagal dengan password salah. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Login native menampilkan `Ref ID` jika gagal. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Login native tidak melempar user ke halaman `/employee/login`. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Handoff dari native ke WebView langsung menuju `/employee/dashboard`. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Restore session setelah cold start tetap kembali ke dashboard. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Logout dari dashboard kembali ke login native. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] `remember session` on/off bekerja sesuai policy. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Error `429` pada auth Android menampilkan pesan cooldown yang jelas. `Status: Belum diuji | Prioritas: P0`
- [ ] Session expired saat app sedang terbuka kembali ke login native tanpa loop. `Status: Khusus device nyata | Prioritas: P0`
- [ ] Forced update atau minimum version menampilkan blokir/pengingat yang benar jika diaktifkan. `Status: Khusus device nyata | Prioritas: P1`

## 4. Daftar Pegawai
Status seksi: `Belum diuji` | Prioritas default: `P0` | Metode umum: `Manual, Otomatis, Remote production`
- [ ] Daftar via email berhasil sampai akun aktif. `Status: Belum diuji | Prioritas: P0`
- [ ] OTP salah atau expired ditolak dengan pesan yang jelas. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Daftar via undangan memverifikasi kode dengan benar. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Organisasi dari undangan tampil benar di layar native. `Status: Belum diuji | Prioritas: P1`
- [ ] Daftar via organisasi berhasil membuat admin awal tenant. `Status: Belum diuji | Prioritas: P0`
- [ ] Kode undangan invalid atau expired ditolak. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Email gateway undangan terkirim dan tercatat di audit log. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Registrasi undangan Android tetap memberi feedback yang jelas saat server rate-limited. `Status: Belum diuji | Prioritas: P1`
- [ ] Deep link undangan dari email membuka jalur yang benar. `Status: Sudah diuji 2026-03-20 | Prioritas: P1`

## 5. Admin Organisasi
Status seksi: `Sudah diuji sebagian` | Prioritas default: `P0` | Metode umum: `Manual, Otomatis, Remote production`
- [ ] Admin organisasi bisa login normal. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Admin bisa membuat undangan pegawai baru. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Admin bisa mengirim ulang email undangan. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Admin bisa melihat status undangan `pending`, `verified`, atau `used`. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Pengaturan email gateway tersimpan dan aktif. `Status: Belum diuji | Prioritas: P1`
- [ ] Pengaturan keamanan absensi tidak menghapus `native_app_code`. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Admin bisa membatalkan atau revoke undangan jika flow itu tersedia. `Status: Belum diuji | Prioritas: P1`
- [ ] Admin bisa menonaktifkan pegawai tanpa merusak data organisasi. `Status: Belum diuji | Prioritas: P0`
- [ ] Profil organisasi bisa diperbarui dan tetap terbaca benar di branding tenant. `Status: Belum diuji | Prioritas: P1`

## 5A. Gate HR dan Payroll
Status seksi: `Sudah diuji sebagian` | Prioritas default: `P0` | Metode umum: `Manual, Otomatis, Remote production`
- [ ] Tenant yang belum memenuhi readiness absensi tidak bisa membuka workspace HR. `Status: Sudah diuji 2026-03-22 | Prioritas: P0`
- [ ] Tenant yang belum memenuhi readiness absensi tidak bisa membuka workspace Payroll. `Status: Belum diuji | Prioritas: P0`
- [ ] Tenant yang sudah readiness tetapi belum punya komitmen pembayaran dapat membuka semua menu HR dalam mode `Read Only`. `Status: Sudah diuji 2026-03-22 | Prioritas: P0`
- [ ] Tenant yang sudah readiness tetapi belum punya komitmen pembayaran dapat membuka semua menu Payroll dalam mode `Read Only`. `Status: Belum diuji | Prioritas: P0`
- [ ] Saat mode `Read Only`, aksi edit/tambah data HR tidak bisa dijalankan dari halaman konten. `Status: Sudah diuji 2026-03-22 | Prioritas: P0`
- [ ] Saat mode `Read Only`, aksi edit/tambah data Payroll tidak bisa dijalankan dari halaman konten. `Status: Belum diuji | Prioritas: P0`
- [ ] Menyalakan `Komitmen pembayaran` membuat HR menjadi editable penuh tanpa menunggu streak monitoring. `Status: Sudah diuji 2026-03-22 | Prioritas: P0`
- [ ] Setelah `Komitmen pembayaran` aktif, Payroll tetap `Read Only` sampai langganan tenant berstatus `active`. `Status: Belum diuji | Prioritas: P0`
- [ ] Saat langganan tenant `active`, HR dan Payroll sama-sama editable penuh. `Status: Sudah diuji sebagian 2026-03-22 (HR) | Prioritas: P0`
- [ ] Banner status akses HR/Payroll menampilkan mode dan CTA aktivasi yang sesuai. `Status: Sudah diuji sebagian 2026-03-22 (HR) | Prioritas: P1`

## 6. Dashboard Pegawai dan WebView
Status seksi: `Sudah diuji sebagian` | Prioritas default: `P0` | Metode umum: `Manual, Emulator, Remote production`
- [ ] Dashboard pegawai termuat setelah bootstrap native. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Tab utama dashboard bisa dibuka normal. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Logout dari tab profil membersihkan sesi native dan web. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Refresh halaman tetap kembali ke dashboard, bukan homepage. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Host di luar allowlist diblokir. `Status: Khusus device nyata | Prioritas: P0`
- [ ] Session expired kembali ke login native tanpa loop. `Status: Khusus device nyata | Prioritas: P0`
- [ ] Deep link reset atau undangan yang dibuka dari perangkat tidak merusak state WebView aktif. `Status: Belum diuji | Prioritas: P1`

## 7. Koneksi dan Reliability
Status seksi: `Sudah diuji sebagian` | Prioritas default: `P0` | Metode umum: `Manual, Emulator, Remote production`
- [ ] Saat koneksi internet putus, tidak muncul error URL mentah. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Saat koneksi putus, kartu status koneksi tampil ke user. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Tombol `Coba lagi` bekerja setelah internet kembali. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Pull-to-refresh dari atas memulihkan halaman saat internet kembali. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Fallback setelah error WebView tetap terkunci ke `/employee/dashboard`. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Force close atau HP mati tidak merusak restore session yang valid. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Perubahan jaringan Wi-Fi -> seluler atau sebaliknya tidak membuat app macet. `Status: Khusus device nyata | Prioritas: P0`
- [ ] Battery saver atau data saver tidak membuat refresh/sync masuk loop. `Status: Belum diuji | Prioritas: P1`

## 8. Absensi dan Sinkronisasi
Status seksi: `Sudah diuji sebagian` | Prioritas default: `P0` | Metode umum: `Manual, Emulator, Remote production`
- [ ] Check-in berhasil pada kondisi online normal. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Check-out berhasil pada kondisi online normal. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Check-out sebelum check-in ditolak dengan pesan yang benar. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Double tap tombol absen tidak membuat data ganda. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Retry setelah timeout tidak membuat duplikasi absensi. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Saat jam sibuk, absensi mengikuti policy deferred yang aktif. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Status `tersimpan di perangkat` vs `sudah tercatat di server` tampil jelas. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Pending sync yang terlalu lama menampilkan warning. `Status: Sudah diuji 2026-03-20 | Prioritas: P1`
- [ ] Data absensi pending tersinkron setelah koneksi kembali. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Logout saat ada pending attendance mengikuti policy yang dipilih. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Lokasi kerja dan binding device divalidasi sesuai kebijakan tenant. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Check-in tanpa lokasi kerja yang valid ditolak dengan pesan yang jelas. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Pending sync tetap konsisten setelah force close atau ganti jaringan. `Status: Khusus device nyata | Prioritas: P0`
- [ ] Policy target untuk skala besar terdokumentasi: saat `peak hour`, absensi disimpan lokal dulu dan sinkronisasi utama ditahan sampai window sibuk lewat, bukan hanya deferred beberapa detik. `Status: Belum diuji | Prioritas: P1`
- [ ] UX peak-hour konsisten: setelah user absen, dashboard langsung menampilkan catatan optimistic dengan status jelas `tersimpan di perangkat`, `menunggu sinkronisasi`, atau `sudah tercatat di server`. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Notifikasi absensi tidak boleh memberi kesan final jika data baru tersimpan lokal; wording harus tegas membedakan status lokal vs final server. `Status: Sudah diuji 2026-03-20 | Prioritas: P1`

## 9. Keamanan Dasar
Status seksi: `Belum diuji penuh` | Prioritas default: `P0` | Metode umum: `Manual, Otomatis, Emulator, Device nyata`
- [ ] `app_code` native tervalidasi pada mobile auth. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] `app_code` native tervalidasi pada jalur absensi. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Request native tanpa `app_code` yang benar ditolak. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Device mock location / fake GPS diblokir. `Status: Khusus device nyata | Prioritas: P0`
- [ ] Origin geolocation hanya aktif untuk host yang diizinkan. `Status: Khusus device nyata | Prioritas: P0`
- [ ] File APK publik hanya menyisakan 3 versi terbaru. `Status: Sudah diuji 2026-03-20 | Prioritas: P1`
- [ ] Login akun yang sama di device berbeda mengikuti policy device binding yang benar. `Status: Belum diuji | Prioritas: P0`
- [ ] Perangkat tidak dikenal ditolak dengan pesan yang jelas jika kebijakan tenant mengharuskannya. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`

## 10. Operasional Admin dan Data
Status seksi: `Belum diuji` | Prioritas default: `P0` | Metode umum: `Manual, Otomatis, Remote Supabase, Remote production`
- [ ] Audit log mencatat aksi penting seperti kirim undangan email. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Backup Supabase dibuat sebelum perubahan schema/data penting. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Migration atau function baru berhasil hidup di remote Supabase. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Tidak ada data uji lama yang tertinggal setelah uji end-to-end selesai. `Status: Belum diuji | Prioritas: P1`
- [ ] File Android publik di `/public/downloads` sinkron dengan versi di halaman download. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Rollback migration atau edge function sudah diketahui langkah dasarnya sebelum deploy kritis. `Status: Belum diuji | Prioritas: P1`
- [ ] Versi Android minimum dan artefak publik terdokumentasi dengan benar. `Status: Belum diuji | Prioritas: P1`

## 11. Quality Gate Rilis
Status seksi: `Belum diuji` | Prioritas default: `P0` | Metode umum: `Otomatis, Manual`
- [ ] `npm run autofix` `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] `npm run lint` `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] `npm run test` `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] `npm run build` `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] `./gradlew --no-daemon assembleDebug -Pkotlin.incremental=false` `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Verifikasi live endpoint utama setelah deploy `Status: Sudah diuji 2026-03-20 | Prioritas: P0`

## 12. Aksesibilitas dan UI
Status seksi: `Belum diuji` | Prioritas default: `P1` | Metode umum: `Manual, Emulator, Device nyata`
- [ ] Layout tetap fit di layar Android yang pendek. `Status: Belum diuji | Prioritas: P1`
- [ ] Nama tenant panjang tetap terbaca layak. `Status: Belum diuji | Prioritas: P1`
- [ ] Font size besar tidak merusak CTA utama. `Status: Belum diuji | Prioritas: P1`
- [ ] Dialog penting tetap bisa ditutup dan CTA tetap terlihat. `Status: Belum diuji | Prioritas: P1`
- [ ] Rotasi layar ditangani sesuai policy app. `Status: Khusus device nyata | Prioritas: P2`

## 13. Observability
Status seksi: `Belum diuji` | Prioritas default: `P0` | Metode umum: `Manual, Otomatis, Remote production, Remote Supabase`
- [ ] Error penting di frontend menampilkan `Ref ID`. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Error penting di backend atau edge function memiliki `trace_id`. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`
- [ ] Log dan audit cukup untuk melacak kegagalan undangan, auth, dan absensi. `Status: Belum diuji | Prioritas: P0`
- [ ] Skenario gagal utama punya bukti yang bisa dipakai triase operator. `Status: Sudah diuji 2026-03-20 | Prioritas: P0`

## Catatan Status Saat Ini
- Checklist Android ringkas sudah ada di [android-webview/panduan.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/panduan.md#L204).
- Matrix UAT Android yang lebih detail sudah ada di [android-webview/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/README.md#L353).
- Dokumen ini sekarang menjadi daftar utama lintas aplikasi yang bisa dipakai untuk planning dan handover.
- Batch UAT Android emulator per 20 Maret 2026 sudah tertutup `15/15` lulus, mencakup login native, logout/login ulang, profil manual, offline/reconnect, `remember on/off`, check-in lokal -> final server, dan check-out manual -> final server.
- Referensi keputusan resmi Android runtime:
  - [uat-2026-03-20-android-runtime.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-android-runtime.md)
  - [sign-off-2026-03-20-android-runtime.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/sign-off-2026-03-20-android-runtime.md)
  - [go-no-go-2026-03-20-android-runtime.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/go-no-go-2026-03-20-android-runtime.md)
- Gap Android yang benar-benar tersisa sekarang berpusat pada device nyata:
  - GPS native murni tanpa override DevTools/CDP
  - perilaku jaringan Wi-Fi/seluler nyata
  - sensitivitas sentuhan manual vendor/device fisik
- Implementasi absensi saat ini sudah `store-first` dan `deferred` saat jam sibuk, tetapi belum sepenuhnya `peak-hour hold + off-peak sync`.
- Target hardening berikutnya untuk lonjakan besar: tahan sync user-facing selama window sibuk, jadikan ingest `queue-only`, lalu proses sinkronisasi utama di luar jam sibuk atau lewat worker terpisah.
- Arah UX yang disepakati untuk mode ini: catatan absensi tetap langsung muncul di dashboard sebagai optimistic record, tetapi statusnya harus eksplisit `lokal/pending` sampai server benar-benar mengonfirmasi.
