# TODO Payroll Org Workspace

## Tujuan
- Membangun payroll sederhana yang cepat dipakai.
- Menjadikan payroll sebagai alur kerja, bukan kumpulan menu.
- Memakai data HR dan absensi sebagai referensi, bukan duplikasi master.

## Prinsip Kerja
- Semua label dan penjelasan memakai Bahasa Indonesia.
- Tidak ada unggah dokumen pada tahap awal.
- Tidak ada glosarium dan penjelasan panjang pada tahap awal.
- Playwright ditunda sampai progres mendekati 95%.
- Log Error Payroll (Admin) mulai diprioritaskan saat progres mendekati 75%.
- Log Audit Payroll mulai diprioritaskan setelah 75%.

## Struktur Sidebar Final
### Inti
- Beranda Payroll
- Kebijakan Payroll
- Periode Payroll
- Input Variabel
- Validasi Payroll
- Proses Payroll
- Persetujuan Payroll
- Laporan Payroll

### Referensi
- Data Pegawai Payroll
- Struktur Organisasi dan Grade

### Lanjutan
- Komponen Penghasilan
- Komponen Potongan
- Slip Gaji
- Pembayaran Payroll
- Pajak dan Kepatuhan
- Log Audit Payroll
- Log Error Payroll (Admin)
- Integrasi Payroll

### Pengaturan
- Hak Akses Payroll
- Bantuan Payroll

## Batch Pekerjaan

### Batch A: Kerangka UI
- Rapikan sidebar payroll sesuai struktur final.
- Rapikan beranda payroll.
- Ubah semua label ke Bahasa Indonesia.
- Pasang badge status menu.
- Pastikan sidebar tetap ramping.
- Pastikan Pengaturan Payroll tidak tampil sebagai menu utama.

#### Ruang Lingkup Batch A
- Selaraskan struktur grup sidebar menjadi `Inti`, `Referensi`, `Lanjutan`, dan `Pengaturan`.
- Pastikan menu inti payroll tampil lebih menonjol daripada menu sekunder.
- Rapikan halaman `/org/payroll` agar menjadi titik masuk yang menjelaskan alur kerja payroll.
- Ganti istilah Inggris user-facing menjadi istilah Indonesia yang sudah disepakati.
- Pastikan badge status dipakai konsisten untuk memberi ekspektasi kematangan fitur.

#### File yang Kemungkinan Disentuh
- `src/components/admin/organization/OrganizationSidebar.tsx`
- `src/pages/org/payroll/OrgPayrollHome.tsx`
- `src/App.tsx`
- komponen bantu payroll yang terkait label, badge, atau grouping menu

#### Hasil yang Diharapkan
- Sidebar payroll terlihat rapi dan mudah dipahami.
- User langsung melihat alur inti payroll tanpa terdistraksi fitur lanjutan.
- Semua label payroll utama sudah berbahasa Indonesia.
- Menu lanjutan tetap terlihat, tetapi tidak mendominasi pengalaman awal.

#### Yang Belum Masuk Batch A
- logika proses payroll
- validasi payroll mendalam
- overlay referensi HR dan absensi
- log error payroll (admin)
- log audit payroll
- glosarium payroll
- Playwright

### Batch B: Fondasi Payroll
- Rapikan Kebijakan Payroll.
- Rapikan Periode Payroll.
- Pastikan alur awal payroll mudah dipahami.

### Batch C: Input dan Pemeriksaan
- Rapikan Input Variabel.
- Rapikan Validasi Payroll.
- Pastikan validasi menonjolkan kekurangan data dari HR dan absensi.

### Batch D: Proses Inti
- Rapikan Proses Payroll.
- Rapikan Persetujuan Payroll.
- Rapikan Laporan Payroll.
- Pastikan user bisa mengikuti alur dari proses sampai hasil ringkas.

### Batch E: Referensi Data
- Siapkan referensi data pegawai dari HR.
- Siapkan referensi struktur organisasi dan grade dari HR.
- Siapkan referensi data absensi yang berdampak ke payroll.
- Gunakan overlay, drawer, dialog besar, atau context page.

### Batch F: Observability
- Aktifkan Log Error Payroll (Admin) saat progres mendekati 75%.
- Aktifkan Log Audit Payroll setelah atau bersamaan dengan Log Error Payroll (Admin).

### Batch G: Finalisasi
- Tambahkan penjelasan halaman.
- Tambahkan glosarium payroll.
- Jalankan Playwright untuk smoke akhir.

## Backlog yang Ditunda
- Slip Gaji
- Pembayaran Payroll
- Pajak dan Kepatuhan
- Integrasi Payroll
- Komponen Penghasilan
- Komponen Potongan

## Risiko
- Tenant lama bisa tetap tidak melihat payroll jika setting tersimpan masih nonaktif.
- Payroll bisa melebar jika referensi HR atau absensi berubah menjadi duplikasi master.
- Observability bisa terlambat jika ref atau ID trace (`trace_id`) di halaman inti tidak dijaga.
- Sidebar bisa kembali melebar jika menu sekunder diperlakukan seperti menu utama.

## Definition of Done Minimum
- Workspace payroll aktif untuk tenant target.
- Sidebar payroll mengikuti struktur final.
- Menu inti payroll dapat dipakai dengan label Bahasa Indonesia.
- Alur inti payroll berjalan dari kebijakan sampai laporan.
- Referensi HR dan absensi tampil tanpa duplikasi data.
- Tidak ada unggah dokumen pada fase awal.
