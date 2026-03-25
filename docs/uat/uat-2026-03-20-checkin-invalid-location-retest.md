# UAT Retest Check-in Tanpa Lokasi Valid

## Metadata
- Tanggal: 2026-03-20
- Scope: memastikan check-in ditolak dengan pesan yang jelas saat lokasi di luar radius kantor
- Environment: localhost `http://127.0.0.1:5173` + Playwright + Supabase remote auth session
- Device / Browser: Playwright, geolocation override, dan clock override browser untuk membuka hari kerja
- Build / Versi: web dev server 2026-03-20
- Penguji: Codex

## Data uji
- Pegawai: `Susi`
- Employee ID: `b26b1414-618e-43cf-b084-7fd781019281`
- Tenant: `Kab. Maluku Tengah`
- Billing mode: `centralized`
- Office: `BKPSDM JAKARTA`
- Device binding: `WEB-0000000028A56620`
- Lokasi kantor: `-6.356025, 106.806491`
- Radius kantor: `200m`
- Lokasi uji: `-6.5000, 106.9000`
- Clock override browser: `2026-03-17 09:00 Asia/Jakarta`

## Ringkasan hasil
- Total skenario diuji: 1
- Lulus: 1
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-CIL-01 | Absensi dan Sinkronisasi | Check-in tanpa lokasi kerja yang valid ditolak dengan pesan yang jelas | LULUS | Setelah login sebagai `Susi`, `web_device_id` disamakan dengan device terdaftar, geolocation browser di-set ke `-6.5000,106.9000`, dan jam browser dioverride ke `Selasa, 17 Maret 2026` agar flow masuk hari kerja, klik `Absen Masuk` menampilkan toast `Gagal Absen Masuk` dengan detail `Anda berada di luar radius kantor (19054m, maks 200m)` | - | Validasi berhenti di client-side radius check sebelum flow submit absensi dilanjutkan |

## Catatan metode
- Clock override browser dipakai hanya untuk melewati gate `Hari Libur` pada tenant `Kab. Maluku Tengah`, karena tanggal nyata `2026-03-20` tertandai libur di `work_holidays`.
- Retest ini tidak mengubah data billing atau kalender remote.
- Tujuan retest ini khusus untuk memverifikasi pesan validasi lokasi yang sebelumnya belum bisa disentuh karena blocker non-lokasi.

## Risiko tersisa
- Bukti ini memakai browser override, bukan device native nyata.
- Belum menutup skenario GPS palsu, allowlist host, atau geolocation origin policy di native WebView.
- Belum memverifikasi perilaku serupa untuk `check-out` atau untuk tenant dengan `allow_flexible_attendance = true`.

## Tindak lanjut
- Lanjut ke `double tap tombol absen tidak membuat data ganda`.
- Lanjut ke gap native/device nyata untuk `fake GPS`, `host allowlist`, dan `origin geolocation allowlist`.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
