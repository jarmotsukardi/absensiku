# Rekomendasi MCP untuk ABSENSIKU

Panduan ini merangkum MCP yang paling masuk akal untuk workflow `ABSENSIKU` saat ini.

Konteks repo per 14 Maret 2026:
- fokus aktif harian tetap aplikasi absensi
- domain HR dan Payroll masih berada di repo yang sama, tetapi bukan prioritas default
- database sumber kebenaran adalah `Supabase remote`, bukan localhost

Dokumen ini dibuat agar aktivasi MCP tetap membantu kecepatan kerja tanpa membuka risiko operasional yang tidak perlu.

Policy operasional yang lebih tegas tersedia di [docs/mcp-ops-policy.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/mcp-ops-policy.md).

## Tujuan

- mempercepat baca konteks, implementasi, dan validasi
- menjaga akses sensitif tetap dibatasi
- menyelaraskan tooling agent dengan policy repo

## Prinsip Inti

1. MCP yang aktif harus memberi dampak langsung ke workflow harian.
2. Default akses untuk sistem sensitif adalah `read-only`.
3. Akses tulis ke database remote, GitHub write action, dan perubahan release harus explicit per task.
4. Untuk repo ini, `filesystem` dan `playwright` adalah fondasi minimum.
5. Setelah fondasi aktif, MCP paling bernilai tambah berikutnya adalah akses `Supabase/Postgres remote` yang aman.

## Stack Minimal

Stack ini cukup untuk mayoritas task coding harian.

- `filesystem` (`local-fs` atau `codebase`)
- `playwright`
- `memory`

Kegunaan praktis:
- `filesystem`: baca, cari, edit, dan audit file repo
- `playwright`: verifikasi UI, smoke test, audit flow browser
- `memory`: menjaga konteks kerja, keputusan teknis, dan handover antar sesi

Kapan stack minimal cukup:
- bugfix frontend
- perapihan komponen
- refactor hook atau util
- audit route dan layout
- validasi smoke flow di browser

## Stack Ideal

Ini adalah setup yang paling seimbang untuk repo ini.

- `filesystem`
- `playwright`
- `memory`
- `context7`
- `github`
- `localhost fetch`

Tambahan nilai:
- `context7`: dokumentasi library resmi dan presisi saat butuh referensi terbaru
- `github`: baca issue, PR, release, review, dan metadata repo remote
- `localhost fetch`: cek HTML, JSON, atau response endpoint lokal tanpa browser penuh

Kapan stack ideal layak dipakai:
- repo sedang aktif berkembang di banyak domain
- validasi perlu kombinasi file audit, browser audit, dan dokumentasi library
- tim menggunakan issue atau PR sebagai sumber konteks tambahan

## Stack Ideal Plus Supabase

Untuk `ABSENSIKU`, ini adalah target paling berguna secara operasional.

- semua dari stack ideal
- `Supabase/Postgres remote MCP`

Alasan:
- source of truth ada di `Supabase remote`
- repo memiliki banyak migration, RPC, edge function, dan area sensitif seperti auth, billing, role, dan attendance policy
- validasi schema dan data lebih aman bila bisa diinspeksi langsung secara terkontrol

Kapabilitas yang paling bernilai:
- inspect schema, table, view, function, policy
- query `SELECT` read-only
- discovery RPC
- audit hasil migration
- verifikasi data pasca perubahan penting

## MCP Prioritas Aktivasi

Aktifkan dalam urutan ini:

1. `filesystem`
2. `playwright`
3. `memory`
4. `context7`
5. `github`
6. `Supabase/Postgres remote MCP`

Urutan ini dipilih karena:
- tiga pertama memberi dampak langsung ke coding lokal
- `context7` dan `github` menambah kualitas konteks
- `Supabase MCP` adalah penguat paling penting untuk area data, tetapi tetap perlu guard ketat

## Policy Akses yang Disarankan

Pisahkan MCP ke dua kelas utama: `read-only` dan `write terbatas`.

## Read-Only Default

Sebaiknya default `read-only` untuk:
- `context7`
- `github`
- `localhost fetch`
- `Supabase/Postgres remote MCP`

Untuk `Supabase MCP`, `read-only` berarti:
- boleh inspect schema
- boleh lihat function, trigger, dan policy
- boleh jalankan query `SELECT`
- boleh audit metadata dan hasil verifikasi
- tidak boleh `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, atau apply migration tanpa instruksi eksplisit

## Write yang Aman

`filesystem`:
- boleh read dan write lokal
- tetap ikuti scope file task
- jangan menyapu file unrelated di workspace dirty

`memory`:
- boleh write untuk handover dan catatan operasional

`playwright`:
- boleh interaksi browser dan validasi flow
- untuk task localhost, jalankan preflight sesuai repo bila perlu

`github`:
- default read-only
- write hanya saat user secara eksplisit meminta komentar, issue, branch, PR, atau review

`Supabase/Postgres remote MCP`:
- default read-only
- write hanya explicit per task
- perubahan schema/data penting wajib backup dulu

## Guard Wajib untuk Repo Ini

Karena repo ini punya aturan operasional yang ketat, aktifkan guard berikut:

- jangan gunakan database localhost sebagai sumber kebenaran default
- sebelum perubahan schema/data penting, jalankan:

```bash
npm run db:backup:supabase
```

- untuk task browser yang butuh localhost runtime, jalankan:

```bash
npm run ops:sandbox:doctor:strict
```

- jangan aktifkan `git push`, pembuatan PR, atau deploy otomatis tanpa perintah eksplisit user
- saat triage error, sertakan `log id` atau `trace_id`

## Rekomendasi Permission per MCP

### 1. Filesystem

Rekomendasi:
- read: aktif
- write: aktif
- delete atau move: hati-hati, tetap berbasis task

Catatan:
- ini MCP paling penting untuk repo ini
- tanpa ini, workflow coding lokal menjadi lambat

### 2. Playwright

Rekomendasi:
- aktif

Cocok untuk:
- smoke test
- audit UI
- route verification
- reproduksi bug browser

### 3. Memory

Rekomendasi:
- aktif

Cocok untuk:
- handover task
- menyimpan keputusan implementasi
- menjaga konteks repo besar yang sedang dirty

### 4. Context7

Rekomendasi:
- aktif sebagai read-only

Sangat berguna saat butuh referensi presisi untuk:
- React
- Vite
- Playwright
- Supabase SDK
- library lain yang berubah cepat

### 5. GitHub

Rekomendasi:
- aktif read-only lebih dulu

Write action yang sebaiknya explicit-only:
- membuat issue
- memberi komentar
- membuat branch
- membuat atau mengubah PR
- merge

### 6. Supabase/Postgres Remote MCP

Rekomendasi:
- sangat dianjurkan aktif
- default read-only

Write action yang harus explicit-only:
- apply migration
- DDL
- DML
- cleanup besar
- backfill data
- perubahan auth, billing, role, dan permission

## Setup Paling Masuk Akal

Kalau harus memilih satu paket paling efektif untuk langsung dipakai:

- `filesystem`
- `playwright`
- `memory`
- `context7`
- `Supabase/Postgres remote MCP` dalam mode `read-only`

Ini sudah cukup kuat untuk:
- coding harian
- audit UI
- validasi browser
- baca dokumentasi library
- inspeksi schema dan data remote secara aman

## Kapan Perlu Upgrade ke Setup Lebih Ketat

Pertimbangkan setup lebih ketat jika:
- mulai sering menyentuh migration
- sering audit RLS, RPC, dan edge function
- ada kebutuhan triage produksi dengan jejak `trace_id`
- ada workflow issue atau PR yang aktif setiap hari

Kalau kondisi di atas terjadi, tambahkan:
- observability/log MCP
- config atau secrets MCP yang masked
- GitHub write access yang tetap explicit-only

## Ringkasan Praktis

- minimum yang layak: `filesystem + playwright + memory`
- setup harian terbaik: tambah `context7`
- penguat paling penting untuk repo ini: `Supabase/Postgres remote MCP`
- default aman: semua sistem sensitif `read-only`
- write access untuk DB remote, GitHub action, push, PR, dan deploy harus explicit per task
