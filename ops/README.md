# Ops Quickstart

Folder ini berisi data minimum agar eksekusi task besar bisa lebih cepat dan terukur.

## File Inti

- `working-profile.json`:
  konfigurasi kebijakan kerja tetap (prioritas, paralel, validasi).
- `smoke-routes.json`:
  daftar route prioritas untuk smoke-check.
- `test-accounts.template.json`:
  template akun uji per role.
- `test-dataset.template.json`:
  template dataset uji skenario inti.
- `feature-sprint-template.md`:
  template workflow sprint fitur cepat (MCP-first, batch implementasi, validasi paralel).

## File Lokal (Rahasia)

Jangan commit data sensitif. Isi file lokal berikut:

- `test-accounts.local.json`
- `test-dataset.local.json`

## Perintah

Inisialisasi file lokal dari template:

```bash
npm run ops:readiness -- --init
```

Cek readiness:

```bash
npm run ops:readiness
```

Jika output `Ops readiness: SIAP`, berarti data minimum sudah lengkap.

Gunakan `ops/test-accounts.local.json` sebagai sumber kredensial tetap untuk uji login:

```bash
npm run smoke:login
```

Aturan record untuk smoke login/dashboard:

- Runner boleh membuat record sementara di `ops/test-runs.local.jsonl` saat proses berjalan.
- Setelah selesai, record tersebut wajib dihapus otomatis (`record_cleanup: DELETED_MANDATORY`).

Uji login per role:

```bash
npm run smoke:login:employee
npm run smoke:login:org
npm run smoke:login:superadmin
```

Uji dashboard pegawai (mengambil akun `employee` dari file yang sama):

```bash
npm run smoke:dashboard
```

## Mekanisme Resmi Uji Absensi

Gunakan command berikut sebagai jalur resmi:

```bash
npm run smoke:attendance
```

Aturan mekanisme resmi:

- Setiap run boleh direcord sementara ke `ops/test-runs.local.jsonl` untuk proses eksekusi.
- Setelah run selesai, record hasil uji **wajib dihapus otomatis** (`record_cleanup: DELETED_MANDATORY`).
- Test absensi penuh hanya dijalankan pada hari kerja non-libur.
- Jika hari ini libur (nasional/work_holiday/legacy holiday) atau weekend, run ditandai `SKIPPED_NON_WORKING_DAY` dan menyimpan rekomendasi tanggal kerja berikutnya.
- Referensi error (`app_error_ids`) ikut tercatat agar triase cepat.
