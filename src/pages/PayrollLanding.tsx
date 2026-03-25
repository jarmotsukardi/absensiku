import { Calculator, Landmark, ReceiptText } from "lucide-react";

import { SolutionLandingPage } from "@/components/public/SolutionLandingPage";
import { PUBLIC_CONSULTATION_PATH } from "@/lib/publicRoutes";

const PayrollLanding = () => (
  <SolutionLandingPage
    path="/payroll"
    seoTitle="Jalur Lanjutan Payroll | AbsensiKu"
    seoDescription="Jajaki tahap lanjutan payroll setelah fondasi Absensi dan HR organisasi cukup rapi, mulai dari komponen gaji, validasi, slip, pembayaran, dan audit."
    badge="Tahap Lanjutan Payroll"
    title="Siapkan proses payroll"
    subtitle="setelah data Absensi dan HR organisasi sudah cukup rapi."
    description="Payroll di AbsensiKu diposisikan sebagai pelengkap setelah organisasi stabil pada absensi dan proses HR. Fokusnya adalah komponen gaji, periode payroll, validasi, approval, slip, pembayaran, dan audit yang mengambil dasar dari data kehadiran, cuti, status pegawai, dan struktur organisasi yang sama."
    highlights={[
      { label: "Peran solusi", value: "Tahap lanjutan setelah Absensi + HR" },
      { label: "Fokus utama", value: "Payroll run + approval" },
      { label: "Output akhir", value: "Slip, pembayaran, audit" },
    ]}
    pillars={[
      {
        title: "Engine payroll",
        description: "Kelola komponen pendapatan, potongan, input variabel, periode payroll, dan validasi sebelum proses final dijalankan.",
        icon: Calculator,
      },
      {
        title: "Distribusi dan kepatuhan",
        description: "Pantau approval payroll, slip gaji, pembayaran, serta kebutuhan pajak atau compliance dalam satu alur kerja yang jelas.",
        icon: Landmark,
      },
      {
        title: "Audit dan kontrol",
        description: "Sediakan jejak proses payroll yang jelas agar operator, approver, auditor, dan pimpinan membaca status yang sama.",
        icon: ReceiptText,
      },
    ]}
    modulesTitle="Modul payroll yang paling penting saat operasi sudah matang"
    modulesDescription="Payroll di sini diposisikan sebagai tahap lanjutan. Fokusnya pada modul-modul yang membantu operator menutup periode gaji lebih cepat, lebih rapi, dan lebih mudah ditelusuri."
    modules={[
      {
        title: "Komponen dan Periode Payroll",
        description: "Siapkan fondasi perhitungan agar setiap periode gaji berjalan dengan struktur komponen yang jelas.",
        bullets: [
          "Pendapatan, potongan, dan input variabel lebih terstruktur",
          "Periode payroll tidak lagi bergantung pada file manual yang tersebar",
          "Memudahkan validasi hasil sebelum payroll dipublikasikan",
        ],
      },
      {
        title: "Approval dan Validasi",
        description: "Pastikan hasil payroll diperiksa lebih dulu sebelum slip atau pembayaran dibuka ke pegawai.",
        bullets: [
          "Approval membantu mengurangi risiko salah hitung yang lolos terlalu cepat",
          "Status proses lebih jelas untuk operator, approver, dan pimpinan",
          "Audit proses payroll lebih rapi dibanding alur manual lintas file",
        ],
      },
      {
        title: "Slip, Pembayaran, dan Audit",
        description: "Tutup satu periode payroll dengan output yang siap dibaca pegawai sekaligus tetap aman untuk kebutuhan review.",
        bullets: [
          "Slip gaji, pembayaran, dan histori proses tetap berada di ekosistem yang sama",
          "Mudah melacak komplain, koreksi, atau kebutuhan audit per periode",
          "Mengurangi kerja ulang saat perlu menelusuri asal perubahan hasil payroll",
        ],
      },
    ]}
    workflows={[
      "Tarik dasar perhitungan dari data kehadiran, cuti, status pegawai, dan komponen kompensasi yang sudah aktif di organisasi.",
      "Jalankan validasi payroll, approval, dan pengecekan hasil sebelum slip atau pembayaran dipublikasikan ke pegawai.",
      "Gunakan audit log dan laporan payroll untuk memastikan setiap periode punya jejak proses yang rapi, akurat, dan bisa ditelusuri.",
    ]}
    integrationsTitle="Payroll dibuat untuk menutup operasi yang sudah sehat dari sisi absensi."
    integrationsDescription="Karena fondasinya tetap absensi dan HR, tim payroll tidak perlu menarik data dari banyak sumber yang tidak sinkron. Modul ini diposisikan sebagai tahap lanjutan bagi organisasi yang ingin mempercepat proses gaji tetapi tetap menjaga kontrol, approval, dan audit."
    proofPoints={[
      "Cocok saat organisasi sudah tidak kesulitan lagi pada absensi harian dan ingin mengurangi kerja manual saat periode payroll.",
      "Memakai dasar data yang sama dari kehadiran, cuti, status pegawai, dan struktur organisasi agar perhitungan lebih konsisten.",
      "Membantu operator payroll memeriksa komponen, approval, dan hasil final tanpa memindah-mindah spreadsheet atau sumber data.",
      "Menjaga histori proses payroll tetap bisa ditelusuri saat ada komplain, koreksi, atau kebutuhan audit.",
    ]}
    integrationBullets={[
      "Data hadir, cuti, dan status pegawai menjadi dasar proses payroll",
      "Approval payroll tetap nyambung dengan role dan tenant yang sama",
      "Slip, pembayaran, dan audit log dibangun di atas data operasional yang konsisten",
      "Tim payroll tidak perlu merakit ulang data dari banyak sistem terpisah",
    ]}
    previewTitle="Gambaran visual area kerja payroll yang menutup satu periode"
    previewDescription="Preview ini memakai tampilan modul nyata agar calon pengguna langsung memahami seperti apa alur payroll saat data kehadiran, komponen gaji, approval, dan hasil final terbaca dalam satu workspace."
    previews={[
      {
        title: "Kontrol Periode Payroll",
        subtitle: "Membantu operator membaca progres periode dan titik yang masih perlu divalidasi.",
        badge: "Run Payroll",
        imageSrc: "/manuals/screenshots/payroll/07-payroll-inti-periode-payroll.png",
        imageAlt: "Tampilan periode payroll",
        progressLabel: "Kesiapan periode bulan berjalan",
        progressValue: 78,
        metrics: [
          { label: "Pegawai", value: "1.248" },
          { label: "Draft slip", value: "1.192" },
          { label: "Variance", value: "18" },
        ],
        rows: [
          { label: "Input variabel", helper: "Insentif lembur dan potongan final", status: "Cek akhir" },
          { label: "Validasi hasil", helper: "Selisih gaji 18 pegawai perlu review", status: "Perlu audit" },
          { label: "Approval periode", helper: "Menunggu persetujuan pejabat payroll", status: "Menunggu" },
        ],
      },
      {
        title: "Slip, Pembayaran, dan Audit",
        subtitle: "Menunjukkan bagaimana output payroll dibaca setelah proses final berjalan.",
        badge: "Distribusi Payroll",
        imageSrc: "/manuals/screenshots/payroll/09-payroll-inti-validasi-payroll.png",
        imageAlt: "Tampilan validasi payroll",
        progressLabel: "Distribusi slip dan pembayaran",
        progressValue: 91,
        metrics: [
          { label: "Slip siap", value: "1.176" },
          { label: "Bayar", value: "Rp8,4M" },
          { label: "Audit log", value: "124" },
        ],
        rows: [
          { label: "Slip gaji", helper: "Mayoritas pegawai sudah siap publish", status: "Siap kirim" },
          { label: "Pembayaran batch", helper: "Transfer bank tahap 2 sedang diproses", status: "Diproses" },
          { label: "Jejak perubahan", helper: "Semua revisi komponen tercatat pada audit", status: "Terlacak" },
        ],
      },
    ]}
    faqTitle="Pertanyaan yang biasanya muncul saat organisasi masuk ke Payroll"
    faqs={[
      {
        question: "Kenapa payroll diposisikan sebagai pelengkap, bukan produk utama?",
        answer:
          "Karena payroll paling kuat saat fondasi absensi dan proses HR sudah rapi. Dengan positioning ini, payroll bekerja di atas data operasional yang lebih konsisten, bukan berdiri sendiri dan memaksa tim merakit ulang data dari banyak sumber.",
      },
      {
        question: "Apakah payroll di sini tetap mengambil data dari absensi?",
        answer:
          "Ya. Arah produknya justru begitu: data hadir, cuti, status pegawai, dan struktur organisasi menjadi konteks dasar agar payroll lebih akurat dan tidak bergantung pada banyak input manual yang rawan selisih.",
      },
      {
        question: "Kapan organisasi sebaiknya mulai memakai modul payroll?",
        answer:
          "Biasanya ketika masalah utama sudah bergeser dari kedisiplinan absensi ke beban kerja saat tutup periode gaji, validasi hasil, approval, distribusi slip, dan kebutuhan audit yang makin rutin.",
      },
      {
        question: "Apa manfaat paling cepat terasa untuk tim payroll?",
        answer:
          "Tim payroll biasanya paling cepat merasakan manfaat pada konsistensi sumber data, kejelasan approval, pengurangan kerja manual lintas spreadsheet, dan kemudahan menelusuri hasil atau koreksi per periode.",
      },
    ]}
    primaryCtaLabel="Mulai Gratis dari Absensi"
    primaryCtaTo="/org/login?mode=register"
    secondaryCtaLabel="Konsultasi Kebutuhan Payroll"
    secondaryCtaTo={PUBLIC_CONSULTATION_PATH}
  />
);

export default PayrollLanding;
