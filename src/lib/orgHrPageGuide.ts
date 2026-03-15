export type OrgHrGuideTerm = {
  term: string;
  definition: string;
};

export type OrgHrPageGuide = {
  badge: string;
  title: string;
  summary: string;
  focusPoints: string[];
  useCases: string[];
  outputs: string[];
  glossary: OrgHrGuideTerm[];
  watchouts?: string[];
  relatedRoutes?: Array<{
    label: string;
    path: string;
    note: string;
  }>;
};

const buildGuide = (guide: OrgHrPageGuide): OrgHrPageGuide => guide;

const guides: Record<string, OrgHrPageGuide> = {
  "/org/hr": buildGuide({
    badge: "Ringkasan",
    title: "Panduan Ringkasan HR",
    summary:
      "Halaman ini adalah pintu masuk workspace HR. Gunakan untuk membaca kondisi operasional tenant sebelum pindah ke modul HR yang lebih spesifik.",
    focusPoints: [
      "Membaca KPI inti seperti pegawai, kontrak, tiket terbuka, dan struktur aktif.",
      "Menentukan prioritas tindak lanjut HR pada hari berjalan.",
      "Membuka modul utama HR tanpa harus mengingat seluruh struktur menu.",
    ],
    useCases: [
      "Saat admin HR baru login dan perlu membaca situasi tenant dengan cepat.",
      "Saat butuh briefing singkat sebelum menindak tiket, kontrak, atau update data pegawai.",
      "Saat ingin memastikan modul yang perlu dibuka berikutnya tanpa berpindah-pindah menu terlalu lama.",
    ],
    outputs: [
      "Ringkasan metrik operasional tenant.",
      "Akses cepat ke halaman data pegawai, kontrak, laporan, dan tiket HR.",
      "Indikasi awal apakah ada masalah bantuan atau aktivitas yang perlu direspons lebih dulu.",
    ],
    glossary: [
      { term: "KPI", definition: "Indikator angka ringkas untuk membaca kondisi operasional HR saat ini." },
      { term: "Tiket HR", definition: "Permintaan bantuan atau isu yang masuk ke meja layanan HR tenant." },
      { term: "Struktur aktif", definition: "Jumlah unit organisasi yang masih aktif dan dipakai sebagai basis distribusi pegawai." },
      { term: "Aksi cepat", definition: "Tautan langsung ke halaman HR yang paling sering dipakai untuk tindak lanjut." },
    ],
  }),
  "/org/hr/employees": buildGuide({
    badge: "Pegawai",
    title: "Panduan Data Pegawai",
    summary:
      "Halaman ini memusatkan identitas dasar pegawai yang menjadi sumber kebenaran untuk proses HR lain seperti kontrak, status, orientasi, dan evaluasi.",
    focusPoints: [
      "Memonitor jumlah pegawai aktif dan nonaktif secara cepat.",
      "Mengecek kelengkapan kategori pegawai dan golongan yang dipakai oleh tenant.",
      "Menghubungkan operator HR ke master pegawai organisasi saat perlu tindakan lanjutan.",
    ],
    useCases: [
      "Saat admin perlu mencari pegawai berdasarkan nama, email, NIP, kategori, atau golongan.",
      "Saat ingin memvalidasi bahwa data pegawai sudah siap dipakai oleh modul kontrak, cuti, dan kinerja.",
      "Saat memisahkan analisis antara pegawai aktif dan nonaktif.",
    ],
    outputs: [
      "Daftar pegawai aktif dan nonaktif.",
      "Ringkasan kategori/golongan yang sudah terpakai.",
      "Arah ke master pegawai organisasi untuk aksi pengelolaan yang lebih lengkap.",
    ],
    glossary: [
      { term: "Master pegawai", definition: "Sumber data utama identitas pegawai di level tenant." },
      { term: "Kategori pegawai", definition: "Pengelompokan jenis pegawai, misalnya ASN, PPPK, kontrak, atau kategori lokal tenant." },
      { term: "Golongan", definition: "Level atau klasifikasi administratif pegawai yang dipakai untuk pelaporan dan kebijakan." },
      { term: "Pegawai aktif", definition: "Pegawai yang masih memiliki status kerja berjalan dan dihitung dalam operasional tenant." },
    ],
  }),
  "/org/hr/structure": buildGuide({
    badge: "Organisasi",
    title: "Panduan Struktur Organisasi",
    summary:
      "Halaman ini menjelaskan fondasi unit kerja tenant. Struktur organisasi dipakai sebagai konteks distribusi pegawai, jabatan, dan pelaporan HR.",
    focusPoints: [
      "Membaca sebaran unit organisasi yang aktif di tenant.",
      "Memastikan data unit kerja selaras dengan kebutuhan HR dan absensi.",
      "Menjadi rujukan saat membaca penempatan pegawai dan mutasi antar unit.",
    ],
    useCases: [
      "Saat perlu mengecek unit atau OPD yang masih aktif.",
      "Saat menyelaraskan data pegawai dengan struktur organisasi nyata.",
      "Saat menyiapkan mutasi, pelaporan headcount, atau analisis unit kerja.",
    ],
    outputs: [
      "Ringkasan unit organisasi yang tersedia.",
      "Detail data organisasi yang dipakai oleh modul HR lainnya.",
      "Konteks struktural untuk membaca penempatan pegawai dan beban unit.",
    ],
    glossary: [
      { term: "Unit organisasi", definition: "Entitas struktur seperti OPD, dinas, divisi, atau unit kerja di tenant." },
      { term: "Penempatan", definition: "Relasi antara pegawai dan unit kerja tempat ia bertugas." },
      { term: "Headcount", definition: "Jumlah pegawai yang tercatat dalam suatu unit atau tenant." },
      { term: "Fondasi organisasi", definition: "Data struktur dasar yang menjadi acuan modul HR lain." },
    ],
  }),
  "/org/hr/position-grade": buildGuide({
    badge: "Organisasi",
    title: "Panduan Jabatan dan Grade",
    summary:
      "Halaman ini dipakai untuk membaca dan mengelola klasifikasi jabatan serta grade yang terkait dengan struktur tenant dan profil pegawai.",
    focusPoints: [
      "Mengamati distribusi jabatan dan grade yang sudah dipakai tenant.",
      "Menyelaraskan data jabatan dengan kategori pegawai dan golongan.",
      "Menjadi acuan untuk promosi, mutasi, dan evaluasi kebutuhan posisi.",
    ],
    useCases: [
      "Saat HR perlu memetakan struktur jabatan per kategori pegawai.",
      "Saat ingin menyiapkan promosi atau mutasi yang membutuhkan referensi jabatan.",
      "Saat meninjau konsistensi grade dengan data organisasi dan pegawai.",
    ],
    outputs: [
      "Daftar jabatan/grade yang aktif dipakai.",
      "Distribusi kategori dan golongan yang terkait.",
      "Konteks untuk mutasi, promosi, dan evaluasi struktur posisi.",
    ],
    glossary: [
      { term: "Jabatan", definition: "Peran formal pegawai dalam struktur organisasi tenant." },
      { term: "Grade", definition: "Level atau band klasifikasi posisi yang membantu standardisasi." },
      { term: "Promosi", definition: "Perubahan posisi ke level atau tanggung jawab yang lebih tinggi." },
      { term: "Mutasi", definition: "Perpindahan pegawai antar jabatan, unit, atau lokasi kerja." },
    ],
  }),
  "/org/hr/contracts": buildGuide({
    badge: "Pegawai",
    title: "Panduan Kontrak Kerja",
    summary:
      "Halaman kontrak kerja menyimpan dokumen dan periode hubungan kerja pegawai. Di sini HR memantau masa berlaku, status, dan potensi tumpang tindih kontrak.",
    focusPoints: [
      "Membaca kontrak aktif, hampir habis, dan yang perlu diperpanjang.",
      "Mencegah bentrok periode kontrak untuk pegawai yang sama.",
      "Menghubungkan kontrak ke dokumen dan status kerja pegawai.",
    ],
    useCases: [
      "Saat HR menyiapkan perpanjangan kontrak atau perubahan status kerja.",
      "Saat perlu mengecek pegawai mana yang kontraknya akan berakhir.",
      "Saat menelusuri histori dokumen kerja individual.",
    ],
    outputs: [
      "Daftar kontrak dengan status dan periode.",
      "Sinyal kontrak yang berisiko overlap atau mendekati akhir.",
      "Konteks administratif untuk orientasi, offboarding, dan dokumen.",
    ],
    glossary: [
      { term: "Masa berlaku", definition: "Rentang tanggal aktif suatu kontrak kerja." },
      { term: "Perpanjangan", definition: "Tindakan membuat kontrak baru atau memperbarui periode kontrak berjalan." },
      { term: "Overlap kontrak", definition: "Dua kontrak atau lebih yang memiliki periode bertumpuk untuk pegawai yang sama." },
      { term: "Status kontrak", definition: "Kondisi kontrak, misalnya aktif, berakhir, atau draf." },
    ],
  }),
  "/org/hr/documents": buildGuide({
    badge: "Administrasi",
    title: "Panduan Dokumen HR",
    summary:
      "Halaman dokumen HR dipakai untuk menata arsip administratif pegawai seperti surat, berkas pendukung, dan file operasional yang dibutuhkan sepanjang lifecycle pegawai.",
    focusPoints: [
      "Memusatkan dokumen pegawai agar mudah dilacak oleh HR tenant.",
      "Menjaga keterkaitan dokumen dengan pegawai, kontrak, atau proses tertentu.",
      "Menyediakan arsip yang siap digunakan dalam audit atau verifikasi internal.",
    ],
    useCases: [
      "Saat mencatat nomor surat keputusan, berkas orientasi, atau referensi dokumen offboarding.",
      "Saat ingin mencari dokumen pegawai berdasarkan kategori atau nama file.",
      "Saat menyiapkan dokumen pendukung audit HR.",
    ],
    outputs: [
      "Arsip dokumen HR per pegawai/proses.",
      "Klasifikasi dokumen yang memudahkan pencarian ulang.",
      "Aset dokumen yang bisa dipakai untuk proses administrasi lanjutan.",
    ],
    glossary: [
      { term: "Arsip HR", definition: "Kumpulan dokumen administratif yang dikelola unit HR tenant." },
      { term: "Kategori dokumen", definition: "Label yang membedakan tipe dokumen, misalnya kontrak, surat, atau referensi administrasi." },
      { term: "Retensi dokumen", definition: "Lamanya dokumen perlu disimpan sebelum dipindahkan atau dihapus sesuai kebijakan." },
      { term: "Metadata dokumen", definition: "Informasi pelengkap seperti pemilik, tanggal dokumen, nomor referensi, dan kategori administrasi." },
    ],
  }),
  "/org/hr/reports": buildGuide({
    badge: "Operasional",
    title: "Panduan Laporan HR",
    summary:
      "Halaman laporan HR menyatukan metrik pegawai, kontrak, dan indikator operasional untuk pemantauan manajemen tenant.",
    focusPoints: [
      "Membaca tab laporan sesuai kebutuhan pemantauan harian atau periodik.",
      "Menarik penelusuran rinci kategori pegawai dan status kontrak.",
      "Menjadi jembatan antara data HR operasional dan pengambilan keputusan.",
    ],
    useCases: [
      "Saat pimpinan atau admin butuh gambaran cepat kondisi pegawai tenant.",
      "Saat membuat bahan rapat HR atau evaluasi triwulan.",
      "Saat menelusuri tren sederhana tanpa membuka tiap modul satu per satu.",
    ],
    outputs: [
      "Rekap kategori pegawai dan status kontrak.",
      "Laporan ringkas yang mudah dipakai untuk rapat atau tindak lanjut.",
      "Sinyal area yang perlu investigasi lebih dalam di modul detail.",
    ],
    glossary: [
      { term: "Penelusuran rinci", definition: "Kemampuan menurunkan ringkasan menjadi rincian kategori atau kelompok tertentu." },
      { term: "Rekap", definition: "Ringkasan angka atau distribusi dari data HR." },
      { term: "Status kontrak", definition: "Kondisi hubungan kerja pegawai berdasarkan kontrak terakhirnya." },
      { term: "Pemantauan periodik", definition: "Kegiatan membaca laporan secara rutin untuk menjaga kontrol operasional." },
    ],
  }),
  "/org/hr/attendance-insights": buildGuide({
    badge: "Operasional",
    title: "Panduan Analitik Kehadiran",
    summary:
      "Halaman ini fokus pada pola hadir, keterlambatan, dan status absensi yang berpengaruh ke disiplin kerja dan evaluasi harian HR.",
    focusPoints: [
      "Membaca tren hadir, telat, dan anomali absensi.",
      "Mengidentifikasi unit atau pegawai yang membutuhkan perhatian lebih.",
      "Menyiapkan data tindak lanjut ke kebijakan keterlambatan atau laporan kehadiran.",
    ],
    useCases: [
      "Saat HR memantau disiplin kehadiran harian atau mingguan.",
      "Saat ingin menilai apakah kebijakan jam kerja dan keterlambatan sudah efektif.",
      "Saat perlu mengekspor data analitik sederhana ke pemangku kepentingan.",
    ],
    outputs: [
      "Ringkasan status kehadiran dan keterlambatan.",
      "Daftar data absensi yang bisa difilter atau diekspor.",
      "Dasar tindak lanjut ke pengaturan keterlambatan atau rekap kehadiran.",
    ],
    glossary: [
      { term: "Insight kehadiran", definition: "Temuan ringkas dari data absensi yang membantu keputusan operasional." },
      { term: "Status absensi", definition: "Label hasil kehadiran seperti hadir, telat, izin, atau absen." },
      { term: "Anomali", definition: "Pola atau kejadian yang menyimpang dari perilaku kehadiran normal." },
      { term: "Ekspor CSV", definition: "Unduhan data dalam format tabel yang dapat dibuka di spreadsheet." },
    ],
  }),
  "/org/hr/settings": buildGuide({
    badge: "Administrasi",
    title: "Panduan Pengaturan HR",
    summary:
      "Halaman ini mengelola tata kelola workspace HR tenant: akses, kebutuhan modul, dan preferensi yang mempengaruhi seluruh workspace HR.",
    focusPoints: [
      "Memeriksa otomatisasi akses workspace HR.",
      "Membaca matriks kebutuhan rute dan status kesiapan tenant.",
      "Mengelola preferensi workspace seperti reset sidebar HR.",
    ],
    useCases: [
      "Saat admin perlu meninjau apakah modul HR sudah aktif dan sesuai kebutuhan tenant.",
      "Saat ingin memeriksa kesiapan fitur `/org/hr` secara keseluruhan.",
      "Saat ingin mengembalikan preferensi workspace ke kondisi default.",
    ],
    outputs: [
      "Ringkasan tata kelola dan kebutuhan rute HR.",
      "Kontrol preferensi workspace.",
      "Arah perbaikan jika ada modul HR yang belum siap atau belum aktif.",
    ],
    glossary: [
      { term: "Workspace HR", definition: "Ruang kerja khusus HR di dalam portal organisasi tenant." },
      { term: "Matriks kebutuhan", definition: "Pemetaan halaman HR beserta status kesiapan atau kebutuhan implementasinya." },
      { term: "Akses otomatis", definition: "Aturan pemberian hak akses workspace berdasarkan role atau kondisi tenant." },
      { term: "Preferensi workspace", definition: "Pengaturan tampilan dan perilaku antarmuka yang berlaku untuk pengguna saat ini." },
    ],
  }),
  "/org/hr/help/faq": buildGuide({
    badge: "Bantuan",
    title: "Panduan FAQ HR",
    summary:
      "Halaman FAQ HR menjawab pertanyaan berulang seputar penggunaan modul HR tenant, sehingga operator dapat menyelesaikan isu umum tanpa membuat tiket baru.",
    focusPoints: [
      "Menyediakan jawaban cepat untuk pertanyaan umum penggunaan workspace HR.",
      "Menurunkan beban tiket dengan dokumentasi layanan mandiri.",
      "Menjadi referensi awal sebelum eskalasi ke dukungan.",
    ],
    useCases: [
      "Saat operator HR atau admin baru belajar memakai workspace HR.",
      "Saat ada pertanyaan umum yang berulang dari tim internal.",
      "Saat perlu rujukan sebelum membuka tiket bantuan.",
    ],
    outputs: [
      "Daftar pertanyaan dan jawaban HR tenant.",
      "Arah ke tiket HR bila isu tidak selesai lewat FAQ.",
      "Dokumentasi operasional yang bisa dibaca mandiri.",
    ],
    glossary: [
      { term: "FAQ", definition: "Kumpulan pertanyaan yang paling sering diajukan beserta jawabannya." },
      { term: "Layanan mandiri", definition: "Penyelesaian mandiri tanpa bantuan langsung dari tim dukungan." },
      { term: "Eskalasi", definition: "Menaikkan isu ke level bantuan yang lebih tinggi karena tidak selesai di level awal." },
      { term: "Rujukan operasional", definition: "Dokumentasi yang dipakai sebagai acuan kerja harian." },
    ],
  }),
  "/org/hr/help/tickets": buildGuide({
    badge: "Bantuan",
    title: "Panduan Tiket HR",
    summary:
      "Halaman tiket HR dipakai untuk mencatat, melacak, dan menindaklanjuti permintaan bantuan atau masalah operasional yang berkaitan dengan HR tenant.",
    focusPoints: [
      "Mencatat tiket baru dengan kategori dan prioritas yang jelas.",
      "Melacak SLA, penugasan, dan histori tindak lanjut tiket.",
      "Memastikan isu HR tidak hilang dari radar operasional.",
    ],
    useCases: [
      "Saat ada kendala data pegawai, kontrak, cuti, ESS, atau alur kerja HR lain.",
      "Saat butuh eskalasi isu lintas tim yang memerlukan jejak tindak lanjut.",
      "Saat memantau beban dukungan dan tiket yang belum selesai.",
    ],
    outputs: [
      "Daftar tiket aktif dan riwayatnya.",
      "Informasi prioritas, SLA, dan penanggung jawab tiket.",
      "Dokumentasi penyelesaian masalah yang bisa diaudit.",
    ],
    glossary: [
      { term: "SLA", definition: "Batas waktu layanan yang diharapkan untuk merespons atau menyelesaikan tiket." },
      { term: "Prioritas", definition: "Tingkat urgensi tiket, misalnya tinggi, normal, atau rendah." },
      { term: "Assignment", definition: "Penunjukan siapa yang bertanggung jawab menindak tiket." },
      { term: "Histori tiket", definition: "Jejak perubahan status, komentar, dan tindakan pada tiket." },
    ],
  }),
  "/org/hr/help/error-logs": buildGuide({
    badge: "Bantuan",
    title: "Panduan Log Error HR",
    summary:
      "Halaman log error HR dipakai untuk menelusuri error runtime yang terjadi di workspace HR tenant, sehingga tim bisa cepat triase dan memastikan perbaikan efektif.",
    focusPoints: [
      "Membaca error terbaru berdasarkan konteks halaman dan rute.",
      "Memisahkan error aktif dari noise lama atau yang sudah diselesaikan.",
      "Mengekspor atau menyalin referensi error untuk investigasi lanjutan.",
    ],
    useCases: [
      "Saat suatu halaman HR gagal memuat atau menampilkan perilaku aneh.",
      "Saat perlu mengecek apakah error tertentu masih muncul setelah perbaikan.",
      "Saat membuat rangkuman isu teknis untuk tim pengembang atau dukungan.",
    ],
    outputs: [
      "Daftar error terfilter khusus konteks HR.",
      "Referensi error yang bisa ditindaklanjuti.",
      "Ringkasan status error per rute atau periode waktu.",
    ],
    glossary: [
      { term: "Error reference", definition: "ID atau referensi yang memudahkan penelusuran error tertentu." },
      { term: "Context", definition: "Label teknis yang menunjukkan modul atau proses tempat error terjadi." },
      { term: "Triase", definition: "Proses memilah error mana yang kritis, mana yang bisa ditunda." },
      { term: "Runtime", definition: "Kondisi saat aplikasi sedang berjalan dan dipakai pengguna." },
    ],
  }),
  "/org/hr/employee-status": buildGuide({
    badge: "Pegawai",
    title: "Panduan Status Kepegawaian",
    summary:
      "Halaman ini menyorot status kerja pegawai dan transisinya, sehingga HR bisa memahami lifecycle pegawai secara administratif dan operasional.",
    focusPoints: [
      "Mengelompokkan pegawai berdasarkan status kerja terkini.",
      "Membaca dampak status terhadap data aktif/nonaktif tenant.",
      "Menjadi penghubung ke orientasi, offboarding, dan kontrak.",
    ],
    useCases: [
      "Saat HR butuh daftar pegawai per status kerja.",
      "Saat ada perubahan status akibat kontrak, mutasi, atau proses keluar.",
      "Saat membuat rekap komposisi tenaga kerja tenant.",
    ],
    outputs: [
      "Daftar pegawai menurut status kerja.",
      "Indikasi status yang dominan atau perlu perhatian.",
      "Bahan awal untuk tindakan lifecycle berikutnya.",
    ],
    glossary: [
      { term: "Status kerja", definition: "Kondisi administratif pegawai seperti aktif, nonaktif, probation, atau transisi." },
      { term: "Lifecycle pegawai", definition: "Perjalanan pegawai dari masuk, aktif bekerja, hingga keluar." },
      { term: "Transisi", definition: "Perubahan status yang belum final, misalnya menunggu aktivasi atau offboarding." },
      { term: "Komposisi tenaga kerja", definition: "Sebaran pegawai berdasarkan tipe atau status kerja." },
    ],
  }),
  "/org/hr/job-history": buildGuide({
    badge: "Pegawai",
    title: "Panduan Riwayat Jabatan",
    summary:
      "Halaman ini menyimpan kronologi perubahan jabatan pegawai. Riwayat ini penting untuk audit internal, promosi, mutasi, dan evaluasi perjalanan karier.",
    focusPoints: [
      "Membaca timeline mutasi atau promosi per pegawai.",
      "Menjaga jejak perubahan jabatan tetap terdokumentasi.",
      "Menghubungkan perubahan jabatan dengan struktur organisasi yang aktif.",
    ],
    useCases: [
      "Saat HR menelusuri posisi sebelumnya dari seorang pegawai.",
      "Saat perlu menyiapkan dokumen mutasi/promosi atau evaluasi karier.",
      "Saat mengecek tanggal efektif perubahan jabatan.",
    ],
    outputs: [
      "Timeline riwayat jabatan.",
      "Data pendukung untuk mutasi dan promosi.",
      "Jejak historis yang bisa dipakai untuk audit atau tinjau karier.",
    ],
    glossary: [
      { term: "Timeline", definition: "Urutan kejadian berdasarkan tanggal atau waktu efektif." },
      { term: "Tanggal efektif", definition: "Tanggal resmi sebuah perubahan mulai berlaku." },
      { term: "Promosi", definition: "Kenaikan jabatan atau tanggung jawab pegawai." },
      { term: "Jejak historis", definition: "Catatan peristiwa masa lalu yang tetap disimpan untuk referensi." },
    ],
  }),
  "/org/hr/offboarding": buildGuide({
    badge: "Operasional",
    title: "Panduan Offboarding",
    summary:
      "Halaman offboarding membantu HR menutup masa kerja pegawai secara tertib, termasuk administrasi keluar, serah terima, dan penonaktifan akses.",
    focusPoints: [
      "Mencatat pegawai yang sedang menjalani proses keluar.",
      "Memastikan artefak exit process tidak terlewat.",
      "Menjaga transisi keluar pegawai tetap terdokumentasi dan bisa diaudit.",
    ],
    useCases: [
      "Saat pegawai resign, kontraknya berakhir, atau dikeluarkan dari tenant.",
      "Saat perlu memastikan akses dan dokumen akhir sudah dituntaskan.",
      "Saat membuat daftar offboarding yang masih terbuka.",
    ],
    outputs: [
      "Daftar proses offboarding dan statusnya.",
      "Kontrol dokumen/serah terima yang perlu diselesaikan.",
      "Jejak operasional akhir masa kerja pegawai.",
    ],
    glossary: [
      { term: "Offboarding", definition: "Rangkaian proses resmi saat pegawai keluar dari organisasi." },
      { term: "Serah terima", definition: "Penyerahan aset, dokumen, atau tanggung jawab sebelum pegawai keluar." },
      { term: "Exit process", definition: "Paket tindakan administratif dan operasional saat hubungan kerja berakhir." },
      { term: "Penonaktifan akses", definition: "Pemutusan hak akses sistem agar akun tidak lagi dipakai." },
    ],
  }),
  "/org/hr/leave-types": buildGuide({
    badge: "Administrasi",
    title: "Panduan Jenis Cuti",
    summary:
      "Halaman ini mendefinisikan jenis cuti yang diakui tenant, sehingga seluruh permohonan dan kuota cuti memakai nomenklatur yang konsisten.",
    focusPoints: [
      "Menentukan katalog jenis cuti yang berlaku untuk tenant.",
      "Menjadi dasar perhitungan kuota dan alur persetujuan cuti.",
      "Mencegah permohonan cuti memakai kategori yang tidak standar.",
    ],
    useCases: [
      "Saat tenant ingin menambah jenis cuti baru.",
      "Saat memeriksa apakah seluruh jenis cuti sudah memiliki aturan yang jelas.",
      "Saat menyelaraskan istilah cuti dengan kebijakan internal organisasi.",
    ],
    outputs: [
      "Daftar jenis cuti aktif.",
      "Dasar untuk kuota cuti dan proses persetujuan.",
      "Terminologi cuti yang konsisten di seluruh alur kerja HR.",
    ],
    glossary: [
      { term: "Jenis cuti", definition: "Kategori izin tidak bekerja, misalnya cuti tahunan, sakit, atau alasan khusus." },
      { term: "Katalog cuti", definition: "Daftar resmi seluruh jenis cuti yang diakui tenant." },
      { term: "Persetujuan cuti", definition: "Proses persetujuan permohonan cuti sesuai hirarki wewenang." },
      { term: "Kebijakan cuti", definition: "Aturan yang menentukan hak, batasan, dan syarat pengambilan cuti." },
    ],
  }),
  "/org/hr/onboarding": buildGuide({
    badge: "Operasional",
    title: "Panduan Orientasi",
    summary:
      "Halaman orientasi dipakai untuk mengawal pegawai baru sejak siap masuk hingga aktif penuh di tenant.",
    focusPoints: [
      "Memantau kesiapan pegawai baru berdasarkan data yang sudah tersedia.",
      "Menjaga agar langkah masuk pegawai tidak ada yang terlewat.",
      "Menghubungkan kandidat, dokumen awal, dan aktivasi pegawai.",
    ],
    useCases: [
      "Saat tenant baru merekrut pegawai dan ingin memastikan proses masuk tertib.",
      "Saat butuh daftar pegawai baru dalam 90 hari terakhir.",
      "Saat meninjau orientasi yang masih belum tuntas.",
    ],
    outputs: [
      "Daftar pegawai baru dan status orientasi.",
      "Sinyal pegawai yang perlu aktivasi atau kelengkapan tambahan.",
      "Konteks awal sebelum pegawai masuk ke alur kerja reguler.",
    ],
    glossary: [
      { term: "Orientasi", definition: "Rangkaian proses orientasi (onboarding) dan aktivasi pegawai baru." },
      { term: "Aktivasi", definition: "Tindakan menjadikan pegawai siap bekerja dengan akses dan data yang benar." },
      { term: "Pegawai baru", definition: "Pegawai yang baru masuk dalam periode pemantauan tenant." },
      { term: "Kelengkapan awal", definition: "Dokumen dan data dasar yang wajib tersedia sebelum pegawai aktif penuh." },
    ],
  }),
  "/org/hr/work-hours": buildGuide({
    badge: "Operasional",
    title: "Panduan Jam Kerja",
    summary:
      "Halaman jam kerja menentukan acuan waktu kerja tenant. Konfigurasi di sini mempengaruhi absensi, keterlambatan, dan sebagian laporan operasional.",
    focusPoints: [
      "Menetapkan jam masuk, pulang, dan aturan dasar kehadiran.",
      "Menyelaraskan pengaturan absensi dengan kebutuhan unit kerja.",
      "Menjadi acuan bagi modul keterlambatan dan pola shift.",
    ],
    useCases: [
      "Saat tenant menyiapkan aturan kerja reguler per unit.",
      "Saat ada perubahan kebijakan jam kerja.",
      "Saat HR ingin memastikan perhitungan kehadiran memakai acuan yang benar.",
    ],
    outputs: [
      "Konfigurasi jam kerja tenant.",
      "Dasar data untuk analitik kehadiran dan keterlambatan.",
      "Rujukan untuk modul shift dan kebijakan absensi.",
    ],
    glossary: [
      { term: "Jam kerja", definition: "Rentang waktu resmi pegawai bekerja dalam satu hari atau pola tertentu." },
      { term: "Acuan", definition: "Konfigurasi dasar yang dipakai modul lain sebagai acuan." },
      { term: "Absensi", definition: "Data kehadiran pegawai terhadap jam kerja yang ditentukan." },
      { term: "Unit kerja", definition: "Kelompok organisasi yang mungkin memiliki aturan jam kerja berbeda." },
    ],
  }),
  "/org/hr/shifts": buildGuide({
    badge: "Operasional",
    title: "Panduan Pola Shift",
    summary:
      "Halaman shift dipakai bila tenant memiliki jadwal kerja non-reguler. Di sini HR mengatur pola giliran kerja agar kehadiran tetap bisa dihitung konsisten.",
    focusPoints: [
      "Menyusun pola kerja bergiliran per tim atau unit.",
      "Mengurangi konflik jadwal yang bisa memengaruhi kehadiran.",
      "Menyediakan rujukan shift untuk analitik kehadiran.",
    ],
    useCases: [
      "Saat tenant memiliki kerja pagi-sore-malam atau rotasi mingguan.",
      "Saat HR perlu memvalidasi distribusi shift antar tim.",
      "Saat membaca dampak jadwal terhadap keterlambatan atau lembur.",
    ],
    outputs: [
      "Daftar pola shift aktif.",
      "Konteks jadwal untuk penghitungan absensi.",
      "Dasar koordinasi perubahan shift dengan unit kerja terkait.",
    ],
    glossary: [
      { term: "Shift", definition: "Pola jam kerja bergiliran yang berbeda dari jam kerja reguler tunggal." },
      { term: "Rotasi", definition: "Perputaran jadwal kerja antar pegawai atau tim." },
      { term: "Konflik jadwal", definition: "Benturan penugasan waktu kerja yang membuat data kehadiran tidak valid." },
      { term: "Pola aktif", definition: "Shift yang saat ini dipakai dalam operasional tenant." },
    ],
  }),
  "/org/hr/late-settings": buildGuide({
    badge: "Operasional",
    title: "Panduan Pengaturan Keterlambatan",
    summary:
      "Halaman ini mendefinisikan aturan keterlambatan. Pengaturan ini penting agar analisis kehadiran dan tindak lanjut disiplin kerja konsisten.",
    focusPoints: [
      "Menetapkan toleransi keterlambatan yang diakui tenant.",
      "Menyelaraskan aturan telat dengan jam kerja dan shift.",
      "Menentukan dasar tindakan lanjutan bila pelanggaran berulang.",
    ],
    useCases: [
      "Saat tenant menyesuaikan toleransi keterlambatan.",
      "Saat HR ingin membaca dampak aturan telat terhadap laporan kehadiran.",
      "Saat menyusun kebijakan disiplin kerja yang lebih terukur.",
    ],
    outputs: [
      "Aturan keterlambatan tenant.",
      "Konteks untuk analitik kehadiran dan laporan disiplin.",
      "Acuan kebijakan bagi operator yang menangani absensi.",
    ],
    glossary: [
      { term: "Toleransi telat", definition: "Batas waktu keterlambatan yang masih dianggap dapat diterima." },
      { term: "Disiplin kerja", definition: "Kepatuhan pegawai terhadap aturan waktu kerja dan kehadiran." },
      { term: "Pelanggaran berulang", definition: "Keterlambatan yang terjadi berkali-kali sehingga perlu tindak lanjut." },
      { term: "Kebijakan telat", definition: "Aturan tenant yang menjelaskan konsekuensi dan batasan keterlambatan." },
    ],
  }),
  "/org/hr/leave-quota": buildGuide({
    badge: "Administrasi",
    title: "Panduan Kuota Cuti",
    summary:
      "Halaman ini mengelola saldo hak cuti pegawai. Kuota menjadi dasar saat permohonan cuti diajukan dan saat HR meninjau kecukupan hak cuti.",
    focusPoints: [
      "Membaca total hak cuti, terpakai, dan sisa cuti pegawai.",
      "Menjaga kuota sesuai jenis cuti yang berlaku.",
      "Menyediakan data saldo cuti untuk persetujuan dan audit internal.",
    ],
    useCases: [
      "Saat HR ingin memeriksa sisa cuti pegawai tertentu.",
      "Saat perlu melakukan penyesuaian kuota cuti.",
      "Saat memantau apakah saldo cuti tenant masih masuk akal.",
    ],
    outputs: [
      "Saldo kuota cuti per pegawai.",
      "Arah tindak lanjut untuk penyesuaian atau koreksi kuota.",
      "Data dasar untuk memproses permohonan cuti.",
    ],
    glossary: [
      { term: "Kuota cuti", definition: "Jumlah hak cuti yang dimiliki pegawai untuk jenis cuti tertentu." },
      { term: "Saldo cuti", definition: "Sisa hak cuti setelah dikurangi pemakaian." },
      { term: "Penyesuaian kuota", definition: "Perubahan manual atau sistem terhadap hak cuti pegawai." },
      { term: "Hak cuti", definition: "Jatah cuti yang berhak dimiliki pegawai sesuai kebijakan tenant." },
    ],
  }),
  "/org/hr/leave-approval": buildGuide({
    badge: "Administrasi",
    title: "Panduan Persetujuan Cuti",
    summary:
      "Halaman ini dipakai untuk memproses permohonan cuti yang masuk. HR dapat membaca antrian persetujuan, status permohonan, dan keterkaitannya dengan saldo cuti.",
    focusPoints: [
      "Membaca permohonan cuti yang menunggu tindakan.",
      "Menilai permohonan berdasarkan kuota dan jenis cuti.",
      "Menjaga keputusan persetujuan terdokumentasi dengan baik.",
    ],
    useCases: [
      "Saat ada permohonan cuti baru yang perlu diproses.",
      "Saat HR mengecek beban antrian persetujuan.",
      "Saat menelusuri permohonan lama yang ditolak atau disetujui.",
    ],
    outputs: [
      "Daftar antrian persetujuan cuti.",
      "Keputusan disetujui/ditolak yang tercatat.",
      "Jejak proses yang bisa dirujuk kembali bila ada sengketa.",
    ],
    glossary: [
      { term: "Persetujuan", definition: "Keputusan menyetujui atau menolak permohonan sesuai aturan yang berlaku." },
      { term: "Antrian", definition: "Daftar permohonan yang masih menunggu tindakan." },
      { term: "Permohonan", definition: "Pengajuan resmi yang dibuat pegawai atau operator untuk suatu kebutuhan." },
      { term: "Penolakan", definition: "Keputusan menolak permohonan dengan alasan tertentu." },
    ],
  }),
  "/org/hr/mutation-approval": buildGuide({
    badge: "Pegawai",
    title: "Panduan Persetujuan Mutasi",
    summary:
      "Halaman ini dipakai untuk memproses pengajuan mutasi dan perubahan data pegawai dari kanal pegawai, tetapi tetap memakai alur kerja tenant yang sama.",
    focusPoints: [
      "Membaca usulan mutasi atau perubahan data yang masih menunggu tindakan.",
      "Memastikan keputusan mutasi tetap selaras dengan struktur organisasi dan data pegawai aktif.",
      "Menyelesaikan persetujuan mutasi dari workspace HR tanpa membuat jalur proses baru.",
    ],
    useCases: [
      "Saat ada usulan perpindahan unit atau perubahan profil pegawai yang perlu diverifikasi HR.",
      "Saat HR ingin memeriksa efek mutasi terhadap jabatan, unit, atau offboarding.",
      "Saat penyetuju HR memproses permintaan mutasi dari konteks HR, bukan menu organisasi umum.",
    ],
    outputs: [
      "Daftar pengajuan mutasi dan perubahan data pegawai.",
      "Keputusan persetujuan atau penolakan yang terdokumentasi.",
      "Jejak proses yang bisa dihubungkan ke riwayat jabatan dan lifecycle pegawai.",
    ],
    glossary: [
      { term: "Mutasi", definition: "Perubahan penempatan, unit, jabatan, atau data yang diajukan pegawai dan butuh persetujuan." },
      { term: "Perubahan data", definition: "Usulan pembaruan profil atau identitas pegawai yang perlu diverifikasi." },
      { term: "Persetujuan mutasi", definition: "Keputusan menerima atau menolak usulan perubahan pegawai." },
      { term: "Alur kerja tunggal", definition: "Jalur proses yang sama walau dibuka dari /org maupun /org/hr." },
    ],
    watchouts: [
      "Halaman ini memakai engine mutasi organisasi yang sama, jadi setiap keputusan akan memengaruhi data tenant inti.",
      "Mutasi yang berdampak ke jabatan atau unit sebaiknya selalu dicek ke struktur organisasi sebelum disetujui.",
      "Offboarding yang berasal dari mutation request tetap perlu dicek ke proses keluar pegawai dan akses sistem.",
    ],
    relatedRoutes: [
      { label: "Riwayat Jabatan", path: "/org/hr/job-history", note: "Telusuri dampak keputusan ke histori mutasi pegawai." },
      { label: "Struktur Organisasi", path: "/org/hr/structure", note: "Validasi unit atau penempatan tujuan." },
      { label: "Proses Keluar Pegawai", path: "/org/hr/offboarding", note: "Cek bila mutasi berujung pada penghentian akses." },
    ],
  }),
  "/org/hr/leave-validity": buildGuide({
    badge: "Administrasi",
    title: "Panduan Masa Berlaku Cuti",
    summary:
      "Halaman ini membantu HR memantau apakah saldo cuti masih valid digunakan atau mendekati masa kedaluwarsa.",
    focusPoints: [
      "Membaca validitas kuota cuti per pegawai.",
      "Mengidentifikasi saldo yang segera habis masa berlakunya.",
      "Menjadi dasar komunikasi ke pegawai atau atasan terkait pemakaian hak cuti.",
    ],
    useCases: [
      "Saat HR memeriksa cuti yang akan kedaluwarsa.",
      "Saat perlu menyiapkan pengingat pemakaian cuti.",
      "Saat mengecek apakah validitas kuota sesuai kebijakan tenant.",
    ],
    outputs: [
      "Daftar kuota cuti berdasarkan masa berlaku.",
      "Sinyal kuota yang segera tidak valid.",
      "Dasar tindak lanjut pengingat atau koreksi administrasi cuti.",
    ],
    glossary: [
      { term: "Masa berlaku", definition: "Periode saat kuota cuti masih sah untuk dipakai." },
      { term: "Kedaluwarsa", definition: "Kondisi saat kuota tidak lagi bisa digunakan setelah melewati batas waktunya." },
      { term: "Validitas", definition: "Status apakah suatu kuota masih bisa dipakai atau tidak." },
      { term: "Pengingat cuti", definition: "Notifikasi atau tindak lanjut agar hak cuti tidak terbuang." },
    ],
  }),
  "/org/hr/kpi": buildGuide({
    badge: "Kinerja",
    title: "Panduan KPI HR",
    summary:
      "Halaman KPI memuat indikator kinerja yang menjadi dasar penilaian pegawai. Ini adalah fondasi sebelum periode evaluasi dan form penilaian dijalankan.",
    focusPoints: [
      "Mendefinisikan indikator yang akan dipakai untuk evaluasi.",
      "Menyelaraskan KPI dengan kebutuhan organisasi tenant.",
      "Menjaga agar evaluasi memakai metrik yang jelas dan dapat dijelaskan.",
    ],
    useCases: [
      "Saat tenant menyusun indikator kinerja baru.",
      "Saat HR meninjau apakah indikator masih relevan.",
      "Saat menyiapkan acuan sebelum membuat run evaluasi.",
    ],
    outputs: [
      "Daftar KPI aktif tenant.",
      "Konteks penilaian untuk periode evaluasi.",
      "Dasar scoring di modul hasil evaluasi.",
    ],
    glossary: [
      { term: "KPI", definition: "Indikator utama yang dipakai untuk menilai performa kerja." },
      { term: "Bobot", definition: "Nilai proporsional yang menentukan seberapa besar pengaruh suatu indikator." },
      { term: "Baseline kinerja", definition: "Susunan indikator awal yang dipakai sebagai standar evaluasi." },
      { term: "Scoring", definition: "Pemberian nilai terhadap hasil kerja berdasarkan KPI." },
    ],
  }),
  "/org/hr/performance-periods": buildGuide({
    badge: "Kinerja",
    title: "Panduan Periode Penilaian",
    summary:
      "Halaman ini mengatur siklus waktu evaluasi kinerja. Periode menentukan kapan penilaian dibuka, diproses, dan ditutup.",
    focusPoints: [
      "Membuka dan menata rentang waktu evaluasi.",
      "Menyelaraskan periode dengan kalender kerja tenant.",
      "Menjadi acuan utama saat membuat run hasil evaluasi.",
    ],
    useCases: [
      "Saat tenant ingin memulai periode evaluasi baru.",
      "Saat HR meninjau periode mana yang masih aktif atau draf.",
      "Saat perlu memastikan run evaluasi memakai periode yang benar.",
    ],
    outputs: [
      "Daftar periode penilaian dengan statusnya.",
      "Penanda periode aktif untuk modul evaluasi.",
      "Konteks waktu bagi form dan ulasan 360.",
    ],
    glossary: [
      { term: "Periode evaluasi", definition: "Rentang waktu resmi yang dipakai untuk proses penilaian kinerja." },
      { term: "Aktif", definition: "Status periode yang sedang berlaku atau bisa dipakai." },
      { term: "Draf", definition: "Konfigurasi yang belum dirilis penuh untuk dipakai proses akhir." },
      { term: "Siklus kinerja", definition: "Irama periodik tenant dalam melakukan penilaian performa." },
    ],
  }),
  "/org/hr/performance-forms": buildGuide({
    badge: "Kinerja",
    title: "Panduan Form Penilaian",
    summary:
      "Halaman ini menyusun templat form penilaian. Form akan menentukan struktur pertanyaan dan komponen penilaian saat evaluasi dijalankan.",
    focusPoints: [
      "Menyimpan templat form yang dipakai tenant.",
      "Menjaga agar penilaian memakai struktur yang seragam.",
      "Menghubungkan form dengan KPI dan periode evaluasi.",
    ],
    useCases: [
      "Saat HR membuat form penilaian baru.",
      "Saat tenant menyesuaikan komponen ulasan untuk periode tertentu.",
      "Saat mengecek form mana yang akan dipakai oleh run evaluasi.",
    ],
    outputs: [
      "Daftar form penilaian aktif atau draf.",
      "Struktur pertanyaan/komponen yang siap dipakai evaluasi.",
      "Acuan form bagi scoring dan ulasan 360.",
    ],
    glossary: [
      { term: "Form penilaian", definition: "Template pertanyaan atau komponen yang dipakai untuk mengevaluasi performa." },
      { term: "Templat aktif", definition: "Form yang saat ini dipilih untuk menjadi acuan proses penilaian." },
      { term: "Komponen penilaian", definition: "Bagian dalam form yang mewakili aspek tertentu dari kinerja." },
      { term: "Standarisasi", definition: "Penyamaan struktur penilaian agar adil dan mudah dibandingkan." },
    ],
  }),
  "/org/hr/review-360": buildGuide({
    badge: "Kinerja",
    title: "Panduan Ulasan 360",
    summary:
      "Halaman ini mengatur masukan dari banyak arah, misalnya atasan, rekan, atau diri sendiri. Fitur ini memperkaya hasil evaluasi kinerja tenant.",
    focusPoints: [
      "Menyiapkan acuan ulasan 360 yang akan dipakai tenant.",
      "Membaca apakah penilaian multi-sumber sudah siap dijalankan.",
      "Menjaga agar masukan kinerja tidak hanya datang dari satu sisi.",
    ],
    useCases: [
      "Saat tenant ingin menambahkan ulasan rekan atau penilaian diri.",
      "Saat HR memeriksa kesiapan evaluasi 360 sebelum membuat run.",
      "Saat menyelaraskan proses feedback dengan budaya organisasi.",
    ],
    outputs: [
      "Konfigurasi ulasan 360 aktif.",
      "Status kesiapan umpan balik multi-sumber.",
      "Dasar tambahan untuk scoring evaluasi.",
    ],
    glossary: [
      { term: "Ulasan 360", definition: "Pendekatan evaluasi yang mengumpulkan masukan dari beberapa perspektif." },
      { term: "Ulasan rekan", definition: "Penilaian dari rekan kerja setingkat." },
      { term: "Penilaian diri", definition: "Penilaian yang dilakukan pegawai terhadap dirinya sendiri." },
      { term: "Multi-sumber", definition: "Masukan yang berasal dari lebih dari satu pihak penilai." },
    ],
  }),
  "/org/hr/evaluation-results": buildGuide({
    badge: "Kinerja",
    title: "Panduan Hasil Evaluasi",
    summary:
      "Halaman ini adalah pusat output evaluasi kinerja tenant. Di sini admin HR melihat run, hasil per pegawai, status publikasi, dan histori run evaluasi.",
    focusPoints: [
      "Membuat, me-refresh, menskor, mempublikasikan, dan mengarsipkan run evaluasi.",
      "Membaca distribusi skor, cohort, dan kesiapan publikasi.",
      "Menelusuri histori run agar keputusan kinerja tetap bisa diaudit.",
    ],
    useCases: [
      "Saat tenant ingin menjalankan siklus evaluasi dari draf sampai dipublikasikan.",
      "Saat HR membandingkan run aktif dengan run yang diarsipkan.",
      "Saat perlu melihat skor dan status hasil evaluasi per pegawai.",
    ],
    outputs: [
      "Ringkasan run evaluasi terbaru atau yang dipilih.",
      "Daftar hasil penilaian per pegawai.",
      "Histori run beserta status draf, dipublikasikan, atau diarsipkan.",
    ],
    glossary: [
      { term: "Run evaluasi", definition: "Satu paket eksekusi hasil penilaian untuk periode dan cohort tertentu." },
      { term: "Cohort", definition: "Kelompok pegawai yang dimasukkan ke run evaluasi yang sama." },
      { term: "Publikasi", definition: "Tahap saat hasil dianggap final dan siap dipakai sebagai output resmi." },
      { term: "Arsip", definition: "Status penyimpanan run lama agar tetap bisa dibaca tanpa menjadi run aktif." },
    ],
    watchouts: [
      "Run yang dipublikasikan sudah dianggap output resmi; koreksi sebaiknya dilakukan melalui run baru atau prosedur yang jelas.",
      "Jangan publikasikan jika acuan KPI, periode, atau form masih berubah-ubah karena hasil akan sulit dijelaskan.",
      "Riwayat run perlu dibaca bersama statusnya; run terbaru bukan selalu run yang paling relevan untuk audit.",
    ],
    relatedRoutes: [
      { label: "KPI", path: "/org/hr/kpi", note: "Pastikan indikator yang dipakai evaluasi memang final." },
      { label: "Periode Penilaian", path: "/org/hr/performance-periods", note: "Cek bahwa run memakai periode yang benar." },
      { label: "Form Penilaian", path: "/org/hr/performance-forms", note: "Validasi struktur penilaian sebelum generate run." },
      { label: "Ulasan 360", path: "/org/hr/review-360", note: "Pastikan bobot dan kanal umpan balik siap bila dipakai." },
    ],
  }),
  "/org/hr/training-data": buildGuide({
    badge: "Pengembangan",
    title: "Panduan Data Pelatihan",
    summary:
      "Halaman ini menyimpan katalog program pelatihan tenant. Data di sini membantu HR menata roadmap pengembangan pegawai.",
    focusPoints: [
      "Menata daftar program pelatihan yang tersedia.",
      "Menyediakan acuan pembelajaran bagi tenant.",
      "Menghubungkan pelatihan dengan kebutuhan skill atau sertifikasi.",
    ],
    useCases: [
      "Saat HR menyusun kurikulum pelatihan internal.",
      "Saat ingin melihat program mana yang sudah atau belum tersedia.",
      "Saat menyiapkan rekomendasi pengembangan pegawai.",
    ],
    outputs: [
      "Daftar program pelatihan tenant.",
      "Arah untuk pengembangan kompetensi.",
      "Konteks penghubung ke skill matrix dan sertifikasi.",
    ],
    glossary: [
      { term: "Program pelatihan", definition: "Kegiatan pembelajaran formal yang disediakan tenant." },
      { term: "Roadmap pembelajaran", definition: "Urutan atau rencana program belajar untuk meningkatkan kompetensi." },
      { term: "Kompetensi", definition: "Kemampuan yang diharapkan dimiliki pegawai untuk menjalankan pekerjaannya." },
      { term: "Katalog pelatihan", definition: "Daftar resmi program pelatihan yang tersedia." },
    ],
  }),
  "/org/hr/certifications": buildGuide({
    badge: "Pengembangan",
    title: "Panduan Sertifikasi",
    summary:
      "Halaman sertifikasi mendefinisikan kebutuhan sertifikasi formal tenant. Modul ini membantu HR memetakan kewajiban sertifikasi terhadap kompetensi pegawai.",
    focusPoints: [
      "Menyusun aturan sertifikasi yang relevan untuk tenant.",
      "Menjadi acuan validasi kompetensi formal.",
      "Menghubungkan kebutuhan sertifikasi dengan pelatihan dan skill matrix.",
    ],
    useCases: [
      "Saat tenant wajib melacak sertifikasi profesi tertentu.",
      "Saat HR memeriksa kepatuhan pegawai terhadap sertifikasi wajib.",
      "Saat menyusun rencana pengembangan kompetensi berbasis sertifikasi.",
    ],
    outputs: [
      "Daftar aturan atau kebutuhan sertifikasi.",
      "Acuan formal untuk pengembangan dan kepatuhan kompetensi.",
      "Hubungan yang jelas antara sertifikasi dan pelatihan.",
    ],
    glossary: [
      { term: "Sertifikasi", definition: "Pengakuan formal bahwa seseorang memenuhi standar kompetensi tertentu." },
      { term: "Kepatuhan kompetensi", definition: "Kesesuaian pegawai terhadap standar keahlian yang diwajibkan." },
      { term: "Rule sertifikasi", definition: "Aturan tenant yang menentukan siapa memerlukan sertifikasi tertentu." },
      { term: "Validasi formal", definition: "Pembuktian kompetensi melalui standar atau lembaga resmi." },
    ],
  }),
  "/org/hr/skill-matrix": buildGuide({
    badge: "Pengembangan",
    title: "Panduan Skill Matrix",
    summary:
      "Halaman skill matrix memetakan keterampilan yang dibutuhkan tenant dan tingkat kecakapan yang diharapkan, sehingga pengembangan pegawai lebih terarah.",
    focusPoints: [
      "Memetakan skill inti per area atau per kategori kerja.",
      "Membaca gap kompetensi yang perlu ditutup.",
      "Menghubungkan pengembangan pegawai dengan pelatihan dan sertifikasi.",
    ],
    useCases: [
      "Saat HR ingin melihat kebutuhan skill tenant secara terstruktur.",
      "Saat menyusun program pelatihan berbasis gap kompetensi.",
      "Saat meninjau posisi atau tim yang membutuhkan penguatan skill tertentu.",
    ],
    outputs: [
      "Daftar skill dan level yang dibutuhkan.",
      "Konteks gap kompetensi tenant.",
      "Arah program pengembangan yang lebih presisi.",
    ],
    glossary: [
      { term: "Skill matrix", definition: "Peta keterampilan dan level penguasaan yang dibutuhkan organisasi." },
      { term: "Gap kompetensi", definition: "Selisih antara skill yang dibutuhkan dan skill yang tersedia." },
      { term: "Level kecakapan", definition: "Tingkat penguasaan suatu skill, misalnya dasar, menengah, atau mahir." },
      { term: "Pengembangan presisi", definition: "Perencanaan pelatihan yang didasarkan pada gap yang nyata." },
    ],
  }),
  "/org/hr/document-templates": buildGuide({
    badge: "Administrasi",
    title: "Panduan Templat Dokumen",
    summary:
      "Halaman ini menyimpan pola templat dokumen HR agar proses administrasi tenant lebih cepat, seragam, dan mudah diregenerasi.",
    focusPoints: [
      "Menyusun templat surat atau dokumen berulang.",
      "Menjaga konsistensi format administrasi HR tenant.",
      "Memanfaatkan variabel dinamis agar dokumen mudah dipersonalisasi.",
    ],
    useCases: [
      "Saat HR sering menerbitkan surat dengan struktur serupa.",
      "Saat ingin mempercepat proses pembuatan dokumen pegawai.",
      "Saat menjaga standar format dokumen tetap konsisten lintas admin.",
    ],
    outputs: [
      "Daftar templat dokumen yang bisa dipakai ulang.",
      "Templat siap pratinjau dengan variabel dinamis.",
      "Efisiensi kerja administratif untuk surat dan dokumen rutin.",
    ],
    glossary: [
      { term: "Templat", definition: "Pola dokumen yang bisa dipakai ulang tanpa menyusun dari nol." },
      { term: "Variabel dinamis", definition: "Placeholder yang akan diganti dengan data aktual saat dokumen digenerate." },
      { term: "Pratinjau", definition: "Tampilan pratinjau sebelum templat dipakai atau diunduh." },
      { term: "Standardisasi format", definition: "Penyamaan bentuk dokumen agar seragam di seluruh tenant." },
    ],
  }),
  "/org/hr/approval-hierarchy": buildGuide({
    badge: "Administrasi",
    title: "Panduan Hierarki Persetujuan",
    summary:
      "Halaman ini menentukan susunan persetujuan untuk proses HR seperti cuti atau permohonan tertentu. Hierarki yang jelas mencegah persetujuan tersendat atau salah jalur.",
    focusPoints: [
      "Menyusun level penyetuju per tipe proses.",
      "Menjaga agar alur persetujuan konsisten dengan struktur tenant.",
      "Memastikan permohonan HR melewati jalur otorisasi yang benar.",
    ],
    useCases: [
      "Saat tenant perlu menambah level persetujuan baru.",
      "Saat audit menemukan persetujuan terlalu pendek atau terlalu panjang.",
      "Saat ingin menyelaraskan alur persetujuan dengan struktur organisasi.",
    ],
    outputs: [
      "Daftar tipe persetujuan dan level penyetuju-nya.",
      "Acuan alur persetujuan untuk modul HR terkait.",
      "Jejak definisi otorisasi yang lebih mudah diaudit.",
    ],
    glossary: [
      { term: "Penyetuju", definition: "Pihak yang berwenang memberi keputusan pada suatu permohonan." },
      { term: "Level persetujuan", definition: "Urutan tahapan persetujuan dalam sebuah alur kerja." },
      { term: "Otorisasi", definition: "Hak resmi untuk menyetujui, menolak, atau meninjau suatu tindakan." },
      { term: "Alur persetujuan", definition: "Alur langkah yang harus dilewati permohonan sebelum final." },
    ],
    watchouts: [
      "Level persetujuan yang terlalu panjang memperlambat SLA dan membuat permohonan tertahan tanpa nilai tambah.",
      "Peran penyetuju harus realistis dengan struktur tenant; jangan buat hierarki yang tidak punya pemilik nyata.",
      "Perubahan alur persetujuan bisa berdampak ke cuti, WFH, lembur, dan proses HR lain secara bersamaan.",
    ],
    relatedRoutes: [
      { label: "Persetujuan Cuti", path: "/org/hr/leave-approval", note: "Validasi apakah alur cuti memakai hierarki yang sesuai." },
      { label: "Tiket HR", path: "/org/hr/help/tickets", note: "Gunakan jika persetujuan tersendat atau butuh eskalasi kebijakan." },
    ],
  }),
  "/org/hr/recruitment/jobs": buildGuide({
    badge: "Rekrutmen",
    title: "Panduan Lowongan Rekrutmen",
    summary:
      "Halaman ini menyimpan daftar lowongan atau posisi yang sedang dibuka tenant. Ini adalah titik awal pipeline ATS di workspace HR.",
    focusPoints: [
      "Mencatat lowongan aktif dan status pembukaannya.",
      "Menjadi sumber referensi kandidat dan wawancara.",
      "Membantu HR membaca kebutuhan tenaga kerja baru tenant.",
    ],
    useCases: [
      "Saat tenant membuka posisi baru.",
      "Saat HR mengecek lowongan mana yang masih aktif dicari kandidatnya.",
      "Saat menyelaraskan kebutuhan rekrutmen dengan struktur organisasi.",
    ],
    outputs: [
      "Daftar lowongan ATS tenant.",
      "Status pembukaan posisi secara ringkas.",
      "Konteks awal bagi kandidat, wawancara, dan penawaran.",
    ],
    glossary: [
      { term: "ATS", definition: "Applicant Tracking System untuk melacak proses rekrutmen dari lowongan hingga perekrutan." },
      { term: "Lowongan", definition: "Posisi yang sedang dibuka untuk diisi kandidat." },
      { term: "Kebutuhan rekrutmen", definition: "Kebutuhan nyata tenant terhadap pegawai baru." },
      { term: "Pipeline rekrutmen", definition: "Rangkaian tahapan kandidat dari awal sampai diterima." },
    ],
    watchouts: [
      "Lowongan yang tidak jelas statusnya akan membingungkan kandidat dan mengacaukan pipeline ATS.",
      "Judul lowongan sebaiknya konsisten dengan jabatan internal tenant agar orientasi tidak menimbulkan interpretasi ganda.",
      "Menutup lowongan terlalu terlambat membuat kandidat terus masuk ke posisi yang sebenarnya sudah tidak dibutuhkan.",
    ],
    relatedRoutes: [
      { label: "Kandidat", path: "/org/hr/recruitment/candidates", note: "Pantau siapa saja yang masuk ke lowongan ini." },
      { label: "Wawancara", path: "/org/hr/recruitment/interviews", note: "Cek progres kandidat yang sudah lanjut ke wawancara." },
      { label: "Penawaran Kerja", path: "/org/hr/recruitment/offers", note: "Lihat penawaran yang sudah dibuat untuk kandidat terpilih." },
    ],
  }),
  "/org/hr/recruitment/candidates": buildGuide({
    badge: "Rekrutmen",
    title: "Panduan Kandidat Rekrutmen",
    summary:
      "Halaman kandidat adalah pusat daftar pelamar yang sedang diproses. Di sini HR membaca tahapan kandidat dan kesiapan mereka untuk lanjut ke wawancara atau penawaran.",
    focusPoints: [
      "Melacak kandidat yang masuk ke pipeline rekrutmen.",
      "Membaca tahap kandidat dari penyaringan sampai rekrutmen.",
      "Menentukan siapa yang siap diwawancara atau diberi penawaran.",
    ],
    useCases: [
      "Saat HR meninjau pelamar baru.",
      "Saat perlu memfilter kandidat berdasarkan lowongan atau tahap.",
      "Saat kandidat siap dinaikkan ke tahap wawancara atau orientasi.",
    ],
    outputs: [
      "Daftar kandidat dengan tahap dan statusnya.",
      "Arah tindak lanjut ke wawancara atau penawaran.",
      "Jejak rekrutmen per kandidat.",
    ],
    glossary: [
      { term: "Kandidat", definition: "Pelamar atau calon pegawai yang sedang diproses tenant." },
      { term: "Penyaringan", definition: "Tahap awal penyaringan kandidat sebelum tahap lanjut." },
      { term: "Tahap", definition: "Posisi kandidat dalam urutan proses rekrutmen." },
      { term: "Rekrutmen", definition: "Keputusan menerima kandidat menjadi pegawai." },
    ],
    watchouts: [
      "Tahap kandidat harus bergerak maju secara disiplin; tahap yang tertinggal biasanya menandakan proses rekrutmen macet.",
      "Konversi kandidat ke orientasi sebaiknya hanya dilakukan jika email dan status rekrutmen sudah bersih.",
      "Kandidat yang sudah terhubung ke pegawai tidak boleh diperlakukan seperti kandidat baru lagi.",
    ],
    relatedRoutes: [
      { label: "Lowongan", path: "/org/hr/recruitment/jobs", note: "Lihat konteks posisi yang dilamar kandidat." },
      { label: "Wawancara", path: "/org/hr/recruitment/interviews", note: "Naikkan kandidat ke wawancara saat lolos penyaringan." },
      { label: "Orientasi", path: "/org/hr/onboarding", note: "Gunakan setelah kandidat benar-benar direkrut." },
    ],
  }),
  "/org/hr/recruitment/interviews": buildGuide({
    badge: "Rekrutmen",
    title: "Panduan Wawancara Rekrutmen",
    summary:
      "Halaman ini dipakai untuk menjadwalkan dan melacak wawancara kandidat. HR bisa membaca jadwal, hasil, dan kesiapan kandidat menuju tahap berikutnya.",
    focusPoints: [
      "Menjadwalkan wawancara kandidat secara rapi.",
      "Mencatat hasil wawancara dan tindak lanjutnya.",
      "Menjaga pipeline kandidat tetap bergerak sesuai jadwal.",
    ],
    useCases: [
      "Saat tim rekrutmen menyiapkan agenda wawancara.",
      "Saat perlu melihat kandidat yang menunggu wawancara.",
      "Saat menyusun keputusan lanjut atau gugur setelah wawancara.",
    ],
    outputs: [
      "Jadwal wawancara dan statusnya.",
      "Catatan hasil wawancara.",
      "Dasar keputusan untuk penawaran atau penutupan kandidat.",
    ],
    glossary: [
      { term: "Wawancara", definition: "Tahap wawancara untuk menilai kecocokan kandidat." },
      { term: "Penjadwalan", definition: "Pengaturan waktu dan pihak yang terlibat dalam wawancara." },
      { term: "Masukan pewawancara", definition: "Masukan dari pewawancara setelah sesi selesai." },
      { term: "Tindak lanjut", definition: "Langkah berikutnya setelah wawancara, misalnya lanjut penawaran atau berhenti." },
    ],
    watchouts: [
      "Jadwal wawancara tanpa outcome yang jelas akan membuat pipeline ATS penuh data setengah jadi.",
      "Pisahkan kandidat yang belum konfirmasi hadir dengan kandidat yang sudah selesai diwawancara.",
      "Masukan pewawancara perlu cukup jelas agar keputusan penawaran tidak hanya berdasar intuisi.",
    ],
    relatedRoutes: [
      { label: "Kandidat", path: "/org/hr/recruitment/candidates", note: "Kembali ke kandidat jika perlu perbaiki tahap atau data." },
      { label: "Penawaran Kerja", path: "/org/hr/recruitment/offers", note: "Gunakan saat kandidat lolos dan siap diberi penawaran." },
    ],
  }),
  "/org/hr/recruitment/offers": buildGuide({
    badge: "Rekrutmen",
    title: "Panduan Penawaran Kerja",
    summary:
      "Halaman penawaran dipakai setelah kandidat dinilai layak. HR dapat mengelola penawaran kerja sebelum kandidat berpindah ke proses masuk pegawai.",
    focusPoints: [
      "Mencatat penawaran kerja yang dibuat tenant.",
      "Melacak status penawaran apakah diterima, ditolak, atau masih menunggu.",
      "Menjembatani kandidat dengan proses orientasi.",
    ],
    useCases: [
      "Saat tenant siap mengirim penawaran ke kandidat terpilih.",
      "Saat perlu memantau penawaran yang belum dijawab.",
      "Saat penawaran diterima dan kandidat siap dibuatkan proses orientasi.",
    ],
    outputs: [
      "Daftar penawaran dan status respons kandidat.",
      "Arah lanjut ke orientasi untuk kandidat yang diterima.",
      "Jejak negosiasi atau keputusan akhir penawaran.",
    ],
    glossary: [
      { term: "Penawaran", definition: "Penawaran kerja resmi kepada kandidat terpilih." },
      { term: "Diterima", definition: "Status saat kandidat menerima penawaran kerja." },
      { term: "Menunggu jawaban", definition: "Kondisi saat kandidat belum memberikan jawaban final." },
      { term: "Jembatan ke orientasi", definition: "Peralihan proses dari kandidat menjadi calon pegawai aktif." },
    ],
    watchouts: [
      "Penawaran yang menggantung terlalu lama biasanya perlu tindak lanjut aktif atau penutupan eksplisit.",
      "Jangan kirim kandidat ke orientasi sebelum status penawaran benar-benar diterima.",
      "Perubahan kompensasi atau syarat kerja di luar penawaran yang tercatat akan menyulitkan audit rekrutmen.",
    ],
    relatedRoutes: [
      { label: "Kandidat", path: "/org/hr/recruitment/candidates", note: "Lihat asal kandidat dan tahap sebelumnya." },
      { label: "Orientasi", path: "/org/hr/onboarding", note: "Lanjutkan ke proses masuk pegawai jika penawaran diterima." },
    ],
  }),
  "/org/hr/ess/requests": buildGuide({
    badge: "ESS",
    title: "Panduan Pengajuan ESS",
    summary:
      "Halaman ini merangkum pengajuan layanan mandiri karyawan seperti cuti, WFH, fleksibel, dan lembur yang perlu dipantau dari perspektif HR.",
    focusPoints: [
      "Menggabungkan berbagai jenis pengajuan ESS dalam satu tempat.",
      "Membaca pengajuan terbaru dan kategorinya.",
      "Mengarahkan admin HR ke rute pengajuan yang lebih detail bila perlu.",
    ],
    useCases: [
      "Saat HR ingin melihat aktivitas pengajuan pegawai secara menyeluruh.",
      "Saat memantau apakah ada lonjakan tipe pengajuan tertentu.",
      "Saat menentukan pengajuan mana yang perlu dicek di modul absensi/cuti detail.",
    ],
    outputs: [
      "Ringkasan pengajuan ESS terbaru.",
      "Akses cepat ke rute pengajuan cuti dan modul permohonan organisasi.",
      "Gambaran aktivitas layanan mandiri pegawai tenant.",
    ],
    glossary: [
      { term: "ESS", definition: "Employee Self Service, yaitu ruang pengajuan mandiri oleh pegawai." },
      { term: "WFH", definition: "Permohonan bekerja dari rumah sesuai kebijakan tenant." },
      { term: "Lembur", definition: "Pengajuan kerja melebihi jam kerja normal." },
      { term: "Pengajuan gabungan", definition: "Tampilan yang mengumpulkan beberapa tipe permohonan dalam satu layar." },
    ],
    watchouts: [
      "Halaman ini adalah ringkasan pemantauan, bukan tempat menyelesaikan seluruh detail persetujuan satu per satu.",
      "Jika overview ESS dimatikan oleh kebijakan tenant, kosong di halaman ini belum tentu berarti tidak ada pengajuan historis.",
      "Lonjakan pengajuan pada satu kategori biasanya perlu dicek di rute operasional sumbernya, bukan hanya dari ringkasan ini.",
    ],
    relatedRoutes: [
      { label: "Cuti ESS", path: "/org/hr/ess/leave-requests", note: "Masuk ke detail pengajuan cuti dan izin." },
      { label: "Jam Kerja", path: "/org/hr/work-hours", note: "Cek aturan kerja jika banyak pengajuan terkait absensi." },
      { label: "Tiket HR", path: "/org/hr/help/tickets", note: "Buat tiket bila ada pola pengajuan yang menandakan masalah sistem." },
    ],
  }),
  "/org/hr/ess/leave-requests": buildGuide({
    badge: "ESS",
    title: "Panduan Pengajuan Cuti ESS",
    summary:
      "Halaman ini fokus pada permohonan cuti/izin yang datang dari kanal layanan mandiri pegawai dan diproses dalam konteks HR.",
    focusPoints: [
      "Meninjau permohonan cuti yang datang dari kanal ESS.",
      "Mengecek keterkaitan pengajuan dengan kuota dan jenis cuti.",
      "Menjaga proses respons cuti tetap konsisten dengan kebijakan tenant.",
    ],
    useCases: [
      "Saat HR perlu memproses atau memonitor pengajuan cuti pegawai.",
      "Saat ada ketidaksesuaian antara pengajuan dan saldo cuti.",
      "Saat ingin membedakan kanal ESS dari alur persetujuan administratif lain.",
    ],
    outputs: [
      "Daftar pengajuan cuti ESS.",
      "Keputusan dan status tindak lanjut permohonan.",
      "Konteks untuk kuota dan hierarki persetujuan.",
    ],
    glossary: [
      { term: "Cuti ESS", definition: "Permohonan cuti yang dibuat pegawai dari kanal layanan mandiri." },
      { term: "Izin", definition: "Pengajuan ketidakhadiran di luar kategori cuti utama." },
      { term: "Saldo cuti", definition: "Hak cuti tersisa yang dipakai untuk memvalidasi pengajuan." },
      { term: "Kanal ESS", definition: "Jalur permohonan yang diakses langsung oleh pegawai." },
    ],
    watchouts: [
      "Persetujuan cuti dari ESS tetap harus konsisten dengan hierarki persetujuan tenant.",
      "Saldo cuti yang tidak sinkron dapat membuat pengajuan terlihat valid padahal secara kebijakan bermasalah.",
      "Gunakan halaman ini untuk konteks ESS; jika perlu triase administratif menyeluruh, cek persetujuan cuti utama juga.",
    ],
    relatedRoutes: [
      { label: "Kuota Cuti", path: "/org/hr/leave-quota", note: "Validasi sisa hak cuti sebelum persetujuan." },
      { label: "Jenis Cuti", path: "/org/hr/leave-types", note: "Pastikan kategori pengajuan memakai jenis cuti yang benar." },
      { label: "Hierarki Persetujuan", path: "/org/hr/approval-hierarchy", note: "Cek alur otorisasi jika persetujuan tersendat." },
    ],
  }),
  "/org/hr/ess/wfh-requests": buildGuide({
    badge: "ESS",
    title: "Panduan Persetujuan WFH ESS",
    summary:
      "Halaman ini dipakai untuk memproses pengajuan kerja dari rumah yang datang dari kanal pegawai, tetapi tetap memakai mekanisme persetujuan organisasi yang sama.",
    focusPoints: [
      "Membaca antrian permintaan WFH yang masih menunggu persetujuan.",
      "Menilai alasan dan tanggal WFH terhadap kebijakan tenant.",
      "Menjaga HR dapat memproses persetujuan WFH tanpa keluar dari workspace HR.",
    ],
    useCases: [
      "Saat ada pengajuan WFH yang perlu ditriase cepat.",
      "Saat HR menilai apakah pengajuan masih sesuai pola kerja fleksibel tenant.",
      "Saat penyetuju HR ingin menyelesaikan permintaan WFH dari jalur ESS.",
    ],
    outputs: [
      "Daftar pengajuan WFH beserta status terkininya.",
      "Keputusan persetujuan atau penolakan yang tercatat.",
      "Konteks untuk analitik kehadiran dan kebijakan kerja fleksibel.",
    ],
    glossary: [
      { term: "WFH", definition: "Pengajuan bekerja dari rumah sesuai kebijakan tenant." },
      { term: "Antrian WFH", definition: "Daftar permintaan WFH yang masih menunggu tindakan penyetuju." },
      { term: "Persetujuan WFH", definition: "Tindakan menyetujui atau menolak pengajuan kerja dari rumah." },
      { term: "Kerja fleksibel", definition: "Pola kerja tenant yang memberi ruang lokasi kerja non-standar." },
    ],
  }),
  "/org/hr/ess/flexible-attendance": buildGuide({
    badge: "ESS",
    title: "Panduan Persetujuan Absensi Khusus",
    summary:
      "Halaman ini memproses permohonan absensi fleksibel atau non-standar dari pegawai dengan alur kerja organisasi yang sama, tetapi dibuka dari konteks HR.",
    focusPoints: [
      "Membaca permohonan absensi khusus berdasarkan alasan dan tanggal.",
      "Mengecek kesesuaian permohonan dengan aturan kehadiran tenant.",
      "Menjaga tindak lanjut persetujuan tetap konsisten dengan modul absensi utama.",
    ],
    useCases: [
      "Saat pegawai meminta fleksibilitas kehadiran di luar pola normal.",
      "Saat HR perlu membedakan permintaan operasional yang valid dan yang perlu ditolak.",
      "Saat ingin memonitor pola absensi khusus dari satu titik di HR.",
    ],
    outputs: [
      "Daftar permohonan absensi khusus.",
      "Status persetujuan dengan alasan penolakan bila ada.",
      "Konteks kebijakan untuk modul kehadiran tenant.",
    ],
    glossary: [
      { term: "Absensi khusus", definition: "Permohonan kehadiran non-standar yang membutuhkan pengecualian atau validasi." },
      { term: "Permohonan fleksibel", definition: "Permintaan kehadiran dengan alasan operasional tertentu di luar pola normal." },
      { term: "Alasan permohonan", definition: "Kategori atau penjelasan yang menjadi dasar evaluasi permintaan." },
      { term: "Validasi kehadiran", definition: "Pemeriksaan apakah permohonan layak diterima menurut kebijakan tenant." },
    ],
  }),
  "/org/hr/ess/overtime-requests": buildGuide({
    badge: "ESS",
    title: "Panduan Persetujuan Lembur ESS",
    summary:
      "Halaman ini memproses pengajuan lembur pegawai dari kanal layanan mandiri, tetapi tetap memakai permintaan, status, dan riwayat persetujuan yang sama dengan modul organisasi.",
    focusPoints: [
      "Membaca pengajuan lembur berdasarkan nomor, pegawai, dan tanggal kerja.",
      "Mengecek total jam lembur dan alasan pengajuan sebelum persetujuan.",
      "Menyediakan pintu HR untuk menindak lembur tanpa memecah alur persetujuan.",
    ],
    useCases: [
      "Saat HR ingin memproses persetujuan lembur dari workspace HR.",
      "Saat perlu mengecek apakah alasan dan jam lembur masih wajar.",
      "Saat memonitor backlog lembur yang menunggu tindakan penyetuju.",
    ],
    outputs: [
      "Daftar pengajuan lembur yang menunggu dan seluruh histori terkait.",
      "Keputusan persetujuan atau penolakan yang terdokumentasi.",
      "Konteks untuk laporan lembur dan pengaturan overtime tenant.",
    ],
    glossary: [
      { term: "Lembur", definition: "Kerja melebihi jam kerja normal yang harus mendapat persetujuan." },
      { term: "Nomor pengajuan", definition: "Identitas administratif pengajuan lembur untuk penelusuran." },
      { term: "Jam lembur", definition: "Total durasi kerja tambahan yang diminta pegawai." },
      { term: "Persetujuan lembur", definition: "Tindakan menyetujui atau menolak permintaan lembur." },
    ],
  }),
  "/org/hr/ess/attendance": buildGuide({
    badge: "ESS",
    title: "Panduan Kehadiran ESS",
    summary:
      "Halaman ini menampilkan riwayat kehadiran dari perspektif layanan mandiri pegawai. HR dapat memakainya untuk memahami apa yang dilihat oleh pegawai pada kanal ESS.",
    focusPoints: [
      "Membaca tampilan kehadiran pribadi yang dilihat pegawai.",
      "Menautkan riwayat pribadi ke pengaturan jam kerja tenant.",
      "Memvalidasi apakah informasi ESS cukup jelas untuk pegawai.",
    ],
    useCases: [
      "Saat HR mengecek informasi kehadiran yang diterima pegawai.",
      "Saat menelusuri keluhan pegawai soal riwayat hadir.",
      "Saat memastikan sinkronisasi ESS dengan aturan jam kerja tenant.",
    ],
    outputs: [
      "Riwayat kehadiran pribadi versi ESS.",
      "Akses cepat ke pengajuan ESS dan jam kerja.",
      "Konteks layanan pegawai dari sisi layanan mandiri.",
    ],
    glossary: [
      { term: "Riwayat kehadiran", definition: "Catatan hadir pegawai pada periode tertentu." },
      { term: "Tampilan pribadi", definition: "Tampilan data yang berfokus pada pegawai yang sedang login." },
      { term: "Rentang lihat", definition: "Rentang hari ke belakang yang dipakai untuk mengambil riwayat." },
      { term: "Sinkronisasi ESS", definition: "Kesesuaian data yang dilihat pegawai dengan data operasional HR." },
    ],
    watchouts: [
      "Perbedaan kecil antara tampilan ESS dan laporan operasional biasanya berasal dari rentang waktu atau status sinkronisasi, bukan selalu bug.",
      "Keluhan pegawai tentang kehadiran sering lebih mudah direproduksi dari halaman ini dibanding dari dashboard admin.",
      "Jika riwayat pribadi kosong, cek dulu kebijakan ESS dan sumber data absensi sebelum menganggap akses rusak.",
    ],
    relatedRoutes: [
      { label: "Analitik Kehadiran", path: "/org/hr/attendance-insights", note: "Lihat pola agregat dari perspektif admin HR." },
      { label: "Jam Kerja", path: "/org/hr/work-hours", note: "Bandingkan riwayat ESS dengan acuan jam kerja tenant." },
    ],
  }),
  "/org/hr/ess/documents": buildGuide({
    badge: "ESS",
    title: "Panduan Dokumen ESS",
    summary:
      "Halaman dokumen ESS memberi gambaran arsip yang bisa diakses pegawai dari sisi layanan mandiri, terutama dokumen yang relevan dengan kontrak atau arsip pribadi.",
    focusPoints: [
      "Membaca dokumen pribadi yang tersedia untuk pegawai.",
      "Menghubungkan arsip ESS dengan kontrak dan dokumen HR tenant.",
      "Membantu HR memvalidasi apa yang ekspos ke pegawai.",
    ],
    useCases: [
      "Saat pegawai menanyakan kontrak atau dokumen yang bisa diaksesnya.",
      "Saat HR meninjau arsip pribadi yang tampil di ESS.",
      "Saat ingin menyelaraskan dokumen HR internal dengan kanal layanan mandiri.",
    ],
    outputs: [
      "Arsip dokumen pribadi versi ESS.",
      "Akses cepat ke dokumen HR dan kontrak kerja.",
      "Konteks kontrol eksposur dokumen ke pegawai.",
    ],
    glossary: [
      { term: "Arsip pribadi", definition: "Dokumen yang relevan khusus untuk pegawai tertentu." },
      { term: "Eksposur dokumen", definition: "Dokumen apa saja yang diperlihatkan ke pegawai melalui ESS." },
      { term: "Kontrak pribadi", definition: "Kontrak kerja yang terkait langsung dengan pegawai bersangkutan." },
      { term: "Tampilan dokumen ESS", definition: "Tampilan dokumen dari sudut pandang pengguna pegawai." },
    ],
    watchouts: [
      "Dokumen yang aman untuk admin belum tentu aman diekspos ke pegawai melalui ESS.",
      "Ketidaksesuaian antara arsip internal dan arsip ESS biasanya berasal dari pemetaan dokumen, bukan dari file fisiknya.",
      "Jika pegawai tidak melihat dokumen yang diharapkan, cek dulu kategori dan relasi dokumennya.",
    ],
    relatedRoutes: [
      { label: "Dokumen HR", path: "/org/hr/documents", note: "Bandingkan arsip internal dengan yang tampil di ESS." },
      { label: "Kontrak Kerja", path: "/org/hr/contracts", note: "Validasi hubungan kontrak dengan arsip pribadi pegawai." },
    ],
  }),
  "/org/hr/ess/profile": buildGuide({
    badge: "ESS",
    title: "Panduan Profil ESS",
    summary:
      "Halaman profil ESS memotret identitas dan data yang terlihat pegawai tentang dirinya sendiri. HR dapat menggunakannya sebagai tolok ukur kualitas data yang disajikan ke pegawai.",
    focusPoints: [
      "Melihat profil pegawai dari perspektif layanan mandiri.",
      "Menilai kualitas data identitas dasar yang tampil.",
      "Menjadi referensi saat ada komplain data profil dari pegawai.",
    ],
    useCases: [
      "Saat HR memverifikasi data profil yang terlihat oleh pegawai.",
      "Saat ada koreksi identitas atau informasi kontak.",
      "Saat mengecek konsistensi antara master pegawai dan tampilan ESS.",
    ],
    outputs: [
      "Tampilan profil pegawai versi ESS.",
      "Konteks verifikasi data pribadi pegawai.",
      "Arah koreksi ke master pegawai bila data tidak sesuai.",
    ],
    glossary: [
      { term: "Profil ESS", definition: "Ringkasan identitas pegawai yang tampil di kanal layanan mandiri." },
      { term: "Data pribadi", definition: "Informasi dasar seperti nama, email, NIP, atau atribut personal lain." },
      { term: "Kualitas data", definition: "Tingkat akurasi dan kelengkapan data yang tersimpan." },
      { term: "Konsistensi data", definition: "Kesesuaian data antara satu modul dengan modul lain." },
    ],
    watchouts: [
      "Kesalahan kecil pada profil ESS sering merusak kepercayaan pegawai terhadap data HR secara keseluruhan.",
      "Jangan perbaiki tampilan ESS tanpa memastikan sumber data master pegawai juga benar.",
      "Profil yang kosong atau tidak sinkron bisa menandakan masalah mapping user-employee, bukan hanya isi field biasa.",
    ],
    relatedRoutes: [
      { label: "Data Pegawai", path: "/org/hr/employees", note: "Kembali ke master pegawai untuk memperbaiki sumber data." },
      { label: "Pengaturan HR", path: "/org/hr/settings", note: "Cek acuan akses dan preferensi workspace jika profil ESS bermasalah." },
    ],
  }),
  "/org/hr/priority-workspace": buildGuide({
    badge: "Ringkasan",
    title: "Panduan Workspace Prioritas HR",
    summary:
      "Halaman ini berfungsi sebagai cockpit prioritas implementasi. Fokusnya bukan CRUD data, melainkan membantu tenant menilai rute HR mana yang harus diselesaikan lebih dulu.",
    focusPoints: [
      "Membaca checklist kesiapan rute yang paling penting.",
      "Mengurutkan prioritas implementasi atau aktivasi modul HR.",
      "Menghubungkan rencana kerja HR dengan rute nyata di workspace.",
    ],
    useCases: [
      "Saat tenant baru mengaktifkan workspace HR.",
      "Saat perlu menyusun tahap implementasi HR secara bertahap.",
      "Saat ingin menilai modul HR mana yang masih belum siap.",
    ],
    outputs: [
      "Checklist prioritas per domain.",
      "Arah rute yang perlu dibuka berikutnya.",
      "Panduan implementasi minimum untuk tenant.",
    ],
    glossary: [
      { term: "Prioritas implementasi", definition: "Urutan pengerjaan modul berdasarkan dampak dan urgensi." },
      { term: "Checklist kesiapan", definition: "Daftar syarat minimum agar modul dianggap siap dipakai." },
      { term: "Cockpit", definition: "Tampilan kontrol yang merangkum banyak keputusan dalam satu layar." },
      { term: "Aktivasi bertahap", definition: "Pendekatan menyalakan modul secara incremental, bukan sekaligus." },
    ],
  }),
};

export const getOrgHrPageGuide = (pathname: string): OrgHrPageGuide | null => {
  return guides[pathname] ?? null;
};
