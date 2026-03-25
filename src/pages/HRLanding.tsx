import { Briefcase, FileText, Users2 } from "lucide-react";

import { SolutionLandingPage } from "@/components/public/SolutionLandingPage";
import { PUBLIC_CONSULTATION_PATH } from "@/lib/publicRoutes";

const HRLanding = () => (
  <SolutionLandingPage
    path="/hr"
    seoTitle="Jalur Lanjutan HR | AbsensiKu"
    seoDescription="Jajaki tahap lanjutan HR setelah fondasi absensi harian stabil, mulai dari data pegawai, cuti, onboarding, dokumen, dan approval."
    badge="Tahap Lanjutan HR"
    title="Siapkan proses HR"
    subtitle="setelah fondasi absensi yang berjalan sudah stabil."
    description="AbsensiKu tetap dimulai dari kehadiran harian. Saat organisasi Anda butuh proses SDM yang lebih rapi, solusi HR memperluas alur itu ke data pegawai, cuti, onboarding, offboarding, dokumen, dan approval tanpa memecah tenant, role, atau jejak audit."
    highlights={[
      { label: "Peran solusi", value: "Tahap lanjutan setelah Absensi" },
      { label: "Fokus utama", value: "Data pegawai + proses HR" },
      { label: "Cocok untuk", value: "Instansi dengan approval bertingkat" },
    ]}
    pillars={[
      {
        title: "Master data pegawai",
        description: "Kelola struktur organisasi, status kepegawaian, unit kerja, jabatan, dan informasi dasar pegawai tanpa memindahkan data ke sistem lain.",
        icon: Users2,
      },
      {
        title: "Operasional SDM",
        description: "Atur cuti, onboarding, offboarding, dokumen, persetujuan, dan layanan mandiri pegawai dengan alur yang jauh lebih rapi.",
        icon: Briefcase,
      },
      {
        title: "Dokumen dan jejak audit",
        description: "Pantau perubahan data, histori approval, dan log operasional HR supaya operator dan pimpinan membaca status yang sama.",
        icon: FileText,
      },
    ]}
    modulesTitle="Modul HR yang paling cepat terasa manfaatnya"
    modulesDescription="Halaman ini tidak menjual HR sebagai sistem yang berdiri sendiri. Fokusnya adalah modul-modul yang paling cepat membantu tim Anda setelah fondasi absensi berjalan stabil."
    modules={[
      {
        title: "Data Pegawai dan Struktur",
        description: "Rapikan fondasi SDM supaya data orang, unit kerja, jabatan, dan status kepegawaian konsisten di seluruh organisasi.",
        bullets: [
          "Struktur organisasi, unit kerja, jabatan, dan status pegawai dalam satu tenant",
          "Mengurangi duplikasi data manual antara operator absensi dan operator kepegawaian",
          "Menjadi dasar approval, dokumen, dan laporan HR berikutnya",
        ],
      },
      {
        title: "Cuti, Izin, dan Approval",
        description: "Pindahkan proses pengajuan dan persetujuan dari chat atau spreadsheet ke alur yang lebih rapi dan bisa dilacak.",
        bullets: [
          "Jenis cuti, kuota, validitas, dan approval hierarchy lebih terkontrol",
          "Riwayat keputusan lebih jelas untuk pegawai, atasan, dan admin",
          "Membantu menautkan keputusan HR dengan data kehadiran harian",
        ],
      },
      {
        title: "Onboarding, Offboarding, dan Dokumen",
        description: "Kelola siklus hidup pegawai dari masuk sampai keluar dengan checklist, dokumen, dan histori yang lebih tertata.",
        bullets: [
          "Dokumen, template, dan status proses tidak tercecer di banyak tempat",
          "Memudahkan handover saat ada mutasi, pegawai baru, atau pegawai keluar",
          "Audit log membantu menelusuri perubahan penting pada data dan proses",
        ],
      },
    ]}
    workflows={[
      "Mulai dari data hadir harian, jadwal kerja, dan profil pegawai yang sudah tercatat di AbsensiKu.",
      "Perluas ke proses HR seperti cuti, izin, onboarding, offboarding, struktur organisasi, dan layanan mandiri pegawai.",
      "Gunakan approval hierarchy, audit log, dan laporan HR untuk memastikan perubahan data tetap cepat tetapi terkontrol.",
    ]}
    integrationsTitle="HR dibuat untuk memperdalam operasi, bukan mengganti produk inti."
    integrationsDescription="Karena fondasinya tetap absensi, tim HR tidak perlu membangun ulang tenant, pegawai, role, dan approval dari nol. Modul ini diposisikan sebagai perluasan bagi organisasi yang sudah siap naik dari kontrol kehadiran ke pengelolaan SDM yang lebih matang."
    proofPoints={[
      "Cocok saat organisasi sudah stabil di absensi tetapi mulai kesulitan mengelola data pegawai dan approval HR secara manual.",
      "Tetap satu alur dengan tenant, peran admin, audit log, dan struktur organisasi yang sudah berjalan di AbsensiKu.",
      "Memperjelas siklus hidup pegawai dari masuk, aktif, cuti, mutasi, sampai keluar tanpa memecah sumber data.",
      "Membantu operator HR bergerak lebih cepat tanpa kehilangan kontrol perubahan dan histori keputusan.",
    ]}
    integrationBullets={[
      "Data hadir dan jadwal kerja tetap menjadi konteks dasar keputusan HR",
      "Role dan tenant tidak perlu dipisah dari platform utama",
      "Approval, log audit, dan pelacakan perubahan tetap konsisten",
      "Laporan HR bisa dibaca bersama data operasional absensi",
    ]}
    previewTitle="Gambaran visual area kerja HR di atas fondasi absensi"
    previewDescription="Preview ini memakai tampilan modul nyata untuk membantu calon pengguna memahami seperti apa ritme kerja HR saat data absensi, pegawai, dan approval sudah terhubung."
    previews={[
      {
        title: "Ringkasan Operasi HR",
        subtitle: "Membaca area yang paling sering disentuh operator kepegawaian setiap hari.",
        badge: "Workspace HR",
        imageSrc: "/manuals/screenshots/hr/04-hr-pegawai-data-pegawai.png",
        imageAlt: "Tampilan data pegawai HR",
        progressLabel: "Kelengkapan data pegawai",
        progressValue: 84,
        metrics: [
          { label: "Pegawai", value: "1.248" },
          { label: "Approval", value: "27 aktif" },
          { label: "Dokumen", value: "93 baru" },
        ],
        rows: [
          { label: "Cuti tahunan", helper: "Menunggu review atasan langsung", status: "Perlu review" },
          { label: "Onboarding pegawai baru", helper: "Dokumen personalia belum lengkap", status: "On progress" },
          { label: "Mutasi internal", helper: "Sinkron ke unit kerja baru", status: "Selesai cek" },
        ],
      },
      {
        title: "Alur Approval dan Dokumen",
        subtitle: "Menunjukkan bagaimana histori keputusan dan dokumen dibaca dalam satu alur.",
        badge: "Approval HR",
        imageSrc: "/manuals/screenshots/hr/09-hr-administrasi-hr-dokumen-hr.png",
        imageAlt: "Tampilan dokumen HR",
        progressLabel: "Persetujuan yang selesai minggu ini",
        progressValue: 71,
        metrics: [
          { label: "Pending", value: "12" },
          { label: "Disetujui", value: "48" },
          { label: "Ditolak", value: "5" },
        ],
        rows: [
          { label: "Pengajuan cuti", helper: "Butuh konfirmasi sisa kuota dan jadwal kerja", status: "Atasan 1" },
          { label: "Dokumen kontrak", helper: "Template final siap diunduh", status: "Final" },
          { label: "Offboarding", helper: "Checklist aset dan akun sedang diverifikasi", status: "QA internal" },
        ],
      },
    ]}
    faqTitle="Pertanyaan yang biasanya muncul saat organisasi mulai masuk ke HR"
    faqs={[
      {
        question: "Kalau AbsensiKu awalnya fokus absensi, kenapa perlu modul HR?",
        answer:
          "Karena begitu absensi harian mulai stabil, organisasi biasanya mulai kesulitan mengelola data pegawai, cuti, dokumen, dan approval secara manual. Modul HR diposisikan untuk merapikan proses itu tanpa memutus fondasi absensi yang sudah berjalan.",
      },
      {
        question: "Apakah tim harus input ulang data pegawai jika mulai memakai HR?",
        answer:
          "Tidak seharusnya. Arah solusi ini justru menjaga agar tenant, role, struktur organisasi, dan data operasional tetap dalam satu alur sehingga HR menjadi perluasan, bukan sistem terpisah yang harus diisi ulang dari nol.",
      },
      {
        question: "Kapan waktu yang tepat organisasi mulai memakai modul HR?",
        answer:
          "Biasanya ketika tantangan utama bukan lagi check-in dan check-out, melainkan pengelolaan cuti, approval bertingkat, onboarding, offboarding, atau kebutuhan dokumentasi yang makin kompleks.",
      },
      {
        question: "Apakah HR langsung bisa diedit penuh saat pertama kali dibuka?",
        answer:
          "Tidak selalu. Organisasi biasanya melalui tahap bertahap: fondasi absensi disiapkan dulu, lalu modul HR dibuka untuk ditinjau, dan pengelolaan penuh mengikuti tahap aktivasi organisasi yang berlaku.",
      },
      {
        question: "Apa arti mode lihat saja pada HR?",
        answer:
          "Mode lihat saja berarti menu HR sudah bisa dibuka untuk dipelajari, tetapi data belum bisa ditambah atau diubah. Tahap ini membantu organisasi memahami alur kerja sebelum pengelolaan penuh dibuka.",
      },
      {
        question: "Apa hubungan modul HR dengan data absensi?",
        answer:
          "Data absensi tetap menjadi fondasi konteks operasional. HR memanfaatkan konteks itu untuk membuat keputusan dan proses SDM lebih akurat, misalnya saat membaca kehadiran, jadwal, histori pegawai, dan approval.",
      },
    ]}
    primaryCtaLabel="Mulai Gratis dari Absensi"
    primaryCtaTo="/org/login?mode=register"
    secondaryCtaLabel="Konsultasi Kebutuhan HR"
    secondaryCtaTo={PUBLIC_CONSULTATION_PATH}
  />
);

export default HRLanding;
