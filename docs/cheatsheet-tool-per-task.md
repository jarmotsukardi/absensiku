# Cheatsheet Tool per Task

Dokumen ini merangkum tool dan pola kerja paling aman untuk repo `ABSENSIKU`.

Catatan:
- [`.env.local`](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/.env.local) dan [`.env.online`](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/.env.online) tetap `hands-off` kecuali ada perintah eksplisit user.
- Source runtime utama tetap berada di [src](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src), [api](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/api), dan [supabase](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/supabase).

## 1. Audit Route Web

Tool utama:
- `mcp__playwright__browser_*`
- `exec_command`

Pola:
1. Jalankan `npm run ops:sandbox:doctor:strict`
2. Cek daftar route di [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx)
3. Login dengan role yang sesuai
4. Buka route prioritas satu per satu
5. Catat route gagal, redirect tidak terduga, atau UI error

Command contoh:

```bash
rg -n '<Route\\s+path="/(admin|org|employee|dashboard)' src/App.tsx
```

## 2. Audit Source dan Codebase

Tool utama:
- `exec_command`
- `mcp__local_fs__read_text_file`

Pola:
1. Cari file/referensi dengan `rg`
2. Baca file relevan
3. Bedakan antara route aktif, route legacy, dan dokumen historis

Command contoh:

```bash
rg -n "OrgPayrollErrorLog|mobile-api|rate_limited" src api supabase
```

## 3. Edit Source Runtime

Tool utama:
- `exec_command` untuk baca konteks
- `apply_patch` untuk edit

Pola:
1. Cari file terdampak
2. Baca file yang akan diubah
3. Patch per batch kecil
4. Jalankan validasi sesuai risiko

Catatan:
- Jangan edit file sensitif tanpa konteks cukup
- Hindari perubahan paralel pada file yang sama

## 4. Smoke Test Auth

Tool utama:
- `mcp__playwright__browser_*`
- `exec_command`

Pola:
1. Login sukses
2. Uji password salah
3. Uji `rate_limited`
4. Pastikan `ref_id` atau `trace_id` muncul

Command contoh:

```bash
npm run ops:sandbox:doctor:strict
```

## 5. Audit Database dan Migration

Tool utama:
- `exec_command`
- `mcp__postgres__query`

Pola:
1. Backup Supabase remote dulu untuk pekerjaan sensitif
2. Audit migration dengan read-only command
3. Query read-only sebelum perubahan

Command contoh:

```bash
npm run db:backup:supabase
supabase migration list --linked
```

## 6. Uji Android

Tool utama:
- `mcp__android_mcp_server__*`
- `exec_command`

Pola:
1. Build APK
2. Install atau launch app
3. Ambil screenshot seperlunya
4. Dump UI jika perlu
5. Arsipkan artefak uji

Command contoh:

```bash
cd android-webview && ./gradlew :app:assembleDebug
```

## 7. Cleanup Repo

Tool utama:
- `mcp__local_fs__move_file`
- `apply_patch`
- `exec_command`

Pola:
1. Bedakan `runtime` vs `arsip`
2. Pindah arsip, jangan hapus sembarangan
3. Patch referensi path yang terdampak
4. Cek ulang route/runtime utama bila perlu

Catatan:
- Jangan perlakukan [apps](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/apps) sebagai sampah
- Jangan sentuh source sensitif tanpa audit

## 8. Handover dan Memory

Tool utama:
- `exec_command`

Pola:
1. Update memory proyek setelah task selesai
2. Tawarkan FAQ update

Command contoh:

```bash
npm run ops:memory:task -- --title "judul" --summary "ringkasan"
npm run faq:offer
```

## Checklist Cepat per Jenis Task

### Audit Route
1. `doctor`
2. cek route
3. login
4. buka route prioritas
5. catat error

### Edit Fitur
1. `rg`
2. baca file
3. patch
4. lint/test sesuai risiko
5. memory + FAQ

### DB atau Migration
1. backup
2. audit migration
3. query read-only
4. ubah jika perlu
5. verifikasi

### Android
1. build
2. launch
3. uji login/UI
4. bukti seperlunya
5. arsipkan artefak

### Cleanup
1. audit dulu
2. pindah arsip
3. patch link/path
4. cek route utama tetap hidup
