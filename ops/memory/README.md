# Ops Memory

Folder ini menyimpan ingatan kerja lintas sesi agar handover cepat dan konsisten.

## File
- `current-state.local.md`: snapshot terkini (auto-update + fokus aktif).
- `decisions.local.md`: keputusan penting.
- `open-issues.local.md`: blocker/risiko yang belum selesai.
- `next-actions.local.md`: antrean aksi lanjutan.
- `task-log.local.jsonl`: jejak detail per-run (lokal).

## Command
- Inisialisasi: `npm run ops:memory:init`
- Update per task: `npm run ops:memory:task -- --title "<judul>" --summary "<ringkasan>"`

## Catatan
- Jalankan `ops:memory:task` sebagai langkah penutup setiap task.
- `task-log.local.jsonl` dapat dipakai untuk audit progres harian.
