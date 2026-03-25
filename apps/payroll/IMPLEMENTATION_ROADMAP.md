# Roadmap Implementasi HR-Payroll (Blueprint Historis)

Roadmap Payroll tetap disimpan di repo ini untuk pengembangan lanjutan.

Catatan status:
- Dokumen ini adalah roadmap blueprint, bukan indikator status eksekusi harian.
- Status aktual harus mengikuti `AGENTS.md`, dokumen operasional utama, dan arahan user pada turn aktif.

## Fase 1 (Fondasi)
- Buat skema master payroll + periode.
- Buat UI menu fase 1.
- Buat policy RBAC payroll minimal.
- Buat audit log dasar untuk create/update/delete.

## Fase 2 (Mesin Payroll)
- Implement input variabel bulanan.
- Implement validasi pre-run.
- Implement payroll run engine + snapshot hasil hitung.
- Implement approval berlapis.

## Fase 3 (Distribusi & Monitoring)
- Slip gaji PDF + publish ke employee portal.
- Pembayaran & rekonsiliasi.
- Laporan payroll utama.
- Audit log lanjutan dan monitoring anomali.

## Fase 4 (Enterprise Hardening)
- Pajak/kepatuhan lanjutan.
- Role granular per aksi.
- Integrasi API eksternal.

## Quality Gate per fase
- Low risk: lint file terkait.
- Medium risk: lint + test terdampak.
- Critical (payroll run/approval/payment): lint + test + build.
