# HR Payroll Readiness Execution Plan

Dokumen ini adalah turunan operasional dari:
- [docs/hr-to-payroll-readiness.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-to-payroll-readiness.md)
- [docs/hr-payroll-ready-fields.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-ready-fields.md)

Tujuan dokumen ini:
- menjawab apa saja yang masih kurang agar HR benar-benar siap jadi fondasi payroll
- mengubah status `partial` menjadi daftar kerja yang bisa ditutup satu per satu
- memberi gate yang jelas sebelum payroll dianggap layak diimplementasikan penuh

Status per 14 Maret 2026:
- readiness keseluruhan sudah naik ke `partial kuat`
- fokus dokumen ini adalah penutupan gap HR, bukan mengaktifkan payroll lebih awal

## Arti Prioritas

- `must`: wajib selesai sebelum HR boleh dianggap `ready`
- `should`: sangat disarankan selesai agar implementasi payroll tidak cepat mentok
- `later`: bisa menyusul setelah baseline payroll aman

## Ringkasan Eksekutif

Kalau ditanya apa yang harus dilengkapi sekaligus agar HR siap payroll, jawabannya ada 7 kelompok kerja:

1. master pegawai
2. status kepegawaian
3. kontrak kerja
4. jabatan, grade, dan golongan
5. policy kerja yang berdampak ke payroll
6. laporan dan audit trail
7. lifecycle onboarding dan offboarding

Selama tujuh area ini belum ditutup, payroll masih berisiko dibangun di atas data efektif yang belum cukup ketat.

## Daftar Wajib Selesai (`must`)

### 1. Master Pegawai Operasional

Status saat ini:
- `partial`

Yang harus lengkap:
- data pegawai bukan hanya tampil, tetapi benar-benar bisa dikelola
- ada surface operasional untuk create/edit
- ada jalur import/export minimal
- status aktif/nonaktif jelas
- kategori pegawai, jabatan, dan tenant terisi konsisten

Exit criteria:
- halaman `employees` tidak lagi hanya `monitoring read-only`
- perubahan data inti pegawai bisa dilakukan dan terlacak
- tidak ada pegawai aktif tanpa identitas minimum payroll

Progress terbaru:
- `create`, `edit`, `status`, dan `export` dasar sudah hidup
- pintu masuk `import` sudah tersedia langsung dari workspace HR
- create path sudah menyimpan relasi `OPD`, `Unit Kerja`, `Lokasi`, dan `Jabatan Master`
- duplicate check `email/NIP/NIK` sudah dibuat null-safe
- dialog `Tambah/Edit Pegawai` sekarang scrollable sehingga aksi simpan tidak jatuh di luar viewport
- halaman `employees` sekarang punya indikator `Payroll-Ready Aktif`, tab `Butuh Review`, dan badge gap payroll-impact per pegawai
- tab `Ringkasan` sekarang memecah jumlah gap per field (`Kategori`, `Jabatan`, `NIK`, `OPD`, `Unit`, `Lokasi`) agar perapian data tenant lebih terarah
- kartu checklist sekarang bisa memfokuskan admin langsung ke filter gap terkait di tab `Butuh Review`
- export `employees` sekarang mengikuti konteks tab/filter `Butuh Review`, termasuk gap payroll yang sedang difokuskan
- dialog edit pegawai yang belum lengkap sekarang menampilkan `Field Prioritas Payroll` dan quick-fill `Kategori Pegawai`
- tombol gap di panel `Field Prioritas Payroll` sekarang langsung memfokuskan field terkait di dialog edit
- dialog edit dari `Butuh Review` sekarang mendukung navigasi `Sebelumnya/Berikutnya` dan `Simpan & Lanjut` untuk batch review
- dialog batch review sekarang menampilkan progres `x dari y` dan progress bar untuk gap yang sedang dikerjakan
- filter `Kategori` di `Butuh Review` sekarang punya bulk action untuk mengisi kategori pegawai secara massal dengan audit log
- bulk action kategori sekarang dilindungi dialog konfirmasi sebelum write massal dijalankan
- dialog bulk kategori sekarang menampilkan preview pegawai terdampak sebelum perubahan dijalankan
- bulk kategori sekarang bisa memakai seleksi baris tertentu di `Butuh Review`, jadi admin tidak dipaksa menulis ke seluruh hasil filter
- suite E2E sekarang punya test target khusus untuk memastikan bulk kategori menghormati seleksi baris, dan run target itu sudah lolos
- dialog edit batch dari `Butuh Review` sekarang ikut menghormati seleksi pegawai pada gap `Kategori`, sehingga `Simpan & Lanjut` bisa dipakai membersihkan subset terpilih tanpa berputar ke seluruh hasil filter
- navigasi review subset pada gap `Kategori` sekarang juga sudah punya coverage runtime terfokus dan run target-nya lolos tanpa menyentuh data tenant nyata
- gap utama tersisa pada peluasan surface edit master, pembuktian write path create/import yang aman, dan perapian data pegawai tenant nyata yang masih punya field payroll-impact kosong

### 2. Status Kepegawaian dengan Tanggal Efektif

Status saat ini:
- `partial`

Yang harus lengkap:
- jenis hubungan kerja jelas
- status aktif/nonaktif punya tanggal efektif
- alasan perubahan status bisa ditelusuri
- histori perubahan status tidak hilang

Exit criteria:
- payroll bisa menentukan siapa yang sah dihitung pada tanggal tertentu
- perubahan status tidak ambigu

### 3. Kontrak Kerja yang Bisa Dipercaya

Status saat ini:
- `partial`

Yang harus lengkap:
- jenis kontrak
- tanggal mulai
- tanggal berakhir untuk kontrak berjangka
- status kontrak
- validasi overlap kontrak aktif
- nomor kontrak dan dokumen kontrak minimal bisa ditelusuri

Exit criteria:
- kontrak aktif efektif per pegawai bisa dibaca pada tanggal tertentu
- tidak ada kontrak aktif overlap tanpa aturan jelas

Progress terbaru:
- `effective_date`, `status_reason`, dan audit minimum sudah hidup
- validasi `effective_date`, alasan status, dan overlap kontrak aktif sekarang lebih ketat
- smoke write UI `create -> delete` untuk kontrak kerja sudah lolos
- smoke write UI `create -> delete` untuk undangan onboarding sudah lolos
- smoke reversible `offboarding -> reactivation` UI sudah lolos setelah flow memakai `mutation_type` yang kompatibel dengan schema remote
- gap utama tersisa pada review data kontrak/lifecycle nyata dan E2E lintas lifecycle lain

### 4. Jabatan, Grade, dan Golongan Final

Status saat ini:
- `partial`

Yang harus lengkap:
- setiap pegawai aktif terhubung ke jabatan yang valid
- grade/golongan yang dipakai payroll berasal dari master aktif
- kode atau identitas master cukup stabil untuk mapping komponen payroll

Exit criteria:
- pegawai bisa dipetakan ke struktur kompensasi tanpa asumsi manual

### 5. Policy Kerja yang Payroll-Impact

Status saat ini:
- `partial`

Yang harus lengkap:
- jam kerja aktif
- shift aktif bila dipakai
- rule lembur
- rule keterlambatan bila ada potongan
- klasifikasi cuti/izin yang berdampak ke payroll

Exit criteria:
- payroll bisa membaca rule dasar lembur, keterlambatan, dan kehadiran tanpa menebak

### 6. Laporan dan Audit Trail

Status saat ini:
- `partial`

Yang harus lengkap:
- laporan HR minimal mendukung filter
- ada export dasar untuk audit
- perubahan payroll-impact punya actor, waktu efektif, dan alasan perubahan

Exit criteria:
- admin bisa melakukan audit dasar payroll tanpa bongkar manual data mentah
- perubahan penting bisa ditelusuri dari UI/log operasional

Progress terbaru:
- filter, print, dan export dasar sudah hidup di `reports`
- ringkasan audit trail payroll-impact sudah mencakup pegawai, kontrak, onboarding invitation, offboarding, cuti, WFH, lembur, mutasi, dan absensi khusus
- gap utama tersisa pada pembuktian write path end-to-end dan penguatan laporan audit yang lebih payroll-grade

### 7. Lifecycle Onboarding dan Offboarding

Status saat ini:
- `partial`

Yang harus lengkap:
- onboarding memastikan pegawai baru mencapai kondisi payroll-ready
- offboarding memastikan penghentian payroll punya tanggal efektif jelas
- histori pegawai keluar tidak merusak audit

Exit criteria:
- pegawai baru dan pegawai keluar tidak menimbulkan ambiguitas perhitungan payroll

## Daftar Sangat Disarankan (`should`)

### 1. Dokumen HR Payroll-Impact

Yang sebaiknya lengkap:
- kontrak kerja
- SK pengangkatan/perubahan status
- dokumen pendukung legal yang relevan

Nilai tambah:
- mempermudah audit payroll dan investigasi sengketa data

### 2. Approval Hierarchy yang Relevan untuk Payroll

Yang sebaiknya lengkap:
- approver untuk perubahan status
- approver untuk perubahan kontrak
- approver untuk perubahan organisasi/jabatan yang berdampak ke payroll

Nilai tambah:
- mengurangi perubahan data sensitif tanpa jejak persetujuan

### 3. E2E Operasional untuk Alur Penting

Yang sebaiknya diuji:
- onboarding pegawai
- perubahan status kepegawaian
- kontrak baru / perpanjangan / berakhir
- approval lembur / cuti / izin yang berdampak ke payroll
- offboarding

Nilai tambah:
- readiness tidak hanya bersifat dokumenter

## Daftar Menyusul (`later`)

Yang bisa dilakukan setelah baseline payroll aman:
- analitik HR yang lebih dalam
- dashboard payroll-HR gabungan
- automasi rekomendasi payroll berbasis absensi
- pelaporan lanjutan per unit/grade/biaya tenaga kerja

## Urutan Implementasi Paling Masuk Akal

1. `employees`
   karena semua fondasi payroll jatuh ke master pegawai
2. `status kepegawaian`
   karena payroll sangat sensitif terhadap tanggal efektif
3. `contracts`
   karena kontrak menentukan status aktif dan dasar kompensasi
4. `position-grade`
   karena mapping grade/golongan harus stabil sebelum komponen payroll dibangun
5. `policy kerja`
   agar lembur, keterlambatan, dan cuti punya dasar rule
6. `reports` dan `audit trail`
   agar hasil payroll nanti bisa diaudit
7. `onboarding` dan `offboarding`
   agar lifecycle masuk/keluar tidak merusak perhitungan

## Gate Siap Payroll

HR baru boleh dinilai `ready` jika semua kondisi ini terpenuhi:

1. `employees` sudah mode kelola operasional, bukan sekadar monitoring
2. status kepegawaian punya tanggal efektif dan histori yang bisa ditelusuri
3. kontrak aktif bisa dipercaya pada tanggal tertentu
4. jabatan, grade, dan golongan sudah cukup stabil untuk mapping payroll
5. policy kerja payroll-impact aktif dan tidak ambigu
6. laporan dasar dan export audit tersedia
7. audit trail perubahan penting bisa ditelusuri
8. onboarding dan offboarding tidak lagi menyisakan ambiguitas payroll

## Kalimat Status yang Benar Saat Ini

Kalimat yang paling akurat hari ini:

`HR sudah naik ke partial kuat: fondasi operasional, laporan audit dasar, dan jejak payroll-impact sudah jauh lebih matang, tetapi payroll penuh belum aman karena operasi master, validasi kontrak, dan verifikasi write end-to-end masih belum cukup ketat.`
