# Template UAT Device Nyata Android AbsensiKu

## Metadata
- Tanggal:
- Scope: verifikasi device Android nyata
- Environment:
- Device:
- Android Version:
- Build / Versi APK:
- Penguji:

## Data uji
- Tenant:
- Pegawai:
- Lokasi kerja:
- Koneksi yang diuji:
- Catatan data:

## Ringkasan hasil
- Total skenario diuji:
- Lulus:
- Gagal:
- Verdict:

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-RD-01 | Login & Sesi | Login native dengan akun valid |  |  |  |  |
| UAT-RD-02 | Login & Sesi | `remember off` setelah force-close dan relaunch |  |  |  |  |
| UAT-RD-03 | Login & Sesi | `remember on` setelah force-close dan relaunch |  |  |  |  |
| UAT-RD-04 | Login & Sesi | `session expired` kembali ke login native tanpa loop |  |  |  |  |
| UAT-RD-05 | Login & Sesi | `minimum version` / `forced update` tampil benar jika policy aktif |  |  |  |  |
| UAT-RD-06 | Dashboard & Logout | Dashboard termuat penuh setelah bootstrap |  |  |  |  |
| UAT-RD-07 | Dashboard & Logout | Logout manual dari tab profil |  |  |  |  |
| UAT-RD-08 | Dashboard & Logout | Host di luar allowlist diblokir |  |  |  |  |
| UAT-RD-09 | Koneksi | Wi-Fi dimatikan -> kartu koneksi tampil |  |  |  |  |
| UAT-RD-10 | Koneksi | Koneksi pulih -> retry berhasil |  |  |  |  |
| UAT-RD-11 | Koneksi | Perpindahan Wi-Fi -> seluler |  |  |  |  |
| UAT-RD-12 | Koneksi | Pending sync tetap konsisten setelah force-close |  |  |  |  |
| UAT-RD-13 | GPS Native | Deteksi lokasi nyata tanpa override |  |  |  |  |
| UAT-RD-14 | GPS Native | Absen masuk di luar radius ditolak |  |  |  |  |
| UAT-RD-15 | GPS Native | Absen masuk di dalam radius berhasil |  |  |  |  |
| UAT-RD-16 | GPS Native | Fake GPS / mock location mengikuti policy blokir |  |  |  |  |
| UAT-RD-17 | GPS Native | Geolocation hanya diberikan ke host yang diizinkan |  |  |  |  |
| UAT-RD-18 | Sinkronisasi | Status lokal/pending -> final server |  |  |  |  |
| UAT-RD-19 | Sinkronisasi | Check-out final tercatat di server |  |  |  |  |

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

## Risiko tersisa
- 

## Tindak lanjut
- 

## Sign-off
- Status akhir:
- Disetujui oleh:
- Tanggal:
