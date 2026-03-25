# UAT Retest Double Tap Tombol Absen

## Metadata
- Tanggal: 2026-03-20
- Scope: memastikan double tap pada tombol `Absen Masuk` tidak membuat data ganda
- Environment: localhost `http://127.0.0.1:5173` + Playwright + IndexedDB browser + Supabase remote auth session
- Device / Browser: Playwright dengan geolocation kantor, device binding valid, dan clock override browser untuk hari kerja
- Build / Versi: web dev server 2026-03-20
- Penguji: Codex

## Data uji
- Pegawai: `Susi`
- Employee ID: `b26b1414-618e-43cf-b084-7fd781019281`
- Tenant: `Kab. Maluku Tengah`
- Device binding: `WEB-0000000028A56620`
- Geolocation uji: lokasi kantor `BKPSDM JAKARTA` (`-6.356025, 106.806491`)
- Clock override browser: `2026-03-17 09:00 Asia/Jakarta`
- Runtime sync setting: `offpeak_release_strategy = worker_only`

## Ringkasan hasil
- Total skenario diuji: 1
- Lulus: 1
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-DT-01 | Absensi dan Sinkronisasi | Double tap tombol `Absen Masuk` tidak membuat data ganda | LULUS | Pada dashboard mobile `Susi`, storage lokal dibersihkan lalu tombol `Absen Masuk` diklik 2 kali sinkron. Toast pertama menampilkan `Absen Masuk Tersimpan`, toast kedua menampilkan `Gagal Absen Masuk` dengan detail `Absen masuk sedang diproses`. Verifikasi IndexedDB `AttendanceOfflineDB.attendanceEntries` menunjukkan hanya ada `1` row `check_in` berstatus `pending` untuk tanggal `2026-03-17` | - | Retest dilakukan sesudah perbaikan lock submit di hook absensi |

## Temuan dan perbaikan
- Sebelum perbaikan, skenario yang sama menghasilkan `2` row `check_in` pending di IndexedDB karena dua event click bisa melewati pengecekan buffer hampir bersamaan.
- Perbaikan dipasang di:
  - [useAttendance.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/hooks/useAttendance.ts#L176)
- Perbaikan menambah lock in-memory terpisah untuk `check_in` dan `check_out`, sehingga klik kedua ditolak lebih awal dengan pesan `Absen masuk sedang diproses` atau `Absen pulang sedang diproses`.

## Catatan metode
- Runtime sync dipaksa ke mode `worker_only` agar klik pertama berhenti di buffer lokal, sehingga guard anti-duplikasi bisa diverifikasi tanpa menambah write final ke server.
- Clock override browser dipakai hanya untuk melewati gate hari kerja pada tenant yang pada tanggal nyata sedang punya hari libur.
- Retest ini menutup race di layer UI/browser dan IndexedDB. Validasi device-native tetap menjadi batch terpisah.

## Risiko tersisa
- Retest memakai browser override, bukan device Android nyata.
- Belum menutup skenario `double tap` untuk `Absen Pulang`.
- Gap native seperti fake GPS, host allowlist, dan geolocation allowlist tetap belum tertutup.

## Tindak lanjut
- Lanjut ke `Pending sync yang terlalu lama menampilkan warning`.
- Lanjut ke batch native/device nyata untuk verifikasi perilaku double tap pada APK.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
