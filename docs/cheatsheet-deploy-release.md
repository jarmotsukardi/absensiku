# Cheatsheet Deploy dan Release

Dokumen ini khusus untuk pekerjaan yang mendekati push, deploy, atau release.

## Prinsip

- Local dirty tidak otomatis mengubah GitHub.
- GitHub tidak otomatis mengubah Vercel tanpa push atau deploy.
- Vercel hanya berubah jika ada deploy baru.

## Sebelum Push

1. Cek area high-risk:
   - [src](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src)
   - [api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api)
   - [supabase](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase)
   - [vercel.json](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/vercel.json)
   - [package.json](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/package.json)
2. Pastikan dokumen/arsip tidak tercampur dengan perubahan runtime kritis
3. Review delete state di route atau migration

## Quality Gate

Untuk release formal:

```bash
npm run autofix
npm run lint
npm run test
npm run build
```

Untuk perubahan berisiko menengah:
- lint file terkait
- test terdampak
- smoke route atau auth sesuai konteks

## Smoke Wajib Sebelum Release

Minimal:
- `/admin/*` prioritas utama
- `/org/*` prioritas utama
- `/org/hr/*` prioritas utama
- `/org/payroll/*` prioritas utama
- `/employee/*` modern

Tambahan bila menyentuh auth:
- login sukses
- invalid credentials
- rate-limited
- `ref_id` tampil

## Jika Menyentuh DB

1. Backup Supabase remote:

```bash
npm run db:backup:supabase
```

2. Audit migration:

```bash
supabase migration list --linked
```

3. Jangan anggap migration delete sebagai aman tanpa review

## Jika Menyentuh Vercel

Fokus file:
- [vercel.json](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/vercel.json)
- [api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api)

Checklist:
- rewrite `/mobile-api/*` tetap benar
- function aktif masih terbundle
- tidak ada route publik yang jatuh ke 404 karena rewrite salah

## Handover Sebelum Tutup Task

```bash
npm run ops:memory:task -- --title "judul" --summary "ringkasan"
npm run faq:offer
```

Jika FAQ benar-benar diperbarui:

```bash
npm run faq:ack
```

## Jangan Lakukan Otomatis

- jangan `git push` tanpa perintah eksplisit user
- jangan deploy Vercel tanpa perintah eksplisit user
- jangan sentuh [`.env.local`](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/.env.local) atau [`.env.online`](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/.env.online) tanpa izin
