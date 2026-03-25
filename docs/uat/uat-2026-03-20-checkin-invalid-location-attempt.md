# UAT Attempt Check-in Tanpa Lokasi Valid

## Metadata
- Tanggal: 2026-03-20
- Scope: percobaan penutupan skenario `check-in tanpa lokasi kerja yang valid ditolak dengan pesan yang jelas`
- Environment: localhost `http://127.0.0.1:5173` + Playwright + Supabase remote
- Device / Browser: browser test dengan spoof Safari iPhone dan override `web_device_id`
- Penguji: Codex

## Ringkasan hasil
- Status akhir: perlu tindak lanjut
- Verdict: blocked

## Hasil percobaan
| ID | Akun | Langkah | Hasil | Catatan |
|---|---|---|---|---|
| UAT-LI-01 | `Lisfa Uji Billing` | Device binding disamakan ke `WEB-SMOKE-DEVICE-0001`, dashboard mobile berhasil dibuka, lalu geolocation disiapkan jauh dari kantor | BLOCKED | Saat klik `Absen Masuk`, flow berhenti lebih dulu di overlay `Billing Mandiri`, sehingga validasi lokasi tidak pernah dieksekusi |
| UAT-LI-02 | `Susi` | Berpindah ke akun `billing terpusat`, device binding disamakan ke `WEB-0000000028A56620`, dashboard mobile berhasil dibuka | BLOCKED | Tombol absensi tidak tersedia karena hari aktif uji adalah `Libur Nasional`, sehingga skenario lokasi invalid tetap tidak bisa dieksekusi |

## Kesimpulan
- Dua blocker di atas berada di lapisan yang lebih awal daripada validasi lokasi.
- Karena skenario inti belum benar-benar berjalan sampai pesan penolakan lokasi, item checklist **tetap belum diuji** dan tidak saya paksa naik ke `Sudah diuji`.

## Tindak lanjut
- Ulangi skenario ini dengan akun yang:
  - lolos device binding,
  - tidak kena gate `billing mandiri`,
  - berada pada hari kerja normal.
- Alternatif kedua: jalankan di emulator/device Android nyata dengan tanggal kerja yang valid.
