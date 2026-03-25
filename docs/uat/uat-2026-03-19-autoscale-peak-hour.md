# UAT Autoscale Peak-Hour Absensi

## Metadata
- Tanggal: 2026-03-19
- Scope: rollout remote `attendance_scalability` v2, worker policy-aware, dan verifikasi peak-hour function
- Environment: Supabase remote production `zrhgqpjbeyzwpgywelcr.supabase.co`
- Device / Browser: `psql` + `supabase cli`
- Build / Versi: backend/schema live per 2026-03-19
- Penguji: Codex

## Data uji
- Backup remote: `DB-BACKUP-1773938000190`
- Setting live target:
  - `mode=manual`
  - `tier=large`
  - `effective_tier=large`
  - `peak_hour_hold_sync=true`
  - `queue_only_ingest=true`
  - `offpeak_release_strategy=worker_preferred`
- Catatan data: verifikasi dilakukan langsung terhadap schema, cron, dan `system_settings` remote

## Ringkasan hasil
- Total skenario diuji: 9
- Lulus: 9
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-APS-01 | Operasional DB | Backup Supabase remote berhasil sebelum perubahan schema/config live | LULUS | [supabase_backup_20260319_233320_manual.sql](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/artifacts/db-backups/sql/supabase_backup_20260319_233320_manual.sql) | `DB-BACKUP-1773938000190` | Jalur rollback SQL tersedia |
| UAT-APS-02 | Schema Remote | Migration `20260319163000` applied dan tercatat applied di histori remote | LULUS | `psql -f 20260319163000...` sukses + `supabase migration repair 20260319163000 --linked --yes` | - | `attendance_scalability` v2 aktif di remote |
| UAT-APS-03 | Schema Remote | Migration `20260319170000` applied dan tercatat applied di histori remote | LULUS | `psql -f 20260319170000...` sukses + `supabase migration repair 20260319170000 --linked --yes` | - | worker policy-aware aktif di remote |
| UAT-APS-04 | Policy Live | `system_settings.attendance_scalability` live berubah ke mode `manual`, tier `large`, `peak_hour_hold_sync=true`, `queue_only_ingest=true`, `offpeak_release_strategy=worker_preferred` | LULUS | Query `psql` ke `public.system_settings` | - | Policy live tidak lagi `small/client_after_window` |
| UAT-APS-05 | Worker Queue | Cron `attendance-ingest-worker` memanggil `public.process_attendance_queue_policy_aware(500, NULL)` | LULUS | Query `cron.job` remote | - | Worker drain kini melewati wrapper policy-aware |
| UAT-APS-06 | Peak-Hour Function | `public.is_attendance_peak_hour` mengembalikan `true` untuk `07:15` dan `17:00` Asia/Jakarta | LULUS | Query `psql` dengan timestamp simulasi | - | Window jam sibuk pagi dan sore terdeteksi benar |
| UAT-APS-07 | Peak-Hour Function | `public.is_attendance_peak_hour` mengembalikan `false` untuk `11:15` Asia/Jakarta | LULUS | Query `psql` dengan timestamp simulasi | - | Window di luar jam sibuk tidak salah terdeteksi |
| UAT-APS-08 | Guard Runtime | Browser biasa yang membuka `/employee/dashboard` tetap ditolak, dan percobaan ini tidak membuat row final di `attendance_records_partitioned` maupun antrean di `attendance_ingest_queue` | LULUS | Screenshot [uat-employee-dashboard-direct.png](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tmp/uat-employee-dashboard-direct.png) + query `psql` ke `attendance_records_partitioned` dan `attendance_ingest_queue` | - | Guard WebView resmi tetap aktif; uji runtime penuh perlu device/WebView resmi |
| UAT-APS-09 | Operasional Policy | Peak window live yang sempat dibuka sementara untuk UAT runtime sudah dikembalikan ke `06:30-09:00` dan `16:00-18:30` | LULUS | Query `psql` ke `public.system_settings` setelah restore | - | Live policy kembali ke konfigurasi operasional normal |

## Risiko tersisa
- Histori migration remote masih belum sinkron untuk dua migration lokal lama yang tidak disentuh pada batch ini: `20260318190000` dan `20260319121000`.
- UAT ini memverifikasi schema, config, fungsi SQL/cron, dan guard browser, tetapi belum mencakup uji end-to-end app pegawai pada jam sibuk nyata melalui WebView resmi.
- `offpeak_release_strategy=worker_preferred` sudah aktif, tetapi belum diuji dengan backlog antrean live yang benar-benar melewati window sibuk.

## Tindak lanjut
- Jalankan UAT runtime pegawai untuk skenario:
  - absen saat jam sibuk -> tampil status lokal/pending
  - queue tetap tertahan saat peak
  - worker/off-peak release memfinalkan data ke server
- Audit dan sinkronkan dua migration lokal lama yang masih beda histori jika memang perlu dipertahankan di remote.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: Codex
- Tanggal: 2026-03-19
