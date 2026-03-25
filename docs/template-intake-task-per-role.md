# Template Intake Task Per Role

Gunakan template ini sebelum mulai task agar scope, command, dan validasi tidak meluas tanpa kontrol.

## Template Umum

```md
# Intake Task

## Role
- frontend / backend-supabase / operator-release

## Tujuan
- hasil akhir yang diinginkan

## Scope File / Area
- file atau folder yang boleh disentuh

## Area Risiko
- auth / billing / role / migration / tenant-boundary / UI-only / docs

## Command Lokal
- dev / dev:mobile-api / dev:parity / none

## Validasi
- lint file terkait / test terdampak / build / smoke browser / none

## Data / DB
- perlu backup? ya/tidak
- tabel/RPC terkait:

## Non Goals
- hal yang sengaja tidak dikerjakan

## Output Wajib
- perubahan
- hasil validasi
- risiko tersisa
```

## Template Frontend

```md
## Role
- frontend

## Route / Halaman
- /employee/... / /org/... / /admin/...

## Perlu Auth Lokal?
- ya/tidak

## Command
- npm run dev
- atau npm run dev:parity

## Validasi
- lint file terkait
- build jika auth/role kritikal
```

## Template Backend / Supabase

```md
## Role
- backend-supabase

## Area
- api/*
- supabase/migrations/*
- supabase/functions/*

## Perlu Backup DB?
- ya/tidak

## Command
- npm run dev:mobile-api
- npm run db:backup:supabase

## Validasi
- route API
- migration/schema check
- lint/build sesuai risiko
```

## Template Operator / Release

```md
## Role
- operator-release

## Target Verifikasi
- route/flow/smoke/checklist

## Perlu Localhost?
- ya/tidak

## Command
- npm run ops:sandbox:doctor:strict
- npm run e2e:smoke
- npm run qa:fast

## Output
- hasil verifikasi
- ref_id/trace_id bila ada
- risiko tersisa
```

## Cara Pakai

1. isi template singkat sebelum mulai
2. tetapkan scope file dan level risiko
3. pilih command lokal dan validasi yang benar
4. pakai hasil intake ini sebagai dasar memory task dan handover
