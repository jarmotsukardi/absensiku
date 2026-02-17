# Feature Sprint Template (ABSENSIKU)

## 1) Scope Cepat
- Nama fitur:
- Outcome user:
- Role terdampak: (employee/org admin/super admin/public)
- Batasan: (waktu, teknis, non-goals)

## 2) Input MCP
- Figma MCP:
  - node/link desain:
  - komponen wajib:
- Context7 MCP:
  - library docs yang dipakai:
  - keputusan teknis dari docs:
- Supabase MCP:
  - tabel/RLS/function yang diubah:
- GitHub MCP:
  - issue/acceptance criteria/checklist:

## 3) Rencana Batch (1-5 file per batch)
- Batch 1:
  - file:
  - perubahan:
- Batch 2:
  - file:
  - perubahan:
- Batch 3:
  - file:
  - perubahan:

## 4) Eksekusi
- Implement backend dulu (schema/RLS/edge function).
- Implement frontend per route/komponen.
- Tambahkan error reference:
  - frontend: ref_id
  - backend: trace_id

## 5) Validasi Paralel
- Jalankan:
  - npm run autofix
  - npm run lint
  - npm run test
  - npm run build
- Playwright MCP:
  - skenario smoke:
  - skenario regression:

## 6) Deploy & Observability
- Vercel MCP:
  - preview URL:
  - error log penting:
- Supabase:
  - query/function check:
  - RLS check:

## 7) Output Akhir (wajib ringkas)
- Yang diubah:
- Hasil validasi:
- Risiko tersisa:
- Next step:

## Prompt Siap Pakai
Gunakan workflow ABSENSIKU:
1) ambil konteks Figma + Context7
2) breakdown batch 1-5 file
3) implementasi backend lalu frontend
4) validasi paralel (autofix, lint, test, build, playwright)
5) laporkan ringkas: perubahan, hasil validasi, risiko tersisa
