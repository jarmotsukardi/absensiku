# UAT HR Admin End-to-End

## Metadata
- Tanggal: 2026-03-20
- Scope: UAT domain HR end-to-end untuk governance `/admin/hr/*` dan bridge penting ke runtime `/org/hr/*`
- Environment: Localhost `http://127.0.0.1:5173` dengan Supabase remote
- Device / Browser: Playwright Chromium desktop
- Build / Versi: `local-127.0.0.1:5173-hr-uat-2026-03-20`
- Penguji: Codex

## Data uji
- Tenant: tenant aktif dari akun `org_admin` pada `ops/test-accounts.local.json`
- Admin: role `superadmin` dari `ops/test-accounts.local.json`
- Pegawai: tidak dipakai pada batch ini
- Email gateway: tidak diverifikasi pada batch ini
- Catatan data:
  - preflight `npm run ops:sandbox:doctor:strict` lulus
  - localhost `127.0.0.1:5173` merespons `HTTP/1.1 200 OK`
  - batch governance dijalankan dengan Playwright read-only
  - bridge diuji terpisah untuk memisahkan regresi governance vs runtime org

## Ringkasan hasil
- Total skenario diuji: 28
- Lulus: 18
- Gagal: 10
- Verdict: belum siap

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-01 | Preflight | Localhost doctor dan Chromium launch siap dipakai untuk UAT | LULUS | `npm run ops:sandbox:doctor:strict` menghasilkan status `SIAP` | - | HTTP localhost dan Chromium dapat diakses |
| UAT-02 | Route guard HR | Semua link menu/submenu HR superadmin tetap di domain HR | LULUS | `tests/e2e/admin-hr-menu-route-guard.e2e.ts` | - | 1/1 lulus |
| UAT-03 | Navigasi HR | Halaman `/admin/hr` tidak menampilkan tab navigasi ganda | LULUS | `tests/e2e/admin-hr-no-duplicate-nav.e2e.ts` | - | 1/1 lulus |
| UAT-04 | Alias route HR | Route alias lama redirect ke canonical route yang benar | LULUS | `tests/e2e/admin-hr-section-alias-redirect.e2e.ts` | - | 1/1 lulus |
| UAT-05 | Tenant HR | Kartu ringkasan dan tabel tenant tampil stabil | LULUS | `tests/e2e/admin-hr-tenants-smoke.e2e.ts` | - | 4/4 skenario tenant lulus |
| UAT-06 | Kebijakan HR | Ringkasan domain, tenant panel, link audit, dan guide kebijakan stabil | LULUS | `tests/e2e/admin-hr-policies-smoke.e2e.ts` | - | 4/4 skenario policies lulus |
| UAT-07 | Settings HR | Coverage map, filter tenant/status, link kontrol admin, dan guide settings stabil | LULUS | `tests/e2e/admin-hr-settings-smoke.e2e.ts` | - | 4/4 skenario settings lulus |
| UAT-08 | Tiket HR | Ringkasan tiket, tabel, filter, reload, pagination, dan navigasi support stabil | LULUS | `tests/e2e/admin-hr-tickets-smoke.e2e.ts` | - | 3/3 skenario tickets lulus |
| UAT-09 | Heading admin HR | Heading utama `/admin/hr` konsisten dengan kontrak lama `Ringkasan Platform HR` | GAGAL | `tests/e2e/admin-hr-heading-consistency.e2e.ts`; `test-results/admin-hr-heading-consisten-11b53-n-hr-konsisten-dengan-route/trace.zip` | - | Heading kontrak lama tidak ditemukan pada route `/admin/hr` |
| UAT-10 | Audit HR | Drilldown `Kontrak Segera Berakhir` menampilkan baris atau empty state yang valid | GAGAL | `tests/e2e/admin-hr-audit-search.e2e.ts`; `test-results/admin-hr-audit-search.e2e.-1c05c--tanpa-service-role-fixture/trace.zip` | - | `tbody tr` pertama pada drilldown tidak ditemukan |
| UAT-11 | Error Logs HR | Kartu metrik `Kritis Terbuka` dan tabel utama tampil sesuai kontrak | GAGAL | `tests/e2e/admin-hr-error-logs-smoke.e2e.ts`; `test-results/admin-hr-error-logs-smoke.-96e86-n-tabel-utama-tampil-stabil/trace.zip` | - | Metrik `Kritis Terbuka` dengan catatan `Belum resolved dan belum diarsipkan.` tidak ditemukan |
| UAT-12 | Helpdesk HR | Heading dan ringkasan `/admin/hr/help` tampil sesuai kontrak `Pusat Bantuan Platform HR` | GAGAL | `tests/e2e/admin-hr-help-smoke.e2e.ts`; `test-results/admin-hr-help-smoke.e2e.ts-e4720-artu-navigasi-tampil-stabil/trace.zip` | - | Heading kontrak lama tidak ditemukan |
| UAT-13 | FAQ HR | Heading dan panel FAQ `/admin/hr/help/faq` tampil sesuai kontrak `FAQ Platform HR` | GAGAL | `tests/e2e/admin-hr-faq-smoke.e2e.ts`; `test-results/admin-hr-faq-smoke.e2e.ts--a9de1-dan-panel-FAQ-tampil-stabil/trace.zip` | - | Heading kontrak lama tidak ditemukan |
| UAT-14 | Support HR | Heading dan ringkasan `/admin/hr/help/support` tampil sesuai kontrak `Dukungan Global HR` | GAGAL | `tests/e2e/admin-hr-support-smoke.e2e.ts`; `test-results/admin-hr-support-smoke.e2e-dbb3b--dan-playbook-tampil-stabil/trace.zip` | - | Heading kontrak lama tidak ditemukan |
| UAT-15 | Profil HR Admin | Heading `Editor Profil Workspace HR`, preview, dan shortcut tampil stabil | GAGAL | `tests/e2e/admin-hr-profile-smoke.e2e.ts`; `test-results/admin-hr-profile-smoke.e2e-58c9f--dan-shortcut-tampil-stabil/trace.zip` | - | Heading editor profil tidak ditemukan |
| UAT-16 | Bridge org HR | CRUD training dari admin muncul ke `/org/hr/training-data` lalu bisa dibersihkan | GAGAL | `tests/e2e/admin-hr-training-runtime-bridge.e2e.ts`; `test-results/admin-hr-training-runtime--69449-untime-org-lalu-dibersihkan/trace.zip` | - | Heading `Data Pelatihan` di runtime org tidak ditemukan |
| UAT-17 | Bridge org HR | Baseline ESS admin terbaca konsisten di `/org/hr/ess/*` | GAGAL | `tests/e2e/admin-hr-ess-readonly-bridge.e2e.ts`; `test-results/admin-hr-ess-readonly-brid-89970-ca-konsisten-di-runtime-org/trace.zip` | - | Heading `Pengajuan ESS` di runtime org tidak ditemukan |
| UAT-18 | Bridge org HR | Governance ATS admin selaras dengan route ATS org | GAGAL | `tests/e2e/admin-hr-ats-governance-runtime.e2e.ts`; `test-results/admin-hr-ats-governance-ru-5de64--dengan-empat-route-ATS-org/trace.zip` | - | Deskripsi governance ATS yang diharapkan test tidak ditemukan |

## Ringkasan eksekusi
- Batch governance admin HR:
  - Command: `npx playwright test tests/e2e/admin-hr-heading-consistency.e2e.ts tests/e2e/admin-hr-no-duplicate-nav.e2e.ts tests/e2e/admin-hr-menu-route-guard.e2e.ts tests/e2e/admin-hr-section-alias-redirect.e2e.ts tests/e2e/admin-hr-tenants-smoke.e2e.ts tests/e2e/admin-hr-policies-smoke.e2e.ts tests/e2e/admin-hr-settings-smoke.e2e.ts tests/e2e/admin-hr-audit-search.e2e.ts tests/e2e/admin-hr-error-logs-smoke.e2e.ts tests/e2e/admin-hr-help-smoke.e2e.ts tests/e2e/admin-hr-faq-smoke.e2e.ts tests/e2e/admin-hr-support-smoke.e2e.ts tests/e2e/admin-hr-tickets-smoke.e2e.ts tests/e2e/admin-hr-profile-smoke.e2e.ts --workers=4`
  - Hasil efektif: 18 lulus, 7 gagal, 17 skenario lain di file yang gagal tidak dieksekusi setelah failure pertama
- Retest terarah file merah:
  - Command: `npx playwright test tests/e2e/admin-hr-heading-consistency.e2e.ts tests/e2e/admin-hr-faq-smoke.e2e.ts tests/e2e/admin-hr-help-smoke.e2e.ts tests/e2e/admin-hr-support-smoke.e2e.ts tests/e2e/admin-hr-profile-smoke.e2e.ts tests/e2e/admin-hr-audit-search.e2e.ts tests/e2e/admin-hr-error-logs-smoke.e2e.ts --workers=1`
  - Hasil: 7 gagal, 17 tidak jalan
- Bridge runtime org:
  - `npx playwright test tests/e2e/admin-hr-training-runtime-bridge.e2e.ts --workers=1`
  - `npx playwright test tests/e2e/admin-hr-ess-readonly-bridge.e2e.ts --workers=1`
  - `npx playwright test tests/e2e/admin-hr-ats-governance-runtime.e2e.ts --workers=1`
  - Hasil: 3 gagal

## Risiko tersisa
- Kontrak heading beberapa halaman admin HR tampak drift dari ekspektasi suite E2E.
- Audit dan error logs HR menunjukkan drift pada metric card atau struktur tabel.
- Tidak ada satu pun bridge admin -> org HR yang lolos pada batch ini, sehingga acceptance criteria end-to-end belum terpenuhi.
- Karena failure terjadi pada skenario pertama beberapa file smoke, coverage manual untuk skenario lanjutan `help/faq/support/profile/audit/error-logs` masih tertahan.

## Tindak lanjut
- Sinkronkan kontrak heading pada `/admin/hr`, `/admin/hr/help`, `/admin/hr/help/faq`, `/admin/hr/help/support`, dan `/admin/hr/profile`.
- Cek ulang contract metric card dan struktur tabel pada `/admin/hr/error-logs` dan `/admin/hr/audit`.
- Investigasi route runtime org untuk `/org/hr/training-data` dan `/org/hr/ess/requests` karena heading yang diharapkan tidak muncul.
- Setelah perbaikan, rerun minimal:
  - `tests/e2e/admin-hr-heading-consistency.e2e.ts`
  - `tests/e2e/admin-hr-help-smoke.e2e.ts`
  - `tests/e2e/admin-hr-faq-smoke.e2e.ts`
  - `tests/e2e/admin-hr-support-smoke.e2e.ts`
  - `tests/e2e/admin-hr-profile-smoke.e2e.ts`
  - `tests/e2e/admin-hr-audit-search.e2e.ts`
  - `tests/e2e/admin-hr-error-logs-smoke.e2e.ts`
  - satu bridge admin -> org HR yang dipilih sebagai gate rilis

## Sign-off
- Status akhir: belum siap
- Disetujui oleh: belum diisi
- Tanggal: belum diisi
