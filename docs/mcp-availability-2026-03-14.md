# Audit Availability MCP Sesi 14 Maret 2026

Dokumen ini membedakan antara:
- MCP yang benar-benar tersedia di sesi kerja saat ini
- MCP yang direkomendasikan repo tetapi belum terlihat aktif

Tujuan:
- mencegah dokumen MCP menjadi terlalu normatif
- memberi gambaran realistis tentang capability agent saat ini

## MCP Tersedia di Sesi Ini

Berdasarkan toolset aktif pada sesi ini, MCP yang tersedia meliputi:

- `local-fs`
- `codebase`
- `playwright`
- `github`
- `memory`
- `context7`
- `localhost fetch`
- `mysql`
- `mariadb`
- `sequential-thinking`

## MCP yang Paling Relevan untuk Repo Ini dan Tersedia

Yang paling langsung berguna untuk `ABSENSIKU`:
- `local-fs` atau `codebase`
- `playwright`
- `memory`
- `context7`
- `github`
- `localhost fetch`

Catatan:
- untuk kebutuhan kerja harian, `filesystem + playwright + memory` sudah cukup kuat
- `context7` membantu saat butuh dokumentasi library yang presisi
- `github` berguna bila task menyentuh issue, PR, atau repo remote

## MCP Tersedia tetapi Bukan Prioritas Repo

Tersedia namun bukan pilihan utama karena policy repo:
- `mysql`
- `mariadb`

Alasan:
- source of truth repo ini adalah `Supabase remote`
- database MySQL atau MariaDB lokal bukan jalur default untuk validasi schema operasional

## MCP yang Direkomendasikan tetapi Belum Terlihat Aktif

Belum terlihat aktif di toolset sesi ini:
- `Supabase/Postgres remote MCP`
- observability atau log MCP khusus runtime
- secrets atau config MCP yang masked

Dampaknya:
- inspeksi schema dan data Supabase remote masih perlu mengandalkan jalur lain
- audit RLS, RPC, function, dan hasil migration belum senyaman bila ada MCP khusus Supabase

## Konsekuensi Operasional

Karena `Supabase/Postgres remote MCP` belum terlihat aktif:
- jangan asumsi query remote bisa dilakukan langsung via MCP
- tetap perlakukan rekomendasi Supabase MCP sebagai target setup
- saat task menyentuh DB remote, utamakan guard repo:

```bash
npm run db:backup:supabase
```

## Ringkasan Praktis

- tersedia sekarang: `filesystem`, `playwright`, `memory`, `context7`, `github`, `localhost fetch`
- belum tersedia tetapi sangat diinginkan: `Supabase/Postgres remote MCP`
- hindari mengandalkan `mysql` atau `mariadb` untuk workflow utama repo ini
