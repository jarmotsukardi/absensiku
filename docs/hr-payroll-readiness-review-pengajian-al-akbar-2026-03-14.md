# HR Payroll Readiness Review

Template ini diisi untuk tenant nyata agar keputusan `ready / partial / blocked` tidak hanya normatif.

Referensi acuan:
- [docs/hr-to-payroll-readiness.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-to-payroll-readiness.md)
- [docs/hr-payroll-ready-fields.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-ready-fields.md)
- [docs/hr-payroll-readiness-review-template.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-readiness-review-template.md)

## Metadata Review

| Item | Isi |
|---|---|
| Tenant name | Pengajian Al-Akbar |
| Tenant ID | 62e3dfaf-84e6-4f51-b731-3006c14d75a7 |
| Reviewer | Codex |
| Tanggal review | 14 Maret 2026 |
| Sumber data | runtime Playwright, audit dokumen, sampling UI |
| Scope | baseline HR ke payroll |

## Ringkasan Keputusan

| Item | Isi |
|---|---|
| Status akhir tenant | `partial kuat` |
| Alasan utama | Fondasi HR inti sudah hidup, audit payroll-impact lintas domain utama sudah jauh lebih matang, dan smoke write untuk `contracts`, `status kepegawaian`, undangan onboarding, serta offboarding reversible sudah lolos, tetapi operasi master pegawai dan verifikasi write end-to-end lifecycle lain belum cukup kuat untuk payroll penuh |
| Bloker terbesar | operasi master `employees` pada tenant nyata masih perlu diperdalam, beberapa pegawai aktif masih punya field payroll-impact kosong seperti `kategori`, review data nyata lifecycle payroll-impact masih perlu diperdalam, dan approval ESS write saat ini belum bisa dibuktikan karena dataset `pending` kosong |
| Next action | rapikan data pegawai aktif tenant, tutup gap `employees`, audit data nyata lifecycle payroll-impact, lalu verifikasi write flow lifecycle lain sebelum payroll dibuka |

## Review Per Area

| Area | Status | Bukti / Temuan | Gap utama | Keputusan |
|---|---|---|---|---|
| Master pegawai | partial kuat | `/org/hr/employees` terbuka, memuat data nyata, ada pencarian, create, edit, status, export dasar, pintu masuk import, validasi field `NIK`, `kategori`, `jabatan`, duplikasi `email/NIP/NIK` yang null-safe, create path sudah menyimpan relasi `OPD`, `Unit Kerja`, `Lokasi`, dan `Jabatan Master`, dialog edit kini scrollable, dan UI sudah menandai gap payroll-impact lewat tab `Butuh Review` serta badge per pegawai | write path create/import dan pendalaman edit master pada data tenant nyata belum dibuktikan end-to-end; sampling runtime menunjukkan masih ada pegawai aktif dengan `kategori` kosong sehingga save edit reversibel belum bisa dibuktikan | hampir layak jadi sumber payroll, belum final |
| Status kepegawaian | partial kuat | halaman status kepegawaian ada di baseline HR, sudah punya tanggal efektif + alasan minimum, dan smoke write UI lolos | histori perubahan status masih perlu dibaca lebih dalam untuk payroll date-based truth | jauh lebih sehat, belum final |
| Position / grade / golongan | partial | `/org/hr/position-grade` aktif sebagai baseline; struktur grade/golongan terlihat hidup di HR | belum ada checklist final mapping grade/golongan ke payroll | cukup sebagai fondasi awal, belum final |
| Kontrak kerja | partial kuat | `/org/hr/contracts` aktif, sudah punya status efektif, alasan status, audit minimum, validasi overlap/effective-date yang lebih tegas, dan smoke `create -> delete` UI lolos | review data kontrak nyata tenant masih perlu diperdalam | blocker berkurang, belum final |
| Struktur organisasi | ready | struktur organisasi aktif sebagai baseline tenant dan dipakai konsisten di HR | perlu disiplin relasi final bila payroll aktif nanti | cukup stabil sebagai fondasi |
| Policy kerja | partial | work hours, shifts, late settings, leave policy aktif di baseline HR | belum ada audit detail rule yang akan dipakai komponen payroll | fondasi ada, belum ketat |
| Leave / ESS approval | ready | `/org/hr/ess/requests`, `leave-requests`, `wfh-requests`, `flexible-attendance`, `overtime-requests` lolos runtime tanpa error | approval end-to-end belum diuji penuh; tenant uji saat ini tidak punya request `pending` untuk smoke write | area paling matang saat ini |
| Dokumen HR | partial | dokumen dan template dokumen aktif sebagai baseline | verifikasi kelengkapan dokumen kontrak/SK untuk payroll belum dilakukan | butuh audit bukti |
| Laporan HR | partial kuat | `/org/hr/reports` memuat data nyata, punya filter/export/print, dan ringkasan audit trail payroll-impact lintas domain utama | belum setara laporan payroll-grade penuh | cukup untuk audit dasar, belum final |
| Offboarding | partial kuat | `/org/hr/offboarding` sekarang `mode kelola` untuk admin organisasi, save path kompatibel dengan schema remote, dan smoke reversible `offboarding -> reactivation` UI sudah lolos | review histori lifecycle keluar pada data tenant nyata masih perlu diperdalam | blocker berkurang, belum final |
| Audit trail | partial kuat | histori payroll-impact kini mencakup pegawai, kontrak, onboarding invitation, offboarding, cuti, WFH, lembur, mutasi, dan absensi khusus; smoke write untuk kontrak, status, undangan onboarding, dan offboarding sudah lolos | write path lifecycle lain belum dibuktikan end-to-end pada tenant uji | perlu penguatan terakhir |

## Checklist Field Minimum

Isi berikut bersifat review cepat berbasis bukti yang sudah terlihat di runtime dan dokumen, bukan verifikasi query penuh ke seluruh data tenant.

### Employee Master

| Field | Status | Catatan |
|---|---|---|
| `id` | ready | data pegawai tampil sebagai entitas nyata di halaman HR |
| `tenant_id` | ready | tenant aktif tervalidasi konsisten pada workspace org admin |
| `name` | ready | nama pegawai tampil di tabel data pegawai |
| `nip` / nomor induk | partial | NIP muncul sebagai bagian pencarian/kolom, tetapi belum diaudit kualitas dan kelengkapannya |
| `employee_category` | partial | kategori pegawai muncul di HR, tetapi sampling runtime masih menemukan pegawai aktif tenant ini dengan nilai kosong |
| `position` / jabatan | partial | jabatan sudah menjadi domain baseline, tetapi belum diverifikasi sebagai mapping payroll final |
| `is_active` | ready | pegawai aktif/nonaktif tampil di ringkasan HR |
| `golongan` | partial | golongan terlihat di HR, tetapi belum diaudit konsistensi master vs penggunaan |
| `office_id` | partial | struktur lokasi ada, tetapi coverage per pegawai belum diaudit |
| `opd_id` | partial | fondasi ada, tetapi belum diverifikasi untuk tenant ini secara rinci |
| `work_unit_id` | partial | fondasi ada, tetapi belum diverifikasi untuk tenant ini secara rinci |

### Status Kepegawaian

| Field | Status | Catatan |
|---|---|---|
| status aktif/nonaktif | ready | terlihat di ringkasan dan turunan HR |
| jenis hubungan kerja | partial | konsep ada, tetapi belum diaudit penuh per pegawai |
| tanggal efektif status | blocked | belum ada bukti audit yang cukup untuk menyatakan siap |
| alasan perubahan status | blocked | belum diaudit |

### Position / Grade / Golongan

| Field | Status | Catatan |
|---|---|---|
| nama jabatan | ready | domain jabatan hidup sebagai baseline |
| kode jabatan | blocked | belum ada bukti audit pada tenant ini |
| grade | partial | domain grade hidup, tetapi belum disahkan sebagai basis payroll |
| golongan | partial | dipakai di HR, tetapi belum diaudit penuh |
| status aktif master | partial | master ada, belum diaudit per item |

### Kontrak Kerja

| Field | Status | Catatan |
|---|---|---|
| `employee_id` | partial | relasi kontrak ke pegawai diasumsikan ada, belum diaudit penuh |
| jenis kontrak | partial | domain hidup, tetapi belum diverifikasi coverage datanya |
| tanggal mulai | partial | ada sebagai bagian model kontrak, belum diaudit kualitasnya |
| tanggal berakhir | partial | laporan HR menampilkan kontrak aktif dan yang mendekati berakhir |
| status kontrak | partial | ringkasan kontrak muncul di laporan HR |
| nomor kontrak | blocked | belum ada bukti audit |
| dokumen kontrak | blocked | belum ada bukti audit |

### Struktur Organisasi

| Field | Status | Catatan |
|---|---|---|
| tenant organisasi aktif | ready | tenant aktif tervalidasi di runtime |
| unit kerja / OPD | partial | fondasi struktur ada, tetapi belum diaudit detail |
| lokasi kerja | partial | tenant punya lokasi aktif, tetapi belum diaudit untuk payroll |
| atasan langsung | blocked | belum diaudit |

### Policy Kerja

| Field | Status | Catatan |
|---|---|---|
| jam kerja aktif | partial | route aktif, tetapi belum diaudit rule payroll-impact |
| shift aktif | partial | route aktif, tetapi belum diaudit rule payroll-impact |
| aturan keterlambatan | partial | route aktif, tetapi belum diaudit sebagai dasar payroll |
| policy cuti / izin | partial | leave domain matang, tetapi dampak payroll belum ditegaskan |
| policy lembur | partial | overtime route stabil, tetapi rule payroll belum diaudit |

### Audit Trail

| Bukti | Status | Catatan |
|---|---|---|
| referensi perubahan | partial | referensi error lokal ada, tetapi histori perubahan data belum diaudit |
| actor / approver | partial | workflow approval hidup, tetapi belum diaudit rantai bukti payroll |
| waktu efektif | blocked | belum ada audit field efektif lintas perubahan penting |
| alasan perubahan | blocked | belum diaudit |

## Bukti Runtime / Audit

| Jenis bukti | Referensi |
|---|---|
| Screenshot / hasil Playwright | audit runtime `/org/hr`, `/org/hr/employees`, `/org/hr/reports`, dan route ESS pada sesi 14 Maret 2026 |
| Ref error / trace | fix `ERR-20260314124001-7QRWWB` pada `/org/hr/ess/requests` sudah tervalidasi hilang setelah patch |
| Dokumen acuan | `docs/org-hr-route-capability-matrix-2026-03-14.md`, `docs/hr-to-payroll-readiness.md`, `docs/hr-payroll-ready-fields.md` |
| Query / audit manual | belum dilakukan khusus untuk tenant payroll-readiness ini |

## Keputusan Final

Keputusan untuk tenant `Pengajian Al-Akbar` saat ini:

- `partial kuat`: tenant punya baseline HR yang cukup kuat dan audit dasar yang jauh lebih matang, tetapi belum boleh dianggap siap payroll penuh

## Aksi Lanjutan

1. tutup gap `employees` pada create/import dan perluasan kelola master
2. audit detail field efektif `contracts` dan `status kepegawaian` pada data tenant nyata
3. jalankan verifikasi write end-to-end untuk approval dan lifecycle payroll-impact di luar dua flow yang sudah lolos
