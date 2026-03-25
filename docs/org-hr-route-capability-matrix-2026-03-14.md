# Matriks Route dan Capability `/org/hr`

Dokumen ini merangkum status final praktis untuk route `/org/hr` per 14 Maret 2026.

Sumber kebenaran yang dipakai:
- [src/lib/hrRouteAccess.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/lib/hrRouteAccess.ts)
- [src/lib/hrPageAccess.ts](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/lib/hrPageAccess.ts)
- [docs/panduan_membangun_hr.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/panduan_membangun_hr.md)

Tujuan dokumen ini:
- memisahkan route yang benar-benar aktif dari alias dan redirect
- menunjukkan gap capability aksi per halaman
- memberi rekomendasi praktis: `produksi`, `internal terkendali`, atau `alias`

## Ringkasan Eksekutif

Kesimpulan paling ringkas:
- `/org/hr` sudah kuat sebagai baseline tenant HR
- mayoritas route domain HR sekarang berstatus `tampil`
- masih ada 24 route yang jelas hanya berfungsi sebagai `redirect`
- gap utama bukan lagi aktivasi route, tetapi kedalaman capability aksi pada halaman

Interpretasi status untuk dokumen ini:
- `produksi`: route aktif dan layak dianggap bagian utama workspace
- `internal terkendali`: route aktif, tetapi secara produk sebaiknya belum dianggap menu utama final
- `alias`: route lama/transisi yang seharusnya dibaca sebagai pintasan ke halaman lain

## 1. Route Produksi Inti

Route berikut paling aman dibaca sebagai produksi inti `/org/hr`:

| Route | Label | Minimum Role | Catatan | Rekomendasi |
|---|---|---|---|---|
| `/org/hr` | Ringkasan HR | admin_instansi | workspace inti HR | produksi |
| `/org/hr/employees` | Data Pegawai | admin_instansi | inti master pegawai | produksi |
| `/org/hr/structure` | Struktur Organisasi | admin_instansi | inti struktur | produksi |
| `/org/hr/position-grade` | Jabatan dan Grade | admin_instansi | inti struktur/jabatan | produksi |
| `/org/hr/contracts` | Kontrak Kerja | admin_instansi | inti lifecycle pegawai | produksi |
| `/org/hr/documents` | Dokumen HR | admin_instansi | inti dokumen | produksi |
| `/org/hr/document-templates` | Template Dokumen | admin_instansi | dokumen generator dasar | produksi |
| `/org/hr/reports` | Laporan HR | admin_instansi | laporan inti HR | produksi |
| `/org/hr/settings` | Pengaturan HR | admin_instansi | pusat setting HR | produksi |
| `/org/hr/help/faq` | FAQ HR | atasan | bantuan operasional | produksi |
| `/org/hr/help/tickets` | Tiket HR | atasan | helpdesk HR | produksi |
| `/org/hr/onboarding` | Proses Masuk Pegawai | admin_instansi | lifecycle baseline | produksi |
| `/org/hr/offboarding` | Proses Keluar Pegawai | admin_instansi | lifecycle baseline | produksi |
| `/org/hr/work-hours` | Jam Kerja | admin_instansi | baseline kebijakan kerja | produksi |
| `/org/hr/shifts` | Pola Shift | admin_instansi | baseline jadwal kerja | produksi |
| `/org/hr/late-settings` | Pengaturan Keterlambatan | admin_instansi | baseline policy | produksi |
| `/org/hr/leave-types` | Jenis Cuti | admin_instansi | baseline leave | produksi |
| `/org/hr/leave-quota` | Kuota Cuti | admin_instansi | baseline leave | produksi |
| `/org/hr/leave-approval` | Alur Persetujuan Cuti | admin_instansi | workflow leave | produksi |
| `/org/hr/mutation-approval` | Persetujuan Mutasi | admin_instansi | workflow mutasi | produksi |
| `/org/hr/leave-validity` | Masa Berlaku Cuti | admin_instansi | baseline leave | produksi |
| `/org/hr/kpi` | KPI HR | admin_instansi | baseline performance | produksi |
| `/org/hr/performance-periods` | Periode Penilaian HR | admin_instansi | baseline performance | produksi |
| `/org/hr/performance-forms` | Form Penilaian HR | admin_instansi | baseline performance | produksi |
| `/org/hr/review-360` | Ulasan 360 HR | admin_instansi | baseline performance | produksi |
| `/org/hr/evaluation-results` | Hasil Evaluasi HR | admin_instansi | baseline performance | produksi |
| `/org/hr/training-data` | Data Pelatihan HR | admin_instansi | baseline training | produksi |
| `/org/hr/certifications` | Sertifikasi HR | admin_instansi | baseline training | produksi |
| `/org/hr/skill-matrix` | Matriks Keahlian HR | admin_instansi | baseline training | produksi |
| `/org/hr/recruitment/jobs` | Lowongan ATS | admin_instansi | baseline ATS | produksi |
| `/org/hr/recruitment/candidates` | Kandidat ATS | admin_instansi | baseline ATS | produksi |
| `/org/hr/recruitment/interviews` | Wawancara ATS | admin_instansi | baseline ATS | produksi |
| `/org/hr/recruitment/offers` | Penawaran ATS | admin_instansi | baseline ATS | produksi |
| `/org/hr/ess/requests` | Pengajuan ESS | admin_instansi | baseline ESS | produksi |
| `/org/hr/ess/leave-requests` | Cuti & Izin ESS | admin_instansi | baseline ESS | produksi |
| `/org/hr/ess/wfh-requests` | Pengajuan WFH | admin_instansi | baseline ESS | produksi |
| `/org/hr/ess/flexible-attendance` | Absensi Khusus | admin_instansi | baseline ESS | produksi |
| `/org/hr/ess/overtime-requests` | Pengajuan Lembur | admin_instansi | baseline ESS | produksi |
| `/org/hr/ess/attendance` | Kehadiran ESS | admin_instansi | baseline ESS | produksi |
| `/org/hr/ess/documents` | Dokumen ESS | admin_instansi | baseline ESS | produksi |
| `/org/hr/ess/profile` | Profil ESS | admin_instansi | baseline ESS | produksi |
| `/org/hr/employee-status` | Status Kepegawaian | admin_instansi | subdomain pegawai | produksi |
| `/org/hr/job-history` | Riwayat Jabatan | admin_instansi | subdomain pegawai | produksi |
| `/org/hr/approval-hierarchy` | Hierarki Persetujuan | admin_instansi | aktif, tetapi masih sensitif secara governance | internal terkendali |

## 2. Route Internal Terkendali

Route berikut aktif (`tampil`) tetapi secara produk lebih aman tetap dibaca sebagai internal terkendali:

| Route | Label | Alasan | Rekomendasi |
|---|---|---|---|
| `/org/hr/attendance-insights` | Analitik Kehadiran HR | domain sensitif, admin-only, boundary ke absensi harus dijaga | internal terkendali |
| `/org/hr/help/error-logs` | Log Error HR | observability sensitif, admin-only | internal terkendali |
| `/org/hr/approval-hierarchy` | Hierarki Persetujuan | governance masih mudah melebar | internal terkendali |

## 3. Route Alias atau Redirect

Ada 24 route yang jelas berfungsi sebagai alias/redirect:

| Route | Label | Redirect To | Rekomendasi |
|---|---|---|---|
| `/org/hr/faq` | Alias FAQ HR | `/org/hr/help/faq` | alias |
| `/org/hr/help` | Alias Bantuan HR | `/org/hr/help/tickets` | alias |
| `/org/hr/help/support` | Alias Bantuan HR | `/org/hr/help/tickets` | alias |
| `/org/hr/support` | Alias Tiket HR | `/org/hr/help/tickets` | alias |
| `/org/hr/tickets` | Alias Tiket HR | `/org/hr/help/tickets` | alias |
| `/org/hr/attendance-recap` | Alias Laporan HR | `/org/hr/reports` | alias |
| `/org/hr/leave-recap` | Alias Laporan HR | `/org/hr/reports` | alias |
| `/org/hr/company` | Alias Struktur Organisasi | `/org/hr/structure` | alias |
| `/org/hr/departments` | Alias Struktur Organisasi | `/org/hr/structure` | alias |
| `/org/hr/divisions` | Alias Struktur Organisasi | `/org/hr/structure` | alias |
| `/org/hr/work-locations` | Alias Struktur Organisasi | `/org/hr/structure` | alias |
| `/org/hr/work-calendar` | Alias Struktur Organisasi | `/org/hr/structure` | alias |
| `/org/hr/warning-letters` | Alias Dokumen HR | `/org/hr/documents` | alias |
| `/org/hr/contract-templates` | Alias Dokumen HR | `/org/hr/documents` | alias |
| `/org/hr/digital-signature` | Alias Dokumen HR | `/org/hr/documents` | alias |
| `/org/hr/users` | Alias Pengaturan HR | `/org/hr/settings` | alias |
| `/org/hr/roles` | Alias Pengaturan HR | `/org/hr/settings` | alias |
| `/org/hr/permissions` | Alias Pengaturan HR | `/org/hr/settings` | alias |
| `/org/hr/general-settings` | Alias Pengaturan HR | `/org/hr/settings` | alias |
| `/org/hr/import-export` | Alias Pengaturan HR | `/org/hr/settings` | alias |
| `/org/hr/backup` | Alias Pengaturan HR | `/org/hr/settings` | alias |
| `/org/hr/notifications` | Alias Pengaturan HR | `/org/hr/settings` | alias |
| `/org/hr/activity-log` | Alias Pengaturan HR | `/org/hr/settings` | alias |
| `/org/hr/branding` | Alias Pengaturan HR | `/org/hr/settings` | alias |

Route redirect lain yang juga jelas transisional:
- `/org/hr/dashboard-notifications` -> `/org/hr`
- `/org/hr/dashboard-activity` -> `/org/hr`
- `/org/hr/national-holidays` -> `/org/hr/reports`
- `/org/hr/attendance-integrations` -> `/org/hr/reports`

## 4. Gap Capability per Halaman

Gap utama saat ini bukan route availability, tetapi capability aksi.

### 4.1 Halaman Aktif Tetapi Aksi Masih Tipis

Halaman berikut aktif, tetapi capability aksi hampir kosong:

| Route | Gap Capability | Catatan |
|---|---|---|
| `/org/hr/employees` | create/edit/delete/export/configure/approve kosong | halaman hidup, tetapi action matrix masih konservatif |
| `/org/hr/reports` | create/edit/delete/export/configure/approve kosong | laporan aktif, export capability belum dinyalakan di matrix ini |
| `/org/hr/onboarding` | create/edit/delete/export/configure/approve kosong | lifecycle tampil, aksi masih tipis |
| `/org/hr/offboarding` | create/edit/delete/export/configure/approve kosong | lifecycle tampil, aksi masih tipis |
| `/org/hr/work-hours` | create/edit/delete/export/configure/approve kosong | route aktif, capability belum dalam |
| `/org/hr/recruitment/jobs` | create/edit/delete/export/configure/approve kosong | ATS baseline aktif, capability matrix masih konservatif |
| `/org/hr/recruitment/candidates` | create/edit/delete/export/configure/approve kosong | ATS baseline aktif, capability matrix masih konservatif |
| `/org/hr/recruitment/interviews` | create/edit/delete/export/configure/approve kosong | ATS baseline aktif, capability matrix masih konservatif |
| `/org/hr/recruitment/offers` | create/edit/delete/export/configure/approve kosong | ATS baseline aktif, capability matrix masih konservatif |
| `/org/hr/ess/requests` | create/edit/delete/export/configure/approve kosong | ESS baseline aktif, capability matrix masih konservatif |
| `/org/hr/ess/leave-requests` | create/edit/delete/export/configure/approve kosong | ESS baseline aktif, capability matrix masih konservatif |
| `/org/hr/ess/attendance` | create/edit/delete/export/configure/approve kosong | ESS baseline aktif, capability matrix masih konservatif |
| `/org/hr/ess/documents` | create/edit/delete/export/configure/approve kosong | ESS baseline aktif, capability matrix masih konservatif |
| `/org/hr/ess/profile` | create/edit/delete/export/configure/approve kosong | ESS baseline aktif, capability matrix masih konservatif |

### 4.2 Halaman yang Relatif Lebih Matang Secara Capability

| Route | Capability yang Sudah Jelas | Catatan |
|---|---|---|
| `/org/hr/help/tickets` | view/edit untuk admin + atasan, create/configure/approve untuk admin | salah satu yang paling matang |
| `/org/hr/help/error-logs` | edit/export/configure/approve untuk admin | internal sensitif, sudah cukup tegas |
| `/org/hr/structure` | edit/configure untuk admin | structure sudah lebih jelas |
| `/org/hr/position-grade` | edit/configure untuk admin | structure sudah lebih jelas |
| `/org/hr/leave-approval` | edit/export/configure/approve untuk admin | workflow approval sudah lebih matang |
| `/org/hr/mutation-approval` | edit/export/configure/approve untuk admin | workflow approval sudah lebih matang |
| `/org/hr/ess/wfh-requests` | edit/export/configure/approve untuk admin | ESS approval side cukup jelas |
| `/org/hr/ess/flexible-attendance` | edit/export/configure/approve untuk admin | ESS approval side cukup jelas |
| `/org/hr/ess/overtime-requests` | edit/export/configure/approve untuk admin | ESS approval side cukup jelas |

## 5. Kesimpulan Praktis

Jawaban paling jujur untuk `/org/hr` saat ini:
- route baseline: sudah kuat
- status produk: cukup matang untuk dipakai
- status final penuh: belum
- gap utama: capability aksi dan klasifikasi produk, bukan lagi aktivasi route

Interpretasi operasional:
- jika butuh jawaban singkat, katakan `/org/hr` sudah `ok sebagai baseline`
- jangan katakan `semuanya final`
- route internal sensitif tetap perlu dibaca hati-hati
- route alias tidak boleh dihitung sebagai fitur terpisah

## 6. Rekomendasi Lanjut

Urutan paling aman:

1. pertahankan route inti produksi tetap sempit dan jelas
2. jangan promosikan route internal sensitif ke “semua sudah final”
3. matangkan capability aksi untuk halaman yang sudah aktif tetapi masih konservatif
4. biarkan alias tetap sebagai alias, jangan hitung sebagai coverage fitur baru

Jika ingin audit lanjutan berikutnya, yang paling berguna adalah:
- verifikasi UI terhadap route internal sensitif
- audit capability vs implementasi tombol nyata per halaman
- audit apakah page capability terlalu ketat atau justru terlalu longgar
