# UAT Retest HR Bridge Runtime

Catatan: artefak ini dipertahankan sebagai lampiran retest rinci. Ringkasan kanonik bridge HR sudah direkonsiliasi ke `docs/uat/uat-2026-03-20-hr-bridge-admin-org.md` per 2026-03-22.

- Tanggal: 2026-03-20
- Release: `local-127.0.0.1:5173-hr-uat-2026-03-20-r3`
- Scope: bridge admin HR ke runtime org HR
- Status: `lolos`

## Ringkasan

Retest bridge HR sesudah perbaikan policy akses runtime dan penyelarasan kontrak ATS selesai hijau.

Hasil final:

- `admin-hr-ats-governance-runtime.e2e.ts` lulus
- `admin-hr-ess-readonly-bridge.e2e.ts` lulus
- `admin-hr-training-runtime-bridge.e2e.ts` lulus
- `org-hr-ats-readonly-smoke.e2e.ts` lulus

Rekap batch:

- `4/4 lulus, siap`

## Perbaikan yang Memengaruhi Hasil

- Runtime org tidak lagi salah redirect ke `/org` saat workspace HR valid.
- Perhitungan readiness akses HR tidak lagi gagal karena query absensi memakai kolom `tenant_id` yang tidak ada pada tabel absensi.
- Tenant dengan langganan `active` tidak lagi tertahan pada `setup_required` untuk route HR.
- Kontrak copy ATS admin diselaraskan.
- Heading runtime ATS interview diselaraskan menjadi `Tahap Interview`.

## Referensi Validasi

- `npx playwright test tests/e2e/org-hr-ats-readonly-smoke.e2e.ts tests/e2e/admin-hr-ats-governance-runtime.e2e.ts tests/e2e/admin-hr-training-runtime-bridge.e2e.ts tests/e2e/admin-hr-ess-readonly-bridge.e2e.ts --workers=1`

## Catatan Risiko

- Worktree repo sedang sangat kotor di luar batch HR ini, jadi release berikutnya tetap perlu validasi terarah sebelum full gate.
- `npm run autofix` selesai dengan 4 warning lama di luar scope HR bridge, tanpa lint error.
