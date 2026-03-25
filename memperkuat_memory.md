# PERKUAT MEMORY MODE

Dokumen ini memperkuat ingatan lintas sesi dengan menyimpan memory dalam bentuk file lokal yang konsisten.

## Scope Produk Aktif (Per 3 Maret 2026)
- Fokus memory repo ini saat ini: **attendance-first**.
- Catatan HR/Payroll tetap disimpan di repo ini, namun status implementasinya **on-hold sementara**.

## Tujuan
- Mengurangi kehilangan konteks antar sesi kerja.
- Mempercepat handover tanpa mengulang analisis dari awal.
- Membuat jejak keputusan dan risiko tetap terlacak.

## Lokasi Memory File
Gunakan file di folder `ops/memory/`:
- `current-state.local.md`
- `decisions.local.md`
- `open-issues.local.md`
- `next-actions.local.md`
- `task-log.local.jsonl`

## Toolset Turbo (1-4)
Gunakan tool berikut sebagai standar percepatan default:
1. `Supabase MCP`
   - `list_tables`, `execute_sql`, `apply_migration`, `get_advisors`
2. `multi_tool_use.parallel`
   - scan konteks + validasi independen dijalankan paralel
3. `codebase MCP`
   - `get_dependents`, `semantic_search`, `find_similar`, `get_files_context`
4. `exec_command` lokal
   - loop cepat `rg`, `npm run ...`, `playwright`, `ops:memory:task`, `faq:offer`

## Aturan Wajib Simpan Memory
- Setiap task selesai wajib jalankan:
  - `npm run ops:memory:task -- --title "<judul_task>" --summary "<ringkasan>"`
- Isi opsi tambahan saat relevan:
  - `--changes`
  - `--validation`
  - `--risks`
  - `--next`
  - `--decision`
  - `--issue`

## Standar Isi Memory (Ringkas, Tajam)
- `current-state`: status fitur aktif, progres terakhir, scope yang sudah aman.
- `decisions`: keputusan teknis + alasan singkat.
- `open-issues`: blocker aktif + dampak + referensi (`trace_id`/`log id` bila ada).
- `next-actions`: langkah lanjutan paling prioritas.
- `task-log`: histori per task untuk audit dan rollback konteks.

## Trigger Update Tambahan
Lakukan update memory tambahan jika:
- ada perubahan arsitektur/alur data,
- ada migrasi DB atau perubahan permission,
- ada bug kritis/insiden,
- ada keputusan yang mengubah rencana milestone.

## Integrasi Dengan Autopilot
Dalam mode autopilot, memory update adalah langkah penutup wajib sebelum laporan akhir.

## Profil Fokus Aktif (Opsional)
Jika sesi berjalan dengan fokus domain tertentu, simpan eksplisit pada ringkasan memory. Contoh:
- Fokus default: `Attendance` (`/employee`, `/admin/reports/attendance`, `/admin/attendance-security`)
- `HR`/`Payroll` tetap berada di repo ini, tetapi dikerjakan hanya saat ada arahan eksplisit user.

## Checklist Penutupan Task
1. Pastikan implementasi selesai sesuai scope.
2. Jalankan validasi sesuai risiko.
3. Jalankan `ops:memory:task`.
4. Jalankan `npm run faq:offer` untuk menawarkan update FAQ.
5. Laporkan:
   - apa yang diubah
   - hasil validasi
   - risiko tersisa
