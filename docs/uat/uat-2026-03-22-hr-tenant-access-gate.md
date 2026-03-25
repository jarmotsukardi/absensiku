# UAT Gate Akses HR Tenant Org

## Log Update yang Sudah Diuji
Gunakan section ini untuk sync ke Monitoring UAT HR setelah batch benar-benar dijalankan.

| Tanggal | Update | Area diuji | Ringkasan hasil | Referensi |
|---|---|---|---|---|
| 2026-03-22 | UAT gate akses tenant HR org | `setup_required`, `attendance_active`, `payment_committed`, `paid_active`, role guard | `9/9` lulus, siap untuk domain HR | `docs/uat/uat-2026-03-22-hr-tenant-access-gate.md` |

## Metadata
- Tanggal: 2026-03-22
- Scope: gate akses tenant HR untuk admin organisasi, operator/atasan, dan pegawai pada workspace `/org/hr`
- Environment: Localhost `http://127.0.0.1:5173` dengan Supabase remote
- Device / Browser: Playwright Chromium desktop
- Build / Versi: `local-127.0.0.1:5173-hr-uat-2026-03-22`
- Penguji: Codex
- Release version: `local-127.0.0.1:5173-hr-uat-2026-03-22`

## Data uji
- Tenant `setup_required`: `Pengajian Al-Akbar` (`org_admin`)
- Tenant `attendance_active`, `payment_committed`, `paid_active`: `Kab. Maluku Tengah` (`org_admin_centralized`)
- Admin: role `org_admin` dan `org_admin_centralized`
- Operator: role `org_operator`
- Pegawai: role `employee`
- Catatan data:
  - state akses tenant dimutasi sementara via service-role lalu direstore setelah tiap skenario
  - policy yang diuji hanya domain HR; Payroll sengaja tidak disentuh pada batch ini
  - navigasi editable dari `/org/hr/settings` memakai pola overlay `hr_overlay`, bukan redirect penuh route organisasi

## Ringkasan hasil
- Total skenario diuji: 9
- Lulus: 9
- Gagal: 0
- Skip: 0
- Verdict: siap untuk domain HR

## Mapping monitoring
- Domain: `hr`
- Subdomain: `Akses Tenant / Role Guard`
- Area diuji: `setup_required, attendance_active, payment_committed, paid_active, role guard`
- Status logbook: `lolos`
- Referensi monitoring: sync `uat:sync-monitoring` berhasil `1 insert`

## Hasil UAT
| ID | Modul | Skenario | Hasil | Bukti | Ref ID / trace_id | Catatan |
|---|---|---|---|---|---|---|
| UAT-GT-01 | Preflight | `ops:sandbox:doctor:strict` lulus dan localhost siap dipakai | LULUS | `npm run ops:sandbox:doctor:strict` | - | HTTP dan Playwright siap dipakai |
| UAT-GT-02 | Gate HR | Tenant `setup_required` menolak akses admin ke `/org/hr` dan menampilkan alasan readiness | LULUS | `tests/e2e/admin-hr-tenant-access-gate.e2e.ts` | - | CTA `Buka Billing` dan alasan `Menunggu Readiness Absensi` tampil |
| UAT-GT-03 | Gate HR | Tenant `attendance_active` menampilkan banner `HR Read Only`, CTA komitmen pembayaran, dan menahan aksi konten | LULUS | `tests/e2e/admin-hr-tenant-access-gate.e2e.ts` | - | Bug capability readonly ditutup di `src/lib/hrPageAccess.ts` |
| UAT-GT-04 | Gate HR | Tenant `payment_committed` membuka HR editable penuh tanpa banner readonly | LULUS | `tests/e2e/admin-hr-tenant-access-gate.e2e.ts` | - | Navigasi `Buka Struktur` tervalidasi melalui overlay `hr_overlay` |
| UAT-GT-05 | Gate HR | Tenant `paid_active` tetap editable penuh saat langganan aktif | LULUS | `tests/e2e/admin-hr-tenant-access-gate.e2e.ts` | - | Dialog `Tambah Program Pelatihan` dapat dibuka |
| UAT-GT-06 | Role Guard HR | Admin organisasi dapat membuka workspace HR utama | LULUS | `tests/e2e/org-hr-workspace-smoke.e2e.ts` | - | Heading workspace dan quick action tampil stabil |
| UAT-GT-07 | Role Guard HR | Halaman `Contracts` HR tetap stabil dengan keyword spesial | LULUS | `tests/e2e/org-hr-workspace-smoke.e2e.ts` | - | Search `'kontrak, aktif() % test` aman |
| UAT-GT-08 | Role Guard HR | Pegawai tidak bisa menetap di `HR Settings` maupun workspace Payroll sensitif | LULUS | `tests/e2e/org-hr-workspace-smoke.e2e.ts` | - | Guard akses konsisten untuk role `pegawai` |
| UAT-GT-09 | Role Guard HR | Operator/atasan tidak bisa menetap di workspace HR/Payroll sensitif | LULUS | `tests/e2e/org-hr-workspace-smoke.e2e.ts` | - | Guard akses konsisten untuk role `org_operator` |

## Command validasi
- `npm run ops:sandbox:doctor:strict`
- `npx playwright test tests/e2e/admin-hr-tenant-access-gate.e2e.ts --workers=1`
  - hasil final: `4 passed (43.5s)`
- `npx playwright test tests/e2e/org-hr-workspace-smoke.e2e.ts --workers=1`
  - hasil final: `5 passed (1.3m)`
- `npx vitest run src/lib/hrPageAccess.test.ts`
  - hasil final: `3 passed`

## Checklist bukti
- Screenshot `setup_required`
- Screenshot banner `HR Read Only`
- Screenshot overlay `Struktur Organisasi`
- Screenshot dialog `Tambah Program Pelatihan`
- Bukti guard role `pegawai` dan `operator`
- Bukti sync monitoring

## Bukti tambahan
- Screenshot:
- Link trace:
- Query/cek data:

## Risiko tersisa
- Item checklist yang masih menggabungkan HR dan Payroll baru bersih pada sisi HR; batch Payroll tetap di luar scope.
- Batch ini belum menutup residual Admin Organisasi seperti email gateway nyata, revoke undangan, nonaktifkan pegawai, dan branding tenant.

## Tindak lanjut
- Sync batch ini ke Monitoring UAT HR.
- Lanjut ke residual Admin Organisasi untuk menutup item checklist yang masih `Belum diuji`.
- Pertahankan unit test `src/lib/hrPageAccess.test.ts` saat ada perubahan policy akses tenant berikutnya.

## Sinkron monitoring
- Command:
  - `npm run uat:sync-monitoring -- --domain=hr --file docs/uat/uat-2026-03-22-hr-tenant-access-gate.md`
- Hasil sync:
  - mode `apply`
  - domain `hr`
  - checklist rows `1`
  - inserts `1`
  - updates `0`

## Sign-off
- Status akhir: siap untuk domain HR
- Disetujui oleh:
- Tanggal:
