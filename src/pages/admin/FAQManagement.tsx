import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Edit, HelpCircle, Save, Search, Sparkles } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import {
  FAQ_AUDIENCE_BADGE_CLASSNAME,
  FAQ_AUDIENCE_LABEL,
  inferFaqAudience,
  isFaqAudience,
  isFaqVisibleToPublic,
  shouldAutoCorrectLegacyAudience,
} from "@/lib/faqAudience";
import type { FaqAudience } from "@/lib/faqAudience";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  audience?: FaqAudience;
}

interface FAQSettingsValue {
  items?: FAQ[];
  banner_image_url?: string;
  auto_sync_recommended?: boolean;
  auto_sync_last_run_at?: string;
  auto_sync_last_result?: {
    additions: number;
    updated: number;
    source: string;
  } | null;
}

const normalizeFaqItem = (item: FAQ): FAQ => {
  const inferredAudience = inferFaqAudience({
    category: item.category,
    question: item.question,
    answer: item.answer,
  });
  const currentAudience = isFaqAudience(item.audience) ? item.audience : undefined;
  const audience =
    shouldAutoCorrectLegacyAudience({
      currentAudience,
      category: item.category,
      question: item.question,
      answer: item.answer,
    })
      ? inferredAudience
      : (currentAudience ?? inferredAudience);

  return {
    ...item,
    audience,
  };
};

const resolveAudienceForFilter = (faq: FAQ): FaqAudience => {
  return (
    faq.audience ??
    inferFaqAudience({
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
    })
  );
};

const matchesAudienceFilter = (faq: FAQ, filter: "all" | FaqAudience): boolean => {
  if (filter === "all") return true;
  if (filter === "public") {
    return isFaqVisibleToPublic({
      audience: faq.audience,
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
    });
  }
  return resolveAudienceForFilter(faq) === filter;
};

const ITEMS_PER_PAGE = 10;
type RecommendedFAQUpdate = {
  question: string;
  answer: string;
  category: string;
  audience?: FaqAudience;
};

const PUBLIC_RECOMMENDED_FAQ_UPDATES: RecommendedFAQUpdate[] = [
  {
    question: "Apa fitur utama AbsensiKu untuk instansi?",
    answer:
      "AbsensiKu menyediakan absensi GPS, pengajuan izin/cuti/lembur/WFH, dashboard kehadiran realtime, laporan, notifikasi, dan audit log. Semua dirancang agar operasional harian instansi lebih cepat dan tertib.",
    category: "Fitur Utama",
    audience: "public",
  },
  {
    question: "Apakah sistem mendukung geofence dan radius absensi?",
    answer:
      "Ya. Admin dapat mengatur titik lokasi kerja dan radius validasi agar absensi hanya dilakukan di area yang ditentukan. Ini membantu mencegah absensi dari lokasi yang tidak sah.",
    category: "Fitur Utama",
    audience: "public",
  },
  {
    question: "Apakah sistem mendukung kerja shift dan non-shift?",
    answer:
      "Ya. Anda dapat mengelola pola kerja reguler maupun shift dengan aturan jam kerja, toleransi keterlambatan, dan pengaturan hari kerja yang fleksibel.",
    category: "Fitur Utama",
    audience: "public",
  },
  {
    question: "Apakah tersedia pengajuan izin, cuti, lembur, dan WFH?",
    answer:
      "Ya. Semua permohonan tersebut tersedia dalam satu alur, lengkap dengan proses persetujuan dan pelacakan status agar transparan bagi pegawai dan admin.",
    category: "Fitur Utama",
    audience: "public",
  },
  {
    question: "Apakah tersedia dashboard kehadiran realtime?",
    answer:
      "Ya. Dasbor menampilkan ringkasan kehadiran harian, status keterlambatan, serta indikator operasional penting agar pimpinan cepat mengambil keputusan.",
    category: "Fitur Utama",
    audience: "public",
  },
  {
    question: "Apakah ada notifikasi otomatis untuk aktivitas penting?",
    answer:
      "Ya. Sistem mendukung notifikasi in-app, email, dan kanal lain sesuai konfigurasi agar pengajuan, verifikasi, dan peringatan penting tidak terlewat.",
    category: "Fitur Utama",
    audience: "public",
  },
  {
    question: "Bagaimana skema harga AbsensiKu dihitung?",
    answer:
      "Perhitungan harga berbasis jumlah pegawai aktif dan durasi paket yang dipilih. Simulasi biaya dapat dilihat langsung melalui kalkulator langganan sebelum membuat invoice.",
    category: "Harga & Paket",
    audience: "public",
  },
  {
    question: "Apakah tersedia paket bulanan, triwulanan, semester, dan tahunan?",
    answer:
      "Ya. Paket langganan tersedia dalam beberapa durasi agar instansi bisa menyesuaikan kebutuhan operasional dan anggaran.",
    category: "Harga & Paket",
    audience: "public",
  },
  {
    question: "Apakah ada biaya implementasi awal?",
    answer:
      "Biaya implementasi mengikuti kebijakan paket dan kebutuhan instansi. Untuk kebutuhan khusus, tim kami dapat memberikan skema implementasi yang sesuai.",
    category: "Harga & Paket",
    audience: "public",
  },
  {
    question: "Apakah total invoice sudah final tanpa hitung pajak manual?",
    answer:
      "Ya. Nilai invoice yang tampil ke pelanggan adalah nilai final pembayaran. Instansi tidak perlu menghitung komponen biaya internal secara manual.",
    category: "Harga & Paket",
    audience: "public",
  },
  {
    question: "Bagaimana jika jumlah pegawai berubah di tengah periode?",
    answer:
      "Perubahan jumlah pegawai akan memengaruhi simulasi pada periode berikutnya sesuai kebijakan paket aktif. Rinciannya dapat dilihat di modul billing organisasi.",
    category: "Harga & Paket",
    audience: "public",
  },
  {
    question: "Apakah tersedia negosiasi untuk instansi dengan skala besar?",
    answer:
      "Ya. Untuk kebutuhan B2B/enterprise dengan volume besar, tersedia mekanisme evaluasi dan penawaran harga khusus oleh tim admin pusat.",
    category: "Harga & Paket",
    audience: "public",
  },
  {
    question: "Bagaimana keamanan data absensi disimpan?",
    answer:
      "Data absensi disimpan terpusat dengan kontrol akses berbasis peran, jejak aktivitas, dan praktik keamanan aplikasi untuk menjaga kerahasiaan serta integritas data.",
    category: "Keamanan & Privasi",
    audience: "public",
  },
  {
    question: "Apakah aktivitas admin dan pengguna tercatat?",
    answer:
      "Ya. Aktivitas penting dicatat dalam audit log agar memudahkan pelacakan perubahan, investigasi, dan kepatuhan operasional.",
    category: "Keamanan & Privasi",
    audience: "public",
  },
  {
    question: "Apakah akses pengguna bisa dibatasi sesuai peran?",
    answer:
      "Ya. Sistem mendukung pembagian hak akses seperti super admin, admin organisasi, operator, dan pegawai agar setiap akun hanya melihat fitur yang relevan.",
    category: "Keamanan & Privasi",
    audience: "public",
  },
  {
    question: "Bagaimana sistem mencegah manipulasi absensi?",
    answer:
      "Sistem menggunakan validasi lokasi, aturan jadwal, dan kontrol operasional lainnya untuk meminimalkan penyalahgunaan serta meningkatkan akurasi data kehadiran.",
    category: "Keamanan & Privasi",
    audience: "public",
  },
  {
    question: "Apakah data dapat diarsipkan sesuai kebijakan retensi?",
    answer:
      "Ya. Data operasional dan log dapat mengikuti kebijakan retensi agar performa tetap terjaga tanpa menghilangkan kebutuhan audit.",
    category: "Keamanan & Privasi",
    audience: "public",
  },
  {
    question: "Bagaimana pemulihan jika terjadi gangguan layanan?",
    answer:
      "Sistem menyediakan mekanisme pemantauan dan prosedur pemulihan bertahap. Tim admin dapat menindaklanjuti cepat berdasarkan log dan indikator kesehatan sistem.",
    category: "Keamanan & Privasi",
    audience: "public",
  },
  {
    question: "Berapa lama implementasi sampai organisasi siap pakai?",
    answer:
      "Waktu implementasi bergantung pada kesiapan data awal dan skala organisasi. Dengan templat onboarding, proses setup umumnya jauh lebih cepat.",
    category: "Implementasi & Onboarding",
    audience: "public",
  },
  {
    question: "Apakah ada wizard setup awal organisasi?",
    answer:
      "Ya. Tersedia wizard onboarding untuk membantu pengisian data dasar seperti OPD, unit kerja, jabatan (global tenant), jam kerja, batas absen, dan konten awal.",
    category: "Implementasi & Onboarding",
    audience: "public",
  },
  {
    question: "Apakah bisa impor data pegawai secara massal?",
    answer:
      "Ya. Admin dapat melakukan impor data pegawai dengan templat yang disediakan untuk mempercepat migrasi dari sistem lama.",
    category: "Implementasi & Onboarding",
    audience: "public",
  },
  {
    question: "Apakah tim kami mendapat panduan saat onboarding?",
    answer:
      "Ya. Proses onboarding didukung panduan modul, glosarium, dan FAQ agar admin organisasi memahami alur setup dan operasional sejak awal.",
    category: "Implementasi & Onboarding",
    audience: "public",
  },
  {
    question: "Apa yang perlu disiapkan sebelum peluncuran operasional?",
    answer:
      "Siapkan struktur organisasi, data pegawai, lokasi kerja, jam kerja, serta kebijakan izin/cuti. Dengan data ini, aktivasi operasional dapat berjalan lebih mulus.",
    category: "Implementasi & Onboarding",
    audience: "public",
  },
  {
    question: "Bagaimana proses pelatihan admin organisasi dilakukan?",
    answer:
      "Training difokuskan pada alur harian: master data, permohonan, laporan, notifikasi, dan billing. Tujuannya agar tim admin siap mengelola sistem secara mandiri.",
    category: "Implementasi & Onboarding",
    audience: "public",
  },
  {
    question: "Apakah AbsensiKu bisa diintegrasikan dengan sistem HR atau payroll?",
    answer:
      "Ya. Integrasi dapat disesuaikan dengan kebutuhan data dan proses internal instansi agar alur SDM lebih terhubung.",
    category: "Integrasi & Dukungan",
    audience: "public",
  },
  {
    question: "Apakah tersedia API atau webhook untuk integrasi?",
    answer:
      "Tersedia opsi integrasi untuk kebutuhan otomatisasi dan sinkronisasi. Rincian implementasi mengikuti kebijakan dan kesiapan teknis masing-masing instansi.",
    category: "Integrasi & Dukungan",
    audience: "public",
  },
  {
    question: "Kanal dukungan apa saja yang tersedia untuk pelanggan?",
    answer:
      "Dukungan tersedia melalui FAQ, bantuan in-app, tiket bantuan organisasi, serta kanal komunikasi lain sesuai pengaturan layanan aktif.",
    category: "Integrasi & Dukungan",
    audience: "public",
  },
  {
    question: "Bagaimana alur tiket bantuan untuk pelanggan aktif?",
    answer:
      "Pelanggan aktif dapat membuat tiket dari menu bantuan organisasi. Tiket masuk ke panel admin untuk ditindaklanjuti dan dipantau hingga selesai.",
    category: "Integrasi & Dukungan",
    audience: "public",
  },
  {
    question: "Bagaimana target waktu respon dukungan teknis?",
    answer:
      "Waktu respon mengikuti prioritas insiden dan kanal dukungan yang digunakan. Kasus kritis akan diproses lebih cepat sesuai tingkat urgensi.",
    category: "Integrasi & Dukungan",
    audience: "public",
  },
  {
    question: "Apakah ada FAQ berbeda untuk publik, pegawai, admin organisasi, dan super admin?",
    answer:
      "Ya. Konten FAQ dipisahkan per audiens agar informasi yang tampil lebih relevan: publik, pegawai, admin organisasi, dan super admin.",
    category: "Integrasi & Dukungan",
    audience: "public",
  },
];

const RECOMMENDED_FAQ_UPDATES: RecommendedFAQUpdate[] = [
  ...PUBLIC_RECOMMENDED_FAQ_UPDATES,
  {
    question: "MCP apa yang diprioritaskan untuk investigasi dan validasi operasional repo ini?",
    answer:
      "Prioritaskan filesystem, Playwright, memory, dan context7. Jika butuh akses GitHub atau inspeksi DB remote, mulai dari mode read-only lalu naikkan izin hanya untuk task yang eksplisit.",
    category: "Operasional",
    audience: "super_admin",
  },
  {
    question: "Kenapa akses Supabase remote sebaiknya read-only secara default?",
    answer:
      "Karena Supabase remote adalah source of truth. Aksi tulis seperti migration, cleanup data, perubahan auth, billing, role, atau policy dapat berdampak langsung ke environment aktif sehingga harus explicit per task dan didahului backup.",
    category: "Operasional",
    audience: "super_admin",
  },
  {
    question: "Bagaimana mematikan log error global tetapi tetap mengaktifkan untuk tenant tertentu?",
    answer:
      "Buka /admin/error-logs, set Mode Log Error ke paused lalu simpan. Jika ada permintaan dari admin organisasi, gunakan bagian Override Tenant untuk memilih tenant dan pilih mode full atau critical_only. Override ini disimpan di client_error_logging_policy dan hanya bisa diatur super admin.",
    category: "Operasional",
    audience: "super_admin",
  },
  {
    question: "Di mana log error payroll dikelola dan kapan diprioritaskan?",
    answer:
      "Log error payroll hanya tersedia untuk super admin di /admin/payroll/error-logs. Halaman ini diprioritaskan saat progres payroll mendekati 75% untuk mempercepat triase error lintas tenant.",
    category: "Operasional",
    audience: "super_admin",
  },
  {
    question: "Bagaimana menonaktifkan audit trail per tenant dan apa risikonya?",
    answer:
      "Gunakan kebijakan audit_logs_activity_policy: default_org_logging_enabled untuk global, dan tenant_overrides untuk tenant tertentu. Menonaktifkan audit menurunkan beban tulis/retensi, tetapi menghilangkan jejak aktivitas untuk investigasi, compliance, dan sengketa data.",
    category: "Operasional",
    audience: "super_admin",
  },
  {
    question: "Apa preflight wajib sebelum menjalankan test browser di localhost?",
    answer:
      "Jalankan npm run ops:sandbox:doctor:strict terlebih dahulu. Jika doctor gagal, jangan lanjutkan suite browser sampai environment localhost siap agar hasil test tidak menyesatkan.",
    category: "Operasional",
    audience: "org_admin",
  },
  {
    question: "Di mana menemukan dokumen manual setelah menu Download dihapus dari sidebar?",
    answer:
      "Menu Download tidak lagi ditampilkan di sidebar absensi/HR/payroll. Dokumen manual tetap bisa diakses lewat tautan langsung yang dibagikan admin atau melalui /manuals/index.html.",
    category: "Operasional",
    audience: "org_admin",
  },
  {
    question: "Bagaimana sumber jawaban Chat Agent di halaman utama ditentukan?",
    answer:
      "Chat Agent membaca konteks dari data sistem: fitur (features_settings), paket harga (subscription_packages/pricing_settings), FAQ (faq_settings), dan artikel (articles). Jika data belum lengkap, perbarui dulu di modul terkait lalu refresh halaman utama.",
    category: "Landing & Chat Agent",
  },
  {
    question: "Kenapa jawaban Chat Agent bisa terlihat ringkas?",
    answer:
      "Jawaban chat dibuat singkat agar cepat dibaca. Rincian penuh tetap ada di FAQ, halaman fitur, harga, dan artikel. Gunakan pertanyaan lebih spesifik untuk hasil yang lebih lengkap.",
    category: "Landing & Chat Agent",
  },
  {
    question: "Bagaimana alur penawaran harga saat jumlah pegawai menembus ambang B2B?",
    answer:
      "Saat pegawai aktif melampaui ambang negosiasi (bawaan 2.001), sistem menandai tenant untuk penawaran B2B dan mengirim notifikasi ke Admin Organisasi serta Super Admin agar dilakukan tindak lanjut manual.",
    category: "Billing & Harga",
  },
  {
    question: "Apakah jejak pembayaran selalu dicatat meski audit trail umum dimatikan?",
    answer:
      "Ya. Aktivitas pembayaran kritikal seperti verifikasi pembayaran manual dan review topup wallet tetap mencatat audit log untuk kebutuhan compliance dan investigasi, walau audit trail tenant lain dimatikan.",
    category: "Billing & Harga",
    audience: "super_admin",
  },
  {
    question: "Apakah paket harga publik sama persis dengan invoice internal?",
    answer:
      "Harga publik adalah referensi. Invoice internal mengikuti aturan billing tenant yang aktif: durasi paket, diskon, skema streak, dan harga negosiasi jika ada persetujuan B2B/manual.",
    category: "Billing & Harga",
  },
  {
    question: "Apa arti indikator Kesehatan Nomor Faktur di /admin/billing?",
    answer:
      "Indikator ini memeriksa format nomor faktur terhadap pola INV-YYYYMM-####. Status Sehat berarti semua format valid. Status Tidak Sehat berarti ada faktur yang formatnya tidak standar dan perlu ditinjau.",
    category: "Billing & Harga",
  },
  {
    question: "Bagaimana menindaklanjuti status Kesehatan Nomor Faktur yang Tidak Sehat?",
    answer:
      "Klik kartu Kesehatan Nomor Faktur di /admin/billing untuk membuka daftar faktur bermasalah. Perbaiki sumber pembuatan invoice (UI/RPC/trigger) lalu cek ulang sampai jumlah invalid menjadi 0.",
    category: "Billing & Harga",
  },
  {
    question: "Kapan snapshot kesehatan nomor faktur dijalankan otomatis?",
    answer:
      "Snapshot dijalankan harian oleh job cron invoice-number-health-daily pada 00:15 WIB (17:15 UTC). Data ini dipakai untuk monitoring tren valid/invalid nomor faktur di panel admin.",
    category: "Operasional",
  },
  {
    question: "Bagaimana cara membayar faktur dari menu /org/billing?",
    answer:
      "Buka /org/billing lalu klik nomor faktur atau status untuk membuka detail. Jika invoice memiliki link online, gunakan tombol Buka Link Pembayaran. Untuk transfer manual, isi Nominal Transfer Aktual, centang deklarasi kesesuaian nominal, upload file bukti, lalu kirim untuk verifikasi admin.",
    category: "Billing & Harga",
  },
  {
    question: "Di mana pegawai melakukan pembayaran Billing Mandiri?",
    answer:
      "Pegawai melakukan pembayaran di menu Billing pada dashboard pegawai, atau langsung lewat halaman /employee/billing. Di halaman ini pegawai bisa membuat invoice baru, melanjutkan pembayaran, dan melihat riwayat invoice pribadi.",
    category: "Billing & Harga",
    audience: "employee",
  },
  {
    question: "Bagaimana cara pegawai mengirim konfirmasi transfer manual?",
    answer:
      "Pada riwayat invoice di /employee/billing, klik Konfirmasi Transfer pada invoice manual yang masih aktif. Isi tanggal transfer, isi nomor referensi jika ada, centang deklarasi transfer, lalu kirim. Status invoice akan berubah menjadi menunggu verifikasi admin.",
    category: "Billing & Harga",
    audience: "employee",
  },
  {
    question: "Kenapa muncul popup 'Invoice tujuan tidak ditemukan' di /org/billing?",
    answer:
      "Popup ini muncul saat tautan deep-link invoice mengarah ke nomor faktur yang sudah tidak ada atau sudah berubah status. Sistem otomatis mengarahkan kembali ke daftar faktur terbaru agar admin tetap bisa lanjut dari data valid.",
    category: "Billing & Harga",
  },
  {
    question: "Apa yang terjadi jika Xendit tidak aktif saat pegawai klik Lanjutkan Pembayaran?",
    answer:
      "Sistem menampilkan overlay informasi bahwa Xendit nonaktif lalu mengarahkan pegawai ke alur transfer manual. Setelah itu pegawai bisa lanjut ke dialog Konfirmasi Transfer tanpa membuat alur pembayaran online.",
    category: "Billing & Harga",
    audience: "employee",
  },
  {
    question: "Apa yang tampil di billing pegawai jika organisasi memakai billing terpusat?",
    answer:
      "Halaman /employee/billing menampilkan informasi bahwa pembayaran dikelola admin organisasi. Pegawai tidak perlu membuat invoice sendiri, dan dapat kembali ke dashboard untuk aktivitas harian.",
    category: "Billing & Harga",
    audience: "employee",
  },
  {
    question: "Kenapa setelah login pegawai terkadang kembali ke halaman login?",
    answer:
      "Aplikasi melakukan verifikasi sesi secara otomatis sebelum dashboard ditampilkan. Pada koneksi lambat, proses ini bisa terlihat seperti kembali ke login. Tunggu proses sinkron selesai, lalu coba login ulang jika diperlukan.",
    category: "Keamanan Sesi & Notifikasi",
    audience: "employee",
  },
  {
    question: "Apa arti pesan realtime notifikasi sedang bermasalah di dashboard pegawai?",
    answer:
      "Pesan ini berarti koneksi realtime ke server sedang tidak stabil. Data absensi dan pengajuan tetap tersimpan. Untuk menyegarkan notifikasi, buka tab Notifikasi atau lakukan refresh saat koneksi membaik.",
    category: "Keamanan Sesi & Notifikasi",
    audience: "employee",
  },
  {
    question: "Bagaimana cara memastikan notifikasi terbaru pegawai sudah tersinkron?",
    answer:
      "Masuk ke tab Notifikasi pada dashboard pegawai. Saat tab ini dibuka, sistem akan memuat ulang notifikasi terbaru. Jika perlu, lakukan refresh manual di tab tersebut.",
    category: "Keamanan Sesi & Notifikasi",
    audience: "employee",
  },
  {
    question: "Apa arti status faktur terbaru seperti Verifikasi Penuh, Verifikasi Parsial, Cicilan Aktif, dan Ditolak - Revisi?",
    answer:
      "Menunggu Pembayaran berarti tagihan belum dibayar. Verifikasi Penuh berarti nominal yang diklaim user sama dengan nominal tagihan dan menunggu verifikasi admin. Verifikasi Parsial berarti user mengirim nominal kurang dari sisa tagihan. Cicilan Aktif berarti ada pembayaran parsial yang sudah diverifikasi dan invoice masih memiliki sisa tagihan. Ditolak - Revisi berarti konfirmasi ditolak admin dan user wajib kirim ulang data pembayaran yang benar.",
    category: "Billing & Harga",
  },
  {
    question: "Bagaimana jika bukti bayar transfer ditolak oleh admin?",
    answer:
      "Alasan penolakan akan tampil pada detail faktur di /org/billing dengan banner merah Ditolak - Wajib Revisi. Sistem juga menampilkan total tagihan, total terverifikasi, nominal ditolak, dan sisa wajib bayar. User harus revisi nominal transfer aktual dan upload bukti baru.",
    category: "Billing & Harga",
  },
  {
    question: "Bagaimana sistem mencegah overpayment saat verifikasi manual?",
    answer:
      "Backend memblokir jika total pembayaran terverifikasi melebihi gross amount invoice. Saat klaim user tidak sama dengan verifikasi admin, sistem mencatat audit log mismatch agar bisa ditelusuri.",
    category: "Billing & Harga",
  },
  {
    question: "Kenapa rincian PPN/PPH tidak ditampilkan di invoice klien?",
    answer:
      "Sistem menghitung komponen pajak sebagai biaya internal platform. Tampilan invoice klien disederhanakan menjadi nilai total akhir tanpa menampilkan baris PPN/PPH secara terpisah.",
    category: "Billing & Harga",
  },
  {
    question: "Apakah kolom PPN dan PPH sekarang dipisah di admin billing?",
    answer:
      "Ya. Di tab Paket Langganan dan Laporan Keuangan, PPN dan PPH ditampilkan sebagai kolom terpisah agar mudah rekonsiliasi pajak. Namun invoice klien tetap menampilkan total final.",
    category: "Billing & Harga",
  },
  {
    question: "Apakah total invoice di /org/billing sudah final?",
    answer:
      "Ya. Nilai total invoice adalah nominal final yang harus dibayar tenant sesuai kebijakan billing aktif, sehingga admin organisasi tidak perlu menambahkan perhitungan pajak lagi di sisi klien.",
    category: "Billing & Harga",
  },
  {
    question: "Apakah kalkulator langganan di /org/activation menyimpan pilihan terakhir?",
    answer:
      "Ya. Pilihan paket dan jumlah member disimpan otomatis per tenant. Admin organisasi bisa klik 'Lanjut Buat Invoice' dari overlay kalkulator untuk langsung menuju blok metode pembayaran.",
    category: "Billing & Harga",
  },
  {
    question: "Kenapa daftar faktur di /org/billing kadang terlihat lama memuat?",
    answer:
      "Saat data masih diproses, tabel menampilkan status loading informatif. Jika tetap lama, klik Muat Ulang di header billing. Sistem juga menampilkan pesan fallback agar admin tahu proses masih berjalan, bukan halaman kosong/error.",
    category: "Billing & Harga",
  },
  {
    question: "Bagaimana membaca kondisi kosong di menu Billing organisasi?",
    answer:
      "Kondisi kosong berarti belum ada data valid untuk section tersebut, misalnya belum ada invoice, belum ada topup, atau belum ada transaksi wallet. UI menampilkan arahan aksi lanjut seperti Buka Penawaran, Reset Filter, atau Kirim Request Topup.",
    category: "Billing & Harga",
  },
  {
    question: "Apakah user akan mendapat WhatsApp setelah pembayaran diverifikasi admin?",
    answer:
      "Ya. Saat admin menyetujui pembayaran dan status invoice menjadi Lunas, sistem mengirim notifikasi WhatsApp ke kontak tenant (prioritas: PIC WhatsApp -> WhatsApp -> nomor telepon). Pastikan gateway WhatsApp aktif di pengaturan sistem.",
    category: "Billing & Harga",
  },
  {
    question: "Bagaimana jika notifikasi pembayaran (WhatsApp/Email) tidak terkirim?",
    answer:
      "Kegagalan pengiriman pasca verifikasi pembayaran dicatat ke pantauan error admin. Buka /admin/log-errors dan cari konteks notifikasi billing untuk melihat referensi error, trace, dan tindak lanjut konfigurasi gateway.",
    category: "Billing & Harga",
  },
  {
    question: "Bagaimana workflow streak sampai suspend jika tenant tidak membayar?",
    answer:
      "Status bergerak dari tracking -> ready_for_invoicing -> invoiced -> grace period. Jika tetap unpaid sampai batas grace berakhir, tenant masuk suspend otomatis sesuai konfigurasi streak.",
    category: "Pemantauan Streak",
  },
  {
    question: "Bagaimana mekanisme saat Xendit belum aktif dan pembayaran masih manual?",
    answer:
      "Sistem tetap berjalan dengan pembayaran manual (transfer + angka unik). Admin memverifikasi pembayaran, lalu status invoice diperbarui untuk mengaktifkan kembali layanan tenant.",
    category: "Pemantauan Streak",
  },
  {
    question: "Kapan pengingat invoice dikirim ke email dan WhatsApp?",
    answer:
      "Pengingat dikirim saat mendekati/masuk grace period oleh job terjadwal (cron/edge). Pastikan gateway aktif, secrets valid, dan data kontak tenant terisi.",
    category: "Pemantauan Streak",
  },
  {
    question: "Apa fungsi menu /admin/templates (Templat Onboarding Org)?",
    answer:
      "Menu ini adalah pusat templat setup awal tenant organisasi: OPD, unit kerja, jabatan global tenant, kantor, jam kerja, batas absen, pengumuman awal, dan pengaturan fitur agar organisasi baru tidak mulai dari nol.",
    category: "Onboarding Org",
  },
  {
    question: "Apakah jabatan harus diikat ke OPD atau satuan kerja?",
    answer:
      "Tidak wajib. Jabatan dapat dikelola sebagai daftar global per tenant agar pemilihan jabatan pegawai lebih cepat dan konsisten. OPD/satuan kerja tetap bisa dipakai untuk struktur organisasi pegawai.",
    category: "Master Data",
  },
  {
    question: "Bagaimana alur pilih jabatan saat input data pegawai?",
    answer:
      "Admin cukup memilih jabatan langsung dari daftar aktif tanpa menunggu pilihan OPD/satuan kerja. Ini mengurangi langkah input dan mencegah kebingungan saat struktur unit berubah.",
    category: "Master Data",
  },
  {
    question: "Bagaimana alur setup awal organisasi setelah profil organisasi selesai?",
    answer:
      "Setelah profil organisasi disimpan, admin organisasi diarahkan ke /org/onboarding. Di sana ada checklist modul dan tombol Terapkan Templat Admin secara aman.",
    category: "Onboarding Org",
  },
  {
    question: "Apa arti 'Terapkan Aman' pada templat onboarding organisasi?",
    answer:
      "Terapkan Aman hanya mengisi modul yang masih kosong dan tidak menimpa data tenant yang sudah ada. Ini menjaga setup tetap konsisten tanpa merusak konfigurasi berjalan.",
    category: "Onboarding Org",
  },
  {
    question: "Apa fungsi menu /admin/schedule/absence-limits?",
    answer:
      "Menu ini adalah templat global batas absen untuk tenant baru. Aturan di sini disalin sebagai bawaan ketika organisasi baru dibuat oleh Super Admin.",
    category: "Templat Tenant",
  },
  {
    question: "Bagaimana cara menerapkan ulang templat batas absen di organisasi?",
    answer:
      "Di /org/schedule/absence-limits gunakan tombol 'Terapkan Templat Admin'. Tombol ini biasanya hanya bekerja bila aturan tenant masih kosong agar data berjalan tidak tertimpa.",
    category: "Templat Tenant",
  },
  {
    question: "Bagaimana toggle notifikasi pada Batas Absen organisasi bekerja?",
    answer:
      "Toggle global Enable/Disable menentukan apakah aturan batas absen boleh mengirim notifikasi ke pegawai. Jika Disable, notifikasi tidak dikirim walau rule aktif.",
    category: "Notifikasi",
  },
  {
    question: "Bagaimana mekanisme notifikasi dari Admin Organisasi ke pegawai?",
    answer:
      "Admin organisasi dapat menargetkan semua pegawai aktif, pegawai tertentu, OPD, atau unit kerja. Sistem mengirim ke akun aktif yang punya relasi user_id valid.",
    category: "Notifikasi",
  },
  {
    question: "Kenapa target penerima notifikasi bisa lebih sedikit dari jumlah pegawai aktif?",
    answer:
      "Biasanya karena sebagian data pegawai belum punya user_id, status tidak aktif, atau tidak masuk filter target (pegawai/OPD/unit kerja).",
    category: "Notifikasi",
  },
  {
    question: "Apakah notifikasi billing juga masuk ke riwayat notifikasi organisasi?",
    answer:
      "Ya. Notifikasi billing penting disimpan di notifikasi in-app organisasi untuk audit dan review, selain pengiriman ke email/WhatsApp.",
    category: "Notifikasi",
  },
  {
    question: "Kapan overlay peringatan keras notifikasi muncul di dashboard organisasi?",
    answer:
      "Overlay muncul saat ada notifikasi prioritas tinggi (billing, grace, suspend, atau permohonan kritis) yang belum ditindaklanjuti.",
    category: "Notifikasi",
  },
  {
    question: "Bagaimana cara kerja reset Device ID di dashboard pegawai?",
    answer:
      "Pegawai meminta OTP, memverifikasi kode, lalu reset perangkat. Kuota reset dihitung per bulan sesuai setting admin.",
    category: "Keamanan Pegawai",
  },
  {
    question: "Kenapa muncul pesan 'terlalu banyak permintaan' saat kirim OTP reset device?",
    answer:
      "Itu rate limit keamanan. Tunggu sesuai durasi lock yang dikonfigurasi admin, lalu coba lagi.",
    category: "Keamanan Pegawai",
  },
  {
    question: "Apa beda validasi perangkat di /admin/attendance-security dengan proteksi aplikasi seluler?",
    answer:
      "Validasi perangkat mengatur kebijakan akses browser/perangkat pada login absensi. Proteksi aplikasi seluler (APK/webview policy) adalah lapisan tambahan di sisi klien.",
    category: "Keamanan Pegawai",
  },
  {
    question: "Kenapa login/aksi penting bisa gagal dengan pesan sesi kedaluwarsa?",
    answer:
      "Token autentikasi sudah tidak valid. Solusi: logout/login ulang, lalu ulangi aksi. Sertakan Ref ID jika error berulang.",
    category: "Auth",
  },
  {
    question: "Bagaimana validasi impor pegawai agar data kantor/lokasi tidak rusak?",
    answer:
      "Gunakan validasi CSV sebelum impor, pastikan mapping kolom benar, dan pastikan referensi kantor/lokasi kerja valid dengan koordinat real.",
    category: "Master Data",
  },
  {
    question: "Bagaimana konsep Impor Pegawai dan Undangan Pegawai agar tidak bentrok?",
    answer:
      "Gunakan alur 2 tahap: (1) Impor Pegawai untuk membentuk master data pegawai, (2) Undangan Pegawai untuk aktivasi akun login. Sistem akan memprioritaskan data pegawai existing agar tidak membuat duplikasi akun/data.",
    category: "Master Data",
    audience: "org_admin",
  },
  {
    question: "Kenapa upload impor pegawai meminta Lokasi Kerja Mapping?",
    answer:
      "Mapping lokasi kerja dipakai sebagai fallback aman saat baris impor belum mengisi referensi lokasi valid. Tujuannya menjaga seluruh data pegawai tetap terhubung ke lokasi kerja yang sah dan mencegah relasi kosong.",
    category: "Master Data",
    audience: "org_admin",
  },
  {
    question: "Apakah templat impor pegawai mendukung format XLS?",
    answer:
      "Ya. Templat dapat diunduh dalam format CSV maupun XLS (kompatibel Excel). Isi data sesuai header templat terbaru agar validasi kolom berjalan otomatis saat upload.",
    category: "Master Data",
    audience: "org_admin",
  },
  {
    question: "Apa dampak jika modul Admin OPD/Jabatan/Kategori Pegawai/Golongan Pegawai dimatikan di Setup Awal?",
    answer:
      "Saat modul dimatikan, submenu terkait disembunyikan dan field terkait tidak ditampilkan pada form pegawai/import. Data operasional lain tetap berjalan; modul bisa diaktifkan kembali kapan saja dari Setup Awal.",
    category: "Onboarding Org",
    audience: "org_admin",
  },
  {
    question: "Bagaimana cara mengaktifkan kembali modul master data setelah sebelumnya dinonaktifkan?",
    answer:
      "Buka /org/onboarding, aktifkan toggle modul yang dibutuhkan, lalu simpan. Setelah aktif, submenu master data dan field terkait otomatis muncul kembali pada halaman pegawai/import sesuai konfigurasi terbaru.",
    category: "Onboarding Org",
    audience: "org_admin",
  },
  {
    question: "Apa arti status undangan 'reused' dan 'new' saat aktivasi akun pegawai?",
    answer:
      "'Reused' berarti sistem menemukan undangan pending yang masih aktif sehingga link/kode lama dipakai ulang. 'New' berarti sistem membuat kode undangan baru karena undangan sebelumnya tidak bisa dipakai (mis. kadaluarsa/terpakai).",
    category: "Master Data",
    audience: "org_admin",
  },
  {
    question: "Kenapa muncul label [AUTO-FIX] pada nama kantor?",
    answer:
      "Itu kantor sementara hasil auto-fix untuk menjaga relasi data tetap konsisten. Admin harus memperbarui nama, alamat, dan koordinat real agar status valid.",
    category: "Master Data",
  },
  {
    question: "Bagaimana mengisi latitude/longitude kantor atau lokasi kerja dengan cepat?",
    answer:
      "Gunakan picker peta (Leaflet/OpenStreetMap), klik titik peta untuk isi lat/lng otomatis, atau gunakan lokasi saat ini/clipboard koordinat.",
    category: "Master Data",
  },
  {
    question: "Apa fungsi toleransi keterlambatan pada data kantor?",
    answer:
      "Toleransi keterlambatan adalah batas menit tambahan sebelum status dianggap terlambat. Bawaan yang aman adalah 0 jika instansi tidak memakai toleransi.",
    category: "Jadwal & Absensi",
  },
  {
    question: "Bagaimana mekanisme shift kerja dibanding bawaan Senin-Jumat?",
    answer:
      "Gunakan konfigurasi jadwal/shift per tenant dan per pegawai. Hari kerja bisa Senin-Minggu dengan jam berbeda per shift, lalu status hadir mengikuti jadwal aktif pegawai.",
    category: "Jadwal & Absensi",
  },
  {
    question: "Bagaimana absensi tetap stabil saat trafik sangat tinggi (misalnya 500.000 pegawai)?",
    answer:
      "Gunakan mode offline-first, queue sinkronisasi, partisi data, snapshot dashboard, dan jadwal maintenance di luar jam puncak.",
    category: "Skalabilitas",
  },
  {
    question: "Apa yang terjadi jika pegawai sudah absen lalu HP mati sebelum sinkron?",
    answer:
      "Data tetap tersimpan lokal dan akan dikirim saat perangkat aktif serta koneksi kembali.",
    category: "Skalabilitas",
  },
  {
    question: "Apa fungsi tab Kesehatan Kapasitas di Pengaturan Skalabilitas?",
    answer:
      "Tab ini menampilkan skor kesehatan kapasitas dan indikator risiko beban agar admin bisa mengambil tindakan sebelum performa menurun.",
    category: "Skalabilitas",
  },
  {
    question: "Bagaimana cara membaca halaman /admin/cron-jobs saat fallback aktif?",
    answer:
      "Fallback berarti data runtime cron belum lengkap/siap. Halaman tetap menampilkan katalog task standar; jalankan migration cron terbaru lalu refresh.",
    category: "Operasional",
  },
  {
    question: "Bagaimana audit log agar tidak membebani sistem saat data membesar?",
    answer:
      "Terapkan retention hot/cold (mis. hot 60 hari), partisi, cleanup berkala, dan pagination di halaman audit.",
    category: "Operasional",
  },
  {
    question: "Bagaimana mekanisme auto cleanup tenant/user yang tidak lanjut pembayaran?",
    answer:
      "Lifecycle unpaid berjalan bertahap: reminder -> arsip/nonaktif -> purge. Tenant terlindungi (protected tenant code) dikecualikan dari penghapusan otomatis.",
    category: "Lifecycle Tenant",
  },
  {
    question: "Apakah data tenant terarsip tetap tercatat di database?",
    answer:
      "Ya, status arsip tetap tercatat untuk audit. Penghapusan permanen hanya dilakukan setelah melewati kebijakan retention.",
    category: "Lifecycle Tenant",
  },
  {
    question: "Bagaimana membaca Nomor Error (Ref) atau trace_id pada pesan gagal memuat data?",
    answer:
      "Nomor Error (Ref) dari frontend dan trace_id dari backend dipakai untuk menelusuri kejadian yang sama di log. Gunakan tombol Copy di kolom Ref Error agar kode cepat ditempel ke tiket, chat, atau catatan investigasi.",
    category: "Troubleshooting",
  },
  {
    question: "Apa fungsi tab Kritis, Non Kritis, Selesai, dan Arsip Kritis di /admin/log-errors?",
    answer:
      "Tab Kritis menampilkan gagal muat data prioritas tinggi yang masih aktif. Non Kritis berisi gangguan ringan/intermiten. Selesai berisi insiden kritis yang sudah diperbaiki, sedangkan Arsip Kritis menyimpan histori insiden kritis yang tidak lagi aktif.",
    category: "Troubleshooting",
  },
  {
    question: "Kenapa daftar /admin/log-errors terlihat kosong padahal error pernah terjadi?",
    answer:
      "Filter bawaan halaman ini adalah 24 jam. Jika data kosong, periksa filter rentang waktu/konteks dan ubah ke 7 hari, 30 hari, atau Semua Waktu. Pastikan juga Anda sedang melihat tab yang sesuai (Kritis, Non Kritis, Selesai, atau Arsip Kritis).",
    category: "Troubleshooting",
  },
  {
    question: "Bagaimana cara memakai status Selesai (resolved) pada log error?",
    answer:
      "Gunakan tombol Selesai pada baris error kritis setelah perbaikan diverifikasi. Log akan pindah ke tab Selesai agar antrian kritis aktif tetap bersih. Jika perlu investigasi ulang, gunakan Buka Lagi untuk mengembalikannya ke tab Kritis.",
    category: "Troubleshooting",
  },
  {
    question: "Bagaimana mekanisme retensi otomatis di /admin/log-errors?",
    answer:
      "Retensi Otomatis berjalan berkala agar log lama tidak menumpuk. Untuk non-kritis, data lama akan diarsipkan lalu dihapus sesuai umur simpan. Untuk kritis, penghapusan otomatis hanya berlaku pada data yang sudah masuk Arsip Kritis atau sudah berstatus Selesai melewati masa simpan. Admin juga bisa menjalankan Retensi Sekarang dari UI.",
    category: "Troubleshooting",
  },
  {
    question: "Kenapa notifikasi alert realtime kritis kadang gagal terkirim?",
    answer:
      "Sistem mengirim lewat Edge Function relay agar tidak tergantung CORS browser. Jika relay gagal/timeout, sistem fallback ke kirim langsung dari browser admin. Pastikan URL webhook valid, endpoint menerima POST JSON, dan jaringan keluar tidak diblokir firewall.",
    category: "Troubleshooting",
  },
  {
    question: "Bagaimana menghubungkan push GitHub agar deploy Vercel otomatis?",
    answer:
      "Hubungkan repository ke project Vercel pada branch produksi (umumnya main). Setiap push ke branch itu akan memicu build/deploy otomatis.",
    category: "DevOps",
  },
  {
    question: "Di mana menu Laporan Permohonan dan apa isinya?",
    answer:
      "Menu Laporan Permohonan ada di sidebar /org pada grup Laporan. Di dalamnya tersedia tab Izin/Cuti, Lembur, WFH & Absensi Khusus, serta Riwayat Mutasi agar semua laporan permohonan terpusat di satu tempat.",
    category: "Laporan",
  },
  {
    question: "Kenapa Laporan Absensi atau Rekapitulasi tidak bisa ditarik saat jam tertentu?",
    answer:
      "Untuk menjaga performa saat trafik absensi puncak, penarikan data Laporan Absensi dan Rekapitulasi dibatasi pada jam sibuk: 06:00-09:00 dan 15:00-18:00. Silakan tarik laporan di luar rentang jam tersebut.",
    category: "Laporan",
  },
  {
    question: "Apakah export/print Laporan Absensi dan Rekapitulasi ikut dibatasi jam sibuk?",
    answer:
      "Ya. Saat jam sibuk absensi, aksi Tampilkan, Ekspor CSV, dan Cetak PDF pada modul Laporan Absensi serta Rekapitulasi dinonaktifkan sementara, lalu aktif kembali di luar jam sibuk.",
    category: "Laporan",
  },
  {
    question: "Apa arti Status Daftar Periksa Setup Modul (SIAP/TIDAK SIAP) di sidebar organisasi?",
    answer:
      "Indikator ini menunjukkan progres 7 modul setup awal organisasi. SIAP (hijau) berarti seluruh modul daftar periksa sudah terisi, sedangkan TIDAK SIAP (merah) berarti masih ada modul yang belum lengkap.",
    category: "Onboarding Org",
  },
  {
    question: "Di mana lokasi indikator Status Daftar Periksa Setup Modul dan apa aksinya?",
    answer:
      "Indikator berada di sidebar /org, tepat di bawah menu Setup Awal. Saat diklik, pengguna akan diarahkan ke /org/onboarding untuk melanjutkan daftar periksa modul.",
    category: "Onboarding Org",
  },
  {
    question: "Apa dampak perubahan terbaru di menu admin terhadap workflow operasional harian?",
    answer:
      "Menu admin kini dikelompokkan per kategori dan sub-tab agar alur kerja lebih cepat: pilih kategori utama dulu (mis. Umum, Operasional, Billing), lalu pilih sub-tab detail. Dampaknya, waktu pindah antar modul berkurang dan konteks pengaturan lebih terstruktur.",
    category: "Admin Super",
  },
  {
    question: "Apa parameter baru yang perlu diatur admin setelah fitur ini dirilis?",
    answer:
      "Pastikan konfigurasi cloud capacity monitor sudah terisi (khususnya usage manual Vercel bila API usage belum aktif), sinkronisasi otomatis FAQ rekomendasi sesuai kebutuhan, serta review warning threshold per provider agar notifikasi kapasitas bekerja tepat waktu.",
    category: "Admin Super",
  },
  {
    question: "Bagaimana indikator sukses dan risiko dari fitur admin terbaru?",
    answer:
      "Indikator sukses: navigasi tab lebih cepat, error navigasi menurun, dan pengaturan penting lebih mudah ditemukan. Risiko utama: kebingungan awal jika belum terbiasa dengan struktur kategori baru. Mitigasi: gunakan FAQ, glosary halaman, dan pantau log error setelah rilis.",
    category: "Admin Super",
  },
];

const normalizeQuestion = (value: string) => value.trim().toLowerCase();
const RECOMMENDED_FAQ_QUESTION_ALIASES: Record<string, string> = {
  [normalizeQuestion("Bagaimana membaca Ref ID atau trace_id pada pesan error?")]:
    normalizeQuestion("Bagaimana membaca Nomor Error (Ref) atau trace_id pada pesan gagal memuat data?"),
};

const getRecommendedFaqId = (question: string, sortOrder: number) => {
  const slug = normalizeQuestion(question)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `recommended-${sortOrder}-${slug || "faq"}`;
};

const mergeRecommendedFaqs = (currentFaqs: FAQ[]) => {
  const nextFaqs = [...currentFaqs];
  const indexByQuestion = new Map<string, number>();
  for (const [index, faq] of nextFaqs.entries()) {
    indexByQuestion.set(normalizeQuestion(faq.question), index);
  }

  const nextSortBase = currentFaqs.reduce((max, faq) => Math.max(max, faq.sort_order), 0);
  const additions: FAQ[] = [];
  let updatedCount = 0;
  let sortOffset = 1;

  for (const item of RECOMMENDED_FAQ_UPDATES) {
    const targetAudience = item.audience ?? inferFaqAudience(item);
    const targetKey = normalizeQuestion(item.question);
    let targetIndex = indexByQuestion.get(targetKey);

    if (targetIndex === undefined) {
      const aliasSourceKey = Object.entries(RECOMMENDED_FAQ_QUESTION_ALIASES).find(
        ([legacyKey, mappedKey]) => mappedKey === targetKey && indexByQuestion.has(legacyKey),
      )?.[0];
      if (aliasSourceKey) {
        targetIndex = indexByQuestion.get(aliasSourceKey);
      }
    }

    if (targetIndex !== undefined) {
      const existing = nextFaqs[targetIndex];
      const existingAudience =
        existing.audience ??
        inferFaqAudience({
          category: existing.category,
          question: existing.question,
          answer: existing.answer,
        });
      const needsUpdate =
        existing.question !== item.question ||
        existing.answer !== item.answer ||
        existing.category !== item.category ||
        existingAudience !== targetAudience;
      if (needsUpdate) {
        const oldKey = normalizeQuestion(existing.question);
        nextFaqs[targetIndex] = {
          ...existing,
          question: item.question,
          answer: item.answer,
          category: item.category,
          audience: targetAudience,
        };
        indexByQuestion.delete(oldKey);
        indexByQuestion.set(targetKey, targetIndex);
        updatedCount += 1;
      }
      continue;
    }

    additions.push({
      id: getRecommendedFaqId(item.question, nextSortBase + sortOffset),
      question: item.question,
      answer: item.answer,
      category: item.category,
      sort_order: nextSortBase + sortOffset,
      audience: targetAudience,
    });
    indexByQuestion.set(targetKey, nextFaqs.length + additions.length - 1);
    sortOffset += 1;
  }

  return {
    merged: [...nextFaqs, ...additions].sort((a, b) => a.sort_order - b.sort_order),
    additionsCount: additions.length,
    updatedCount,
  };
};

const buildFaqSettingsPayload = (
  items: FAQ[],
  legacyFaqValue: FAQSettingsValue | null,
  options?: {
    autoSyncRecommended?: boolean;
    autoSyncLastRunAt?: string | null;
    autoSyncLastResult?: FAQSettingsValue["auto_sync_last_result"];
  },
): FAQSettingsValue => {
  const payload: FAQSettingsValue = {
    ...(legacyFaqValue || {}),
    items,
    auto_sync_recommended:
      options?.autoSyncRecommended ??
      legacyFaqValue?.auto_sync_recommended ??
      true,
  };
  if (options?.autoSyncLastRunAt !== undefined) {
    payload.auto_sync_last_run_at = options.autoSyncLastRunAt || undefined;
  }
  if (options?.autoSyncLastResult !== undefined) {
    payload.auto_sync_last_result = options.autoSyncLastResult;
  }
  return payload;
};

export default function FAQManagement() {
  const ADMIN_FAQ_QUERY_TIMEOUT_MS = 15000;
  const ADMIN_FAQ_QUERY_RETRY_MAX = 1;
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [filteredFaqs, setFilteredFaqs] = useState<FAQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FAQ | null>(null);
  const [formData, setFormData] = useState<{
    question: string;
    answer: string;
    category: string;
    sort_order: number;
    audience: FaqAudience;
  }>({ question: "", answer: "", category: "Umum", sort_order: 1, audience: "org_admin" });
  const [searchQuery, setSearchQuery] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<"all" | FaqAudience>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [legacyFaqValue, setLegacyFaqValue] = useState<FAQSettingsValue | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoSyncLastRunAt, setAutoSyncLastRunAt] = useState<string | null>(null);
  const [autoSyncLastResult, setAutoSyncLastResult] =
    useState<FAQSettingsValue["auto_sync_last_result"]>(null);

  useEffect(() => {
    fetchFAQs();
  }, []);

  useEffect(() => {
    // Filter FAQs based on search query
    const normalizedSearchQuery = searchQuery.toLowerCase();
    const filtered = faqs.filter(
      (faq) =>
        (faq.question.toLowerCase().includes(normalizedSearchQuery) ||
          faq.answer.toLowerCase().includes(normalizedSearchQuery) ||
          faq.category.toLowerCase().includes(normalizedSearchQuery)) &&
        (categoryFilter === "all" || faq.category === categoryFilter) &&
        matchesAudienceFilter(faq, audienceFilter)
    );
    setFilteredFaqs(filtered);
    setCurrentPage(1);
  }, [searchQuery, audienceFilter, categoryFilter, faqs]);

  const fetchFAQs = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setIsRetrying(false);
      const { data } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("system_settings")
              .select("id, value")
              .eq("key", "faq_settings")
              .maybeSingle(),
            ADMIN_FAQ_QUERY_TIMEOUT_MS,
            "admin.faq.fetch.settings timeout",
          ),
        {
          maxRetries: ADMIN_FAQ_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      const value = data?.value as unknown;
      let faqItems: FAQ[] = [];
      let storedObject: FAQSettingsValue | null = null;
      let runtimeAutoSyncEnabled = true;

      if (!value) {
        faqItems = [];
      } else if (Array.isArray(value)) {
        faqItems = value as FAQ[];
      } else if (value && typeof value === "object") {
        const parsed = value as FAQSettingsValue;
        storedObject = parsed;
        runtimeAutoSyncEnabled = parsed.auto_sync_recommended ?? true;
        if (Array.isArray(parsed.items)) {
          faqItems = parsed.items;
        }
      }

      const normalizedFaqs = faqItems.map((item) => normalizeFaqItem(item));
      const audienceFixCount = faqItems.reduce((count, item, index) => {
        const normalizedAudience = normalizedFaqs[index]?.audience;
        const rawAudience = isFaqAudience(item.audience) ? item.audience : undefined;
        return rawAudience !== normalizedAudience ? count + 1 : count;
      }, 0);
      const sortedFaqs = normalizedFaqs.sort((a, b) => a.sort_order - b.sort_order);
      const mergedResult = mergeRecommendedFaqs(sortedFaqs);
      const hasRecommendationDelta = mergedResult.additionsCount > 0 || mergedResult.updatedCount > 0;
      const shouldPersistRecommendationSync =
        runtimeAutoSyncEnabled &&
        (!data?.id || !storedObject || hasRecommendationDelta);
      const shouldPersistAudienceNormalization = audienceFixCount > 0;
      const shouldPersistAutoSync = shouldPersistRecommendationSync || shouldPersistAudienceNormalization;
      const nextFaqs = mergedResult.merged;
      const autoSyncRunAt =
        shouldPersistAutoSync
          ? new Date().toISOString()
          : storedObject?.auto_sync_last_run_at;
      const autoSyncRunResult =
        shouldPersistAutoSync
          ? {
              additions: mergedResult.additionsCount,
              updated: mergedResult.updatedCount + audienceFixCount,
              source:
                shouldPersistAudienceNormalization && !hasRecommendationDelta
                  ? "audience_normalization"
                  : "auto_sync_on_load",
            }
          : storedObject?.auto_sync_last_result ?? null;

      const nextLegacyValue = buildFaqSettingsPayload(nextFaqs, storedObject, {
        autoSyncRecommended: runtimeAutoSyncEnabled,
        autoSyncLastRunAt: autoSyncRunAt || null,
        autoSyncLastResult: autoSyncRunResult,
      });

      if (shouldPersistAutoSync && nextFaqs.length > 0) {
        const nextValue = nextLegacyValue;
        if (data?.id) {
          const { error: updateError } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase
                  .from("system_settings")
                  .update({ value: nextValue, updated_at: new Date().toISOString() })
                  .eq("key", "faq_settings"),
                ADMIN_FAQ_QUERY_TIMEOUT_MS,
                "admin.faq.fetch.autosync.update timeout",
              ),
            {
              maxRetries: ADMIN_FAQ_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            },
          );
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase
                  .from("system_settings")
                  .insert({ key: "faq_settings", value: nextValue }),
                ADMIN_FAQ_QUERY_TIMEOUT_MS,
                "admin.faq.fetch.autosync.insert timeout",
              ),
            {
              maxRetries: ADMIN_FAQ_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            },
          );
          if (insertError) throw insertError;
        }

        if (hasRecommendationDelta) {
          const audienceFixNote =
            audienceFixCount > 0 ? ` + koreksi audience ${audienceFixCount}` : "";
          toast.success(
            `Sinkronisasi otomatis FAQ: ${mergedResult.additionsCount} ditambahkan, ${mergedResult.updatedCount} diperbarui${audienceFixNote}.`,
          );
        } else if (shouldPersistAudienceNormalization) {
          toast.success(`Target audiens FAQ dikoreksi otomatis: ${audienceFixCount} item.`);
        } else {
          toast.success("FAQ bawaan berhasil diinisialisasi otomatis.");
        }
      }

      setLegacyFaqValue(nextLegacyValue);
      setAutoSyncEnabled(runtimeAutoSyncEnabled);
      setAutoSyncLastRunAt(nextLegacyValue.auto_sync_last_run_at || null);
      setAutoSyncLastResult(nextLegacyValue.auto_sync_last_result || null);
      setFaqs(nextFaqs);
      setFilteredFaqs(nextFaqs);
    } catch (error) {
      const errorRef = reportError(error, "admin.faq.fetch");
      const message = appendErrorReference("Gagal memuat data FAQ", errorRef);
      toast.error(message);
      setLoadError(message);
      setFaqs([]);
      setFilteredFaqs([]);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setLoadError(null);
    try {
      setIsRetrying(false);
      const { data: existing } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("system_settings")
              .select("id")
              .eq("key", "faq_settings")
              .maybeSingle(),
            ADMIN_FAQ_QUERY_TIMEOUT_MS,
            "admin.faq.save_all.check_existing timeout",
          ),
        {
          maxRetries: ADMIN_FAQ_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      const jsonValue = JSON.parse(JSON.stringify(faqs));
      const nextValue = buildFaqSettingsPayload(jsonValue, legacyFaqValue, {
        autoSyncRecommended: autoSyncEnabled,
        autoSyncLastRunAt: autoSyncLastRunAt,
        autoSyncLastResult: autoSyncLastResult,
      });
      
      if (existing) {
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("system_settings")
                .update({ value: nextValue, updated_at: new Date().toISOString() })
                .eq("key", "faq_settings"),
              ADMIN_FAQ_QUERY_TIMEOUT_MS,
              "admin.faq.save_all.update timeout",
            ),
          {
            maxRetries: ADMIN_FAQ_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (error) throw error;
      } else {
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("system_settings")
                .insert({ key: "faq_settings", value: nextValue }),
              ADMIN_FAQ_QUERY_TIMEOUT_MS,
              "admin.faq.save_all.insert timeout",
            ),
          {
            maxRetries: ADMIN_FAQ_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (error) throw error;
      }
      
      setLegacyFaqValue(nextValue);
      toast.success("FAQ berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.faq.save_all", {
        faq_count: faqs.length,
      });
      const message = appendErrorReference("Gagal menyimpan FAQ", errorRef);
      toast.error(message);
      setLoadError(message);
    } finally {
      setIsSaving(false);
      setIsRetrying(false);
    }
  };

  const formatAutoSyncTimestamp = (value: string | null) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({
      question: "",
      answer: "",
      category: "Umum",
      sort_order: faqs.length + 1,
      audience: "org_admin",
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (faq: FAQ) => {
    setEditingItem(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      sort_order: faq.sort_order,
      audience:
        faq.audience ??
        inferFaqAudience({
          category: faq.category,
          question: faq.question,
          answer: faq.answer,
        }),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setFaqs(faqs.filter((f) => f.id !== id));
    toast.success("FAQ dihapus. Klik 'Simpan Semua' untuk menyimpan perubahan.");
  };

  const handleSubmit = () => {
    if (!formData.question || !formData.answer) {
      toast.error("Pertanyaan dan jawaban wajib diisi");
      return;
    }

    if (editingItem) {
      setFaqs(faqs.map((f) => (f.id === editingItem.id ? normalizeFaqItem({ ...f, ...formData }) : f)));
      toast.success("FAQ diperbarui. Klik 'Simpan Semua' untuk menyimpan perubahan.");
    } else {
      setFaqs([...faqs, normalizeFaqItem({ id: Date.now().toString(), ...formData })]);
      toast.success("FAQ ditambahkan. Klik 'Simpan Semua' untuk menyimpan perubahan.");
    }
    setIsDialogOpen(false);
  };

  const handleApplyRecommendedFaqs = () => {
    const mergedResult = mergeRecommendedFaqs(faqs);
    if (mergedResult.additionsCount === 0 && mergedResult.updatedCount === 0) {
      toast.info("FAQ rekomendasi terbaru sudah sinkron.");
      return;
    }

    setFaqs(mergedResult.merged.map((item) => normalizeFaqItem(item)));
    toast.success(
      `Sinkronisasi selesai: ${mergedResult.additionsCount} ditambahkan, ${mergedResult.updatedCount} diperbarui. Klik 'Simpan Semua' untuk menerapkan.`,
    );
  };

  // Pagination logic
  const totalPages = Math.ceil(filteredFaqs.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedFaqs = filteredFaqs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const visiblePages =
    totalPages <= 5
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : currentPage <= 3
        ? [1, 2, 3, 4, 5]
        : currentPage >= totalPages - 2
          ? [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
          : [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];

  // Get unique categories
  const totalCategories = [...new Set(faqs.map((f) => f.category).filter(Boolean))].length;
  const categorySourceFaqs = faqs.filter(
    (faq) => matchesAudienceFilter(faq, audienceFilter),
  );
  const categoryCountMap = categorySourceFaqs.reduce<Record<string, number>>((accumulator, faq) => {
    const key = faq.category?.trim();
    if (!key) return accumulator;
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
  const categories = Object.keys(categoryCountMap).sort((a, b) => a.localeCompare(b, "id"));
  const categoryTabs = categories.map((category) => ({
    category,
    count: categoryCountMap[category] ?? 0,
  }));

  useEffect(() => {
    if (categoryFilter !== "all" && !categories.includes(categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, categories]);
  const audienceStats = faqs.reduce(
    (accumulator, faq) => {
      const audience = resolveAudienceForFilter(faq);
      accumulator[audience] += 1;
      return accumulator;
    },
    {
      public: 0,
      employee: 0,
      org_admin: 0,
      super_admin: 0,
    } as Record<FaqAudience, number>,
  );
  const publicVisibleCount = audienceStats.public + audienceStats.employee;
  const statsCards = [
    { key: "total", label: "Total FAQ", value: faqs.length },
    { key: "categories", label: "Kategori", value: totalCategories },
    { key: "results", label: "Hasil Pencarian", value: filteredFaqs.length },
    { key: "public-visible", label: "Umum + Pegawai", value: publicVisibleCount },
    { key: "employee", label: FAQ_AUDIENCE_LABEL.employee, value: audienceStats.employee },
    { key: "org-admin", label: FAQ_AUDIENCE_LABEL.org_admin, value: audienceStats.org_admin },
    { key: "super-admin", label: FAQ_AUDIENCE_LABEL.super_admin, value: audienceStats.super_admin },
  ] as const;

  return (
    <SuperAdminLayout title="Manajemen FAQ" subtitle="Kelola pertanyaan yang sering diajukan">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="space-y-4">
          <div className="w-full rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari FAQ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={audienceFilter === "all" ? "default" : "outline"}
                  onClick={() => setAudienceFilter("all")}
                >
                  Semua Target
                </Button>
                <Button
                  size="sm"
                  variant={audienceFilter === "public" ? "default" : "outline"}
                  onClick={() => setAudienceFilter("public")}
                >
                  Umum + Pegawai
                </Button>
                <Button
                  size="sm"
                  variant={audienceFilter === "employee" ? "default" : "outline"}
                  onClick={() => setAudienceFilter("employee")}
                >
                  Pegawai
                </Button>
                <Button
                  size="sm"
                  variant={audienceFilter === "org_admin" ? "default" : "outline"}
                  onClick={() => setAudienceFilter("org_admin")}
                >
                  Admin Organisasi
                </Button>
                <Button
                  size="sm"
                  variant={audienceFilter === "super_admin" ? "default" : "outline"}
                  onClick={() => setAudienceFilter("super_admin")}
                >
                  Super Admin
                </Button>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-2">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <p className="text-xs font-medium text-muted-foreground">Tab Kategori</p>
                  {categoryFilter !== "all" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setCategoryFilter("all")}
                    >
                      Reset
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap content-start items-start gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={categoryFilter === "all" ? "default" : "outline"}
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => setCategoryFilter("all")}
                  >
                    Semua Kategori ({categorySourceFaqs.length})
                  </Button>
                  {categoryTabs.map((item) => (
                    <Button
                      key={item.category}
                      type="button"
                      size="sm"
                      variant={categoryFilter === item.category ? "default" : "outline"}
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={() => setCategoryFilter(item.category)}
                    >
                      {item.category} ({item.count})
                    </Button>
                  ))}
                </div>
                {categoryFilter !== "all" && (
                  <p className="mt-2 px-1 text-xs text-muted-foreground">
                    Kategori aktif: <span className="font-medium text-foreground">{categoryFilter}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3">
            <div className="rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <Switch checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} />
                <span className="text-sm font-medium">Sinkronisasi Otomatis FAQ Rekomendasi</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Terakhir: {formatAutoSyncTimestamp(autoSyncLastRunAt)}
                {autoSyncLastResult
                  ? ` • +${autoSyncLastResult.additions} / ~${autoSyncLastResult.updated}`
                  : ""}
              </p>
            </div>
            <Button onClick={handleApplyRecommendedFaqs} variant="outline">
              <Sparkles className="h-4 w-4 mr-2" />
              Sinkronkan FAQ Rekomendasi
            </Button>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Tambah FAQ
            </Button>
            <Button onClick={handleSaveAll} disabled={isSaving} variant="default">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Simpan Semua
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/45 p-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {statsCards.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-background px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
              >
                <p className="truncate pr-1 text-[10.5px] font-medium uppercase tracking-[0.02em] text-slate-500">
                  {item.label}
                </p>
                <p className="text-lg font-semibold leading-none text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Daftar FAQ
            </CardTitle>
            <CardDescription className="text-slate-600">
              Kelola pertanyaan, jawaban, dan segmentasi target FAQ.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isRetrying && (
              <div className="mb-4 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Sedang mencoba ulang koneksi data FAQ...
              </div>
            )}
            {loadError && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>{loadError}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => void fetchFAQs()}>
                    Coba Lagi
                  </Button>
                </div>
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="max-h-[520px] overflow-auto rounded-md border border-border/60">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/85">
                    <TableRow>
                      <TableHead className="w-[50px] bg-slate-50/95">No</TableHead>
                      <TableHead className="bg-slate-50/95">Pertanyaan</TableHead>
                      <TableHead className="hidden bg-slate-50/95 md:table-cell">Jawaban</TableHead>
                      <TableHead className="bg-slate-50/95">Kategori</TableHead>
                      <TableHead className="bg-slate-50/95">Target</TableHead>
                      <TableHead className="w-[100px] bg-slate-50/95">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedFaqs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          {searchQuery ? "Tidak ada FAQ yang cocok" : "Belum ada FAQ"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedFaqs.map((faq, index) => (
                        <TableRow
                          key={faq.id}
                          className={`transition-colors duration-150 hover:bg-slate-100/70 ${
                            index % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                          }`}
                        >
                          <TableCell className="font-medium">{startIndex + index + 1}</TableCell>
                          <TableCell>
                            <div className="max-w-[300px]">
                              <p className="font-medium truncate">{faq.question}</p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <p className="text-muted-foreground truncate max-w-[300px]">{faq.answer}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{faq.category}</Badge>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const audience =
                                faq.audience ??
                                inferFaqAudience({
                                  category: faq.category,
                                  question: faq.question,
                                  answer: faq.answer,
                                });
                              return (
                                <Badge variant="outline" className={FAQ_AUDIENCE_BADGE_CLASSNAME[audience]}>
                                  {FAQ_AUDIENCE_LABEL[audience]}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(faq)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(faq.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  Scroll tabel untuk melihat data panjang, header kolom tetap terlihat di atas.
                </p>
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Menampilkan {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredFaqs.length)} dari {filteredFaqs.length} FAQ
                    </p>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                        {visiblePages.map((page) => {
                          return (
                            <PaginationItem key={page}>
                              <PaginationLink
                                onClick={() => setCurrentPage(page)}
                                isActive={currentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Ubah FAQ" : "Tambah FAQ Baru"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Pertanyaan *</Label>
                <Input
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  placeholder="Masukkan pertanyaan..."
                />
              </div>
              <div className="space-y-2">
                <Label>Jawaban *</Label>
                <Textarea
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  placeholder="Masukkan jawaban..."
                  rows={4}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Kategori</Label>
                  <Input
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Umum, Fitur, Harga, dll"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Urutan</Label>
                  <Input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Ditujukan Untuk</Label>
                <Select
                  value={formData.audience}
                  onValueChange={(value) => setFormData({ ...formData, audience: value as FaqAudience })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih target FAQ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">{FAQ_AUDIENCE_LABEL.public}</SelectItem>
                    <SelectItem value="employee">{FAQ_AUDIENCE_LABEL.employee}</SelectItem>
                    <SelectItem value="org_admin">{FAQ_AUDIENCE_LABEL.org_admin}</SelectItem>
                    <SelectItem value="super_admin">{FAQ_AUDIENCE_LABEL.super_admin}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className={dialogActionBarClassName}>
              <DialogActionHint>Pastikan pertanyaan dan jawaban ringkas agar mudah dipahami pengguna.</DialogActionHint>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                <Button variant="outline" className="w-full sm:w-auto bg-white" onClick={() => setIsDialogOpen(false)}>
                  Batal
                </Button>
                <Button className="w-full sm:w-auto" onClick={handleSubmit}>Simpan</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SuperAdminLayout>
  );
}
