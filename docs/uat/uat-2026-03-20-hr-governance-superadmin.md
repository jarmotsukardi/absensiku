# UAT HR Governance Superadmin

## Log Update yang Sudah Diuji
Gunakan section ini untuk sync ke Monitoring UAT HR setelah batch benar-benar dijalankan.

| Tanggal | Update | Area diuji | Ringkasan hasil | Referensi |
|---|---|---|---|---|
| 2026-03-20 | UAT HR governance superadmin | dashboard, tenants, policies, settings, route guard, alias | `16/16` lulus, siap | `docs/uat/uat-2026-03-20-hr-governance-superadmin.md` |

## Metadata
- Tanggal: 2026-03-20
- Scope: batch governance superadmin HR untuk `/admin/hr`, `/admin/hr/tenants`, `/admin/hr/policies`, dan `/admin/hr/settings`
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
  - pastikan localhost `127.0.0.1:5173` siap
  - batch dieksekusi ulang setelah perbaikan alias redirect `kalender-kerja`

## Ringkasan hasil
- Total skenario diuji: 16
- Lulus: 16
- Gagal: 0
- Skip: 0
- Verdict: siap

## Mapping monitoring
- Domain: `hr`
- Subdomain: `Tata Kelola Tenant`
- Area diuji: `dashboard, tenants, policies, settings, route guard, alias`
- Status logbook: `lolos`
- Referensi monitoring: sync `uat:sync-monitoring` berhasil `1 insert`

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-GS-01 | Preflight | `ops:sandbox:doctor:strict` lulus dan localhost siap dipakai | LULUS | `npm run ops:sandbox:doctor:strict` | - | Status `SIAP` untuk HTTP dan Playwright |
| UAT-GS-02 | Dashboard HR | `/admin/hr` termuat normal dan heading konsisten dengan route | LULUS | `tests/e2e/admin-hr-heading-consistency.e2e.ts` | - | 1/1 lulus |
| UAT-GS-03 | Navigasi HR | Tidak ada tab/menu ganda pada `/admin/hr` | LULUS | `tests/e2e/admin-hr-no-duplicate-nav.e2e.ts` | - | 1/1 lulus |
| UAT-GS-04 | Route guard HR | Semua submenu HR superadmin tetap di domain HR | LULUS | `tests/e2e/admin-hr-menu-route-guard.e2e.ts` | - | 1/1 lulus |
| UAT-GS-05 | Alias route HR | Route alias lama redirect ke canonical route yang benar | LULUS | `tests/e2e/admin-hr-section-alias-redirect.e2e.ts` | - | Lulus setelah redirect eksplisit ditambahkan di `src/App.tsx` |
| UAT-GS-06 | Tenants HR | Summary card dan tabel tenant tampil stabil | LULUS | `tests/e2e/admin-hr-tenants-smoke.e2e.ts` | - | Kartu ringkasan dan tabel tenant hijau |
| UAT-GS-07 | Tenants HR | Search, reload, pagination, link error logs/settings, dan guide stabil | LULUS | `tests/e2e/admin-hr-tenants-smoke.e2e.ts` | - | 4/4 skenario tenant lulus |
| UAT-GS-08 | Policies HR | Domain coverage, tenant selector, dan baseline controls tampil | LULUS | `tests/e2e/admin-hr-policies-smoke.e2e.ts` | - | Ringkasan domain dan tenant panel hijau |
| UAT-GS-09 | Policies HR | Link audit, coverage map, dan guide kebijakan stabil | LULUS | `tests/e2e/admin-hr-policies-smoke.e2e.ts` | - | 4/4 skenario policies lulus |
| UAT-GS-10 | Settings HR | Baseline cards, coverage map, filter tenant/status, dan guide stabil | LULUS | `tests/e2e/admin-hr-settings-smoke.e2e.ts` | - | 4/4 skenario settings lulus |

## Command validasi
- `npm run ops:sandbox:doctor:strict`
- `npx playwright test tests/e2e/admin-hr-heading-consistency.e2e.ts tests/e2e/admin-hr-no-duplicate-nav.e2e.ts tests/e2e/admin-hr-menu-route-guard.e2e.ts tests/e2e/admin-hr-section-alias-redirect.e2e.ts tests/e2e/admin-hr-tenants-smoke.e2e.ts tests/e2e/admin-hr-policies-smoke.e2e.ts tests/e2e/admin-hr-settings-smoke.e2e.ts --workers=4`
  - hasil final: `16 passed (1.1m)`
- `npx playwright test tests/e2e/admin-hr-section-alias-redirect.e2e.ts --workers=1`
  - hasil rerun terarah: `1 passed (23.1s)`

## Checklist bukti
- Screenshot dashboard `/admin/hr`
- Screenshot `/admin/hr/tenants`
- Screenshot `/admin/hr/policies`
- Screenshot `/admin/hr/settings`
- Hasil command validasi
- Trace atau screenshot failure bila ada
- Bukti sync monitoring

## Bukti tambahan
- Screenshot:
- Link trace:
- Query/cek data:

## Risiko tersisa
- Tidak ada temuan aktif pada batch governance ini setelah perbaikan alias redirect.
- Batch ini belum mencakup observability/helpdesk admin, runtime workspace org, dan bridge admin -> org.

## Tindak lanjut
- Sync batch ini ke Monitoring UAT HR.
- Lanjut ke batch observability/helpdesk admin.
- Lanjut ke batch runtime workspace org.
- Lanjut ke batch bridge admin -> org HR.

## Sinkron monitoring
- Command:
  - `npm run uat:sync-monitoring -- --domain=hr --file docs/uat/uat-2026-03-20-hr-governance-superadmin.md`
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
