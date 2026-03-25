# AbsensiKu Android WebView APK

Project ini adalah APK hybrid Android untuk flow employee AbsensiKu. Login utama dijalankan secara native, lalu sesi diteruskan ke WebView internal.

Panduan ini mengikuti arsitektur halaman web `/employee/login` sebagai sumber referensi flow dan kelengkapan fitur, tetapi target APK adalah menghadirkan flow auth tersebut secara native tanpa menambahkan tombol/link yang melempar user ke halaman web login.

Cara membaca dokumen ini:

- `Status implementasi v1` dan poin yang ditandai sebagai `saat ini` menjelaskan perilaku APK yang benar-benar sudah ada sekarang.
- `Target`, `arah yang diinginkan`, atau `sebaiknya` menjelaskan kontrak produk yang ingin dicapai, bukan janji bahwa perilaku itu sudah aktif.
- `Known gaps` menjelaskan selisih antara implementasi v1 saat ini dengan target akhir.
- Untuk peta dokumen yang lebih ringkas, lihat [DOCUMENT_MAP.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/DOCUMENT_MAP.md).

Mulai dari sini jika ingin cepat:

- status modul saat ini: baca bagian `Status implementasi v1` dan `Status aktual vs target` di file ini
- arah arsitektur dan kontrak target: [panduan.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/panduan.md)
- backlog aktif: [todo.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/todo.md)
- testing dan troubleshooting: [TEST_GUIDE.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/TEST_GUIDE.md) dan [TROUBLESHOOTING_LOGIN.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/TROUBLESHOOTING_LOGIN.md)
- arsip audit, history, report, dan setup: [docs/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/docs/README.md)

Route web utama yang dipakai setelah handoff sesi:

- `https://absensiku-alpha.vercel.app/employee/dashboard`

Route kompatibilitas lama yang masih diterima:

- `https://absensiku-alpha.vercel.app/employee/native-bootstrap`

Fallback web yang tetap tersedia untuk browser biasa:

- https://absensiku-alpha.vercel.app/employee/login

Tampilan aplikasi berhenti di atas area navigation bar Android dan tidak menimpa system bar bawah, sehingga tombol navigasi Android tetap bisa diklik.

## Tujuan utama

- Kebutuhan inti APK ini adalah mencegah manipulasi posisi GPS pada proses absensi.
- Fokus utamanya adalah deteksi dan pencegahan `fake GPS`, `mock location`, dan bentuk spoofing lokasi lain yang membuat user tampak berada di lokasi kantor padahal tidak.
- Build APK, tools lokal, dan workflow CI hanya berfungsi sebagai pendukung. Nilai utama aplikasi ini tetap ada pada proteksi keamanan lokasi.

## Scope aplikasi

- Fokus app ini adalah login native + handoff sesi ke flow employee dalam WebView Android native.
- Flow autentikasi yang dituju adalah `100% native login` untuk pengalaman masuk akun pegawai, bukan auth campuran native + link ke auth web.
- App ini bukan aplikasi Android native penuh untuk seluruh modul ABSENSIKU.
- Orientasi layar dikunci `portrait`.
- Halaman login native harus fit untuk layar HP Android umum dan tidak boleh terasa seperti layout web yang dipaksa masuk ke mobile.

## Status implementasi v1

- APK sudah memiliki layar login native untuk email/password.
- APK sudah memiliki flow `Daftar` native untuk `Email`, `Undangan`, dan `Organisasi`.
- Login native memanggil Supabase Auth langsung dari sisi Android.
- Flow `Lupa / Ganti Password` saat ini berjalan native melalui dialog Android dan request reset/password OTP langsung dari sisi Android.
- Setelah login berhasil, APK membuka `/employee/dashboard`, lalu root bootstrap web mengaktifkan sesi Supabase dari bridge native sebelum dashboard dipakai.
- Logout web pada mode Android dibersihkan kembali ke login native.
- Persistensi sesi native saat ini dipaksa aktif agar APK bisa memulihkan login pada pembukaan berikutnya; kontrol `tetap masuk` belum diekspos ke UI.
- Sesi native sekarang disimpan di encrypted storage Android dengan fallback legacy hanya jika encrypted prefs tidak tersedia.
- Form login native sekarang sudah terhubung ke Android Credential Manager untuk menyimpan dan memanggil kembali akun tersimpan secara aman.
- Implementasi v1 saat ini baru menyimpan sesi native, email login terakhir, dan kredensial login via penyedia kredensial Android; autofill penuh untuk seluruh flow auth belum aktif.
- Branding login native saat ini masih dapat bergantung pada konfigurasi build, belum selalu ditarik dinamis dari data organisasi.
- Implementasi v1 saat ini masih dapat menampilkan helper non-auth `Hubungi HR` setelah area `Lupa / Ganti Password` jika `ABSENSIKU_SUPPORT_EMAIL` diisi, sehingga belum sesuai target UX final.
- Cleanup auth native tidak lagi menghapus seluruh `WebStorage`, sehingga buffer IndexedDB/WebView untuk absensi tidak terhapus secara agresif pada startup normal.
- Implementasi v1 belum memenuhi target `100% native login` final karena branding tenant dinamis, secure credential storage untuk username/password, dan beberapa detail UX akhir masih belum selesai.
- Semua poin di atas adalah deskripsi perilaku v1 saat ini, bukan target akhir.

## Status aktual vs target

- Sudah aktif saat ini:
  - login native email/password
  - daftar native `Email`, `Undangan`, dan `Organisasi`
  - forgot password dan ganti password native melalui dialog Android
  - restore sesi native dengan persistensi sesi yang dipaksa aktif
  - handoff sesi ke WebView langsung saat membuka `/employee/dashboard`
  - tidak ada shortcut auth yang melempar user ke halaman auth web
  - blokir fake GPS/mock location di sisi client
  - allowlist host WebView
  - penyimpanan sesi native terenkripsi dan email login terakhir di storage lokal
  - penyimpanan serta pemanggilan kredensial login aman via Android Credential Manager
  - branding dasar tenant dari konfigurasi build
  - helper opsional `Hubungi HR` via email intent jika `ABSENSIKU_SUPPORT_EMAIL` tersedia
  - lookup undangan native lewat RPC `validate_invitation_code`
- Masih target / belum aktif penuh:
  - penarikan logo dan nama organisasi dari data organisasi/tenant lalu disimpan sebagai cache native
  - layout login native yang benar-benar fit layar HP umum tanpa overflow card/form utama
  - target `100% native login` untuk seluruh flow auth pegawai
  - preflight server-side sebelum WebView dibuka
  - app attestation / app verification
  - forced update / version enforcement
  - device binding server-side yang benar-benar fail-closed untuk absensi

## Known gaps

- Startup APK belum memanggil endpoint preflight/app verification khusus; app baru memeriksa konfigurasi build dan sesi tersimpan.
- Penyimpanan kredensial aman sekarang hanya aktif untuk jalur login native via Android Credential Manager; parity save/autofill untuk flow registrasi dan perubahan password belum lengkap.
- Penarikan otomatis logo dan nama organisasi dari data organisasi/tenant belum menjadi perilaku final yang stabil; implementasi v1 masih dapat memakai branding dari konfigurasi build.
- Layout login native masih harus dijaga agar fit pada layar HP Android umum tanpa elemen utama terdorong keluar viewport.
- Row helper non-auth `Hubungi HR` masih dapat tampil setelah `Lupa / Ganti Password` jika `ABSENSIKU_SUPPORT_EMAIL` diisi; ini masih gap terhadap target UX akhir yang menginginkan area bawah login berhenti di sana.
- Forced update, app attestation, dan hard fail-closed policy untuk clone APK belum diterapkan.
- Join flow undangan sekarang lebih stabil karena lookup memakai RPC dan penyelesaian akan mencoba function `join-organization` jika sesi signup tersedia, tetapi tetap perlu UAT pada project Supabase nyata untuk memastikan fallback tidak bentrok dengan policy server.

## Alasan belum 100% native login

- Persistensi sesi native sudah ada, tetapi UX final untuk kontrol `tetap masuk` belum matang karena saat ini perilakunya dipaksa aktif dan belum dikelola sebagai kontrol login native yang utuh.
- Penyimpanan username/password aman untuk login berikutnya sudah tersedia via Android Credential Manager, tetapi belum semua flow auth native memperbarui atau menyelaraskan kredensial tersebut secara penuh.
- Branding organisasi masih berbasis konfigurasi build; logo dan nama organisasi belum selalu di-resolve dari data tenant/organisasi user.
- Helper non-auth `Hubungi HR` masih bisa muncul setelah `Lupa / Ganti Password`, sehingga layout bawah login belum sepenuhnya memenuhi target UX akhir.
- Registrasi organisasi native sudah ada, tetapi UX-nya masih lebih ringkas daripada flow web dan belum semua validasi/panduan organisasinya dipindahkan ke native.

## Kebijakan Captcha di Native Login

**Keputusan Desain: Native login APK TIDAK menggunakan captcha.**

Pertimbangan arsitektur:

- **Layer keamanan berbeda**: APK mengandalkan device binding, mock location detection, dan fake GPS blocking sebagai pengganti captcha
- **UX mobile-first**: Captcha math yang ada di web `/employee/login` dianggap friksi berlebihan untuk pengalaman mobile native
- **Security through device attestation**: APK resmi dapat diverifikasi keasliannya, berbeda dengan browser yang anonymous
- **Rate limiting tetap disarankan**: Meskipun tanpa captcha, backend tetap perlu menerapkan rate limiting per device_id untuk mencegah brute force

**Perbedaan dengan web `/employee/login`:**

| Aspek | Web `/employee/login` | Native APK |
|-------|----------------------|------------|
| Captcha math | ✅ Ada (2+3=?) | ❌ Tidak ada |
| Rate limiting | ✅ Ada | ⚠️ Backend required |
| Device binding | ⚠️ Web fingerprint | ✅ Android ID |
| Mock location check | ❌ Tidak ada | ✅ Ada |
| Fake GPS block | ❌ Tidak ada | ✅ Ada |

**Catatan:** Keputusan ini disengaja dan didokumentasikan sebagai perbedaan arsitektur yang sah antara platform web dan mobile native.
- Dashboard pegawai tetap berada di WebView, sehingga sesi auth native tetap harus di-bootstrap ke layer web sebelum fitur employee dipakai.

## Prioritas lanjutan native login

Bagian ini adalah backlog implementasi berikutnya setelah penyelarasan dasar copy/layout native login.

- `Tab native Masuk / Daftar`: native login saat ini baru kuat di jalur `Masuk`. Parity berikutnya adalah menghadirkan tab `Daftar` lengkap dengan opsi `Email`, `Undangan`, dan `Organisasi` seperti `/employee/login`, tetapi tetap berjalan native.
- `Branding organisasi dinamis`: nama dan logo organisasi perlu ditarik dari tenant/organisasi yang valid, lalu disimpan sebagai cache native agar branding login tidak bergantung pada build config statis.
- `Penyimpanan kredensial aman`: jika produk mengharuskan username/password dapat dipulihkan untuk login berikutnya, implementasinya harus memakai secure credential storage Android, bukan sekadar session JSON atau preferences biasa.
- `Ketahanan buffer absensi lokal`: queue absensi yang belum sempat tersinkron ke server harus tetap aman saat app ditutup, crash, atau HP mati, lalu sinkronisasi dilanjutkan saat lifecycle yang tepat.
- `Kesesuaian layout di HP kecil`: login native harus diuji dan dirapikan untuk layar Android pendek agar tidak memerlukan scroll yang tidak perlu pada CTA dan field utama.
- `UAT alur sesi`: perilaku restore session, logout, forgot password native, dan handoff ke `/employee/dashboard` harus diuji khusus di device Android, bukan hanya dianggap benar dari implementasi kode.

Urutan prioritas implementasi yang disarankan:

1. tab native `Masuk / Daftar`
2. secure credential storage
3. branding tenant dinamis
4. ketahanan buffer absensi lokal
5. fit layout pada HP kecil

## Arsitektur dan keamanan

README utama sekarang hanya menyimpan ringkasan. Rincian lengkap mengenai:

- kebijakan WebView dan izin lokasi
- lapisan anti fake GPS
- model keamanan, batasan, dan proteksi produksi
- arsitektur hybrid login, target kelengkapan native login, dan branding tenant
- kontrak preflight, daftar native, deep link reset password, dan bridge Android ke WebView
- kebijakan penyimpanan sesi, buffer absensi lokal, logout, sinkronisasi, dan pembagian native vs web

dipindahkan ke [ARCHITECTURE_SECURITY.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/ARCHITECTURE_SECURITY.md).

## Spesifikasi teknis

- `applicationId`: `com.absensiku.webview`
- `minSdk`: `24`
- `targetSdk`: `35`
- `compileSdk`: `35`
- `versionName`: `1.0.0`
- Runtime Java/Kotlin: `17`
- `usesCleartextTraffic`: `false`
- `allowBackup`: `false`

## Prasyarat build

- JDK `17`
- Android Studio versi terbaru yang kompatibel dengan Android Gradle Plugin `8.5.2`
- Android SDK Platform `35`
- Android device atau emulator untuk uji instalasi APK

## Tools lokal yang dibutuhkan

### Wajib untuk build

- `JDK 17`
- `Android SDK Platform 35`
- `Android SDK Build-Tools` untuk platform `35`
- `Android SDK Platform-Tools` agar `adb` tersedia
- `Android SDK Command-line Tools` jika build dilakukan dari terminal
- `Gradle Wrapper` bawaan repo: `android-webview/gradlew`

### Sangat disarankan untuk debug

- `Android Studio`
- `adb`
- `logcat`

### Dibutuhkan untuk release signing

- `keytool`
- `zipalign`
- `apksigner`

### Opsional

- `bundletool` jika nanti ingin menghasilkan atau menginspeksi `AAB`

## Environment variable yang umum dipakai

- `JAVA_HOME` mengarah ke instalasi `JDK 17`
- `ANDROID_HOME` atau `ANDROID_SDK_ROOT` mengarah ke folder Android SDK lokal

## Konfigurasi build hybrid login

- Android tidak lagi membaca `.env` atau `.env.local` milik web app agar konfigurasi Android dan web tidak tercampur.
- APK Android membaca konfigurasi build dari prioritas berikut:
  - Gradle project property
  - environment variable shell
  - `android-webview/local.properties`
- Variabel yang dipakai:
  - `ABSENSIKU_WEB_BASE_URL`
  - `ABSENSIKU_SUPABASE_URL`
  - `ABSENSIKU_SUPABASE_PUBLISHABLE_KEY`
  - `ABSENSIKU_TENANT_DISPLAY_NAME`
- Jika `ABSENSIKU_WEB_BASE_URL` tidak diisi, APK fallback ke `https://absensiku-alpha.vercel.app`.
- Jika `SUPABASE_URL` atau publishable key tidak tersedia, login native tidak akan dijalankan dan app menampilkan error konfigurasi.
- Format yang disarankan untuk `android-webview/local.properties`:

```properties
sdk.dir=/Users/your-user/Library/Android/sdk
ABSENSIKU_WEB_BASE_URL=https://absensiku-alpha.vercel.app
ABSENSIKU_SUPABASE_URL=https://your-project-ref.supabase.co
ABSENSIKU_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
ABSENSIKU_TENANT_DISPLAY_NAME=Aplikasi Internal Pegawai
```

- Pemisahan yang disarankan:
  - web lokal: `.env.local`
  - web online: Vercel environment variables
  - Android lokal/build: `android-webview/local.properties`
- `android-webview/local.properties.example` sengaja tetap berada di root agar dekat dengan workflow build dan mudah ditemukan saat setup pertama.

Contoh verifikasi cepat di terminal:

```bash
java -version
adb version
echo $JAVA_HOME
echo $ANDROID_HOME
```

## Checklist environment sebelum build

- Pastikan `java -version` menampilkan Java `17`
- Pastikan `adb version` berjalan tanpa error
- Pastikan Android SDK sudah memiliki `platforms;android-35`
- Pastikan Android SDK sudah memiliki `platform-tools`
- Pastikan Android SDK sudah memiliki `build-tools`
- Pastikan file `android-webview/gradlew` bisa dieksekusi

## MCP dan tooling agent

- Tidak ada MCP tambahan yang wajib hanya untuk build APK debug dasar.
- `Context7` berguna jika perlu dokumentasi Android/WebView/Play Integrity saat implementasi atau hardening.
- `Supabase` berguna jika pengembangan dilanjutkan ke validasi server-side, attestation, atau device binding.
- `GitHub` berguna jika workflow build APK di CI/artifact ingin dirapikan.
- `Playwright` hanya relevan untuk menguji flow web yang dibuka di WebView, bukan untuk proses build APK inti.
- MCP di atas bersifat opsional untuk workflow pengembangan berbantu agent, bukan kebutuhan runtime APK.

## Ganti target URL

Konfigurasi URL target dan host allowlist tidak lagi diedit langsung di `MainActivity.kt`.
Sumber konfigurasinya sekarang berasal dari:

- `android-webview/local.properties`
- Gradle project properties
- environment variable shell
- `android-webview/app/build.gradle`

Jika ingin pindah ke environment lain, ubah nilai berikut secara konsisten:

- `ABSENSIKU_WEB_BASE_URL`
- `ABSENSIKU_SUPABASE_URL`
- `ABSENSIKU_SUPABASE_PUBLISHABLE_KEY`

`allowedHost` akan diturunkan otomatis dari `ABSENSIKU_WEB_BASE_URL` saat build.

## Ganti logo APK

Gunakan script ini untuk mengganti icon launcher dari file PNG:

```bash
scripts/set-android-logo.sh /absolute/path/logo.png
```

Script akan mengenerate semua resource `mipmap` dan `ic_launcher_foreground`.

## Build APK (Android Studio)

1. Buka folder `android-webview` di Android Studio.
2. Tunggu Gradle sync selesai.
3. Build APK debug:
   - `Build` -> `Build Bundle(s) / APK(s)` -> `Build APK(s)`
4. Output debug APK:
   - `android-webview/app/build/outputs/apk/debug/app-debug.apk`

## Build APK via CLI

Jika Android SDK sudah terpasang dan `gradlew` tersedia:

```bash
cd android-webview
./gradlew assembleDebug
```

Output:

- `android-webview/app/build/outputs/apk/debug/app-debug.apk`

Perintah verifikasi tambahan yang berguna:

```bash
cd android-webview
./gradlew tasks
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Catatan build release

- Build type `release` sudah mengaktifkan `minifyEnabled` dan `shrinkResources`.
- Signing release tidak dikonfigurasi di README ini; sesuaikan dengan konfigurasi lokal atau CI yang dipakai tim.
- Jika butuh APK release yang siap distribusi, siapkan keystore dan konfigurasi signing terlebih dahulu.
- File keystore lokal di `android-webview/signing/` tidak boleh dianggap artefak repo; simpan dan distribusikan lewat secret storage/CI, bukan commit ke git.

## Build APK via GitHub Actions

Workflow tersedia di:

- `.github/workflows/build-android-webview.yml`

Cara pakai:

1. Push perubahan ke GitHub.
2. Buka tab `Actions` pada repo.
3. Jalankan workflow `Build Android WebView APK` (manual `workflow_dispatch`) atau cukup push file di `android-webview/`.
4. Download artifact `absensiku-webview-debug-apk`.

## Checklist uji manual

### Verifikasi perilaku v1 saat ini

- Pastikan halaman login employee terbuka normal.
- Pastikan login native tidak menampilkan captcha lokal.
- Pastikan login native tidak menampilkan tombol/link auth yang melempar user ke halaman auth web.
- Tutup app saat sesi aktif lalu buka kembali untuk memastikan restore sesi bekerja dengan persistensi sesi native yang aktif secara default.
- Logout dari dashboard lalu pastikan app kembali ke login native, bukan tertahan di halaman web login.
- Simulasikan HP mati / force close saat ada absensi pending lalu buka lagi app untuk mengukur perilaku aktual. Pada v1 saat ini, ketahanan antrian lokal lintas cold start masih diperlakukan sebagai risiko/target hardening, belum jaminan perilaku final.
- Uji logout saat masih ada pending attendance untuk memastikan perilakunya sesuai policy yang dipilih tim, bukan menghapus diam-diam.
- Uji izin lokasi: sekali dengan `Allow`, sekali dengan `Deny`.
- Pastikan geolocation hanya bekerja pada origin yang diizinkan.
- Pastikan app menampilkan panel blokir jika device berada pada kondisi mock location / Fake GPS.

### UAT matrix per flow

- `Masuk`
  - login berhasil dengan akun valid
  - login gagal dengan password salah
  - login gagal dengan akun tidak aktif / belum valid
  - app ditutup lalu dibuka lagi, sesi dipulihkan ke dashboard
- `Daftar via Email`
  - kirim OTP berhasil
  - OTP salah / expired
  - akun berhasil dibuat
  - tenant belum terhubung dan user diarahkan sesuai policy produk
- `Daftar via Undangan`
  - kode undangan valid
  - kode undangan invalid / expired
  - organisasi dari undangan tampil benar
  - akun langsung terhubung ke tenant yang benar
- `Daftar via Organisasi`
  - registrasi organisasi berhasil
  - validasi data organisasi gagal
  - akun admin awal berhasil dibuat
- `Reset Password`
  - permintaan reset berhasil
  - link reset membuka APK lagi
  - reset password berhasil dari deep link native
  - token reset invalid / expired
- `Restore session dan logout`
  - restore session berhasil setelah cold start
  - logout membersihkan sesi native dan sesi web
  - logout saat ada pending attendance mengikuti policy yang dipilih
- `Reliability dan keamanan`
  - HP mati / force close saat ada pending sync
  - koneksi putus lalu kembali
  - fake GPS terdeteksi dan memblokir flow
  - host di luar allowlist ditolak

### Acceptance criteria target akhir

- Login native berjalan tanpa captcha.
- Login native tidak menampilkan tombol/link yang melempar user ke halaman auth web.
- Seluruh entry point auth pegawai berjalan `100% native`.
- Flow `Daftar` native mengikuti jalur `Email + Undangan + Organisasi`.
- Flow `Lupa / Ganti Password` berjalan native.
- Aktivasi, undangan, dan state verifikasi lain yang sebelumnya ada di `/employee/login` tersedia di native sesuai scope implementasi.
- Login native dapat menyimpan username dan password secara aman untuk login/autofill berikutnya.
- Logo dan nama organisasi ditarik dari data organisasi/tenant yang benar lalu tersimpan sebagai cache native.
- Layout login native fit pada layar HP Android umum dan CTA utama tidak terdorong keluar viewport.
- Area bawah login berhenti di `Lupa / Ganti Password`; tidak ada footer copy setelah elemen itu.
- Tombol Back/Home/Recent Apps Android tetap bisa diklik.

## Release criteria 100% native login

APK baru boleh dianggap mencapai `100% native login` jika seluruh syarat berikut sudah terpenuhi:

- tab `Masuk / Daftar` tersedia penuh di native
- jalur `Email + Undangan + Organisasi` sudah berjalan native
- forgot/reset password berjalan end-to-end native, termasuk saat membuka link dari email
- helper non-auth setelah `Lupa / Ganti Password` tidak lagi mengganggu layout akhir login
- username/password atau kredensial yang diizinkan produk sudah tersimpan dengan secure credential storage
- branding tenant/logo sudah di-resolve dari data organisasi yang benar
- bootstrap auth web tidak lagi menjadi ketergantungan utama untuk menyelesaikan flow auth pegawai
- UAT matrix per flow lulus di device Android nyata

## Status pengujian Android

- Modul `android-webview` saat ini belum memiliki cakupan pengujian Android yang kuat dalam bentuk unit test native atau instrumentation test yang rutin dijalankan.
- Build APK yang berhasil bukan berarti perilaku runtime Android, WebView, login hybrid, dan handoff sesi sudah tercakup otomatis oleh test.
- Karena itu, validasi utama untuk modul ini saat ini masih mengandalkan:
  - build Gradle yang berhasil
  - uji manual di device/emulator Android
  - uji integrasi terhadap web live yang benar-benar dipakai APK
- Area yang paling perlu diuji manual setiap ada perubahan:
  - login native
  - daftar native (email, undangan, organisasi)
  - restore sesi
  - bootstrap root-level ke `/employee/dashboard`
  - logout kembali ke login native
  - fake GPS blocking
  - perilaku buffer absensi lokal dan retry sinkronisasi

## Bukti uji penting

Untuk menjaga root `android-webview` tetap rapi, hasil capture uji sekarang dibagi menurut nilai bukti:

- Screenshot yang masih dirujuk langsung oleh dokumen tetap berada di root `android-webview` dan memakai nama deskriptif.
- Bukti final bernilai tinggi disimpan di [artifacts/manual-tests/final](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/artifacts/manual-tests/final).
- Capture pembanding awal/manual smoke disimpan di [artifacts/manual-tests/baseline](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/artifacts/manual-tests/baseline).
- Jejak debug, retry, dan eksperimen input disimpan di [artifacts/manual-tests/debug](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/artifacts/manual-tests/debug).
- Aturan penyimpanan ringkas ada di [artifacts/manual-tests/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/artifacts/manual-tests/README.md).

Contoh bukti final yang paling sering dipakai:

- [anr-after-login.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/artifacts/manual-tests/final/anr-after-login.png)
- [current-session-screen.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/artifacts/manual-tests/final/current-session-screen.png)
- [final-local-dashboard-final.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/artifacts/manual-tests/final/final-local-dashboard-final.png)
- [production-dashboard-final3.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/artifacts/manual-tests/final/production-dashboard-final3.png)
- [susi-dashboard-final.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/android-webview/artifacts/manual-tests/final/susi-dashboard-final.png)

## Katalog error singkat

- `Invalid API key`
  - gejala: login native gagal sebelum sesi dibuat
  - arti: `SUPABASE_URL` dan publishable key tidak berasal dari project yang sama
  - tindak lanjut: cek konfigurasi `ABSENSIKU_SUPABASE_URL` dan `ABSENSIKU_SUPABASE_PUBLISHABLE_KEY`
- `Bootstrap failed`
  - gejala: login native berhasil tetapi WebView tidak sampai ke dashboard
  - arti: handoff sesi ke `/employee/dashboard` gagal atau bootstrap sesi web tidak terbentuk
  - tindak lanjut: cek route web live, session handoff, dan log error dengan `Ref ID`
- `Session invalid` / `refresh failed`
  - gejala: app kembali ke login native saat startup atau saat resume
  - arti: token tersimpan tidak lagi valid atau refresh token gagal
  - tindak lanjut: login ulang dan cek expiry / revoke sesi
- `Fake GPS blocked`
  - gejala: app menampilkan panel blokir sebelum dashboard
  - arti: device terdeteksi memakai mock location atau aplikasi spoofing lokasi
  - tindak lanjut: nonaktifkan mock location, hapus Fake GPS, lalu coba lagi
- `Host blocked`
  - gejala: link bantuan akun atau navigasi tertentu tidak mau dibuka di WebView
  - arti: host/path tersebut tidak masuk allowlist APK
  - tindak lanjut: cek `ABSENSIKU_WEB_BASE_URL` dan kebijakan allowlist
- `Pending sync terlalu lama`
  - gejala: absensi berstatus `pending` terlalu lama di perangkat
  - arti: dashboard/web scheduler tidak sempat aktif, koneksi tidak stabil, atau backend terus menolak sinkronisasi
  - tindak lanjut: buka dashboard saat online, cek log sync, dan simpan `trace_id` / `Ref ID` untuk investigasi

## Troubleshooting

- Jika Gradle sync gagal, pastikan JDK `17` aktif.
- Jika halaman tidak terbuka, pastikan device memiliki koneksi internet dan host target dapat diakses via `HTTPS`.
- Jika login native gagal dengan pesan konfigurasi Supabase tidak cocok, pastikan `ABSENSIKU_SUPABASE_URL` dan `ABSENSIKU_SUPABASE_PUBLISHABLE_KEY` berasal dari project Supabase yang sama.
- Jika app kembali ke login saat startup padahal sebelumnya sudah masuk, cek apakah persistensi sesi native masih aktif dan token lama masih valid.
- Jika lokasi tidak terbaca, cek izin lokasi di Android Settings lalu buka ulang app.
- Jika app diblokir, nonaktifkan mock location di Developer Options dan hapus aplikasi Fake GPS dari device sebelum menekan `Coba Lagi`.
- Jika absensi masih bisa dibypass lewat APK lain, cek ulang apakah validasi server-side, device binding, dan kebijakan akses WebView benar-benar aktif.

## Catatan penting

Proteksi anti fake GPS di level client tidak bisa 100% anti-bypass.
Untuk produksi, gabungkan juga validasi server-side (mis. anomali kecepatan, audit device binding, dan verifikasi sesi) agar lebih kuat.
