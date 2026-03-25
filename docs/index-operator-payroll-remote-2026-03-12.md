# Index Operator Payroll Remote

Pakai file ini sebagai pintu masuk utama untuk semua dokumen sinkronisasi payroll remote.

## Urutan Pakai

1. [preflight-30detik-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/preflight-30detik-payroll-remote-2026-03-12.md:1)
2. [template-env-operator-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/template-env-operator-payroll-remote-2026-03-12.md:1)
3. [runbook-final-sinkronisasi-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/runbook-final-sinkronisasi-payroll-remote-2026-03-12.md:1)
4. [sql-verifikasi-pasca-migration-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/sql-verifikasi-pasca-migration-payroll-remote-2026-03-12.md:1)

## Fungsi Tiap Dokumen

- `preflight-30detik`: cek cepat sebelum operator menekan enter
- `template-env-operator`: field env minimal yang harus disiapkan
- `runbook-final`: langkah eksekusi utama, expected result, dan stop condition
- `sql-verifikasi`: query acceptance setelah migration selesai
- `checklist-operator`: checklist pendamping selama eksekusi
- `panduan-sinkronisasi`: konteks lengkap dan alasan urutan migration

## Aturan Penting

- jangan pakai `npm run db:migrate:supabase` untuk remote
- pakai jalur direct DB credential
- backup wajib sebelum migration
- jangan lanjut jika `dry-run` gagal

## Referensi Lengkap

- [checklist-operator-sinkronisasi-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/checklist-operator-sinkronisasi-payroll-remote-2026-03-12.md:1)
- [panduan-sinkronisasi-migration-payroll-remote-2026-03-12.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/panduan-sinkronisasi-migration-payroll-remote-2026-03-12.md:1)
