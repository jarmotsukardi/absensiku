# UAT Aplikasi AbsensiKu

## Metadata
- Tanggal: 2026-03-19
- Scope: Download live, admin organisasi web, dan persiapan batch Android
- Environment: Production `https://absensiku-alpha.vercel.app`
- Device / Browser: Playwright browser automation
- Build / Versi: Web live + Android public `v1.0.5`
- Penguji: Codex

## Data uji
- Tenant: `Organisasi Uji Lisfa Hotmail 20260319-2`
- Admin: `lisfafai@hotmail.com`
- Pegawai: tidak diuji pada batch ini
- Email gateway: tidak diuji pada batch ini
- Catatan data: sesi admin organisasi masih aktif dari pengujian sebelumnya dan tervalidasi di production.

## Ringkasan hasil
- Total skenario diuji: 23
- Lulus: 23
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-01 | Landing & Publik | Halaman `/download` termuat normal di production | LULUS | `https://absensiku-alpha.vercel.app/download` | - | Halaman menampilkan hero download tanpa error blocking |
| UAT-02 | Landing & Publik | Versi Android terbaru tampil di urutan paling atas | LULUS | Snapshot Playwright menunjukkan `v1.0.5` pada blok `Versi terbaru` dan kartu `#1` | - | Tiga versi terbaru tampil `v1.0.5`, `v1.0.4`, `v1.0.3` |
| UAT-03 | Admin Organisasi | Sesi admin organisasi membuka dashboard tenant yang benar | LULUS | URL `https://absensiku-alpha.vercel.app/org` dan heading tenant `Organisasi Uji Lisfa Hotmail 20260319-2` | - | Dashboard admin termuat penuh |
| UAT-04 | Admin Organisasi | Menu `Undangan Pegawai` terbuka dari dashboard admin | LULUS | URL `https://absensiku-alpha.vercel.app/org/invitations` | - | Data undangan `INV-MMX0XM1U-XS83M4` tampil dengan status `Terverifikasi` |
| UAT-05 | Admin Organisasi | Logout admin organisasi kembali ke halaman login admin | LULUS | URL `https://absensiku-alpha.vercel.app/org/login` | - | Form login admin tampil normal setelah logout |
| UAT-06 | Admin Organisasi | Login admin organisasi dari nol berhasil dengan kredensial valid | LULUS | URL akhir `https://absensiku-alpha.vercel.app/org` setelah isi email, password, dan captcha | - | Login berhasil menggunakan `lisfafai@hotmail.com` |
| UAT-07 | Pegawai Web | Link `Login sebagai Pegawai` dari login admin mengarah ke halaman pegawai | LULUS | URL `https://absensiku-alpha.vercel.app/auth` | - | Halaman login pegawai tampil normal |
| UAT-08 | Pegawai Web | Login pegawai dari nol berhasil dan masuk dashboard | LULUS | URL akhir `https://absensiku-alpha.vercel.app/dashboard` dan heading tenant `Organisasi Uji Lisfa Hotmail 20260319-2` | - | Login berhasil menggunakan `lisfafai+pegawai20260319@gmail.com` |
| UAT-09 | Pegawai Web | Logout pegawai kembali ke halaman login pegawai | LULUS | URL akhir `https://absensiku-alpha.vercel.app/auth` | - | Form login pegawai tampil normal setelah logout |
| UAT-10 | Pegawai Web | Endpoint `/employee/dashboard` hidup di production | LULUS | `curl -I https://absensiku-alpha.vercel.app/employee/dashboard` merespons `200` | - | Route live tersedia normal |
| UAT-11 | Keamanan Pegawai | Browser biasa ditolak saat membuka `/employee/dashboard` | LULUS | Halaman `Akses Ditolak` dengan pesan `Absensi hanya diizinkan melalui WebView aplikasi internal atau Safari iPhone.` | - | Ini sesuai policy keamanan route absensi mobile |
| UAT-12 | Landing & Publik | File Android terbaru `v1.0.5` dapat diunduh langsung | LULUS | `curl -I https://absensiku-alpha.vercel.app/downloads/AbsensiKu-Android-1.0.5.apk` merespons `200` dan `content-type: application/vnd.android.package-archive` | - | Artefak publik terbaru tersedia |
| UAT-13 | Pegawai Web | Dialog `Lupa Password / Ganti Password` muncul dari login pegawai | LULUS | Modal `Pilih Aksi` tampil dengan opsi `Lupa Password` dan `Ganti Password` | - | Jalur recovery auth pegawai berhasil dibuka dari halaman login |
| UAT-14 | Landing & Publik | File Android lama yang sudah dibuang tidak lagi bisa diunduh | LULUS | `curl -I https://absensiku-alpha.vercel.app/downloads/AbsensiKu-Android-1.0.2.apk` merespons `404` | - | Policy retensi 3 versi artefak berjalan benar |
| UAT-15 | Admin Organisasi | Tab `Daftar Organisasi` terbuka dan menampilkan form registrasi admin awal | LULUS | Tab `Daftar Organisasi` menampilkan field `Nama Lengkap`, `Email Admin`, `Password`, `Konfirmasi Password`, dan `No. WhatsApp` | - | Form registrasi organisasi tampil normal |
| UAT-16 | Admin Organisasi | Dialog `Lupa Password / Ganti Password` muncul dari login admin | LULUS | Modal `Pilih Aksi` tampil dengan opsi `Lupa Password` dan `Ganti Password` | - | Jalur recovery auth admin berhasil dibuka dari halaman login |
| UAT-17 | Landing & Publik | Route lama `/download-apk` tetap mengarah ke halaman download baru | LULUS | Navigasi browser dari `/download-apk` berakhir di `https://absensiku-alpha.vercel.app/download` | - | Redirect kompatibilitas route lama masih bekerja |
| UAT-18 | Landing & Publik | Halaman download hanya menampilkan 3 versi Android aktif | LULUS | Snapshot `/download` menampilkan kartu `#1 v1.0.5`, `#2 v1.0.4`, `#3 v1.0.3` | - | Batas retensi 3 versi tampil benar di UI |
| UAT-19 | Cross-link Auth | Link `halaman admin` dari login pegawai membuka login admin organisasi | LULUS | Navigasi dari `/auth` ke `https://absensiku-alpha.vercel.app/org/login` | - | Cross-link pegawai -> admin berjalan benar |
| UAT-20 | Cross-link Auth | Link `Login sebagai Pegawai` dari login admin membuka login pegawai | LULUS | Navigasi dari `/org/login` ke `https://absensiku-alpha.vercel.app/auth` | - | Cross-link admin -> pegawai berjalan benar |
| UAT-21 | Pegawai Web | Halaman login pegawai termuat bersih tanpa error console pada load normal | LULUS | Pemeriksaan console setelah load tunggal `/auth` hanya menampilkan info `Sentry nonaktif` | - | Error rate-limit config sebelumnya tidak terulang pada load tunggal |
| UAT-22 | Android Native | Login native tenant `Organisasi Uji Lisfa Hotmail 20260319-2` berhasil melewati bootstrap resmi dan membuka dashboard pegawai | LULUS | Screenshot [android-after-bootstrap-wait2.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tmp/android-after-bootstrap-wait2.png) + logcat `Loading bootstrap URL`, `consumeBootstrapSession`, `notifySessionBootstrapComplete`, `navigate:dashboard`, `employee-dashboard session-check` | - | Login memakai `lisfafai+pegawai20260319@gmail.com` melalui APK/WebView resmi |
| UAT-23 | Android Native | Relogin native pasca deploy patch `AndroidSessionSync` kembali menembus dashboard tenant tanpa fallback ke login native | LULUS | Screenshot [android-post-deploy-login1-wait30s.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tmp/android-post-deploy-login1-wait30s.png) + logcat `Bootstrap cookie applied`, `setSession:success`, `notifySessionBootstrapComplete`, `navigate:dashboard`, `employee-dashboard session-check` | - | Patch web live menghilangkan race bootstrap yang sebelumnya memicu loop login; dashboard masih perlu dipantau untuk latensi load intermiten |

## Risiko tersisa
- Race bootstrap yang sempat mengembalikan user ke login native tidak terulang lagi pada bundle live terbaru, tetapi load dashboard Android masih perlu dipantau karena pernah lambat/intermiten sebelum akhirnya masuk.
- UAT Android untuk skenario runtime lanjutan `peak-hour hold -> pending lokal -> final server` belum tertutup, karena jalur ini belum diuji penuh lewat absensi resmi pada WebView Android.
- Logout native, offline/reconnect native, dan absensi native end-to-end masih perlu batch UAT lanjutan.

## Tindak lanjut
- Lanjutkan batch UAT `peak-hour hold -> pending lokal -> final server` di APK/WebView resmi.
- Tambah batch UAT `logout native -> login ulang -> offline/reconnect` agar flow Android tercatat penuh.
- Jika gejala loader lambat muncul lagi, tambahkan telemetry tahap `fetchData` dashboard untuk mengisolasi query yang paling lambat.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: Codex
- Tanggal: 2026-03-19
