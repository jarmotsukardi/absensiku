# AUTOPILOT MODE (Global)

Dokumen ini adalah kontrak eksekusi otomatis untuk repo `ABSENSIKU`.

## Scope Produk Aktif (Per 3 Maret 2026)
- Fokus aktif saat ini: **attendance-first**.
- Modul HR/Payroll tetap ada di folder/repo ini, tetapi statusnya **on-hold sementara**.
- Jika task menyentuh HR/Payroll, autopilot pause dan minta konfirmasi user sebelum lanjut.

## Dokumen Pendukung
- `kerja_paralel.md` untuk aturan eksekusi paralel-by-default.
- `memperkuat_memory.md` untuk disiplin penyimpanan memory berbasis file.
- `AGENTS.md` sebagai aturan operasional utama repo.

## Trigger
Gunakan format:
- `AUTOPILOT ON: <tujuan>`

Saat trigger aktif, agent langsung mengeksekusi task end-to-end tanpa menunggu instruksi mikro, selama masih dalam scope tujuan.

## Cara Kerja Default
1. Scan konteks cepat secara paralel (`rg`, baca file relevan, cek log, cek git status).
2. Pecah pekerjaan ke batch kecil (1-5 file) dan kerjakan bertahap.
3. Jalankan validasi berbasis risiko.
4. Lanjut ke batch berikutnya sampai tujuan tercapai.

## Prioritas Task (Default)
- `bug kritis`
- `blocker deploy`
- `fitur baru`
- `refactor`

## Validasi Berbasis Risiko
- Low risk (copywriting/UI minor): lint file terkait.
- Medium risk (logic komponen/API non-kritis): lint + test terdampak.
- Critical risk (billing/auth/permission/DB migration): lint + test terdampak + build.

Sebelum push/release wajib full gate:
1. `npm run autofix`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

## Guardrails Wajib
- Jangan edit file yang sama secara paralel.
- Jangan jalankan command destruktif tanpa izin eksplisit user.
- Jangan `git push`, buat PR, atau deploy Vercel tanpa perintah eksplisit user pada turn aktif.
- Jika ada error, selalu tampilkan referensi error (`log id` frontend atau `trace_id` backend).

## Aturan Stop (Minta Keputusan User)
Autopilot wajib pause jika:
- ada risiko data loss/destruktif,
- butuh kredensial/akses eksternal,
- ada ambiguitas requirement yang mengubah scope besar,
- ada konflik aturan yang material,
- terdeteksi perubahan tak terduga di luar batch aktif,
- perubahan menyentuh `DB migration`, `auth/permission`, `billing/payment`, atau perubahan >5 file lintas modul,
- perubahan menyentuh domain HR/Payroll yang sedang on-hold.

## Akselerator Wajib
- Jika ada error yang fixable otomatis, jalankan `npm run autofix` lebih dulu.
- Untuk task localhost (`psql`, Playwright, `127.0.0.1`), jalankan preflight:
  - `npm run ops:sandbox:doctor:strict`

## Stack Tools Akselerasi (Default)
1. `multi_tool_use.parallel`
   - Jalankan baca konteks, lint, test, build secara paralel jika tidak saling bergantung.
2. `functions.exec_command`
   - Eksekusi cepat command teknis (`rg`, `eslint`, `vitest`, `build`, migration, script ops).
3. `mcp__codebase__*`
   - Prioritas: `get_files_context`, `semantic_search`, `find_similar`, `get_dependents`.
4. `mcp__supabase__*`
   - Validasi/migrasi DB dan verifikasi schema/query attendance-billing.
5. `mcp__playwright__*`
   - Smoke E2E cepat untuk alur kritikal setelah batch implementasi.

## Handover Wajib
Setiap task selesai:
1. Update memory:
   - `npm run ops:memory:task -- --title "<judul_task>" --summary "<ringkasan>"`
   - sertakan `--risks` dan `--next`; catat `run_id` terbaru untuk referensi sesi berikutnya
2. Tawarkan update FAQ:
   - `npm run faq:offer`
   - jika FAQ benar-benar diperbarui: `npm run faq:ack`
3. Laporan ringkas:
   - apa yang diubah
   - hasil validasi
   - risiko tersisa

## Definisi Selesai
Satu batch dianggap selesai jika:
- implementasi batch tuntas,
- validasi minimum sesuai risiko sudah dijalankan,
- memory task tercatat,
- risiko tersisa dan next-step disebutkan singkat.
