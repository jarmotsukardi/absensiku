# UAT Validasi App Code Native

## Metadata
- Tanggal: 2026-03-20
- Scope: validasi `app_code` pada jalur mobile auth native dan jalur absensi server-side
- Environment: Localhost `http://127.0.0.1:5173` + `dev:mobile-api` lokal `http://127.0.0.1:3000` + Supabase remote
- Device / Browser: `curl`, `psql`, dan backend local proxy
- Build / Versi: Web dev server 2026-03-20, mobile auth local dev API, konfigurasi `attendance_security.native_app_code = AKN1`
- Penguji: Codex

## Data uji
- Pegawai: `Lisfa Uji Billing`
- Email login native: `lisfa82328729@gmail.com`
- Employee ID: `9b66b701-d05a-41ed-8bc2-6de395ea82fc`
- Office ID: `9b9bd540-8c00-4b2b-880b-8b41a047d065`
- Device ID uji: `WEB-SMOKE-DEVICE-0001`
- App code aktif: `AKN1`

## Ringkasan hasil
- Total skenario diuji: 6
- Lulus: 6
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-AC-01 | Mobile Auth Native | Login native Android dengan `app_code` benar diterima server | LULUS | `POST /mobile-api/auth/login` via localhost mengembalikan `HTTP 200`, `app_code_verified: true`, `dashboard_url: /employee/dashboard`, dan cookie bootstrap native | `MOB-LOGIN-1773993927922-fkpshs` | Jalur login native tidak hanya menerima kredensial, tetapi juga menandai `app_code` sudah tervalidasi |
| UAT-AC-02 | Mobile Auth Native | Login native Android dengan `app_code` salah ditolak | LULUS | `POST /mobile-api/auth/login` dengan `app_code = SALAH` mengembalikan `HTTP 403` dan `code = native_app_code_invalid` | `MOB-LOGIN-1773993927983-8ep598` | Pesan error jelas: `Aplikasi tidak terverifikasi untuk login native.` |
| UAT-AC-03 | Mobile Auth Native | Login native Android tanpa `app_code` ditolak | LULUS | `POST /mobile-api/auth/login` tanpa field `app_code` mengembalikan `HTTP 403` dan `code = native_app_code_invalid` | `MOB-LOGIN-1773993928079-hvxihg` | Menutup skenario `request native tanpa app_code yang benar ditolak` pada jalur auth |
| UAT-AC-04 | Keamanan Absensi | Validasi keamanan absensi menerima `client_context.app_code = AKN1` | LULUS | RPC `validate_attendance_security_context(...)` mengembalikan `{\"allowed\": true}` untuk `client_mode = android_webview`, `device_id = WEB-SMOKE-DEVICE-0001`, `app_code = AKN1` | - | Membuktikan jalur absensi server-side menerima konteks native resmi |
| UAT-AC-05 | Keamanan Absensi | Validasi keamanan absensi menolak `client_context.app_code` salah | LULUS | RPC `validate_attendance_security_context(...)` mengembalikan `{\"allowed\": false, \"error\": \"NATIVE_APP_CODE_INVALID\"}` untuk `app_code = SALAH` | - | Pesan server-side: `Aplikasi tidak terverifikasi untuk proses absensi` |
| UAT-AC-06 | Keamanan Absensi | `process_check_in` menolak request native salah/kosong sebelum membuat row absensi | LULUS | Sebelum uji, count `attendance_records_partitioned` hari ini untuk employee uji = `0`; panggilan `process_check_in(...)` dengan `app_code = SALAH` dan tanpa `app_code` sama-sama mengembalikan `success = false`, `error = NATIVE_APP_CODE_INVALID`; sesudah uji, count tetap `0` | - | Guardrail absensi aktif sebelum mutasi data, sehingga request native tidak valid tidak menulis row baru |

## Risiko tersisa
- UAT ini menutup validasi `app_code` di layer API dan SQL, tetapi belum memverifikasi bridge Android nyata mengirim `app_code` yang benar pada device fisik.
- Belum ada emulator/device aktif di sesi ini, jadi skenario UI Android seperti `session expired`, `host allowlist`, dan `forced update` masih terbuka.
- Jalur auth yang diuji memakai `dev:mobile-api` lokal; verifikasi ulang di environment production-like tetap disarankan sebelum rilis.

## Tindak lanjut
- Saat emulator/device tersedia, lanjutkan Batch 3 Android untuk `session expired`, `host allowlist`, dan `minimum version`.
- Pertahankan `native_app_code = AKN1` sinkron antara `attendance_security`, APK resmi, dan dokumentasi rollout.
- Jika nanti dilakukan rotasi `app_code`, ulangi batch ini penuh untuk auth native dan `process_check_in/process_check_out`.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
