# Kebijakan Trial, Aktivasi Awal, dan Billing Organisasi

Dokumen ini menjadi acuan operasional untuk menjelaskan hubungan antara trial, `streak monitoring`, pembayaran awal, dan aktivasi paket:

- `Absensi`
- `Absensi + HR`
- `Absensi + HR + Payroll`

Tanggal acuan keputusan: `2026-03-23`

## Tujuan

- Menjaga fungsi `streak monitoring` tetap jelas sebagai jalur normal pendeteksian trial.
- Memberi ruang untuk pelanggan yang sudah siap membayar di awal tanpa menunggu streak mencapai ambang tagih.
- Memastikan aktivasi modul tidak membingungkan antara billing paket dan kesiapan operasional, terutama untuk Payroll.

## Prinsip

- Trial tetap menjadi jalur normal bagi tenant baru.
- `Streak monitoring` tetap menjadi alat utama untuk menilai trial yang siap masuk penagihan.
- Pembayaran sebelum streak mencapai ambang tagih diperbolehkan, tetapi dianggap sebagai `aktivasi awal`.
- Aktivasi awal adalah jalur khusus, bukan jalur default.
- Setelah pembayaran awal tervalidasi, `streak monitoring` dipakai lagi untuk renewal atau perpanjangan berikutnya.
- Pembayaran paket tidak selalu berarti semua modul langsung bisa diedit penuh.

## Glosarium

- `Trial`
  Masa penggunaan awal sebelum tenant masuk ke pola langganan penuh.
- `Streak Monitoring`
  Mekanisme pemantauan kestabilan penggunaan tenant selama trial untuk menentukan kapan tenant siap ditagih.
- `Aktivasi Awal`
  Pembayaran yang dilakukan sebelum `streak monitoring` menyatakan tenant siap ditagih.
- `Langganan Aktif`
  Status layanan yang sudah berjalan penuh setelah pembayaran tervalidasi.
- `Renewal`
  Tagihan perpanjangan setelah periode langganan sebelumnya berakhir atau mendekati berakhir.
- `Fondasi Absensi`
  Kesiapan dasar operasional absensi yang menjadi landasan pembukaan akses HR dan Payroll.
- `Payroll Menunggu Setup`
  Status ketika paket bundle sudah dibayar, tetapi operasional Payroll belum dibuka penuh karena setup belum selesai.

## Jalur Normal

Jalur normal tenant baru:

1. tenant mulai dalam masa `trial`
2. tenant menggunakan sistem dan aktivitasnya dipantau oleh `streak monitoring`
3. saat ambang siap tagih tercapai, tenant masuk status `ready_for_invoicing`
4. invoice pertama terbit
5. tenant membayar
6. langganan menjadi aktif

Makna jalur normal:

- tenant tidak perlu memutuskan pembayaran di hari pertama
- sistem membaca bukti kesiapan dari penggunaan nyata
- invoice pertama tetap mengikuti aturan streak

## Jalur Aktivasi Awal

Jalur ini dipakai saat pelanggan sudah siap berlangganan sebelum `streak monitoring` menyatakan siap tagih.

Alurnya:

1. tenant memilih paket
2. sistem membuat invoice aktivasi awal
3. tenant membayar invoice
4. pembayaran diverifikasi
5. langganan menjadi aktif tanpa menunggu invoice pertama dari streak

Aturan penting:

- aktivasi awal harus tetap melalui invoice resmi
- tidak ada pembayaran di luar invoice
- aktivasi awal hanya mengubah jalur invoice pertama, bukan menghapus fungsi `streak monitoring`
- setelah langganan aktif, siklus berikutnya kembali mengikuti renewal normal

## Peran Streak Monitoring

Peran `streak monitoring` yang dikunci:

- mendeteksi trial yang sudah stabil dan siap ditagih
- memicu invoice otomatis pada jalur normal
- mengatur masa tenggang setelah invoice belum dibayar
- menjadi dasar reminder dan lifecycle penagihan berikutnya
- dipakai lagi pada renewal setelah tenant aktif

Kesimpulan ringkas:

- `streak monitoring` tetap dipakai untuk trial
- tetapi pembayaran awal tetap boleh melalui jalur aktivasi awal

## Aturan Paket

### Absensi

- boleh trial
- boleh aktivasi awal
- setelah pembayaran tervalidasi, modul Absensi dapat aktif penuh

### Absensi + HR

- boleh trial
- boleh aktivasi awal
- setelah pembayaran tervalidasi, modul HR dibuka bertahap sesuai kebijakan akses HR yang berlaku

### Absensi + HR + Payroll

- boleh dibayar di awal
- billing paket boleh langsung aktif
- Payroll tidak harus langsung editable penuh
- Payroll dapat masuk status `Payroll Menunggu Setup` sampai checklist setup selesai

## Aturan Aktivasi Modul

Pembayaran paket dan pembukaan modul tidak selalu identik.

Aturan final:

- `Absensi`
  aktif penuh setelah pembayaran tervalidasi
- `HR`
  dapat dibuka bertahap sesuai readiness dan kebijakan akses tenant
- `Payroll`
  hanya dibuka penuh setelah setup dan kesiapan data dinyatakan cukup

Untuk paket `Absensi + HR + Payroll`, urutan aman yang direkomendasikan:

1. billing paket aktif
2. absensi aktif
3. HR aktif sesuai tahap
4. payroll tetap `menunggu setup`
5. payroll aktif penuh setelah setup selesai

## Aturan Pembayaran Sebelum Streak

Jika pelanggan ingin membayar sebelum streak siap tagih:

- sistem memperlakukan itu sebagai `aktivasi awal`
- invoice awal dibuat secara resmi dari jalur billing organisasi
- pembayaran diverifikasi seperti invoice biasa
- subscription langsung memakai snapshot harga dan cakupan modul dari invoice awal

Jika pelanggan hanya ingin menaruh dana lebih dulu:

- gunakan jalur `wallet/topup`
- dana itu dipakai saat invoice dibuat
- tetap tidak ada pembayaran tanpa invoice atau request resmi

## Aturan Renewal

Setelah invoice awal atau aktivasi awal lunas:

- `streak monitoring` tidak lagi dipakai untuk memutuskan invoice pertama
- `streak monitoring` dipakai lagi untuk renewal
- reminder, masa tenggang, dan kontrol lifecycle berikutnya tetap berjalan seperti biasa

## Matrix Keputusan

| Kondisi | Jalur | Invoice pertama | Peran streak |
|---|---|---|---|
| Tenant baru belum siap bayar | Trial normal | Menunggu threshold streak | Detektor trial + pemicu penagihan |
| Tenant baru siap bayar dari awal | Aktivasi awal | Dibuat lebih awal | Dipakai lagi untuk renewal |
| Tenant aktif mendekati akhir masa langganan | Renewal | Mengikuti lifecycle billing | Reminder + kontrol renewal |
| Tenant bundle dengan Payroll | Aktivasi awal atau trial | Sesuai jalur billing | Payroll tetap bisa menunggu setup |

## Rule Per Role

### Super Admin

- boleh menyetujui jalur aktivasi awal
- boleh menentukan bahwa tenant melewati trial normal ke jalur aktivasi awal
- boleh menahan pembukaan penuh Payroll sampai setup dinyatakan siap

### Admin Organisasi

- mengikuti jalur normal trial atau jalur aktivasi awal yang tersedia di sistem
- tidak menetapkan sendiri pengecualian di luar rule aplikasi
- tetap membayar melalui invoice resmi

## Copy UI yang Direkomendasikan

### Copy untuk jalur normal

- `Tenant Anda masih dalam masa trial. Invoice akan diterbitkan setelah penggunaan stabil sesuai kebijakan streak.`
- `Streak monitoring sedang memantau kesiapan tenant untuk masuk ke penagihan normal.`

### Copy untuk aktivasi awal

- `Organisasi Anda dapat langsung memulai langganan tanpa menunggu akhir trial.`
- `Pembayaran ini diproses sebagai aktivasi awal dan akan mengaktifkan langganan setelah verifikasi selesai.`

### Copy untuk bundle penuh

- `Paket Anda sudah aktif. Modul Payroll akan dibuka penuh setelah setup payroll dinyatakan siap.`
- `Status saat ini: Payroll Menunggu Setup.`

## FAQ Admin Organisasi

### Apakah kami harus menunggu streak monitoring sebelum membayar?

Tidak selalu. Jalur normal memang mengikuti trial dan `streak monitoring`, tetapi organisasi yang sudah siap dapat memakai jalur `aktivasi awal`.

### Jika kami bayar di awal, apakah streak monitoring tidak dipakai lagi?

Tetap dipakai. Perbedaannya hanya pada invoice pertama. Setelah langganan aktif, `streak monitoring` dipakai kembali untuk renewal dan reminder berikutnya.

### Apakah bundle `Absensi + HR + Payroll` bisa dibayar sekaligus dari awal?

Bisa. Namun pembukaan operasional Payroll tetap dapat menunggu setup dan validasi kesiapan data.

### Apakah pembayaran awal boleh dilakukan tanpa invoice?

Tidak. Semua pembayaran harus melalui invoice resmi atau request resmi seperti topup wallet.

### Apakah HR dan Payroll langsung bisa diedit penuh setelah bundle dibayar?

Tidak selalu. Absensi dapat aktif penuh lebih cepat, HR biasanya bertahap, dan Payroll bisa masuk status `menunggu setup` terlebih dahulu.

## Rule Sistem yang Perlu Diikuti Jika Diimplementasikan

- sistem harus mengenal dua jalur:
  - `trial`
  - `aktivasi_awal`
- invoice pertama harus menyimpan metadata jalur asal
- subscription harus menyimpan snapshot harga, cakupan modul, dan status aktivasi awal bila digunakan
- renewal setelah aktivasi awal tetap harus kembali ke rule lifecycle billing normal
- bundle `Absensi + HR + Payroll` harus dapat memisahkan:
  - status billing aktif
  - status kesiapan Payroll operasional

## Ringkasan Keputusan

- `trial + streak monitoring` tetap menjadi jalur normal
- `aktivasi awal` diperbolehkan untuk pelanggan yang siap bayar sebelum streak siap tagih
- `streak monitoring` tidak dibuang; fungsinya dipakai lagi setelah tenant aktif
- bundle penuh boleh dibayar di awal
- Payroll tetap boleh menunggu setup walau bundle sudah dibayar
