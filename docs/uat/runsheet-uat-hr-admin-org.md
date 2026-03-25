# Run Sheet Audit UAT HR Admin dan Org

## Tujuan
- Menutup audit governance `/admin/hr/*`.
- Menutup audit runtime `/org/hr/*`.
- Memverifikasi bridge penting dari admin HR ke runtime org HR.
- Memastikan setiap batch memiliki artefak UAT dan sinkron ke Monitoring UAT HR.

## Dasar scope
- Route aktif HR admin dan org: [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx:291)
- Baseline domain HR: [src/lib/uatChecklistDomains.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/lib/uatChecklistDomains.ts:19)
- Aturan sinkron monitoring: [README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/README.md)

## Preflight wajib
1. Pastikan localhost target siap:
   - `npm run ops:sandbox:doctor:strict`
2. Pastikan tester memakai environment:
   - frontend `http://127.0.0.1:5173`
   - database Supabase remote
3. Siapkan akun uji dari `ops/test-accounts.local.json`.
4. Tentukan release version batch:
   - `local-127.0.0.1:5173-hr-uat-YYYY-MM-DD`
   - tambahkan suffix `-rN` untuk retest

## Pembagian tim
### Tester A
- Fokus: `/admin/hr/*`
- Area: governance, audit, error logs, helpdesk, monitoring UAT

### Tester B
- Fokus: `/org/hr/*`
- Area: workspace runtime, visual crawl, ATS, ESS, helpdesk runtime

### Tester C
- Fokus: bridge admin -> org
- Area: readonly vs editable, sinkron policy, retest blocker

## Aturan eksekusi tiap batch
1. Jalankan skenario sesuai batch.
2. Catat hasil ke file `docs/uat/uat-YYYY-MM-DD-hr-<scope>.md`.
   - gunakan [uat-template-hr-admin-org.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/uat/uat-template-hr-admin-org.md)
   - isi juga section `## Log Update yang Sudah Diuji` agar kompatibel dengan sync monitoring
3. Jika ada temuan:
   - jalankan `npm run autofix` bila relevan
   - lanjutkan perbaikan manual
   - retest terarah
   - buat batch retest terpisah bila sudah hijau
4. Sinkronkan ke monitoring:
   - `npm run uat:sync-monitoring -- --domain=hr --file docs/uat/uat-YYYY-MM-DD-hr-<scope>.md`
5. Batch tidak dianggap selesai sebelum monitoring ter-update.

## Batch 1: Governance Superadmin HR
- PIC default: `Tester A`
- Target: memastikan `/admin/hr/*` stabil secara navigasi, heading, alias, guard, dan tata letak dasar

### Route utama
- `/admin/hr`
- `/admin/hr/tenants`
- `/admin/hr/policies`
- `/admin/hr/settings`

### Checklist audit
- [ ] Dashboard HR admin termuat normal.
- [ ] Heading dan summary card tampil.
- [ ] Tidak ada tab/menu ganda.
- [ ] Semua submenu HR tetap di domain HR.
- [ ] Alias lama redirect ke route canonical.
- [ ] Tenants menampilkan summary, tabel, search, reload, dan pagination.
- [ ] Policies menampilkan domain coverage, tenant selector, dan baseline controls.
- [ ] Settings menampilkan baseline cards, coverage map, filter tenant, dan filter status.

### Bukti minimum
- Screenshot dashboard `/admin/hr`
- Screenshot `/admin/hr/tenants`
- Screenshot `/admin/hr/policies`
- Screenshot `/admin/hr/settings`
- Hasil command jika memakai E2E

### Coverage test
- [admin-hr-heading-consistency.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-heading-consistency.e2e.ts)
- [admin-hr-no-duplicate-nav.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-no-duplicate-nav.e2e.ts)
- [admin-hr-menu-route-guard.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-menu-route-guard.e2e.ts)
- [admin-hr-section-alias-redirect.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-section-alias-redirect.e2e.ts)
- [admin-hr-tenants-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-tenants-smoke.e2e.ts)
- [admin-hr-policies-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-policies-smoke.e2e.ts)
- [admin-hr-settings-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-settings-smoke.e2e.ts)

### Mapping monitoring
- `subdomain`: `Tata Kelola Tenant`
- `areaDiuji`: `dashboard, tenants, policies, settings, route guard, alias`
- `status`: `lolos` atau `perlu_tindak_lanjut`

## Batch 2: Observability dan Helpdesk HR Admin
- PIC default: `Tester A`
- Target: memastikan `/admin/hr/audit`, `/admin/hr/error-logs`, dan `/admin/hr/help/*` stabil

### Route utama
- `/admin/hr/audit`
- `/admin/hr/error-logs`
- `/admin/hr/help`
- `/admin/hr/help/faq`
- `/admin/hr/help/support`
- `/admin/hr/help/tickets`
- `/admin/hr/profile`
- `/admin/hr/uat`

### Checklist audit
- [ ] Audit menampilkan summary cards, search, filter tenant, reload, pagination, dan link ke error logs.
- [ ] Error logs menampilkan summary, filter, tab, export, pagination, dan source route.
- [ ] Helpdesk menampilkan metrics, filter tenant, reload, dan navigasi kartu.
- [ ] FAQ menampilkan search, accordion, dan navigasi global.
- [ ] Support menampilkan summary, priority signal, dan playbook.
- [ ] Tickets menampilkan tabel, filter, reload, dan pagination.
- [ ] Profile menampilkan editor, preview, shortcut, dan guide.
- [ ] Monitoring UAT menerima entry logbook batch.

### Bukti minimum
- Screenshot audit
- Screenshot error logs
- Screenshot helpdesk
- Screenshot FAQ
- Screenshot support
- Screenshot tickets
- Screenshot profile
- Bukti monitoring batch masuk

### Coverage test
- [admin-hr-audit-search.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-audit-search.e2e.ts)
- [admin-hr-error-logs-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-error-logs-smoke.e2e.ts)
- [admin-hr-help-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-help-smoke.e2e.ts)
- [admin-hr-faq-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-faq-smoke.e2e.ts)
- [admin-hr-support-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-support-smoke.e2e.ts)
- [admin-hr-tickets-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-tickets-smoke.e2e.ts)
- [admin-hr-profile-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-profile-smoke.e2e.ts)

### Mapping monitoring
- `subdomain`: `Helpdesk / Audit`
- `areaDiuji`: `audit, error logs, helpdesk, faq, support, tickets, profile, monitoring`
- `status`: `lolos` atau `perlu_tindak_lanjut`

## Batch 3: Runtime Workspace `/org/hr`
- PIC default: `Tester B`
- Target: memastikan workspace HR organisasi stabil untuk admin tenant dan guard role berjalan

### Route utama
- `/org/hr`
- `/org/hr/employees`
- `/org/hr/structure`
- `/org/hr/position-grade`
- `/org/hr/contracts`
- `/org/hr/documents`
- `/org/hr/reports`
- `/org/hr/settings`

### Checklist audit
- [ ] Workspace utama termuat.
- [ ] Heading utama dan quick actions tampil.
- [ ] Halaman inti punya heading valid.
- [ ] Settings menampilkan area kerja HR dan matriks kebutuhan.
- [ ] Employee dan operator tidak bisa masuk ke route sensitif.
- [ ] Search spesial pada contracts tidak merusak halaman.
- [ ] Visual crawl tidak menemukan 404, heading hilang, redirect tak semestinya, atau overlap menu/tab.

### Bukti minimum
- Screenshot `/org/hr`
- Screenshot `/org/hr/settings`
- Screenshot `/org/hr/contracts`
- Rekap visual crawl

### Coverage test
- [org-hr-workspace-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/org-hr-workspace-smoke.e2e.ts)
- [org-hr-visual-crawl.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/org-hr-visual-crawl.e2e.ts)

### Mapping monitoring
- `subdomain`: `Manajemen Karyawan`
- `areaDiuji`: `workspace utama, employees, structure, contracts, reports, settings, route guard, visual crawl`
- `status`: `lolos` atau `perlu_tindak_lanjut`

## Batch 4: Runtime ATS, ESS, dan Helpdesk `/org/hr`
- PIC default: `Tester B`
- Target: memastikan modul runtime org HR yang paling user-facing stabil

### Route utama
- `/org/hr/recruitment/jobs`
- `/org/hr/recruitment/candidates`
- `/org/hr/recruitment/interviews`
- `/org/hr/recruitment/offers`
- `/org/hr/ess/requests`
- `/org/hr/ess/attendance`
- `/org/hr/ess/documents`
- `/org/hr/ess/profile`
- `/org/hr/help/faq`
- `/org/hr/help/tickets`
- `/org/hr/help/error-logs`

### Checklist audit
- [ ] Empat halaman ATS readonly stabil dibuka.
- [ ] Jika writable, CRUD ATS create/edit stabil.
- [ ] Jika readonly, fallback ATS tetap aman.
- [ ] ESS requests, attendance, documents, dan profile terbuka sesuai policy.
- [ ] Tiket HR role matrix berjalan untuk admin vs operator.
- [ ] FAQ dan helpdesk runtime termuat tanpa 404 atau redirect aneh.

### Bukti minimum
- Screenshot jobs
- Screenshot interviews
- Screenshot ESS requests
- Screenshot tickets HR
- Bukti role matrix operator dan admin

### Coverage test
- [org-hr-ats-readonly-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/org-hr-ats-readonly-smoke.e2e.ts)
- [org-hr-ats-crud.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/org-hr-ats-crud.e2e.ts)
- [org-hr-ticket-role-matrix.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/org-hr-ticket-role-matrix.e2e.ts)

### Mapping monitoring
- Gunakan dua entry jika memungkinkan:
- `subdomain`: `ATS`
- `areaDiuji`: `jobs, candidates, interviews, offers, readonly/crud`
- `subdomain`: `ESS`
- `areaDiuji`: `requests, attendance, documents, profile`
- Atau gabungkan helpdesk runtime ke `Helpdesk / Audit`

## Batch 5: Bridge Admin HR -> Org HR
- PIC default: `Tester C`
- Jika hanya ada dua tester, batch ini dikerjakan setelah Batch 1-4 selesai
- Target: memastikan policy dan baseline di `/admin/hr` memengaruhi runtime `/org/hr`

### Bridge wajib
- `/admin/hr` training -> `/org/hr/training-data`
- `/admin/hr` certification -> `/org/hr/certifications`
- `/admin/hr` skill matrix -> `/org/hr/skill-matrix`
- `/admin/hr` ESS baseline -> `/org/hr/ess/*`
- `/admin/hr` performance/review 360 -> runtime org
- `/admin/hr` ATS governance -> `/org/hr/recruitment/*`
- Readonly vs editable tenant konsisten

### Acceptance minimal
- [ ] Minimal 1 bridge utama lolos untuk gate UAT

### Target ideal
- [ ] Training lolos
- [ ] ESS lolos
- [ ] ATS lolos

### Bukti minimum
- Before/after state dari admin
- Screenshot runtime org sesudah sync
- `trace_id` atau `Ref ID` jika gagal
- Command rerun focused

### Coverage test
- [admin-hr-training-runtime-bridge.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-training-runtime-bridge.e2e.ts)
- [admin-hr-certification-runtime-bridge.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-certification-runtime-bridge.e2e.ts)
- [admin-hr-skill-runtime-bridge.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-skill-runtime-bridge.e2e.ts)
- [admin-hr-ess-runtime-bridge.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-ess-runtime-bridge.e2e.ts)
- [admin-hr-review360-runtime-bridge.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-review360-runtime-bridge.e2e.ts)
- [admin-hr-performance-readonly-bridge.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-performance-readonly-bridge.e2e.ts)
- [admin-hr-ats-governance-runtime.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-ats-governance-runtime.e2e.ts)
- [admin-hr-tenant-readonly-smoke.e2e.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/tests/e2e/admin-hr-tenant-readonly-smoke.e2e.ts)

### Mapping monitoring
- `subdomain`: `Training / Skill / Sertifikasi`
- `subdomain`: `ESS`
- `subdomain`: `ATS`
- `subdomain`: `Manajemen Kinerja`
- Untuk batch ini lebih baik dipecah menjadi 2-3 entry logbook, bukan satu entry besar

## Bukti yang wajib dicatat
- File UAT utama di `docs/uat/uat-YYYY-MM-DD-hr-<scope>.md`
- Screenshot route inti
- Command validasi yang dipakai
- Hasil pass/fail per skenario
- `Ref ID` frontend atau `trace_id` backend bila gagal
- Status akhir:
  - `siap`
  - `siap dengan catatan`
  - `belum siap`

## Kriteria lulus cepat
- Batch hanya boleh ditandai `lolos` jika semua skenario wajib di batch tersebut hijau.
- Batch bridge hanya boleh ditandai `lolos` jika minimal satu bridge utama benar-benar tervalidasi.
- Monitoring UAT harus sudah menerima entry logbook batch terakhir.

## Kriteria berhenti dan catat blocker
- Ada route 404 atau redirect salah domain.
- Heading atau komponen utama tidak muncul.
- Sync admin -> org tidak konsisten.
- Tidak ada `Ref ID` atau `trace_id` saat terjadi failure yang seharusnya terlacak.
- Monitoring UAT belum bisa menerima batch yang sudah diuji.

## Format entry Monitoring UAT HR
### Field wajib
- `tanggal`
- `releaseVersion`
- `update`
- `tester`
- `subdomain`
- `areaDiuji`
- `ringkasanHasil`
- `referensi`

### Format yang disarankan
- `releaseVersion`: `local-127.0.0.1:5173-hr-uat-YYYY-MM-DD[-rN]`
- `update`: nama batch singkat
- `ringkasanHasil`: `7/7 lulus, siap` atau `5/7 lolos, perlu tindak lanjut`
- `referensi`: path file UAT di `docs/uat`

### Format baris log yang kompatibel dengan sync
Gunakan table berikut di file UAT:

| Tanggal | Update | Area diuji | Ringkasan hasil | Referensi |
|---|---|---|---|---|
| 2026-03-20 | UAT HR governance superadmin | dashboard, tenants, policies, settings, route guard, alias | `7/7` lulus, siap | `docs/uat/uat-2026-03-20-hr-governance-superadmin.md` |

### Contoh mapping batch
- Batch 1 -> `Tata Kelola Tenant`
- Batch 2 -> `Helpdesk / Audit`
- Batch 3 -> `Manajemen Karyawan`
- Batch 4 -> `ATS` dan `ESS`
- Batch 5 -> `Training / Skill / Sertifikasi`, `ESS`, `ATS`, `Manajemen Kinerja`

## Prioritas eksekusi
### P0
- Batch 1
- Batch 2
- Batch 3
- Minimal bagian inti Batch 5: training atau ESS atau ATS bridge

### P1
- Batch 4 penuh
- Batch 5 penuh
- CRUD runtime yang write-ready

### P2
- Visual crawl tambahan semua submenu non-inti
- Skenario backend-driven yang masih `skipped`

## Acceptance criteria UAT HR
- [ ] Semua batch P0 selesai
- [ ] `/admin/hr` governance stabil
- [ ] `/org/hr` workspace inti stabil
- [ ] Minimal satu bridge admin -> org lolos
- [ ] Semua temuan gagal punya bukti
- [ ] Semua batch yang diuji sudah masuk ke Monitoring UAT HR
- [ ] Batch gagal dan batch retest lulus dicatat terpisah

## Penutupan batch
- Buat `sign-off-YYYY-MM-DD-hr-<scope>.md` jika batch final ditutup
- Buat `go-no-go-YYYY-MM-DD-hr-<scope>.md` jika perlu keputusan singkat stakeholder
