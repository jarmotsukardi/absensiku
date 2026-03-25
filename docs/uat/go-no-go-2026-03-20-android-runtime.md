# Go / No-Go Android Runtime AbsensiKu

## Keputusan
- Status: `GO DENGAN CATATAN`
- Tanggal: 2026-03-20
- Dasar keputusan: [sign-off-2026-03-20-android-runtime.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/sign-off-2026-03-20-android-runtime.md)

## Yang sudah terbukti aman
- Login native Android berjalan normal.
- Logout dan login ulang kembali ke flow native yang benar.
- Navigasi manual ke tab profil dan logout manual dari halaman profil sudah berhasil.
- Saat koneksi putus, aplikasi tidak menampilkan error URL mentah.
- Saat koneksi pulih, dashboard bisa kembali tanpa lompat ke halaman yang salah.
- Absensi resmi terbukti melewati jalur:
  - check-in tersimpan lokal di perangkat
  - masuk antrean sinkronisasi
  - tercatat final di server
  - check-out manual diproses sampai status final `pulang_cepat`
- Mode `remember session`:
  - `off` kembali ke login native setelah relaunch
  - `on` memulihkan sesi otomatis setelah relaunch

## Catatan sebelum dianggap final penuh
- Validasi terakhir masih memakai emulator Genymotion, belum device Android nyata.
- GPS di emulator masih dibantu override geolokasi, belum sensor lokasi native murni.
- Checkout di emulator masih membutuhkan override geolokasi via WebView DevTools / Chrome DevTools Protocol.
- Sensitivitas sentuhan di emulator tetap perlu dikonfirmasi di device fisik.

## Rekomendasi keputusan
- `GO` untuk runtime Android pada jalur utama login, sesi, koneksi, navigasi profil, dan absensi inti dari check-in sampai check-out.
- Sebelum rilis besar atau distribusi luas, lakukan 1 putaran verifikasi di device nyata untuk:
  - GPS native
  - logout/profile manual
  - perilaku jaringan nyata

## Ringkasan eksekutif
- Untuk use case inti, aplikasi Android sudah layak jalan.
- Risiko yang tersisa sekarang lebih ke kualitas verifikasi lingkungan nyata, bukan blocker fungsional utama.
