type PayrollGlossaryItem = {
  term: string;
  definition: string;
};

type PayrollRelatedRoute = {
  path: string;
  label: string;
  note: string;
};

export type PayrollPageGuide = {
  badge: string;
  title: string;
  summary: string;
  focusPoints: string[];
  useCases: string[];
  outputs: string[];
  watchouts?: string[];
  glossary: PayrollGlossaryItem[];
  relatedRoutes?: PayrollRelatedRoute[];
};

const PAYROLL_GUIDES: Record<string, PayrollPageGuide> = {
  "/org/payroll": {
    badge: "Inti",
    title: "Panduan Beranda Payroll",
    summary: "Beranda payroll membantu tim memahami urutan kerja yang disarankan sebelum masuk ke proses yang lebih rinci.",
    focusPoints: [
      "Menunjukkan alur inti payroll dari kebijakan sampai laporan.",
      "Membedakan menu inti, referensi, lanjutan, dan pengaturan.",
      "Mengarahkan tim ke tahap berikutnya tanpa membuka terlalu banyak menu.",
    ],
    useCases: [
      "Dipakai saat baru mulai menyiapkan payroll organisasi.",
      "Dipakai saat tim bingung harus lanjut ke halaman mana.",
      "Dipakai sebagai orientasi sebelum periode payroll dibuka.",
    ],
    outputs: [
      "Urutan kerja payroll yang jelas.",
      "Akses cepat ke halaman inti.",
      "Peta fitur payroll yang aktif dan yang masih ditunda.",
    ],
    glossary: [
      { term: "Alur Inti", definition: "Rangkaian tahap kerja payroll yang wajib dilalui: kebijakan, periode, input variabel, validasi, proses, persetujuan, dan laporan." },
      { term: "Referensi HR", definition: "Data sumber dari HR yang ditampilkan untuk membantu payroll tanpa membuat master data baru di payroll." },
      { term: "Menu Ditunda", definition: "Menu yang tetap tampil untuk memberi gambaran roadmap, tetapi belum menjadi fokus tahap awal payroll sederhana." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/policies", label: "Kebijakan Payroll", note: "Mulai dari pengaturan dasar payroll." },
      { path: "/org/payroll/periods", label: "Periode Payroll", note: "Lanjutkan setelah kebijakan siap dipakai." },
      { path: "/org/payroll/validation", label: "Validasi Payroll", note: "Gunakan sebelum proses payroll dijalankan." },
    ],
  },
  "/org/payroll/policies": {
    badge: "Inti",
    title: "Panduan Kebijakan Payroll",
    summary: "Halaman ini dipakai untuk menetapkan aturan dasar yang akan dipakai oleh periode dan proses payroll.",
    focusPoints: [
      "Menentukan cutoff, prorata, pembulatan, dan sumber lembur.",
      "Menjaga agar aturan payroll konsisten antarperiode.",
      "Menyediakan kebijakan aktif yang benar-benar dipakai tim.",
    ],
    useCases: [
      "Saat organisasi baru mulai mengaktifkan payroll.",
      "Saat aturan prorata atau pembulatan perlu diubah.",
      "Saat ingin memastikan periode baru memakai aturan yang benar.",
    ],
    outputs: [
      "Kebijakan payroll aktif yang jelas.",
      "Aturan dasar untuk periode dan proses payroll.",
      "Jejak kebijakan yang bisa ditinjau ulang.",
    ],
    watchouts: [
      "Jangan aktifkan terlalu banyak kebijakan yang saling bertabrakan.",
      "Pastikan istilah dan aturan dipahami sebelum periode dibuka.",
    ],
    glossary: [
      { term: "Cutoff", definition: "Batas waktu data yang ikut dihitung ke periode payroll berjalan." },
      { term: "Prorata", definition: "Perhitungan proporsional jika pegawai tidak bekerja penuh selama satu periode." },
      { term: "Pembulatan", definition: "Aturan pembulatan nominal payroll agar hasil akhir konsisten." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/periods", label: "Periode Payroll", note: "Buka periode setelah kebijakan siap." },
    ],
  },
  "/org/payroll/periods": {
    badge: "Inti",
    title: "Panduan Periode Payroll",
    summary: "Halaman ini mengatur siklus payroll bulanan agar proses, persetujuan, dan laporan berjalan di periode yang benar.",
    focusPoints: [
      "Membuka dan menutup periode payroll.",
      "Menentukan tanggal mulai, akhir, dan cutoff.",
      "Menjaga status periode tetap jelas selama proses berjalan.",
    ],
    useCases: [
      "Saat memulai payroll bulan baru.",
      "Saat ingin meninjau status periode yang sedang diproses.",
      "Saat mempersiapkan input variabel dan validasi.",
    ],
    outputs: [
      "Periode aktif yang siap dipakai.",
      "Status periode yang mudah dipantau.",
      "Keterkaitan yang jelas ke proses payroll.",
    ],
    glossary: [
      { term: "Periode Payroll", definition: "Satu siklus kerja payroll yang biasanya mewakili satu bulan operasional." },
      { term: "Kode Periode", definition: "Penanda unik periode agar mudah dicari di proses, laporan, dan audit." },
      { term: "Status Periode", definition: "Tahap periode, misalnya draft, ditinjau, atau disetujui." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/variable-input", label: "Input Variabel", note: "Masukkan data non-rutin pada periode yang tepat." },
    ],
  },
  "/org/payroll/variable-input": {
    badge: "Inti",
    title: "Panduan Input Variabel",
    summary: "Halaman ini dipakai untuk memasukkan data non-rutin yang tidak otomatis berasal dari HR atau absensi.",
    focusPoints: [
      "Mencatat bonus, koreksi, penyesuaian, dan komponen non-rutin.",
      "Mengikat input ke periode dan pegawai yang tepat.",
      "Menyiapkan data sebelum validasi payroll.",
    ],
    useCases: [
      "Saat ada bonus atau koreksi manual.",
      "Saat ada lembur atau penyesuaian khusus yang belum otomatis.",
      "Saat tim perlu melengkapi data sebelum proses payroll.",
    ],
    outputs: [
      "Daftar input variabel yang siap divalidasi.",
      "Nominal tambahan atau potongan non-rutin yang terdokumentasi.",
      "Jejak referensi untuk audit operasional.",
    ],
    glossary: [
      { term: "Input Variabel", definition: "Data payroll non-rutin yang nilainya bisa berbeda antarperiode." },
      { term: "Penghasilan/Potongan", definition: "Jenis dampak input variabel terhadap hasil payroll." },
      { term: "Trace ID", definition: "Nomor referensi teknis untuk menelusuri proses atau masalah operasional." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/validation", label: "Validasi Payroll", note: "Periksa kesiapan data setelah input selesai." },
    ],
  },
  "/org/payroll/validation": {
    badge: "Inti",
    title: "Panduan Validasi Payroll",
    summary: "Validasi payroll dipakai untuk memastikan data siap sebelum proses dijalankan dan kesalahan besar bisa ditemukan lebih awal.",
    focusPoints: [
      "Menemukan masalah data sebelum proses payroll.",
      "Menilai apakah periode sudah cukup siap diproses.",
      "Mengarahkan tim ke koreksi yang perlu dilakukan.",
    ],
    useCases: [
      "Saat semua input variabel sudah masuk.",
      "Saat ingin memastikan periode aman diproses.",
      "Saat butuh ringkasan masalah sebelum persetujuan internal.",
    ],
    outputs: [
      "Status validasi yang jelas.",
      "Jumlah masalah dan prioritas perbaikan.",
      "Keputusan lanjut atau tunda proses payroll.",
    ],
    glossary: [
      { term: "Lolos", definition: "Data dinilai aman untuk lanjut ke proses payroll." },
      { term: "Perlu Perhatian", definition: "Ada temuan yang perlu dicek, tetapi tidak selalu memblokir proses." },
      { term: "Gagal", definition: "Ada masalah yang cukup berat sehingga proses payroll sebaiknya tidak dilanjutkan dulu." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/run-engine", label: "Proses Payroll", note: "Jalankan proses hanya setelah validasi memadai." },
    ],
  },
  "/org/payroll/run-engine": {
    badge: "Inti",
    title: "Panduan Proses Payroll",
    summary: "Halaman proses payroll dipakai untuk menjalankan simulasi atau proses final berdasarkan periode yang sudah siap.",
    focusPoints: [
      "Menjalankan simulasi dan proses final payroll.",
      "Memantau status setiap proses payroll.",
      "Menyiapkan hasil untuk masuk ke persetujuan.",
    ],
    useCases: [
      "Saat validasi payroll sudah memadai.",
      "Saat tim ingin menjalankan simulasi sebelum final.",
      "Saat perlu melihat status proses yang sedang berjalan atau gagal.",
    ],
    outputs: [
      "Proses payroll yang terdokumentasi per periode.",
      "Status proses yang mudah dipantau.",
      "Dasar untuk persetujuan payroll.",
    ],
    glossary: [
      { term: "Simulasi", definition: "Percobaan proses payroll tanpa menganggap hasilnya final." },
      { term: "Tinjau", definition: "Status saat hasil proses perlu dicek sebelum disetujui." },
      { term: "Arsip", definition: "Status proses lama yang sudah selesai dan tidak aktif lagi." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/approval", label: "Persetujuan Payroll", note: "Tindak lanjuti hasil proses yang siap ditinjau." },
    ],
  },
  "/org/payroll/approval": {
    badge: "Inti",
    title: "Panduan Persetujuan Payroll",
    summary: "Persetujuan payroll dipakai untuk memutuskan apakah hasil proses payroll layak dilanjutkan menjadi hasil resmi.",
    focusPoints: [
      "Meninjau hasil proses payroll.",
      "Mencatat status disetujui atau ditolak.",
      "Menjaga jejak keputusan sebelum laporan dipakai lebih luas.",
    ],
    useCases: [
      "Saat proses payroll sudah masuk tahap tinjau.",
      "Saat tim perlu keputusan formal sebelum laporan dipakai.",
      "Saat hasil payroll perlu ditolak dan diperbaiki lebih dulu.",
    ],
    outputs: [
      "Keputusan persetujuan yang terdokumentasi.",
      "Daftar payroll yang masih menunggu atau ditolak.",
      "Dasar untuk melihat laporan hasil payroll.",
    ],
    glossary: [
      { term: "Menunggu", definition: "Hasil proses payroll belum diputuskan." },
      { term: "Disetujui", definition: "Hasil payroll dinyatakan layak dilanjutkan." },
      { term: "Ditolak", definition: "Hasil payroll harus diperbaiki sebelum dilanjutkan." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/reports", label: "Laporan Payroll", note: "Lihat hasil ringkas setelah persetujuan." },
    ],
  },
  "/org/payroll/reports": {
    badge: "Inti",
    title: "Panduan Laporan Payroll",
    summary: "Laporan payroll menyajikan hasil ringkas payroll per periode tanpa masuk ke fitur distribusi yang lebih kompleks.",
    focusPoints: [
      "Melihat snapshot hasil payroll.",
      "Menyediakan ringkasan untuk tindak lanjut operasional.",
      "Menghubungkan hasil payroll dengan trace ID dan log ID.",
    ],
    useCases: [
      "Saat hasil payroll sudah disetujui.",
      "Saat tim butuh ringkasan cepat per periode.",
      "Saat perlu ekspor atau tindak lanjut ke area lanjutan.",
    ],
    outputs: [
      "Snapshot laporan per periode.",
      "Status laporan yang bisa ditinjau ulang.",
      "Data ringkas untuk operasi harian.",
    ],
    glossary: [
      { term: "Snapshot Laporan", definition: "Salinan hasil payroll pada titik waktu tertentu agar mudah ditinjau kembali." },
      { term: "Dipublikasikan", definition: "Laporan sudah siap dipakai oleh pihak yang berwenang." },
      { term: "Log ID", definition: "Nomor referensi log yang membantu investigasi jika ada masalah di belakang layar." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/slips", label: "Slip Gaji", note: "Lanjutkan ke distribusi slip jika tahap lanjutan sudah siap." },
    ],
  },
  "/org/payroll/roles": {
    badge: "Inti",
    title: "Panduan Hak Akses Payroll",
    summary: "Hak akses payroll memastikan hanya pengguna yang tepat yang dapat melihat, memproses, atau menyetujui payroll.",
    focusPoints: [
      "Mengatur peran payroll per pengguna.",
      "Menjaga kontrol akses terhadap proses sensitif.",
      "Mendukung guard route payroll yang aman.",
    ],
    useCases: [
      "Saat mulai mengaktifkan payroll untuk tim tertentu.",
      "Saat ada perubahan personel yang mengelola payroll.",
      "Saat ingin membatasi siapa yang boleh memproses atau menyetujui payroll.",
    ],
    outputs: [
      "Daftar assignment peran payroll.",
      "Kontrol akses yang lebih terjaga.",
      "Jejak siapa yang punya peran aktif.",
    ],
    glossary: [
      { term: "Peran Payroll", definition: "Hak yang menentukan ruang tindakan pengguna di dalam modul payroll." },
      { term: "Assignment Aktif", definition: "Peran yang sedang berlaku dan dapat dipakai untuk akses." },
      { term: "Guard Akses", definition: "Pemeriksaan sistem untuk menentukan apakah user boleh membuka halaman payroll tertentu." },
    ],
  },
  "/org/payroll/help": {
    badge: "Info",
    title: "Panduan Bantuan Payroll",
    summary: "Halaman bantuan payroll menjadi titik rujukan cepat ke alur, audit, dan log error tanpa mengubah data inti.",
    focusPoints: [
      "Mengarahkan tim ke halaman yang relevan.",
      "Menyediakan bantuan singkat saat butuh rujukan.",
      "Menjaga bantuan tetap ringkas dan tidak menumpuk di halaman inti.",
    ],
    useCases: [
      "Saat tim baru mempelajari alur payroll.",
      "Saat perlu cepat berpindah ke audit atau log error.",
      "Saat mencari arahan sebelum membuka menu lanjutan.",
    ],
    outputs: [
      "Akses cepat ke halaman rujukan.",
      "Penjelasan singkat yang mudah dipahami.",
      "Pusat bantuan ringan untuk workspace payroll.",
    ],
    glossary: [
      { term: "Rujukan", definition: "Halaman lain yang dipakai untuk membantu memahami atau menelusuri kondisi payroll." },
      { term: "Audit Log", definition: "Jejak perubahan payroll yang membantu menelusuri siapa melakukan apa." },
      { term: "Log Error", definition: "Daftar error aktif yang perlu ditindaklanjuti secara operasional." },
    ],
  },
  "/org/payroll/employees": {
    badge: "Referensi HR",
    title: "Panduan Data Pegawai Payroll",
    summary: "Halaman ini menjadi referensi kesiapan data pegawai dari HR agar payroll tidak membuat master pegawai baru.",
    focusPoints: [
      "Membaca data pegawai aktif dari HR.",
      "Menjadi titik cek kesiapan payroll per pegawai.",
      "Menghindari duplikasi master data pegawai.",
    ],
    useCases: [
      "Saat ingin memastikan pegawai sudah siap diproses payroll.",
      "Saat ada masalah data pegawai yang memengaruhi payroll.",
      "Saat tim butuh melihat referensi HR tanpa pindah konteks terlalu jauh.",
    ],
    outputs: [
      "Ringkasan kesiapan data pegawai.",
      "Acuan untuk menelusuri data HR yang kurang lengkap.",
      "Jembatan antara payroll dan master pegawai HR.",
    ],
    glossary: [
      { term: "Referensi HR", definition: "Data sumber dari modul HR yang dibaca payroll sebagai acuan." },
      { term: "Kesiapan Payroll", definition: "Kondisi minimum data pegawai yang dibutuhkan agar payroll bisa diproses." },
      { term: "Master Data", definition: "Data utama yang dikelola di modul sumber, bukan diduplikasi di payroll." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/org-grade", label: "Struktur Organisasi dan Grade", note: "Lihat konteks organisasi dan grade dari HR." },
    ],
  },
  "/org/payroll/org-grade": {
    badge: "Referensi HR",
    title: "Panduan Struktur Organisasi dan Grade",
    summary: "Halaman ini dipakai untuk membaca konteks struktur dan grade dari HR yang relevan ke payroll.",
    focusPoints: [
      "Membaca struktur organisasi dari sumber HR.",
      "Melihat konteks grade yang memengaruhi payroll.",
      "Menghubungkan payroll dengan struktur tanpa membuat master baru.",
    ],
    useCases: [
      "Saat memahami konteks organisasi untuk payroll.",
      "Saat mengecek struktur atau grade yang berdampak pada komponen payroll.",
      "Saat ingin menelusuri akar masalah payroll yang berasal dari struktur HR.",
    ],
    outputs: [
      "Referensi struktur organisasi yang relevan.",
      "Konteks grade untuk kebutuhan payroll.",
      "Arah tindak lanjut ke data HR bila ada ketidaksesuaian.",
    ],
    glossary: [
      { term: "Grade", definition: "Kelompok level atau tingkatan pegawai yang dapat memengaruhi aturan payroll." },
      { term: "Struktur Organisasi", definition: "Susunan unit kerja dan hubungan organisasi yang dikelola di HR." },
      { term: "Konteks Payroll", definition: "Informasi tambahan yang membantu membaca hasil payroll dengan benar." },
    ],
  },
  "/org/payroll/income-components": {
    badge: "Lanjutan",
    title: "Panduan Komponen Penghasilan",
    summary: "Halaman ini dipakai saat organisasi sudah perlu mengelola komponen penghasilan payroll yang lebih rinci.",
    focusPoints: [
      "Mendefinisikan jenis komponen penghasilan.",
      "Menentukan mode kalkulasi dan nominal default.",
      "Menjaga komponen tetap konsisten antarperiode.",
    ],
    useCases: [
      "Saat payroll butuh komponen tambahan di luar alur inti.",
      "Saat aturan penghasilan perlu lebih detail.",
      "Saat tim menyiapkan struktur payroll jangka menengah.",
    ],
    outputs: [
      "Daftar komponen penghasilan yang lebih rapi.",
      "Dasar perhitungan untuk penghasilan rinci.",
      "Acuan konfigurasi lanjutan payroll.",
    ],
    glossary: [
      { term: "Komponen Penghasilan", definition: "Bagian penghasilan yang membentuk nilai bruto payroll." },
      { term: "Mode Kalkulasi", definition: "Cara menghitung komponen, misalnya nominal tetap, persentase, atau formula." },
      { term: "Nominal Default", definition: "Nilai awal yang dipakai jika tidak ada penggantian khusus." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/deduction-components", label: "Komponen Potongan", note: "Lanjutkan ke konfigurasi potongan payroll." },
    ],
  },
  "/org/payroll/deduction-components": {
    badge: "Lanjutan",
    title: "Panduan Komponen Potongan",
    summary: "Halaman ini dipakai saat organisasi sudah perlu mengelola potongan payroll secara lebih rinci.",
    focusPoints: [
      "Mendefinisikan komponen potongan payroll.",
      "Menentukan mode kalkulasi dan status aktif komponen.",
      "Menjaga potongan tetap terstruktur dan konsisten.",
    ],
    useCases: [
      "Saat payroll sudah memerlukan potongan rinci.",
      "Saat aturan iuran, cicilan, atau denda perlu dicatat khusus.",
      "Saat konfigurasi payroll lanjutan sedang disiapkan.",
    ],
    outputs: [
      "Daftar komponen potongan yang jelas.",
      "Dasar konfigurasi potongan payroll.",
      "Referensi lanjutan untuk proses payroll rinci.",
    ],
    glossary: [
      { term: "Komponen Potongan", definition: "Bagian yang mengurangi nilai payroll sebelum hasil akhir dibayar." },
      { term: "Cicilan", definition: "Potongan bertahap yang biasanya dipakai untuk pinjaman atau kewajiban periodik." },
      { term: "Status Aktif", definition: "Penanda apakah komponen sedang dipakai dalam konfigurasi payroll." },
    ],
  },
  "/org/payroll/slips": {
    badge: "Ditunda",
    title: "Panduan Slip Gaji",
    summary: "Slip gaji dan distribusi berada di tahap lanjutan dan belum menjadi fokus payroll sederhana tahap awal.",
    focusPoints: [
      "Mengelola metadata slip gaji.",
      "Menandai status distribusi slip.",
      "Menyiapkan jejak distribusi saat fitur ini diaktifkan penuh.",
    ],
    useCases: [
      "Saat organisasi siap mendistribusikan slip gaji.",
      "Saat perlu melacak status publikasi slip.",
      "Saat fitur lanjutan payroll mulai diaktifkan.",
    ],
    outputs: [
      "Daftar slip gaji per periode atau proses.",
      "Status distribusi slip yang terdokumentasi.",
      "Jejak referensi untuk tindak lanjut operasional.",
    ],
    glossary: [
      { term: "Slip Gaji", definition: "Ringkasan hasil payroll untuk pegawai tertentu." },
      { term: "Kanal Distribusi", definition: "Media penyampaian slip, misalnya portal, email, atau WhatsApp." },
      { term: "Dipublikasikan", definition: "Status saat slip dianggap siap dibagikan." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/reports", label: "Laporan Payroll", note: "Pastikan hasil payroll sudah benar sebelum distribusi slip." },
    ],
  },
  "/org/payroll/payment": {
    badge: "Ditunda",
    title: "Panduan Pembayaran Payroll",
    summary: "Pembayaran payroll berada di tahap lanjutan untuk organisasi yang sudah siap mengelola batch transfer dan rekonsiliasi.",
    focusPoints: [
      "Mencatat batch pembayaran payroll.",
      "Memantau status transfer dan rekonsiliasi.",
      "Menjaga jejak pembayaran tetap mudah ditelusuri.",
    ],
    useCases: [
      "Saat organisasi sudah siap mengelola bank file.",
      "Saat ingin mencocokkan hasil payroll dengan batch pembayaran.",
      "Saat pembayaran payroll perlu dipantau lebih rinci.",
    ],
    outputs: [
      "Daftar batch pembayaran payroll.",
      "Status transfer yang terdokumentasi.",
      "Acuan untuk rekonsiliasi tahap lanjutan.",
    ],
    glossary: [
      { term: "Batch Pembayaran", definition: "Sekelompok pembayaran payroll yang diproses bersama." },
      { term: "Rekonsiliasi", definition: "Pencocokan antara data payroll dan hasil pembayaran aktual." },
      { term: "Bank File", definition: "File keluaran yang dipakai untuk proses transfer massal ke bank." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/slips", label: "Slip Gaji", note: "Cocokkan slip dan batch pembayaran bila fitur ini aktif." },
    ],
  },
  "/org/payroll/tax-compliance": {
    badge: "Ditunda",
    title: "Panduan Pajak dan Kepatuhan",
    summary: "Pajak dan kepatuhan adalah area lanjutan untuk mencatat filing, tenggat, dan status kewajiban payroll.",
    focusPoints: [
      "Mencatat filing pajak atau kewajiban terkait payroll.",
      "Memantau tenggat dan status filing.",
      "Menyediakan jejak referensi untuk audit kepatuhan.",
    ],
    useCases: [
      "Saat organisasi mulai mengelola compliance payroll.",
      "Saat perlu memantau filing yang jatuh tempo.",
      "Saat butuh referensi audit untuk kewajiban payroll.",
    ],
    outputs: [
      "Daftar filing pajak yang terdokumentasi.",
      "Status kepatuhan yang lebih mudah dipantau.",
      "Acuan operasional untuk tindak lanjut compliance.",
    ],
    glossary: [
      { term: "Filing", definition: "Catatan atau pelaporan kewajiban tertentu yang terkait payroll." },
      { term: "Tenggat", definition: "Batas waktu pelaporan atau pembayaran kewajiban." },
      { term: "Kepatuhan", definition: "Ketaatan terhadap kewajiban pajak atau regulasi terkait payroll." },
    ],
  },
  "/org/payroll/integrations": {
    badge: "Ditunda",
    title: "Panduan Integrasi Payroll",
    summary: "Integrasi payroll dipakai saat organisasi sudah siap menghubungkan payroll ke absensi, akuntansi, payout, atau webhook.",
    focusPoints: [
      "Menyiapkan integrasi ke sistem lain.",
      "Memeriksa kesehatan koneksi dan sinkronisasi.",
      "Menyediakan konfigurasi webhook dan endpoint eksternal.",
    ],
    useCases: [
      "Saat payroll perlu membaca sumber lain atau mengirim hasil ke sistem lain.",
      "Saat tim butuh uji konektivitas webhook.",
      "Saat organisasi mulai mengaktifkan integrasi lanjutan.",
    ],
    outputs: [
      "Konfigurasi integrasi yang terdokumentasi.",
      "Hasil cek kesehatan koneksi.",
      "Referensi trace untuk uji webhook.",
    ],
    glossary: [
      { term: "Webhook", definition: "Pengiriman event otomatis ke endpoint eksternal saat terjadi aksi tertentu." },
      { term: "Cek Kesehatan", definition: "Pemeriksaan cepat untuk melihat apakah koneksi dan data integrasi masih terbaca baik." },
      { term: "Basis Data Bersama", definition: "Sumber data yang dipakai bersama oleh payroll dan modul lain tanpa duplikasi lokal." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/audit-log", label: "Audit Log Payroll", note: "Gunakan audit log untuk menelusuri hasil uji dan perubahan integrasi." },
    ],
  },
  "/org/payroll/audit-log": {
    badge: "Ditunda",
    title: "Panduan Audit Log Payroll",
    summary: "Audit log payroll dipakai untuk menelusuri perubahan data dan aktivitas yang berdampak ke payroll.",
    focusPoints: [
      "Menunjukkan siapa melakukan apa di payroll.",
      "Menghubungkan perubahan dengan periode atau proses tertentu.",
      "Mendukung investigasi operasional dan audit internal.",
    ],
    useCases: [
      "Saat butuh investigasi perubahan data payroll.",
      "Saat perlu melacak aktivitas webhook atau aksi manual.",
      "Saat audit internal membutuhkan jejak perubahan yang jelas.",
    ],
    outputs: [
      "Jejak perubahan payroll yang terstruktur.",
      "Referensi trace_id dan log_id untuk tindak lanjut.",
      "Acuan investigasi insiden payroll.",
    ],
    glossary: [
      { term: "Audit Log", definition: "Catatan perubahan dan aktivitas yang terjadi di dalam sistem." },
      { term: "Entitas", definition: "Objek data yang berubah, misalnya proses payroll, webhook, atau laporan." },
      { term: "Aksi", definition: "Jenis perubahan yang terjadi, seperti membuat, mengubah, atau menghapus." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/error-log", label: "Log Error Payroll", note: "Lanjutkan ke log error bila masalah masih aktif." },
    ],
  },
  "/org/payroll/error-log": {
    badge: "Ditunda",
    title: "Panduan Log Error Payroll",
    summary: "Log error payroll membantu tim memusatkan triase error aktif saat modul payroll sudah cukup banyak dipakai.",
    focusPoints: [
      "Memantau error aktif berdasarkan tingkat prioritas.",
      "Menyediakan nomor referensi untuk tindak lanjut cepat.",
      "Membantu menghubungkan error ke konteks payroll tertentu.",
    ],
    useCases: [
      "Saat payroll sudah aktif dipakai dan perlu triase error.",
      "Saat tim ingin melacak error kritis lebih dulu.",
      "Saat butuh referensi cepat sebelum membuka audit log.",
    ],
    outputs: [
      "Daftar error aktif yang mudah dipantau.",
      "Nomor referensi untuk investigasi dan eskalasi.",
      "Dasar pengambilan tindakan terhadap insiden payroll.",
    ],
    glossary: [
      { term: "Error Kritis", definition: "Masalah yang berpotensi mengganggu alur utama payroll dan perlu diprioritaskan." },
      { term: "Referensi Error", definition: "Nomor atau kode yang memudahkan tim menelusuri sumber masalah." },
      { term: "Retensi", definition: "Aturan penyimpanan log agar daftar tetap relevan dan performa tetap terjaga." },
    ],
    relatedRoutes: [
      { path: "/org/payroll/audit-log", label: "Audit Log Payroll", note: "Gunakan audit log untuk melihat jejak perubahan setelah menemukan error." },
    ],
  },
  "/org/payroll/settings": {
    badge: "Info",
    title: "Panduan Pengaturan Payroll",
    summary: "Pengaturan payroll berisi pintasan ke konfigurasi yang masih dipertahankan sebagai menu sekunder agar sidebar tetap ramping.",
    focusPoints: [
      "Menyediakan akses cepat ke pengaturan terkait payroll.",
      "Menjaga sidebar payroll tetap ramping.",
      "Mengelompokkan pengaturan yang tidak perlu jadi menu utama.",
    ],
    useCases: [
      "Saat tim butuh pintasan ke pengaturan terkait payroll.",
      "Saat ingin menjaga menu utama tetap fokus ke alur kerja inti.",
      "Saat membutuhkan halaman sekunder tanpa memenuhi sidebar.",
    ],
    outputs: [
      "Shortcut ke halaman pengaturan terkait.",
      "Navigasi sekunder yang tetap mudah ditemukan.",
      "Struktur workspace payroll yang lebih rapi.",
    ],
    glossary: [
      { term: "Menu Sekunder", definition: "Menu yang tetap tersedia tetapi bukan fokus utama workflow harian." },
      { term: "Shortcut", definition: "Tautan cepat ke halaman lain yang relevan." },
      { term: "Sidebar Ramping", definition: "Prinsip menjaga jumlah menu utama tetap sedikit dan mudah dipahami." },
    ],
  },
};

export function getOrgPayrollPageGuide(pathname: string): PayrollPageGuide | null {
  return PAYROLL_GUIDES[pathname] || null;
}
