# UAT Edge Case Absensi Server-side

## Metadata
- Tanggal: 2026-03-20
- Scope: edge case absensi server-side dengan konteks native-like resmi
- Environment: localhost tooling + Supabase remote
- Device / Browser: `node`, RPC Supabase, query remote DB
- Build / Versi: backend schema attendance security aktif, `attendance_security.native_app_code = AKN1`
- Penguji: Codex

## Data uji
- Pegawai: `Lisfa Uji Billing`
- Employee ID: `9b66b701-d05a-41ed-8bc2-6de395ea82fc`
- Tenant ID: `62e3dfaf-84e6-4f51-b731-3006c14d75a7`
- Office ID: `9b9bd540-8c00-4b2b-880b-8b41a047d065`
- Device ID uji: `WEB-SMOKE-DEVICE-0001`
- App code aktif: `AKN1`

## Prasyarat konteks
- `client_mode = android_webview`
- `device_id = WEB-SMOKE-DEVICE-0001`
- `app_code = AKN1`

Tanpa kombinasi konteks di atas, jalur absensi server-side ditolak oleh enforcement keamanan native.

## Ringkasan hasil
- Total skenario diuji: 4
- Lulus: 4
- Gagal: 0
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-AE-01 | Absensi | Check-out sebelum check-in ditolak dengan pesan yang benar | LULUS | RPC `process_check_out(...)` mengembalikan `success = false`, `error = NOT_CHECKED_IN`, `message = Belum melakukan absen masuk` | - | Menutup guardrail dasar agar user tidak bisa membuat check-out tanpa check-in valid |
| UAT-AE-02 | Absensi | Check-in pertama berhasil pada konteks native-like resmi | LULUS | RPC `process_check_in(...)` mengembalikan `success = true`, membuat row `attendance_records_partitioned.id = d92d1b11-b8cf-4bc8-ade0-913742a4018c`, dan `attendance_date = 2026-03-20` | - | Ini dipakai sebagai basis uji anti-duplikasi retry |
| UAT-AE-03 | Absensi | Replay dengan idempotency key yang sama tidak membuat row ganda | LULUS | Panggilan `process_check_in(...)` kedua dengan key yang sama mengembalikan record ID yang sama dan flag `idempotent_replay = true` | - | Membuktikan retry identik tidak membuat absensi baru |
| UAT-AE-04 | Absensi | Retry dengan key berbeda setelah check-in sukses tidak membuat duplikasi absensi | LULUS | Panggilan `process_check_in(...)` berikutnya dengan key berbeda mengembalikan `success = false`, `error = ALREADY_CHECKED_IN`, tetap menunjuk record yang sama, lalu cleanup remote DB menghapus row uji `deleted = 1`, `existsAfter = false` | - | Menutup skenario anti-duplikasi server-side pada retry setelah sukses parsial/timeout |

## Catatan penting
- Fungsi absensi menormalisasi tanggal ke hari server/tenant aktif. Saat uji dikirim dengan `p_date = 2026-12-31`, hasil final tetap memakai `attendance_date = 2026-03-20`.
- UAT ini sah untuk layer server-side anti-duplikasi, tetapi belum menutup UX `double tap tombol absen` di emulator/device karena belum ada interaksi UI langsung.
- Data uji yang sempat dibuat untuk skenario ini sudah dibersihkan dari remote DB, sehingga tidak meninggalkan row absensi palsu.

## Risiko tersisa
- `Double tap tombol absen tidak membuat data ganda` masih butuh bukti UI/emulator atau device nyata.
- `Pending sync terlalu lama`, `logout saat ada pending attendance`, dan `check-in tanpa lokasi valid` masih belum tertutup.
- Validasi ini tidak menggantikan UAT runtime Android untuk queue sync, WebView, dan device nyata.

## Tindak lanjut
- Lanjutkan batch emulator/device untuk `double tap`, `pending sync`, dan `logout saat ada pending attendance`.
- Jika nanti behavior `p_date` memang perlu dipakai untuk backfill/testing khusus, dokumentasikan policy normalisasi tanggal di runbook backend.
- Pertahankan cleanup data uji setiap kali batch server-side membuat row absensi nyata.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
