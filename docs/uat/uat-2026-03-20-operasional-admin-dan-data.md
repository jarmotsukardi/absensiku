# UAT Operasional Admin dan Data

## Metadata
- Tanggal: 2026-03-20
- Scope: verifikasi audit log, backup Supabase, migration/table remote, dan trace error edge function
- Environment: Localhost terminal + Supabase remote
- Device / Browser: `psql`, `curl`, dan filesystem lokal
- Build / Versi: konfigurasi operasional per 2026-03-20
- Penguji: Codex

## Ringkasan hasil
- Total skenario diuji: 4
- Lulus: 4
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-OPS-01 | Audit Log | Audit log mencatat aksi penting `INVITATION_SEND_EMAIL` | LULUS | Query remote `audit_logs` menampilkan event terbaru `INVITATION_SEND_EMAIL` untuk record `392bc40d-d21c-46c1-8e5c-46ec29e1b819` pada `2026-03-20 14:58:29 Asia/Jakarta` | - | Membuktikan jejak operator untuk pengiriman email undangan tersedia di remote DB |
| UAT-OPS-02 | Backup DB | Backup Supabase tersedia sebelum perubahan schema/data penting | LULUS | Folder `artifacts/db-backups/sql` berisi backup manual termasuk `supabase_backup_20260320_130150_manual.sql` dan `supabase_backup_20260320_142836_manual.sql` | `DB-BACKUP-1773986510448` | Bukti backup lokal tersedia untuk rollback/forensik perubahan kritis |
| UAT-OPS-03 | Remote Schema | Migration/table penting hidup di remote Supabase | LULUS | Query `to_regclass` mengembalikan `uat_execution_logbook_entries` dan `attendance_ingest_queue` sebagai tabel aktif di schema `public` | - | Membuktikan migration penting untuk UAT logbook dan queue absensi sudah benar-benar terpasang di remote |
| UAT-OPS-04 | Edge Function & Observability | Edge function remote merespons dan menyertakan `trace_id` saat error validasi | LULUS | `POST` ke remote `functions/v1/complete-employee-invitation-registration` dengan body `{}` mengembalikan `HTTP 400` JSON `Data registrasi undangan tidak lengkap` plus `trace_id` | `complete-employee-invitation-registration-mmymaph6-kqk5t1` | Membuktikan function aktif di remote dan observability backend/edge sudah menyertakan referensi triase |

## Risiko tersisa
- UAT ini belum menutup rollback aktual, baru memverifikasi backup dan keberadaan artefak rollback minimum.
- Belum diuji bahwa seluruh data uji lama sudah dibersihkan dari remote DB.
- Belum semua edge function/backend endpoint diuji satu per satu untuk keberadaan `trace_id`, baru satu sampel representatif.

## Tindak lanjut
- Jika mendekati rilis, lanjutkan ke quality gate penuh `autofix -> lint -> test -> build`.
- Tambahkan verifikasi cleanup data uji lama bila batch end-to-end sudah stabil.
- Lanjutkan sampling `trace_id` untuk endpoint backend/edge lain yang masuk jalur kritis absensi.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
