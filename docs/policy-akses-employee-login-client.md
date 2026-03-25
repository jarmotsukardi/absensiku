# Policy Akses `/employee/login` Berdasarkan Jenis Client

Dokumen ini menetapkan policy operasional untuk membedakan akses pegawai berdasarkan jenis client yang membuka route `/employee/login` dan `/employee/dashboard`.

Konteks saat ini:
- aplikasi iOS native belum tersedia
- fallback iPhone memakai browser Safari
- aplikasi Android resmi tetap menjadi jalur utama untuk absensi

## Tujuan

- tetap membuka akses pegawai iPhone selama app iOS belum ada
- mencegah browser Android biasa dipakai sebagai pengganti APK resmi
- memisahkan tegas antara `boleh login`, `boleh lihat dashboard`, dan `boleh absen`
- menjaga agar guard frontend dan backend saling menguatkan

## Klasifikasi Client

Sumber klasifikasi mengikuti `client_mode` di runtime:
- `android_webview`
- `iphone_safari`
- `mobile_browser`
- `desktop_browser`
- `unknown`

Makna praktis:
- `android_webview`: APK Android resmi / WebView internal
- `iphone_safari`: Safari murni di iPhone
- `mobile_browser`: browser mobile umum, termasuk Android Chrome biasa
- `desktop_browser`: browser desktop/laptop
- `unknown`: client yang tidak bisa diidentifikasi dengan cukup yakin

## Keputusan Inti

### 1. Android WebView Resmi

Status:
- boleh login
- boleh masuk dashboard
- boleh melakukan absensi

Syarat tambahan:
- tetap tunduk pada `app_code`
- tetap tunduk pada device binding
- tetap tunduk pada validasi server-side absensi

Catatan:
- ini adalah jalur utama produk
- route `/employee/login` di APK tetap dibypass ke flow native/bootstrap

### 2. iPhone Safari

Status policy awal:
- boleh login
- boleh masuk dashboard
- boleh melakukan absensi sebagai fallback sementara

Syarat tambahan:
- hanya Safari murni iPhone yang diizinkan
- browser iOS lain tidak otomatis dianggap setara
- device binding dan validasi server-side tetap berlaku

Catatan:
- ini adalah pengecualian operasional selama aplikasi iOS belum tersedia
- saat app iOS resmi hadir, policy ini boleh ditinjau ulang

### 3. Android Browser Biasa

Status:
- login boleh terjadi hanya jika route auth belum diblok total
- tetapi akses absensi harus dianggap tidak sah
- tombol absensi harus nonaktif
- submit absensi harus tetap ditolak server

Tujuan:
- walaupun user berhasil mencapai dashboard lewat browser Android biasa, absensi tidak boleh lolos
- browser Android biasa tidak boleh menjadi substitusi APK resmi

### 4. Desktop Browser

Status:
- boleh diblok sejak awal untuk route absensi
- bila lolos sampai dashboard, fitur absensi tetap harus nonaktif
- submit absensi tetap harus ditolak server

Tujuan:
- desktop hanya boleh menjadi jalur lihat data jika memang kebijakan tenant mengizinkan
- absensi mobile tidak dianggap sah dari desktop

### 5. Client Unknown

Status:
- fail-closed
- akses absensi tidak boleh dianggap sah

Tujuan:
- client yang tidak bisa diidentifikasi tidak boleh diberi hak yang sama dengan APK resmi

## Aturan UX

### Saat Client Diizinkan Login Tetapi Tidak Diizinkan Absen

Dashboard tetap boleh terbuka jika produk menghendaki, tetapi:
- tombol `Absen Masuk` dan `Absen Pulang` harus disabled
- tampil alasan yang jelas
- jangan tampil seolah masalahnya bug acak

Wording yang disarankan:
- `Absensi hanya tersedia melalui aplikasi internal Android atau Safari iPhone yang diizinkan organisasi.`

### Saat Client Ditolak Penuh

Tampilkan halaman `Akses Ditolak` dengan:
- alasan singkat
- langkah yang harus dilakukan user
- tautan unduh APK jika relevan

## Aturan Backend

Frontend guard tidak cukup. Server tetap harus menjadi penentu final.

Maka policy server:
- `android_webview` yang valid boleh lanjut ke proses absensi
- `iphone_safari` boleh lanjut hanya jika pengecualian Safari aktif
- `mobile_browser`, `desktop_browser`, dan `unknown` harus ditolak untuk submit absensi jika policy blok aktif

Artinya:
- tombol disabled di frontend adalah lapisan UX
- penolakan server adalah lapisan keamanan final

## Konfigurasi Operasional Awal

Policy yang disarankan saat ini:
- `block_all_browsers = true`
- `allow_iphone_safari = true`

Efeknya:
- APK Android resmi tetap boleh
- Safari iPhone tetap boleh
- browser lain diblok

## Prioritas Implementasi

1. pastikan frontend guard membedakan `android_webview`, `iphone_safari`, dan `mobile_browser`
2. pastikan dashboard bisa men-disable tombol absensi untuk client yang tidak sah
3. pastikan RPC/server submit absensi tetap menolak client yang tidak sah
4. pastikan copy `Akses Ditolak` dan copy tombol disabled konsisten
5. audit ulang setelah aplikasi iOS resmi tersedia
