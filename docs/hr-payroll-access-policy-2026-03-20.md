# Policy Akses HR dan Payroll

Dokumen ini menetapkan rule akses HR dan Payroll berbasis `attendance-first`, readiness objektif, dan komitmen pembayaran.

Tanggal efektif desain: `2026-03-20`

## Prinsip

- Absensi tetap menjadi fondasi utama.
- HR dan Payroll boleh dibuka untuk eksplorasi penuh menu lebih awal dalam mode `read-only`.
- Unlock edit tidak lagi menunggu `streak monitoring`.
- HR editable dibuka saat `komitmen pembayaran` dicatat.
- Payroll editable dibuka saat status langganan tenant sudah `active`.

## Checklist Readiness Absensi

Tenant dianggap `attendance_ready` bila semua syarat berikut terpenuhi:

1. Setup inti absensi terisi:
   `work_units > 0`, `offices > 0`, `work_hours > 0`, `absence_limits > 0`
2. Minimal ada `1` role `admin_instansi` aktif pada tenant.
3. Minimal ada `1` pegawai terdaftar.
4. Minimal ada `1` record pada `attendance_records_partitioned`.

Jika salah satu belum terpenuhi, HR dan Payroll tetap `locked`.

## Tahap Akses

| Stage | Syarat | HR | Payroll |
|---|---|---|---|
| `setup_required` | readiness absensi belum lengkap | locked | locked |
| `attendance_active` | readiness lengkap, belum ada komitmen pembayaran, subscription belum `active` | read-only | read-only |
| `payment_committed` | readiness lengkap, komitmen pembayaran tercatat, subscription belum `active` | full edit | read-only |
| `paid_active` | readiness lengkap, subscription `active` | full edit | full edit |

## Role Matrix

| Role | Absensi | HR | Payroll |
|---|---|---|---|
| `super_admin` | bypass internal sesuai kebutuhan platform | bypass internal | bypass internal |
| `admin_instansi` | full sesuai policy org | ikut stage akses tenant | ikut stage akses tenant + permission payroll saat mode full |
| `atasan` | tetap sesuai modul operasional yang sudah ada | tetap dibatasi ke FAQ/Tiket HR | tidak mendapat akses |
| `pegawai` | dashboard pegawai | tidak mendapat akses | tidak mendapat akses |

## Catatan Permission Payroll

- Saat Payroll `read-only`, semua halaman Payroll boleh dibuka oleh `admin_instansi`.
- Saat Payroll `full`, enforcement kembali ke permission payroll yang sudah ada.
- Halaman `Hak Akses Payroll` tetap bisa dibuka pada mode `full` untuk recovery assignment.

## Copy UI

Copy sistem yang dipakai:

- `HR Read Only`
  `Workspace HR masih preview. Semua menu bisa dilihat, tetapi edit dan tambah data baru dibuka setelah komitmen pembayaran dicatat.`
- `Payroll Read Only`
  `Workspace Payroll masih read-only. Edit payroll dibuka setelah status langganan aktif penuh.`
- `Locked`
  `HR/Payroll baru dibuka setelah absensi siap dipakai secara objektif.`
- CTA HR:
  `Catat Komitmen Pembayaran`
- CTA Payroll:
  `Aktifkan Langganan Payroll`

## Panel Admin Organisasi

Panel `Status Langganan` organisasi harus menampilkan:

1. status langganan tenant
2. status readiness absensi
3. jumlah admin aktif
4. jumlah pegawai
5. jumlah record absensi
6. switch `Komitmen pembayaran`
7. mode akses HR saat ini
8. mode akses Payroll saat ini

## Dampak UAT

Uji minimum yang wajib:

1. tenant belum readiness tidak bisa membuka HR/Payroll
2. tenant readiness lengkap bisa membuka semua menu HR/Payroll dalam mode `read-only`
3. tenant dengan `komitmen pembayaran` bisa edit HR tetapi Payroll tetap `read-only`
4. tenant dengan subscription `active` bisa edit HR dan Payroll
