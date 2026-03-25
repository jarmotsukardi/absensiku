# TODO HR Focus

Tujuan file ini: membuat penyelesaian HR lebih terarah, lebih cepat, dan tidak melebar ke payroll sebelum fondasi HR benar-benar cukup matang.

Status ringkas saat ini:
- Fondasi `/org/hr` sudah kuat dan banyak route sudah hidup.
- HR belum selesai penuh karena capability belum seragam.
- Fokus utama bukan membuka halaman baru, tetapi menutup gap pada halaman yang sudah ada.

Status tunggal yang dipakai untuk membaca progres:
- `coverage route/workspace`: sekitar `85-90%`
- `readiness operasional nyata`: sekitar `70-80%`
- `readiness sebelum payroll`: `belum lulus gate`
- `blocker utama tersisa`: `3-4`

Aturan baca status:
- `coverage` bukan izin membuka payroll.
- Payroll hanya boleh dibuka jika `Definisi Selesai HR Sebelum Payroll` sudah lulus.
- Selama status masih `belum lulus gate`, semua pekerjaan payroll dianggap tertahan walaupun route payroll sudah ada.

Empat blocker utama:
- `Dokumen HR`
- `Laporan HR`
- `Lifecycle atomik`
- `ATS hardening`

Catatan progres terbaru:
- `Laporan HR` sudah naik dari monitoring ringan ke baseline operasional awal, tetapi belum analitik penuh.
- `Offboarding` sudah dipindah ke RPC atomik, sehingga blocker `Lifecycle atomik` turun level tetapi belum selesai penuh untuk seluruh lifecycle.
- `ATS hardening` sudah selesai pada level page guard dan tenant scoping untuk `Lowongan`, `Kandidat`, `Interview`, dan `Penawaran`, tetapi belum selesai pada level audit/backend path seragam.
- `Pengaturan HR` sudah lebih operasional dan bukan lagi sekadar shell, tetapi belum menjadi pusat konfigurasi backend penuh.

Prinsip eksekusi:
- Kerjakan blocker readiness lebih dulu.
- Jangan buka pekerjaan payroll baru.
- Jangan perluas governance terlalu lebar sebelum operasi inti HR stabil.
- Prioritaskan perbaikan yang menurunkan risiko data, akses, dan konsistensi tenant.

## Kerjakan Sekarang

Bagian ini adalah sumber kebenaran eksekusi harian. Jika sebuah item tidak masuk bagian ini, jangan didahulukan.

- Tutup blocker readiness yang masih membuat HR belum lulus gate.
- Dahulukan perbaikan `atomic/backend safety`, `access guard`, `tenant scoping`, dan capability operasional nyata.
- Kerjakan per batch kecil, idealnya `1-3 file` atau `1 flow` per batch.
- Gunakan validasi berbasis risiko:
  - perubahan kecil/menengah: `lint` file terkait
  - perubahan kritis DB/lifecycle/role: tambah validasi backend atau smoke seperlunya
- Tahan semua pekerjaan payroll sampai blocker HR prioritas 1 benar-benar turun.

## Gate HR -> Payroll

Payroll baru boleh dibuka jika semua syarat ini terpenuhi:
- [ ] Semua item `Definisi Selesai HR Sebelum Payroll` lulus.
- [ ] Tidak ada blocker besar tersisa pada `Dokumen HR`, `Laporan HR`, `Lifecycle`, dan `ATS`.
- [ ] Board `Prioritas 1` tinggal minor follow-up, bukan gap readiness inti.
- [ ] Audit akhir HR menunjukkan tidak ada write-path sensitif yang longgar pada akses, tenant scope, atau konsistensi data.
- [ ] Data tenant nyata sudah cukup bersih untuk dipakai sebagai sumber payroll dasar.

Jika salah satu poin di atas belum lulus:
- payroll tetap `on-hold`
- jangan buka batch payroll baru
- semua energi eksekusi kembali ke blocker HR

Trigger resmi membuka payroll:
1. Tutup `Prioritas 1`.
2. Jalankan audit akhir HR.
3. Tandai `Definisi Selesai HR Sebelum Payroll` sebagai lulus.
4. Baru pindahkan fokus ke readiness payroll.

## Prioritas 1: Wajib Dibereskan

### 1. Dokumen HR naik dari arsip kontrak menjadi repository dokumen pegawai
- [x] Definisikan sumber data dokumen pegawai yang jelas, bukan hanya `hr_contracts`.
- [x] Tambahkan model dokumen pegawai: kategori, owner pegawai, metadata, status aktif/arsip.
- [x] Putuskan model arsip fisik: gunakan `nomor dokumen` + `referensi arsip fisik`, bukan upload file aplikasi.
- [x] Tambahkan pencarian lintas nama pegawai, kategori, nomor referensi, dan status dokumen.
- [x] Tambahkan relasi dokumen ke pegawai dan tampilkan pemilik dokumen dengan konsisten.
- [x] Tambahkan audit akses/perubahan dokumen sensitif.
- [x] Tambahkan standar penomoran arsip fisik dan lokasi arsip yang konsisten antar tenant/unit.
- [ ] Tambahkan smoke test untuk metadata, pencarian, edit, dan arsip dokumen pegawai.

Kenapa ini prioritas:
- `Dokumen HR` masih halaman hidup yang dominan membaca kontrak, belum repository dokumen pegawai penuh.

### 2. Laporan HR naik dari monitoring ringan menjadi alat operasi
- [x] Pecah laporan menjadi domain yang benar-benar dipakai: headcount, kontrak, lifecycle, audit operasional.
- [x] Tambahkan filter yang lebih nyata: unit, OPD, status kerja, kategori pegawai, periode.
- [x] Tambahkan drill-down dari kartu statistik ke daftar data sumber.
- [x] Tambahkan pagination/limit yang benar untuk audit trail, bukan hanya 12 record terbaru.
- [x] Tambahkan export yang mengikuti filter aktif dan tidak hanya agregat tab.
- [x] Tambahkan validasi silang angka ringkasan terhadap sumber data.
- [ ] Tambahkan smoke test filter, export, dan drill-down.

Kenapa ini prioritas:
- `Laporan HR` sudah lebih operasional, tetapi belum cukup dalam untuk dianggap alat operasi penuh.

### 3. Lifecycle pegawai dibuat lebih aman dan konsisten
- [x] Pindahkan save path `Offboarding` ke jalur backend atomik atau RPC transaksi.
- [x] Pastikan offboarding tidak meninggalkan state pecah antara `mutation_requests`, `employees`, dan `audit_logs`.
- [x] Review ulang `Onboarding`, `Status Kepegawaian`, dan `Kontrak` untuk pola multi-step yang masih non-atomik.
- [ ] Tambahkan validasi efektif date, overlap, alasan perubahan, dan rollback/recovery yang jelas.
- [ ] Tambahkan smoke test lifecycle end-to-end pada tenant aktif.

Kenapa ini prioritas:
- `Offboarding` sudah turun dari blocker utama, tetapi lifecycle HR secara keseluruhan belum seragam ke pola atomik.

### 4. Hardening ATS tenant
- [x] Hardening `Kandidat` dengan guard akses eksplisit dan scoping `tenant_id` pada write path.
- [x] Hardening `Interview` dengan guard akses eksplisit dan scoping `tenant_id` pada write path.
- [x] Hardening `Penawaran Kerja` dengan guard akses eksplisit dan scoping `tenant_id` pada write path.
- [x] Review ulang `Lowongan Kerja` setelah hardening awal untuk memastikan pola akses seragam dengan halaman ATS lain.
- [x] Tambahkan audit minimal untuk perubahan ATS yang payroll/lifecycle-impact.
- [ ] Lengkapi E2E CRUD ATS untuk semua halaman inti, bukan hanya lowongan.

Kenapa ini prioritas:
- ATS inti sudah jauh lebih aman di level page, tetapi backend/audit path masih belum seragam.

## Prioritas 2: Penting, Setelah Blocker

### 5. Pengaturan HR dibuat benar-benar operasional
- [ ] Petakan konfigurasi yang benar-benar perlu ada di `Pengaturan HR`: policy ownership, role matrix, capability matrix, default behavior.
- [x] Hindari tab yang hanya menjadi shell/redirect tanpa aksi nyata.
- [x] Tambahkan konfigurasi yang berhubungan langsung dengan operasi tenant, bukan halaman placeholder.
- [ ] Tambahkan validasi akses untuk admin/operator di halaman setting sensitif.
- [ ] Tambahkan test smoke untuk perubahan konfigurasi yang benar-benar persist.

Kenapa ini prioritas:
- `Pengaturan HR` sudah lebih operasional, tetapi kedalaman konfigurasinya belum matang.

### 6. Policy pages yang masih rawan write-path
- [x] Review `Pola Shift` end-to-end setelah hardening awal.
- [x] Review `Late Settings` dan `Leave Quota` untuk pola guard akses dan tenant scoping yang belum seragam.
- [ ] Review `Jam Kerja` pada route `/org/work-hours` bila memang dibawa ke scope penutupan HR.
- [x] Review `Leave Types` dan `Approval Hierarchy` untuk pola guard akses dan tenant scoping yang belum seragam.
- [x] Review `Template Dokumen` untuk pola guard akses dan tenant scoping yang belum seragam.
- [ ] Standarkan pola write path: guard -> tenant scope -> audit bila perlu -> refresh aman.

### 7. Data tenant nyata dibersihkan
- [x] Review pegawai aktif yang masih kosong `kategori`.
- [x] Review relasi jabatan, unit kerja, lokasi, dan status kerja yang belum lengkap.
- [x] Tandai gap data prioritas tinggi yang menghambat lifecycle dan laporan.
- [x] Buat checklist cleanup data tenant aktif agar tidak tercampur dengan backlog fitur.
  Referensi: [docs/hr_tenant_cleanup_checklist.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr_tenant_cleanup_checklist.md)

## Prioritas 3: Nice-to-Have Setelah HR Stabil

### 8. Rapikan helper teknis bersama HR
- [ ] Ekstrak helper write/read HR yang berulang ke util bersama bila pola sudah stabil.
- [ ] Standarkan error reference pada halaman HR yang masih belum konsisten.
- [ ] Tambahkan helper backend bila beberapa halaman masih bergantung pada rollback frontend.

### 9. Rapikan dokumentasi operasional HR
- [ ] Sinkronkan `docs/panduan_membangun_hr.md` dengan status aktual setiap batch besar.
- [ ] Tambahkan status per domain: `siap`, `sebagian`, `internal`, `belum`.
- [ ] Tawarkan update FAQ setelah perubahan capability besar benar-benar stabil.

## Audit Penutupan HR

Checklist ini dijalankan saat merasa HR sudah hampir selesai:
- [ ] Audit `/org/hr/documents`
- [ ] Audit `/org/hr/reports`
- [ ] Audit lifecycle utama: onboarding, status, kontrak, offboarding
- [ ] Audit ATS inti: lowongan, kandidat, interview, penawaran
- [ ] Audit governance/policy pages yang memengaruhi tenant operasional
- [ ] Validasi data tenant nyata yang akan jadi sumber payroll
- [ ] Putuskan `go/no-go` untuk payroll secara eksplisit di dokumen ini

## Tunda Sampai Akhir

Bagian ini sengaja ditahan agar delivery HR lebih cepat. Kerjakan hanya setelah blocker inti turun atau saat fase penutupan besar.

### Dokumentasi dan knowledge
- [ ] Update FAQ final setelah fase besar HR selesai atau saat HR mendekati siap.
- [ ] Rapikan markdown lain (`README`, panduan panjang, catatan historis) setelah status domain berubah besar.
- [ ] Sinkronisasi wording/dokumentasi minor per halaman di akhir, bukan per edit kecil.

### Validasi luas
- [ ] Full smoke Playwright lintas HR dijalankan saat penutupan batch besar, bukan setiap langkah.
- [ ] Full gate `autofix -> lint full -> test -> build` dijalankan sebelum push/release, bukan untuk tiap batch harian.
- [ ] Tambahan coverage test non-kritis dikerjakan setelah flow inti stabil.

### Polish dan refactor
- [ ] Polish UI minor: copywriting, spacing, icon, empty state, microcopy.
- [ ] Refactor umum/helper bersama hanya setelah pola benar-benar stabil.
- [ ] Cleanup minor seperti rename variabel, style homogen, dan import ordering ditaruh di akhir bila tidak memengaruhi blocker.
- [ ] Optimasi performa halus yang tidak membuka blocker readiness ditunda sampai operasi inti aman.

### Ekspansi scope
- [ ] Fitur baru yang tidak menutup blocker readiness HR ditahan.
- [ ] Governance tambahan yang tidak langsung dipakai tenant operasional ditunda.
- [ ] Integrasi payroll, legal, atau domain lanjutan lain tetap ditahan sampai `Definisi Selesai HR Sebelum Payroll` lulus.

## Yang Sengaja Ditahan

- [ ] Jangan buka pekerjaan payroll baru sebelum blocker HR prioritas 1 selesai.
- [ ] Jangan pindahkan ownership absensi harian ke domain HR.
- [ ] Jangan perluas route internal menjadi menu final sebelum capability utamanya matang.
- [ ] Jangan mengejar fitur baru jika write-path halaman lama masih belum aman.

## Definisi Selesai HR Sebelum Payroll

- [ ] `Data Pegawai` stabil pada data tenant nyata.
- [ ] `Lifecycle` utama aman dan tidak non-atomik pada titik kritis.
- [ ] `Dokumen HR` sudah menjadi repository dokumen pegawai yang nyata berbasis nomor arsip fisik dan referensi arsip.
- [ ] `Laporan HR` sudah menjadi alat operasi, bukan sekadar observasi ringan.
- [ ] `Pengaturan HR` cukup untuk mengoperasikan tenant tanpa override manual berulang.
- [x] ATS inti sudah punya hardening akses dan tenant scoping yang seragam di level page.
- [ ] ATS inti sudah punya jalur audit/backend yang cukup seragam untuk perubahan sensitif.
- [ ] Data tenant nyata cukup bersih untuk menjadi sumber payroll dasar.

## Urutan Eksekusi Disarankan

1. `Dokumen HR`
2. `Laporan HR`
3. `Lifecycle atomik`
4. `ATS hardening`
5. `Pengaturan HR`
6. `Cleanup data tenant`

## Catatan Kerja

- Jika waktu hanya cukup untuk satu batch, ambil batch yang menurunkan risiko terbesar, bukan yang menambah halaman baru.
- Jika ada konflik antara backlog historis dan file ini, ikuti file ini untuk eksekusi harian.
- Setelah satu batch selesai, pindahkan item yang sudah beres ke changelog atau memory task agar TODO tetap pendek dan tajam.
- Jika ragu sebuah pekerjaan perlu dikerjakan sekarang atau tidak, pakai aturan ini:
  - kalau tidak membuat HR lebih dekat ke `siap operasional`, pindahkan ke `Tunda Sampai Akhir`
  - kalau tidak menutup blocker readiness, jangan didahulukan
