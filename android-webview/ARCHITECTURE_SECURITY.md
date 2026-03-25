# Arsitektur dan Keamanan Android WebView

Dokumen ini memindahkan rincian arsitektur hybrid, kebijakan keamanan, kontrak bridge, dan aturan sesi dari `android-webview/README.md` agar README utama tetap fokus pada status, build, dan testing.

## Kebijakan WebView

- WebView hanya mengizinkan navigasi `HTTPS` ke host yang dikonfigurasi lewat `ABSENSIKU_WEB_BASE_URL` atau fallback default `absensiku-alpha.vercel.app`.
- Navigasi ke domain lain akan diblokir oleh app.
- Mixed content dinonaktifkan.
- Akses file lokal dan content provider dari WebView dinonaktifkan.

## Izin lokasi dan proteksi device

- App meminta izin lokasi `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` saat dibutuhkan.
- Jika izin lokasi ditolak, halaman tetap dapat dibuka, tetapi fitur geolocation web dapat gagal atau ditolak.
- Geolocation WebView hanya diberikan untuk origin yang diizinkan.
- Jika perangkat terdeteksi memakai mock location atau aplikasi Fake GPS, app akan menampilkan panel blokir sampai kondisi perangkat diperbaiki lalu dicoba lagi.

## Fitur keamanan yang dipasang

- Blokir jika ada `mock_location_app` aktif di Developer Options.
- Blokir jika terdeteksi aplikasi Fake GPS populer.
- Blokir jika update lokasi Android terdeteksi `isMock` / `isFromMockProvider`.

## Lapisan anti fake GPS yang dibutuhkan

- Lapisan `client`: deteksi mock location, deteksi aplikasi Fake GPS, dan pemblokiran UI di device.
- Lapisan `WebView policy`: pembatasan host, origin geolocation yang diizinkan, dan penolakan flow di luar app internal.
- Lapisan `server`: validasi device binding, kebijakan akses absensi, dan penolakan fail-closed jika konteks keamanan tidak valid.
- Lapisan `operasional`: audit anomali lokasi, investigasi insiden, dan referensi error seperti `trace_id` saat absensi ditolak.

## Prinsip implementasi

- Jangan menganggap satu deteksi client saja sudah cukup.
- Jangan menganggap URL WebView yang disembunyikan akan menyelesaikan masalah fake GPS.
- Jangan meloloskan absensi hanya karena halaman berhasil dibuka di WebView.
- Selalu anggap proteksi client bisa dibypass, lalu pastikan server tetap bisa menolak absensi yang tidak memenuhi kebijakan keamanan.

## Model keamanan dan batasan

- URL WebView tidak boleh dianggap rahasia. URL dapat diketahui dari APK, trafik jaringan, atau proses decompile.
- Wrapper APK ini hanya menambah lapisan proteksi di sisi client. Ia tidak cukup jika dipakai sebagai satu-satunya mekanisme anti-bypass.
- APK clone tetap mungkin dibuat dengan URL yang sama tetapi tanpa guard Fake GPS, tanpa pembatasan host, atau dengan modifikasi perilaku WebView.
- Karena itu, keputusan akhir apakah user boleh login/absen harus tetap divalidasi di server, bukan hanya di APK.
- Jangan mengandalkan obfuscation, rename package, atau menyembunyikan URL sebagai kontrol keamanan utama.

## Proteksi produksi yang disarankan

- Aktifkan validasi server-side untuk `device binding`, kebijakan browser/WebView, dan validasi sesi absensi.
- Gunakan mode fail-closed: jika bukti perangkat atau konteks client tidak valid, server harus menolak proses absensi.
- Jika distribusi APK dilakukan secara resmi, pertimbangkan app attestation agar server bisa membedakan APK resmi dari APK clone.
- Jika nanti ditambahkan bridge native `window.Android`, expose method minimum yang benar-benar dibutuhkan, lalu tetap verifikasi hasilnya di server.
- Simpan dan tampilkan referensi error backend seperti `trace_id` pada alur gagal absensi agar triase bypass/security incident lebih mudah.

## Catatan akselerasi cepat

- Untuk kebutuhan implementasi cepat, boleh dipakai pendekatan sementara berupa `app_code` atau kode aplikasi yang ditanam di APK lalu diverifikasi ke server saat app dibuka.
- Jika kode cocok, server dapat mengeluarkan `short-lived token` agar aplikasi boleh melanjutkan startup dan membuka WebView.
- Token ini sebaiknya tidak hanya dipakai saat startup. Endpoint sensitif seperti login absensi, `check-in`, dan `check-out` tetap harus memverifikasi token yang sama.
- Pendekatan ini cocok sebagai lapisan awal untuk menahan clone APK level amatir dan mempercepat go-live.
- Pendekatan ini bukan proteksi final, karena `app_code` tetap bisa diekstrak dari APK atau ditiru oleh clone APK yang lebih serius.
- Karena itu, pendekatan cepat ini harus dianggap sebagai tahap transisi sebelum hardening yang lebih kuat seperti attestation, bridge native minimal, dan validasi server-side yang lebih ketat.

## Catatan arsitektur hybrid login

Bagian ini menjelaskan arah produk jangka akhir, bukan cerminan penuh perilaku APK v1 saat ini.

- Jika APK dikembangkan ke mode hybrid, halaman login utama sebaiknya dibuat native dan terpisah dari halaman web `/employee/login`.
- Tujuan login native adalah menangani preflight security, device binding, penyimpanan sesi yang lebih aman, dan kontrol startup sebelum WebView dibuka.
- Halaman web `/employee/login` tetap dipertahankan untuk browser biasa, tetapi APK tidak sebaiknya menambahkan tombol/link yang melempar user dari login native ke halaman auth web.
- Pendekatannya adalah `mengikuti flow /employee/login` sampai setara secara fitur, tetapi mengimplementasikannya secara native, bukan sekadar membuka flow auth web dari dalam APK.
- Untuk tombol `Daftar` pada native login, arah yang diinginkan adalah mengikuti struktur flow `/employee/login`, khususnya jalur pendaftaran berbasis `Email + Undangan + Organisasi`, tetapi seluruh flow itu berjalan native di APK.
- Setelah login native berhasil, aplikasi sebaiknya langsung membuka WebView ke halaman pasca-login seperti dashboard, bukan kembali ke `/employee/login`.
- Saat logout dari APK, user sebaiknya dikembalikan ke login native, bukan ke form login web.
- Jika produk mengharuskan login native menyimpan username dan password, keduanya harus disimpan melalui secure credential storage Android atau mekanisme sekelas Credential Manager, bukan dalam bentuk plaintext.
- Strategi target yang diinginkan adalah membuat flow auth native lengkap, bukan menyisakan `Buka Web`, `Lupa / Ganti Password` berbasis web, atau shortcut lain ke halaman auth web.
- Helper opsional seperti `Hubungi HR` diperlakukan sebagai bantuan kontak non-auth, bukan sebagai shortcut ke flow autentikasi web.
- Untuk UX login utama, arah yang diinginkan adalah `tanpa captcha` di native. Jika tetap diperlukan proteksi abuse, prioritaskan rate-limit, device binding, dan validasi server-side daripada captcha lokal di APK.
- Login native harus didesain agar fit layar HP Android umum sejak awal, bukan mengandalkan card tinggi dan scroll panjang seperti porting halaman web.
- Area bawah login native sebaiknya berhenti di `Lupa / Ganti Password`; tidak perlu ada footer note, helper text, atau copy penjelasan tambahan setelah elemen itu.

## Target kelengkapan native login

Bagian ini adalah target akhir produk, bukan deskripsi perilaku v1 saat ini.

- Login native tidak sebaiknya menampilkan tombol `Buka Web`, `Lupa / Ganti Password?` berbasis web, atau shortcut auth lain yang mengarahkan user ke `/employee/login`.
- Helper kontak non-auth seperti `Hubungi HR` tidak boleh ditafsirkan sebagai auth shortcut, dan pada target UX akhir tidak sebaiknya mengganggu area bawah login setelah `Lupa / Ganti Password`.
- Targetnya adalah halaman auth native yang lengkap seperti flow web `/employee/login`, tetapi tetap disesuaikan dengan UX Android.
- Flow minimum yang perlu ada secara native:
  - `Masuk`
  - `Daftar`
  - pendaftaran berbasis `Email + Undangan + Organisasi`
  - aktivasi akun
  - lupa / ganti password
  - state verifikasi, error, loading, dan sukses
  - penyimpanan username dan password secara aman untuk autofill/login berikutnya
  - opsi `tetap masuk` dan restore sesi
- Login native harus `100% native` untuk seluruh flow auth pegawai yang menjadi entry point aplikasi.
- Halaman login native harus fit layar HP dan menjaga CTA utama, field utama, branding, dan status keamanan tetap terlihat tanpa terasa seperti halaman web yang dipadatkan.
- Parity yang diinginkan adalah parity fitur dan alur, bukan visual yang harus identik piksel demi piksel dengan halaman web.
- Jika ada flow yang saat ini belum sempat dipindah ke native, itu harus dicatat sebagai gap implementasi, bukan dijadikan arah UX final.
- Setelah `Lupa / Ganti Password`, tidak boleh ada footer note, helper text, atau tulisan penjelasan tambahan pada target UX akhir.
- Untuk tahap transisi, bootstrap sesi ke WebView masih boleh dipakai setelah login native berhasil. Namun target akhir auth pegawai adalah meminimalkan ketergantungan pada route auth web dan menjadikan layer native sebagai entry point yang lengkap.

## Catatan branding login native

Catatan implementasi saat ini:

- Branding login native v1 masih dapat memakai nilai dari konfigurasi build seperti `ABSENSIKU_TENANT_DISPLAY_NAME`. Penarikan dinamis dari organisasi/tenant belum menjadi perilaku yang konsisten.
- Logo dan nama organisasi pada halaman login native sebaiknya ditarik dari data organisasi/tenant yang valid, bukan hanya hardcoded di APK.
- Setelah organisasi/tenant berhasil di-resolve, logo dan nama organisasi perlu disimpan sebagai cache native agar login berikutnya lebih cepat dan branding tetap konsisten.
- Jika aplikasi bersifat `single-tenant`, identitas organisasi masih bisa disediakan lewat konfigurasi app build atau remote config, tetapi sumber idealnya tetap berasal dari data organisasi yang sah.
- Jika aplikasi bersifat `multi-tenant`, identitas organisasi dapat ditentukan dari salah satu sumber berikut: kode instansi, invite code, subdomain/URL distribusi, email lookup awal, atau pilihan instansi di layar awal.
- Jika tenant belum diketahui saat aplikasi pertama dibuka, tampilkan dulu branding default `AbsensiKu`, lalu ganti ke logo dan nama organisasi setelah tenant berhasil di-resolve.
- Native login sebaiknya menampilkan branding minimum: logo organisasi, nama organisasi, dan teks status keamanan perangkat.
- Jangan menjadikan logo instansi sebagai satu-satunya penanda bahwa app resmi. Branding hanya meningkatkan kejelasan UX, bukan kontrol keamanan.

## Kebijakan tenant resolution

- Native login perlu memiliki aturan resolusi tenant yang tegas sebelum branding, daftar, dan kebijakan auth dijalankan.
- Urutan sumber tenant yang disarankan:
  1. `invite code` jika user masuk lewat flow undangan
  2. hasil preflight server-side jika app sudah membawa `tenant_hint`
  3. lookup awal berdasarkan email pada flow login/daftar
  4. pilihan instansi manual jika aplikasi memang multi-tenant
- Jika tenant berhasil di-resolve, native app menyimpan `tenant_id`, `tenant_name`, dan `tenant_logo_url` sebagai cache native jangka pendek.
- Jika tenant belum bisa di-resolve, tampilkan branding default `AbsensiKu` dan jangan menganggap organisasi sudah valid hanya dari cache lama.
- Policy ini perlu konsisten antara login native, daftar native, dan bootstrap sesi agar user tidak melihat branding atau organisasi yang salah.

## Alur hybrid end-to-end

1. App dibuka lalu menjalankan preflight native: cek koneksi, cek mock location/Fake GPS, cek status app, dan resolve tenant/branding bila diperlukan.
2. Jika preflight lolos, tampilkan login native.
3. User login melalui form native, lalu app meminta sesi atau token ke server.
4. Sesi/token disimpan di native secure storage, bukan mengandalkan password mentah.
5. Native app menginjeksikan sesi yang valid ke WebView.
6. WebView dibuka langsung ke halaman pasca-login seperti dashboard atau halaman employee utama.
7. Endpoint sensitif seperti login absensi, `check-in`, dan `check-out` tetap memverifikasi token/app proof ke server.
8. Saat logout, sesi native dan sesi WebView dibersihkan lalu user dikembalikan ke login native.

Catatan implementasi saat ini:

- Saat ini langkah `preflight` di atas masih bersifat target arsitektur. Implementasi aktif yang sudah ada baru mencakup cek konfigurasi, cek sesi native tersimpan, dan guard fake GPS di sisi client.

## State machine startup

```text
App dibuka
-> cek fake GPS / mock location
-> cek konfigurasi build
-> cek sesi native tersimpan
-> jika sesi valid: buka /employee/dashboard
-> jika sesi tidak valid: tampilkan login native
-> setelah login native sukses: handoff sesi ke WebView
-> root bootstrap web menyetel sesi Supabase sebelum dashboard dipakai
-> redirect ke /employee/dashboard
-> saat logout: bersihkan sesi auth lalu kembali ke login native
```

Catatan:

- Startup normal saat ini belum memiliki service native terpisah untuk sinkronisasi absensi di background.
- Sinkronisasi absensi lokal baru bisa berjalan lagi saat app/WebView aktif, koneksi tersedia, dan scheduler web hidup.

## Kebijakan arsitektur hybrid

- `Auth ownership`: sesi utama dimiliki native app. WebView menerima sesi yang sudah dibuka native dan tidak menjadi sumber kebenaran utama untuk login APK.
- `Re-login policy`: menutup aplikasi atau berpindah app tidak boleh memaksa login ulang. Login ulang hanya diminta saat user logout, refresh token gagal, sesi benar-benar expired, akun dicabut, atau device diblokir kebijakan keamanan.
- `Storage policy`: yang disimpan adalah access token, refresh token, dan metadata sesi. Password mentah tidak boleh disimpan sebagai mekanisme remember login.
- `Credential policy`: jika username/password perlu disimpan untuk mempercepat login berikutnya, gunakan secure credential storage Android dan jangan pernah menyimpannya sebagai plaintext di preferences, log, atau localStorage.
- `Logout policy`: logout harus menghapus sesi native, cookie WebView, state bootstrap, dan storage WebView yang terkait autentikasi secara bersamaan. Buffer absensi lokal mengikuti kebijakan tersendiri dan tidak otomatis dibatalkan kecuali tim memilih policy itu.
- `Navigation policy`: startup, preflight security, login, logout, dan fallback error tetap milik native. Dashboard dan fitur operasional boleh tetap berada di web.
- `Auth parity policy`: flow auth APK sebaiknya lengkap di native. Register, invite, forgot password, reset password, dan aktivasi tidak dijadikan link keluar ke halaman auth web sebagai UX final.
- `Layout policy`: layar login native harus fit pada layar HP Android umum dan menjaga field penting, CTA utama, serta branding organisasi tetap terlihat jelas tanpa ketergantungan pada layout web.
- `Allowlist policy`: WebView hanya boleh membuka host dan path internal yang telah diizinkan. Link eksternal harus diblokir atau dibuka di browser luar sesuai kebijakan tim.
- `Session handoff policy`: native boleh menginjeksikan sesi ke web. Web hanya boleh menyinkronkan balik data sesi yang aman dan perlu untuk persistensi APK.
- `Security gate policy`: deteksi fake GPS, mock location, dan status device dijalankan saat startup, resume, dan sebelum aksi absensi sensitif bila diperlukan.
- `Server trust policy`: backend tidak boleh mempercayai user-agent, localStorage, atau flag client sebagai bukti utama. Keputusan absensi harus tetap bergantung pada sesi valid, device binding, dan validasi server-side.
- `Device policy`: tentukan batas device per akun, kapan reset device diperbolehkan, siapa yang berwenang override, dan apakah reset mengharuskan login ulang.
- `Offline policy`: login dan absensi sebaiknya `fail-closed` saat konektivitas atau validasi keamanan tidak tersedia, kecuali tim memang merancang mode offline dengan sinkronisasi tertunda.
- `Version policy`: tentukan kapan app lama masih boleh dipakai, kapan update menjadi wajib, dan apakah enforcement berupa soft warning atau hard block.
- `Error policy`: setiap error penting dari native atau backend harus membawa `Ref ID` atau `trace_id` agar triase cepat.
- `Privacy policy`: token, password, dan data sensitif tidak boleh masuk log native, log web, atau pesan error yang ditampilkan ke user.
- `Branding policy`: logo dan identitas tenant dipakai untuk kejelasan UX, bukan sebagai kontrol keamanan.

## Kontrak API preflight

- Server sebaiknya menyediakan endpoint preflight khusus untuk APK hybrid sebelum WebView dijalankan.
- Request minimum yang disarankan:
  - `app_code` atau identitas app sementara
  - `app_version`
  - `package_name`
  - `device_id`
  - `tenant_hint` jika ada
  - `android_version`
  - `timestamp`
- Response minimum yang disarankan:
  - `allowed`
  - `message`
  - `preflight_token`
  - `tenant_id`
  - `tenant_name`
  - `tenant_logo_url`
  - `expires_at`
  - `trace_id`
- Jika `allowed=false`, app tidak boleh membuka WebView dan harus menampilkan alasan blokir.
- `preflight_token` harus bersifat singkat (`short-lived`) dan wajib diverifikasi ulang pada login absensi, `check-in`, dan `check-out`.
- Catatan: kontrak ini masih rekomendasi desain. Implementasi endpoint preflight belum aktif di APK v1 saat ini.

Contoh struktur respons:

```json
{
  "allowed": true,
  "message": "App verified",
  "preflight_token": "short-lived-token",
  "tenant_id": "tenant-uuid",
  "tenant_name": "Instansi Contoh",
  "tenant_logo_url": "https://.../logo.png",
  "expires_at": "2026-03-09T10:00:00Z",
  "trace_id": "TRACE-APK-VERIFY-001"
}
```

## Kontrak backend untuk daftar native

- Agar flow `Daftar` benar-benar pindah ke native, backend perlu menyediakan kontrak yang jelas untuk tiga jalur: `Email`, `Undangan`, dan `Organisasi`.
- Jalur `Email` minimal membutuhkan endpoint untuk:
  - kirim OTP/verifikasi email
  - verifikasi OTP
  - buat akun dasar
  - cek/ikat kode undangan jika organisasi belum diketahui saat registrasi awal
- Jalur `Undangan` minimal membutuhkan endpoint untuk:
  - validasi kode undangan
  - ambil ringkasan organisasi/tenant dari undangan
  - buat akun atau aktivasi akun langsung terhubung ke organisasi
- Jalur `Organisasi` minimal membutuhkan endpoint untuk:
  - daftar organisasi baru
  - buat akun admin organisasi awal
  - validasi data organisasi dan identitas admin
- Semua endpoint di atas sebaiknya mengembalikan:
  - status yang jelas untuk UI native (`success`, `needs_verification`, `invalid_invite`, `rate_limited`, dll.)
  - `Ref ID` atau `trace_id`
  - informasi tenant minimum jika sudah diketahui
- README ini belum menetapkan shape JSON final per endpoint, tetapi kontrak backend harus dikunci sebelum implementasi tab `Daftar` native dimulai agar UI native tidak dibangun di atas asumsi yang berubah-ubah.

### Contoh payload daftar native

Contoh ini adalah shape minimum yang disarankan agar tim native dan backend punya acuan implementasi yang konsisten.

Contoh request `Daftar via Email`:

```json
{
  "mode": "email",
  "email": "pegawai@instansi.go.id",
  "full_name": "Nama Pegawai",
  "password": "secret-password",
  "tenant_hint": null,
  "device_id": "AND-DEVICE-ID",
  "app_version": "1.0.0"
}
```

Contoh response kirim/verifikasi OTP:

```json
{
  "status": "needs_verification",
  "verification_channel": "email",
  "masked_destination": "peg***@instansi.go.id",
  "verification_token": "temp-verification-token",
  "expires_at": "2026-03-10T09:15:00Z",
  "trace_id": "TRACE-REG-OTP-001"
}
```

Contoh request `Daftar via Undangan`:

```json
{
  "mode": "invite",
  "invite_code": "INV-ABC123",
  "full_name": "Nama Pegawai",
  "email": "pegawai@instansi.go.id",
  "password": "secret-password",
  "phone": "08123456789",
  "device_id": "AND-DEVICE-ID",
  "app_version": "1.0.0"
}
```

Contoh response validasi undangan:

```json
{
  "status": "success",
  "tenant_id": "tenant-uuid",
  "tenant_name": "Dinas Contoh",
  "tenant_logo_url": "https://cdn.example.com/logo.png",
  "invite_valid": true,
  "trace_id": "TRACE-INV-VALID-001"
}
```

Contoh request `Daftar Organisasi`:

```json
{
  "mode": "organization",
  "organization_name": "Dinas Contoh",
  "admin_name": "Admin Organisasi",
  "admin_email": "admin@instansi.go.id",
  "admin_password": "secret-password",
  "phone": "08123456789",
  "city": "Jakarta",
  "device_id": "AND-DEVICE-ID",
  "app_version": "1.0.0"
}
```

Contoh response error:

```json
{
  "status": "invalid_invite",
  "message": "Kode undangan tidak valid.",
  "trace_id": "TRACE-INV-ERR-001"
}
```

## Kebijakan deep link reset password native

- Target akhir reset password adalah end-to-end native, bukan berhenti di kirim link email saja.
- Link reset dari email sebaiknya membuka APK kembali melalui deep link / app link, bukan jatuh ke browser biasa atau WebView auth.
- Deep link reset minimal perlu membawa token/konteks yang cukup untuk:
  - memverifikasi permintaan reset
  - membuka layar reset password native
  - menyelesaikan perubahan password
  - menampilkan hasil sukses/gagal dengan `Ref ID` bila perlu
- Jika app link gagal dibuka, fallback browser masih boleh ada pada fase transisi, tetapi itu harus dianggap fallback sementara, bukan UX final.
- Policy ini perlu disejajarkan dengan Supabase Auth atau mekanisme auth backend yang dipakai agar redirect reset password tidak memecah pengalaman user.

### Format deep link yang disarankan

- Reset password:
  - `absensiku://auth/reset-password?type=recovery&token=...`
  - App Link HTTPS fallback:
    - `https://absensiku-alpha.vercel.app/employee/reset-password?type=recovery&token=...`
- Aktivasi akun:
  - `absensiku://auth/activate?type=signup&token=...`
- Undangan:
  - `absensiku://auth/invite?invite_code=INV-ABC123`

Deep link minimum sebaiknya membawa:

- `type`
- `token` atau `verification_token`
- `invite_code` jika flow berasal dari undangan
- `tenant_hint` jika tenant sudah diketahui
- `trace_id` opsional untuk triase error

## Kontrak bridge Android ke WebView

- APK hybrid saat ini mengandalkan `JavascriptInterface` bernama `Android` sebagai kontrak handoff antara native login dan WebView.
- Kontrak ini menjadi titik integrasi penting. Jika web app mengubah nama method, format payload, atau urutan bootstrap tanpa sinkronisasi dengan APK, flow login hybrid dapat gagal walau route web masih hidup.
- Method yang saat ini dipakai:
  - `getAndroidId()`
    - mengembalikan identifier perangkat berbentuk string dengan prefix `AND-`
  - `getAndroidVersion()`
    - mengembalikan `SDK_INT` Android
  - `isRememberSessionEnabled()`
    - mengembalikan status persistensi sesi native yang saat ini dipaksa aktif pada v1
  - `consumeBootstrapSession()`
    - mengembalikan payload sesi native yang sedang menunggu di-bootstrap ke WebView
  - `syncWebSession(sessionJson)`
    - menyinkronkan sesi hasil bootstrap web kembali ke storage native selama persistensi sesi native masih aktif
  - `clearRememberedSession()`
    - membersihkan sesi native yang tersimpan
  - `showNativeLogin(message)`
    - memaksa APK kembali ke login native dengan pesan error opsional
  - `notifySessionBootstrapComplete()`
    - memberi tahu native bahwa bootstrap sesi di WebView berhasil
  - `notifySessionBootstrapFailed(message)`
    - memberi tahu native bahwa bootstrap sesi di WebView gagal
- Payload minimal yang saat ini diharapkan untuk handoff sesi:
  - `access_token`
  - `refresh_token`
  - `expires_at`
  - `expires_in`
  - `token_type`
  - `user.id`
  - `user.email`
  - `remember_session`
- Kontrak bridge ini perlu dianggap sebagai bagian dari compatibility surface APK. Setiap perubahan di web harus diuji ulang terhadap APK, bukan hanya diuji di browser biasa.

## Kebijakan penyimpanan sesi

Catatan implementasi saat ini:

- APK v1 saat ini menyimpan sesi native dan email login terakhir.
- Penyimpanan username/password aman untuk autofill/login berikutnya belum aktif.
- Yang boleh disimpan di native storage:
  - access token / refresh token
  - metadata sesi
  - `device_id`
  - `tenant_id`
  - `tenant_logo_url` cache jangka pendek
- Yang boleh disimpan di secure credential storage native jika produk mewajibkan autofill:
  - username / email login
  - password login yang terenkripsi atau dikelola Credential Manager
- Yang tidak boleh menjadi pendekatan utama:
  - password mentah
  - secret permanen yang dipakai sendirian untuk keamanan
- Penyimpanan sebaiknya menggunakan secure storage Android, bukan localStorage web sebagai sumber utama sesi APK hybrid.
- Implementasi v1 saat ini sudah memakai encrypted storage Android untuk sesi native, dengan fallback legacy hanya jika storage terenkripsi gagal dibuka di device tertentu.
- Jika user mengaktifkan fitur "tetap masuk", yang dipertahankan adalah sesi/token terenkripsi, bukan kredensial mentah.
- Saat logout, token native, cookie WebView, dan metadata sesi lokal harus dihapus bersamaan. Buffer absensi lokal yang belum tersetor diperlakukan mengikuti kebijakan khusus buffer, bukan dihapus otomatis secara diam-diam.

## Kebijakan buffer absensi lokal

- Untuk flow absensi, model yang disarankan adalah `store-first`: data absensi disimpan dulu di perangkat lalu disetor ke server secara bertahap.
- Tujuannya adalah mengurangi lonjakan request pada jam sibuk seperti jam masuk dan jam pulang, tanpa membuat user harus menunggu seluruh proses server selesai.
- Selama data belum tersinkron ke server, statusnya harus dianggap `pending` atau `tersimpan di perangkat`, bukan final tersimpan di backend.
- Setiap entry lokal harus membawa `timestamp` saat tombol absensi ditekan, `idempotency key`, dan metadata minimum yang dibutuhkan agar server tetap bisa memvalidasi keabsahan saat sinkronisasi dilakukan belakangan.
- Sinkronisasi sebaiknya dilanjutkan otomatis saat:
  - dashboard dibuka kembali
  - koneksi internet kembali
  - scheduler periodik mendeteksi masih ada entry pending
  - sistem berada pada mode deferred/adaptive yang lebih aman untuk jam tidak sibuk
- Entry yang sempat macet saat proses `syncing` karena app crash atau HP mati sebaiknya dipulihkan ke status `pending`, lalu dicoba lagi otomatis saat app aktif kembali.
- Logout atau reset sesi sebaiknya tidak menghapus buffer absensi lokal yang belum tersetor, kecuali memang ada kebijakan eksplisit untuk membatalkan antrian lokal tersebut.
- Server tetap harus menjadi sumber kebenaran akhir. Buffer lokal hanya berfungsi sebagai penyangga performa dan reliabilitas, bukan bukti final bahwa absensi telah diterima backend.
- Implementasi web employee sudah memakai pola offline-first seperti ini untuk absensi, tetapi APK hybrid saat ini masih berisiko menghapus storage WebView yang menyimpan IndexedDB/local cache absensi bila cleanup auth terlalu agresif.
- Implementasi Android saat ini sudah berhenti menghapus seluruh `WebStorage` pada startup normal, sehingga queue IndexedDB/WebView tidak lagi ikut ter-reset secara agresif. UAT tetap diperlukan untuk memastikan perilaku ini konsisten di device nyata.

## Kebijakan logout vs buffer lokal

- Default yang disarankan: `logout` membersihkan status autentikasi, tetapi tidak otomatis menghapus antrian absensi lokal yang belum tersetor.
- Alasannya, absensi pending adalah data operasional yang bisa saja dibuat saat koneksi buruk atau saat server sedang sibuk. Menghapusnya diam-diam saat logout berisiko membuat data absensi hilang.
- Jika tim ingin `logout` sekaligus membatalkan pending attendance, perilaku itu harus eksplisit: tampilkan peringatan bahwa masih ada data absensi yang belum tersetor dan minta konfirmasi user/admin.
- Jika pending attendance tetap dipertahankan lintas logout, app harus memastikan data itu tetap terikat ke akun/perangkat yang benar dan tidak tersetor oleh user yang salah setelah login ulang.
- Policy ini perlu dikunci di implementasi native dan web agar tidak terjadi konflik antara pembersihan sesi auth dengan penyimpanan buffer absensi.

## Kapan sinkronisasi dilanjutkan

- Sinkronisasi tertunda tidak dilanjutkan oleh service native terpisah pada APK v1 saat ini.
- Sinkronisasi dilanjutkan ketika salah satu kondisi berikut terjadi:
  - app dibuka lagi dan user berhasil masuk ke flow dashboard/WebView
  - koneksi internet kembali lalu hook online di web memicu retry
  - scheduler periodik di sisi web mendeteksi masih ada entry pending
  - app aktif kembali setelah crash, force close, atau HP menyala lagi dan entry `syncing` dipulihkan ke `pending`
- Jika HP mati sebelum sinkronisasi selesai, entry yang sudah tersimpan di IndexedDB seharusnya tetap menunggu di perangkat lalu dicoba lagi saat kondisi di atas terpenuhi.
- Jika HP mati sebelum entry sempat tersimpan ke storage lokal, data itu tetap hilang. Karena itu proses `store-first` harus terjadi secepat mungkin setelah user menekan tombol absensi.
- Pada v1, jangan mengasumsikan sinkronisasi akan tetap berjalan saat app benar-benar tertutup total tanpa WebView aktif.

## Matriks perilaku sesi

- App ditutup lalu dibuka lagi, persistensi sesi native masih aktif, token masih valid:
  - user seharusnya langsung dipulihkan ke flow bootstrap lalu masuk ke dashboard tanpa login ulang.
- App ditutup lalu dibuka lagi, sesi native sudah dibersihkan atau token tidak valid:
  - user akan kembali ke login native.
- User logout dari mode hybrid:
  - sesi native, cookie WebView, dan metadata sesi web harus dibersihkan lalu user kembali ke login native.
- Token invalid, refresh gagal, atau sesi kadaluarsa:
  - bootstrap harus gagal dan user dikembalikan ke login native dengan pesan error berisi `Ref ID`.
- Device diblokir fake GPS / mock location:
  - app menampilkan panel blokir dan tidak melanjutkan ke dashboard sampai kondisi diperbaiki.

## Pembagian native vs web

- Native:
  - splash / bootstrap app
  - preflight security
  - login inti
  - daftar / aktivasi / undangan / organisasi
  - lupa / ganti password
  - logout
  - penyimpanan sesi aman
  - branding awal tenant
- Web:
  - dashboard employee
  - halaman operasional setelah login
  - flow operasional setelah sesi aktif
  - fallback browser di luar pengalaman utama APK

Batas umumnya: semua yang sensitif terhadap keamanan startup dan identitas perangkat diprioritaskan ke native, sedangkan flow bisnis yang kompleks dan sudah matang di web tetap dipertahankan di WebView untuk tahap awal.
