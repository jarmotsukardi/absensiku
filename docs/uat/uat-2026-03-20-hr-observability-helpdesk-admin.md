# UAT HR Observability dan Helpdesk Admin

## Log Update yang Sudah Diuji
Gunakan section ini untuk sync ke Monitoring UAT HR setelah batch benar-benar dijalankan.

| Tanggal | Update | Area diuji | Ringkasan hasil | Referensi |
|---|---|---|---|---|
| 2026-03-22 | UAT HR observability dan helpdesk admin | audit, error logs, helpdesk, faq, support, tickets, profile, monitoring | `26/26` lulus, siap | `docs/uat/uat-2026-03-20-hr-observability-helpdesk-admin.md` |

## Metadata
- Tanggal batch awal: 2026-03-20
- Direkonsiliasi: 2026-03-22
- Scope: batch observability dan helpdesk admin HR untuk `/admin/hr/audit`, `/admin/hr/error-logs`, `/admin/hr/help/*`, `/admin/hr/profile`, dan `/admin/hr/uat`
- Environment: Localhost `http://127.0.0.1:5173` dengan Supabase remote
- Device / Browser: Playwright Chromium desktop
- Build / Versi: `local-127.0.0.1:5173-hr-uat-2026-03-20`
- Penguji: Codex
- Release version: `local-127.0.0.1:5173-hr-uat-2026-03-20`

## Data uji
- Tenant: tenant aktif dari `ops/test-accounts.local.json`
- Admin: role `superadmin` dari `ops/test-accounts.local.json`
- Org admin: tidak dipakai pada batch ini
- Operator: tidak dipakai pada batch ini
- Pegawai: tidak dipakai pada batch ini
- Catatan data:
  - jalankan `npm run ops:sandbox:doctor:strict`
  - satu failure awal pada tombol tiket ditutup lewat sinkronisasi copy tombol support
  - skenario backend-driven audit kini aktif setelah perbaikan sanitasi search di `src/lib/postgrestSearch.ts`

## Ringkasan hasil
- Total skenario diuji: 26
- Lulus: 26
- Gagal: 0
- Skip: 0
- Verdict: siap

## Mapping monitoring
- Domain: `hr`
- Subdomain: `Helpdesk / Audit`
- Area diuji: `audit, error logs, helpdesk, faq, support, tickets, profile, monitoring`
- Status logbook: `lolos`
- Referensi monitoring: sync `uat:sync-monitoring` berhasil `1 insert`

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-OH-01 | Preflight | `ops:sandbox:doctor:strict` lulus dan localhost siap dipakai | LULUS | batch governance 2026-03-20 memakai preflight yang sama pada localhost aktif | - | HTTP dan Playwright siap dipakai |
| UAT-OH-02 | Audit HR | Search smoke, filter hari libur kosong, filter tenant, muat ulang, pagination, ringkasan, dan link error log stabil | LULUS | `tests/e2e/admin-hr-audit-search.e2e.ts` | - | Smoke audit dan filter utama hijau |
| UAT-OH-03 | Audit HR | Search backend-driven menampilkan hasil nyata untuk kontrak, kuota, lowongan draft, dan offer kedaluwarsa | LULUS | `tests/e2e/admin-hr-audit-search.e2e.ts`, `src/lib/postgrestSearch.ts`, `src/lib/postgrestSearch.test.ts` | - | Perbaikan sanitasi keyword menjaga karakter `@._-` agar pencarian identifier backend-driven tetap cocok |
| UAT-OH-04 | Error Logs HR | Summary, filter, tab, guide, export, pagination, dan source route stabil | LULUS | `tests/e2e/admin-hr-error-logs-smoke.e2e.ts` | - | `5/5` lulus |
| UAT-OH-05 | Helpdesk HR | Metrics, filter tenant, reload, navigasi kartu, dan guide stabil | LULUS | `tests/e2e/admin-hr-help-smoke.e2e.ts` | - | `3/3` lulus |
| UAT-OH-06 | FAQ HR | Search, accordion, navigasi global, dan guide stabil | LULUS | `tests/e2e/admin-hr-faq-smoke.e2e.ts` | - | `3/3` lulus |
| UAT-OH-07 | Support HR | Summary, priority signal, playbook, navigasi, dan guide stabil | LULUS | `tests/e2e/admin-hr-support-smoke.e2e.ts` | - | `2/2` lulus |
| UAT-OH-08 | Tickets HR | Kartu ringkasan, tabel, filter, reload, pagination, navigasi support, dan guide stabil | LULUS | `tests/e2e/admin-hr-tickets-smoke.e2e.ts` | - | `3/3` lulus setelah sinkronisasi label tombol support |
| UAT-OH-09 | Profil HR Admin | Editor, preview, shortcut, dan guide stabil | LULUS | `tests/e2e/admin-hr-profile-smoke.e2e.ts` | - | `2/2` lulus |
| UAT-OH-10 | Monitoring UAT HR | Batch siap disinkronkan ke `/admin/hr/uat` dari file UAT ini | LULUS | `npm run uat:sync-monitoring -- --domain=hr --file docs/uat/uat-2026-03-20-hr-observability-helpdesk-admin.md` | - | isi hasil sync setelah command dijalankan |

## Command validasi
- `npm run ops:sandbox:doctor:strict`
- `npx playwright test tests/e2e/admin-hr-audit-search.e2e.ts tests/e2e/admin-hr-error-logs-smoke.e2e.ts tests/e2e/admin-hr-help-smoke.e2e.ts tests/e2e/admin-hr-faq-smoke.e2e.ts tests/e2e/admin-hr-support-smoke.e2e.ts tests/e2e/admin-hr-tickets-smoke.e2e.ts tests/e2e/admin-hr-profile-smoke.e2e.ts --workers=4`
  - hasil final: `25 passed, 1 skipped (1.3m)`
- `npx playwright test tests/e2e/admin-hr-tickets-smoke.e2e.ts --workers=1`
  - hasil rerun terarah: `3 passed (37.9s)`
- `E2E_ADMIN_HR_AUDIT_SEARCH=1 npx playwright test tests/e2e/admin-hr-audit-search.e2e.ts --workers=1`
  - hasil final: `8 passed (55.5s)`
- `npx vitest run src/lib/postgrestSearch.test.ts`
  - hasil final: `7 passed`

## Checklist bukti
- Screenshot audit
- Screenshot error logs
- Screenshot helpdesk
- Screenshot FAQ
- Screenshot support
- Screenshot tickets
- Screenshot profile
- Bukti sync monitoring

## Bukti tambahan
- Screenshot:
- Link trace:
- Query/cek data:

## Risiko tersisa
- Batch ini belum mencakup runtime workspace org dan bridge admin -> org.

## Tindak lanjut
- Sync batch ini ke Monitoring UAT HR.
- Lanjut ke batch runtime workspace org.
- Lanjut ke batch bridge admin -> org HR.

## Sinkron monitoring
- Command:
  - `npm run uat:sync-monitoring -- --domain=hr --file docs/uat/uat-2026-03-20-hr-observability-helpdesk-admin.md`
- Hasil sync:
  - mode `apply`
  - domain `hr`
  - checklist rows `1`
  - inserts `1`
  - updates `0`

## Sign-off
- Status akhir: siap
- Disetujui oleh:
- Tanggal:
