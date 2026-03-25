# KERJA PARALEL MODE

Dokumen ini menetapkan mode kerja paralel sebagai default untuk mempercepat delivery.

## Scope Produk Aktif (Per 3 Maret 2026)
- Scope kerja aktif repo ini: **attendance-first**.
- Task HR/Payroll statusnya **on-hold sementara** dan hanya dikerjakan jika ada perintah eksplisit user.

## Tujuan
- Meminimalkan waktu tunggu dengan menjalankan pekerjaan independen secara bersamaan.
- Menjaga hasil tetap konsisten, deterministik, dan aman.

## Aturan Utama (Selalu Aktif)
- Pecah task menjadi unit kecil independen sebelum eksekusi.
- Jalankan operasi baca konteks secara paralel:
  - pencarian file
  - pembacaan file
  - inspeksi log
  - inspeksi git status
- Jalankan validasi paralel jika tidak saling bergantung:
  - lint
  - typecheck
  - test
  - build check
- Untuk backend endpoint/edge function, uji endpoint berbeda secara paralel.

## Batasan Keamanan Paralel
- Dilarang edit file yang sama secara paralel.
- Dilarang menjalankan command destruktif tanpa izin eksplisit user.
- Jika hasil antar job paralel konflik, utamakan:
  1. konsistensi data
  2. output deterministik
  3. rollback parsial yang paling kecil dampaknya

## Protokol Eksekusi
1. Scan cepat konteks secara paralel.
2. Implementasi bertahap per batch kecil (1-5 file).
3. Validasi sesuai risiko perubahan:
   - Low: lint file terkait
   - Medium: lint + test terdampak
   - Critical: lint + test + build
4. Jika ada error fixable otomatis, jalankan `npm run autofix` dulu.

## Rule Pause Perubahan Besar
- Auto-eksekusi berlaku untuk perubahan kecil-menengah.
- Wajib pause dan minta konfirmasi user jika menyentuh:
  - `DB migration`
  - `auth/permission`
  - `billing/payment`
  - domain HR/Payroll yang sedang on-hold
  - perubahan >5 file lintas modul

## Stack Tools Paralel (Default)
- `functions.exec_command` + `multi_tool_use.parallel` untuk operasi independen secara bersamaan.
- `mcp__codebase__get_files_context` sebelum edit file agar konteks dan dampak test jelas.
- `mcp__codebase__semantic_search` dan `mcp__codebase__find_similar` untuk percepat tracing logic.
- `mcp__codebase__get_dependents` untuk mencegah regresi saat ubah modul bersama.

## Localhost Preflight
Untuk task yang butuh localhost (`psql`, Playwright, `127.0.0.1`), jalankan:
- `npm run ops:sandbox:doctor:strict`

Jika doctor gagal dengan Ref sandbox, hentikan eksekusi test/DB sampai environment siap.

## Larangan Otomatisasi Eksternal
- Jangan `git push`, buat PR, atau deploy Vercel tanpa perintah eksplisit user pada turn aktif.

## Logging Error
- Frontend: sertakan `log id`.
- Backend: sertakan `trace_id`.

## Penutupan Task
Setiap task selesai:
1. Update memory:
   - `npm run ops:memory:task -- --title "<judul_task>" --summary "<ringkasan>"`
2. Tawarkan FAQ update:
   - `npm run faq:offer`
   - jika FAQ benar-benar diperbarui: `npm run faq:ack`
3. Laporkan singkat:
   - apa yang diubah
   - hasil validasi
   - risiko tersisa
