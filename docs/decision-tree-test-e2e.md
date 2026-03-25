# Decision Tree Test dan E2E

Gunakan dokumen ini untuk memilih validasi yang tepat sebelum atau sesudah perubahan.

## Langkah 1

Apakah perubahan hanya berupa copywriting atau UI minor tanpa mengubah logic?

- Ya:
  lint file terkait saja
- Tidak:
  lanjut ke langkah 2

## Langkah 2

Apakah perubahan menyentuh logic komponen, hook, route, atau API non-kritikal?

- Ya:
  lakukan:
  - lint file terkait
  - test terdampak jika ada
- Tidak:
  lanjut ke langkah 3

## Langkah 3

Apakah perubahan menyentuh area kritikal?

Kategori kritikal di repo ini:
- auth
- billing
- role/permission
- migration DB
- login employee
- `mobile-api`
- tenant boundary `/org`

- Ya:
  lakukan:
  - lint
  - test terdampak
  - build penuh
- Tidak:
  gunakan validasi menengah

## Langkah 4

Apakah task butuh browser atau localhost runtime?

- Ya:
  jalankan dulu:

```bash
npm run ops:sandbox:doctor:strict
```

Jika belum `SIAP`, jangan lanjut E2E/browser sampai environment beres.

- Tidak:
  lanjut sesuai validasi sebelumnya

## Langkah 5

Apakah Anda hanya perlu smoke route dasar?

Gunakan salah satu:

```bash
npm run e2e:smoke:check
```

atau

```bash
npm run e2e:smoke
```

## Langkah 6

Apakah Anda sedang memverifikasi auth employee web/native?

- Ya:
  pertimbangkan:
  - `npm run dev:parity`
  - smoke login manual/browser
  - cek `ref_id`
- Tidak:
  lanjut ke langkah 7

## Langkah 7

Apakah Anda sedang menguji suite HR/Payroll?

- Ya:
  gunakan suite yang relevan saja, bukan semuanya sekaligus
  contoh:

```bash
npm run e2e:hr:smoke
```

atau

```bash
npm run e2e:hr:crud
```

atau grep/headed sesuai kebutuhan

- Tidak:
  lanjut ke langkah 8

## Langkah 8

Apakah Anda sedang memverifikasi flow spesifik organisasi/pegawai?

Gunakan smoke yang paling dekat ke risiko perubahan. Contoh:
- `npm run smoke:login`
- `npm run smoke:login:employee`
- `npm run smoke:login:org`
- `npm run smoke:dashboard`
- `npm run e2e:flow:org-attendance`

## Ringkasan Cepat

- perubahan ringan:
  lint file terkait
- perubahan menengah:
  lint + test terdampak
- perubahan kritikal:
  lint + test terdampak + build
- butuh browser:
  doctor dulu
- butuh auth lokal:
  `dev:parity`

## Jika Masih Ragu

Baca:
- [docs/checklist-harian-per-role.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/checklist-harian-per-role.md)
- [docs/decision-tree-command-lokal.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/decision-tree-command-lokal.md)
- [ops/README.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/ops/README.md)
