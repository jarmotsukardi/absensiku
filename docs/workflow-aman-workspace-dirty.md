# Workflow Aman di Workspace Dirty

Panduan singkat untuk tetap bekerja di workspace lokal yang kotor tanpa mendorong perubahan yang salah ke online.

## Tujuan

- Tetap memakai workspace lokal yang sekarang.
- Menjaga perubahan lokal tidak menimpa online secara tidak sengaja.
- Memastikan commit, push, deploy, dan perubahan database tetap terkontrol.

## Prinsip Inti

1. Edit lokal tidak mengubah online sampai ada `push` atau deploy.
2. Perubahan Supabase remote dianggap live saat dijalankan.
3. Setiap task harus punya scope file yang jelas.
4. Commit harus selektif, bukan menyapu semua perubahan workspace.
5. Jangan pernah mengandalkan kondisi workspace dirty sebagai dasar deploy tanpa audit.

## Larangan Tetap

- Jangan pakai `git add .`
- Jangan pakai `git commit -a`
- Jangan deploy Vercel langsung dari perubahan lokal yang belum diaudit
- Jangan jalankan migration/query Supabase remote tanpa backup lebih dulu
- Jangan asumsi online sama dengan `HEAD` bersih jika deployment sebelumnya dibuat dari CLI dengan `gitDirty=1`

## Checklist Sebelum Mulai Task

Jalankan:

```bash
git status --short
git rev-parse --abbrev-ref HEAD
```

Lalu tentukan:

- tujuan task
- file yang boleh disentuh
- apakah task menyentuh Supabase remote
- apakah task berisiko menyentuh auth, billing, role, atau migration

## Aturan Scope File

Sebelum coding, tetapkan daftar file target. Contoh:

- `src/pages/employee/EmployeeLogin.tsx`
- `src/hooks/useSessionManagement.ts`
- `src/components/auth/ForgotPasswordDialog.tsx`

Jika di tengah jalan butuh file lain:

1. tambahkan file itu ke scope secara sadar
2. audit apakah file itu memang relevan dengan task
3. jangan menyapu file lain yang sedang dirty tetapi tidak terkait

## Workflow Implementasi Harian

1. Scan status repo
2. Tetapkan scope file
3. Edit hanya file dalam scope
4. Validasi sesuai level risiko
5. Review diff hanya untuk file scope
6. Stage selektif
7. Commit selektif

## Audit Diff Sebelum Commit

Gunakan per file atau per scope:

```bash
git diff -- src/pages/employee/EmployeeLogin.tsx src/hooks/useSessionManagement.ts
```

Kalau task menyentuh banyak file, pecah per batch kecil agar review tetap terbaca.

## Cara Stage yang Aman

Stage satu per satu:

```bash
git add src/pages/employee/EmployeeLogin.tsx
git add src/hooks/useSessionManagement.ts
```

Lalu cek:

```bash
git diff --cached --name-only
git diff --cached
```

Kalau ada file tidak terkait ikut masuk, keluarkan sebelum commit.

## Format Kerja yang Direkomendasikan

Contoh alur aman:

```bash
git status --short
git diff -- src/pages/employee/EmployeeLogin.tsx
git add src/pages/employee/EmployeeLogin.tsx
git diff --cached --name-only
git commit -m "fix(auth): perbaiki login pegawai"
```

## Aturan untuk Supabase Remote

Supabase remote adalah source of truth. Jadi perubahan DB bukan simulasi lokal.

Sebelum perubahan schema/data penting, wajib:

```bash
npm run db:backup:supabase
```

Kategori yang wajib backup:

- migration schema
- cleanup data besar
- auth
- billing
- role/permission
- perubahan trigger, policy, function

Setelah perubahan DB:

1. catat migration/query yang dijalankan
2. verifikasi efeknya ke tabel/fitur terkait
3. jangan lanjut deploy kalau efek DB belum dipahami

## Aturan Validasi Berdasarkan Risiko

### Perubahan ringan

- lint file terkait

### Perubahan menengah

- lint file terkait
- test terdampak

### Perubahan kritikal

- lint penuh atau lint file terkait yang kritikal
- test terdampak
- build penuh

Kategori kritikal:

- auth
- billing
- role/permission
- migration database
- jalur login
- integrasi pembayaran

## Checklist Sebelum Push

1. Pastikan file staged hanya file task
2. Review isi staged diff
3. Pastikan tidak ada file dirty lain yang ikut masuk
4. Pastikan hasil validasi sesuai risiko task
5. Pastikan perubahan DB remote sudah dibackup dan terdokumentasi

Perintah audit:

```bash
git diff --cached --name-only
git diff --cached
```

## Checklist Sebelum Deploy

1. Pastikan commit yang mau dideploy memang commit yang benar
2. Pastikan tidak deploy dari keadaan lokal liar tanpa audit
3. Pastikan tidak ada perubahan remote DB yang belum diverifikasi
4. Pastikan online targetnya memang harus menerima perubahan itu

Catatan:

- Deploy via Vercel CLI bisa membawa `gitDirty=1`
- Jika deploy dilakukan dari workspace dirty, online bisa berisi file yang tidak tercatat rapi di git
- Karena itu deploy harus dianggap aksi release, bukan aksi coba-coba

## Strategi Aman Jika Workspace Tetap Dirty

Gunakan workspace ini untuk kerja harian, tetapi patuhi aturan berikut:

1. task kecil, scope kecil
2. diff selalu dibaca sebelum stage
3. commit hanya file task
4. push hanya setelah audit staged diff
5. perubahan DB selalu dibackup dulu

## Tanda Bahaya

Hentikan dulu sebelum commit/push jika:

- file staged lebih banyak dari yang direncanakan
- ada perubahan di auth/billing/role yang tidak kamu sengaja sentuh
- ada migration DB yang belum kamu review
- ada kebutuhan `git add .` supaya pekerjaan terasa cepat
- kamu tidak bisa menjelaskan file mana yang benar-benar ingin dirilis

## Aturan Khusus Episode Migrasi Auth yang Dibatalkan

- Jalur auth internal yang sempat dibuat sudah dibersihkan
- Remote schema `app_*` sudah dibersihkan
- Area itu tidak lagi menjadi risiko aktif untuk push berikutnya

Risiko aktif sekarang bukan dari rollback auth, tetapi dari mencampur perubahan task baru dengan perubahan workspace lain yang belum diaudit.

## Ringkasan Praktis

- Pakai workspace ini: boleh
- Kerja harian di sini: boleh
- Push dari sini: boleh, tapi harus selektif
- Deploy dari sini: hanya setelah audit ketat
- Ubah DB remote dari sini: boleh, tapi wajib backup dulu

Untuk workflow agent dan MCP, lihat juga:
- [docs/mcp-recommended-stack.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/mcp-recommended-stack.md)
- [docs/mcp-ops-policy.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/mcp-ops-policy.md)

## Perintah Minimum yang Wajib Diingat

```bash
git status --short
git diff -- <file-scope>
git add <file-scope>
git diff --cached --name-only
git diff --cached
npm run db:backup:supabase
```
