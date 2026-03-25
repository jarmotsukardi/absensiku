# Sign-off Android Runtime AbsensiKu

## Metadata
- Tanggal: 2026-03-20
- Scope: sign-off final batch UAT Android native/WebView resmi
- Referensi UAT utama: [uat-2026-03-20-android-runtime.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-2026-03-20-android-runtime.md)
- Environment: Production `https://absensiku-alpha.vercel.app`
- Device uji: Emulator Android `127.0.0.1:6555` (`Pixel_3a`)
- APK: `v1.0.5`

## Ringkasan keputusan
- Status: `SIAP DENGAN CATATAN`
- Total skenario Android runtime yang ditutup: `15`
- Lulus: `15`
- Gagal: `0`

## Area yang sudah tertutup
- Login native -> bootstrap -> dashboard tenant
- Logout -> kembali ke login native
- Login ulang native
- Navigasi manual dashboard -> tab profil
- Logout manual penuh dari halaman profil
- Offline -> kartu koneksi native -> reconnect -> retry
- `Absen Masuk` resmi dengan gate jadwal kerja
- `Absen Pulang` manual -> modal konfirmasi -> final server
- Gate pendaftaran perangkat
- `pending lokal -> final server`
- Relaunch pasca final sync saat `remember off`
- Relaunch pasca final sync saat `remember on`
- Login gagal native dengan pesan error ber-`Ref`

## Bukti kunci
- Final sync server:
  [android-uat-after-final-sync.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tmp/android-uat-after-final-sync.png)
- Relaunch `remember off`:
  [android-uat-after-relaunch-post-sync.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tmp/android-uat-after-relaunch-post-sync.png)
- Relaunch `remember on`:
  [android-uat-remember-on-relaunch-final.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tmp/android-uat-remember-on-relaunch-final.png)

## Temuan penting
- Bug runtime peak-hour akibat timezone `UTC` di WebView emulator sudah ditutup dan sudah live.
- Entry absensi resmi terbukti melewati tiga fase:
  - tersimpan lokal di IndexedDB
  - diproses antrean server
  - menjadi row final `attendance_records_partitioned`
- Perilaku restore sesi sekarang terverifikasi pada dua mode:
  - `remember off` -> kembali ke login native
  - `remember on` -> auto-bootstrap tanpa input ulang
- Jalur error login dasar juga sudah rapi: password salah tetap ditolak di panel native dengan banner dan `Ref` error yang dapat ditelusuri.
- Jalur checkout manual juga sudah tertutup: modal `Absen Pulang` tampil, antrean `check_out` diproses, dan row absensi final berubah ke status `pulang_cepat`.

## Catatan operasional
- Validasi ini masih memakai emulator Genymotion.
- GPS absensi di emulator masih dibantu override geolokasi via WebView DevTools / Chrome DevTools Protocol.
- Sentuhan manual pada tombol `Keluar` di emulator masih sensitif; tap yang terlalu lama dapat memicu seleksi teks sebelum aksi logout terkirim.

## Rekomendasi berikutnya
- Lakukan 1 putaran verifikasi di device Android nyata.
- Prioritaskan uji GPS native murni dan sentuhan manual profil/logout.
- Jika perlu, kunci skenario ini ke automation/instrumentation agar tidak regresi.

## Sign-off
- Keputusan QA teknis: `GO untuk runtime Android, dengan catatan verifikasi device nyata masih disarankan`
- Disusun oleh: Codex
- Tanggal: 2026-03-20
