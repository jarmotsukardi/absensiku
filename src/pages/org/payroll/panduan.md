# Panduan Pengembangan Payroll Org Workspace

Panduan singkat untuk melanjutkan pengembangan modul `/org/payroll` di repo ini.

## 1. Konteks Saat Ini
- Repo utama tetap aplikasi absensi.
- HR aktif dan sudah berjalan di alpha.
- Payroll baru mulai dibuka kembali atas instruksi user.
- Route payroll organisasi sudah ada, tetapi readiness tiap halaman belum merata.

## 2. Titik Masuk Kode
- Route utama:
  - `src/App.tsx`
- Guard akses:
  - `src/components/org/payroll/PayrollRouteGuard.tsx`
  - `src/lib/payrollAccess.ts`
- Aktivasi workspace:
  - `src/lib/orgWorkspaceModules.ts`
  - `src/components/admin/organization/OrganizationLayout.tsx`
  - `src/pages/org/OrgOnboardingSetup.tsx`
- Halaman payroll org:
  - `src/pages/org/payroll/*`

## 3. Cara Menyalakan Payroll
- Payroll muncul di switcher header hanya jika `workspaceModules.payroll === true`.
- Sumber nilainya:
  1. record tenant di `organization_settings`
  2. fallback default di `DEFAULT_ORG_WORKSPACE_MODULES`
- Artinya:
  - tenant baru bisa aktif dari fallback default
  - tenant lama yang sudah tersimpan `payroll=false` harus diaktifkan dari setting tenant

## 4. Alur Kerja yang Disarankan

### Langkah A: Audit akses
- Cek tenant target punya role `admin_instansi`.
- Cek apakah `org_workspace_modules_v1` menyimpan `payroll=false`.
- Cek apakah `payroll_role_assignments` tersedia dan mode akses payroll tidak memblokir.

### Langkah B: Validasi route dasar
- Buka:
  - `/org/payroll`
  - `/org/payroll/policies`
  - `/org/payroll/periods`
  - `/org/payroll/validation`
  - `/org/payroll/roles`
- Pastikan heading muncul dan tidak redirect ke `/org`.

### Langkah C: Kembangkan per batch final
- Gunakan batch kerja final yang sudah disepakati dan sinkron dengan `todo.md`.
- Urutan batch operasional:
  - Batch A: kerangka UI
  - Batch B: fondasi payroll
  - Batch C: input dan pemeriksaan
  - Batch D: proses inti
  - Batch E: referensi data
  - Batch F: observability
  - Batch G: finalisasi
- Jangan kembali memakai batch lama yang mendorong fitur lanjutan terlalu dini.

## 5. Standar Implementasi
- Semua query wajib tenant-aware.
- Error operasional harus menyertakan `ref` atau `trace_id`.
- Jangan campur payroll dengan billing jika tidak benar-benar perlu.
- Untuk perubahan kecil:
  - lint file terkait
- Untuk perubahan akses, auth, migration, atau route guard:
  - lint + test terdampak + build bila perlu

## 6. Validasi Minimum
- Lint file yang diubah.
- Untuk perubahan lokal yang butuh runtime:
  - `npm run ops:sandbox:doctor:strict`
- Gunakan validasi sesuai risiko perubahan.
- Playwright tidak menjadi validasi default tahap awal payroll.
- Playwright baru diprioritaskan saat progres implementasi mendekati `95%`.
- Sebelum rilis:
  - `npm run autofix`
  - `npm run test`
  - `npm run build`

## 7. Jika Butuh Perubahan Database
- Database yang dipakai adalah Supabase remote.
- Jangan default ke localhost.
- Sebelum migration penting:
  - `npm run db:backup:supabase`
- Setelah migration:
  - verifikasi query halaman payroll yang terdampak
  - cek error log untuk ref atau trace baru

## 8. Output yang Diharapkan
- Payroll dapat diakses dari header switcher org.
- Menu inti payroll stabil dibuka.
- CRUD inti tidak bocor antar tenant.
- Guard payroll jelas: ditolak jika role tidak memenuhi, lolos jika workspace dan permission benar.
- Smoke lokal dan online untuk payroll inti tersedia.

## 9. Catatan Praktis
- Jika online belum menampilkan Payroll tetapi local tampil, cek dua hal:
  - deploy belum membawa perubahan terbaru
  - tenant online sudah menyimpan `payroll=false`
- Jika `/org/payroll` redirect ke `/org`, mulai audit dari:
  - `OrganizationLayout`
  - `orgWorkspaceModules`
  - `PayrollRouteGuard`
  - `payrollAccess`

## 10. Catatan Diskusi Awal: Payroll Sederhana Dulu

Tujuan diskusi awal ini adalah menahan scope payroll agar tidak langsung melebar ke semua fase.

### Prinsip
- Payroll tahap awal harus usable untuk admin organisasi.
- Fokus ke alur bulanan inti, bukan seluruh domain payroll sekaligus.
- Fitur advanced seperti integrasi penuh, pajak mendalam, distribusi kompleks, dan audit lanjutan bisa ditahan setelah MVP stabil.

### Scope MVP yang Diusulkan
- Workspace Payroll
  - `/org/payroll`
- Kebijakan Payroll
  - `/org/payroll/policies`
- Periode Payroll
  - `/org/payroll/periods`
- Input Variabel Bulanan
  - `/org/payroll/variable-input`
- Validasi Payroll
  - `/org/payroll/validation`
- Run Engine
  - `/org/payroll/run-engine`
- Approval Payroll
  - `/org/payroll/approval`
- Laporan Ringkas Payroll
  - `/org/payroll/reports`
- Role Payroll minimum
  - `/org/payroll/roles`

### Yang Sebaiknya Ditunda
- Struktur grade payroll yang terlalu detail bila belum dipakai tenant.
- Slip gaji PDF final dengan distribusi penuh.
- Pembayaran dan bank file otomatis.
- Pajak dan kepatuhan yang kompleks.
- Audit log dan error log yang terlalu dalam untuk tahap awal.
- Integrasi webhook atau integrasi pihak ketiga.

### Urutan Implementasi yang Lebih Aman
1. Aktivasi workspace payroll dan switcher header.
2. Policies + periods sebagai fondasi siklus payroll.
3. Variable input + validation.
4. Run engine + approval.
5. Reports ringkas.
6. Baru setelah itu distribusi, tax, audit, dan integrasi.

### Definisi Payroll Sederhana
- Admin organisasi bisa masuk ke workspace payroll.
- Bisa membuat atau mengubah kebijakan payroll.
- Bisa membuka periode payroll.
- Bisa mengisi data variabel bulanan.
- Bisa menjalankan validasi dasar.
- Bisa menjalankan payroll run sederhana.
- Bisa melihat hasil ringkas tanpa harus langsung memiliki seluruh modul lanjutan.

### Pertanyaan Diskusi Lanjutan
- Apakah payroll sederhana ini cukup untuk satu tenant pilot terlebih dahulu?
- Apakah `employees` dan `income/deduction components` masuk MVP, atau ditahan dulu?
- Apakah reports cukup ringkasan tabel, tanpa export dan tanpa analitik berat?
- Apakah approval cukup satu tahap lebih dulu, bukan approval berlapis?

## 11. Keputusan Diskusi: Data HR/Absensi Ditampilkan Sebagai Overlay

Untuk payroll sederhana, data yang sumber kebenarannya sudah ada di domain HR atau absensi tidak perlu dibuat ulang sebagai master payroll terpisah.

### Prinsip
- Payroll tidak menjadi pemilik utama data pegawai, struktur organisasi, jabatan, atau data kehadiran.
- Payroll hanya membaca, memanfaatkan, dan menampilkan konteks data tersebut saat dibutuhkan untuk proses penggajian.
- Saat user membutuhkan detail sumber, tampilkan sebagai halaman overlay atau context page, bukan memaksa pindah penuh ke modul lain.

### Data yang Sebaiknya Mengambil Dari HR
- data pegawai
- status kepegawaian
- riwayat jabatan
- kontrak kerja
- unit kerja, OPD, jabatan, grade yang sudah ada di HR

### Data yang Sebaiknya Mengambil Dari Absensi
- ringkasan kehadiran per periode
- keterlambatan
- lembur yang bersumber dari absensi
- izin atau ketidakhadiran yang berdampak ke payroll

### Implikasi ke Menu Payroll
- `Master Karyawan Payroll` tidak wajib menjadi menu inti MVP.
- `Struktur Organisasi & Grade` tidak wajib menjadi menu inti MVP bila sudah terbaca dari HR.
- validasi payroll harus menampilkan indikator kesiapan data HR/absensi.
- halaman payroll yang butuh detail sumber sebaiknya punya tombol:
  - lihat data HR
  - lihat data absensi
  - buka overlay detail

### Pola UI yang Disarankan
- Gunakan overlay, drawer, dialog besar, atau context panel.
- Payroll tetap menjadi konteks utama.
- HR/absensi tampil sebagai referensi pendukung tanpa memutus alur payroll.

### Manfaat
- mengurangi duplikasi data
- mengurangi risiko inkonsistensi antar modul
- menjaga payroll tetap sederhana
- membuat user memahami bahwa payroll memproses data lintas domain, bukan mengelola semuanya dari nol

## 12. Keputusan Diskusi: Struktur Sidebar Payroll dan Badge Status

Bagian ini hanya menjadi catatan transisi keputusan awal. Acuan operasional final untuk label, badge, dan struktur sidebar ada di bagian:
- `Keputusan Bahasa`
- `Susunan Grup Final yang Disetujui`
- `Struktur Final Sidebar Payroll`

### Prinsip yang Tetap Berlaku
- Sidebar payroll tetap menampilkan peta modul secara utuh sejak awal.
- Menu yang belum matang tidak disembunyikan, tetapi diberi badge status yang jujur.
- Menu inti harus paling menonjol.
- Referensi HR dan absensi harus terlihat sebagai referensi sumber data, bukan master payroll baru.

## 13. Keputusan Bahasa: Semua Label, Penjelasan, dan Glosarium Wajib Bahasa Indonesia

Untuk modul payroll, semua elemen user-facing wajib menggunakan Bahasa Indonesia.

### Aturan
- label menu wajib Bahasa Indonesia
- judul halaman wajib Bahasa Indonesia
- deskripsi halaman wajib Bahasa Indonesia
- badge status wajib Bahasa Indonesia
- glosarium wajib Bahasa Indonesia
- istilah teknis asing hanya dipakai jika belum ada padanan yang wajar, dan sebaiknya dijelaskan dalam konteks Indonesia

### Padanan Label Sidebar yang Disepakati
- `Dashboard Payroll` -> `Beranda Payroll`
- `Payroll Workspace` -> `Ruang Kerja Payroll`
- `Policies` -> `Kebijakan Payroll`
- `Periods` -> `Periode Payroll`
- `Variable Input` -> `Input Variabel`
- `Validation` -> `Validasi Payroll`
- `Run Engine` -> `Proses Payroll`
- `Approval` -> `Persetujuan Payroll`
- `Reports` -> `Laporan Payroll`
- `Roles` -> `Hak Akses Payroll`
- `Help` -> `Bantuan Payroll`
- `Employees` -> `Data Pegawai Payroll`
- `Income Components` -> `Komponen Penghasilan`
- `Deduction Components` -> `Komponen Potongan`
- `Payment` -> `Pembayaran Payroll`
- `Tax Compliance` -> `Pajak dan Kepatuhan`
- `Audit Log` -> `Log Audit Payroll`
- `Error Log` -> `Log Error Payroll`
- `Integrations` -> `Integrasi Payroll`

### Padanan Badge Status yang Disepakati
- `MVP` -> `Inti`
- `Overlay HR` -> `Referensi HR`
- `Overlay Absensi` -> `Referensi Absensi`
- `Lanjutan` -> `Lanjutan`
- `Tunda` -> `Ditunda`
- `Info` -> `Info`

### Susunan Label Sidebar Payroll Final

#### Inti Payroll
- Beranda Payroll
  - badge: `Inti`
- Kebijakan Payroll
  - badge: `Inti`
- Periode Payroll
  - badge: `Inti`
- Input Variabel
  - badge: `Inti`
- Validasi Payroll
  - badge: `Inti`
- Proses Payroll
  - badge: `Inti`
- Persetujuan Payroll
  - badge: `Inti`
- Laporan Payroll
  - badge: `Inti`

#### Referensi Data
- Data Pegawai Payroll
  - badge: `Referensi HR`
- Struktur Organisasi dan Grade
  - badge: `Referensi HR`

#### Lanjutan
- Komponen Penghasilan
  - badge: `Lanjutan`
- Komponen Potongan
  - badge: `Lanjutan`
- Slip Gaji
  - badge: `Ditunda`
- Pembayaran Payroll
  - badge: `Ditunda`
- Pajak dan Kepatuhan
  - badge: `Ditunda`
- Log Audit Payroll
  - badge: `Ditunda`
- Log Error Payroll
  - badge: `Ditunda`
- Integrasi Payroll
  - badge: `Ditunda`

#### Pengaturan
- Hak Akses Payroll
  - badge: `Inti`
- Bantuan Payroll
  - badge: `Info`

### Susunan Grup Final yang Disetujui

#### Inti
- Beranda Payroll
  - badge: `Inti`
- Kebijakan Payroll
  - badge: `Inti`
- Periode Payroll
  - badge: `Inti`
- Input Variabel
  - badge: `Inti`
- Validasi Payroll
  - badge: `Inti`
- Proses Payroll
  - badge: `Inti`
- Persetujuan Payroll
  - badge: `Inti`
- Laporan Payroll
  - badge: `Inti`

#### Referensi
- Data Pegawai Payroll
  - badge: `Referensi HR`
- Struktur Organisasi dan Grade
  - badge: `Referensi HR`

#### Lanjutan
- Komponen Penghasilan
  - badge: `Lanjutan`
- Komponen Potongan
  - badge: `Lanjutan`
- Slip Gaji
  - badge: `Ditunda`
- Pembayaran Payroll
  - badge: `Ditunda`
- Pajak dan Kepatuhan
  - badge: `Ditunda`
- Log Audit Payroll
  - badge: `Ditunda`
- Log Error Payroll
  - badge: `Ditunda`
- Integrasi Payroll
  - badge: `Ditunda`

#### Pengaturan
- Hak Akses Payroll
  - badge: `Inti`
- Bantuan Payroll
  - badge: `Info`

### Urutan Alur Pengguna yang Disepakati
1. Beranda Payroll
2. Kebijakan Payroll
3. Periode Payroll
4. Input Variabel
5. Validasi Payroll
6. Proses Payroll
7. Persetujuan Payroll
8. Laporan Payroll

### Keputusan Ramping Sidebar
- sidebar payroll harus tetap ramping
- `Pengaturan Payroll` tidak tampil sebagai menu utama di sidebar
- route `/org/payroll/settings` boleh tetap ada secara teknis, tetapi tidak menjadi item navigasi utama
- kebutuhan pengaturan dasar payroll diserap ke konteks `Hak Akses Payroll` atau tindakan sekunder dalam halaman terkait

### Struktur Final Sidebar Payroll

#### Inti
- Beranda Payroll
- Kebijakan Payroll
- Periode Payroll
- Input Variabel
- Validasi Payroll
- Proses Payroll
- Persetujuan Payroll
- Laporan Payroll

#### Referensi
- Data Pegawai Payroll
- Struktur Organisasi dan Grade

#### Lanjutan
- Komponen Penghasilan
- Komponen Potongan
- Slip Gaji
- Pembayaran Payroll
- Pajak dan Kepatuhan
- Log Audit Payroll
- Log Error Payroll
- Integrasi Payroll

#### Pengaturan
- Hak Akses Payroll
- Bantuan Payroll

## 14. Keputusan Fase Akhir: Penjelasan dan Glosarium Ditunda

Untuk pengembangan payroll tahap awal, fokus utama adalah struktur menu, alur kerja, dan fungsi inti. Penjelasan panjang dan glosarium tidak menjadi prioritas awal.

### Aturan
- penjelasan detail tiap halaman tidak perlu diprioritaskan di fase awal
- glosarium payroll tidak perlu dibuat di fase awal
- deskripsi singkat yang benar-benar perlu tetap boleh ada, tetapi harus ringkas
- penjelasan mendalam dan glosarium baru dikerjakan saat progres implementasi mendekati `95%`

### Tujuan
- menjaga kecepatan delivery payroll inti
- menghindari waktu habis untuk copywriting sebelum alur kerja stabil
- memastikan dokumentasi user-facing disusun setelah istilah, label, dan proses benar-benar final

## 15. Keputusan Fase Awal: Tidak Ada Unggah Dokumen

Untuk payroll sederhana tahap awal, tidak ada fitur unggah dokumen.

### Aturan
- tidak ada menu unggah dokumen payroll
- tidak ada alur lampiran dokumen di modul payroll
- tidak ada ketergantungan proses payroll terhadap upload file atau lampiran

### Implikasi
- payroll fokus ke data inti, validasi, proses, persetujuan, dan laporan
- jika butuh dokumen pendukung, payroll hanya membaca referensi dari modul HR yang sudah ada
- pengembangan slip, pembayaran, atau fitur lanjutan tidak boleh didesain dengan asumsi upload dokumen sudah tersedia

## 16. Keputusan Roadmap: Log Error Diaktifkan Saat Progres Mendekati 75%

Halaman `Log Error Payroll` tetap ada dalam peta menu, tetapi tidak menjadi fokus tahap awal.

### Aturan
- `Log Error Payroll` tidak diaktifkan sebagai prioritas awal
- halaman ini mulai diaktifkan saat progres aplikasi payroll mendekati `75%`
- tujuannya untuk mempercepat deteksi error aktif ketika modul inti sudah cukup banyak dipakai

### Tujuan
- menyediakan pusat triase error payroll sebelum fase akhir
- membantu pelacakan `ref` dan `trace_id` saat modul inti mulai stabil
- menghindari beban implementasi observability terlalu dini saat alur dasar belum matang

### Implikasi
- pada fase awal, error cukup ditangani lewat logging yang sudah ada di halaman inti
- saat progres mendekati `75%`, `Log Error Payroll` menjadi salah satu prioritas dari grup `Lanjutan`
- aktivasi halaman ini harus tetap memakai Bahasa Indonesia dan menonjolkan referensi error yang mudah ditindaklanjuti

## 17. Keputusan Roadmap: Log Audit Diprioritaskan Setelah 75%

`Log Audit Payroll` tidak menjadi prioritas fase awal. Halaman ini diprioritaskan setelah progres payroll melewati sekitar `75%`.

### Aturan
- `Log Audit Payroll` tidak menjadi fokus implementasi awal
- halaman audit trail mulai diprioritaskan setelah modul inti payroll cukup stabil
- aktivasi audit trail dilakukan setelah kebutuhan operasional inti lebih dulu aman dipakai

### Tujuan
- menyediakan jejak aksi penting saat proses payroll sudah cukup aktif digunakan
- membantu pelacakan perubahan status, persetujuan, dan tindakan kritikal
- mencegah waktu implementasi habis terlalu awal pada observability lanjutan

### Implikasi
- fase awal cukup menjaga `ref` dan `trace_id` pada halaman inti
- setelah progres melewati `75%`, `Log Audit Payroll` menjadi prioritas grup `Lanjutan`
- audit trail harus tetap berbahasa Indonesia dan mudah dibaca oleh admin organisasi

## 18. Mode Orkestrasi Payroll

Mode kerja payroll menggunakan pendekatan bertahap, cepat, dan terkunci scope agar implementasi tidak melebar.

### Fase Kerja

#### Fase 1: Diskusi dan Keputusan
- kunci scope payroll sederhana
- kunci struktur sidebar
- kunci label Bahasa Indonesia
- kunci roadmap implementasi

#### Fase 2: Kerangka UI
- rapikan sidebar payroll
- rapikan beranda payroll
- pasang badge status menu
- rapikan struktur halaman inti

#### Fase 3: Alur Inti
- kebijakan payroll
- periode payroll
- input variabel
- validasi payroll
- proses payroll
- persetujuan payroll
- laporan payroll

#### Fase 4: Referensi
- overlay data HR
- overlay data absensi
- payroll membaca sumber data, bukan menduplikasi master

#### Fase 5: Observability
- aktifkan log error payroll saat progres mendekati `75%`
- aktifkan log audit payroll saat progres mendekati `75%`

#### Fase 6: Finalisasi
- tambahkan penjelasan halaman
- tambahkan glosarium
- jalankan Playwright saat progres mendekati `95%`

### Aturan Eksekusi
- pecah pekerjaan ke batch kecil independen
- operasi baca konteks dijalankan paralel jika aman
- jangan edit file yang sama secara paralel
- validasi mengikuti risiko perubahan, bukan full gate setiap saat
- full gate hanya menjelang push atau release
- semua label, penjelasan, dan glosarium wajib Bahasa Indonesia
- tidak ada unggah dokumen di fase awal
- data HR dan absensi ditampilkan sebagai overlay atau context page

### Batch Tetap
1. Batch A
- sidebar payroll
- beranda payroll
- label dan badge

#### Detail Batch A: Kerangka UI
- Rapikan sidebar payroll sesuai struktur final yang sudah disepakati.
- Rapikan beranda payroll agar menjadi titik masuk utama alur kerja payroll.
- Pastikan semua label user-facing memakai Bahasa Indonesia.
- Pasang badge status menu secara konsisten.
- Jaga agar sidebar tetap ramping dan tidak memunculkan `Pengaturan Payroll` sebagai menu utama.

#### Hasil Batch A yang Diharapkan
- Struktur sidebar payroll langsung terbaca oleh admin organisasi.
- Menu inti payroll lebih menonjol daripada menu referensi dan lanjutan.
- Halaman beranda payroll membantu user memahami langkah berikutnya.
- Istilah payroll utama sudah konsisten dalam Bahasa Indonesia.

#### Yang Tidak Masuk Batch A
- logic proses payroll
- validasi payroll mendalam
- overlay referensi HR atau absensi
- log error payroll
- log audit payroll
- glosarium payroll
- Playwright

2. Batch B
- kebijakan payroll
- periode payroll

3. Batch C
- input variabel
- validasi payroll

4. Batch D
- proses payroll
- persetujuan payroll
- laporan payroll

5. Batch E
- referensi HR
- referensi absensi

6. Batch F
- log error payroll
- log audit payroll

7. Batch G
- penjelasan
- glosarium
- Playwright

### Definition of Done per Batch
- scope batch jelas
- label Bahasa Indonesia konsisten
- validasi file terkait lolos
- tidak merusak batch sebelumnya
- memory proyek diperbarui
- FAQ offer dijalankan

## 19. Stack Kerja Efektif Payroll

Stack kerja payroll difokuskan pada tool yang benar-benar mendukung coding cepat, verifikasi terarah, dan konsistensi keputusan.

### Untuk Coding
- `codebase`
  - utama untuk baca, edit, patch, dan search file project
- `exec_command`
  - untuk `npm`, build, lint, test, script lokal, dan inspeksi status kerja
- `memory`
  - untuk menjaga keputusan proyek tetap konsisten lintas sesi
- `local-fs`
  - tidak wajib sebagai tool terpisah; kebutuhan file lokal sudah tercakup oleh `codebase` dan `exec_command`

### Untuk Verifikasi
- `exec_command`
  - untuk lint, test, build, script validasi, dan pemeriksaan lokal
- `localhost`
  - untuk cek hasil render atau resource lokal tanpa perlu browser penuh
- `playwright`
  - dipakai nanti untuk smoke test akhir, bukan default tiap langkah

### Untuk Referensi
- `context7`
  - untuk dokumentasi library resmi saat benar-benar diperlukan
- `fetch`
  - untuk mengambil isi dokumentasi atau resource web jika dibutuhkan
- `github`
  - untuk repo, PR, issue, atau workflow jika pekerjaan sudah masuk fase kolaborasi remote

### Yang Diabaikan Dulu
- `playwright`
  - jangan dipakai terus-menerus selama fitur inti belum selesai
- `github`
  - belum penting jika fokus masih coding lokal
- `fetch`
  - tidak perlu dipakai jika jawaban sudah ada di repo

### Tool Internal yang Dipakai
- `functions.exec_command`
  - eksekusi command shell, npm script, build, lint, test, dan inspeksi lokal
- `functions.write_stdin`
  - melanjutkan proses command yang masih berjalan
- `functions.update_plan`
  - menjaga urutan kerja dan status batch jika perlu mode plan
- `functions.view_image`
  - membaca gambar lokal saat dibutuhkan untuk audit UI
- `functions.apply_patch`
  - edit file secara presisi
- `functions.list_mcp_resources`
  - melihat resource MCP yang tersedia
- `functions.list_mcp_resource_templates`
  - melihat template resource MCP yang tersedia
- `functions.read_mcp_resource`
  - membaca resource MCP spesifik bila relevan
