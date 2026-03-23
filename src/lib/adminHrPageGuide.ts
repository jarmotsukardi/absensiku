export type AdminHrGuideTerm = {
  term: string;
  definition: string;
};

export type AdminHrPageGuide = {
  badge: string;
  title: string;
  summary: string;
  focusPoints: string[];
  useCases: string[];
  outputs: string[];
  glossary: AdminHrGuideTerm[];
  watchouts?: string[];
};

const buildGuide = (guide: AdminHrPageGuide): AdminHrPageGuide => guide;

const guides: Record<string, AdminHrPageGuide> = {
  "/admin/hr": buildGuide({
    badge: "Ringkasan",
    title: "Panduan Dashboard HR Platform",
    summary:
      "Halaman ini dipakai untuk membaca kesehatan operasional modul HR lintas tenant. Fokusnya adalah KPI platform, error, tiket, dan arah tindak lanjut tata kelola.",
    focusPoints: [
      "Membaca KPI lintas tenant sebelum masuk ke halaman audit, pengaturan, atau kebijakan.",
      "Mengidentifikasi area yang paling membutuhkan intervensi platform HR.",
      "Menjadi titik masuk superadmin untuk memonitor status domain HR secara makro.",
    ],
    useCases: [
      "Saat superadmin ingin briefing cepat kondisi domain HR pada hari berjalan.",
      "Saat memutuskan apakah prioritas ada di kebijakan, dukungan, audit, atau tenant tertentu.",
      "Saat perlu melihat sinyal dini error atau tiket HR lintas tenant.",
    ],
    outputs: [
      "Ringkasan KPI tenant, error, kontrak, dan tiket.",
      "Akses cepat ke halaman tata kelola HR lainnya.",
      "Gambaran umum kesehatan platform HR sebelum investigasi detail.",
    ],
    glossary: [
      { term: "Tenant aktif", definition: "Organisasi yang saat ini aktif dan masuk cakupan pemantauan domain HR." },
      { term: "KPI platform", definition: "Indikator ringkas untuk membaca kesehatan modul HR lintas tenant." },
      { term: "Governance HR", definition: "Kontrol kebijakan, audit, dan konfigurasi yang dikelola dari level superadmin." },
      { term: "Sinyal operasional", definition: "Temuan awal yang menunjukkan area HR mana yang perlu ditindak lebih dulu." },
    ],
  }),
  "/admin/hr/tenants": buildGuide({
    badge: "Tenant",
    title: "Panduan Tenant HR",
    summary:
      "Halaman ini memonitor kesiapan dan kesehatan tenant HR satu per satu. Gunakan untuk membaca sebaran masalah dan menentukan tenant mana yang perlu ditangani lebih dulu.",
    focusPoints: [
      "Membandingkan kondisi tenant HR secara operasional.",
      "Menilai tenant yang paling banyak error, tiket, atau gap readiness.",
      "Mengarahkan tindak lanjut ke pengaturan atau log tenant terkait.",
    ],
    useCases: [
      "Saat superadmin ingin memprioritaskan tenant yang perlu perhatian lebih dulu.",
      "Saat ada eskalasi tenant dan perlu konteks kesehatannya secara cepat.",
      "Saat memeriksa sebaran adopsi dan kelengkapan domain HR.",
    ],
    outputs: [
      "Daftar tenant beserta indikator kesehatannya.",
      "Sinyal tenant dengan error atau risiko operasional tertinggi.",
      "Shortcut ke log dan pengaturan tenant HR.",
    ],
    glossary: [
      { term: "Health tenant", definition: "Ringkasan kondisi tenant berdasarkan data, error, tiket, dan readiness HR." },
      { term: "Readiness", definition: "Derajat kesiapan tenant untuk memakai fitur-fitur HR secara penuh." },
      { term: "Alert", definition: "Sinyal operasional yang menandai kondisi tenant perlu perhatian." },
      { term: "Prioritas tenant", definition: "Urutan tenant yang paling perlu tindakan berdasarkan indikator risiko." },
    ],
  }),
  "/admin/hr/policies": buildGuide({
    badge: "Kebijakan",
    title: "Panduan Kebijakan HR",
    summary:
      "Halaman ini memusatkan kebijakan global dan cakupan tenant untuk domain HR. Gunakan untuk meninjau aturan platform dan dampaknya ke tenant.",
    focusPoints: [
      "Membaca kebijakan global yang memengaruhi seluruh domain HR.",
      "Membandingkan kebijakan tenant yang masih tertinggal atau tidak sinkron.",
      "Mengatur acuan tata kelola untuk modul HR lanjutan.",
    ],
    useCases: [
      "Saat ada kebijakan baru yang harus diberlakukan lintas tenant.",
      "Saat perlu mengecek cakupan kebijakan pada tenant aktif.",
      "Saat mengevaluasi dampak perubahan kebijakan ke modul turunan seperti ESS, pelatihan, atau evaluasi.",
    ],
    outputs: [
      "Ringkasan kebijakan aktif dan cakupan tenant.",
      "Tabel kebijakan yang bisa diubah dari level superadmin.",
      "Arah follow-up ke tenant atau modul yang belum sinkron.",
    ],
    glossary: [
      { term: "Kebijakan global", definition: "Aturan dari level platform yang berlaku untuk banyak tenant." },
      { term: "Cakupan", definition: "Jangkauan penerapan kebijakan pada tenant atau modul tertentu." },
      { term: "Acuan", definition: "Konfigurasi dasar yang dijadikan standar awal." },
      { term: "Sinkron", definition: "Kondisi saat aturan tenant sudah sesuai dengan kebijakan platform." },
    ],
    watchouts: [
      "Perubahan kebijakan lintas tenant sebaiknya dicek dampaknya ke modul ESS, evaluasi, dan meja bantuan sebelum disimpan.",
      "Cakupan yang terlihat penuh belum tentu berarti tenant sudah siap secara data operasional.",
    ],
  }),
  "/admin/hr/settings": buildGuide({
    badge: "Konfigurasi",
    title: "Panduan Pengaturan HR",
    summary:
      "Halaman ini dipakai untuk mengelola konfigurasi inti domain HR platform. Fokusnya adalah preferensi, cakupan rute, dan tata kelola pengaturan lintas tenant.",
    focusPoints: [
      "Memastikan konfigurasi HR platform tetap konsisten.",
      "Membaca peta kesiapan rute dan cakupan pengaturan tenant.",
      "Menentukan area konfigurasi yang masih memerlukan penajaman.",
    ],
    useCases: [
      "Saat menyalakan atau meninjau pengaturan global HR.",
      "Saat menilai apakah rute HR sudah cukup matang untuk tenant produksi.",
      "Saat memeriksa gap konfigurasi yang berdampak ke banyak tenant.",
    ],
    outputs: [
      "Ringkasan pengaturan dan cakupan domain HR.",
      "Daftar tenant atau rute yang belum sinkron.",
      "Kontrol administratif untuk penyelarasan platform HR.",
    ],
    glossary: [
      { term: "Cakupan rute", definition: "Peta halaman HR yang sudah siap atau masih butuh penguatan." },
      { term: "Pengaturan global", definition: "Konfigurasi platform yang memengaruhi perilaku banyak tenant sekaligus." },
      { term: "Tata kelola pengaturan", definition: "Aturan kontrol terhadap siapa dan bagaimana pengaturan platform dikelola." },
      { term: "Kesenjangan konfigurasi", definition: "Selisih antara kondisi pengaturan yang ada dan target yang diharapkan." },
    ],
    watchouts: [
      "Rute yang aktif di pengaturan tetap perlu diverifikasi dengan uji asap, bukan hanya dianggap siap dari pemetaan.",
      "Perubahan pengaturan global dapat memunculkan drift jika tenant sudah memiliki override lokal yang lama.",
    ],
  }),
  "/admin/hr/audit": buildGuide({
    badge: "Audit",
    title: "Panduan Audit HR",
    summary:
      "Halaman ini dipakai untuk meninjau kualitas data, perubahan operasional, dan kepatuhan HR lintas tenant. Fokusnya bukan mengubah data, tetapi menelusuri jejak dan kualitasnya.",
    focusPoints: [
      "Membaca hasil audit data dan jejak perubahan HR.",
      "Mengidentifikasi tenant atau modul yang paling berisiko.",
      "Menyusun tindak lanjut dari temuan audit ke tenant atau kebijakan.",
    ],
    useCases: [
      "Saat superadmin melakukan tinjau kualitas data HR.",
      "Saat perlu menelusuri area mana yang paling banyak mismatch atau missing data.",
      "Saat menyiapkan tindak lanjut tata kelola dari temuan audit.",
    ],
    outputs: [
      "Temuan audit dan indikator kualitas data HR.",
      "Jejak perubahan yang relevan untuk kepatuhan.",
      "Daftar tenant atau modul yang perlu tindak lanjut.",
    ],
    glossary: [
      { term: "Audit trail", definition: "Jejak perubahan yang menunjukkan siapa mengubah apa dan kapan." },
      { term: "Kualitas data", definition: "Ukuran konsistensi, kelengkapan, dan keandalan data HR." },
      { term: "Temuan audit", definition: "Isu atau anomali yang ditemukan selama proses audit." },
      { term: "Kepatuhan", definition: "Kesesuaian praktik data dan proses dengan aturan yang ditetapkan." },
    ],
    watchouts: [
      "Temuan besar sebaiknya dibaca bersama filter tenant supaya masalah platform tidak tertukar dengan masalah tenant tunggal.",
      "Audit ini membantu triase, tetapi tetap perlu tindak lanjut ke tenant, kebijakan, atau log error untuk penanganan final.",
    ],
  }),
  "/admin/hr/error-logs": buildGuide({
    badge: "Operasional",
    title: "Panduan Error Log HR",
    summary:
      "Halaman ini memusatkan error runtime dan issue operasional domain HR. Gunakan untuk triase masalah, membedakan noise lama, dan menentukan prioritas perbaikan.",
    focusPoints: [
      "Menyaring error kritis yang masih aktif.",
      "Mengelompokkan masalah berdasarkan tenant, konteks, dan rute HR.",
      "Mendorong tindak lanjut ke audit, tenant, atau tim pengembang.",
    ],
    useCases: [
      "Saat muncul lonjakan error pada domain HR.",
      "Saat perlu memverifikasi apakah perbaikan terbaru benar-benar menghentikan error.",
      "Saat memilah backlog yang bisa diselesaikan atau diarsipkan.",
    ],
    outputs: [
      "Daftar error HR dengan filter operasional.",
      "Ekspor data error untuk analisis lanjutan.",
      "Sinyal tenant atau rute yang masih tidak sehat.",
    ],
    glossary: [
      { term: "Kritis terbuka", definition: "Error penting yang belum diselesaikan dan masih aktif di triase." },
      { term: "Konteks", definition: "Penanda area kode atau alur tempat error terjadi." },
      { term: "Arsip", definition: "Memindahkan log lama yang sudah tidak perlu berada di triase aktif." },
      { term: "Noise", definition: "Error lama atau non-esensial yang mengganggu fokus operasional." },
    ],
    watchouts: [
      "Error historis yang belum diarsipkan bisa menutupi masalah baru jika filter status tidak dijaga.",
      "Perbaikan skema atau rute perlu diverifikasi ulang sebelum backlog lama ditandai selesai atau diarsipkan.",
    ],
  }),
  "/admin/hr/help": buildGuide({
    badge: "Helpdesk",
    title: "Panduan Helpdesk HR",
    summary:
      "Halaman ini adalah pusat navigasi bantuan domain HR dari sisi platform. Gunakan untuk menentukan apakah isu perlu dijawab lewat FAQ, panduan dukungan, atau tiket.",
    focusPoints: [
      "Mengarahkan operator ke kanal bantuan yang paling tepat.",
      "Membedakan kebutuhan dokumentasi, panduan kerja, dan eskalasi.",
      "Menjadi titik masuk dukungan HR dari sisi superadmin.",
    ],
    useCases: [
      "Saat ada pertanyaan umum yang mungkin cukup dijawab lewat dokumentasi.",
      "Saat perlu eskalasi dukungan dan butuh SOP singkat.",
      "Saat mengecek jalur bantuan yang tersedia untuk domain HR.",
    ],
    outputs: [
      "Navigasi cepat ke FAQ, dukungan, dan tiket.",
      "Arah kerja dukungan HR yang lebih terstruktur.",
      "Pemetaan kanal bantuan sesuai jenis masalah.",
    ],
    glossary: [
      { term: "Meja bantuan", definition: "Pusat layanan bantuan untuk isu operasional dan penggunaan modul HR." },
      { term: "Panduan kerja", definition: "Panduan langkah kerja yang dipakai saat menangani isu dukungan." },
      { term: "Basis pengetahuan", definition: "Kumpulan jawaban dan dokumentasi yang dapat dibaca mandiri." },
      { term: "Eskalasi", definition: "Menaikkan isu ke level penanganan yang lebih tinggi." },
    ],
  }),
  "/admin/hr/help/faq": buildGuide({
    badge: "Helpdesk",
    title: "Panduan FAQ HR Platform",
    summary:
      "Halaman ini mengelola pertanyaan yang paling sering muncul terkait domain HR platform. Gunakan untuk memastikan jawaban yang berulang tersedia dan mudah ditemukan.",
    focusPoints: [
      "Membaca dan meninjau FAQ aktif untuk domain HR.",
      "Memastikan pertanyaan berulang memiliki jawaban yang jelas.",
      "Mengurangi beban tiket dengan dokumentasi yang tepat sasaran.",
    ],
    useCases: [
      "Saat menyusun jawaban standar untuk isu yang sering muncul.",
      "Saat memeriksa apakah dokumentasi layanan mandiri sudah memadai.",
      "Saat ingin mengurangi eskalasi yang sebenarnya bisa ditangani mandiri.",
    ],
    outputs: [
      "Daftar FAQ yang relevan untuk HR platform.",
      "Rujukan jawaban cepat untuk operator dan dukungan.",
      "Sinyal topik mana yang masih perlu dokumentasi lebih kuat.",
    ],
    glossary: [
      { term: "FAQ terkelola", definition: "FAQ yang dikelola secara terstruktur dari platform." },
      { term: "Layanan mandiri", definition: "Penyelesaian masalah secara mandiri tanpa intervensi dukungan langsung." },
      { term: "Pertanyaan berulang", definition: "Topik yang sering muncul dan layak dijadikan jawaban standar." },
      { term: "Jawaban standar", definition: "Respons yang telah dirapikan agar konsisten dipakai lintas tim." },
    ],
  }),
  "/admin/hr/help/support": buildGuide({
    badge: "Helpdesk",
    title: "Panduan Support HR",
    summary:
      "Halaman ini merangkum panduan dukungan, tingkat keparahan, dan eskalasi domain HR. Gunakan untuk menilai urgensi masalah dan jalur penanganannya.",
    focusPoints: [
      "Membedakan tingkat keparahan insiden HR secara konsisten.",
      "Menyelaraskan jalur eskalasi dukungan dan observabilitas.",
      "Memberi panduan tindak cepat saat insiden HR terjadi.",
    ],
    useCases: [
      "Saat ada insiden HR yang perlu diklasifikasikan segera.",
      "Saat operator butuh panduan siapa yang harus dihubungi berikutnya.",
      "Saat menyamakan ekspektasi penanganan lintas tim.",
    ],
    outputs: [
      "Matriks tingkat keparahan dan eskalasi dukungan HR.",
      "Tautan cepat ke log error, audit, dan tiket.",
      "Panduan respons awal untuk insiden HR.",
    ],
    glossary: [
      { term: "Tingkat keparahan", definition: "Tingkat keparahan insiden yang menentukan urgensi penanganan." },
      { term: "Observabilitas", definition: "Kemampuan memantau sistem melalui log, metrik, dan sinyal runtime." },
      { term: "Respons awal", definition: "Langkah pertama yang dilakukan sebelum investigasi mendalam." },
      { term: "Eskalasi teknis", definition: "Pengalihan masalah dari dukungan operasional ke tim teknis." },
    ],
  }),
  "/admin/hr/help/tickets": buildGuide({
    badge: "Helpdesk",
    title: "Panduan Tiket HR Platform",
    summary:
      "Halaman ini dipakai untuk mengelola tiket bantuan HR lintas tenant. Fokusnya adalah beban dukungan, status penyelesaian, dan jejak penanganan.",
    focusPoints: [
      "Membaca daftar tiket aktif dan backlog dukungan HR.",
      "Melacak status, prioritas, dan penugasan tiket lintas tenant.",
      "Menyusun tindak lanjut berdasarkan antrean dukungan yang ada.",
    ],
    useCases: [
      "Saat superadmin ingin memonitor tiket yang belum selesai.",
      "Saat perlu memindahkan tiket dari level FAQ ke dukungan langsung.",
      "Saat mengecek histori penanganan isu HR tertentu.",
    ],
    outputs: [
      "Daftar tiket HR dengan status dan prioritas.",
      "Histori tindak lanjut dukungan lintas tenant.",
      "Informasi beban kerja dukungan untuk perencanaan tindak lanjut.",
    ],
    glossary: [
      { term: "Penugasan", definition: "Penunjukan penanggung jawab tiket." },
      { term: "Backlog", definition: "Antrean tiket yang belum selesai diproses." },
      { term: "Status tiket", definition: "Tahap penanganan tiket, seperti baru, diproses, atau selesai." },
      { term: "Histori penanganan", definition: "Catatan perubahan dan aktivitas pada tiket." },
    ],
  }),
  "/admin/hr/profile": buildGuide({
    badge: "Workspace",
    title: "Panduan Profil Workspace HR",
    summary:
      "Halaman ini mengelola identitas dan positioning workspace HR di level platform. Gunakan untuk menjaga narasi, fokus, dan catatan operasional domain HR tetap konsisten.",
    focusPoints: [
      "Mengelola identitas workspace HR sebagai domain produk.",
      "Menjaga pesan, positioning, dan catatan operasional tetap sinkron.",
      "Merekam perubahan profil workspace melalui jejak audit.",
    ],
    useCases: [
      "Saat superadmin ingin memperbarui positioning domain HR.",
      "Saat butuh menyelaraskan narasi workspace dengan status implementasi aktual.",
      "Saat meninjau perubahan profil workspace dari audit log.",
    ],
    outputs: [
      "Profil workspace HR yang bisa dibaca dan diedit.",
      "Snapshot positioning dan catatan operasional HR.",
      "Jejak audit perubahan profil workspace.",
    ],
    glossary: [
      { term: "Positioning", definition: "Cara domain HR diposisikan dan dijelaskan dalam konteks platform." },
      { term: "Nada komunikasi", definition: "Nada komunikasi yang dipakai untuk menjelaskan workspace HR." },
      { term: "Catatan operasional", definition: "Catatan internal yang membantu tim memahami kondisi domain saat ini." },
      { term: "Jejak audit", definition: "Jejak perubahan yang menunjukkan siapa memperbarui profil dan kapan." },
    ],
  }),
};

export function getAdminHrPageGuide(pathname: string): AdminHrPageGuide | null {
  if (guides[pathname]) {
    return guides[pathname];
  }

  if (pathname.startsWith("/admin/hr/help/tickets")) {
    return guides["/admin/hr/help/tickets"];
  }
  if (pathname.startsWith("/admin/hr/help/faq")) {
    return guides["/admin/hr/help/faq"];
  }
  if (pathname.startsWith("/admin/hr/help/support")) {
    return guides["/admin/hr/help/support"];
  }
  if (pathname.startsWith("/admin/hr/help")) {
    return guides["/admin/hr/help"];
  }
  if (pathname.startsWith("/admin/hr/tenants")) {
    return guides["/admin/hr/tenants"];
  }
  if (pathname.startsWith("/admin/hr/policies")) {
    return guides["/admin/hr/policies"];
  }
  if (pathname.startsWith("/admin/hr/settings")) {
    return guides["/admin/hr/settings"];
  }
  if (pathname.startsWith("/admin/hr/audit")) {
    return guides["/admin/hr/audit"];
  }
  if (pathname.startsWith("/admin/hr/error-logs")) {
    return guides["/admin/hr/error-logs"];
  }
  if (pathname.startsWith("/admin/hr/profile")) {
    return guides["/admin/hr/profile"];
  }

  return pathname === "/admin/hr" ? guides["/admin/hr"] : null;
}
