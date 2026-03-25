# UAT Device Nyata Android Absensi 2026-03-20

## Metadata
- Tanggal: 2026-03-20
- Scope: penutupan gap runtime Android absensi di device nyata
- Environment: local dev + remote Supabase production-like
- Device: belum terhubung
- Android Version: belum diisi
- Build / Versi APK: belum diisi
- Penguji: belum diisi

## Status awal
- `adb devices` pada 2026-03-20 masih kosong, sehingga eksekusi di HP fisik belum dimulai.
- Dokumen ini disiapkan sebagai lembar kerja siap-isi untuk sesi saat device sudah terhubung.
- Referensi eksekusi:
  - [Run Sheet Device Nyata Android AbsensiKu](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/runsheet-device-nyata-android.md)
  - [Checklist Device Nyata Android AbsensiKu](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/checklist-device-nyata-android.md)

## Data uji
- Tenant: belum diisi
- Pegawai: belum diisi
- Lokasi kerja: belum diisi
- Koneksi yang diuji: Wi-Fi, seluler
- Catatan data:
  - siapkan akun pegawai yang punya jadwal aktif
  - siapkan skenario revoke session atau expiry untuk uji `session expired`
  - siapkan tenant/staging yang bisa mengaktifkan `minimum version` bila akan diuji

## Ringkasan hasil
- Total skenario diuji: 0
- Lulus: 0
- Gagal: 0
- Verdict: belum mulai

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-RD-01 | Login & Sesi | Login native dengan akun valid | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-02 | Login & Sesi | `remember off` setelah force-close dan relaunch | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-03 | Login & Sesi | `remember on` setelah force-close dan relaunch | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-04 | Login & Sesi | `session expired` kembali ke login native tanpa loop | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-05 | Login & Sesi | `minimum version` / `forced update` tampil benar jika policy aktif | Belum diuji |  |  | Menunggu policy aktif + HP fisik |
| UAT-RD-06 | Dashboard & Logout | Dashboard termuat penuh setelah bootstrap | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-07 | Dashboard & Logout | Logout manual dari tab profil | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-08 | Dashboard & Logout | Host di luar allowlist diblokir | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-09 | Koneksi | Wi-Fi dimatikan -> kartu koneksi tampil | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-10 | Koneksi | Koneksi pulih -> retry berhasil | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-11 | Koneksi | Perpindahan Wi-Fi -> seluler | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-12 | Koneksi | Pending sync tetap konsisten setelah force-close | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-13 | GPS Native | Deteksi lokasi nyata tanpa override | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-14 | GPS Native | Absen masuk di luar radius ditolak | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-15 | GPS Native | Absen masuk di dalam radius berhasil | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-16 | GPS Native | Fake GPS / mock location mengikuti policy blokir | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-17 | GPS Native | Geolocation hanya diberikan ke host yang diizinkan | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-18 | Sinkronisasi | Status lokal/pending -> final server | Belum diuji |  |  | Menunggu HP fisik |
| UAT-RD-19 | Sinkronisasi | Check-out final tercatat di server | Belum diuji |  |  | Menunggu HP fisik |

## Checklist bukti
- Screenshot login native
- Screenshot dashboard
- Screenshot `session expired` kembali ke login native
- Screenshot `minimum version` / `forced update` jika policy aktif
- Screenshot logout kembali ke login native
- Screenshot host blocked / allowlist rejection
- Screenshot kartu koneksi saat offline
- Screenshot pending sync sebelum dan sesudah relaunch
- Screenshot hasil absensi berhasil/gagal
- Screenshot fake GPS blocked jika policy aktif
- Screenshot prompt geolocation pada host yang diizinkan
- Logcat jika ada error
- Query verifikasi row server

## Bloker saat ini
- `adb devices` belum mendeteksi HP Android.
- Skenario `minimum version` butuh policy aktif di tenant/staging yang aman diuji.

## Tindak lanjut
1. Hubungkan HP Android dan pastikan `adb devices` menampilkan serial.
2. Isi metadata device, versi Android, dan versi APK.
3. Eksekusi skenario `UAT-RD-01` sampai `UAT-RD-19`.
4. Simpan screenshot, logcat, dan query server per bukti.
5. Perbarui ringkasan hasil dan verdict akhir.

## Sign-off
- Status akhir: belum mulai
- Disetujui oleh:
- Tanggal:
