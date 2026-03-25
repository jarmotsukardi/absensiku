# UAT HR Bridge Admin ke Org

## Log Update yang Sudah Diuji
Gunakan section ini untuk sync ke Monitoring UAT HR setelah batch benar-benar dijalankan.

| Tanggal | Update | Area diuji | Ringkasan hasil | Referensi |
|---|---|---|---|---|
| 2026-03-22 | Bridge training admin ke org | training | `lolos` training CRUD dan bundle tenant sinkron | `docs/uat/uat-2026-03-20-hr-bridge-admin-org.md` |
| 2026-03-22 | Bridge ESS admin ke org | ESS | `lolos` baseline ESS dan bundle tenant sinkron | `docs/uat/uat-2026-03-20-hr-bridge-admin-org.md` |
| 2026-03-22 | Bridge ATS admin ke org | ATS | `lolos` governance ATS selaras dengan 4 route org | `docs/uat/uat-2026-03-20-hr-bridge-admin-org.md` |
| 2026-03-22 | Bridge kinerja dan akses tenant HR | performance, readonly/editable | `lolos` kinerja tenant sinkron dan 4 stage gate HR bersih | `docs/uat/uat-2026-03-20-hr-bridge-admin-org.md` |

## Metadata
- Tanggal batch awal: 2026-03-20
- Direkonsiliasi: 2026-03-22
- Scope: batch bridge admin HR ke runtime org HR untuk policy, baseline, dan sinkron readonly vs editable
- Environment: Localhost `http://127.0.0.1:5173` dengan Supabase remote
- Device / Browser: Playwright Chromium desktop
- Build / Versi: `local-127.0.0.1:5173-hr-uat-2026-03-22`
- Penguji: Codex
- Release version: `local-127.0.0.1:5173-hr-uat-2026-03-22`

## Data uji
- Tenant: tenant aktif dari `ops/test-accounts.local.json`
- Admin: role `superadmin` dari `ops/test-accounts.local.json`
- Org admin: role `org_admin` atau `org_admin_centralized`
- Operator: opsional untuk verifikasi readonly
- Pegawai: tidak dipakai pada batch ini
- Catatan data:
  - jalankan `npm run ops:sandbox:doctor:strict`
  - pastikan workspace HR aktif pada tenant target
  - batch ini direkonsiliasi memakai artefak retest hijau dan rerun gate tenant HR pada 2026-03-22
  - certification, skill matrix, dan review 360 belum ikut batch rekonsiliasi
  - jika ada failure, simpan `Ref ID` atau `trace_id`

## Ringkasan hasil
- Total skenario diuji: 6
- Lulus: 6
- Gagal: 0
- Skip: 0
- Belum diuji: 3
- Verdict: siap parsial, bridge utama yang diuji lulus

## Mapping monitoring
- Domain: `hr`
- Subdomain: `Training / Skill / Sertifikasi`, `ESS`, `ATS`, `Manajemen Kinerja`
- Area diuji: `training, certification, skill matrix, ESS, performance, review 360, ATS, readonly/editable`
- Status logbook: `lolos parsial`
- Referensi monitoring: sync `uat:sync-monitoring` berhasil `4 insert`

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-BR-01 | Preflight | `ops:sandbox:doctor:strict` lulus dan localhost siap dipakai | LULUS | `npm run ops:sandbox:doctor:strict` | - | Dipakai ulang untuk semua rerun bridge dan gate tenant |
| UAT-BR-02 | Training Bridge | CRUD training dari admin muncul konsisten di `/org/hr/training-data` dan bundle tenant tetap sinkron | LULUS | `tests/e2e/admin-hr-training-runtime-bridge.e2e.ts`, `tests/e2e/admin-hr-tenant-readonly-smoke.e2e.ts` | - | Training create-update-delete dan bundle tenant sama-sama hijau |
| UAT-BR-03 | Certification Bridge | Baseline certification dari admin muncul konsisten di `/org/hr/certifications` | BELUM DIUJI | - | - | Belum ada artefak batch 2026-03-22 untuk certification |
| UAT-BR-04 | Skill Matrix Bridge | Baseline skill matrix dari admin muncul konsisten di `/org/hr/skill-matrix` | BELUM DIUJI | - | - | Belum ada artefak batch 2026-03-22 untuk skill matrix |
| UAT-BR-05 | ESS Bridge | Baseline ESS admin terbaca konsisten di `/org/hr/ess/requests`, `/attendance`, `/documents`, dan `/profile` | LULUS | `tests/e2e/admin-hr-ess-readonly-bridge.e2e.ts`, `tests/e2e/admin-hr-tenant-readonly-smoke.e2e.ts` | - | Baseline ESS dan bundle tenant sinkron |
| UAT-BR-06 | Performance Bridge | Policy kinerja tenant readonly vs editable konsisten di runtime org | LULUS | `tests/e2e/admin-hr-tenant-readonly-smoke.e2e.ts` | - | Tab kinerja admin dan org tenant sinkron |
| UAT-BR-07 | Review 360 Bridge | Baseline review 360 dari admin muncul konsisten di runtime org | BELUM DIUJI | - | - | Belum ada artefak batch 2026-03-22 untuk review 360 |
| UAT-BR-08 | ATS Bridge | Governance ATS admin selaras dengan route `/org/hr/recruitment/*` | LULUS | `tests/e2e/admin-hr-ats-governance-runtime.e2e.ts` | - | Empat route ATS org selaras dengan section governance admin |
| UAT-BR-09 | Tenant Access Bridge | Mode readonly vs editable tenant konsisten antara admin dan org | LULUS | `tests/e2e/admin-hr-tenant-readonly-smoke.e2e.ts`, `tests/e2e/admin-hr-tenant-access-gate.e2e.ts` | - | Readonly bundle dan 4 stage gate tenant HR tervalidasi |

## Command validasi
- `npm run ops:sandbox:doctor:strict`
- `npx playwright test tests/e2e/admin-hr-training-runtime-bridge.e2e.ts tests/e2e/admin-hr-ess-readonly-bridge.e2e.ts tests/e2e/admin-hr-ats-governance-runtime.e2e.ts tests/e2e/admin-hr-tenant-readonly-smoke.e2e.ts --workers=1`
  - hasil final: `6 passed (3.3m)`
- `npx playwright test tests/e2e/admin-hr-tenant-access-gate.e2e.ts --workers=1`
  - hasil final: `4 passed (43.5s)`

## Checklist bukti
- Before/after state dari admin
- Screenshot runtime org sesudah sync
- Hasil command validasi
- Trace atau screenshot failure bila ada
- Bukti sync monitoring

## Bukti tambahan
- Screenshot:
- Link trace:
- Query/cek data:

## Risiko tersisa
- Certification, skill matrix, dan review 360 belum memiliki artefak bridge kanonik pada batch ini.
- Residual Admin Organisasi seperti email gateway nyata, revoke undangan, nonaktifkan pegawai, dan branding tenant masih berada di batch terpisah.

## Tindak lanjut
- Sync batch rekonsiliasi ini ke Monitoring UAT HR.
- Jika dibutuhkan coverage bridge penuh, tambah rerun focused untuk certification, skill matrix, dan review 360.
- Lanjut ke batch residual Admin Organisasi untuk menutup gap rilis HR Admin Org.

## Sinkron monitoring
- Untuk batch ini lebih rapi jika dipecah menjadi beberapa entry logbook:
  - `Training / Skill / Sertifikasi`
  - `ESS`
  - `ATS`
  - `Manajemen Kinerja`
- Jika tetap memakai satu file UAT ini, pastikan ringkasan hasil menjelaskan area mana yang lulus dan mana yang masih perlu retest.
- Command:
  - `npm run uat:sync-monitoring -- --domain=hr --file docs/uat/uat-2026-03-20-hr-bridge-admin-org.md`
- Hasil sync:
  - mode `apply`
  - domain `hr`
  - checklist rows `4`
  - inserts `4`
  - updates `0`

## Sign-off
- Status akhir: siap parsial
- Disetujui oleh:
- Tanggal:
