# HR Payroll Readiness Review Template

Template ini dipakai untuk menilai satu tenant HR tertentu sebelum dinyatakan siap menjadi fondasi payroll.

Gunakan bersama:
- [docs/hr-to-payroll-readiness.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-to-payroll-readiness.md)
- [docs/hr-payroll-ready-fields.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-ready-fields.md)

Arti status:
- `ready`: area cukup stabil untuk payroll
- `partial`: area sudah ada, tetapi belum cukup kuat
- `blocked`: area belum layak dipakai payroll

## Metadata Review

| Item | Isi |
|---|---|
| Tenant name | |
| Tenant ID | |
| Reviewer | |
| Tanggal review | |
| Sumber data | runtime / audit dokumen / query / sampling |
| Scope | baseline HR ke payroll |

## Ringkasan Keputusan

| Item | Isi |
|---|---|
| Status akhir tenant | `ready / partial / blocked` |
| Alasan utama | |
| Bloker terbesar | |
| Next action | |

## Review Per Area

| Area | Status | Bukti / Temuan | Gap utama | Keputusan |
|---|---|---|---|---|
| Master pegawai | | | | |
| Status kepegawaian | | | | |
| Position / grade / golongan | | | | |
| Kontrak kerja | | | | |
| Struktur organisasi | | | | |
| Policy kerja | | | | |
| Leave / ESS approval | | | | |
| Dokumen HR | | | | |
| Laporan HR | | | | |
| Audit trail | | | | |

## Checklist Field Minimum

Isi bagian ini hanya untuk field yang benar-benar diperiksa.

### Employee Master

| Field | Status | Catatan |
|---|---|---|
| `id` | | |
| `tenant_id` | | |
| `name` | | |
| `nip` / nomor induk | | |
| `employee_category` | | |
| `position` / jabatan | | |
| `is_active` | | |
| `golongan` | | |
| `office_id` | | |
| `opd_id` | | |
| `work_unit_id` | | |

### Status Kepegawaian

| Field | Status | Catatan |
|---|---|---|
| status aktif/nonaktif | | |
| jenis hubungan kerja | | |
| tanggal efektif status | | |
| alasan perubahan status | | |

### Position / Grade / Golongan

| Field | Status | Catatan |
|---|---|---|
| nama jabatan | | |
| kode jabatan | | |
| grade | | |
| golongan | | |
| status aktif master | | |

### Kontrak Kerja

| Field | Status | Catatan |
|---|---|---|
| `employee_id` | | |
| jenis kontrak | | |
| tanggal mulai | | |
| tanggal berakhir | | |
| status kontrak | | |
| nomor kontrak | | |
| dokumen kontrak | | |

### Struktur Organisasi

| Field | Status | Catatan |
|---|---|---|
| tenant organisasi aktif | | |
| unit kerja / OPD | | |
| lokasi kerja | | |
| atasan langsung | | |

### Policy Kerja

| Field | Status | Catatan |
|---|---|---|
| jam kerja aktif | | |
| shift aktif | | |
| aturan keterlambatan | | |
| policy cuti / izin | | |
| policy lembur | | |

### Audit Trail

| Bukti | Status | Catatan |
|---|---|---|
| referensi perubahan | | |
| actor / approver | | |
| waktu efektif | | |
| alasan perubahan | | |

## Bukti Runtime / Audit

| Jenis bukti | Referensi |
|---|---|
| Screenshot / hasil Playwright | |
| Ref error / trace | |
| Dokumen acuan | |
| Query / audit manual | |

## Keputusan Final

Pilih salah satu:

- `ready`: tenant boleh lanjut ke persiapan payroll
- `partial`: tenant belum siap penuh, tetapi bisa ditingkatkan dengan daftar aksi yang jelas
- `blocked`: tenant belum boleh dijadikan fondasi payroll

## Aksi Lanjutan

1. |
2. |
3. |
