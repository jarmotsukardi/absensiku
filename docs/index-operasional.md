# Index Operasional Repo

Dokumen ini menjadi pintu masuk cepat ke panduan operasional utama repo `ABSENSIKU`.

Konteks aktif:
- fokus harian tetap aplikasi absensi
- HR dan Payroll masih berada di repo yang sama; HR aktif sebagai domain lanjutan, sedangkan Payroll bukan prioritas default
- database sumber kebenaran tetap `Supabase remote`

## Dokumen Inti

- [AGENTS.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/AGENTS.md)
  aturan operasional utama repo, termasuk guard DB, workflow cepat, quality gate, dan FAQ offer
- [docs/bundle-onboarding-final.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/bundle-onboarding-final.md)
  pintu masuk paling singkat untuk memahami repo, command harian, watchlist sensitif, dan jalur kerja aman
- [docs/onboarding-developer-baru.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-developer-baru.md)
  onboarding cepat untuk developer baru: setup env, command lokal, auth, DB remote, dan kebiasaan kerja aman
- [docs/onboarding-frontend.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-frontend.md)
  onboarding jalur frontend: workflow dev, auth parity, file anchor, dan checklist kerja UI
- [docs/onboarding-backend-supabase.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-backend-supabase.md)
  onboarding jalur backend dan Supabase: env penting, backup, migration, dan command sensitif
- [docs/onboarding-operator-release.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/onboarding-operator-release.md)
  onboarding jalur operator/release: readiness, QA, memory, FAQ, dan hygiene release
- [docs/checklist-harian-per-role.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/checklist-harian-per-role.md)
  checklist harian ringkas untuk frontend, backend/Supabase, dan operator/release
- [docs/decision-tree-command-lokal.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/decision-tree-command-lokal.md)
  panduan cepat memilih `dev`, `dev:mobile-api`, atau `dev:parity`
- [docs/decision-tree-test-e2e.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/decision-tree-test-e2e.md)
  panduan memilih validasi, smoke, build, dan E2E sesuai risiko perubahan
- [docs/template-intake-task-per-role.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/template-intake-task-per-role.md)
  template intake singkat per role agar scope, command, dan validasi lebih terkontrol
- [docs/cheatsheet-tool-per-task.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/cheatsheet-tool-per-task.md)
  cheatsheet ringkas untuk memilih tool dan pola kerja per jenis task di repo ini
- [docs/sop-per-role.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/sop-per-role.md)
  SOP ringkas per role: frontend, backend, Android, operator/release, dan dokumentasi
- [docs/cheatsheet-deploy-release.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/cheatsheet-deploy-release.md)
  checklist ringkas sebelum push, deploy, dan release
- [docs/cheatsheet-audit-route-auth.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/cheatsheet-audit-route-auth.md)
  panduan audit route dan auth khusus untuk area utama ABSENSIKU
- [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md)
  quickstart command harian untuk readiness, memory, QA, dan E2E
- [ops/attendance-security-rollout-checklist.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/attendance-security-rollout-checklist.md)
  checklist operator untuk rollout policy keamanan absensi, device binding, blok browser, dan smoke test pasca-aktivasi
- [docs/runbook-attendance-security-rollout.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/runbook-attendance-security-rollout.md)
  runbook operator-ready untuk cutover policy absensi berbasis APK/WebView, Safari iPhone, device binding, dan rollback
- [docs/attendance-security-help.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/attendance-security-help.md)
  naskah bantuan formal untuk menjelaskan device binding, blok browser, fallback iPhone Safari, dan kendala umum user
- [docs/policy-akses-employee-login-client.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/policy-akses-employee-login-client.md)
  policy konkret untuk membedakan akses `/employee/login` dan hak absensi berdasarkan APK Android resmi, Safari iPhone, browser Android biasa, dan desktop
- [docs/kebijakan-trial-aktivasi-awal-billing.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/kebijakan-trial-aktivasi-awal-billing.md)
  kebijakan final hubungan trial, streak monitoring, aktivasi awal, dan bundle Absensi/HR/Payroll
- [docs/kriteria-trial-serius-vs-coba-coba.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/kriteria-trial-serius-vs-coba-coba.md)
  kriteria operasional untuk membaca tenant trial yang serius, pasif, siap ditagih, atau hanya mencoba-coba
- [docs/keputusan-operasional-peak-hour-buffering.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/keputusan-operasional-peak-hour-buffering.md)
  keputusan operasional singkat untuk mode simpan lokal saat jam sibuk, off-peak sync, status UX, logout, dan dashboard admin
- [docs/audit-menu-skalabilitas.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/audit-menu-skalabilitas.md)
  audit khusus menu `Skalabilitas`: mana yang sudah nyata, mana yang masih pseudo-setting, dan arah menjadikannya control plane operasional
- [docs/desain-autoscale-bertahap-absensi.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/desain-autoscale-bertahap-absensi.md)
  desain konkret autoscale bertahap untuk absensi: ambang tier, hysteresis, field policy, dan perubahan perilaku frontend/backend
- [docs/schema-attendance-scalability-final.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/schema-attendance-scalability-final.md)
  bentuk final object `attendance_scalability` yang disarankan agar frontend dan backend membaca policy yang sama
- [docs/plan-implementasi-autoscale-absensi.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/plan-implementasi-autoscale-absensi.md)
  rencana implementasi bertahap autoscale absensi dari schema, backend policy, evaluator, hingga UI admin dan runtime pegawai
- [ops/attendance-security-operator-replies.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/attendance-security-operator-replies.md)
  jawaban cepat operator untuk komplain user terkait absensi, perangkat berbeda, browser desktop, dan reset device
- [docs/workflow-aman-workspace-dirty.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/workflow-aman-workspace-dirty.md)
  panduan kerja aman di workspace lokal yang sedang dirty

## Dokumen MCP

- [docs/mcp-recommended-stack.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/mcp-recommended-stack.md)
  rekomendasi stack MCP minimal, ideal, dan target setup repo
- [docs/mcp-ops-policy.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/mcp-ops-policy.md)
  policy akses MCP, terutama read-only vs explicit-only
- [docs/mcp-availability-2026-03-14.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/mcp-availability-2026-03-14.md)
  audit MCP yang benar-benar tersedia di sesi kerja saat ini
- [docs/mcp-faq-shortlist-2026-03-14.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/mcp-faq-shortlist-2026-03-14.md)
  shortlist FAQ draft untuk SOP agent dan guard operasional

## Dokumen DB dan Backup

- [docs/desain-backup-full-supabase.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/desain-backup-full-supabase.md)
  konteks backup dan restore Supabase
- [docs/preflight-30detik-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/preflight-30detik-payroll-remote-2026-03-12.md)
  preflight singkat untuk pekerjaan remote yang sensitif
- [docs/sql-verifikasi-pasca-migration-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/sql-verifikasi-pasca-migration-payroll-remote-2026-03-12.md)
  referensi verifikasi pasca migration
- [ops/sql/payroll-permission-risk-audit.sql](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/sql/payroll-permission-risk-audit.sql)
  query SQL read-only untuk audit tenant payroll `strict` yang masih punya admin aktif tetapi assignment payroll kosong

## Dokumen HR yang Sering Dirujuk

- [docs/panduan_membangun_hr.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/panduan_membangun_hr.md)
  panduan dan status besar domain HR
- [docs/hr-to-payroll-readiness.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-to-payroll-readiness.md)
  gate operasional untuk menilai apakah fondasi HR sudah siap disambungkan ke payroll
- [docs/hr-payroll-ready-fields.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-ready-fields.md)
  checklist field minimum yang harus cukup lengkap sebelum HR dipakai sebagai dasar payroll
- [docs/hr-payroll-readiness-execution-plan.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-readiness-execution-plan.md)
  daftar kerja konkret untuk menutup gap readiness HR sebelum payroll dibuka
- [docs/hr-payroll-readiness-review-template.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-readiness-review-template.md)
  template review per tenant untuk memutuskan status `ready / partial / blocked` sebelum payroll
- [docs/hr-completion-checklist-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-completion-checklist-2026-03-12.md)
  checklist penyelesaian HR
- [docs/archive/2026-03-historical/final-audit-report-hr-100-percent.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/archive/2026-03-historical/final-audit-report-hr-100-percent.md)
  audit akhir HR yang tetap disimpan sebagai referensi historis

## Arsip Historis

- [docs/archive/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/archive/README.md)
  pintu masuk arsip dokumen historis dan manual dated
- [docs/archive/2026-03-historical/HR-STATUS-FINAL-SUMMARY.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/archive/2026-03-historical/HR-STATUS-FINAL-SUMMARY.md)
  status historis HR yang disimpan untuk jejak keputusan
- [docs/archive/manuals-kab-maluku-tengah-2026-03-16](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/archive/manuals-kab-maluku-tengah-2026-03-16)
  bundel manual HR/Payroll dated yang tidak lagi menjadi dokumen operasional utama
- [docs/archive/public-deliverables](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/archive/public-deliverables)
  salinan dokumen publik; untuk runtime user tetap gunakan aset di `public/tutorials`

## Ringkasan Praktis

- mulai dari `docs/onboarding-developer-baru.md`, lalu `AGENTS.md` dan `ops/README.md`
- untuk MCP, baca `mcp-recommended-stack` lalu `mcp-ops-policy`
- untuk kerja di workspace dirty, baca `workflow-aman-workspace-dirty`
- untuk task yang menyentuh DB remote, pastikan backup dan verifikasi mengikuti dokumen terkait
