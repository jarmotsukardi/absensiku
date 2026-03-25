# Panduan Membangun HR

Dokumen ini merangkum dasar-dasar HRD untuk membantu merancang, menilai, dan membangun modul HR secara bertahap.

Status repo saat ini:
- Fokus aktif harian tetap pada aplikasi absensi.
- Domain HR sekarang aktif sebagai domain kerja repo bersama absensi, dengan baseline workspace `/org/hr` yang sudah cukup lengkap untuk audit, implementasi bertahap, dan penguatan operasional lanjutan.

Keterangan sinkronisasi dokumen per 12 Maret 2026:
- sumber kebenaran status route operasional HR adalah `Status Cepat` pada dokumen ini dan policy route di `src/lib/hrRouteAccess.ts`
- beberapa bab panjang di bagian bawah masih memuat catatan fase desain dan backlog historis
- jika ada konflik antara backlog historis dan `Status Cepat`, gunakan `Status Cepat` sebagai acuan terbaru
- payroll tetap tidak dimasukkan ke panduan utama HR sampai seluruh pekerjaan HR dianggap benar-benar selesai

## Status Tunggal

Bagian ini dipakai untuk menjawab status HR dengan bahasa yang tegas dan konsisten.

- `coverage route/workspace`: sekitar `85-90%`
- `readiness operasional nyata`: sekitar `65-75%`
- `readiness sebelum payroll`: `belum lulus gate`
- `jumlah blocker utama`: `4`

Empat blocker utama saat ini:
- `Dokumen HR` belum menjadi repository dokumen pegawai penuh
- `Laporan HR` masih baseline monitoring, belum alat operasi yang dalam
- `Lifecycle` masih punya titik non-atomik, terutama pada `Offboarding`
- `ATS` masih perlu hardening akses dan tenant scoping yang merata

Arti pembacaan angka:
- `85-90% coverage` berarti mayoritas route dan halaman HR sudah hidup, bisa dibuka, dan tidak lagi sebatas blueprint
- `65-75% readiness` berarti kualitas implementasi inti belum merata; beberapa domain sudah cukup matang, tetapi blocker penting masih tersisa
- `belum lulus gate payroll` berarti HR belum boleh dianggap selesai hanya karena surface modulnya sudah luas

Jangan sebut HR `90% selesai` kecuali yang dimaksud hanya `coverage modul/route`.
Untuk operasi nyata dan kesiapan sebelum payroll, pembacaan yang benar tetap:
- `baseline kuat`
- `capability belum seragam`
- `belum selesai penuh`

## Status Cepat

Bagian ini adalah ringkasan paling praktis untuk membaca kondisi HR saat ini tanpa harus masuk dulu ke bab 32.

Yang sudah aman dipakai sekarang:
- workspace inti `/org/hr`
- baseline governance `/admin/hr` untuk audit, kebijakan, helpdesk, bridge section, dan coverage map
- `Data Pegawai`
- `Struktur Organisasi`
- `Jabatan dan Grade`
- `Kontrak Kerja`
- `Dokumen HR`
- `Template Dokumen`
- `Proses Masuk Pegawai`
- `Proses Keluar Pegawai`
- `Jam Kerja`
- `Pola Shift`
- `Pengaturan Keterlambatan`
- `Jenis Cuti`
- `Kuota Cuti`
- `Alur Persetujuan Cuti`
- `Masa Berlaku Cuti`
- `KPI`
- `Periode Penilaian`
- `Form Penilaian`
- `Ulasan 360`
- `Hasil Evaluasi`
- `Data Pelatihan`
- `Sertifikasi`
- `Matriks Kompetensi`
- `Lowongan Kerja`
- `Kandidat`
- `Tahap Interview`
- `Penawaran Kerja`
- `Pengajuan ESS`
- `Cuti & Izin ESS`
- `Kehadiran ESS`
- `Dokumen ESS`
- `Profil ESS`
- `Laporan HR`
- `Tiket HR`
- `Pengaturan HR`
- ringkasan audit ATS di `/admin/hr/audit`
- section bridge ATS di `/admin/hr/sections/rekrutmen-ats`

Status runtime praktis per 14 Maret 2026:
- `/org/hr` sudah lolos verifikasi runtime dengan akun `admin_instansi` tenant aktif, jadi guard dan resolusi tenant untuk workspace HR inti dianggap sehat
- area ESS di `/org/hr` sekarang paling stabil untuk baseline operasional: `Pengajuan ESS`, `Cuti & Izin ESS`, `Pengajuan WFH`, `Absensi Khusus`, dan `Pengajuan Lembur` terbuka normal tanpa error runtime pada audit terbaru
- `Data Pegawai` dan `Laporan HR` bukan halaman kosong atau rusak; keduanya memuat data nyata, tetapi saat ini harus dibaca sebagai `monitoring read-only`, belum sebagai modul kelola penuh
- `Proses Masuk Pegawai`, `Proses Keluar Pegawai`, dan `Lowongan Kerja` juga lolos audit runtime, tetapi surface aksinya masih lebih tipis dibanding area ESS approval
- route sensitif seperti `Analitik Kehadiran HR` dan `Log Error HR` tetap aktif, tetapi posisinya masih `internal terkendali`, bukan menu final yang perlu dipromosikan ke semua tenant

Cara cepat membaca capability produksi saat ini:
- `mode kelola relatif matang`: approval ESS, approval cuti, approval mutasi, tiket HR, log error HR
- `baseline operasional stabil`: workspace inti HR, onboarding, offboarding, ATS inti, ESS inti
- `monitoring read-only`: `Data Pegawai` dan `Laporan HR`
- `internal terkendali`: `Analitik Kehadiran HR`, `Log Error HR`, `Hierarki Persetujuan`
- `alias`: tetap diperlakukan sebagai pintasan ke route utama, bukan coverage fitur baru

Yang masih diberi label `Internal` atau `Alias`:
- `Analitik Kehadiran HR`
- `Log Error HR`
- `Hierarki Persetujuan`
- alias bantuan HR (`/org/hr/help`, `/org/hr/help/support`, `/org/hr/support`, `/org/hr/tickets`)
- alias laporan dan pengaturan (`/org/hr/attendance-recap`, `/org/hr/leave-recap`, `/org/hr/users`, `/org/hr/roles`, `/org/hr/permissions`, `/org/hr/import-export`, `/org/hr/backup`, `/org/hr/notifications`, `/org/hr/activity-log`, `/org/hr/branding`)
- alias struktur dan dokumen (`/org/hr/company`, `/org/hr/departments`, `/org/hr/divisions`, `/org/hr/work-locations`, `/org/hr/work-calendar`, `/org/hr/warning-letters`, `/org/hr/contract-templates`, `/org/hr/digital-signature`)

Yang jangan didahulukan dulu:
- ekspansi governance HR yang terlalu lebar
- pemindahan ownership absensi harian ke domain HR
- payroll di panduan utama HR

Kalau butuh menjawab apakah fondasi HR sudah siap menjadi dasar payroll, gunakan dokumen terpisah:
- `docs/hr-to-payroll-readiness.md`
- `docs/hr-payroll-ready-fields.md`
- `docs/hr-payroll-readiness-execution-plan.md`

Cara cepat membaca status:
- kalau sebuah halaman tidak diberi label `Internal`, anggap itu kandidat produksi inti
- kalau sebuah halaman diberi label `Internal`, anggap itu route transisi yang boleh dibuka tetapi belum final
- kalau sebuah halaman diberi label `Alias`, anggap route itu hanya jalan pintas ke halaman target yang sekarang menjadi sumber kebenaran
- untuk status Maret 2026, badge `Tunda` di workspace HR sudah seharusnya habis dari domain inti `/org/hr`; yang tersisa tinggal `Internal` dan `Alias` yang memang sengaja dipertahankan

Catatan sinkronisasi status:
- ATS, ESS, Kinerja, dan Pelatihan sudah aktif sebagai baseline tenant di `/org/hr`
- `/admin/hr` aktif sebagai baseline governance dan observability, bukan lagi area yang dibaca sebagai domain tertunda
- jika menemukan bab lain di dokumen ini yang masih menyebut ATS, ESS, Kinerja, atau Pelatihan sebagai `tunda`, anggap itu catatan historis yang belum dibersihkan penuh
- untuk status operasional Maret 2026, pembacaan terbaik untuk `/org/hr` adalah: `baseline kuat, capability belum seragam`
- gap terbesar sekarang bukan aktivasi route, tetapi kedalaman aksi per halaman
- readiness HR ke payroll tidak dinilai di dokumen utama ini; pakai `docs/hr-to-payroll-readiness.md` sebagai gate operasional terpisah
- untuk checklist field minimum yang harus lengkap sebelum payroll, pakai `docs/hr-payroll-ready-fields.md`
- untuk daftar kerja konkret agar status berubah dari `partial` ke `ready`, pakai `docs/hr-payroll-readiness-execution-plan.md`
- eksekusi penutupan gap readiness payroll mulai dari `employees`; target batch awal adalah menggeser `Data Pegawai` dari monitoring read-only ke mode kelola ringan sebelum lanjut ke status kepegawaian dan kontrak
- progres implementasi saat ini: `employees` sudah naik dari mode kelola ringan ke baseline master operasional dengan `create`, `edit`, `status`, `export`, pintu masuk `import`, validasi field `NIK`, `kategori`, `jabatan`, duplikasi `email/NIP/NIK` yang null-safe, create path yang sekarang ikut menyimpan relasi `OPD`, `Unit Kerja`, `Lokasi`, dan `Jabatan Master`, dialog `Tambah/Edit Pegawai` yang kini scrollable, panel `Field Prioritas Payroll` untuk pegawai yang belum lengkap, quick-fill `Kategori Pegawai`, tombol gap yang langsung memfokuskan field terkait, workflow batch review dari `Butuh Review` lewat `Sebelumnya`, `Berikutnya`, `Simpan & Lanjut`, indikator progres `x dari y`, serta bulk action kategori dengan audit log yang sekarang dilindungi dialog konfirmasi, preview pegawai terdampak, dan opsi seleksi baris agar bulk tidak harus menyentuh seluruh hasil filter; indikator gap payroll-impact juga sudah ada di UI melalui kartu `Payroll-Ready Aktif`, tab `Butuh Review`, badge gap per pegawai, checklist gap per field di tab `Ringkasan`, tombol `Fokuskan` agar admin bisa langsung masuk ke filter gap terkait, dan export yang sekarang mengikuti filter gap yang sedang aktif; `status kepegawaian` sudah punya mutasi dengan tanggal efektif + alasan minimum dan smoke write UI yang lolos, `contracts` sekarang sudah punya status efektif + alasan status + audit minimum plus validasi `effective_date` dan overlap kontrak aktif yang lebih tegas serta smoke `create -> delete` UI yang lolos, invitation onboarding juga sudah lolos smoke `create -> delete` di `/org/invitations`, `offboarding` sekarang sudah `mode kelola` untuk admin organisasi, save path-nya sudah kompatibel dengan schema remote, dan smoke reversible `offboarding -> reactivation` sudah lolos, approval cuti + WFH + lembur + mutasi + absensi khusus serta invitation onboarding sudah ikut ke jejak `audit_logs`, dan `reports` sudah naik ke baseline audit ringan dengan filter + print + export plus ringkasan audit trail payroll-impact; gap besar berikutnya bergeser ke operasi master pegawai pada data tenant nyata, termasuk pembersihan pegawai aktif yang masih kosong `kategori`, pendalaman review data nyata, dan verifikasi end-to-end lifecycle lain

## Checklist Eksekusi Singkat HR

Checklist ini dipakai bila tujuannya adalah menggeser HR dari `baseline kuat` menjadi `siap produksi lebih dalam` tanpa memperlebar scope terlalu cepat.

1. Matangkan `Data Pegawai` pada data tenant nyata
- tutup gap data wajib seperti `kategori`, relasi jabatan, unit kerja, lokasi, dan field identitas yang masih bolong
- verifikasi alur `create`, `edit`, `status`, `import`, `export`, dan batch review pada tenant aktif
- anggap tahap ini selesai jika `Data Pegawai` tidak lagi perlu dibaca sebagai `monitoring read-only`

2. Rapikan lifecycle pegawai end-to-end
- lanjutkan verifikasi nyata untuk `status kepegawaian`, `kontrak`, onboarding, dan offboarding
- pastikan validasi tanggal efektif, overlap, alasan perubahan, dan audit log tetap konsisten pada data remote
- anggap tahap ini selesai jika mutasi lifecycle utama lolos smoke dan review manual tanpa kasus data ambigu

3. Matangkan `Dokumen HR`
- lengkapi repository dokumen pegawai agar bukan sekadar halaman hidup
- pastikan upload, pencarian, kategorisasi, relasi ke pegawai, dan audit akses cukup jelas untuk operasi harian
- anggap tahap ini selesai jika dokumen pegawai penting bisa dicari dan dikelola tanpa jalur manual di luar sistem

4. Perdalam `Laporan HR`
- perluas laporan dari baseline audit ringan menjadi laporan operasional yang benar-benar dipakai admin
- fokus ke filter, ringkasan, print/export, dan keterbacaan indikator penting lintas pegawai, kontrak, dan lifecycle
- anggap tahap ini selesai jika laporan tidak lagi dibaca sebagai `monitoring read-only` atau blueprint parsial

5. Perdalam `Pengaturan HR` dan governance yang sudah aktif
- lanjutkan hanya konfigurasi yang langsung memperjelas ownership, policy, role, dan capability halaman
- jangan perluas governance terlalu lebar sebelum domain tenant yang masih `sebagian` benar-benar matang
- anggap tahap ini selesai jika pengaturan inti cukup untuk mengoperasikan tenant HR tanpa override manual yang sering

6. Jaga boundary dan tahan ekspansi prematur
- jangan pindahkan ownership absensi harian ke HR
- jangan masukkan payroll ke panduan utama HR sebelum gate readiness terpisah benar-benar lolos
- jangan promosikan route `Internal` ke menu final sebelum capability utamanya matang

Urutan eksekusi yang disarankan:
- `pegawai`
- `lifecycle`
- `dokumen`
- `laporan`
- `governance`

Definisi selesai minimum:
- domain utama tidak lagi `read-only` untuk operasi inti
- audit log, guard, dan capability tetap konsisten
- data tenant nyata sudah dibersihkan pada gap prioritas tinggi
- route `Internal` yang tersisa memang sengaja ditahan, bukan karena capability belum disentuh
- tidak ada ekspansi ke payroll atau domain legal lanjutan sebelum fondasi tenant HR stabil

## Batch Eksekusi HR yang Disarankan

Batch ini dipakai untuk menerjemahkan checklist di atas menjadi pekerjaan implementasi yang bisa dikerjakan bertahap tanpa kehilangan arah.

### Batch 1. Pegawai

Fokus:
- tutup gap data pegawai yang masih menghambat operasi tenant nyata
- stabilkan alur master pegawai sebagai sumber kebenaran HR

Target hasil:
- `Data Pegawai` tidak lagi dibaca sebagai halaman monitoring
- field wajib prioritas tinggi sudah bersih pada tenant aktif
- create/edit/status/import/export/batch review berjalan konsisten

Validasi minimum:
- smoke CRUD utama pada data remote
- review manual daftar pegawai yang masih punya gap prioritas
- verifikasi audit log untuk perubahan penting

Dependency:
- relasi `OPD`, `Unit Kerja`, `Lokasi`, dan `Jabatan Master` harus tetap sinkron

### Batch 2. Lifecycle

Fokus:
- rapikan `status kepegawaian`, `kontrak`, onboarding, dan offboarding
- tutup ambiguity pada tanggal efektif, alasan perubahan, dan overlap

Target hasil:
- lifecycle inti pegawai bisa dipakai end-to-end pada tenant nyata
- tidak ada jalur perubahan status yang rawan data ganda atau status ambigu

Validasi minimum:
- smoke `create -> edit -> status change` untuk lifecycle utama
- smoke reversible untuk alur yang memang mendukung rollback seperti offboarding/reactivation
- review manual kasus efektif date dan overlap kontrak

Dependency:
- master pegawai pada Batch 1 sudah cukup stabil

### Batch 3. Dokumen

Fokus:
- naikkan `Dokumen HR` dari halaman hidup menjadi repository operasional
- perjelas upload, pencarian, kategorisasi, dan relasi dokumen ke pegawai

Target hasil:
- dokumen pegawai penting bisa dikelola tanpa spreadsheet atau folder manual di luar sistem
- akses dan audit dokumen sensitif cukup jelas

Validasi minimum:
- smoke upload, edit metadata, pencarian, dan buka dokumen
- review manual relasi dokumen terhadap pegawai dan kategori
- verifikasi capability akses untuk role yang relevan

Dependency:
- identitas dan relasi pegawai dari Batch 1 harus stabil

### Batch 4. Laporan

Fokus:
- perdalam `Laporan HR` agar menjadi alat operasi, bukan hanya observasi
- perluas filter, ringkasan, export, dan indikator lintas domain HR

Target hasil:
- admin tenant bisa membaca kondisi pegawai, kontrak, dan lifecycle tanpa audit manual berulang
- laporan utama tidak lagi dibaca sebagai monitoring parsial

Validasi minimum:
- smoke filter, print/export, dan ringkasan utama
- review manual kecocokan angka ringkasan dengan data sumber
- cek keterbacaan indikator yang payroll-impact atau lifecycle-impact

Dependency:
- data pegawai dan lifecycle dari Batch 1-2 sudah cukup bersih

### Batch 5. Governance

Fokus:
- perdalam `Pengaturan HR`, policy, role, dan ownership operasional
- rapikan capability halaman tanpa memperluas governance terlalu cepat

Target hasil:
- tenant HR bisa dioperasikan dengan konfigurasi inti yang jelas
- override manual berulang berkurang

Validasi minimum:
- review manual policy matrix dan capability halaman sensitif
- smoke akses role utama ke halaman yang paling kritis
- verifikasi route `Internal` yang masih hidup memang sengaja ditahan

Dependency:
- Batch 1-4 sudah menutup gap operasi inti yang paling nyata

Aturan urutan:
- selesaikan blocker data di batch awal sebelum pindah ke batch berikutnya
- kalau batch berikutnya terganggu karena data tenant belum bersih, kembali ke batch sebelumnya
- jangan buka batch payroll, legal lanjutan, atau ekspansi sidebar baru sebelum lima batch ini stabil

Catatan FAQ:
- untuk saat ini, `FAQ HR` tidak dijadikan fokus dokumentasi operasional
- sinkronisasi atau finalisasi FAQ formal dilakukan nanti setelah pekerjaan HR benar-benar selesai dan struktur modul sudah stabil

## 1. Apa Itu HRD

HRD adalah fungsi yang mengelola siklus hidup pegawai dari awal sampai akhir, bukan hanya administrasi data.

Secara praktis, HRD mencakup:
- perencanaan kebutuhan tenaga kerja
- rekrutmen dan seleksi
- onboarding pegawai baru
- pengelolaan data dan dokumen pegawai
- pengaturan struktur organisasi, jabatan, grade, dan status kerja
- pengelolaan kehadiran, cuti, izin, dan kebijakan kerja
- performance management
- pelatihan dan pengembangan
- offboarding atau pemutusan hubungan kerja

Kalau absensi menjawab pertanyaan "siapa hadir dan kapan", maka HR menjawab "siapa orangnya, posisinya apa, kontraknya apa, haknya apa, performanya bagaimana, dan proses organisasinya bagaimana".

## 2. Tujuan Dasar Modul HR

Modul HR yang baik harus memenuhi tujuan berikut:
- menjadi sumber data pegawai yang konsisten
- menurunkan pekerjaan manual dan duplikasi spreadsheet
- memastikan kebijakan SDM bisa diterapkan secara seragam
- menyediakan jejak audit untuk perubahan penting
- menjadi fondasi bagi payroll, approval, dan reporting

Indikator bahwa modul HR dibangun dengan benar:
- data pegawai hanya punya satu sumber kebenaran
- perubahan status/jabatan/kontrak bisa dilacak
- dokumen penting mudah dicari
- approval flow jelas
- role dan permission tidak bercampur

## 3. Pilar Inti HR

### 3.1 Struktur Organisasi

Fondasi pertama adalah struktur organisasi. Tanpa ini, data HR akan cepat kacau.

Data minimum:
- perusahaan/tenant
- unit kerja, departemen, divisi
- lokasi kerja
- jabatan
- grade/golongan
- atasan langsung

Pertanyaan desain:
- satu pegawai hanya boleh punya satu atasan aktif atau bisa lebih dari satu?
- jabatan menempel ke unit, atau bisa lintas unit?
- grade hanya referensi payroll, atau juga dipakai untuk approval dan benefit?

### 3.2 Master Pegawai

Ini adalah inti dari modul HR.

Data minimum pegawai:
- identitas dasar
- nomor induk pegawai
- email dan nomor kontak
- unit kerja
- jabatan
- status aktif/nonaktif
- tanggal masuk
- tipe pegawai
- relasi ke user login

Data tambahan yang biasanya dibutuhkan:
- alamat
- kontak darurat
- NPWP/NIK
- pendidikan
- sertifikasi
- dokumen legal

Prinsip penting:
- pisahkan data identitas, status kerja, dan akun login
- jangan campur data user authentication dengan profil pegawai
- perubahan historis harus bisa dilacak

### 3.3 Kontrak dan Status Kerja

HR hampir selalu butuh membedakan:
- pegawai tetap
- kontrak
- magang
- harian/lepas
- nonaktif

Setiap kontrak idealnya punya:
- tanggal mulai
- tanggal berakhir
- jenis kontrak
- status kontrak
- dokumen kontrak
- kompensasi dasar bila nanti terhubung ke payroll

Hal yang wajib dijaga:
- jangan izinkan kontrak aktif overlap tanpa aturan jelas
- perubahan status harus punya tanggal efektif
- offboarding tidak boleh langsung menghapus data historis

### 3.4 Kehadiran dan Kebijakan Kerja

Walau absensi adalah domain aktif repo ini, HR tetap perlu mengatur kebijakan yang menjadi dasar absensi:
- jam kerja
- shift
- keterlambatan
- WFH/WFA jika ada
- hari libur
- kalender kerja
- approval izin/cuti

Pemisahan tanggung jawab yang sehat:
- modul absensi menangani event kehadiran
- modul HR menangani kebijakan orang, struktur, dan hak pegawai

### 3.5 Cuti dan Izin

Area ini biasanya menjadi jembatan antara HR dan absensi.

Entitas minimum:
- jenis cuti/izin
- kuota
- masa berlaku
- approver
- status approval
- dokumen pendukung

Hal yang harus jelas sejak awal:
- apakah kuota cuti dihitung per tahun kalender atau per masa kerja?
- siapa approver level 1, 2, dan eskalasinya?
- apakah cuti memotong kehadiran otomatis?

### 3.6 Performance dan Development

Ini bukan prioritas paling awal, tetapi desainnya perlu disiapkan.

Komponen umumnya:
- KPI
- periode penilaian
- form evaluasi
- hasil penilaian
- training
- sertifikasi
- skill matrix

Kalau belum dibangun penuh, minimal sediakan struktur data yang tidak menghalangi ekspansi.

### 3.7 Dokumen dan Legal

HR selalu berhadapan dengan dokumen sensitif.

Dokumen umum:
- kontrak kerja
- surat keputusan
- surat peringatan
- sertifikat
- dokumen onboarding/offboarding

Prinsip minimum:
- metadata dokumen harus searchable
- file dan metadata dipisahkan
- akses dokumen harus ketat
- perubahan dokumen penting perlu audit

## 4. Siklus Hidup Pegawai

Cara paling aman membangun HR adalah mengikuti employee lifecycle:

1. manpower planning
2. recruitment
3. hiring
4. onboarding
5. active employment
6. movement atau mutation
7. performance/development
8. offboarding
9. archival dan audit

Kalau setiap tahap punya data, status, actor, dan tanggal efektif yang jelas, modul HR akan jauh lebih stabil.

## 5. Data yang Sebaiknya Historis

Beberapa data tidak boleh hanya menyimpan nilai terakhir:
- jabatan
- unit kerja
- atasan
- status kepegawaian
- kontrak
- grade/golongan
- salary basis jika kelak terhubung ke payroll

Aturan praktis:
- gunakan effective date
- simpan siapa yang mengubah
- simpan alasan perubahan bila relevan

## 6. Role dan Permission Dasar

Modul HR sangat sensitif, jadi role harus dibatasi dari awal.

Contoh role minimum:
- super admin platform
- admin organisasi
- operator HR
- atasan/approver
- pegawai biasa

Pisahkan antara:
- hak lihat
- hak ubah
- hak approve
- hak akses dokumen sensitif
- hak akses konfigurasi

Prinsip utama:
- jangan mengandalkan hidden button di frontend
- aturan kritikal harus ditegakkan juga di backend/RLS

## 7. KPI Dasar Untuk HR

KPI awal yang paling berguna biasanya:
- total pegawai aktif
- pegawai baru bulan ini
- kontrak akan habis
- posisi kosong
- tingkat turnover
- tingkat keterlambatan
- tingkat kehadiran
- jumlah cuti/izin pending
- SLA tiket HR

Catatan penting:
- KPI harus punya definisi jelas
- jangan campur data HR dengan support umum atau modul lain tanpa label sumber

## 8. Urutan Membangun Modul HR

Urutan yang disarankan:

1. struktur organisasi dan master data pegawai
2. status kerja dan kontrak
3. kebijakan kehadiran, cuti, dan approval
4. dokumen dan audit log
5. dashboard dan reporting
6. performance, training, dan ESS
7. integrasi payroll

Jangan mulai dari dashboard yang indah kalau data dasar dan lifecycle belum rapi.

## 9. Kesalahan Umum Saat Membangun HR

Kesalahan yang sering terjadi:
- menjadikan tabel pegawai sebagai tempat semua hal
- tidak menyimpan histori perubahan
- approval flow ditulis keras di UI
- dokumen sensitif bisa dibaca terlalu banyak role
- struktur organisasi tidak konsisten dengan data pegawai
- kontrak dan status aktif tidak sinkron
- KPI dihitung dari data yang tidak dibedakan per domain

## 10. Checklist Minimum Modul HR

Sebuah modul HR layak disebut usable jika minimal punya:
- master pegawai
- struktur organisasi
- jabatan dan grade
- kontrak kerja
- status kepegawaian
- kebijakan kerja dasar
- leave/permission baseline
- audit log
- role/permission dasar
- error handling dengan referensi error

## 11. Relevansi Untuk Repo Ini

Untuk konteks repo ABSENSIKU:
- absensi tetap domain aktif utama
- HR sebaiknya diposisikan sebagai layer people policy dan employee lifecycle
- integrasi HR ke absensi harus satu arah yang jelas: kebijakan dari HR, event operasional dari absensi
- payroll baru aman dibangun setelah master data HR, kontrak, grade, dan status kerja benar-benar stabil

## 12. Rekomendasi Praktis Selanjutnya

Kalau nanti domain HR diaktifkan kembali, urutan kerja yang rasional:

1. review ulang model data pegawai, kontrak, dan histori jabatan
2. tentukan boundary HR vs absensi vs payroll
3. tetapkan role matrix dan enforcement backend
4. definisikan KPI HR yang benar-benar terpisah dari helpdesk umum
5. bangun halaman produksi dimulai dari employee lifecycle, bukan dari fitur pinggiran

## 13. Apa Yang Perlu Dikerjakan

Supaya HR tidak terasa membingungkan, pekerjaan harus dipecah ke unit kecil dan urut.

Yang perlu dikerjakan:
- tetapkan ruang lingkup HR versi awal
- rapikan struktur menu agar mengikuti alur HR, bukan daftar fitur acak
- tentukan halaman mana yang benar-benar produksi dan mana yang masih scaffold
- rapikan istilah agar label menu, heading halaman, dan route konsisten
- pisahkan data HR dari support umum, absensi umum, dan payroll
- tetapkan role matrix HR yang sederhana lalu enforce di backend
- tentukan KPI HR yang valid dan sumber datanya
- siapkan roadmap bertahap agar tidak semua domain HR dibangun sekaligus

### 13.1 Mulai Dari Yang Sederhana

Jangan mulai dari modul yang paling kompleks. Mulai dari fondasi yang paling mudah dipahami user.

Urutan sederhana yang disarankan:

1. definisi istilah HR
2. struktur menu HR
3. master data pegawai
4. struktur organisasi dan jabatan
5. status kepegawaian dan kontrak
6. helpdesk HR
7. dashboard HR

### 13.2 Definisi Istilah HR

Langkah pertama adalah menyamakan bahasa.

Istilah yang harus punya definisi tunggal:
- pegawai
- karyawan
- admin organisasi
- operator HR
- atasan
- struktur organisasi
- unit kerja
- departemen
- divisi
- jabatan
- grade
- golongan
- status kepegawaian
- kontrak kerja
- proses masuk pegawai
- proses keluar pegawai

Kalau istilah belum konsisten, user akan bingung walau fiturnya sebenarnya sudah ada.

### 13.3 Struktur Menu HR Sederhana

Versi awal menu HR sebaiknya ringkas dulu.

Menu sederhana yang paling masuk akal:
- Beranda HR
- Fondasi Organisasi
- Operasional SDM
- Layanan Pegawai
- Monitoring
- Dukungan
- Konfigurasi

Menu lanjutan seperti berikut bisa ditunda ke fase berikutnya:
- kinerja
- pelatihan
- rekrutmen ATS
- ESS
- analitik lanjutan
- pusat integrasi

### 13.4 Halaman Pertama Yang Perlu Benar-Benar Jadi

Sebelum memperluas modul, ada beberapa halaman yang harus benar-benar matang:
- Data Pegawai
- Struktur Organisasi
- Jabatan dan Grade
- Kontrak Kerja
- Tiket HR
- Pengaturan HR

Kriteria minimal halaman matang:
- heading jelas
- fungsi utama benar-benar jalan
- ada loading, empty, dan error state
- akses role jelas
- tidak bergantung pada shortcut yang membingungkan

### 13.5 Yang Belum Perlu Dikerjakan Dulu

Agar fokus tetap terjaga, beberapa area boleh ditunda:
- automation HR yang kompleks
- scoring performance detail
- 360 review penuh
- training engine
- recruitment ATS lengkap
- ESS yang terlalu luas
- integrasi payroll yang dalam

### 13.6 Output Sederhana Yang Harus Ada

Kalau mulai dari sederhana, output awal yang diharapkan adalah:
- peta menu HR yang ringkas
- daftar halaman inti dan tujuannya
- daftar data minimum tiap halaman
- daftar role yang boleh lihat dan ubah
- daftar KPI awal HR
- pemisahan yang jelas antara HR, absensi, dan payroll

## 14. Pengelompokan Menu Sidebar HR

Sidebar HR tidak boleh disusun seperti daftar semua fitur yang pernah dibuat. Sidebar harus mengikuti cara pikir user HR saat bekerja.

Prinsip pengelompokan menu:
- kelompokkan berdasarkan domain kerja, bukan berdasarkan nama tabel
- utamakan menu yang sering dipakai
- jangan campur halaman inti dengan halaman scaffold
- jangan campur konfigurasi sistem dengan operasional harian
- jangan campur helpdesk dengan KPI utama
- hindari submenu terlalu dalam

### 14.1 Sidebar HR Versi Sederhana

Versi awal yang paling mudah dipahami:

- Beranda HR
- Fondasi Organisasi
- Operasional SDM
- Layanan Pegawai
- Monitoring
- Dukungan
- Konfigurasi

Ini cocok untuk fase awal karena user bisa langsung mengerti:
- titik masuk workspace
- fondasi organisasi
- data dan dokumen pegawai
- layanan pegawai yang belum final
- monitoring operasional
- dukungan
- konfigurasi

### 14.2 Pengelompokan Yang Disarankan

Kalau modul mulai membesar, sidebar sebaiknya dikelompokkan seperti ini:

### A. Beranda

Isi:
- Ringkasan HR

Tujuan:
- memberi gambaran cepat tentang kondisi HR hari ini

### B. Fondasi Organisasi

Isi:
- Struktur Organisasi
- Jabatan dan Grade

Tujuan:
- menyimpan fondasi struktur organisasi dan level jabatan

### C. Operasional SDM

Isi:
- Data Pegawai
- Kontrak Kerja
- Dokumen HR

Tujuan:
- mengelola data inti pegawai, hubungan kerja, dan dokumen utama

### D. Layanan Pegawai

Isi:
- Proses Masuk Pegawai
- Proses Keluar Pegawai
- Pengaturan Keterlambatan
- Jenis Cuti
- Kuota Cuti

Tujuan:
- menampung route kerja HR yang masih hidup tetapi belum menjadi paket produksi inti

### E. Monitoring

Isi:
- Laporan HR
- Analitik Kehadiran HR
- Log Error HR

Tujuan:
- memantau kondisi HR tanpa mencampur area operasional dengan helpdesk umum

### F. Dukungan

Isi:
- Tiket HR
- FAQ HR bila nanti sudah final

Tujuan:
- memusatkan bantuan dan tindak lanjut masalah

### G. Konfigurasi

Isi:
- Pengaturan HR

Tujuan:
- mengelola konfigurasi dan governance

### 14.3 Yang Sebaiknya Tidak Dicampur

Beberapa menu terlihat dekat, tetapi sebaiknya tidak dicampur:

- `Data Pegawai` jangan dicampur dengan `Pengaturan`
- `Kontrak Kerja` jangan dicampur dengan `Dokumen Legal`
- `Tiket HR` jangan diletakkan di kelompok utama operasional pegawai
- `Role dan Permission` jangan disatukan dengan `Data Pegawai`
- `Dashboard` jangan berisi semua shortcut sampai menyaingi sidebar

### 14.4 Urutan Prioritas di Sidebar

Urutan menu harus mengikuti prioritas pakai:

1. Dashboard
2. Fondasi Organisasi
3. Operasional SDM
4. Layanan Pegawai
5. Monitoring
6. Dukungan
7. Konfigurasi

Kalau user HR paling sering membuka data pegawai, kontrak, dan struktur organisasi, tiga area itu harus lebih mudah dijangkau daripada menu dukungan atau konfigurasi.

### 14.5 Aturan Praktis Naming Sidebar

Nama menu harus:
- singkat
- konsisten
- berbasis istilah bisnis
- tidak terlalu teknis

Contoh yang lebih baik:
- `Data Pegawai` lebih baik daripada `Employee Master`
- `Jabatan dan Grade` lebih baik daripada `Position Grade Matrix`
- `Bantuan HR` lebih baik daripada `Support Center`
- `Proses Masuk Pegawai` lebih baik daripada `Onboarding`
- `Proses Keluar Pegawai` lebih baik daripada `Offboarding`

### 14.6 Batas Jumlah Menu

Agar tidak terasa sesak:
- top-level group idealnya 6 sampai 8 kelompok
- submenu idealnya 3 sampai 7 item per kelompok
- kalau satu kelompok terlalu panjang, berarti domainnya belum dipisah dengan benar

### 14.7 Prinsip Untuk Repo Ini

Untuk ABSENSIKU, sidebar HR sebaiknya:
- fokus dulu pada HR inti
- menunda menu ATS, ESS, performance, dan training bila belum matang
- memisahkan jelas menu HR dari absensi dan payroll
- memastikan heading halaman mengikuti nama menu sidebar
- memastikan KPI HR tidak bercampur dengan helpdesk umum

## 15. Draft Sidebar HR Untuk ABSENSIKU

Bagian ini adalah draft praktis agar menu HR di repo ini tidak terus melebar tanpa bentuk.

### 15.0 Struktur Sidebar HR Yang Dipakai Sekarang

Bagian ini merapikan struktur sidebar HR agar cocok dengan kondisi ABSENSIKU saat ini.

Prinsip penyesuaian:
- yang tampil sekarang hanya paket HR tenant yang sudah dianggap produksi minimum
- yang masih bergantung pada domain absensi aktif tetap diperlakukan sebagai route internal atau domain induknya
- payroll, recruitment, performance, training, ESS, dan lifecycle lanjutan belum dijadikan menu utama HR tenant

#### A. Menu yang aktif sekarang di sidebar `/org/hr`

### 1. Beranda

Isi yang aktif sekarang:
- Ringkasan HR

Catatan:
- ini adalah pintu masuk utama workspace HR
- statistik karyawan, kehadiran hari ini, pengajuan pending, dan pengumuman HR belum dipisah menjadi submenu sendiri

### 2. Fondasi Organisasi

Isi yang aktif sekarang:
- Struktur Organisasi
- Jabatan dan Grade

Catatan:
- route seperti `departemen`, `divisi`, `lokasi kerja`, dan `kalender kerja` tetap dianggap turunan atau alias
- fondasi organisasi dipisahkan dari operasional pegawai agar struktur domain lebih jelas

### 3. Operasional SDM

Isi yang aktif sekarang:
- Data Pegawai
- Kontrak Kerja
- Dokumen HR

Catatan:
- data pegawai tetap menjadi inti domain ini
- kontrak kerja dan dokumen HR diposisikan sebagai bagian operasional inti, bukan submenu kebijakan

### 4. Layanan Pegawai

Isi yang aktif sekarang:
- Proses Masuk Pegawai
- Proses Keluar Pegawai
- Pengaturan Keterlambatan
- Jenis Cuti
- Kuota Cuti

Catatan:
- group ini dipakai untuk route hidup yang masih `Tunda`
- artinya halaman bisa dibuka, tetapi belum dianggap paket final workspace HR

### 5. Monitoring

Isi yang aktif sekarang:
- Laporan HR
- Analitik Kehadiran HR
- Log Error HR

Catatan:
- laporan dan pemantauan teknis ditempatkan dalam satu group agar user HR mudah membedakan area kerja dengan area observasi

### 6. Dukungan

Isi yang aktif sekarang:
- Tiket HR

Catatan:
- `FAQ HR` sengaja belum dijadikan fokus utama dokumentasi
- finalisasi FAQ dilakukan nanti setelah seluruh pekerjaan HR selesai dan boundary modul sudah stabil

### 7. Konfigurasi

Isi yang aktif sekarang:
- Pengaturan HR

Catatan:
- route seperti `user management`, `role dan permission`, dan konfigurasi sistem tetap masuk di bawah halaman pengaturan atau alias route, bukan submenu utama

#### B. Menu profesional yang belum aktif sebagai sidebar utama HR

Status `internal` atau tetap di domain lain:
- `Absensi`
- `Shift Kerja`
- `Lembur`
- `Cuti dan Izin`
- `Logout`

Catatan:
- area absensi, shift, lembur, dan cuti masih punya domain operasionalnya sendiri dan belum dipindahkan menjadi menu utama HR tenant
- `Keluar aplikasi` adalah aksi global layout, bukan group sidebar HR

Status `ditunda` untuk fase berikutnya:
- `Penggajian`
- `Tunjangan dan Potongan`

Catatan:
- beberapa route payroll memang sudah ada di codebase
- namun untuk fase aktif saat ini, payroll belum dianggap bagian dari paket minimum sidebar HR tenant
- rekrutmen, kinerja, dan pelatihan sudah aktif sebagai baseline tenant HR, jadi tidak lagi masuk daftar `ditunda`

Ringkasan struktur yang benar-benar dipakai sekarang:
- `Beranda`
- `Fondasi Organisasi`
- `Operasional SDM`
- `Layanan Pegawai`
- `Monitoring`
- `Dukungan`
- `Konfigurasi`

#### C. Tabel Keputusan Menu Baru

| Menu | Pakai Sekarang | Status Sekarang | Alasan |
| --- | --- | --- | --- |
| Beranda | Ya | aktif | sudah menjadi pintu masuk utama workspace HR |
| Fondasi Organisasi | Ya | aktif | memuat struktur organisasi dan jabatan/grade sebagai fondasi domain |
| Operasional SDM | Ya | aktif | memuat data pegawai, kontrak kerja, dan dokumen HR inti |
| Layanan Pegawai | Ya | aktif | lifecycle pegawai dan kebijakan inti HR sudah hidup sebagai baseline tenant |
| Monitoring | Ya | aktif | memuat laporan HR, analitik kehadiran, dan log error HR |
| Dukungan | Ya | aktif | tiket HR aktif; FAQ formal ditunda finalisasinya |
| Konfigurasi | Ya | aktif | pengaturan HR menjadi induk untuk route konfiguratif dan alias lama |
| Absensi | Tidak | domain lain/internal | domain absensi tetap menjadi modul operasional utama, bukan menu HR tenant |
| Shift Kerja | Tidak | internal/domain lain | masih terkait domain absensi dan belum layak jadi menu HR utama |
| Lembur | Tidak | internal/domain lain | masih mengikuti alur operasional absensi dan approval yang terpisah |
| Cuti dan Izin | Tidak | internal/domain lain | masih berada di domain leave yang aktif, belum dipindah ke sidebar HR |
| Penggajian | Tidak | terpisah dari baseline HR | payroll tidak menjadi menu utama HR pada baseline dokumen ini |
| Tunjangan dan Potongan | Tidak | terpisah dari baseline HR | bagian dari payroll lanjutan, belum diaktifkan sebagai menu utama HR |
| Rekrutmen | Ya | aktif | ATS sudah hidup sebagai baseline tenant HR |
| Penilaian Kinerja | Ya | aktif | domain kinerja sudah hidup sebagai baseline tenant HR |
| Pelatihan | Ya | aktif | domain pelatihan sudah hidup sebagai baseline tenant HR |
| Logout | Tidak | aksi global | logout bukan group sidebar HR, tetapi aksi layout aplikasi |

Aturan pakai tabel ini:
- `Ya` berarti menu layak tampil sekarang di sidebar `/org/hr`
- `Tidak` dengan status `internal/domain lain` berarti route bisa tetap hidup, tetapi jangan dipromosikan ke sidebar HR utama
- `Tidak` dengan status `terpisah dari baseline HR` berarti belum masuk sidebar HR utama pada baseline dokumen ini
- `aksi global` berarti bukan bagian dari struktur menu HR

Pemakaian praktis:
- kalau user bertanya "menu baru dipakai kapan", jawabannya adalah saat statusnya sudah `aktif`
- kalau sebuah menu masih `internal/domain lain`, tetap pertahankan boundary domain
- kalau sebuah menu masih `terpisah dari baseline HR`, tunggu sampai halaman, role, dan alur kerjanya benar-benar matang

### 15.1 Versi Sidebar Yang Disarankan Sekarang

Untuk fase sekarang, sidebar HR sebaiknya cukup berisi:

- Beranda
- Fondasi Organisasi
- Operasional SDM
- Layanan Pegawai
- Monitoring
- Dukungan
- Konfigurasi

### 15.2 Bentuk Group Sidebar Yang Disarankan

#### Group 1: Beranda

Isi:
- Ringkasan HR

Route utama:
- `/org/hr`

#### Group 2: Fondasi Organisasi

Isi:
- Struktur Organisasi
- Jabatan dan Grade

Route utama:
- `/org/hr/structure`
- `/org/hr/position-grade`

Catatan:
- `departemen`, `divisi`, dan `lokasi kerja` tetap dianggap turunan fondasi organisasi
- route alias organisasi tetap boleh hidup tanpa harus dipromosikan ke sidebar utama

#### Group 3: Operasional SDM

Isi:
- Data Pegawai
- Kontrak Kerja
- Dokumen HR

Route utama:
- `/org/hr/employees`
- `/org/hr/contracts`
- `/org/hr/documents`

Catatan:
- `status kepegawaian` dan `riwayat jabatan` tetap dianggap turunan halaman pegawai
- dokumen HR tetap dipayungi satu halaman utama agar sidebar tidak pecah terlalu cepat

#### Group 4: Layanan Pegawai

Isi:
- Proses Masuk Pegawai
- Proses Keluar Pegawai
- Pengaturan Keterlambatan
- Jenis Cuti
- Kuota Cuti

Route utama:
- `/org/hr/onboarding`
- `/org/hr/offboarding`
- `/org/hr/late-settings`
- `/org/hr/leave-types`
- `/org/hr/leave-quota`

Catatan:
- semua route di group ini masih bersifat `Tunda` atau transisi
- tampil untuk menjaga arah produk, tetapi jangan dianggap paket produksi final

#### Group 5: Monitoring

Isi:
- Laporan HR
- Analitik Kehadiran HR
- Log Error HR

Route utama:
- `/org/hr/reports`
- `/org/hr/attendance-insights`
- `/org/hr/help/error-logs`

Catatan:
- analitik kehadiran dan log error tetap boleh tampil sebagai pengawasan, tetapi statusnya masih `Internal`
- monitoring tidak boleh bercampur dengan konfigurasi atau helpdesk umum

#### Group 6: Dukungan

Isi:
- Tiket HR

Route utama:
- `/org/hr/help/tickets`

Catatan:
- FAQ formal ditunda finalisasinya sampai seluruh modul HR selesai
- route bantuan turunan boleh tetap hidup, tetapi tidak perlu dipromosikan sebelum scope HR stabil

#### Group 7: Konfigurasi

Isi:
- Pengaturan HR

Route utama:
- `/org/hr/settings`

Catatan:
- `roles`, `permissions`, `approval-hierarchy`, `branding`, `import-export`, dan `backup` lebih aman ditaruh di bawah halaman pengaturan, bukan jadi menu utama top-level

### 15.3 Menu Yang Sebaiknya Masuk Ke Halaman Pengaturan, Bukan Sidebar Utama

Agar sidebar tidak penuh, menu berikut lebih baik menjadi tab atau subsection di halaman pengaturan:

- role dan permission
- hierarki persetujuan
- branding HR
- import/export
- backup
- notifikasi HR

Alasannya:
- frekuensi buka lebih rendah
- sifatnya konfiguratif, bukan operasional harian
- kalau ditaruh di sidebar utama, user akan merasa semua menu sama penting

### 15.4 Menu Yang Sebaiknya Disembunyikan Dari Sidebar Dulu

Menu berikut bisa tetap punya route, tetapi tidak perlu tampil mencolok di sidebar sampai benar-benar matang:

- `/org/hr/shifts`
- `/org/hr/national-holidays`
- `/org/hr/late-settings`
- `/org/hr/attendance-integrations`
- `/org/hr/leave-types`
- `/org/hr/leave-quota`
- `/org/hr/leave-approval`
- `/org/hr/leave-recap`
- `/org/hr/leave-validity`
- `/org/hr/kpi`
- `/org/hr/performance-periods`
- `/org/hr/performance-forms`
- `/org/hr/review-360`
- `/org/hr/evaluation-results`
- `/org/hr/training-data`
- `/org/hr/certifications`
- `/org/hr/skill-matrix`
- `/org/hr/recruitment/jobs`
- `/org/hr/recruitment/candidates`
- `/org/hr/recruitment/interviews`
- `/org/hr/recruitment/offers`
- `/org/hr/ess/requests`
- `/org/hr/ess/leave-requests`
- `/org/hr/ess/attendance`
- `/org/hr/ess/documents`
- `/org/hr/ess/profile`

Prinsipnya:
- route boleh hidup
- halaman boleh tetap ada
- tetapi sidebar utama hanya menampilkan domain yang sudah cukup matang dan sering dipakai

## 16. Kapan Sebuah Menu Layak Masuk Sidebar Utama

Sebuah menu baru tidak otomatis layak tampil di sidebar utama.

Menu baru layak tampil jika:
- punya tujuan bisnis yang jelas
- dipakai cukup sering
- tidak sekadar halaman bridge kosong
- heading, aksi utama, dan data utamanya sudah jelas
- role access-nya sudah dipahami
- tidak lebih cocok menjadi tab di halaman lain

Kalau belum memenuhi itu, lebih baik:
- tetap jadi route internal
- masuk ke subsection halaman induk
- atau ditunda dari sidebar

## 17. Aturan Evaluasi Sebelum Menambah Menu Baru

Sebelum menambah item baru ke sidebar HR, tanyakan:

1. user HR datang ke halaman ini untuk melakukan apa?
2. apakah halaman ini dipakai rutin atau hanya sesekali?
3. apakah ini domain mandiri atau hanya konfigurasi kecil?
4. apakah halaman ini sudah punya aksi utama yang benar-benar bekerja?
5. apakah item ini akan membuat sidebar makin sulit dipindai?

Kalau jawaban belum kuat, menu tidak perlu naik ke sidebar utama.

## 18. Contoh Sidebar HR Yang Terlalu Penuh

Sidebar dianggap terlalu penuh jika:
- user harus scroll panjang hanya untuk menemukan menu utama
- satu kelompok berisi terlalu banyak submenu
- banyak item sebenarnya hanya variasi dari satu domain yang sama
- user tidak bisa membedakan mana operasional, mana konfigurasi, mana bantuan
- ada terlalu banyak halaman "calon fitur" tampil sejajar dengan fitur inti

Tanda khusus untuk repo ini:
- jika ATS, ESS, performance, training, governance, audit, dan helpdesk semua tampil sekaligus di sidebar utama, maka user akan merasa HR terlalu berat sejak awal

## 19. Rekomendasi Tahap Perapihan Sidebar

Tahap perapihan yang aman:

1. tentukan sidebar HR versi inti
2. keluarkan menu scaffold dari sidebar utama
3. pindahkan menu konfiguratif ke halaman pengaturan
4. samakan nama menu dengan heading halaman
5. pastikan route yang tampil di sidebar memang layak dipakai user
6. baru setelah itu perluas domain satu per satu

## 20. Output Yang Sebaiknya Dibuat Setelah Dokumen Ini

Dokumen ini idealnya diturunkan menjadi artefak yang lebih teknis:

- peta sidebar HR final
- tabel mapping `menu -> route -> tujuan -> status halaman`
- daftar `menu utama`, `submenu pengaturan`, dan `route internal`
- backlog halaman HR yang perlu dipromosikan dari scaffold ke produksi
- aturan penamaan heading dan breadcrumb

## 21. Mapping Menu HR Saat Ini

Bagian ini dipakai untuk menilai menu `/org/hr` yang ada sekarang.

Catatan konsolidasi:
- section ini adalah catatan evaluasi awal
- section ini tidak lagi menjadi sumber kebenaran final untuk implementasi sidebar
- keputusan final sidebar tenant mengacu ke `## 32. Penyusunan Sidebar HR yang Lebih Tegas`
- jika ada perbedaan status antara section ini dan section final, ikuti section final
- untuk status runtime Maret 2026, jangan baca baris `Sembunyikan` di section ini sebagai keputusan aktif; banyak di antaranya hanya snapshot desain lama sebelum baseline tenant HR diperluas

Arti status:
- `Pertahankan`: tetap tampil di sidebar utama
- `Pindahkan`: tetap ada, tetapi pindah ke group lain atau ke halaman pengaturan
- `Gabungkan`: tidak perlu berdiri sendiri, lebih baik digabung ke domain lain
- `Sembunyikan`: route boleh tetap hidup, tetapi ini adalah rekomendasi desain awal, bukan status final produksi saat ini

| Menu/Route Saat Ini | Status | Arah |
|---|---|---|
| `/org/hr` | Pertahankan | Tetap sebagai Ringkasan |
| `/org/hr/employees` | Pertahankan | Tetap sebagai pusat Data Pegawai |
| `/org/hr/structure` | Pertahankan | Tetap sebagai Struktur Organisasi |
| `/org/hr/position-grade` | Pertahankan | Tetap sebagai Jabatan dan Grade |
| `/org/hr/contracts` | Pertahankan | Tetap sebagai Kontrak Kerja |
| `/org/hr/documents` | Pertahankan | Tetap sebagai Dokumen HR |
| `/org/hr/settings` | Pertahankan | Tetap sebagai Pengaturan HR |
| `/org/hr/help/faq` | Pindahkan | Masuk group Bantuan |
| `/org/hr/help/support` | Pindahkan | Masuk group Bantuan |
| `/org/hr/help/tickets` | Pindahkan | Masuk group Bantuan |
| `/org/hr/help/error-logs` | Pindahkan | Masuk group Bantuan, bukan operasional inti |
| `/org/hr/company` | Pindahkan | Jadikan subsection Organisasi atau tab di pengaturan profil organisasi |
| `/org/hr/departments` | Pindahkan | Tetap di domain Organisasi, bukan top-level terpisah |
| `/org/hr/divisions` | Pindahkan | Tetap di domain Organisasi, bukan top-level terpisah |
| `/org/hr/work-locations` | Pindahkan | Tetap di domain Organisasi |
| `/org/hr/work-calendar` | Gabungkan | Lebih cocok digabung ke kebijakan kerja atau organisasi |
| `/org/hr/employee-status` | Pindahkan | Masuk group Pegawai |
| `/org/hr/job-history` | Pindahkan | Masuk group Pegawai |
| `/org/hr/onboarding` | Pertahankan | Sekarang sudah menjadi baseline lifecycle tenant HR |
| `/org/hr/offboarding` | Pertahankan | Sekarang sudah menjadi baseline lifecycle tenant HR |
| `/org/hr/attendance-insights` | Gabungkan | Bisa menjadi subsection Ringkasan atau analitik, bukan inti HR awal |
| `/org/hr/work-hours` | Pindahkan | Masuk domain Kebijakan HR |
| `/org/hr/shifts` | Sembunyikan | Tampilkan nanti saat kebijakan kehadiran lebih matang |
| `/org/hr/national-holidays` | Gabungkan | Lebih cocok ke kebijakan kerja atau integrasi dengan absensi |
| `/org/hr/late-settings` | Sembunyikan | Belum perlu jadi menu utama |
| `/org/hr/attendance-integrations` | Sembunyikan | Jangan tampil di sidebar utama dulu |
| `/org/hr/attendance-recap` | Gabungkan | Lebih cocok ke laporan atau analitik |
| `/org/hr/leave-types` | Pindahkan | Masuk domain Kebijakan HR |
| `/org/hr/leave-quota` | Pindahkan | Masuk domain Kebijakan HR |
| `/org/hr/leave-approval` | Pindahkan | Masuk domain Kebijakan HR |
| `/org/hr/leave-recap` | Gabungkan | Lebih cocok ke laporan HR |
| `/org/hr/leave-validity` | Sembunyikan | Belum perlu di sidebar utama |
| `/org/hr/kpi` | Pindahkan | Domain kinerja sudah aktif sebagai baseline, tetapi tetap perlu grouping yang rapi |
| `/org/hr/performance-periods` | Pindahkan | Baseline kinerja aktif, tidak lagi dianggap domain masa depan |
| `/org/hr/performance-forms` | Pindahkan | Baseline kinerja aktif, tidak lagi dianggap domain masa depan |
| `/org/hr/review-360` | Pindahkan | Baseline kinerja aktif, tetap lebih tepat sebagai submenu domain kinerja |
| `/org/hr/evaluation-results` | Pindahkan | Baseline kinerja aktif, tetap lebih tepat sebagai submenu domain kinerja |
| `/org/hr/training-data` | Pindahkan | Domain pelatihan sudah aktif sebagai baseline |
| `/org/hr/certifications` | Pindahkan | Domain pelatihan sudah aktif sebagai baseline |
| `/org/hr/skill-matrix` | Pindahkan | Domain pelatihan sudah aktif sebagai baseline |
| `/org/hr/document-templates` | Pindahkan | Masuk group Dokumen dan Legal |
| `/org/hr/warning-letters` | Sembunyikan | Belum perlu jadi menu utama |
| `/org/hr/contract-templates` | Sembunyikan | Belum perlu jadi menu utama |
| `/org/hr/digital-signature` | Sembunyikan | Belum perlu jadi menu utama |
| `/org/hr/users` | Pindahkan | Masuk ke Pengaturan, bukan sidebar utama |
| `/org/hr/roles` | Pindahkan | Masuk ke Pengaturan |
| `/org/hr/permissions` | Pindahkan | Masuk ke Pengaturan |
| `/org/hr/approval-hierarchy` | Pindahkan | Masuk ke Pengaturan atau Kebijakan HR |
| `/org/hr/general-settings` | Gabungkan | Gabung ke halaman Pengaturan |
| `/org/hr/branding` | Gabungkan | Gabung ke halaman Pengaturan |
| `/org/hr/notifications` | Gabungkan | Gabung ke halaman Pengaturan |
| `/org/hr/import-export` | Pindahkan | Masuk ke Pengaturan |
| `/org/hr/backup` | Pindahkan | Masuk ke Pengaturan |
| `/org/hr/reports` | Pindahkan | Jadikan entry Laporan, bukan bagian ringkasan |
| `/org/hr/recruitment/jobs` | Pindahkan | ATS sekarang sudah aktif sebagai baseline tenant HR |
| `/org/hr/recruitment/candidates` | Pindahkan | ATS sekarang sudah aktif sebagai baseline tenant HR |
| `/org/hr/recruitment/interviews` | Pindahkan | ATS sekarang sudah aktif sebagai baseline tenant HR |
| `/org/hr/recruitment/offers` | Pindahkan | ATS sekarang sudah aktif sebagai baseline tenant HR |
| `/org/hr/ess/requests` | Pindahkan | ESS sekarang sudah aktif sebagai baseline tenant HR |
| `/org/hr/ess/leave-requests` | Pindahkan | ESS sekarang sudah aktif sebagai baseline tenant HR |
| `/org/hr/ess/attendance` | Pindahkan | ESS sekarang sudah aktif sebagai baseline tenant HR |
| `/org/hr/ess/documents` | Pindahkan | ESS sekarang sudah aktif sebagai baseline tenant HR |
| `/org/hr/ess/profile` | Pindahkan | ESS sekarang sudah aktif sebagai baseline tenant HR |

### 21.1 Sidebar Inti Setelah Dirapikan

Kalau mapping di atas diterapkan, sidebar inti HR akan menjadi jauh lebih ringkas:

- Ringkasan
- Pegawai
- Organisasi
- Hubungan Kerja
- Dokumen
- Laporan
- Bantuan
- Pengaturan

### 21.2 Submenu Yang Masuk Ke Dalam Masing-Masing Group

Contoh hasil akhirnya:

#### Pegawai
- Data Pegawai
- Status Kepegawaian
- Riwayat Jabatan

#### Organisasi
- Struktur Organisasi
- Departemen
- Divisi
- Lokasi Kerja

#### Dokumen
- Dokumen HR
- Template Dokumen

#### Bantuan
- FAQ HR
- Bantuan HR
- Tiket HR
- Log Error HR

#### Pengaturan
- Pengaturan Umum
- Users
- Roles
- Permissions
- Approval Hierarchy
- Import/Export
- Backup

## 22. Role Matrix HR Sederhana

Sebelum modul HR dibangun lebih jauh, peran user harus jelas.

Role minimum yang disarankan:
- super admin platform
- admin organisasi
- operator HR
- atasan atau approver
- pegawai

### 22.1 Definisi Tiap Role

#### Super Admin Platform

Tugas:
- mengelola pengaturan global platform
- melihat audit lintas tenant
- membantu investigasi kasus kritikal

Batas:
- tidak boleh menjadi actor utama operasional HR harian tenant

#### Admin Organisasi

Tugas:
- mengelola konfigurasi HR tenant
- mengubah data pegawai
- mengelola struktur organisasi
- mengelola kontrak, dokumen, dan policy
- mengatur role dan permission tingkat tenant

Batas:
- hanya untuk tenant miliknya

#### Operator HR

Tugas:
- membantu operasional HR harian
- memantau data dan tiket
- mengerjakan proses administratif tertentu yang diizinkan

Batas:
- tidak otomatis boleh mengubah semua konfigurasi
- tidak otomatis boleh mengelola permission
- tidak otomatis boleh mengubah data sensitif tanpa kebijakan jelas

#### Atasan atau Approver

Tugas:
- melihat bawahan
- memberi approval pada proses yang relevan
- memantau status permohonan yang perlu persetujuan

Batas:
- bukan admin HR umum
- aksesnya berbasis approval dan struktur pelaporan

#### Pegawai

Tugas:
- melihat data dirinya sendiri
- mengajukan permohonan jika nanti domain ESS aktif

Batas:
- tidak boleh mengakses data HR tenant secara luas

### 22.2 Hak Akses Minimum

| Area | Super Admin | Admin Organisasi | Operator HR | Atasan/Approver | Pegawai |
|---|---|---|---|---|---|
| Lihat dashboard HR tenant | Ya | Ya | Ya | Terbatas | Tidak |
| Lihat data pegawai tenant | Ya | Ya | Ya | Terbatas | Tidak |
| Ubah data pegawai tenant | Ya | Ya | Terbatas | Tidak | Tidak |
| Ubah struktur organisasi | Ya | Ya | Terbatas | Tidak | Tidak |
| Ubah kontrak kerja | Ya | Ya | Terbatas | Tidak | Tidak |
| Lihat dokumen HR sensitif | Ya | Ya | Terbatas | Tidak | Tidak |
| Kelola tiket HR | Ya | Ya | Terbatas | Tidak | Tidak |
| Kelola role dan permission | Ya | Ya | Tidak | Tidak | Tidak |
| Kelola pengaturan HR | Ya | Ya | Tidak | Tidak | Tidak |
| Lihat data diri sendiri | Ya | Ya | Ya | Ya | Ya |

Catatan:
- `Terbatas` artinya hanya boleh pada fitur yang memang diizinkan kebijakan tenant
- enforcement tidak boleh hanya di frontend
- area sensitif harus dijaga juga di backend dan RLS

## 23. Boundary HR vs Absensi vs Payroll

Kalau boundary domain tidak jelas, modul akan cepat saling tumpang tindih.

### 23.1 Yang Menjadi Domain HR

HR mengelola:
- profil pegawai
- status kepegawaian
- struktur organisasi
- jabatan, grade, dan relasi atasan
- kontrak kerja
- dokumen HR
- kebijakan SDM
- approval structure
- employee lifecycle

HR menjawab:
- siapa pegawainya
- posisinya apa
- status kerjanya apa
- berada di unit mana
- atasannya siapa
- kontraknya bagaimana

### 23.2 Yang Menjadi Domain Absensi

Absensi mengelola:
- check-in
- check-out
- keterlambatan aktual
- event kehadiran
- histori absensi harian
- validasi lokasi dan waktu kehadiran

Absensi menjawab:
- pegawai hadir atau tidak
- datang jam berapa
- pulang jam berapa
- terlambat atau tidak

### 23.3 Yang Menjadi Domain Payroll

Payroll mengelola:
- komponen penghasilan
- komponen potongan
- periode payroll
- kalkulasi gaji
- slip gaji
- distribusi pembayaran
- pajak dan kepatuhan payroll

Payroll menjawab:
- pegawai dibayar berapa
- potongannya apa
- periode gaji yang dipakai apa

### 23.4 Hubungan Antar Domain

Hubungan yang sehat:
- HR memberi data pegawai, jabatan, grade, status, kontrak
- Absensi memberi data kehadiran aktual
- Payroll mengonsumsi data HR dan absensi untuk perhitungan

Urutan dependensi:
- HR dulu rapi
- lalu absensi sinkron dengan kebijakan HR
- lalu payroll memakai hasil dua domain itu

### 23.5 Contoh Boundary Praktis

Contoh yang harus dipisah:
- `Jam Kerja` sebagai kebijakan dasar bisa dikelola HR
- `Check-in/check-out` tetap milik absensi
- `Kuota Cuti` dapat dikelola HR
- `Event cuti disetujui` harus memengaruhi absensi
- `Grade` milik HR
- `Nominal gaji per grade` baru masuk payroll

### 23.6 Aturan Anti-Campur

Jangan lakukan hal berikut:
- dashboard HR menghitung tiket helpdesk umum tanpa label sumber
- menu HR menampilkan terlalu banyak event absensi mentah
- payroll menyimpan ulang data pegawai inti yang seharusnya milik HR
- halaman absensi menjadi tempat edit struktur organisasi

## 24. Status Halaman HR

Setiap halaman HR perlu diberi status supaya tim tahu tingkat kematangannya.

Status yang disarankan:
- produksi
- bridge
- scaffold
- internal route

### 24.1 Produksi

Halaman `produksi` berarti:
- dipakai user nyata
- punya fungsi utama yang benar-benar jalan
- punya data nyata
- access control jelas
- layak tampil di sidebar utama

Contoh kandidat:
- Dashboard HR
- Data Pegawai
- Struktur Organisasi
- Kontrak Kerja
- Tiket HR
- Pengaturan HR

### 24.2 Bridge

Halaman `bridge` berarti:
- sudah punya tujuan domain yang jelas
- sudah bisa dibuka
- sudah memberi konteks dan arah
- tetapi belum punya kemampuan penuh

Halaman bridge masih boleh hidup, tetapi:
- tidak semuanya harus tampil di sidebar utama
- tidak boleh disamakan bobotnya dengan halaman produksi

### 24.3 Scaffold Historis

Halaman `scaffold` berarti:
- masih berupa placeholder terstruktur
- lebih banyak menunjukkan niat desain daripada fungsi nyata
- belum layak menjadi titik navigasi utama

Halaman scaffold:
- boleh tetap punya route
- boleh dipakai untuk iterasi internal
- sebaiknya disembunyikan dari sidebar utama

### 24.4 Route Internal

`Internal route` berarti:
- dibutuhkan untuk navigasi internal
- redirect
- alias route
- helper page
- section bridge teknis

Internal route tidak perlu terlihat di sidebar.

### 24.5 Kapan Status Halaman Naik

Aturan sederhana:

`Scaffold -> Bridge` jika:
- heading jelas
- tujuan bisnis jelas
- ada data minimal

`Bridge -> Produksi` jika:
- aksi utama benar-benar jalan
- role access jelas
- empty/loading/error state ada
- user bisa menyelesaikan tugas nyata dari halaman itu

### 24.6 Gunakan Status Ini Saat Merapikan Sidebar

Aturan sidebar:
- hanya halaman `produksi` yang layak tampil jelas di sidebar utama
- halaman `bridge` boleh tampil jika memang penting, tetapi jumlahnya dibatasi
- halaman `scaffold` jangan dipromosikan dulu
- `internal route` tidak perlu muncul sama sekali

## 25. Inventaris Status Halaman HR Saat Ini

Bagian ini adalah inventaris kerja awal agar perapihan `/org/hr` tidak berdasarkan tebakan.

Catatan:
- status ini adalah klasifikasi arsitektur informasi, bukan penilaian akhir kualitas
- status bisa berubah setelah review implementasi lebih detail
- section ini adalah inventaris kerja, bukan keputusan final sidebar
- keputusan final tampil atau tidaknya route di sidebar mengacu ke `## 32. Penyusunan Sidebar HR yang Lebih Tegas`

### 25.1 Kandidat Produksi

Route yang saat ini paling layak diperlakukan sebagai halaman produksi:

| Route | Status | Catatan |
|---|---|---|
| `/org/hr` | Produksi | Ringkasan HR utama |
| `/org/hr/employees` | Produksi | Domain inti data pegawai |
| `/org/hr/structure` | Produksi | Domain inti struktur organisasi |
| `/org/hr/position-grade` | Produksi | Domain inti jabatan dan grade |
| `/org/hr/contracts` | Produksi | Domain inti kontrak kerja |
| `/org/hr/documents` | Produksi | Domain inti dokumen HR |
| `/org/hr/settings` | Produksi | Halaman pengaturan utama HR |
| `/org/hr/help/faq` | Produksi | Halaman bantuan yang jelas tujuannya |
| `/org/hr/help/support` | Produksi | Halaman bantuan operasional |
| `/org/hr/help/tickets` | Produksi | Helpdesk HR yang nyata dipakai |
| `/org/hr/help/error-logs` | Produksi | Monitoring error HR, tetapi tetap masuk group bantuan |

### 25.2 Kandidat Bridge

Route yang cukup jelas domainnya, tetapi lebih cocok diperlakukan sebagai bridge atau halaman sekunder:

| Route | Status | Catatan |
|---|---|---|
| `/org/hr/company` | Bridge | Masih lebih cocok jadi subsection organisasi |
| `/org/hr/departments` | Bridge | Penting, tetapi lebih cocok sebagai turunan organisasi |
| `/org/hr/divisions` | Bridge | Penting, tetapi lebih cocok sebagai turunan organisasi |
| `/org/hr/work-locations` | Bridge | Penting, tetapi lebih cocok sebagai turunan organisasi |
| `/org/hr/employee-status` | Bridge | Relevan, tetapi sebaiknya sekunder di domain pegawai |
| `/org/hr/job-history` | Bridge | Relevan, tetapi sekunder di domain pegawai |
| `/org/hr/work-hours` | Bridge | Relevan, tetapi masuk kebijakan HR, bukan top-level inti |
| `/org/hr/leave-types` | Bridge | Penting jika domain leave HR diaktifkan |
| `/org/hr/leave-quota` | Bridge | Penting jika domain leave HR diaktifkan |
| `/org/hr/leave-approval` | Bridge | Penting jika domain leave HR diaktifkan |
| `/org/hr/document-templates` | Bridge | Relevan, tetapi sekunder di group dokumen |
| `/org/hr/users` | Bridge | Relevan, tetapi sebaiknya masuk pengaturan |
| `/org/hr/roles` | Bridge | Relevan, tetapi sebaiknya masuk pengaturan |
| `/org/hr/permissions` | Bridge | Relevan, tetapi sebaiknya masuk pengaturan |
| `/org/hr/approval-hierarchy` | Bridge | Relevan, tetapi sebaiknya masuk pengaturan atau policy |
| `/org/hr/import-export` | Bridge | Konfiguratif, bukan menu utama |
| `/org/hr/backup` | Bridge | Konfiguratif, bukan menu utama |
| `/org/hr/reports` | Bridge | Layak hidup, tetapi sebaiknya bukan bagian dashboard |

### 25.3 Kandidat Scaffold

Route yang pada fase desain lama pernah dianggap scaffold atau domain lanjutan:

| Route | Status | Catatan |
|---|---|---|
| `/org/hr/onboarding` | Aktif | Sekarang sudah menjadi baseline lifecycle HR |
| `/org/hr/offboarding` | Aktif | Sekarang sudah menjadi baseline lifecycle HR |
| `/org/hr/shifts` | Aktif | Sekarang sudah menjadi baseline pola shift HR |
| `/org/hr/national-holidays` | Scaffold | Lebih dekat ke kebijakan kerja dan absensi |
| `/org/hr/late-settings` | Aktif | Sekarang sudah menjadi baseline kebijakan keterlambatan HR |
| `/org/hr/attendance-integrations` | Scaffold | Konfiguratif dan teknis |
| `/org/hr/leave-validity` | Aktif | Sekarang sudah menjadi baseline leave HR |
| `/org/hr/kpi` | Aktif | Sekarang sudah menjadi baseline kinerja HR |
| `/org/hr/performance-periods` | Aktif | Sekarang sudah menjadi baseline kinerja HR |
| `/org/hr/performance-forms` | Aktif | Sekarang sudah menjadi baseline kinerja HR |
| `/org/hr/review-360` | Aktif | Sekarang sudah menjadi baseline kinerja HR |
| `/org/hr/evaluation-results` | Aktif | Sekarang sudah menjadi baseline kinerja HR |
| `/org/hr/training-data` | Aktif | Sekarang sudah menjadi baseline pelatihan HR |
| `/org/hr/certifications` | Aktif | Sekarang sudah menjadi baseline pelatihan HR |
| `/org/hr/skill-matrix` | Aktif | Sekarang sudah menjadi baseline pelatihan HR |
| `/org/hr/warning-letters` | Scaffold | Belum perlu jadi menu utama |
| `/org/hr/contract-templates` | Scaffold | Belum perlu jadi menu utama |
| `/org/hr/digital-signature` | Scaffold | Belum perlu jadi menu utama |
| `/org/hr/recruitment/jobs` | Aktif | Sekarang sudah menjadi baseline ATS HR |
| `/org/hr/recruitment/candidates` | Aktif | Sekarang sudah menjadi baseline ATS HR |
| `/org/hr/recruitment/interviews` | Aktif | Sekarang sudah menjadi baseline ATS HR |
| `/org/hr/recruitment/offers` | Aktif | Sekarang sudah menjadi baseline ATS HR |
| `/org/hr/ess/requests` | Aktif | Sekarang sudah menjadi baseline ESS HR |
| `/org/hr/ess/leave-requests` | Aktif | Sekarang sudah menjadi baseline ESS HR |
| `/org/hr/ess/attendance` | Aktif | Sekarang sudah menjadi baseline ESS HR |
| `/org/hr/ess/documents` | Aktif | Sekarang sudah menjadi baseline ESS HR |
| `/org/hr/ess/profile` | Aktif | Sekarang sudah menjadi baseline ESS HR |

Catatan pembacaan:
- kolom `Scaffold` pada tabel ini adalah jejak desain lama
- untuk status aktif terbaru, tetap utamakan `Status Cepat` dan `src/lib/hrRouteAccess.ts`

### 25.4 Kandidat Route Internal atau Route Turunan

Route yang lebih cocok dianggap internal, alias, atau turunan analitik:

| Route | Status | Catatan |
|---|---|---|
| `/org/hr/dashboard-notifications` | Route Internal | Lebih cocok sebagai turunan ringkasan |
| `/org/hr/dashboard-activity` | Route Internal | Lebih cocok sebagai turunan ringkasan |
| `/org/hr/notifications` | Route Internal | Lebih cocok jadi subsection pengaturan |
| `/org/hr/activity-log` | Route Internal | Lebih cocok jadi subsection bantuan atau audit |
| `/org/hr/work-calendar` | Route Internal | Bisa menjadi subsection organisasi atau kebijakan |
| `/org/hr/attendance-insights` | Route Internal | Lebih cocok sebagai analitik turunan ringkasan/laporan |
| `/org/hr/attendance-recap` | Route Internal | Lebih cocok sebagai laporan |
| `/org/hr/leave-recap` | Route Internal | Lebih cocok sebagai laporan |
| `/org/hr/general-settings` | Route Internal | Gabung ke halaman pengaturan utama |
| `/org/hr/branding` | Route Internal | Gabung ke halaman pengaturan utama |

## 26. Policy Matrix HR Sederhana

Bagian ini memetakan area HR ke role utama agar implementasi route dan backend tidak saling bertabrakan.

Arti izin:
- `Lihat`: boleh membuka dan membaca data
- `Ubah`: boleh mengubah data operasional
- `Approve`: boleh memberi persetujuan
- `Konfigurasi`: boleh mengubah pengaturan dan aturan

### 26.1 Policy Matrix Per Area

| Area HR | Super Admin | Admin Organisasi | Operator HR | Atasan/Approver | Pegawai |
|---|---|---|---|---|---|
| Ringkasan | Lihat | Lihat | Lihat | Terbatas | Tidak |
| Data Pegawai | Lihat/Ubah | Lihat/Ubah | Lihat/Ubah terbatas | Lihat terbatas | Tidak |
| Struktur Organisasi | Lihat/Ubah | Lihat/Ubah | Lihat/Ubah terbatas | Tidak | Tidak |
| Jabatan dan Grade | Lihat/Ubah | Lihat/Ubah | Lihat terbatas | Tidak | Tidak |
| Kontrak Kerja | Lihat/Ubah | Lihat/Ubah | Lihat/Ubah terbatas | Tidak | Tidak |
| Dokumen HR | Lihat/Ubah | Lihat/Ubah | Lihat terbatas | Tidak | Tidak |
| Leave dan Policy HR | Lihat/Konfigurasi | Lihat/Konfigurasi | Lihat/Ubah terbatas | Approve terbatas | Tidak |
| Tiket HR | Lihat/Ubah | Lihat/Ubah | Lihat/Ubah terbatas | Tidak | Tidak |
| Role dan Permission | Lihat/Konfigurasi | Lihat/Konfigurasi | Tidak | Tidak | Tidak |
| Pengaturan HR | Lihat/Konfigurasi | Lihat/Konfigurasi | Tidak | Tidak | Tidak |

### 26.2 Aturan Praktis Per Area

#### Ringkasan
- operator HR boleh melihat
- atasan hanya boleh melihat subset yang relevan bila memang dibutuhkan

#### Data Pegawai
- admin organisasi adalah actor utama
- operator HR hanya boleh mengubah field yang memang diizinkan
- data sensitif tidak boleh terbuka ke semua role

#### Struktur Organisasi
- perubahan struktur harus dibatasi
- approval atau audit perubahan sebaiknya ada

#### Kontrak Kerja
- harus dianggap sensitif
- perubahan kontrak tidak boleh terbuka ke semua operator

#### Tiket HR
- boleh dilihat oleh peran operasional tertentu
- hak create, assign, resolve, dan reopen harus dibedakan
- enforcement wajib ada di backend, bukan hanya tombol UI

#### Pengaturan HR
- hanya admin organisasi dan super admin
- tidak boleh ikut muncul sebagai editable area untuk operator

### 26.3 Policy Matrix Ini Dipakai Untuk Apa

Gunakan matrix ini untuk:
- merapikan route guard
- merapikan sidebar per role
- menentukan halaman mana yang boleh muncul untuk operator
- menentukan query dan RLS yang sesuai
- mencegah hidden button palsu yang sebenarnya masih bisa dibypass

## 27. Langkah Lanjut Dari Dokumen Ini

Setelah panduan ini cukup matang, langkah praktis berikutnya adalah:

1. petakan seluruh route `/org/hr` ke status `produksi/bridge/scaffold/internal`
2. petakan seluruh route ke group sidebar final
3. petakan seluruh route ke role matrix final
4. refactor sidebar berdasarkan hasil itu
5. rapikan route guard dan RLS agar sesuai panduan
6. baru setelah itu perluas fitur HR lanjutan

Kalau langkah ini dibalik, menu HR akan kembali tumbuh tanpa kontrol.

## 28. Pemetaan Data Absensi Yang Sudah Ada ke Domain HR

Bagian ini penting agar modul HR dibangun di atas data yang sudah ada, bukan dengan menduplikasi struktur absensi.

Prinsip utama:
- kalau data sudah ada dan memang menjadi sumber kebenaran, HR harus mengacu ke sana
- kalau data saat ini masih terlalu operasional, HR boleh menambah layer konteks tanpa menyalin event mentah
- jangan membuat tabel HR baru hanya untuk menyimpan ulang data yang sudah stabil di domain absensi

### 28.1 Tabel atau Sumber Data Yang Sudah Bisa Menjadi Fondasi HR

| Sumber Data Saat Ini | Peran di Absensi | Hubungan ke HR | Arah |
|---|---|---|---|
| `employees` | master pegawai operasional | fondasi master pegawai HR | dipakai langsung dan diperkaya |
| `opd` | struktur instansi/organisasi | fondasi struktur organisasi HR | dipakai langsung |
| `work_units` | satuan/unit kerja | fondasi struktur organisasi HR | dipakai langsung |
| `offices` | lokasi kerja | fondasi penempatan/lokasi kerja HR | dipakai langsung |
| `positions` | jabatan dasar | fondasi jabatan HR | dipakai langsung dan diperkaya |
| `work_hours` | jadwal kerja operasional | fondasi kebijakan jam kerja HR | dipakai langsung |
| `absence_limits` | aturan batas absensi | fondasi policy keterlambatan dan pelanggaran | dipakai langsung |
| `leave_requests` | event izin/cuti | dibaca HR sebagai transaksi izin/cuti | tetap di absensi, HR memberi konteks policy |
| `attendance_records` | event kehadiran harian | dibaca HR untuk rekap dan analitik | tetap di absensi |

### 28.2 Penjelasan Per Entitas

#### `employees`

Relasinya ke HR:
- ini adalah fondasi paling penting untuk master pegawai
- HR sebaiknya tidak membuat master pegawai kedua

Yang masih perlu ditambah di layer HR:
- status kepegawaian yang lebih kaya
- histori jabatan
- histori atasan
- relasi kontrak kerja
- atribut HR yang belum ada

Kesimpulan:
- `employees` tetap jadi sumber utama identitas pegawai
- HR menambahkan konteks, bukan menggandakan identitas

#### `opd`, `work_units`, `offices`

Relasinya ke HR:
- ini sudah menjadi bibit struktur organisasi
- HR dapat memakai data ini untuk menu Struktur Organisasi, Departemen/Divisi, dan Lokasi Kerja

Yang perlu diperjelas:
- apakah `opd` selalu setara dengan departemen?
- apakah `work_units` selalu setara dengan unit kerja?
- apakah perlu entitas baru untuk `division`, atau cukup pemetaan di struktur yang ada?

Kesimpulan:
- gunakan entitas yang sudah ada sebagai fondasi
- tambahkan layer definisi bisnis bila naming saat ini belum sepenuhnya cocok untuk HR

#### `positions`

Relasinya ke HR:
- posisi sekarang sudah cocok sebagai fondasi jabatan
- HR dapat menambahkan konsep `grade`, `golongan`, atau `job family` di atasnya

Kesimpulan:
- jangan membuat tabel jabatan baru bila `positions` sudah cukup
- cukup perluas modelnya bila HR butuh level tambahan

#### `work_hours` dan `absence_limits`

Relasinya ke HR:
- dua sumber ini adalah jembatan paling jelas antara absensi dan HR
- HR memakainya sebagai policy
- absensi memakainya sebagai dasar evaluasi kejadian hadir, terlambat, atau pelanggaran

Kesimpulan:
- kebijakan boleh dibingkai ulang di UI HR
- tetapi sumber datanya tetap satu

#### `leave_requests`

Relasinya ke HR:
- ini bukan master data HR
- ini adalah transaksi atau event operasional

HR memanfaatkannya untuk:
- melihat pola izin/cuti
- menghubungkan event ke policy jenis cuti, kuota, approval, dan masa berlaku

Kesimpulan:
- `leave_requests` tetap milik domain absensi/operasional
- HR membaca, mengkontekstualkan, dan melaporkan

#### `attendance_records`

Relasinya ke HR:
- ini adalah data kehadiran aktual
- HR tidak perlu menyimpan ulang event kehadiran mentah

HR memanfaatkannya untuk:
- analitik kehadiran
- evaluasi keterlambatan
- laporan kedisiplinan
- input ke performance atau payroll nantinya

Kesimpulan:
- sumbernya tetap di absensi
- HR hanya mengonsumsi

### 28.3 Pemetaan Praktis ke Menu HR

| Menu HR | Data Utama Yang Sudah Ada | Keterangan |
|---|---|---|
| Dashboard HR | `employees`, `attendance_records`, `leave_requests`, `hr_contracts` | dashboard membaca ringkasan, bukan membuat sumber data baru |
| Data Pegawai | `employees` | fondasi utama master pegawai |
| Struktur Organisasi | `opd`, `work_units`, `offices` | fondasi struktur organisasi |
| Jabatan dan Grade | `positions` | grade/golongan dapat ditambahkan di atas fondasi ini |
| Kontrak Kerja | `hr_contracts` + `employees` | kontrak mengacu ke pegawai yang sudah ada |
| Kebijakan HR | `work_hours`, `absence_limits` | policy yang memengaruhi absensi |
| Cuti dan Izin HR | `leave_requests` + policy HR | event tetap dari absensi, policy dari HR |
| Laporan HR | `attendance_records`, `leave_requests`, `employees` | HR membaca agregasi lintas data |

### 28.4 Data Yang Sebaiknya Tetap Milik Absensi

Data berikut jangan dipindah ke HR:
- record check-in/check-out mentah
- status hadir harian mentah
- event keterlambatan aktual
- event izin/cuti aktual
- histori absensi harian mentah

HR hanya perlu:
- membaca
- memberi konteks
- mengagregasi
- menampilkan analitik

### 28.5 Data Yang Perlu Ditambahkan di Layer HR

Agar HR benar-benar punya identitas sendiri tanpa menduplikasi absensi, layer HR perlu menambah data seperti:
- status kepegawaian formal
- histori jabatan
- histori supervisor
- kontrak kerja
- grade dan golongan
- metadata dokumen HR
- policy leave yang lebih formal
- role matrix HR

### 28.6 Aturan Desain Supaya Tidak Duplikasi

Aturan yang sebaiknya dipegang:
- satu sumber kebenaran untuk identitas pegawai
- satu sumber kebenaran untuk event kehadiran
- satu sumber kebenaran untuk transaksi izin/cuti
- HR hanya menambah layer policy, struktur, governance, dan lifecycle
- reporting HR boleh memakai query gabungan, tetapi jangan membelah sumber data mentah

### 28.7 Implikasi ke Dokumen Ini

Artinya, seluruh isi `panduan_membangun_hr.md` harus dibaca dengan cara berikut:
- HR bukan dibangun dari nol
- HR dibangun di atas fondasi data absensi yang sudah ada
- pengelompokan menu HR harus mencerminkan hubungan itu
- policy matrix dan sidebar HR harus selalu diuji terhadap sumber data nyata yang sudah hidup di domain absensi

## 29. Sidebar Final HR v1

Bagian ini adalah draft sidebar target versi awal yang lebih sederhana, lebih mudah dipahami, dan lebih cocok dengan kondisi repo saat ini.

Tujuan draft ini:
- memberi kerangka navigasi yang stabil
- mengurangi menu yang terlalu banyak
- memisahkan menu inti, menu sekunder, dan route internal
- menjaga agar HR tetap mengacu ke domain absensi

Catatan konsolidasi:
- setelah section `## 32. Penyusunan Sidebar HR yang Lebih Tegas` ditambahkan, keputusan final sidebar tenant harus mengikuti section 32
- section 29 tetap berguna sebagai jembatan dari inventaris route ke sidebar target, tetapi bukan sumber kebenaran terakhir

### 29.1 Prinsip Sidebar Final v1

Sidebar HR v1 harus:
- fokus pada domain HR inti
- memakai istilah bisnis yang mudah dipahami
- tidak menampilkan semua route yang ada
- memisahkan bantuan dan pengaturan dari operasional utama
- hanya menampilkan menu yang cukup matang

### 29.2 Top-Level Group Yang Disarankan

Top-level group untuk HR v1:
- Ringkasan
- Pegawai
- Organisasi
- Hubungan Kerja
- Dokumen
- Laporan
- Bantuan
- Pengaturan

### 29.3 Struktur Sidebar Final HR v1

| Group | Submenu | Route | Status |
|---|---|---|---|
| Ringkasan | Ringkasan HR | `/org/hr` | tampil |
| Pegawai | Data Pegawai | `/org/hr/employees` | tampil |
| Pegawai | Status Kepegawaian | `/org/hr/employee-status` | tampil |
| Pegawai | Riwayat Jabatan | `/org/hr/job-history` | tampil |
| Organisasi | Struktur Organisasi | `/org/hr/structure` | tampil |
| Organisasi | Departemen | `/org/hr/departments` | tampil |
| Organisasi | Divisi | `/org/hr/divisions` | tampil |
| Organisasi | Lokasi Kerja | `/org/hr/work-locations` | tampil |
| Hubungan Kerja | Jabatan dan Grade | `/org/hr/position-grade` | tampil |
| Hubungan Kerja | Kontrak Kerja | `/org/hr/contracts` | tampil |
| Dokumen | Dokumen HR | `/org/hr/documents` | tampil |
| Dokumen | Template Dokumen | `/org/hr/document-templates` | tampil terbatas |
| Laporan | Laporan HR | `/org/hr/reports` | tampil |
| Bantuan | FAQ HR | `/org/hr/help/faq` | tampil |
| Bantuan | Tiket HR | `/org/hr/help/tickets` | tampil |
| Pengaturan | Pengaturan HR | `/org/hr/settings` | tampil |

Arti status:
- `tampil`: layak menjadi submenu reguler
- `tampil terbatas`: boleh tampil, tetapi bobot visualnya lebih rendah atau bisa ditempatkan sebagai subsection/tab
- `internal`: tidak perlu tampil di sidebar
- `tunda`: jangan masuk sidebar v1

### 29.4 Menu Yang Tidak Masuk Sidebar HR v1

Menu berikut tidak perlu tampil di sidebar utama HR v1:

| Route | Status | Alasan |
|---|---|---|
| `/org/hr/company` | internal | lebih cocok jadi subsection organisasi/profil |
| `/org/hr/work-calendar` | internal | lebih cocok jadi subsection organisasi atau kebijakan |
| `/org/hr/notifications` | internal | lebih cocok jadi subsection pengaturan |
| `/org/hr/activity-log` | internal | lebih cocok jadi subsection audit atau bantuan |
| `/org/hr/general-settings` | internal | gabung ke halaman pengaturan utama |
| `/org/hr/branding` | internal | gabung ke halaman pengaturan utama |
| `/org/hr/attendance-recap` | internal | lebih cocok jadi laporan turunan |
| `/org/hr/attendance-insights` | internal | lebih cocok jadi analitik turunan laporan, bukan menu utama v1 |
| `/org/hr/help/error-logs` | internal | route bantuan operasional, tetapi tidak perlu tampil di sidebar utama v1 |
| `/org/hr/leave-recap` | internal | lebih cocok jadi laporan turunan |
| `/org/hr/dashboard-notifications` | internal | turunan dashboard |
| `/org/hr/dashboard-activity` | internal | turunan dashboard |

### 29.5 Catatan Historis Menu Tertunda Dari Sidebar HR v1

Daftar di bawah ini adalah snapshot desain lama sebelum baseline tenant HR diaktifkan lebih luas.

Status terbaru:
- `onboarding`, `offboarding`, `shifts`, `late-settings`, `leave-types`, `leave-quota`, `leave-approval`, dan `leave-validity` sudah aktif di sidebar tenant
- domain `Kinerja`, `Pelatihan`, `Rekrutmen`, dan `ESS` juga sudah aktif sebagai baseline tenant
- yang masih lebih tepat ditahan dari sidebar utama adalah route `internal`, route `alias`, dan payroll

Contoh route yang tetap tidak masuk sidebar utama:
- `/org/hr/national-holidays`
- `/org/hr/attendance-integrations`
- `/org/hr/help/error-logs`
- route alias pengaturan, bantuan, dan laporan

### 29.6 Urutan Tampilan Yang Disarankan

Urutan sidebar sebaiknya seperti ini:

1. Ringkasan
2. Pegawai
3. Organisasi
4. Hubungan Kerja
5. Dokumen
6. Laporan
7. Bantuan
8. Pengaturan

Logika urutan:
- yang paling sering dipakai muncul lebih atas
- bantuan dan pengaturan diletakkan di bawah
- fitur lanjutan tidak mengambil fokus sejak awal

### 29.7 Aturan Jika Sidebar v1 Diterapkan di Kode

Kalau draft ini dipakai untuk implementasi:
- tampilkan hanya submenu berstatus `tampil`
- submenu `tampil terbatas` boleh ditempatkan di bawah halaman pengaturan atau laporan
- route `internal` tetap hidup tetapi tidak muncul di sidebar
- route `tunda` hanya berlaku untuk route yang memang masih ditahan secara eksplisit; jangan pakai aturan ini untuk menahan baseline ATS, ESS, performance, training, onboarding, atau offboarding yang sekarang sudah aktif
- heading halaman harus mengikuti nama submenu final

### 29.8 Output Setelah Sidebar Final v1 Disetujui

Jika struktur ini disetujui, langkah implementasi berikutnya:

1. refactor `OrganizationSidebar.tsx`
2. sesuaikan heading halaman agar konsisten dengan nama menu
3. tandai route yang internal dan jangan tampilkan di sidebar
4. pisahkan route yang ditunda dari menu utama
5. review ulang route guard per role
6. review KPI agar tidak bercampur dengan domain absensi umum dan helpdesk umum

## 30. HR Organisasi vs HR Superadmin

Bagian ini penting agar scope `/org/hr` dan `/admin/hr` tidak tercampur.

Prinsip utamanya:
- `/org/hr` adalah workspace operasional HR milik tenant
- `/admin/hr` adalah workspace governance dan pengawasan lintas tenant

Kalau dua area ini tidak dibedakan, menu superadmin akan cenderung meniru menu tenant, padahal tujuannya berbeda.

### 30.1 Tujuan `/org/hr`

`/org/hr` dipakai oleh organisasi atau tenant untuk pekerjaan HR sehari-hari.

Fokus utamanya:
- mengelola data pegawai
- mengelola struktur organisasi tenant
- mengelola kontrak dan dokumen tenant
- memantau laporan HR tenant
- menangani bantuan dan tiket HR tenant
- mengelola pengaturan HR di tenant tersebut

Pertanyaan yang dijawab `/org/hr`:
- siapa pegawai organisasi ini?
- bagaimana struktur organisasinya?
- siapa yang aktif, nonaktif, kontrak, atau berpindah jabatan?
- kebijakan HR tenant ini bagaimana?
- masalah HR tenant ini apa yang sedang aktif?

### 30.2 Tujuan `/admin/hr`

`/admin/hr` dipakai oleh superadmin platform untuk mengelola HR lintas tenant.

Fokus utamanya:
- melihat kesiapan tenant HR
- mengaktifkan atau menonaktifkan workspace HR
- menetapkan baseline atau default policy
- memonitor audit, error, dan health tenant HR
- memonitor coverage implementasi HR antar tenant
- menangani isu lintas tenant atau isu platform HR

Pertanyaan yang dijawab `/admin/hr`:
- tenant mana yang sudah siap memakai HR?
- tenant mana yang aktif atau nonaktif modul HR-nya?
- policy default HR platform saat ini apa?
- tenant mana yang bermasalah?
- adakah gap implementasi atau penyimpangan dari baseline?

### 30.3 Yang Seharusnya Tidak Dilakukan Superadmin

Superadmin HR sebaiknya tidak menjadi operator HR harian untuk tenant.

Hal yang sebaiknya tidak menjadi fokus utama `/admin/hr`:
- edit data pegawai tenant satu per satu
- edit kontrak pegawai tenant satu per satu
- menjalankan onboarding harian tenant
- menjadi approver operasional tenant
- menggantikan admin organisasi dalam pekerjaan rutin

Kalau superadmin terlalu masuk ke operasional tenant:
- boundary peran rusak
- audit trail membingungkan
- desain menu jadi meniru workspace tenant

### 30.4 Yang Seharusnya Diatur Superadmin

Hal yang memang wajar diatur oleh superadmin:
- status aktivasi workspace HR per tenant
- baseline role matrix
- baseline ticket policy
- baseline alert policy
- readiness tenant HR
- audit lintas tenant
- error log HR lintas tenant
- bantuan dan tiket tingkat platform

### 30.5 Relasi Superadmin HR ke Data Tenant

Superadmin boleh melihat agregasi dan readiness tenant, tetapi tidak berarti semua data tenant harus dibuka seperti workspace tenant.

Relasi yang sehat:
- superadmin melihat ringkasan, kepatuhan, audit, dan status tenant
- admin organisasi mengelola data detail tenant
- intervensi superadmin ke data tenant hanya untuk kebutuhan khusus dan harus ter-audit

### 30.6 Struktur Sidebar Superadmin HR v1

Sidebar superadmin HR sebaiknya berbeda dari sidebar tenant HR.

Top-level group yang disarankan:
- Ringkasan Platform
- Tenant HR
- Policy dan Baseline
- Monitoring dan Audit
- Helpdesk Platform
- Pengaturan Platform

### 30.7 Draft Sidebar `/admin/hr`

| Group | Submenu | Route | Tujuan |
|---|---|---|---|
| Ringkasan Platform | Ringkasan Platform HR | `/admin/hr` | melihat snapshot global HR lintas tenant |
| Tenant HR | Tenant HR | `/admin/hr/tenants` | melihat tenant yang memakai atau siap memakai HR |
| Policy dan Baseline | Kebijakan HR | `/admin/hr/policies` | mengelola baseline atau policy platform |
| Monitoring dan Audit | Audit HR | `/admin/hr/audit` | memonitor perubahan dan kepatuhan lintas tenant |
| Monitoring dan Audit | Log Error HR | `/admin/hr/error-logs` | memonitor error dan kesehatan modul HR |
| Helpdesk Platform | FAQ Global HR | `/admin/hr/help/faq` | pusat FAQ global |
| Helpdesk Platform | Dukungan Global HR | `/admin/hr/help/support` | bantuan tingkat platform |
| Helpdesk Platform | Tiket HR Lintas Tenant | `/admin/hr/help/tickets` | pemantauan tiket global |
| Pengaturan Platform | Pengaturan | `/admin/hr/settings` | konfigurasi global HR |
| Pengaturan Platform | Profil | `/admin/hr/profile` | profil dan identitas area HR platform |

### 30.8 Hubungan Dengan Dokumen Ini

Implikasi ke `panduan_membangun_hr.md`:
- semua section sidebar tenant berlaku untuk `/org/hr`
- halaman `/admin/hr` harus diperlakukan sebagai domain governance
- jangan menyalin sidebar tenant ke area superadmin
- policy matrix superadmin harus dipisahkan dari policy matrix tenant

### 30.9 Aturan Implementasi

Kalau nanti dokumen ini dipakai untuk refactor:
- refactor `/org/hr` dan `/admin/hr` secara terpisah
- jangan pakai logika menu yang sama untuk dua area tersebut
- pastikan heading dan copywriting di `/admin/hr` memakai sudut pandang platform, bukan sudut pandang operator tenant
- pastikan `/admin/hr` fokus pada tenant readiness, policy, audit, dan monitoring

### 30.10 Ringkasan Praktis

Cara paling sederhana mengingatnya:
- `/org/hr` = "saya mengelola HR organisasi saya"
- `/admin/hr` = "saya mengawasi dan menstandarkan HR antar organisasi"

## 31. Sidebar Final Admin HR v1

Bagian ini menyusun sidebar target untuk area superadmin HR agar tidak meniru workspace tenant HR.

Prinsip utamanya:
- fokus pada governance lintas tenant
- tidak masuk terlalu dalam ke operasional tenant
- menampilkan health, policy, readiness, dan audit
- memakai istilah platform, bukan istilah operator tenant

Catatan konsolidasi:
- setelah section `## 32. Penyusunan Sidebar HR yang Lebih Tegas` ditambahkan, section ini dibaca sebagai rincian pendukung untuk sidebar admin HR
- sumber kebenaran ringkas tetap berada di section 32

### 31.1 Tujuan Sidebar Admin HR

Sidebar admin HR harus membantu superadmin menjawab pertanyaan berikut:
- tenant mana yang sudah aktif HR?
- tenant mana yang siap atau belum siap?
- policy default HR platform saat ini apa?
- area HR mana yang paling banyak error?
- tenant mana yang butuh perhatian atau intervensi?

### 31.2 Top-Level Group Yang Disarankan

Top-level group untuk `/admin/hr` v1:
- Ringkasan Platform
- Tenant HR
- Policy dan Baseline
- Monitoring dan Audit
- Helpdesk Platform
- Pengaturan Platform

### 31.3 Struktur Sidebar Final Admin HR v1

| Group | Submenu | Route | Status | Tujuan |
|---|---|---|---|---|
| Ringkasan Platform | Ringkasan Platform HR | `/admin/hr` | tampil | snapshot lintas tenant |
| Tenant HR | Daftar Tenant HR | `/admin/hr/tenants` | tampil | melihat tenant yang aktif atau siap memakai HR |
| Tenant HR | Profil HR Tenant | `/admin/hr/profile` | tampil terbatas | baseline identitas dan positioning area HR platform |
| Policy dan Baseline | Kebijakan HR | `/admin/hr/policies` | tampil | baseline policy lintas tenant |
| Policy dan Baseline | Pengaturan | `/admin/hr/settings` | tampil | pengaturan global HR platform |
| Monitoring dan Audit | Audit HR | `/admin/hr/audit` | tampil | audit dan kepatuhan lintas tenant |
| Monitoring dan Audit | Log Error HR | `/admin/hr/error-logs` | tampil | monitoring error dan health HR |
| Helpdesk Platform | FAQ Global HR | `/admin/hr/help/faq` | tampil | FAQ global lintas tenant |
| Helpdesk Platform | Dukungan Global HR | `/admin/hr/help/support` | tampil | bantuan dan koordinasi platform |
| Helpdesk Platform | Tiket HR Lintas Tenant | `/admin/hr/help/tickets` | tampil | monitoring tiket lintas tenant |

Arti status:
- `tampil`: submenu utama dan layak terlihat jelas
- `tampil terbatas`: tetap boleh ada, tetapi bobot visual lebih rendah
- `internal`: route hidup tetapi tidak perlu jadi item sidebar
- `tunda`: belum perlu masuk sidebar admin v1

### 31.4 Penjelasan Per Group

#### Ringkasan Platform

Isi:
- Ringkasan Platform HR

Fungsi:
- memberi gambaran cepat kondisi HR lintas tenant
- menampilkan metrik readiness, error, dan coverage

#### Tenant HR

Isi:
- daftar tenant HR
- readiness tenant
- status aktivasi HR

Fungsi:
- memetakan tenant mana yang siap
- memudahkan superadmin masuk ke tenant yang perlu perhatian

Catatan:
- detail tenant sebaiknya tetap fokus ke kesiapan dan status
- jangan berubah menjadi halaman edit operasional pegawai tenant

#### Policy dan Baseline

Isi:
- policies
- settings

Fungsi:
- menetapkan aturan default HR lintas tenant
- memastikan tenant tidak berjalan tanpa baseline

Contoh area:
- default ticket policy
- default alert policy
- default workspace setting
- baseline readiness

#### Monitoring dan Audit

Isi:
- audit HR
- error logs HR

Fungsi:
- memonitor stabilitas modul HR
- mendeteksi tenant yang bermasalah
- menjaga kepatuhan implementasi

#### Helpdesk Platform

Isi:
- FAQ global
- support global
- tiket lintas tenant

Fungsi:
- menjadi pusat bantuan HR di tingkat platform
- membedakan masalah tenant individual dari masalah platform

#### Pengaturan Platform

Untuk v1, pengaturan global HR cukup diwakili oleh:
- `/admin/hr/settings`

Kalau ke depan bertambah, submenu ini bisa diperluas, tetapi jangan terlalu cepat memecahnya.

### 31.5 Yang Tidak Perlu Ditiru Dari Sidebar Tenant

Sidebar admin HR tidak perlu memiliki menu seperti:
- Data Pegawai
- Struktur Organisasi tenant
- Kontrak Kerja tenant
- Onboarding tenant
- Offboarding tenant
- ESS tenant
- ATS tenant

Alasannya:
- itu adalah domain kerja admin organisasi
- superadmin cukup melihat readiness, audit, coverage, dan exception

### 31.6 Menu Yang Cocok Menjadi Route Internal di Admin HR

Jika nanti diperlukan route tambahan, lebih baik jadikan internal route dulu untuk:
- halaman detail tenant HR
- halaman detail audit per tenant
- halaman detail error per tenant
- halaman detail coverage readiness
- alias route atau redirect route

Contoh status:
- `/admin/hr/sections/:sectionKey` = internal
- route filter atau deep-link audit = internal

### 31.7 Menu Yang Bisa Ditunda di Admin HR v1

Menu berikut tidak perlu dipaksa tampil pada versi awal:
- analytics yang terlalu rinci
- benchmark antar tenant yang kompleks
- wizard migrasi HR
- orchestration lintas tenant yang berat
- panel integrasi HR lanjutan

Tujuannya:
- menjaga sidebar admin HR tetap ringan
- mencegah governance menu berubah menjadi daftar tools teknis

### 31.8 Urutan Tampilan Yang Disarankan

Urutan sidebar admin HR:

1. Ringkasan Platform
2. Tenant HR
3. Policy dan Baseline
4. Monitoring dan Audit
5. Helpdesk Platform
6. Pengaturan Platform

Logika urutannya:
- mulai dari gambaran umum
- lanjut ke tenant
- lalu policy
- baru audit dan bantuan

### 31.9 Aturan Implementasi Untuk `/admin/hr`

Kalau draft ini nanti dipakai di kode:
- heading halaman harus memakai sudut pandang platform
- istilah menu harus konsisten dengan governance lintas tenant
- hindari label yang terkesan seperti workspace operasional tenant
- route admin HR tidak boleh membingungkan user seolah-olah dia sedang bekerja sebagai admin tenant

### 31.10 Ringkasan Praktis

Cara mengingat sidebar admin HR v1:
- dashboard untuk melihat keseluruhan
- tenant untuk melihat siapa yang aktif dan siap
- policy untuk menetapkan baseline
- audit untuk menjaga kualitas
- helpdesk untuk menangani isu lintas tenant
- settings untuk konfigurasi global

Dengan struktur ini, `/admin/hr` tetap menjadi area pengawasan platform, bukan salinan dari `/org/hr`.

## 32. Penyusunan Sidebar HR yang Lebih Tegas

Bagian ini merapikan hubungan antara HR organisasi, HR superadmin, data absensi yang sudah ada, dan navigasi yang harus terlihat sederhana bagi user.

### 32.1 Prinsip Umum

Sidebar HR tidak boleh disusun berdasarkan semua route yang tersedia.
Sidebar HR harus disusun berdasarkan cara kerja user.

Urutannya:
1. apa pekerjaan utama user HR
2. data apa yang dipakai
3. halaman mana yang benar-benar dipakai setiap hari
4. route mana yang hanya internal
5. route mana yang ditunda

Sidebar yang baik harus:
- mudah dipahami user baru
- tidak mencampur domain HR, absensi, payroll, dan support
- tidak menampilkan scaffold sebagai menu utama
- tidak menjadikan semua laporan sebagai menu primer
- konsisten antara nama menu, heading, dan tujuan halaman

### 32.2 Posisi HR terhadap Absensi

Di repo ABSENSIKU, HR tidak berdiri sendiri dari nol.
HR dibangun di atas fondasi data absensi yang sudah ada.

Hubungannya:
- absensi menyimpan event operasional harian
- HR menyimpan konteks pegawai, struktur, kontrak, dan kebijakan
- payroll nanti menggunakan data HR dan absensi

Karena itu, sidebar HR tidak boleh mengulang menu absensi mentah.
HR hanya boleh menampilkan turunan yang relevan untuk keputusan HR.

Contoh:
- data hadir mentah tetap milik absensi
- ringkasan kehadiran untuk evaluasi pegawai boleh tampil di HR
- cuti sebagai event tetap terkait absensi atau leave flow
- kebijakan cuti, kuota, approver, dan status hubungan kerja masuk domain HR

### 32.3 Sidebar Final HR Organisasi v1

Sidebar `/org/hr` adalah workspace operasional tenant.

Top level yang disarankan:

1. Ringkasan
2. Pegawai
3. Organisasi
4. Hubungan Kerja
5. Dokumen
6. Laporan
7. Bantuan
8. Pengaturan

Submenu yang disarankan:

#### Ringkasan

- Ringkasan HR
- Agenda dan perhatian HR

#### Pegawai

- Data Pegawai
- Status Kepegawaian
- Riwayat Jabatan

#### Organisasi

- Struktur Organisasi
- Departemen atau Unit Kerja
- Lokasi Kerja

#### Hubungan Kerja

- Jabatan dan Grade
- Kontrak Kerja
- Approval Hierarchy

#### Dokumen

- Dokumen HR
- Template Dokumen

#### Laporan

- Ringkasan SDM
- Rekap Kehadiran HR
- Rekap Cuti HR

#### Bantuan

- FAQ HR
- Tiket HR
- Bantuan HR

#### Pengaturan

- Pengaturan Umum HR
- Users
- Roles
- Permissions
- Import/Export

### 32.4 Route yang Tidak Perlu Jadi Menu Utama di `/org/hr`

Route berikut sebaiknya tidak menjadi menu primer di sidebar:
- error log detail
- halaman audit teknis
- halaman eksperimen
- scaffold bridge page
- route turunan laporan yang terlalu spesifik
- halaman yang hanya dipakai admin platform

Status yang dipakai:
- `tampil`: muncul di sidebar utama
- `terbatas`: muncul hanya untuk role tertentu
- `internal`: tidak tampil di sidebar, tetapi route tetap hidup
- `tunda`: belum masuk sidebar dan belum menjadi prioritas implementasi

### 32.5 Sidebar Final Admin HR v1

Sidebar `/admin/hr` adalah workspace governance lintas tenant, bukan workspace operasional pegawai.

Top level yang disarankan:

1. Ringkasan Platform
2. Tenant HR
3. Policy dan Baseline
4. Monitoring dan Audit
5. Helpdesk Platform
6. Pengaturan Platform

Submenu yang disarankan:

#### Ringkasan Platform

- Ringkasan Platform HR
- Tenant Health Snapshot

#### Tenant HR

- Daftar Tenant HR
- Status Aktivasi HR
- Readiness Tenant

#### Policy dan Baseline

- Default Role Matrix
- Default Policy HR
- Baseline Struktur HR
- Baseline Ticket Policy

#### Monitoring dan Audit

- Audit Tenant HR
- Error Log HR
- Usage dan Coverage
- Gap Implementasi

#### Helpdesk Platform

- FAQ Global HR
- Tiket HR Lintas Tenant
- Bantuan Internal

#### Pengaturan Platform

- Feature Flags HR
- Integrasi dan Alert
- Konfigurasi Global

### 32.6 Yang Tidak Boleh Dicampur

Hal yang tidak boleh dicampur dalam sidebar:
- HR tenant dengan HR platform
- data operasional pegawai dengan audit platform
- event absensi mentah dengan policy HR
- menu bantuan dengan menu konfigurasi teknis
- route internal dengan menu utama user

### 32.7 Aturan Penamaan Menu

Gunakan nama yang singkat dan stabil.

Aturan:
- nama menu harus sama dengan heading halaman
- hindari dua istilah untuk satu hal
- hindari istilah teknis internal di sidebar
- gunakan istilah bisnis yang dipahami user HR

Contoh yang baik:
- Data Pegawai
- Struktur Organisasi
- Kontrak Kerja
- Dokumen HR
- Tiket HR
- Pengaturan HR

Contoh yang kurang baik:
- HR Master
- Employee Control
- Attendance Insights Internal
- Ticket Ops Console

### 32.8 Checklist Sebelum Menu Masuk Sidebar

Sebuah halaman baru hanya boleh masuk sidebar utama jika:
- punya tujuan bisnis yang jelas
- punya data nyata, bukan placeholder
- punya aksi utama yang jelas
- punya empty state, loading state, dan error state
- role aksesnya jelas
- bukan scaffold atau route internal
- dibutuhkan secara berulang oleh user target

Jika belum memenuhi itu, halaman tetap hidup sebagai route internal atau ditunda.

### 32.9 Kesimpulan Struktur

Untuk ABSENSIKU:
- `/org/hr` harus sederhana dan operasional
- `/admin/hr` harus governance dan lintas tenant
- absensi tetap menjadi sumber event harian
- HR memberi konteks, struktur, dan kebijakan
- sidebar harus menjadi alat navigasi kerja, bukan daftar semua fitur

### 32.10 Prioritas Pengerjaan

Urutan pengerjaan yang disarankan:
1. mulai dari `/org/hr`
2. rapikan sidebar, submenu, role, dan status route tenant
3. selaraskan heading, route guard, dan boundary data tenant
4. baru turunkan pola governance ke `/admin/hr`

Alasannya:
- `/org/hr` adalah workspace operasional yang benar-benar dipakai tenant
- `/admin/hr` hanya akan sehat jika area tenant yang dia awasi sudah stabil
- governance superadmin tidak boleh dibangun di atas struktur tenant yang masih kabur

Cara mengingatnya:
- `/org/hr` = membangun mesin kerja HR tenant
- `/admin/hr` = mengawasi dan menstandarkan mesin yang sudah jadi

### 32.11 Solusi Implementasi

Supaya blueprint ini tidak berhenti sebagai dokumen, solusi implementasinya harus dibuat bertahap dan sempit.

Urutan solusi yang disarankan:

#### Tahap 1: Tetapkan Tabel Route Final

Buat satu tabel final yang berisi:
- route
- nama menu
- group sidebar
- status `tampil`, `terbatas`, `internal`, atau `tunda`
- role minimum yang boleh melihat

Tujuannya:
- menghilangkan tafsir ganda antar section dokumen
- menjadi sumber kebenaran tunggal untuk sidebar tenant
- memudahkan sinkronisasi ke route guard

#### Tahap 2: Refactor Sidebar `/org/hr`

Setelah tabel final ada, refactor sidebar tenant dengan aturan:
- hanya route berstatus `tampil` yang muncul sebagai menu utama
- route `terbatas` ditempatkan sebagai submenu sekunder atau hanya untuk role tertentu
- route `internal` tetap hidup tetapi tidak tampil
- pada fase desain awal, route `tunda` tidak dimaksudkan muncul di navigasi utama

Tujuannya:
- membuat sidebar lebih pendek
- membuat urutan kerja HR lebih jelas
- mengurangi kebingungan user saat masuk ke area HR

#### Tahap 3: Selaraskan Heading dan Breadcrumb

Setelah sidebar rapi, samakan:
- label sidebar
- heading halaman
- judul section
- breadcrumb

Aturannya:
- satu halaman hanya punya satu nama bisnis
- jangan ada istilah berbeda untuk route yang sama

Tujuannya:
- mengurangi kebingungan mental model
- membuat navigasi terasa konsisten

#### Tahap 4: Rapikan Route Guard dan Permission

Setelah menu final jelas, cocokkan dengan:
- role matrix HR
- policy matrix HR
- route guard frontend
- guard backend atau RLS

Prinsipnya:
- menu yang tidak tampil tidak cukup hanya disembunyikan
- akses tetap harus dibatasi di level backend

Tujuannya:
- mencegah hidden route tetap bisa diakses bebas
- memastikan operator, approver, dan admin benar-benar punya batas yang berbeda

#### Tahap 5: Pisahkan Route Internal dari Halaman Produksi

Audit route yang masih dipakai hanya untuk:
- redirect
- subsection
- tab internal
- halaman teknis
- halaman bridge

Lalu:
- pertahankan route bila memang dibutuhkan
- keluarkan dari sidebar utama
- dokumentasikan sebagai internal route

Tujuannya:
- sidebar tidak dipenuhi route teknis
- struktur halaman produksi menjadi lebih tegas

#### Tahap 6: Audit KPI dan Query HR

Setelah navigasi beres, audit query dan KPI agar:
- HR tidak membaca tiket support umum tanpa label domain
- HR tidak mencampur event absensi mentah dengan policy HR
- dashboard HR hanya memakai data yang sesuai boundary domain

Tujuannya:
- memastikan UI yang rapi tidak tetap dibangun di atas data yang salah

#### Tahap 7: Baru Turunkan Governance ke `/admin/hr`

Setelah `/org/hr` stabil:
- turunkan group sidebar yang relevan ke `/admin/hr`
- fokuskan `/admin/hr` ke tenant readiness, policy, audit, dan monitoring
- jangan salin sidebar tenant ke superadmin

Tujuannya:
- governance dibangun di atas struktur tenant yang sudah matang
- superadmin tetap menjadi area pengawasan, bukan area operasional tenant

#### Output Minimum Yang Harus Dihasilkan

Sebelum refactor kode besar, minimal harus ada:
- tabel route final `/org/hr`
- daftar route internal
- daftar route tunda
- matrix role ke menu
- urutan group sidebar final

Kalau lima output ini belum ada, refactor kode berisiko kembali liar.

### 32.12 Tabel Keputusan Migrasi `/org/hr` dan `/admin/hr`

Bagian ini dipakai sebagai keputusan kerja praktis saat mulai refactor.

Arti keputusan:
- `pertahankan`: route tetap hidup dan tetap menjadi bagian struktur final
- `refactor`: route tetap hidup, tetapi heading, posisi menu, atau hak akses harus dirapikan
- `internal`: route tetap hidup, tetapi tidak muncul di sidebar utama
- `tunda`: route belum menjadi prioritas aktif dan tidak tampil di sidebar utama
- `hapus nanti`: route tidak dipakai dalam struktur final dan dapat dihapus setelah migrasi aman

Prinsip penting:
- jangan hapus massal route yang ada sekarang
- jadikan dokumen ini sebagai peta migrasi, bukan alasan untuk rewrite total
- hapus route hanya setelah dipastikan tidak menjadi sumber navigasi, redirect, atau deep-link penting

#### A. Keputusan Migrasi `/org/hr`

| Route / Area | Keputusan | Arah |
|---|---|---|
| `/org/hr` | pertahankan | tetap jadi Dashboard HR tenant |
| `/org/hr/employees` | pertahankan | tetap jadi pusat Data Pegawai |
| `/org/hr/structure` | pertahankan | tetap jadi Struktur Organisasi |
| `/org/hr/position-grade` | pertahankan | tetap jadi Jabatan dan Grade |
| `/org/hr/contracts` | pertahankan | tetap jadi Kontrak Kerja |
| `/org/hr/documents` | pertahankan | tetap jadi Dokumen HR |
| `/org/hr/settings` | pertahankan | tetap jadi Pengaturan HR |
| `/org/hr/help/faq` | refactor | tetap hidup, tetapi masuk group Bantuan HR |
| `/org/hr/help/support` | refactor | tetap hidup, tetapi masuk group Bantuan HR |
| `/org/hr/help/tickets` | refactor | tetap hidup, tetapi masuk group Bantuan HR |
| `/org/hr/company` | refactor | jadikan subsection organisasi atau profil organisasi |
| `/org/hr/departments` | refactor | tetap hidup sebagai submenu Organisasi |
| `/org/hr/divisions` | refactor | tetap hidup sebagai submenu Organisasi |
| `/org/hr/work-locations` | refactor | tetap hidup sebagai submenu Organisasi |
| `/org/hr/employee-status` | refactor | tetap hidup sebagai submenu Pegawai |
| `/org/hr/job-history` | refactor | tetap hidup sebagai submenu Pegawai |
| `/org/hr/users` | refactor | pindah ke submenu Pengaturan HR |
| `/org/hr/roles` | refactor | pindah ke submenu Pengaturan HR |
| `/org/hr/permissions` | refactor | pindah ke submenu Pengaturan HR |
| `/org/hr/approval-hierarchy` | refactor | pindah ke Pengaturan atau Hubungan Kerja sesuai role final |
| `/org/hr/import-export` | refactor | tetap hidup sebagai submenu Pengaturan HR |
| `/org/hr/backup` | refactor | tetap hidup sebagai submenu Pengaturan HR |
| `/org/hr/reports` | refactor | tetap hidup sebagai entry Laporan HR |
| `/org/hr/help/error-logs` | internal | hidup untuk bantuan operasional, tetapi tidak tampil di sidebar utama v1 |
| `/org/hr/attendance-insights` | internal | hidup sebagai analitik turunan laporan HR |
| `/org/hr/attendance-recap` | internal | hidup sebagai laporan turunan |
| `/org/hr/leave-recap` | internal | hidup sebagai laporan turunan |
| `/org/hr/work-calendar` | internal | hidup sebagai subsection organisasi atau kebijakan |
| `/org/hr/notifications` | internal | gabung ke pengaturan, bukan menu utama |
| `/org/hr/activity-log` | internal | tetap hidup sebagai audit atau bantuan internal |
| `/org/hr/general-settings` | internal | gabung ke halaman pengaturan utama |
| `/org/hr/branding` | internal | gabung ke halaman pengaturan utama |
| `/org/hr/dashboard-notifications` | internal | route turunan dashboard |
| `/org/hr/dashboard-activity` | internal | route turunan dashboard |
| `/org/hr/onboarding` | tampil | aktif sebagai baseline lifecycle HR |
| `/org/hr/offboarding` | tampil | aktif sebagai baseline lifecycle HR |
| `/org/hr/shifts` | tampil | aktif sebagai baseline kebijakan kehadiran HR |
| `/org/hr/national-holidays` | tunda | aktifkan nanti saat hubungan HR-absensi lebih matang |
| `/org/hr/late-settings` | tampil | aktif sebagai baseline kebijakan keterlambatan HR |
| `/org/hr/attendance-integrations` | tunda | konfigurasi teknis, bukan fokus HR v1 |
| `/org/hr/leave-types` | tampil | aktif sebagai baseline leave HR |
| `/org/hr/leave-quota` | tampil | aktif sebagai baseline leave HR |
| `/org/hr/leave-approval` | tampil | aktif sebagai baseline leave HR |
| `/org/hr/leave-validity` | tampil | aktif sebagai baseline leave HR |
| `/org/hr/kpi` | tampil | aktif sebagai baseline kinerja HR |
| `/org/hr/performance-periods` | tampil | aktif sebagai baseline kinerja HR |
| `/org/hr/performance-forms` | tampil | aktif sebagai baseline kinerja HR |
| `/org/hr/review-360` | tampil | aktif sebagai baseline kinerja HR |
| `/org/hr/evaluation-results` | tampil | aktif sebagai baseline kinerja HR |
| `/org/hr/training-data` | tampil | aktif sebagai baseline pelatihan HR |
| `/org/hr/certifications` | tampil | aktif sebagai baseline pelatihan HR |
| `/org/hr/skill-matrix` | tampil | aktif sebagai baseline pelatihan HR |
| `/org/hr/warning-letters` | tunda | legal lanjutan, belum perlu di v1 |
| `/org/hr/contract-templates` | tunda | legal lanjutan, belum perlu di v1 |
| `/org/hr/digital-signature` | tunda | legal lanjutan, belum perlu di v1 |
| `/org/hr/recruitment/jobs` | tampil | ATS aktif sebagai baseline tenant HR |
| `/org/hr/recruitment/candidates` | tampil | ATS aktif sebagai baseline tenant HR |
| `/org/hr/recruitment/interviews` | tampil | ATS aktif sebagai baseline tenant HR |
| `/org/hr/recruitment/offers` | tampil | ATS aktif sebagai baseline tenant HR |
| `/org/hr/ess/requests` | tampil | ESS aktif sebagai baseline tenant HR |
| `/org/hr/ess/leave-requests` | tampil | ESS aktif sebagai baseline tenant HR |
| `/org/hr/ess/attendance` | tampil | ESS aktif sebagai baseline tenant HR |
| `/org/hr/ess/documents` | tampil | ESS aktif sebagai baseline tenant HR |
| `/org/hr/ess/profile` | tampil | ESS aktif sebagai baseline tenant HR |

Catatan:
- untuk `/org/hr`, pendekatannya adalah refactor terarah, bukan hapus total
- hapus route hanya jika nanti terbukti benar-benar mati, duplikat, atau tidak dipakai sama sekali

#### B. Keputusan Migrasi `/admin/hr`

| Route / Area | Keputusan | Arah |
|---|---|---|
| `/admin/hr` | pertahankan | tetap jadi Ringkasan Platform |
| `/admin/hr/tenants` | pertahankan | tetap jadi pusat readiness tenant HR |
| `/admin/hr/policies` | pertahankan | tetap jadi baseline policy lintas tenant |
| `/admin/hr/settings` | pertahankan | tetap jadi pengaturan global HR platform |
| `/admin/hr/audit` | pertahankan | tetap jadi monitoring audit lintas tenant |
| `/admin/hr/error-logs` | pertahankan | tetap jadi monitoring error dan health HR |
| `/admin/hr/help/faq` | refactor | tetap hidup, tetapi dikelompokkan sebagai helpdesk platform |
| `/admin/hr/help/support` | refactor | tetap hidup, tetapi dikelompokkan sebagai helpdesk platform |
| `/admin/hr/help/tickets` | refactor | tetap hidup, tetapi dikelompokkan sebagai helpdesk platform |
| `/admin/hr/profile` | refactor | gunakan hanya jika memang dibutuhkan sebagai profil area HR platform |
| detail tenant HR | internal | jangan jadi menu utama; cukup route detail atau deep-link |
| detail audit tenant | internal | tetap hidup untuk drill-down audit |
| detail error tenant | internal | tetap hidup untuk investigasi |
| analytics lintas tenant yang terlalu rinci | tunda | aktifkan nanti jika governance sudah matang |
| benchmark tenant yang kompleks | tunda | jangan dibawa ke v1 |
| wizard migrasi HR | tunda | jangan dibangun sebelum tenant HR stabil |
| orchestration lintas tenant | tunda | bukan prioritas v1 |

Catatan:
- untuk `/admin/hr`, jangan lakukan rewrite besar sekarang
- pertahankan sebagai kerangka governance yang ringan
- perluasan `/admin/hr` baru sehat setelah `/org/hr` stabil

#### C. Kapan Route Boleh Dihapus

Route baru layak masuk status `hapus nanti` jika memenuhi semua syarat berikut:
- tidak punya tujuan bisnis
- tidak masuk struktur final dokumen ini
- tidak dipakai oleh sidebar, redirect, atau deep-link penting
- tidak dipakai untuk transisi migrasi
- tidak menyimpan konteks yang masih dibutuhkan user atau tim internal

Kalau belum yakin, pilih `internal` atau `tunda`, bukan langsung hapus.

#### D. Ringkasan Keputusan

Cara paling aman membaca tabel ini:
- `/org/hr` dibenahi dan dijadikan area utama HR tenant
- `/admin/hr` dipersempit dan dijaga sebagai area governance
- route lama tidak dihapus massal
- migrasi dilakukan bertahap sampai struktur final stabil
- penghapusan route hanya dilakukan setelah refactor sidebar, heading, dan guard selesai

### 32.13 Tabel Final Route `/org/hr`

Bagian ini adalah tabel kerja final untuk sidebar tenant HR.

Arti status:
- `tampil`: muncul di sidebar utama
- `terbatas`: tetap muncul, tetapi hanya untuk role tertentu atau sebagai submenu sekunder
- `internal`: route tetap hidup, tetapi tidak tampil di sidebar utama
- `redirect`: route lama tetap hidup, tetapi langsung diarahkan ke halaman induk yang aktif
- `tunda`: belum masuk implementasi aktif

| Route | Label Menu | Group Sidebar | Status | Role Minimum |
|---|---|---|---|---|
| `/org/hr` | Ringkasan HR | Ringkasan | tampil | admin organisasi |
| `/org/hr/employees` | Data Pegawai | Pegawai | tampil | admin organisasi |
| `/org/hr/structure` | Struktur Organisasi | Organisasi | tampil | admin organisasi |
| `/org/hr/position-grade` | Jabatan dan Grade | Hubungan Kerja | tampil | admin organisasi |
| `/org/hr/contracts` | Kontrak Kerja | Hubungan Kerja | tampil | admin organisasi |
| `/org/hr/documents` | Dokumen HR | Dokumen | tampil | admin organisasi |
| `/org/hr/reports` | Laporan HR | Laporan | tampil | admin organisasi |
| `/org/hr/help/faq` | FAQ HR | Bantuan | tampil | operator HR |
| `/org/hr/help/tickets` | Tiket HR | Bantuan | tampil | operator HR |
| `/org/hr/settings` | Pengaturan HR | Pengaturan | tampil | admin organisasi |
| `/org/hr/help/support` | Alias Bantuan HR | Bantuan | redirect | operator HR |
| `/org/hr/faq` | Alias FAQ HR | Bantuan | redirect | operator HR |
| `/org/hr/tickets` | Alias Tiket HR | Bantuan | redirect | operator HR |
| `/org/hr/support` | Alias Tiket HR | Bantuan | redirect | operator HR |
| `/org/hr/departments` | Alias Struktur Organisasi | Organisasi | redirect | admin organisasi |
| `/org/hr/divisions` | Alias Struktur Organisasi | Organisasi | redirect | admin organisasi |
| `/org/hr/work-locations` | Alias Struktur Organisasi | Organisasi | redirect | admin organisasi |
| `/org/hr/employee-status` | Alias Data Pegawai | Pegawai | redirect | admin organisasi |
| `/org/hr/job-history` | Alias Data Pegawai | Pegawai | redirect | admin organisasi |
| `/org/hr/document-templates` | Alias Dokumen HR | Dokumen | redirect | admin organisasi |
| `/org/hr/users` | Alias Pengaturan HR | Pengaturan | redirect | admin organisasi |
| `/org/hr/roles` | Alias Pengaturan HR | Pengaturan | redirect | admin organisasi |
| `/org/hr/permissions` | Alias Pengaturan HR | Pengaturan | redirect | admin organisasi |
| `/org/hr/approval-hierarchy` | Alias Pengaturan HR | Pengaturan | redirect | admin organisasi |
| `/org/hr/general-settings` | Alias Pengaturan HR | Pengaturan | redirect | admin organisasi |
| `/org/hr/import-export` | Alias Pengaturan HR | Pengaturan | redirect | admin organisasi |
| `/org/hr/backup` | Alias Pengaturan HR | Pengaturan | redirect | admin organisasi |
| `/org/hr/help/error-logs` | Log Error HR | Bantuan | internal | admin organisasi |
| `/org/hr/attendance-insights` | Analitik Kehadiran HR | Laporan | internal | admin organisasi |
| `/org/hr/attendance-recap` | Alias Laporan HR | Laporan | redirect | admin organisasi |
| `/org/hr/leave-recap` | Alias Laporan HR | Laporan | redirect | admin organisasi |
| `/org/hr/company` | Alias Struktur Organisasi | Organisasi | redirect | admin organisasi |
| `/org/hr/work-calendar` | Alias Struktur Organisasi | Organisasi | redirect | admin organisasi |
| `/org/hr/notifications` | Alias Pengaturan HR | Pengaturan | redirect | admin organisasi |
| `/org/hr/activity-log` | Alias Pengaturan HR | Pengaturan | redirect | admin organisasi |
| `/org/hr/branding` | Alias Pengaturan HR | Pengaturan | redirect | admin organisasi |
| `/org/hr/dashboard-notifications` | Alias Ringkasan HR | Ringkasan | redirect | admin organisasi |
| `/org/hr/dashboard-activity` | Alias Ringkasan HR | Ringkasan | redirect | admin organisasi |

Catatan:
- role minimum di sini adalah ambang bawah melihat halaman, bukan berarti boleh mengubah semua data
- hak ubah, approve, dan konfigurasi tetap mengikuti policy matrix

### 32.13A Tabel Final Route `/admin/hr`

Bagian ini adalah tabel kerja final untuk sidebar platform HR.

Arti status:
- `tampil`: muncul di sidebar utama
- `terbatas`: tetap muncul, tetapi bobot visualnya lebih rendah atau hanya dipakai pada kondisi tertentu
- `internal`: route tetap hidup, tetapi tidak tampil di sidebar utama
- `redirect`: route lama tetap hidup, tetapi langsung diarahkan ke halaman induk yang aktif
- `tunda`: belum masuk implementasi aktif

| Route | Label Menu | Group Sidebar | Status | Role Minimum |
|---|---|---|---|---|
| `/admin/hr` | Ringkasan Platform HR | Ringkasan Platform | tampil | super admin platform |
| `/admin/hr/tenants` | Daftar Tenant HR | Tenant HR | tampil | super admin platform |
| `/admin/hr/policies` | Kebijakan HR | Policy dan Baseline | tampil | super admin platform |
| `/admin/hr/settings` | Pengaturan | Policy dan Baseline | tampil | super admin platform |
| `/admin/hr/audit` | Audit HR | Monitoring dan Audit | tampil | super admin platform |
| `/admin/hr/error-logs` | Log Error HR | Monitoring dan Audit | tampil | super admin platform |
| `/admin/hr/help/faq` | FAQ Global HR | Helpdesk Platform | tampil | super admin platform |
| `/admin/hr/help/tickets` | Tiket HR Lintas Tenant | Helpdesk Platform | tampil | super admin platform |
| `/admin/hr/profile` | Profil HR Tenant | Tenant HR | terbatas | super admin platform |
| `/admin/hr/help/support` | Dukungan Global HR | Helpdesk Platform | terbatas | super admin platform |
| `/admin/hr/faq` | Alias FAQ Global HR | Helpdesk Platform | redirect | super admin platform |
| `/admin/hr/support` | Alias Dukungan Global HR | Helpdesk Platform | redirect | super admin platform |
| `/admin/hr/tickets` | Alias Tiket HR Lintas Tenant | Helpdesk Platform | redirect | super admin platform |
| `/admin/hr/sections/:sectionKey` | Bridge Section Admin HR | Monitoring dan Audit | internal | super admin platform |

Catatan:
- `/admin/hr/profile` tetap diperlakukan sebagai route sekunder sampai benar-benar dibutuhkan sebagai identitas area HR platform
- `/admin/hr/help/support` boleh tetap hidup, tetapi tidak perlu menjadi entry utama bila helpdesk cukup ditangani lewat FAQ dan tiket
- route detail tenant, detail audit, dan detail error tetap lebih aman diperlakukan sebagai deep-link internal

### 32.13B Mapping Menu Admin HR ke Heading dan Breadcrumb

Bagian ini dipakai agar nama menu, heading halaman, dan breadcrumb area platform tidak pecah.

| Route | Label Menu | Heading Halaman | Breadcrumb |
|---|---|---|---|
| `/admin/hr` | Ringkasan Platform HR | Ringkasan Platform HR | Admin HR / Ringkasan Platform HR |
| `/admin/hr/tenants` | Daftar Tenant HR | Daftar Tenant HR | Admin HR / Tenant HR / Daftar Tenant HR |
| `/admin/hr/policies` | Kebijakan HR | Kebijakan HR | Admin HR / Policy dan Baseline / Kebijakan HR |
| `/admin/hr/settings` | Pengaturan | Pengaturan | Admin HR / Policy dan Baseline / Pengaturan |
| `/admin/hr/audit` | Audit HR | Audit HR | Admin HR / Monitoring dan Audit / Audit HR |
| `/admin/hr/error-logs` | Log Error HR | Log Error HR | Admin HR / Monitoring dan Audit / Log Error HR |
| `/admin/hr/help/faq` | FAQ Global HR | FAQ Global HR | Admin HR / Helpdesk Platform / FAQ Global HR |
| `/admin/hr/help/tickets` | Tiket HR Lintas Tenant | Tiket HR Lintas Tenant | Admin HR / Helpdesk Platform / Tiket HR Lintas Tenant |
| `/admin/hr/profile` | Profil HR Tenant | Profil HR Tenant | Admin HR / Tenant HR / Profil HR Tenant |

### 32.14 Mapping Menu ke Heading dan Breadcrumb

Bagian ini dipakai agar nama menu, heading halaman, dan breadcrumb tidak pecah.

| Route | Label Menu | Heading Halaman | Breadcrumb |
|---|---|---|---|
| `/org/hr` | Ringkasan HR | Ringkasan HR | HR / Ringkasan HR |
| `/org/hr/employees` | Data Pegawai | Data Pegawai | HR / Pegawai / Data Pegawai |
| `/org/hr/structure` | Struktur Organisasi | Struktur Organisasi | HR / Organisasi / Struktur Organisasi |
| `/org/hr/position-grade` | Jabatan dan Grade | Jabatan dan Grade | HR / Hubungan Kerja / Jabatan dan Grade |
| `/org/hr/contracts` | Kontrak Kerja | Kontrak Kerja | HR / Hubungan Kerja / Kontrak Kerja |
| `/org/hr/documents` | Dokumen HR | Dokumen HR | HR / Dokumen / Dokumen HR |
| `/org/hr/reports` | Laporan HR | Laporan HR | HR / Laporan / Laporan HR |
| `/org/hr/help/faq` | FAQ HR | FAQ HR | HR / Bantuan / FAQ HR |
| `/org/hr/help/tickets` | Tiket HR | Tiket HR | HR / Bantuan / Tiket HR |
| `/org/hr/settings` | Pengaturan HR | Pengaturan HR | HR / Pengaturan / Pengaturan HR |

Catatan konsolidasi:
- route alias yang sekarang redirect tetap boleh memakai breadcrumb tujuan akhirnya
- route seperti `/org/hr/help/support`, `/org/hr/users`, `/org/hr/roles`, dan `/org/hr/approval-hierarchy` tidak lagi dianggap submenu produksi; ia hanya jalur transisi ke halaman induk

Aturan:
- label menu harus sama dengan heading halaman
- breadcrumb selalu dimulai dari `HR`
- route internal tetap harus punya heading konsisten walaupun tidak tampil di sidebar

### 32.15 Aturan Internal Route dan Redirect

Bagian ini dipakai agar route lama tidak langsung dihapus tanpa kontrol.

#### A. Route Internal Resmi

Route berikut diperlakukan sebagai internal route:
- `/org/hr/help/error-logs`
- `/org/hr/attendance-insights`
- `/org/hr/attendance-recap`
- `/org/hr/leave-recap`
- `/org/hr/company`
- `/org/hr/work-calendar`
- `/org/hr/notifications`
- `/org/hr/activity-log`
- `/org/hr/general-settings`
- `/org/hr/branding`
- `/org/hr/dashboard-notifications`
- `/org/hr/dashboard-activity`

#### B. Kapan Route Lama Menjadi Redirect

Route lama boleh dijadikan redirect jika:
- halaman final penggantinya sudah jelas
- user masih mungkin datang dari bookmark lama
- route lama tidak lagi perlu jadi halaman mandiri

Contoh arah redirect yang aman:
- route pengaturan kecil diarahkan ke `/org/hr/settings`
- route laporan turunan diarahkan ke `/org/hr/reports`

#### C. Kapan Route Tetap Hidup Tanpa Redirect

Route tetap hidup tanpa redirect jika:
- masih dipakai sebagai subsection, tab, atau deep-link
- masih dibutuhkan untuk investigasi, audit, atau bantuan internal
- masih dipakai dalam alur transisi sebelum refactor penuh selesai

#### D. Larangan

Jangan lakukan:
- menghapus route hanya karena tidak tampil di sidebar
- mengganti heading tetapi membiarkan label menu lama
- membuat alias route baru tanpa mencatat tujuan akhirnya
- membiarkan route internal tampil sebagai menu produksi

#### E. Keputusan Praktis

Kalau ragu:
- pilih `internal` dulu
- dokumentasikan
- evaluasi lagi setelah sidebar dan route guard final selesai

Itu lebih aman daripada menghapus terlalu cepat.

### 32.16 Aturan Non-Intervensi ke Data dan Mekanisme Absensi

Bagian ini menegaskan batas yang wajib dijaga saat membangun atau merapikan HR di repo ABSENSIKU.

Prinsip utamanya:
- HR boleh membaca data absensi
- HR boleh memberi konteks, policy, dan analitik atas data absensi
- HR tidak boleh mengubah sumber kebenaran absensi
- HR tidak boleh mengambil alih mekanisme operasional inti absensi

Yang tidak boleh dilakukan dari domain HR:
- mengubah struktur event check-in atau check-out inti hanya demi kebutuhan tampilan HR
- membuat ulang tabel atau sumber data absensi yang sudah menjadi sumber kebenaran
- memindahkan logika validasi kehadiran inti ke halaman atau modul HR
- menjadikan halaman HR sebagai tempat edit mekanisme absensi harian
- mengubah arti status hadir, terlambat, pulang, atau izin dari sisi HR tanpa perubahan yang benar di domain absensi

Yang boleh dilakukan oleh domain HR:
- membaca rekap kehadiran
- membaca histori izin atau cuti
- menambahkan policy yang menjadi referensi absensi, seperti jam kerja atau aturan tertentu
- menampilkan analitik HR berbasis data absensi
- menghubungkan data absensi dengan kontrak, status pegawai, jabatan, dan struktur organisasi

Aturan implementasi:
- kalau perubahan menyentuh event hadir, check-in, check-out, keterlambatan, atau histori absensi mentah, perlakukan itu sebagai perubahan domain absensi
- kalau perubahan hanya menyentuh pengelompokan pegawai, policy HR, struktur organisasi, kontrak, atau laporan HR, itu tetap domain HR
- dashboard atau laporan HR tidak boleh memaksa perubahan schema absensi tanpa alasan domain yang kuat

Cara mengingatnya:
- absensi = kejadian operasional
- HR = konteks orang, struktur, policy, dan governance
- HR membaca absensi, bukan menggantikan absensi

Risiko implementasi yang harus diingat:
- walaupun dokumen ini sudah tegas, kode HR tetap harus diaudit saat direfactor
- jangan sampai sidebar, query, helper, atau halaman HR diam-diam mengubah domain absensi
- setiap perubahan HR yang membaca data absensi harus diperiksa apakah hanya membaca, memberi konteks, atau tanpa sengaja mengubah mekanisme absensi
- kalau ada keraguan, perlakukan perubahan itu sebagai perubahan domain absensi dan review boundary-nya lebih dulu

### 32.17 Checklist Audit Sebelum Refactor HR

Sebelum menyentuh kode `/org/hr`, audit perubahan dengan checklist ini:

#### A. Cek Boundary Domain

- apakah perubahan ini hanya memengaruhi HR, bukan absensi inti
- apakah perubahan ini menyentuh event hadir, check-in, check-out, atau histori absensi mentah
- apakah perubahan ini hanya membaca data absensi, bukan mengubah mekanismenya

#### B. Cek Navigasi

- apakah route termasuk `tampil`, `terbatas`, `internal`, atau `tunda`
- apakah route sudah ada di tabel final route `/org/hr`
- apakah perubahan ini mengubah urutan sidebar atau hanya isi halaman

#### C. Cek Naming

- apakah label menu sama dengan heading halaman
- apakah breadcrumb konsisten dengan mapping final
- apakah tidak ada istilah ganda untuk halaman yang sama

#### D. Cek Role dan Guard

- siapa role minimum yang boleh melihat halaman
- siapa yang boleh mengubah data
- apakah guard frontend dan backend tetap konsisten
- apakah route tersembunyi masih bisa diakses langsung

#### E. Cek Data dan Query

- tabel apa saja yang dibaca halaman ini
- domain owner dari tabel itu siapa
- apakah query HR secara tidak sengaja membaca data support umum atau data absensi mentah yang tidak relevan
- apakah KPI atau agregasi yang dipakai benar-benar sesuai boundary domain

#### F. Cek Dampak Refactor

- apakah ada bookmark lama, deep-link, atau redirect yang perlu dijaga
- apakah route lama harus dijadikan internal atau redirect
- apakah perubahan ini berisiko membuat user kehilangan jalur kerja yang biasa dipakai

Kalau satu saja dari checklist ini belum jelas, jangan lanjut refactor besar.

### 32.18 Definition of Done `/org/hr`

Refactor `/org/hr` baru dianggap selesai jika semua syarat berikut terpenuhi:

- sidebar mengikuti tabel final route tenant
- route `internal` tidak tampil di sidebar utama
- route `tunda` tidak bocor ke navigasi aktif
- heading dan breadcrumb konsisten dengan mapping final
- role minimum per route sudah sesuai dokumen
- guard frontend tidak bertentangan dengan guard backend atau RLS
- halaman HR tidak mengubah data atau mekanisme inti absensi
- KPI HR tidak bercampur dengan support umum atau event absensi mentah tanpa konteks
- route lama yang masih diperlukan sudah ditangani sebagai redirect atau internal route
- tidak ada halaman scaffold yang tampil seolah-olah produksi

Kalau salah satu poin ini belum terpenuhi, berarti refactor belum selesai penuh.

### 32.19 Anti-Pattern Implementasi HR

Berikut pola yang harus dihindari saat mengerjakan HR:

- menambah menu baru hanya karena route sudah ada
- menyembunyikan menu tanpa memperbaiki route guard
- menyalin data absensi ke tabel HR baru tanpa alasan domain yang kuat
- mencampur helpdesk umum dengan tiket HR tanpa label sumber yang jelas
- memakai istilah yang berbeda-beda untuk halaman yang sama
- membiarkan scaffold tampil seperti halaman produksi
- membuat dashboard HR yang mendorong perubahan schema absensi
- menganggap route internal sebagai menu yang sah untuk user akhir
- membiarkan operator HR memiliki akses konfigurasi hanya karena halaman terlihat sederhana
- memperluas `/admin/hr` sebelum `/org/hr` stabil

Cara membaca anti-pattern ini:
- kalau perubahan terasa cepat tetapi membuat boundary kabur, kemungkinan itu anti-pattern
- kalau perubahan menambah menu tanpa memperjelas alur kerja, kemungkinan itu anti-pattern
- kalau perubahan HR mulai mengatur mekanisme absensi, itu hampir pasti anti-pattern

### 32.20 File Target Implementasi

Bagian ini memetakan panduan HR ke file implementasi yang paling mungkin disentuh saat refactor dimulai.

Prinsipnya:
- mulai dari file navigasi dan route dulu
- lanjut ke halaman inti
- baru setelah itu sentuh guard, query, dan bridge page
- jangan ubah file absensi inti hanya karena kebutuhan HR

#### A. File Navigasi dan Route Utama

File yang paling relevan:
- [src/components/admin/organization/OrganizationSidebar.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/admin/organization/OrganizationSidebar.tsx)
- [src/components/admin/organization/OrganizationLayout.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/admin/organization/OrganizationLayout.tsx)
- [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx)

Peran file:
- `OrganizationSidebar.tsx` adalah target utama refactor sidebar `/org/hr`
- `OrganizationLayout.tsx` mengatur perilaku layout, workspace switcher, dan fallback route organisasi
- `App.tsx` adalah sumber kebenaran route aktif untuk `/org/hr` dan `/admin/hr`

Yang dicek di tahap awal:
- menu mana yang masih tampil tetapi seharusnya `internal` atau `tunda`
- route mana yang perlu tetap hidup walau tidak tampil di sidebar
- redirect mana yang perlu dipertahankan

#### B. File Halaman Inti `/org/hr`

Halaman inti yang menjadi prioritas:
- [src/pages/org/hr/OrgHRHome.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRHome.tsx)
- [src/pages/org/hr/OrgHREmployees.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHREmployees.tsx)
- [src/pages/org/hr/OrgHRStructure.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRStructure.tsx)
- [src/pages/org/hr/OrgHRPositionGrade.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRPositionGrade.tsx)
- [src/pages/org/hr/OrgHRContracts.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRContracts.tsx)
- [src/pages/org/hr/OrgHRDocuments.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRDocuments.tsx)
- [src/pages/org/hr/OrgHRReports.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRReports.tsx)
- [src/pages/org/hr/OrgHRSettings.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRSettings.tsx)
- [src/pages/org/hr/OrgHRFAQ.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRFAQ.tsx)
- [src/pages/org/hr/OrgHRTickets.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRTickets.tsx)
- [src/pages/org/hr/OrgHRErrorLogs.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRErrorLogs.tsx)

Yang dicek:
- heading halaman
- breadcrumb
- query yang dipakai
- apakah halaman benar-benar produksi atau masih bridge/scaffold
- apakah halaman diam-diam membaca domain yang tidak seharusnya

#### C. File Bridge dan Workspace Turunan

File yang perlu diaudit sebagai route internal atau bridge:
- [src/pages/org/hr/OrgHRPriorityWorkspace.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/org/hr/OrgHRPriorityWorkspace.tsx)

Tujuan audit:
- memastikan route bridge tidak diperlakukan sebagai halaman produksi
- memetakan route mana yang sebaiknya tetap `internal`
- menghindari scaffold tampil terlalu dominan di sidebar

#### D. File Area `/admin/hr`

File utama governance:
- [src/pages/admin/hr/AdminHRDashboard.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRDashboard.tsx)
- [src/pages/admin/hr/AdminHRTenants.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRTenants.tsx)
- [src/pages/admin/hr/AdminHRPolicies.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRPolicies.tsx)
- [src/pages/admin/hr/AdminHRErrorLogs.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRErrorLogs.tsx)
- [src/pages/admin/hr/AdminHRAudit.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRAudit.tsx)
- [src/pages/admin/hr/AdminHRSettings.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRSettings.tsx)
- [src/pages/admin/hr/AdminHRProfile.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRProfile.tsx)
- [src/pages/admin/hr/AdminHRHelp.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRHelp.tsx)
- [src/pages/admin/hr/AdminHRFAQ.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRFAQ.tsx)
- [src/pages/admin/hr/AdminHRSupport.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRSupport.tsx)
- [src/pages/admin/hr/AdminHRTickets.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRTickets.tsx)
- [src/pages/admin/hr/AdminHRSectionBridge.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/pages/admin/hr/AdminHRSectionBridge.tsx)

Catatan:
- area ini belum menjadi prioritas refactor pertama
- auditnya dilakukan setelah struktur `/org/hr` stabil
- jangan memperluas `/admin/hr` lebih cepat daripada tenant HR

#### E. Urutan File Yang Disentuh

Urutan yang disarankan:
1. [src/components/admin/organization/OrganizationSidebar.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/admin/organization/OrganizationSidebar.tsx)
2. [src/App.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/App.tsx)
3. [src/components/admin/organization/OrganizationLayout.tsx](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/src/components/admin/organization/OrganizationLayout.tsx)
4. halaman inti `/org/hr`
5. bridge page `/org/hr`
6. guard, query, dan KPI terkait HR
7. baru kemudian area `/admin/hr`

Alasannya:
- sidebar dan route adalah sumber kebingungan utama
- heading dan breadcrumb mengikuti hasil route final
- halaman inti baru aman dirapikan setelah navigasi final jelas

#### F. Larangan Saat Menyentuh File

Saat refactor file-file di atas:
- jangan mengubah mekanisme absensi inti hanya demi HR
- jangan memindahkan logika absensi ke halaman HR
- jangan menambah route baru tanpa memasukkannya ke tabel final dokumen
- jangan menjadikan bridge page sebagai solusi permanen bila halaman final seharusnya sudah ada
- jangan memperluas `/admin/hr` sebelum `/org/hr` selesai dirapikan

#### G. Ringkasan Praktis

Kalau ingin mulai implementasi:
- mulai dari sidebar
- pastikan route final di `App.tsx`
- cocokkan layout
- audit halaman inti
- tahan diri untuk tidak menyentuh domain absensi
- baru setelah itu lanjut ke governance `/admin/hr`

### 32.21 Workflow Inti HR

Agar HR berjalan mandiri, modul ini harus dipahami sebagai rangkaian workflow, bukan sekadar kumpulan halaman.

Workflow inti yang harus menjadi fokus:

#### A. Pegawai Masuk

Langkah minimal:
- data pegawai dibuat atau diaktifkan
- unit kerja, jabatan, dan atasan ditetapkan
- status kepegawaian ditentukan
- kontrak awal dihubungkan bila diperlukan
- dokumen awal dilampirkan bila diperlukan

Output:
- pegawai memiliki identitas HR yang jelas
- pegawai siap terhubung ke domain absensi tanpa membuat master data baru

#### B. Pegawai Aktif

Langkah minimal:
- data pegawai bisa diperbarui
- perubahan struktur atau jabatan tercatat
- kontrak aktif dapat dipantau
- dokumen HR dapat dikelola
- tiket atau bantuan HR dapat ditangani

Output:
- HR dapat menjaga data pegawai tetap rapi sepanjang masa aktif kerja

#### C. Perubahan Hubungan Kerja

Contoh:
- pindah jabatan
- pindah unit
- perubahan atasan
- perpanjangan kontrak
- perubahan status kerja

Aturan:
- perubahan harus punya owner yang jelas
- perubahan sensitif sebaiknya punya histori atau audit trail

#### D. Pegawai Keluar

Langkah minimal:
- status pegawai diperbarui
- kontrak ditutup atau diakhiri
- dokumen akhir dicatat bila relevan
- akses kerja dan route operasional ditinjau

Catatan:
- proses ini tetap tidak boleh mengubah histori absensi mentah yang sudah terjadi

#### E. Bantuan dan Tiket HR

Langkah minimal:
- user dapat mencari FAQ
- user dapat meminta bantuan
- tiket dapat dibuat, dipantau, dan diselesaikan

Output:
- masalah HR operasional tidak bercampur dengan helpdesk umum tanpa label domain

### 32.22 Model Data Minimum HR

Agar HR mandiri, ada model data minimum yang harus dipahami.

#### A. Entitas Inti

Entitas minimum:
- pegawai
- struktur organisasi
- jabatan
- status kepegawaian
- kontrak kerja
- dokumen HR
- relasi atasan atau approval
- tiket HR

#### B. Source of Truth

Prinsip source of truth:
- identitas pegawai tetap mengacu ke data pegawai yang sudah ada
- event absensi tetap mengacu ke domain absensi
- HR menambahkan konteks, histori, policy, dan governance

#### C. Relasi Minimum

Relasi yang harus jelas:
- pegawai -> unit kerja
- pegawai -> jabatan
- pegawai -> atasan
- pegawai -> status kepegawaian
- pegawai -> kontrak
- pegawai -> dokumen HR

#### D. Data Yang Wajib Historis

Minimal yang sebaiknya historis:
- riwayat jabatan
- riwayat unit kerja
- riwayat atasan
- riwayat status kerja
- riwayat kontrak

#### E. Larangan Model Data

Jangan lakukan:
- membuat master pegawai kedua untuk HR
- menggandakan event absensi ke tabel HR
- membuat status HR yang bertentangan dengan status kerja yang sudah menjadi sumber kebenaran

### 32.23 Owner dan Tanggung Jawab Per Area

Agar HR tidak kabur, tiap area harus punya owner yang jelas.

| Area | Owner Utama | Catatan |
|---|---|---|
| Data Pegawai | admin organisasi | operator HR bisa membantu secara terbatas |
| Struktur Organisasi | admin organisasi | perubahan besar sebaiknya diaudit |
| Jabatan dan Grade | admin organisasi | jangan dibuka bebas ke semua operator |
| Kontrak Kerja | admin organisasi | area sensitif, perlu batas edit jelas |
| Dokumen HR | admin organisasi | operator HR dapat membantu pada dokumen tertentu |
| Approval Hierarchy | admin organisasi | harus konsisten dengan struktur pelaporan |
| Tiket HR | operator HR | admin organisasi tetap memegang kontrol akhir |
| Pengaturan HR | admin organisasi | bukan area operator umum |
| Audit Platform HR | super admin platform | hanya untuk `/admin/hr` |

Prinsip ownership:
- owner data tidak selalu sama dengan viewer data
- viewer yang banyak tidak berarti editor juga banyak
- area sensitif harus selalu punya owner yang sempit

### 32.24 Roadmap Fase Implementasi HR

Agar pembangunan HR berjalan terstruktur, implementasi sebaiknya dibagi per fase.

#### Fase 1: Fondasi Tenant HR

Fokus:
- sidebar `/org/hr`
- route final tenant
- data pegawai
- struktur organisasi
- jabatan dan grade
- kontrak kerja
- dokumen HR dasar

Tujuan:
- membuat workspace HR tenant stabil dan mudah dipahami

#### Fase 2: Laporan dan Bantuan HR

Fokus:
- laporan HR
- tiket HR
- FAQ HR
- bantuan HR
- pembersihan KPI agar sesuai boundary domain

Tujuan:
- memastikan HR bisa dipakai secara operasional, bukan hanya menyimpan data

#### Fase 3: Policy dan Governance Tenant

Fokus:
- pengaturan HR
- users, roles, permissions
- approval hierarchy
- audit trail perubahan penting

Tujuan:
- membuat HR tenant aman dan bisa dioperasikan dengan batas yang jelas

#### Fase 4: Lifecycle Lanjutan

Fokus:
- onboarding
- offboarding
- leave policy yang lebih matang
- dokumen dan legal lanjutan

Tujuan:
- memperluas HR tanpa merusak fondasi tenant yang sudah stabil

#### Fase 5: Governance Platform `/admin/hr`

Fokus:
- tenant readiness
- policy baseline
- audit lintas tenant
- monitoring error
- helpdesk lintas tenant

Tujuan:
- membangun governance setelah tenant HR sudah matang

#### Fase 6: Domain Lanjutan Yang Ditunda

Catatan pembaruan:
- heading ini dipertahankan sebagai jejak desain awal
- untuk status operasional Maret 2026, ATS, ESS, performance, dan training tidak lagi dianggap domain yang sepenuhnya ditunda
- pembacaan yang benar sekarang adalah: domain-domain ini sudah aktif sebagai baseline tenant, tetapi kedalaman capability per halaman masih belum seragam

Fokus:
- ATS
- ESS
- performance
- training

Catatan:
- fase ini hanya masuk setelah fase 1 sampai 5 cukup stabil
- jangan dipaksa masuk lebih awal hanya karena route sudah tersedia

### 32.25 Dependency Map HR

Bagian ini dipakai untuk memastikan pembangunan HR mengikuti urutan dependensi yang sehat.

Prinsip utamanya:
- jangan membangun modul yang bergantung pada fondasi yang belum stabil
- jangan memaksa halaman terlihat lengkap kalau data owner-nya belum siap
- gunakan dependency map ini untuk menentukan apa yang boleh dikerjakan dulu dan apa yang harus menunggu

#### A. Fondasi Paling Dasar

Fondasi dasar yang harus stabil lebih dulu:
- identitas pegawai
- struktur organisasi
- jabatan dan grade
- status kepegawaian
- kontrak kerja dasar
- boundary HR vs absensi
- route final `/org/hr`

Kalau fondasi ini belum stabil:
- laporan HR akan kabur
- approval hierarchy akan rawan salah
- governance tenant akan rapuh

#### B. Ketergantungan Antar Area

| Area | Bergantung Pada | Catatan |
|---|---|---|
| Data Pegawai | identitas pegawai | fondasi utama semua area HR |
| Struktur Organisasi | unit kerja, lokasi, relasi organisasi | diperlukan untuk ownership dan pelaporan |
| Jabatan dan Grade | data pegawai, struktur organisasi | jangan dibangun terpisah dari struktur |
| Kontrak Kerja | data pegawai, status kerja | area sensitif, harus konsisten |
| Dokumen HR | data pegawai, kontrak | metadata dokumen harus mengikuti owner pegawai |
| Approval Hierarchy | struktur organisasi, atasan, jabatan | tidak boleh dibangun sebelum relasi pelaporan jelas |
| Laporan HR | data pegawai, absensi, kontrak, leave | hanya aman jika boundary domain sudah rapi |
| Tiket HR | role matrix, helpdesk HR | tidak bergantung ke absensi inti, tetapi bergantung ke role yang jelas |
| Pengaturan HR | role matrix, policy matrix | tidak boleh dibuka sebelum ownership jelas |
| `/admin/hr` governance | `/org/hr` yang stabil | jangan dibangun lebih cepat dari tenant HR |

#### C. Ketergantungan ke Domain Absensi

Area HR yang bergantung ke absensi:
- laporan kehadiran HR
- analitik keterlambatan
- rekap cuti atau izin
- evaluasi disiplin berbasis event absensi

Aturan:
- HR hanya boleh mengonsumsi data absensi
- kalau data absensi belum rapi, halaman HR yang bergantung padanya harus dibatasi atau ditandai belum final
- perbaikan data absensi dilakukan di domain absensi, bukan di HR

#### D. Area Yang Tidak Boleh Didahulukan

Area berikut tidak boleh diprioritaskan sebelum fondasi stabil:
- `/admin/hr`
- ATS
- ESS
- performance
- training
- legal lanjutan
- integrasi absensi lanjutan dari sisi HR

Alasannya:
- area-area ini memperbesar kompleksitas
- kalau dibangun terlalu cepat, HR akan tampak banyak fitur tetapi tidak punya fondasi yang rapi

#### E. Urutan Build Yang Aman

Urutan yang aman:
1. route final `/org/hr`
2. sidebar dan layout tenant
3. halaman inti tenant
4. heading, breadcrumb, dan guard
5. laporan dan query HR
6. governance tenant
7. baru kemudian `/admin/hr`
8. baru kemudian domain lanjutan

#### F. Tanda Bahwa Dependency Dilompati

Waspadai tanda-tanda ini:
- laporan sudah dibuat, tetapi definisi data pegawai belum stabil
- approval hierarchy sudah dibuat, tetapi struktur atasan belum jelas
- `/admin/hr` mulai diperluas, tetapi tenant HR masih membingungkan
- dashboard HR sudah banyak KPI, tetapi source of truth belum tegas
- HR mulai mengubah schema atau mekanisme absensi demi mengejar fitur

Kalau salah satu tanda ini muncul, berarti urutan pengerjaan sedang melompati fondasi.

#### G. Ringkasan Praktis

Cara paling sederhana membaca dependency map:
- fondasi orang dan struktur dulu
- operasional tenant dulu
- laporan dan governance setelah itu
- superadmin belakangan
- absensi tetap domain induk untuk event harian

### 32.26 Mode Delegasi Sementara

Bagian ini menegaskan bahwa selama fase perapihan dan pembangunan HR, peran pengarah teknis harian dapat diambil sementara oleh agent ini agar pekerjaan berjalan lebih mandiri dan konsisten.

Prinsipnya:
- user tetap menjadi pemilik keputusan produk akhir
- agent mengambil alih koordinasi teknis harian sementara
- agent bekerja berdasarkan panduan ini, bukan berdasarkan improvisasi bebas
- setiap langkah tetap harus tunduk pada boundary HR, absensi, dan governance yang sudah ditetapkan

Yang diambil alih sementara oleh agent:
- menyusun urutan kerja teknis
- menentukan batch refactor yang aman
- memilih file awal yang disentuh
- menjaga konsistensi sidebar, route, heading, dan guard
- menahan ekspansi fitur yang melompati fondasi
- mengingatkan jika perubahan mulai keluar dari domain HR

Yang tidak diambil alih:
- keputusan bisnis akhir yang benar-benar ambigu
- penghapusan permanen yang berdampak besar tanpa dasar yang cukup
- perubahan domain absensi inti
- perubahan yang bertentangan dengan panduan ini

Aturan kerja selama delegasi sementara:
- jika ada dua arah yang sama-sama valid, pilih arah yang paling aman dan paling sempit
- jika ada konflik dengan boundary absensi, berhenti dan perlakukan sebagai isu domain absensi
- jika ada route lama yang masih mungkin dipakai, tahan dulu sebagai `internal` atau `redirect`
- jika ada keraguan pada ownership data, utamakan owner yang lebih sempit

Tujuannya:
- mengurangi kebutuhan user untuk mengarahkan detail teknis satu per satu
- menjaga agar pembangunan HR tetap terstruktur
- mencegah modul HR tumbuh liar saat implementasi dimulai

Cara membaca section ini:
- selama belum ada arahan baru yang membatalkan, agent boleh melanjutkan pekerjaan HR secara mandiri
- semua keputusan teknis harian tetap harus bisa ditelusuri kembali ke panduan ini

### 32.27 Appendix Implementasi Final

Bagian ini adalah lapisan terakhir dokumen yang dipakai sebagai pegangan refactor nyata.

Tujuannya:
- mengurangi tafsir tambahan saat menyentuh kode
- menyatukan route, role, aksi, source data, dan status implementasi
- menjadi pegangan terakhir sebelum refactor sidebar, guard, dan query

Arti kolom:
- `Lihat`: role minimum yang boleh membuka halaman
- `Ubah`: role yang boleh mengubah data operasional utama
- `Approve`: role yang boleh memberi persetujuan bila ada alur approval
- `Konfigurasi`: role yang boleh mengubah aturan, setting, atau baseline
- `Source Data`: sumber data utama yang dibaca halaman
- `Status`: `tampil`, `terbatas`, `internal`, `redirect`, atau `tunda`

| Route | Lihat | Ubah | Approve | Konfigurasi | Source Data | Status |
|---|---|---|---|---|---|---|
| `/org/hr` | admin organisasi | tidak ada aksi ubah utama | tidak | tidak | `employees`, `attendance_records`, `leave_requests`, `hr_contracts` | tampil |
| `/org/hr/employees` | admin organisasi | admin organisasi | tidak | tidak | `employees` | tampil |
| `/org/hr/structure` | admin organisasi | admin organisasi | tidak | admin organisasi | `opd`, `work_units`, `offices` | tampil |
| `/org/hr/position-grade` | admin organisasi | admin organisasi | tidak | admin organisasi | `positions`, grade HR | tampil |
| `/org/hr/contracts` | admin organisasi | admin organisasi | tidak | admin organisasi | `hr_contracts`, `employees` | tampil |
| `/org/hr/documents` | admin organisasi | admin organisasi | tidak | admin organisasi | dokumen HR, `employees` | tampil |
| `/org/hr/reports` | admin organisasi | tidak ada aksi ubah utama | tidak | tidak | `employees`, `attendance_records`, `leave_requests`, `hr_contracts` | tampil |
| `/org/hr/help/faq` | operator HR | admin organisasi | tidak | admin organisasi | FAQ HR | tampil |
| `/org/hr/help/tickets` | operator HR | operator HR terbatas, admin organisasi penuh | admin organisasi bila alur membutuhkan | admin organisasi | tiket HR | tampil |
| `/org/hr/settings` | admin organisasi | tidak ada aksi ubah operasional | tidak | admin organisasi | setting HR tenant | tampil |
| `/org/hr/help/support` | operator HR | tidak | tidak | tidak | alias ke tiket HR | redirect |
| `/org/hr/faq` | operator HR | tidak | tidak | tidak | alias ke FAQ HR | redirect |
| `/org/hr/tickets` | operator HR | tidak | tidak | tidak | alias ke tiket HR | redirect |
| `/org/hr/support` | operator HR | tidak | tidak | tidak | alias ke tiket HR | redirect |
| `/org/hr/departments` | admin organisasi | tidak | tidak | tidak | alias ke struktur organisasi | redirect |
| `/org/hr/divisions` | admin organisasi | tidak | tidak | tidak | alias ke struktur organisasi | redirect |
| `/org/hr/work-locations` | admin organisasi | tidak | tidak | tidak | alias ke struktur organisasi | redirect |
| `/org/hr/employee-status` | admin organisasi | tidak | tidak | tidak | alias ke data pegawai | redirect |
| `/org/hr/job-history` | admin organisasi | tidak | tidak | tidak | alias ke data pegawai | redirect |
| `/org/hr/document-templates` | admin organisasi | tidak | tidak | tidak | alias ke dokumen HR | redirect |
| `/org/hr/users` | admin organisasi | tidak | tidak | tidak | alias ke pengaturan HR | redirect |
| `/org/hr/roles` | admin organisasi | tidak | tidak | tidak | alias ke pengaturan HR | redirect |
| `/org/hr/permissions` | admin organisasi | tidak | tidak | tidak | alias ke pengaturan HR | redirect |
| `/org/hr/approval-hierarchy` | admin organisasi | tidak | tidak | tidak | alias ke pengaturan HR | redirect |
| `/org/hr/general-settings` | admin organisasi | tidak | tidak | tidak | alias ke pengaturan HR | redirect |
| `/org/hr/import-export` | admin organisasi | tidak | tidak | tidak | alias ke pengaturan HR | redirect |
| `/org/hr/backup` | admin organisasi | tidak | tidak | tidak | alias ke pengaturan HR | redirect |
| `/org/hr/help/error-logs` | admin organisasi | tidak | tidak | admin organisasi | error log HR | internal |
| `/org/hr/attendance-insights` | admin organisasi | tidak | tidak | tidak | `attendance_records`, analitik HR | internal |
| `/org/hr/attendance-recap` | admin organisasi | tidak | tidak | tidak | alias ke laporan HR | redirect |
| `/org/hr/leave-recap` | admin organisasi | tidak | tidak | tidak | alias ke laporan HR | redirect |
| `/org/hr/company` | admin organisasi | tidak | tidak | tidak | alias ke struktur organisasi | redirect |
| `/org/hr/work-calendar` | admin organisasi | tidak | tidak | tidak | alias ke struktur organisasi | redirect |
| `/org/hr/notifications` | admin organisasi | tidak | tidak | tidak | alias ke pengaturan HR | redirect |
| `/org/hr/activity-log` | admin organisasi | tidak | tidak | tidak | alias ke pengaturan HR | redirect |
| `/org/hr/branding` | admin organisasi | tidak | tidak | tidak | alias ke pengaturan HR | redirect |
| `/admin/hr` | super admin platform | tidak ada aksi ubah operasional | tidak | tidak | agregasi readiness tenant, audit summary, health summary | tampil |
| `/admin/hr/tenants` | super admin platform | super admin platform terbatas | tidak | super admin platform | tenant HR, status aktivasi, readiness tenant | tampil |
| `/admin/hr/policies` | super admin platform | tidak ada aksi ubah operasional utama | tidak | super admin platform | baseline policy HR platform | tampil |
| `/admin/hr/settings` | super admin platform | tidak ada aksi ubah operasional utama | tidak | super admin platform | setting global HR platform | tampil |
| `/admin/hr/audit` | super admin platform | tidak | tidak | super admin platform | audit lintas tenant, compliance summary | tampil |
| `/admin/hr/error-logs` | super admin platform | tidak | tidak | super admin platform | error log lintas tenant, health monitoring | tampil |
| `/admin/hr/help/faq` | super admin platform | super admin platform | tidak | super admin platform | FAQ global HR | tampil |
| `/admin/hr/help/tickets` | super admin platform | super admin platform terbatas | super admin platform bila alur membutuhkan | super admin platform | tiket HR lintas tenant | tampil |
| `/admin/hr/profile` | super admin platform | tidak | tidak | super admin platform | profil area HR platform | terbatas |
| `/admin/hr/help/support` | super admin platform | tidak | tidak | tidak | support global HR | terbatas |
| `/admin/hr/faq` | super admin platform | tidak | tidak | tidak | alias ke FAQ global HR | redirect |
| `/admin/hr/support` | super admin platform | tidak | tidak | tidak | alias ke support global HR | redirect |
| `/admin/hr/tickets` | super admin platform | tidak | tidak | tidak | alias ke tiket lintas tenant | redirect |
| `/admin/hr/sections/:sectionKey` | super admin platform | tidak | tidak | tidak | bridge section admin HR | internal |

Catatan akhir:
- kolom aksi di appendix ini lebih kuat daripada `role minimum`, karena langsung memisahkan lihat, ubah, approve, dan konfigurasi
- kalau ada konflik antara implementasi kode dan appendix ini, refactor harus mengikuti appendix ini sampai ada keputusan baru yang eksplisit
- perubahan pada appendix ini harus dianggap perubahan arsitektur implementasi, bukan sekadar edit dokumen biasa

### 32.28 Aktivasi Awal HR

Aktivasi awal HR harus diperlakukan sebagai `minimum viable activation`, bukan pembukaan penuh semua route HR yang sudah ada di codebase.

Prinsip aktivasi:
- switch HR menyalakan workspace tenant `/org/hr`
- switch HR membuka paket produksi minimum
- switch HR tidak mempromosikan route internal atau bridge
- aktivasi HR tidak boleh mengubah source of truth dan mekanisme absensi

Route produksi minimum yang aktif:
- `/org/hr`
- `/org/hr/employees`
- `/org/hr/structure`
- `/org/hr/position-grade`
- `/org/hr/contracts`
- `/org/hr/documents`
- `/org/hr/reports`
- `/org/hr/help/tickets`
- `/org/hr/settings`

Route yang tetap hidup tetapi non-sidebar:
- `/org/hr/attendance-insights`
- `/org/hr/help/error-logs`
- route bridge atau workspace perantara HR
- alias lama yang masih dibutuhkan untuk transisi

Aturan aktivasi awal:
- admin organisasi menjadi aktor utama workspace HR
- operator HR tidak otomatis diperluas ke seluruh modul
- route internal boleh tetap hidup untuk transisi, tetapi tidak dianggap halaman produksi
- route alias lama boleh diarahkan ke halaman produksi terdekat tanpa menghapus route lama terlalu cepat

Aturan boundary:
- HR boleh membaca data absensi yang relevan untuk konteks HR
- HR tidak boleh mengambil alih check-in, check-out, validasi kehadiran, atau histori absensi mentah
- bila ada konflik antara aktivasi HR dan domain absensi, domain absensi harus dipertahankan

### 32.29 Sinkronisasi Implementasi Putaran Pertama

Bagian ini mencatat hasil refactor awal `/org/hr` agar panduan tidak tertinggal dari implementasi.

Catatan konsolidasi:
- bila ada konflik antara section evaluasi awal dan bagian ini, ikuti `32.29`, `32.30`, dan appendix final
- section yang lebih lama dipertahankan sebagai jejak reasoning, bukan sumber kebenaran implementasi terbaru

Status implementasi saat ini:
- route produksi minimum aktif:
  - `/org/hr`
  - `/org/hr/employees`
  - `/org/hr/structure`
  - `/org/hr/position-grade`
  - `/org/hr/contracts`
  - `/org/hr/documents`
  - `/org/hr/reports`
  - `/org/hr/help/tickets`
  - `/org/hr/settings`
- route bantuan sekunder tetap hidup:
  - `/org/hr/help/faq`
- route internal yang tetap hidup:
  - `/org/hr/attendance-insights`
  - `/org/hr/help/error-logs`
  - route prioritas internal seperti onboarding, offboarding, work-hours, shifts, leave-types, performance/training, ESS
  - route rekrutmen yang masih hidup di luar paket produksi minimum

Status alias dan redirect yang sudah disempitkan:
- `/org/hr/help` diarahkan ke `/org/hr/help/tickets`
- `/org/hr/faq` diarahkan ke `/org/hr/help/faq`
- `/org/hr/support`, `/org/hr/help/support`, dan `/org/hr/tickets` diarahkan ke `/org/hr/help/tickets`
- route sekunder organisasi diarahkan ke induknya:
  - `/org/hr/company` -> `/org/hr/structure`
  - `/org/hr/departments` -> `/org/hr/structure`
  - `/org/hr/divisions` -> `/org/hr/structure`
  - `/org/hr/work-locations` -> `/org/hr/structure`
  - `/org/hr/work-calendar` -> `/org/hr/structure`
- route sekunder pegawai diarahkan ke induknya:
  - `/org/hr/employee-status` -> `/org/hr/employees`
  - `/org/hr/job-history` -> `/org/hr/employees`
- route sekunder dokumen diarahkan ke induknya:
  - `/org/hr/document-templates` -> `/org/hr/documents`
  - `/org/hr/warning-letters` -> `/org/hr/documents`
  - `/org/hr/contract-templates` -> `/org/hr/documents`
  - `/org/hr/digital-signature` -> `/org/hr/documents`
- route sekunder laporan diarahkan ke induknya:
  - `/org/hr/attendance-recap` -> `/org/hr/reports`
  - `/org/hr/attendance-integrations` -> `/org/hr/reports`
  - `/org/hr/leave-recap` -> `/org/hr/reports`
- route sekunder pengaturan diarahkan ke induknya:
  - `/org/hr/notifications` -> `/org/hr/settings`
  - `/org/hr/activity-log` -> `/org/hr/settings`
  - `/org/hr/users` -> `/org/hr/settings`
  - `/org/hr/roles` -> `/org/hr/settings`
  - `/org/hr/permissions` -> `/org/hr/settings`
  - `/org/hr/approval-hierarchy` -> `/org/hr/settings`
  - `/org/hr/general-settings` -> `/org/hr/settings`
  - `/org/hr/branding` -> `/org/hr/settings`
  - `/org/hr/import-export` -> `/org/hr/settings`
  - `/org/hr/backup` -> `/org/hr/settings`

Keputusan implementasi yang dipakai:
- route lama tidak langsung dihapus
- route yang punya padanan produksi jelas dipindahkan ke redirect
- route yang belum punya padanan aman dipertahankan sebagai internal
- copy halaman internal diberi penanda `internal` atau `transisi`
- KPI tiket HR dipisahkan dari tiket bantuan umum dengan marker `source`
- jalur bantuan HR dipersempit ke `FAQ HR` dan `Tiket HR`, sedangkan `help/support` menjadi alias transisi
- file legacy yang tidak lagi punya route aktif dapat dibersihkan dari codebase setelah status redirect dan internal dipastikan stabil

Makna putaran pertama:
- `/org/hr` sekarang sudah aktif sebagai workspace minimum viable
- navigasi utama jauh lebih sempit daripada kondisi awal
- route lama masih dipertahankan secukupnya untuk transisi
- pekerjaan berikutnya bukan lagi aktivasi, tetapi audit akhir dan cleanup bertahap

### 32.30 Audit Final Putaran Pertama

Bagian ini menegaskan hasil audit akhir untuk fase pertama aktivasi `/org/hr`.

Kesimpulan fase pertama:
- paket produksi minimum sudah aktif dan konsisten
- route sekunder yang punya induk jelas sudah diarahkan ke halaman produksi terdekat
- route yang belum punya padanan aman tidak dipaksa menjadi redirect
- boundary HR terhadap absensi tetap terjaga

Route yang dianggap `produksi` pada akhir fase pertama:
- `/org/hr`
- `/org/hr/employees`
- `/org/hr/structure`
- `/org/hr/position-grade`
- `/org/hr/contracts`
- `/org/hr/documents`
- `/org/hr/reports`
- `/org/hr/help/tickets`
- `/org/hr/settings`

Route yang tetap hidup sebagai `internal` pada akhir fase pertama:
- internal analitik dan audit:
  - `/org/hr/attendance-insights`
  - `/org/hr/help/error-logs`
- lifecycle lanjutan:
  - `/org/hr/onboarding`
  - `/org/hr/offboarding`
- kebijakan kehadiran lanjutan:
  - `/org/hr/work-hours`
  - `/org/hr/shifts`
  - `/org/hr/late-settings`
- kebijakan leave lanjutan:
  - `/org/hr/leave-types`
  - `/org/hr/leave-quota`
  - `/org/hr/leave-approval`
  - `/org/hr/leave-validity`
- performance dan training:
  - `/org/hr/kpi`
  - `/org/hr/performance-periods`
  - `/org/hr/performance-forms`
  - `/org/hr/review-360`
  - `/org/hr/evaluation-results`
  - `/org/hr/training-data`
  - `/org/hr/certifications`
  - `/org/hr/skill-matrix`
- ESS:
  - `/org/hr/ess/requests`
  - `/org/hr/ess/leave-requests`
  - `/org/hr/ess/attendance`
  - `/org/hr/ess/documents`
  - `/org/hr/ess/profile`
- recruitment:
  - `/org/hr/recruitment/jobs`
  - `/org/hr/recruitment/candidates`
  - `/org/hr/recruitment/interviews`
  - `/org/hr/recruitment/offers`

Keputusan penting:
- route `internal` di atas tidak masuk sidebar utama
- route `internal` di atas tidak dianggap bagian dari aktivasi awal HR
- route tersebut dipertahankan untuk fase berikutnya agar tidak memutus jalur transisi dan eksperimen yang masih ada
- jika fase berikutnya ingin HR tetap sempit, route internal itu dapat ditutup lagi ke redirect
- jika fase berikutnya ingin HR diperluas, route internal itu harus dimatangkan satu per satu sebelum kembali ke sidebar

Definition of done fase pertama:
- user organisasi melihat HR sebagai modul yang ringkas
- halaman utama HR sudah konsisten secara naming
- tiket HR sudah dipisahkan dari tiket bantuan umum
- route bridge yang paling jelas sudah ditutup ke induk
- panduan dan implementasi sekarang selaras

### 32.31 Cleanup Legacy Awal

Cleanup legacy awal yang sudah aman dilakukan:
- `src/pages/org/hr/OrgHRSupport.tsx`
  - tidak lagi punya route aktif
  - seluruh jalur bantuannya sudah dipusatkan ke `FAQ HR` dan `Tiket HR`
- `src/pages/org/hr/OrgHRSectionBridge.tsx`
  - tidak lagi punya route aktif di `/org/hr`
  - route organisasi yang dulu menjadi bridge sekarang sudah berupa redirect langsung ke halaman induk
- `src/pages/org/hr/OrgHROrganizationWorkspace.tsx`
  - tidak lagi punya route aktif di `/org/hr`
  - seluruh route organisasi yang dulu lewat workspace ini sudah menjadi redirect ke `Struktur Organisasi`
- `src/pages/org/hr/OrgHRGovernanceWorkspace.tsx`
  - tidak lagi punya route aktif di `/org/hr`
  - seluruh route governance yang dulu lewat workspace ini sudah menjadi redirect ke `Dokumen HR` atau `Pengaturan HR`
- `src/pages/org/hr/OrgHROperationalWorkspace.tsx`
  - route aktif terakhir `/org/hr/national-holidays` sudah dipersempit ke redirect
  - area operasional internal lain yang dulu ditanganinya sudah ditutup ke halaman induk

Prinsip cleanup yang dipakai:
- file hanya dibersihkan jika route aktifnya benar-benar sudah hilang
- cleanup legacy tidak boleh mengubah route produksi minimum
- cleanup legacy tidak boleh mengubah boundary HR terhadap absensi

### 32.32 Hardening Backend /org/hr v1

Setelah aktivasi dan cleanup navigasi selesai, `/org/hr` wajib diperkuat di backend agar pembatasan role tidak berhenti di UI.

Keputusan hardening:
- `organization_settings` tidak boleh lagi dibaca bebas untuk key HR sensitif.
- `hr_error_alert_settings_v1` hanya boleh dibaca admin organisasi atau super admin.
- `hr_ticket_policy_settings_v1` boleh dibaca admin organisasi, super admin, dan operator berbasis role `atasan` yang memang menangani tiket.
- role `atasan` tidak boleh punya `UPDATE` luas ke row tiket HR pada `feedback_reports`.
- aksi operator untuk mengambil tiket harus lewat jalur sempit/RPC, bukan `UPDATE` row bebas.
- `client_error_logs` untuk konteks HR internal harus dianggap admin-only di backend.
- `attendance-insights` harus memakai jalur baca admin-only tersendiri, bukan bergantung pada policy absensi umum.

Makna implementasi:
- `Tiket HR` tetap hidup untuk operator, tetapi aksi operator dibatasi ke `comment` dan `take`.
- `Log Error HR` tetap internal, dan tidak boleh diakses role `atasan` hanya karena satu tenant.
- `Analitik Kehadiran HR` tetap internal, dan tidak boleh mewarisi akses supervisor dari policy absensi umum.
- hidden menu bukan security; route internal harus aman walau dipanggil langsung.

### 32.33 Sinkronisasi Guard dan Capability Putaran Kedua

Setelah hardening backend awal, implementasi `/org/hr` masuk ke putaran kedua agar pembatasan akses tidak tersebar liar di sidebar, layout, dan halaman masing-masing.

Tujuan putaran kedua:
- menjadikan route `/org/hr` punya source of truth akses yang eksplisit
- memisahkan `route guard` dan `page capability`
- memastikan route internal dan bridge tetap konsisten walau dipanggil langsung
- membuat dokumen, route aktif, dan aksi halaman kembali sejajar

Status implementasi putaran kedua:
- route `/org/hr/*` sekarang memakai guard terpusat berbasis peta route
- halaman produksi utama HR memakai capability halaman terpusat untuk aksi utama
- halaman internal sensitif ikut membaca capability yang sama
- bridge page prioritas internal ikut membaca capability agar status akses tetap terlihat
- sidebar tenant HR sekarang punya dua lapisan:
  - workspace HR minimum yang tetap menjadi inti produksi
  - submenu internal bertanda `Internal` untuk route lifecycle, kehadiran, dan cuti yang masih transisi

Makna teknis:
- `route guard` dipakai untuk menjawab siapa yang boleh membuka route
- `page capability` dipakai untuk menjawab siapa yang boleh `view`, `edit`, `approve`, `configure`, atau `export`
- hidden sidebar atau redirect tidak lagi dianggap cukup sebagai kontrol akses

Route yang sudah mengikuti capability halaman terpusat:
- produksi minimum:
  - `/org/hr/employees`
  - `/org/hr/structure`
  - `/org/hr/position-grade`
  - `/org/hr/contracts`
  - `/org/hr/documents`
  - `/org/hr/reports`
  - `/org/hr/help/tickets`
  - `/org/hr/settings`
- internal sensitif:
  - `/org/hr/attendance-insights`
  - `/org/hr/help/error-logs`
- bridge internal:
  - route prioritas internal yang memakai `OrgHRPriorityWorkspace`

Interpretasi status setelah putaran kedua:
- `produksi`:
  - route minimum HR aktif
  - guard route terpusat aktif
  - capability halaman aktif
- `internal`:
  - route tetap hidup di luar sidebar utama
  - guard route terpusat aktif
  - capability halaman aktif bila halaman punya aksi sensitif atau status internal yang perlu ditampilkan
- `tunda`:
  - route tetap hidup untuk transisi
  - guard route terpusat aktif
  - capability halaman boleh cukup sebatas indikator read-only sampai modul matang

Kesimpulan praktis:
- appendix final pada `32.27` tetap menjadi source of truth arsitektur
- hasil implementasi sekarang sudah lebih dekat ke appendix dibanding putaran pertama
- gap yang tersisa bukan lagi fondasi akses, melainkan pendalaman fitur per halaman jika modul internal nanti dipromosikan menjadi produksi
- promosi route internal ke sidebar sudah dimungkinkan, tetapi harus diberi penanda eksplisit agar user tidak salah mengira semua item HR sudah matang

Langkah aman setelah putaran kedua:
- jangan memperluas sidebar HR sebelum modul internal tertentu matang
- jika halaman bridge berubah menjadi halaman operasional nyata, tambahkan capability aksi spesifik di level halaman
- jika route internal tidak lagi diperlukan, tutup ke redirect daripada membiarkannya menjadi pseudo-produksi

### 32.34 Status Sheet Eksekusi

Bagian ini merangkum status nyata implementasi agar pembacaan bab 32 tidak perlu dilakukan dari awal setiap kali audit.

| Area | Status | Catatan Praktis |
|---|---|---|
| Boundary HR vs absensi | selesai | HR membaca data absensi untuk konteks HR, tetapi tidak mengambil alih check-in, check-out, dan event harian absensi |
| Paket route produksi minimum `/org/hr` | selesai | route inti tenant aktif dan menjadi wajah utama workspace HR |
| Sidebar dan naming tenant HR | selesai | menu utama sudah disempitkan ke paket minimum dan naming utamanya konsisten |
| Sidebar ekspansi internal bertanda `Internal` | selesai secara terkendali | route transisi seperti onboarding, shift, dan cuti tertentu sudah bisa dibuka dari sidebar, tetapi tetap diberi label ekspektasi |
| Alias dan redirect route lama | selesai | route sekunder yang punya induk jelas sudah diarahkan ke halaman produksi terdekat |
| Route internal dan bridge | selesai secara fondasi | route internal masih hidup, tidak masuk sidebar utama, dan tetap dipertahankan untuk transisi |
| Guard route `/org/hr/*` | selesai | source of truth akses route sudah terpusat dan tidak lagi bergantung pada sidebar |
| Capability aksi per halaman produksi | selesai untuk HR v1 minimum | halaman utama HR sudah memakai capability `view/edit/approve/configure/export` sesuai kebutuhan implementasi saat ini |
| Capability halaman internal sensitif | selesai | `attendance-insights` dan `help/error-logs` sudah ikut capability layer |
| Capability bridge internal | selesai secara minimum | `OrgHRPriorityWorkspace` sudah membaca capability untuk status akses dan edit checklist transisi |
| Hardening backend tiket HR | selesai putaran pertama | operator dibatasi ke jalur sempit dan tidak mendapat update row bebas |
| Hardening backend error log HR | selesai putaran pertama | error log HR internal diperlakukan admin-only |
| Hardening backend attendance insights | selesai putaran pertama | analitik kehadiran memakai jalur baca admin-only khusus |
| Governance tenant HR | sebagian | pengaturan HR sudah aktif, tetapi kedalaman konfigurasi belum selengkap blueprint akhir |
| Dokumen HR | sebagian | halaman hidup, tetapi repository dokumen pegawai penuh belum matang |
| Laporan HR | sebagian | laporan inti sudah ada, tetapi cakupan analitik masih lebih sempit daripada blueprint dokumen |
| ATS | selesai baseline tenant | route ATS sudah aktif di tenant dan punya coverage E2E dasar |
| ESS | selesai baseline tenant | route ESS sudah aktif di tenant sebagai baseline layanan mandiri |
| Performance & training | selesai baseline tenant | route kinerja dan pelatihan sudah aktif sebagai baseline tenant |
| `/admin/hr` | selesai baseline governance | area admin HR aktif untuk governance, audit, helpdesk, policy map, dan section bridge |

Cara membaca status:
- `selesai`: fondasi dan implementasi utama sudah selaras dengan appendix final
- `sebagian`: halaman atau domain sudah hidup, tetapi kedalaman fitur belum setara blueprint akhir
- `backlog terkontrol`: route boleh masih hidup untuk transisi, tetapi belum boleh dianggap bagian dari aktivasi utama
- `backlog strategis`: area sengaja ditahan agar tidak melompati dependency

Prioritas lanjut yang paling aman:
1. pertahankan HR tenant tetap sempit sebagai paket produksi minimum
2. matangkan domain yang masih `sebagian` sebelum membuka area baru
3. tahan ekspansi governance, payroll, dan domain legal lanjutan sampai tenant HR benar-benar solid

Catatan navigasi saat ini:
- submenu umum HR di sidebar sudah dipecah menjadi:
  - `HR Workspace`
  - `HR Lifecycle`
  - `HR Kehadiran`
  - `HR Cuti`
  - `HR Bantuan`
  - `HR Pengaturan`
- pemecahan ini adalah keputusan presentasi navigasi, bukan tanda bahwa semua submenu sudah dianggap `produksi`
- label `Internal` pada item tertentu tetap menjadi penanda bahwa route tersebut masih bridge atau modul transisi
- `Jam Kerja` dan `Shift` tetap hidup sebagai route internal, tetapi sudah ditarik lagi dari sidebar HR agar boundary dengan domain jadwal/absensi tetap jelas
- `Approval Cuti` tetap hidup sebagai route internal, tetapi sudah ditarik lagi dari sidebar HR agar workflow approval aktif tidak terlihat seolah sudah pindah dari domain leave

### 32.35 Checklist Promosi Menu Internal ke Produksi

Checklist ini dipakai setiap kali sebuah menu HR yang masih bertanda `Internal` ingin dipromosikan menjadi menu produksi biasa.

Sebuah menu hanya layak dipromosikan jika:
- route finalnya stabil dan tidak lagi bergantung pada placeholder transisi
- heading halaman, label sidebar, dan nama domainnya sudah konsisten
- route guard sudah memakai source of truth akses terpusat
- capability halaman sudah jelas untuk `view`, `edit`, `approve`, `configure`, dan `export` sesuai kebutuhan
- source data utamanya sudah jelas dan tidak mencampuri ownership domain absensi
- halaman tidak lagi bergantung pada asumsi dummy, copy transisi, atau checklist scaffold
- ada alasan produk yang jelas kenapa menu ini perlu tampil sebagai navigasi utama

Sebelum mengganti label `Internal`, cek hal berikut:
1. apakah halaman ini sudah lebih dari sekadar bridge atau workspace transisi?
2. apakah user admin organisasi benar-benar bisa menyelesaikan pekerjaan utamanya dari halaman itu?
3. apakah route alias atau redirect lama yang terkait sudah aman?
4. apakah backend sensitifnya sudah aman walau route dibuka langsung?
5. apakah promosi menu ini tidak membuat sidebar kembali terlalu panjang atau berat dibaca?

Tanda bahwa promosi sebaiknya ditunda:
- halaman masih memakai wording `internal`, `transisi`, atau `prioritas` sebagai copy utama
- isi halaman masih berupa checklist manual tanpa aksi operasional nyata
- route masih dianggap `tunda` di policy route
- capability halaman masih read-only karena aksi utamanya belum matang
- domain tersebut masih tercatat `backlog terkontrol` atau `backlog strategis`

Urutan keputusan yang aman:
1. matangkan halaman dan source data
2. matangkan guard dan capability
3. hapus label `Internal`
4. baru promosikan sebagai menu produksi biasa

Aturan sederhana:
- jangan mempromosikan menu hanya karena route-nya sudah ada
- jangan mempromosikan menu hanya karena item sidebar-nya sudah bisa diklik
- promosi menu adalah keputusan produk dan navigasi, bukan sekadar keputusan teknis route

### 32.36 Catatan Historis Audit Promosi Internal

Bab `32.36` sampai `32.42` sebelumnya berisi audit promosi lama untuk:
- `Onboarding`
- `Jam Kerja`
- `Shift`
- `Approval Cuti`
- `Offboarding`

Status catatan tersebut sekarang:
- dianggap arsip historis
- tidak lagi menjadi sumber kebenaran status route
- banyak asumsi di dalamnya sudah berubah, karena route policy dan halaman operasional HR telah berkembang setelah audit awal dibuat

Ringkasan status terbaru yang menggantikan audit lama:
- `/org/hr/onboarding` sudah `tampil` dan menjadi baseline lifecycle HR
- `/org/hr/offboarding` sudah `tampil` dan menjadi baseline lifecycle HR
- `/org/hr/work-hours` sudah `tampil` dan tetap dibaca sebagai baseline kebijakan kerja HR, dengan boundary absensi tetap dijaga
- `/org/hr/shifts` sudah `tampil` dan menjadi baseline pola shift HR
- `/org/hr/leave-approval` sudah `tampil` dan menjadi baseline workflow cuti HR

Aturan baca yang berlaku sekarang:
- jika ada konflik antara audit promosi lama dan `Status Cepat`, gunakan `Status Cepat`
- jika ada konflik antara audit promosi lama dan `src/lib/hrRouteAccess.ts`, gunakan `src/lib/hrRouteAccess.ts`
- gunakan audit lama hanya sebagai jejak pemikiran desain, bukan keputusan operasional aktif

## Ringkasan

Dasar HRD bukan sekadar "data pegawai", tetapi sistem yang mengelola orang, kebijakan, status, dokumen, approval, dan histori perubahan. Kalau fondasi struktur, master pegawai, kontrak, role, dan audit rapi, modul HR akan lebih mudah dikembangkan ke dashboard, ESS, dan payroll tanpa menumpuk utang desain.
