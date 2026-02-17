# Lovable-Like Workflow Preset (ABSENSIKU)

Gunakan template ini saat kamu ingin hasil cepat seperti Lovable: dari prompt langsung ke implementasi + validasi.

## MCP yang Dipakai
- `21st`: generate/iterasi UI cepat.
- `figma` atau `figma-community`: tarik konteks desain.
- `context7`: keputusan teknis berbasis docs terbaru.
- `supabase`: cek schema/RLS/query backend.
- `playwright`: review hasil render + console/network.
- `github` (opsional): sinkron issue/checklist.

## Preset 1: Bootstrap Fitur Baru (Fullstack)
```text
Gunakan mode kerja cepat (Lovable-like) untuk implementasi fitur berikut:
[NAMA FITUR]

Kebutuhan:
- Outcome user: [TUJUAN]
- Route/UI: [HALAMAN]
- Data model: [TABEL/FIELD]
- Acceptance criteria: [KRITERIA]

Aturan eksekusi:
1) scan konteks paralel (file terkait + schema/query)
2) breakdown batch kecil (1-5 file per batch)
3) implement backend dulu, lalu frontend
4) validasi paralel: npm run autofix -> lint -> test -> build
5) review playwright untuk route utama
6) laporkan: perubahan, hasil validasi, risiko tersisa
```

## Preset 2: Redesign Halaman Cepat
```text
Redesign halaman [ROUTE] dengan kualitas production-ready.

Gunakan:
- 21st untuk ide komponen cepat
- Figma MCP bila ada referensi desain
- pertahankan perilaku bisnis existing

Wajib:
- responsive desktop/mobile
- aksesibilitas dasar (label, aria, heading)
- tidak ada placeholder link mati (#)
- cek playwright: render, console error, flow utama
```

## Preset 3: Bugfix Terarah + Verifikasi
```text
Perbaiki bug berikut sampai tuntas:
[DESKRIPSI BUG]

Langkah:
1) reproduksi bug
2) identifikasi akar masalah (file + query + state)
3) patch minimal yang aman
4) validasi paralel (lint/test/build)
5) verifikasi ulang di playwright

Output wajib:
- root cause
- file yang diubah
- status akhir (fixed/not fixed)
- jika masih ada error, sertakan ref_id/trace_id
```

## Checklist Done (Wajib)
- Tidak ada regression di route terkait.
- Console tidak punya error baru.
- Error message punya referensi (`Ref: ERR-...` / `trace_id`).
- Build lolos.
