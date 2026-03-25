# Policy Operasional MCP untuk ABSENSIKU

Dokumen ini melengkapi panduan [Rekomendasi MCP](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/mcp-recommended-stack.md) dengan aturan operasional yang lebih tegas.

Tujuan policy ini:
- menjaga MCP tetap membantu kecepatan kerja
- membatasi akses sensitif secara default
- memastikan workflow MCP selaras dengan aturan `Supabase remote` di repo ini

## Prinsip Dasar

1. Default untuk sistem sensitif adalah `read-only`.
2. Aksi tulis ke sistem eksternal harus explicit per task.
3. `Supabase remote` tetap dianggap live environment.
4. MCP tidak boleh dipakai untuk mem-bypass aturan repo soal backup, push, PR, deploy, atau release.
5. Workspace repo ini bisa dirty, jadi semua edit harus tetap berbasis scope file yang jelas.

## Klasifikasi Akses

### Kelas A: Aman untuk Aktif Harian

MCP berikut aman diaktifkan sebagai default:
- `filesystem`
- `playwright`
- `memory`
- `context7`
- `localhost fetch`

Rule:
- boleh dipakai untuk baca konteks, validasi, dan edit lokal
- tetap hindari perubahan destruktif yang tidak diminta user

### Kelas B: Eksternal tetapi Default Read-Only

MCP berikut boleh aktif, tetapi default harus `read-only`:
- `github`
- `Supabase/Postgres remote MCP`
- observability/log MCP jika tersedia

Rule:
- hanya baca metadata, status, schema, log, issue, atau PR
- jangan eksekusi perubahan state tanpa instruksi eksplisit

### Kelas C: Explicit-Only

Aksi berikut tidak boleh dijalankan sebagai default:
- `git push`
- pembuatan branch remote
- pembuatan PR
- merge PR
- deploy
- apply migration ke remote
- DDL atau DML ke database remote
- cleanup data besar
- perubahan auth, billing, role, atau permission di DB remote

## Rule per MCP

### Filesystem

Diizinkan:
- read file
- search file
- edit file
- create file

Pembatasan:
- jangan edit file yang sama secara paralel
- jangan menyapu file dirty yang tidak terkait task
- jangan hapus file tanpa alasan yang jelas

### Playwright

Diizinkan:
- buka browser
- inspeksi UI
- smoke test
- route verification

Guard:
- jika task butuh localhost runtime, jalankan:

```bash
npm run ops:sandbox:doctor:strict
```

- jika doctor gagal, jangan paksa test browser lanjut tanpa perbaikan environment

### Memory

Diizinkan:
- tulis catatan task
- simpan keputusan teknis
- simpan next action

Guard:
- catatan harus ringkas, faktual, dan relevan ke handover

### Context7

Diizinkan:
- lookup dokumentasi resmi library

Guard:
- gunakan hanya saat butuh referensi yang presisi atau terbaru

### GitHub

Default:
- read-only

Diizinkan tanpa approval tambahan user:
- baca issue
- baca PR
- baca release
- baca file repo remote

Explicit-only:
- buat issue
- komentar
- reply review
- buat branch
- buat PR
- merge

### Supabase/Postgres Remote MCP

Default:
- read-only

Diizinkan:
- inspect schema
- inspect function, trigger, policy, index
- query `SELECT`
- audit hasil migration

Explicit-only:
- `INSERT`
- `UPDATE`
- `DELETE`
- `ALTER`
- `DROP`
- apply migration
- seed
- cleanup
- backfill

Guard wajib:

```bash
npm run db:backup:supabase
```

Jalankan backup ini sebelum perubahan penting pada:
- schema
- data besar
- billing
- auth
- role atau permission
- trigger, policy, dan function

## Checklist Sebelum Pakai MCP Sensitif

Sebelum memakai MCP `github write` atau `Supabase remote write`, pastikan:

1. task memang meminta aksi tersebut
2. scope perubahan jelas
3. dampak perubahan bisa dijelaskan
4. untuk DB remote, backup sudah dilakukan bila relevan
5. tidak ada alternatif yang lebih aman dengan mode read-only

## Checklist Sesudah Task

Setelah task selesai:

1. validasi hasil sesuai level risiko
2. laporkan perubahan yang dilakukan
3. sertakan risiko tersisa bila ada
4. update memory task
5. jalankan `npm run faq:offer` untuk perubahan fitur atau dokumentasi operasional yang relevan

## Ringkasan Praktis

- aktifkan `filesystem`, `playwright`, `memory`, dan `context7` sebagai fondasi
- perlakukan `github` dan `Supabase remote` sebagai sistem `read-only` secara default
- semua write action eksternal harus explicit per task
- jangan pakai MCP untuk melanggar guard repo
