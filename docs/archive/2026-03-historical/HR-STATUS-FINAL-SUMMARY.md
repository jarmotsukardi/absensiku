# Status Aplikasi HR - Ringkasan Realistis

## Tanggal: 2026-03-12
## Status: Frontend HR berkembang bertahap, migration tertentu masih pending

## Ringkasan

Status HR saat ini tidak boleh dibaca sebagai:
- 100% selesai
- production ready penuh
- seluruh badge `Tunda` dan `Internal` harus hilang

Status yang lebih akurat:
- ada sejumlah halaman HR yang sudah bisa dipakai
- ada route transisi yang masih `Tunda` atau `Internal`
- ada migration HR tertentu yang memang perlu dijalankan agar halaman berbasis tabel baru bisa membaca data
- boundary HR vs absensi vs payroll tetap harus dijaga

## Yang relatif stabil saat ini

- `/org/hr`
- `/org/hr/employees`
- `/org/hr/structure`
- `/org/hr/position-grade`
- `/org/hr/contracts`
- `/org/hr/documents`
- `/org/hr/reports`
- `/org/hr/help/tickets`
- `/org/hr/settings`

## Yang masih bertahap

- `/org/hr/onboarding`
- `/org/hr/offboarding`
- `/org/hr/late-settings`
- `/org/hr/leave-types`
- `/org/hr/leave-quota`
- `/org/hr/attendance-insights`
- `/org/hr/help/error-logs`

Catatan:
- route di atas bisa hidup, tetapi tidak otomatis final
- beberapa di antaranya memang masih sah bertanda `Tunda` atau `Internal`

## Dampak migration 20260312

Migration 20260312 terutama relevan untuk:
- `hr_approval_types`
- `hr_document_templates`
- `leave_types`
- `leave_quotas`

Jika migration belum dijalankan ke Supabase remote:
- halaman terkait data baru bisa gagal memuat data
- atau hanya menampilkan empty-state / fallback sesuai implementasi

Ini tidak berarti seluruh HR gagal.
Ini hanya berarti bagian schema baru belum lengkap di remote database.

## Route yang perlu dibaca hati-hati

- `/org/hr/approval-hierarchy`

Catatan:
- route ini saat ini mengikuti policy alias/bridge ke `/org/hr/settings`
- jangan perlakukan sebagai halaman final mandiri jika arsitektur route belum berubah

## Interpretasi badge

- `Tunda` = route hidup tetapi belum masuk paket kerja aktif
- `Internal` = route transisi/bridge yang belum final

Jadi:
- adanya badge tersebut tidak otomatis bug
- yang penting adalah konsistensi badge dengan policy route dan panduan HR

## Kesimpulan praktis

Kalau migration target sudah dijalankan dan test terkait lulus, maka kesimpulan yang aman adalah:
- perubahan HR tertentu siap diuji lanjut
- schema baru sudah tersedia di Supabase remote
- halaman terdampak migration bisa diverifikasi

Kesimpulan yang tidak aman:
- seluruh HR sudah final
- seluruh admin HR sudah final
- semua menu transisi harus dipromosikan

## Rujukan utama

- `docs/panduan_membangun_hr.md`
- `docs/HR-DEPLOYMENT-CHECKLIST.md`
- `docs/DEPLOY-HR-MIGRATION-GUIDE.md`
- `apps/hr/README.md`
