# HR to Payroll Readiness

Dokumen ini dipakai untuk menilai apakah fondasi HR sudah cukup siap menjadi dasar integrasi payroll.

Status per 14 Maret 2026:
- Payroll belum dianggap domain kerja default harian pada saat dokumen ini dibuat.
- Checklist ini tidak otomatis mengaktifkan payroll.
- Checklist ini dipakai untuk menilai kesiapan fondasi HR sebelum payroll disambungkan atau diperluas.

Dokumen turunan yang dipakai untuk checklist field minimum:
- [docs/hr-payroll-ready-fields.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-ready-fields.md)
- [docs/hr-payroll-readiness-execution-plan.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-readiness-execution-plan.md)
- [docs/hr-payroll-readiness-review-template.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-readiness-review-template.md)

Arti status:
- `ready`: fondasi sudah cukup stabil untuk dipakai payroll
- `partial`: fondasi sudah ada, tetapi belum cukup kuat untuk payroll tanpa risiko operasional
- `partial kuat`: fondasi utama dan audit dasar sudah relatif matang, tetapi masih ada gap operasional yang membuat payroll penuh belum aman
- `blocked`: belum layak dipakai sebagai dasar payroll

## Ringkasan Eksekutif

Status keseluruhan saat ini: `partial kuat`

Kesimpulan singkat:
- fondasi struktur HR sudah cukup kuat
- area ESS dan workflow approval sudah lebih matang
- `reports` dan `audit trail` payroll-impact sudah naik signifikan
- blocker terbesar tersisa ada pada kelengkapan operasi master pegawai dan verifikasi write end-to-end lintas lifecycle payroll-impact

Untuk daftar kerja yang lebih operasional dan berurutan, gunakan:
- [docs/hr-payroll-readiness-execution-plan.md](/Users/user/Documents/ANTI_GRAVITY_PROJECT/ABSENSIKU/docs/hr-payroll-readiness-execution-plan.md)

## Matriks Readiness

| Area | Status | Kenapa | Yang perlu dilengkapi |
|---|---|---|---|
| Master pegawai | partial kuat | route `/org/hr/employees` hidup, memuat data nyata, sudah punya create/edit/status/export plus pintu masuk import, menegakkan field `NIK`, `kategori`, `jabatan`, validasi duplikasi `email/NIP/NIK` yang kini null-safe, create path sudah menyimpan `OPD`, `Unit Kerja`, `Lokasi`, dan `Jabatan Master`, dialog edit sudah scrollable, UI menandai gap payroll-impact per pegawai lewat tab `Butuh Review`, dan bulk kategori kini bisa dibatasi ke baris terpilih | buktikan operasi create/import dengan write path yang aman dan perdalam edit master pada data tenant nyata; tenant uji saat ini masih punya pegawai aktif dengan `kategori` kosong sehingga smoke edit reversibel belum bisa dibuktikan |
| Struktur organisasi | ready | struktur, jabatan, dan grade sudah aktif sebagai baseline | kunci relasi final ke unit kerja, OPD, dan work unit bila dipakai payroll |
| Jabatan dan grade | partial | route aktif, tetapi kesiapan sebagai basis payroll belum ditegaskan di checklist formal | pastikan mapping grade/golongan siap dipakai komponen payroll |
| Kontrak kerja | partial kuat | route aktif, sudah punya status efektif + alasan + audit minimum plus validasi overlap/effective-date yang lebih tegas, dan smoke write `create -> delete` UI sudah lolos | review data kontrak nyata pada tenant uji agar pembacaan kontrak efektif pada tanggal tertentu benar-benar terbukti |
| Status kepegawaian | partial kuat | status hidup di HR, sudah punya mutasi dengan tanggal efektif + alasan minimum, dan smoke write UI sudah lolos | pastikan histori status cukup kuat sebagai sumber kebenaran payroll pada tanggal tertentu |
| Onboarding | partial kuat | route lolos runtime, invitation flow sudah ikut ke audit trail, dan smoke undangan `create -> delete` UI sudah lolos | pastikan pegawai baru bisa mencapai kondisi payroll-ready dengan field minimum lengkap |
| Offboarding | partial kuat | route lolos runtime, sudah mencatat audit minimum saat pegawai dinonaktifkan, dan smoke reversible `offboarding -> reactivation` UI sudah lolos | review histori lifecycle keluar pada data nyata agar pembacaan payroll date-based tetap aman |
| Approval hierarchy | partial | route ada, tetapi masih `internal terkendali` | finalkan siapa approver yang relevan untuk perubahan HR yang berdampak ke payroll |
| Jam kerja dan shift | partial | fondasi ada, tetapi belum diaudit sebagai sumber turunan payroll | pastikan policy kerja bisa dipakai untuk lembur, keterlambatan, dan potongan berbasis aturan |
| Leave dan ESS approval | ready | area ESS, cuti, WFH, flexible attendance, dan lembur relatif paling matang secara runtime | lanjutkan coverage E2E untuk approval end-to-end |
| Dokumen HR | partial | fondasi dokumen sudah hidup | pastikan dokumen kontrak, SK, dan legal mudah ditelusuri saat payroll butuh verifikasi |
| Laporan HR | partial kuat | route hidup, punya filter/export/print, dan sudah merangkum audit trail payroll-impact lintas domain utama | tambah laporan audit yang lebih payroll-grade dan verifikasi export pada data nyata end-to-end |
| Audit trail | partial kuat | perubahan pegawai, kontrak, onboarding invitation, offboarding, cuti, WFH, lembur, mutasi, dan absensi khusus sudah ikut ke ringkasan payroll-impact; smoke write untuk kontrak, status, undangan onboarding, dan offboarding sudah lolos | pastikan write path lifecycle lain tervalidasi end-to-end dan perluas ke domain lain hanya jika benar-benar payroll-impact |
| Route canonical | ready | alias dan internal sudah cukup terdokumentasi | pertahankan disiplin route canonical agar payroll tidak bergantung pada alias |
| Dokumentasi readiness | partial | status HR sudah lebih rapi, tetapi checklist payroll-readiness baru mulai dibangun | gunakan dokumen ini sebagai gate sebelum payroll dibuka |

## Bloker Utama Saat Ini

Sebelum HR dinyatakan siap untuk payroll, tiga bloker terbesar adalah:

1. `employees` masih belum lengkap untuk operasi master dan import yang benar-benar payroll-grade, dan tenant uji masih punya data pegawai aktif dengan field payroll-impact yang kosong
2. review data nyata untuk `contracts`, `status kepegawaian`, dan `offboarding` masih perlu diperdalam agar payroll date-based truth aman
3. approval ESS write belum bisa dibuktikan end-to-end pada tenant uji saat ini karena dataset `pending` kosong

## Kriteria Siap

Saya akan menganggap HR siap menjadi fondasi payroll kalau minimal kondisi ini sudah benar:

1. `employees` mendukung pengelolaan data utama yang dibutuhkan payroll
2. `contracts` punya validasi overlap, status aktif, dan tanggal efektif yang tegas serta tervalidasi pada data nyata
3. status kepegawaian, jabatan, grade, unit kerja, dan kontrak aktif bisa dipercaya sebagai sumber kebenaran payroll
4. `reports` mendukung filter dan export untuk audit dasar
5. approval ESS dan perubahan lifecycle penting lolos uji end-to-end
6. audit trail perubahan HR yang berdampak ke payroll mudah ditelusuri

## Urutan Pengerjaan Yang Paling Masuk Akal

1. matangkan `employees` sebagai master data operasional
2. matangkan `contracts`, `onboarding`, dan `offboarding`
3. perkuat `reports` untuk audit dan export
4. finalkan checklist field dan status minimum payroll-ready
5. baru nilai ulang readiness keseluruhan

## Status Saat Ini

Kalimat paling akurat untuk kondisi hari ini:

`HR sudah mendekati fondasi payroll yang layak, tetapi belum siap penuh karena operasi master pegawai pada data tenant nyata dan verifikasi end-to-end lintas lifecycle payroll-impact masih belum cukup kuat.`
