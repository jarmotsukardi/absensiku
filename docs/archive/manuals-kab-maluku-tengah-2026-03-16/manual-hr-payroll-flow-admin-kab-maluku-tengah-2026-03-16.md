# Manual Alur HR ke Payroll (Admin)

Tanggal: 16 Maret 2026

## Tujuan
- Menjelaskan alur uji coba HR ke Payroll menggunakan 1 pegawai dari Kab. Maluku Tengah.
- Menunjukkan komponen layar, penjelasan gambar, dan detail langkah operasional.

## Prasyarat
- Login sebagai admin organisasi Kab. Maluku Tengah.
- Akses menu HR dan Payroll aktif di sidebar.
- Data pegawai tersedia untuk diuji.

## Alur Uji Coba HR ke Payroll

### 1. HR > Data Pegawai

![HR Data Pegawai](../public/manuals/screenshots/flow/01-hr-data-pegawai.png)

Komponen layar:
- Pencarian pegawai.
- Daftar pegawai dan ringkasan data.

Penjelasan gambar:
- Menampilkan daftar pegawai dan hasil pencarian 1 pegawai uji.

Detail langkah:
- Buka menu **HR > Data Pegawai**.
- Gunakan kolom pencarian untuk memilih 1 pegawai uji.
- Pastikan data pegawai tampil lengkap sebelum masuk ke payroll.

### 2. HR > Kontrak Kerja

![HR Kontrak Kerja](../public/manuals/screenshots/flow/02-hr-kontrak-kerja.png)

Komponen layar:
- Daftar kontrak kerja.
- Status kontrak aktif.

Penjelasan gambar:
- Memastikan kontrak kerja pegawai tersedia untuk proses payroll.

Detail langkah:
- Buka menu **HR > Kontrak Kerja**.
- Periksa status kontrak pegawai yang akan diuji.
- Pastikan kontrak aktif agar payroll bisa dijalankan.

### 3. Payroll > Periode Payroll

![Payroll Periode](../public/manuals/screenshots/flow/03-payroll-periode.png)

Komponen layar:
- Daftar periode payroll.
- Status periode aktif.

Penjelasan gambar:
- Menentukan periode payroll yang akan digunakan untuk uji coba.

Detail langkah:
- Buka menu **Payroll > Periode Payroll**.
- Pastikan ada periode aktif untuk penggajian.
- Catat periode aktif sebagai acuan proses berikutnya.

### 4. Payroll > Input Variabel

![Payroll Input Variabel](../public/manuals/screenshots/flow/04-payroll-input-variabel.png)

Komponen layar:
- Tombol tambah input variabel.
- Form input variabel komponen gaji.

Penjelasan gambar:
- Menambahkan komponen variabel gaji untuk 1 pegawai uji.

Detail langkah:
- Buka menu **Payroll > Input Variabel**.
- Tambahkan komponen variabel untuk pegawai uji.
- Isi kode komponen, nama komponen, nominal, dan catatan.
- Simpan input variabel sebagai data uji payroll.

### 5. Payroll > Validasi Payroll

![Payroll Validasi](../public/manuals/screenshots/flow/05-payroll-validasi.png)

Komponen layar:
- Tombol tambah validasi.
- Ringkasan temuan validasi.

Penjelasan gambar:
- Membuat catatan validasi sebelum proses payroll dijalankan.

Detail langkah:
- Buka menu **Payroll > Validasi Payroll**.
- Tambahkan validasi untuk periode uji.
- Isi tingkat perhatian dan ringkasan temuan.
- Simpan validasi untuk memastikan kesiapan data.

### 6. Payroll > Proses Payroll

![Payroll Proses](../public/manuals/screenshots/flow/06-payroll-proses.png)

Komponen layar:
- Tombol buat proses payroll.
- Form proses payroll.

Penjelasan gambar:
- Menjalankan proses payroll untuk periode uji.

Detail langkah:
- Buka menu **Payroll > Proses Payroll**.
- Pilih periode payroll yang aktif.
- Tambahkan catatan proses dan simpan.
- Tunggu proses selesai sebelum ke tahap persetujuan.

### 7. Payroll > Persetujuan Payroll

![Payroll Persetujuan](../public/manuals/screenshots/flow/07-payroll-persetujuan.png)

Komponen layar:
- Tombol sinkronisasi dari proses.
- Daftar persetujuan payroll.

Penjelasan gambar:
- Mengecek hasil proses payroll dan menyiapkan persetujuan.

Detail langkah:
- Buka menu **Payroll > Persetujuan Payroll**.
- Sinkronkan dari proses payroll jika tersedia.
- Pastikan data persetujuan muncul untuk pegawai uji.

### 8. Payroll > Slip Gaji

![Payroll Slip Gaji](../public/manuals/screenshots/flow/08-payroll-slip-gaji.png)

Komponen layar:
- Daftar slip gaji.
- Ringkasan komponen gaji.

Penjelasan gambar:
- Meninjau slip gaji pegawai uji setelah proses payroll.

Detail langkah:
- Buka menu **Payroll > Slip Gaji**.
- Cari slip gaji pegawai uji.
- Periksa komponen gaji dan nominalnya.

### 9. Payroll > Pembayaran Payroll

![Payroll Pembayaran](../public/manuals/screenshots/flow/09-payroll-pembayaran.png)

Komponen layar:
- Ringkasan pembayaran.
- Status pembayaran payroll.

Penjelasan gambar:
- Meninjau status pembayaran payroll untuk pegawai uji.

Detail langkah:
- Buka menu **Payroll > Pembayaran Payroll**.
- Pastikan data pembayaran muncul untuk periode uji.
- Verifikasi status pembayaran sesuai kebutuhan.

## Glosarium
- **Input Variabel**: Komponen gaji yang tidak tetap, seperti lembur atau bonus.
- **Periode Payroll**: Rentang waktu penggajian yang sedang berjalan.
- **Validasi Payroll**: Pemeriksaan kelengkapan data sebelum proses payroll.
- **Proses Payroll**: Eksekusi perhitungan payroll untuk periode tertentu.
- **Persetujuan Payroll**: Tahap persetujuan hasil proses payroll.
- **Slip Gaji**: Dokumen rincian gaji pegawai.
- **Pembayaran Payroll**: Tahap pembayaran gaji kepada pegawai.
