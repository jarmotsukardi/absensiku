# Checklist Device Nyata Android AbsensiKu

Dokumen ini dipakai untuk menutup gap yang belum bisa divalidasi sempurna di emulator. Fokusnya adalah verifikasi perangkat Android fisik pada jalur yang sudah `GO dengan catatan`.

Template pencatatan hasil siap pakai:
- [uat-template-device-nyata-android.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-template-device-nyata-android.md)

Referensi hasil emulator yang sudah tertutup:
- [uat-2026-03-20-android-runtime.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-android-runtime.md)
- [sign-off-2026-03-20-android-runtime.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/sign-off-2026-03-20-android-runtime.md)
- [go-no-go-2026-03-20-android-runtime.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/go-no-go-2026-03-20-android-runtime.md)

## Status baseline saat ini
- Batch emulator Android runtime sudah `15/15` lulus.
- Jalur inti yang sudah terbukti di emulator:
  - login native, logout, login ulang
  - navigasi manual ke profil dan logout manual penuh
  - offline -> reconnect -> retry
  - `remember session` on/off
  - check-in lokal -> final server
  - check-out manual -> final server
- Maka tujuan device nyata bukan mengulang semuanya dari nol, tetapi mengonfirmasi bahwa hasil emulator tetap konsisten pada:
  - GPS native murni
  - jaringan nyata Wi-Fi/seluler
  - sentuhan manual di device fisik

## Target verifikasi
- memastikan perilaku runtime Android tetap sama di device nyata
- menghilangkan ketergantungan pada geolocation override emulator
- memastikan interaksi manual WebView benar-benar stabil
- menutup seluruh gap yang tersisa sebelum sign-off final absensi Android

## Prioritas tertinggi di device nyata
1. GPS native tanpa override apa pun.
2. `Absen Masuk` dan `Absen Pulang` sampai final server dengan koordinat asli device.
3. Logout manual dari profil dan login ulang tanpa bantuan automasi.
4. Perpindahan jaringan Wi-Fi -> seluler dan recovery koneksi nyata.
5. `session expired`, host allowlist, dan geolocation allowlist.
6. `minimum version` / `forced update` bila policy diaktifkan.

## Gap yang masih terbuka sebelum device nyata
- `session expired` Android saat app terbuka belum sah ditutup tanpa HP fisik.
- Host di luar allowlist belum sah ditutup tanpa HP fisik.
- Origin geolocation hanya untuk host yang diizinkan belum sah ditutup tanpa HP fisik.
- Fake GPS / mock location masih perlu bukti vendor/device nyata.
- Pending sync setelah force-close atau pindah jaringan masih perlu bukti HP fisik.
- `minimum version` atau `forced update` masih perlu bukti UI Android nyata bila policy diaktifkan.

## Prasyarat
- APK publik terbaru terpasang di device nyata
- akun pegawai uji aktif dan punya jadwal kerja pada hari pengujian
- lokasi kerja tenant sudah benar
- koneksi internet device bisa diuji pada:
  - Wi-Fi
  - data seluler
- GPS device aktif dan permission lokasi diizinkan

## Skenario wajib

### 1. Login dan sesi
- [ ] Login native berhasil dengan akun valid.
- [ ] Login gagal menampilkan pesan yang benar saat password salah.
- [ ] `remember session off` kembali ke login native setelah force-close dan relaunch.
- [ ] `remember session on` langsung bootstrap ke dashboard setelah force-close dan relaunch.
- [ ] Session expired kembali ke login native tanpa loop.
- [ ] Jika policy `minimum version` aktif, app menampilkan blokir atau peringatan update yang benar.

### 2. Dashboard dan logout
- [ ] Dashboard pegawai termuat penuh setelah bootstrap.
- [ ] Navigasi tab utama berjalan normal.
- [ ] Logout manual dari tab profil kembali ke login native tanpa bantuan DevTools.
- [ ] Login ulang setelah logout tetap membuka tenant yang benar.
- [ ] Redirect atau tautan ke host di luar allowlist diblokir.

### 3. Koneksi nyata
- [ ] Saat Wi-Fi dimatikan, kartu status koneksi tampil tanpa error URL mentah.
- [ ] Saat koneksi dipulihkan, tombol `Coba lagi` memulihkan dashboard.
- [ ] Perpindahan Wi-Fi -> seluler tidak membuat WebView macet.
- [ ] Pull-to-refresh bekerja setelah koneksi kembali.
- [ ] Pending sync tetap konsisten setelah force-close dan buka ulang app.

### 4. GPS native
- [ ] Device membaca koordinat GPS nyata tanpa override alat bantu.
- [ ] `Absen Masuk` ditolak bila di luar radius kantor.
- [ ] `Absen Masuk` berhasil bila di dalam radius kantor.
- [ ] Koordinat yang tercatat di dashboard sesuai lokasi aktual device.
- [ ] Jika fake GPS diaktifkan, aplikasi mengikuti policy blokir yang benar.
- [ ] Permission geolocation hanya diberikan ke host yang diizinkan.

### 5. Sinkronisasi absensi
- [ ] Saat absen ditekan, dashboard menampilkan status lokal/pending dengan benar jika belum final.
- [ ] Saat sinkronisasi selesai, status berubah menjadi final di server.
- [ ] Row absensi final benar-benar muncul di server.
- [ ] Setelah relaunch, status absensi hari itu tetap konsisten.

## Bukti yang harus disimpan
- screenshot device untuk setiap skenario utama
- logcat ringkas jika ada error
- query hasil verifikasi server untuk absensi final
- jika ada kegagalan, simpan `Ref ID` atau `trace_id`

## Kriteria lulus
- seluruh jalur utama login, koneksi, logout, GPS, dan absensi berhasil tanpa bantuan DevTools
- tidak ada regresi dibanding UAT emulator
- data final server sesuai dengan aksi di device
- gap runtime `session expired`, allowlist, dan update policy sudah punya bukti device nyata

## Kriteria catatan
- fungsi inti lulus, tetapi masih ada kendala minor seperti UI tertentu belum stabil
- hasil emulator dan device sama, namun ada variasi kecil non-blocking

## Kriteria gagal
- login native gagal
- restore sesi tidak konsisten
- logout manual tidak kembali ke login native
- absensi GPS native tidak bisa divalidasi
- data server tidak sesuai dengan aksi device
