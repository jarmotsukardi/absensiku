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

