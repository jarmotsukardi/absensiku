# Kriteria Trial: Serius vs Coba-coba

Dokumen ini menjadi acuan operasional untuk membedakan tenant trial yang:

- benar-benar sedang menuju berlangganan
- masih eksplorasi ringan
- pasif atau hanya mencoba-coba

Tanggal acuan keputusan: `2026-03-23`

## Tujuan

- Membantu tim internal membaca kualitas trial dari perilaku tenant, bukan asumsi.
- Menentukan kapan tenant layak:
  - didampingi lebih serius
  - ditawari invoice atau aktivasi awal
  - diberi perpanjangan trial
  - ditandai pasif atau tidak lanjut
- Menyatukan bahasa antara tim sales, onboarding, support, dan super admin.

## Prinsip

- `Streak monitoring` membaca kestabilan trial, tetapi tidak cukup untuk membaca keseriusan komersial.
- Tenant dianggap serius jika menunjukkan kombinasi:
  - aktivitas nyata
  - progres setup
  - sinyal komersial
- Tenant tidak boleh diklasifikasikan hanya dari satu sinyal, misalnya login banyak tetapi tanpa setup.
- Penilaian harus bisa dijelaskan ulang ke tim secara sederhana.

## Glosarium

- `Trial`
  Masa penggunaan awal sebelum tenant masuk ke langganan aktif penuh.
- `Aktivitas Nyata`
  Penggunaan yang menunjukkan tenant benar-benar mencoba workflow operasional, bukan sekadar membuka halaman.
- `Progres Setup`
  Tingkat kesiapan data dan konfigurasi dasar tenant.
- `Sinyal Komersial`
  Tindakan yang menunjukkan tenant mulai siap membahas pembayaran, paket, atau go-live.
- `Aktivasi Awal`
  Jalur ketika tenant memilih membayar lebih awal sebelum invoice pertama dari streak diterbitkan.
- `Tenant Pasif`
  Tenant trial yang minim aktivitas atau tidak menunjukkan progres berarti.
- `Tenant Serius`
  Tenant trial yang menunjukkan perilaku operasional dan komersial yang konsisten.

## Tiga Pilar Penilaian

### 1. Aktivitas Nyata

Tenant dinilai lebih serius jika:

- admin organisasi login lebih dari sekali dalam periode trial
- ada aktivitas pada beberapa hari berbeda, bukan hanya hari pertama
- lebih dari satu pengguna ikut terlibat
- tenant mencoba alur kerja nyata seperti:
  - tambah/import pegawai
  - setup lokasi kerja
  - setup jam kerja
  - membuat pengajuan
  - melihat laporan
  - membuat invoice atau membuka billing

Sinyal lemah:

- hanya login sekali
- hanya buka dashboard
- hanya melihat harga
- tidak ada jejak aksi setelah akses diberi

### 2. Progres Setup

Tenant dinilai lebih serius jika fondasi operasional mulai dibangun:

- data pegawai mulai diisi
- struktur organisasi atau unit kerja mulai ditata
- lokasi kerja aktif tersedia
- jam kerja atau aturan absensi mulai diisi
- admin organisasi memahami siapa PIC internal mereka

Sinyal lemah:

- data kosong
- pegawai masih nol
- setup dasar tidak disentuh
- semua isi masih dummy

### 3. Sinyal Komersial

Tenant dinilai lebih serius jika mulai menunjukkan kesiapan berlangganan:

- bertanya tentang paket, invoice, atau metode pembayaran
- meminta demo lanjutan
- menyebut target go-live
- menunjuk PIC pengambil keputusan
- meminta aktivasi awal
- bersedia masuk ke proses komersial atau onboarding berbayar

Sinyal lemah:

- hanya minta trial tambahan tanpa progres
- tidak ada PIC jelas
- tidak ada respons saat di-follow-up
- tidak pernah masuk ke pembahasan pembayaran

## Skoring yang Direkomendasikan

Gunakan skor sederhana agar keputusan konsisten.

### A. Skor Aktivitas

- login admin organisasi pada hari berbeda minimal 2 hari: `+10`
- login admin organisasi pada hari berbeda minimal 4 hari: `+5`
- ada lebih dari 1 user aktif: `+10`
- ada aktivitas penting minimal 3 jenis: `+15`
- ada penggunaan laporan, pengajuan, atau absensi nyata: `+10`

Maksimum pilar ini: `50`

### B. Skor Setup

- pegawai mulai diisi atau diimport: `+10`
- lokasi kerja aktif tersedia: `+10`
- jam kerja atau aturan dasar diisi: `+10`
- struktur kerja/unit/role admin mulai rapi: `+10`

Maksimum pilar ini: `40`

### C. Skor Komersial

- ada PIC jelas: `+10`
- ada target go-live: `+10`
- tenant bertanya invoice/paket/aktivasi: `+10`
- tenant meminta aktivasi awal atau invoice: `+20`

Maksimum pilar ini: `50`

### Total Skor

- `0 - 29` = `Coba-coba`
- `30 - 59` = `Evaluasi Awal`
- `60 - 84` = `Serius`
- `85+` = `Siap Ditagih / Siap Aktivasi Awal`

## Status Operasional yang Disarankan

### 1. Uji Coba Awal

Kondisi:

- tenant baru masuk
- aktivitas masih sedikit
- setup belum bergerak banyak

Tindak lanjut:

- beri panduan setup dasar
- jangan buru-buru tawarkan invoice
- fokuskan onboarding ke 3 hal:
  - pegawai
  - lokasi
  - jam kerja

### 2. Evaluasi Aktif

Kondisi:

- tenant sudah mulai mencoba
- ada progres setup
- ada sinyal ketertarikan, tetapi belum konsisten

Tindak lanjut:

- follow-up terjadwal
- bantu tenant menyelesaikan setup inti
- arahkan ke pencapaian `trial siap dinilai`

### 3. Serius

Kondisi:

- aktivitas nyata konsisten
- setup inti berjalan
- tenant responsif
- mulai membahas langkah komersial

Tindak lanjut:

- beri pendampingan lebih aktif
- siapkan penawaran paket
- tentukan apakah tenant menunggu jalur normal streak atau masuk aktivasi awal

### 4. Siap Ditagih / Siap Aktivasi Awal

Kondisi:

- tenant sudah siap operasional
- ada niat komersial jelas
- sudah minta invoice, paket, atau jadwal go-live

Tindak lanjut:

- jika jalur normal: tunggu invoice dari `streak monitoring`
- jika tenant ingin segera aktif: arahkan ke `aktivasi awal`

### 5. Pasif

Kondisi:

- login minim
- setup tidak bergerak
- follow-up tidak direspons

Tindak lanjut:

- kirim reminder singkat
- batasi follow-up manual berulang
- jangan anggap tenant ini pipeline aktif

### 6. Tidak Lanjut

Kondisi:

- tenant menyatakan tidak lanjut
- trial habis tanpa progres
- tidak ada respons berulang dalam periode yang disepakati

Tindak lanjut:

- tutup status pipeline
- simpan alasan
- jangan spam follow-up

## Aturan Praktis Per Sinyal

### Sinyal yang Sangat Kuat

Jika salah satu ini muncul, tenant layak naik prioritas:

- meminta invoice
- meminta aktivasi awal
- menentukan tanggal go-live
- sudah menyiapkan data nyata
- melibatkan pengambil keputusan

### Sinyal yang Tidak Cukup

Jangan langsung anggap serius jika hanya:

- sering login tetapi data kosong
- sering buka halaman harga
- sering bertanya, tetapi tidak mau setup
- minta trial panjang tanpa progres

## Kapan Trial Layak Diperpanjang

Trial boleh dipertimbangkan diperpanjang jika:

- tenant aktif mencoba
- progres setup nyata ada
- ada PIC dan follow-up berjalan
- tenant belum siap bayar karena alasan operasional, bukan karena tidak tertarik

Trial tidak perlu diperpanjang jika:

- tenant pasif
- tidak ada progres setup
- tidak ada respons follow-up
- tidak ada tanda bahwa sistem dipakai sungguhan

## Kapan Tenant Layak Ditawari Invoice

Tenant layak ditawari invoice jika:

- skor minimal masuk kategori `Serius`
- setup inti sudah cukup
- tenant mulai menanyakan paket, harga, atau aktivasi
- ada kejelasan siapa yang akan menyetujui pembelian

Kalau tenant belum sampai titik itu, lebih baik fokus ke onboarding trial dulu.

## Kapan Tenant Layak Masuk Aktivasi Awal

Tenant layak masuk `aktivasi awal` jika:

- tidak ingin menunggu invoice otomatis dari streak
- sudah siap operasional lebih cepat
- sudah jelas paket yang dipilih
- pengambil keputusan sudah setuju

Untuk bundle:

- `Absensi`
  boleh aktivasi awal
- `Absensi + HR`
  boleh aktivasi awal
- `Absensi + HR + Payroll`
  boleh aktivasi awal, tetapi Payroll tetap bisa `menunggu setup`

## Red Flag Trial Coba-coba

Indikator bahwa tenant lebih cenderung coba-coba:

- hanya meminta akses tanpa progres
- semua data uji sangat minim atau tidak realistis
- tidak ada satu pun proses yang diselesaikan
- tidak ada PIC aktif
- meminta banyak penjelasan tetapi tidak pernah bergerak
- menghilang setelah diberi trial

## Format Ringkas untuk Tim Internal

Gunakan format ini saat review tenant:

- `Status Trial`
  `Uji Coba Awal / Evaluasi Aktif / Serius / Siap Ditagih / Pasif / Tidak Lanjut`
- `Skor Aktivitas`
  `0-50`
- `Skor Setup`
  `0-40`
- `Skor Komersial`
  `0-50`
- `Skor Total`
  `0-140`
- `Rekomendasi`
  `lanjut trial / dampingi setup / tawarkan invoice / aktivasi awal / tutup trial`

## Rule Sistem Jika Diturunkan ke Aplikasi

Jika nanti ini ingin diimplementasikan ke sistem, field minimal yang disarankan:

- `trial_stage`
  - `uji_coba_awal`
  - `evaluasi_aktif`
  - `serius`
  - `siap_ditagih`
  - `pasif`
  - `tidak_lanjut`
- `trial_score_activity`
- `trial_score_setup`
- `trial_score_commercial`
- `trial_score_total`
- `trial_last_reviewed_at`
- `trial_last_reviewed_by`
- `trial_follow_up_note`

Sumber sinyal bisa diambil dari:

- login harian admin organisasi
- jumlah user aktif
- jumlah pegawai terisi
- lokasi kerja aktif
- jam kerja aktif
- pengajuan atau laporan yang dipakai
- pembukaan halaman billing
- pembuatan invoice

## Ringkasan Keputusan

- Tenant serious tidak boleh dibedakan hanya dari `streak`.
- Penilaian terbaik adalah gabungan:
  - aktivitas nyata
  - progres setup
  - sinyal komersial
- Jalur trial tetap normal, tetapi tenant yang serius dapat diarahkan ke `aktivasi awal`.
- Bundle `Absensi + HR + Payroll` boleh dibayar lebih awal, tetapi Payroll tetap bisa `menunggu setup`.
