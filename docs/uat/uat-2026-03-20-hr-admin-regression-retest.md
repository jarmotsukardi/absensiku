# UAT HR Admin Regression Retest

## Metadata
- Tanggal: 2026-03-20
- Scope: Retest regresi governance HR admin setelah sinkronisasi kontrak UI `/admin/hr/*`
- Environment: Localhost `http://127.0.0.1:5173` dengan Supabase remote
- Device / Browser: Playwright Chromium desktop
- Build / Versi: `local-127.0.0.1:5173-hr-uat-2026-03-20-r2`
- Penguji: Codex

## Data uji
- Tenant: tenant aktif dari akun `org_admin` pada `ops/test-accounts.local.json`
- Admin: role `superadmin` dari `ops/test-accounts.local.json`
- Catatan data:
  - fokus batch ini hanya regresi governance admin HR yang sebelumnya merah
  - bridge admin -> org HR belum diretest pada batch ini

## Ringkasan hasil
- Total skenario diuji: 24
- Lulus: 23
- Gagal: 0
- Skip: 1
- Verdict: siap dengan catatan

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-R1 | Audit HR | `admin-hr-audit-search.e2e.ts` stabil untuk search smoke, filter hari libur kosong, filter tenant, pagination route, summary cards, link ke error log, dan guide | LULUS | `npx playwright test tests/e2e/admin-hr-audit-search.e2e.ts --workers=1` | - | 7 lulus, 1 skip backend-driven |
| UAT-R2 | Error Logs HR | `admin-hr-error-logs-smoke.e2e.ts` stabil untuk summary, filter/tab, navigasi audit, export, pagination, dan buka route sumber | LULUS | `npx playwright test tests/e2e/admin-hr-error-logs-smoke.e2e.ts --workers=1` | - | 5/5 lulus |
| UAT-R3 | FAQ HR | `admin-hr-faq-smoke.e2e.ts` stabil untuk heading, metric card, search, accordion, navigasi global, dan guide | LULUS | subset rerun governance 2026-03-20 | - | 3/3 lulus |
| UAT-R4 | Helpdesk HR | `admin-hr-help-smoke.e2e.ts` stabil untuk heading, metrics, filter tenant, reload, navigasi FAQ, dan guide | LULUS | subset rerun governance 2026-03-20 | - | 3/3 lulus |
| UAT-R5 | Support HR | `admin-hr-support-smoke.e2e.ts` stabil untuk heading, metrics, playbook, navigasi tiket/error-log/FAQ, dan guide | LULUS | subset rerun governance 2026-03-20 | - | 2/2 lulus |
| UAT-R6 | Profil HR Admin | `admin-hr-profile-smoke.e2e.ts` stabil untuk editor, preview, shortcut, dan guide | LULUS | subset rerun governance 2026-03-20 | - | 2/2 lulus |
| UAT-R7 | Heading Konsistensi | `admin-hr-heading-consistency.e2e.ts` sudah konsisten di seluruh route HR admin yang tercakup | LULUS | subset rerun governance 2026-03-20 | - | 1/1 lulus |

## Ringkasan command validasi
- `npx playwright test tests/e2e/admin-hr-audit-search.e2e.ts --workers=1`
  - hasil: `7 passed, 1 skipped`
- `npx playwright test tests/e2e/admin-hr-heading-consistency.e2e.ts tests/e2e/admin-hr-help-smoke.e2e.ts tests/e2e/admin-hr-faq-smoke.e2e.ts tests/e2e/admin-hr-support-smoke.e2e.ts tests/e2e/admin-hr-profile-smoke.e2e.ts tests/e2e/admin-hr-error-logs-smoke.e2e.ts tests/e2e/admin-hr-audit-search.e2e.ts --workers=1`
  - hasil: `23 passed, 1 skipped`

## Risiko tersisa
- Batch ini belum menutup bridge admin -> org HR yang sebelumnya gagal pada training, ESS, dan ATS.
- Satu skenario backend-driven di `admin-hr-audit-search.e2e.ts` masih `skipped`, sehingga verifikasi query nyata belum ikut batch ini.
- Status UAT HR end-to-end keseluruhan masih belum bisa dinaikkan ke `siap` sebelum minimal satu bridge admin -> org HR lolos.

## Tindak lanjut
- Rerun dan perbaiki bridge:
  - `tests/e2e/admin-hr-training-runtime-bridge.e2e.ts`
  - `tests/e2e/admin-hr-ess-readonly-bridge.e2e.ts`
  - `tests/e2e/admin-hr-ats-governance-runtime.e2e.ts`
- Jika env service-role siap, jalankan ulang skenario backend-driven pada `admin-hr-audit-search.e2e.ts`.
- Tambahkan entry logbook batch retest governance di `/admin/hr/uat`.

## Sign-off
- Status akhir: siap dengan catatan
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
