# Release Notes - 2026-02-21

## Ringkasan
Perubahan difokuskan pada stabilitas operasional admin/org: pusat log error kritis, billing faktur organisasi, tiket bantuan, konsolidasi menu berbasis tab, serta konsistensi dialog konfirmasi.

## Commit Batch

1. `73d927d` - `feat(admin): add critical error log center with retention and alert relay`
- Menambah halaman `/admin/log-errors` dengan tab kritis/non-kritis/arsip/resolved.
- Menambah relay alert realtime kritis via Edge Function `critical-error-alert-relay`.
- Menambah retention function DB termasuk auto-archive untuk log kritis yang sudah selesai.

2. `684fe54` - `feat(org): add billing workspace, ticket help flow, and invoice automation`
- Menambah halaman `/org/billing` dengan tabel faktur, detail faktur, status, pencarian, filter, export.
- Menambah halaman `/org/help/tickets` dan integrasi tiket ke panel admin.
- Menambah automasi nomor faktur + health snapshot + cron monitoring billing.
- Menambah alur upload bukti pembayaran manual.

3. `2d8689c` - `feat(org): consolidate menu tabs, admin-operator controls, and confirmation UX`
- Konsolidasi beberapa submenu menjadi tab (pegawai, izin/cuti, laporan) untuk navigasi lebih ringkas.
- Menambah menu admin/operator organisasi dan pembatasan peran.
- Migrasi konfirmasi aksi dari `window.confirm` ke dialog UI konsisten.
- Menambah util pembuatan singkatan OPD otomatis dari nama OPD + validasi duplikat.

## Catatan Operasional
- Default filter log error diarahkan ke 24 jam terakhir untuk triase cepat.
- Arsip log kritis dipisahkan dari daftar aktif agar backlog lebih bersih.
- FAQ/help flow diperbarui agar sinkron dengan menu bantuan dan mekanisme tiket.

## Status Validasi
- Lint: lulus
- Test: lulus
- Build: lulus

## Catatan Lokal
- `supabase/config.toml` sengaja tidak di-commit (lokal environment).
