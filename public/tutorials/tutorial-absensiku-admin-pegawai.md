# Tutorial AbsensiKu: Admin Organisasi dan Pegawai

Dokumen ini memandu alur utama penggunaan AbsensiKu dari registrasi admin organisasi, setup absensi, operasional harian admin, hingga penggunaan oleh pegawai.

Catatan: Absensi tetap menjadi fondasi utama produk. Modul HR dan Payroll berada di dalam aplikasi sebagai jalur lanjutan setelah organisasi stabil pada operasional absensi inti. Tutorial ini tetap fokus pada fondasi absensi agar onboarding awal lebih cepat dan jelas.

## Prasyarat

1. URL aplikasi aktif, contoh: `http://127.0.0.1:5173`.
2. Admin organisasi memiliki email aktif.
3. Data master minimum sudah disiapkan (OPD/unit/lokasi kerja jika dibutuhkan organisasi).
4. Pegawai menerima akun (via undangan/admin) untuk login.

## A. Tutorial Admin Organisasi

### 1) Buka Login Admin Organisasi

- Akses halaman: `/org/login`.
- Tab `Masuk` untuk admin yang sudah punya akun.

![01 Login Admin Organisasi](../public/tutorials/screenshots/01-org-login.png)

### 2) Daftar Organisasi (Admin Baru)

- Di halaman yang sama, pilih tab `Daftar Organisasi`.
- Isi form registrasi organisasi sesuai data instansi.
- Setelah submit berhasil, lanjut login sebagai admin organisasi.

![02 Daftar Organisasi](../public/tutorials/screenshots/02-org-register.png)

### 3) Masuk ke Dashboard Organisasi

- Login menggunakan email dan password admin organisasi.
- Sistem akan mengarahkan ke dashboard utama organisasi.

![03 Dashboard Organisasi](../public/tutorials/screenshots/03-org-dashboard.png)

### 4) Setup Awal Absensi (Onboarding)

- Buka menu setup: `/org/onboarding`.
- Lengkapi konfigurasi dasar tenant, preferensi modul, dan pengaturan awal operasional.
- Simpan setiap perubahan sebelum pindah menu.

![04 Onboarding Organisasi](../public/tutorials/screenshots/04-org-onboarding.png)

### 5) Atur Jam Kerja Absensi

- Buka menu: `/org/schedule/work-hours`.
- Tentukan jam masuk, jam pulang, toleransi keterlambatan, dan aturan shift (jika digunakan).
- Pengaturan ini menjadi acuan status hadir/terlambat/pulang.

![05 Pengaturan Jam Kerja](../public/tutorials/screenshots/05-org-work-hours.png)

### 6) Kelola Data Pegawai Aktif

- Buka menu: `/org/employees/active`.
- Tambah/edit/nonaktifkan pegawai sesuai kebutuhan.
- Pastikan data profil minimal (nama, NIP, unit, lokasi kerja) valid.

![06 Pegawai Aktif](../public/tutorials/screenshots/06-org-employees-active.png)

### 7) Kirim Undangan Pegawai

- Buka menu: `/org/invitations`.
- Buat undangan untuk pegawai agar akun dapat diaktivasi dan dipakai login.
- Pantau status undangan (pending/verified/used/expired).

![07 Undangan Pegawai](../public/tutorials/screenshots/07-org-invitations.png)

### 8) Kelola Permohonan Kehadiran

- Buka menu: `/org/leave/requests`.
- Tinjau pengajuan (izin/cuti/WFH/lembur/absensi khusus/izin terlambat/pulang cepat).
- Setujui atau tolak dengan catatan yang jelas untuk audit.

![08 Permohonan Kehadiran](../public/tutorials/screenshots/08-org-leave-requests.png)

### 9) Lihat Laporan Absensi

- Buka menu: `/org/reports/attendance`.
- Gunakan filter tanggal/unit/status.
- Ekspor data untuk kebutuhan evaluasi dan rekap periodik.

![09 Laporan Absensi](../public/tutorials/screenshots/09-org-report-attendance.png)

### 10) Gunakan Menu FAQ dan Bantuan

- FAQ: `/org/help/faq`.
- Baca penjelasan operasional dan solusi kendala umum.

![10 FAQ Organisasi](../public/tutorials/screenshots/10-org-help-faq.png)

### 11) Buat Tiket Bantuan

- Buka menu: `/org/help/tickets`.
- Isi subjek, kategori, prioritas, dan detail masalah.
- Pantau progres tiket sampai resolved.

![11 Tiket Bantuan Organisasi](../public/tutorials/screenshots/11-org-help-ticket.png)

## B. Tutorial Pegawai

### 1) Login Pegawai

- Buka: `/employee/login`.
- Masukkan email dan password yang sudah aktif.

![12 Login Pegawai Mobile](../public/tutorials/screenshots/12-employee-login-mobile.png)

### 2) Registrasi Pegawai (Jika Belum Punya Akses)

- Pada tab `Daftar`, gunakan mode:
- `Email` untuk registrasi mandiri sesuai kebijakan.
- `Undangan` jika menerima kode undangan dari admin.

![13 Registrasi Pegawai Mobile](../public/tutorials/screenshots/13-employee-register-mobile.png)

### 3) Dashboard Pegawai

- Setelah login, pegawai masuk ke dashboard utama.
- Lakukan absensi sesuai SOP instansi (GPS/lokasi/perangkat).

![14 Dashboard Pegawai Mobile](../public/tutorials/screenshots/14-employee-dashboard-mobile.png)

### 4) Ajukan Permohonan

- Buka tab/menu pengajuan: `/employee/dashboard?tab=requests`.
- Isi permohonan (izin/cuti/izin terlambat/pulang cepat dan lainnya) sesuai kebutuhan.
- Pantau status pengajuan dari halaman yang sama.

![15 Pengajuan Pegawai Mobile](../public/tutorials/screenshots/15-employee-requests-mobile.png)

### 5) Lihat Riwayat Absensi

- Buka: `/employee/dashboard?tab=history`.
- Cek status harian, jam masuk/pulang, serta hasil koreksi jika ada.

![16 Riwayat Pegawai Mobile](../public/tutorials/screenshots/16-employee-history-mobile.png)

### 6) Buka Bantuan Pegawai

- Buka: `/employee/dashboard?tab=help` atau menu bantuan terkait.
- Pelajari FAQ penggunaan aplikasi dan troubleshooting umum.

![17 Bantuan Pegawai Mobile](../public/tutorials/screenshots/17-employee-help-mobile.png)

### 7) Kelola Profil Pegawai

- Buka: `/employee/profile`.
- Perbarui data profil yang diizinkan, serta cek informasi akun.

![18 Profil Pegawai Mobile](../public/tutorials/screenshots/18-employee-profile-mobile.png)

## C. Checklist Go-Live Operasional

1. Admin sudah set jam kerja dan aturan absensi.
2. Lokasi kerja/radius sudah diverifikasi.
3. Data pegawai aktif sudah bersih (tanpa duplikasi akun).
4. Undangan pegawai sudah terkirim dan status aktif.
5. Alur persetujuan permohonan sudah ditetapkan.
6. Kanal bantuan (FAQ + tiket) sudah diinformasikan ke user.

## D. Lokasi File Tutorial

- DOCX editable: `/tutorials/tutorial-absensiku-admin-pegawai.docx`
- Versi web/HTML: `/tutorials/tutorial-absensiku-admin-pegawai.html`
- Folder screenshot: `/tutorials/screenshots/`
