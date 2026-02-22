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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Edit, HelpCircle, Save, Search, Sparkles } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
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

const ITEMS_PER_PAGE = 10;
const RECOMMENDED_FAQ_UPDATES: Array<{ question: string; answer: string; category: string }> = [
  {
    question: "Bagaimana sumber jawaban Chat Agent di halaman utama ditentukan?",
    answer:
      "Chat Agent membaca konteks dari data sistem: fitur (features_settings), paket harga (subscription_packages/pricing_settings), FAQ (faq_settings), dan artikel (articles). Jika data belum lengkap, perbarui dulu di modul terkait lalu refresh halaman utama.",
    category: "Landing & Chat Agent",
  },
  {
    question: "Kenapa jawaban Chat Agent bisa terlihat ringkas?",
    answer:
      "Jawaban chat dibuat singkat agar cepat dibaca. Detail penuh tetap ada di FAQ, halaman fitur, harga, dan artikel. Gunakan pertanyaan lebih spesifik untuk hasil yang lebih lengkap.",
    category: "Landing & Chat Agent",
  },
  {
    question: "Bagaimana alur penawaran harga saat jumlah pegawai menembus ambang B2B?",
    answer:
      "Saat pegawai aktif melampaui ambang negosiasi (default 2.001), sistem menandai tenant untuk penawaran B2B dan mengirim notifikasi ke Admin Organisasi serta Super Admin agar dilakukan follow-up manual.",
    category: "Billing & Harga",
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
    category: "Streak Monitoring",
  },
  {
    question: "Bagaimana mekanisme saat Xendit belum aktif dan pembayaran masih manual?",
    answer:
      "Sistem tetap berjalan dengan pembayaran manual (transfer + angka unik). Admin memverifikasi pembayaran, lalu status invoice diperbarui untuk mengaktifkan kembali layanan tenant.",
    category: "Streak Monitoring",
  },
  {
    question: "Kapan pengingat invoice dikirim ke email dan WhatsApp?",
    answer:
      "Pengingat dikirim saat mendekati/masuk grace period oleh job terjadwal (cron/edge). Pastikan gateway aktif, secrets valid, dan data kontak tenant terisi.",
    category: "Streak Monitoring",
  },
  {
    question: "Apa fungsi menu /admin/templates (Template Onboarding Org)?",
    answer:
      "Menu ini adalah pusat template setup awal tenant organisasi: OPD, unit kerja, jabatan, kantor, jam kerja, batas absen, pengumuman awal, dan feature flag agar organisasi baru tidak mulai dari nol.",
    category: "Onboarding Org",
  },
  {
    question: "Bagaimana alur setup awal organisasi setelah profil organisasi selesai?",
    answer:
      "Setelah profil organisasi disimpan, admin organisasi diarahkan ke /org/onboarding. Di sana ada checklist modul dan tombol Terapkan Template Admin secara aman.",
    category: "Onboarding Org",
  },
  {
    question: "Apa arti 'Safe Apply' pada template onboarding organisasi?",
    answer:
      "Safe Apply hanya mengisi modul yang masih kosong dan tidak menimpa data tenant yang sudah ada. Ini menjaga setup tetap konsisten tanpa merusak konfigurasi berjalan.",
    category: "Onboarding Org",
  },
  {
    question: "Apa fungsi menu /admin/schedule/absence-limits?",
    answer:
      "Menu ini adalah template global batas absen untuk tenant baru. Aturan di sini disalin sebagai default ketika organisasi baru dibuat oleh Super Admin.",
    category: "Template Tenant",
  },
  {
    question: "Bagaimana cara menerapkan ulang template batas absen di organisasi?",
    answer:
      "Di /org/schedule/absence-limits gunakan tombol 'Terapkan Template Admin'. Tombol ini biasanya hanya bekerja bila aturan tenant masih kosong agar data berjalan tidak tertimpa.",
    category: "Template Tenant",
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
    question: "Apa beda validasi perangkat di /admin/attendance-security dengan proteksi aplikasi mobile?",
    answer:
      "Validasi perangkat mengatur kebijakan akses browser/perangkat pada login absensi. Proteksi aplikasi mobile (APK/webview policy) adalah lapisan tambahan di sisi klien.",
    category: "Keamanan Pegawai",
  },
  {
    question: "Kenapa login/aksi penting bisa gagal dengan pesan sesi kedaluwarsa?",
    answer:
      "Token autentikasi sudah tidak valid. Solusi: logout/login ulang, lalu ulangi aksi. Sertakan Ref ID jika error berulang.",
    category: "Auth",
  },
  {
    question: "Bagaimana validasi import pegawai agar data kantor/lokasi tidak rusak?",
    answer:
      "Gunakan validasi CSV sebelum import, pastikan mapping kolom benar, dan pastikan referensi kantor/lokasi kerja valid dengan koordinat real.",
    category: "Master Data",
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
      "Toleransi keterlambatan adalah batas menit tambahan sebelum status dianggap terlambat. Default yang aman adalah 0 jika instansi tidak memakai toleransi.",
    category: "Jadwal & Absensi",
  },
  {
    question: "Bagaimana mekanisme shift kerja dibanding default Senin-Jumat?",
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
      "Default filter halaman ini adalah 24 jam. Jika data kosong, periksa filter rentang waktu/konteks dan ubah ke 7 hari, 30 hari, atau Semua Waktu. Pastikan juga Anda sedang melihat tab yang sesuai (Kritis, Non Kritis, Selesai, atau Arsip Kritis).",
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
      "Ya. Saat jam sibuk absensi, aksi Tampilkan, Export CSV, dan Print PDF pada modul Laporan Absensi serta Rekapitulasi dinonaktifkan sementara, lalu aktif kembali di luar jam sibuk.",
    category: "Laporan",
  },
  {
    question: "Apa arti Status Checklist Setup Modul (SIAP/TIDAK SIAP) di sidebar organisasi?",
    answer:
      "Indikator ini menunjukkan progres 7 modul setup awal organisasi. SIAP (hijau) berarti seluruh modul checklist sudah terisi, sedangkan TIDAK SIAP (merah) berarti masih ada modul yang belum lengkap.",
    category: "Onboarding Org",
  },
  {
    question: "Di mana lokasi indikator Status Checklist Setup Modul dan apa aksinya?",
    answer:
      "Indikator berada di sidebar /org, tepat di bawah menu Setup Awal. Saat diklik, pengguna akan diarahkan ke /org/onboarding untuk melanjutkan checklist modul.",
    category: "Onboarding Org",
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
      const needsUpdate =
        existing.question !== item.question ||
        existing.answer !== item.answer ||
        existing.category !== item.category;
      if (needsUpdate) {
        const oldKey = normalizeQuestion(existing.question);
        nextFaqs[targetIndex] = {
          ...existing,
          question: item.question,
          answer: item.answer,
          category: item.category,
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
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [filteredFaqs, setFilteredFaqs] = useState<FAQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FAQ | null>(null);
  const [formData, setFormData] = useState({ question: "", answer: "", category: "Umum", sort_order: 1 });
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    const filtered = faqs.filter(
      (faq) =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredFaqs(filtered);
    setCurrentPage(1);
  }, [searchQuery, faqs]);

  const fetchFAQs = async () => {
    setLoadError(null);
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("id, value")
        .eq("key", "faq_settings")
        .maybeSingle();

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

      const sortedFaqs = faqItems.sort((a, b) => a.sort_order - b.sort_order);
      const mergedResult = mergeRecommendedFaqs(sortedFaqs);
      const shouldPersistAutoSync =
        runtimeAutoSyncEnabled &&
        (!data?.id || !storedObject || mergedResult.additionsCount > 0 || mergedResult.updatedCount > 0);
      const nextFaqs = mergedResult.merged;
      const autoSyncRunAt =
        shouldPersistAutoSync && (mergedResult.additionsCount > 0 || mergedResult.updatedCount > 0)
          ? new Date().toISOString()
          : storedObject?.auto_sync_last_run_at;
      const autoSyncRunResult =
        shouldPersistAutoSync && (mergedResult.additionsCount > 0 || mergedResult.updatedCount > 0)
          ? {
              additions: mergedResult.additionsCount,
              updated: mergedResult.updatedCount,
              source: "auto_sync_on_load",
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
          const { error: updateError } = await supabase
            .from("system_settings")
            .update({ value: nextValue, updated_at: new Date().toISOString() })
            .eq("key", "faq_settings");
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from("system_settings")
            .insert({ key: "faq_settings", value: nextValue });
          if (insertError) throw insertError;
        }

        if (mergedResult.additionsCount > 0 || mergedResult.updatedCount > 0) {
          toast.success(
            `FAQ auto-sync: ${mergedResult.additionsCount} ditambahkan, ${mergedResult.updatedCount} diperbarui.`,
          );
        } else {
          toast.success("FAQ default berhasil diinisialisasi otomatis.");
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
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setLoadError(null);
    try {
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", "faq_settings")
        .maybeSingle();

      const jsonValue = JSON.parse(JSON.stringify(faqs));
      const nextValue = buildFaqSettingsPayload(jsonValue, legacyFaqValue, {
        autoSyncRecommended: autoSyncEnabled,
        autoSyncLastRunAt: autoSyncLastRunAt,
        autoSyncLastResult: autoSyncLastResult,
      });
      
      if (existing) {
        await supabase
          .from("system_settings")
          .update({ value: nextValue, updated_at: new Date().toISOString() })
          .eq("key", "faq_settings");
      } else {
        await supabase
          .from("system_settings")
          .insert({ key: "faq_settings", value: nextValue });
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
    setFormData({ question: "", answer: "", category: "Umum", sort_order: faqs.length + 1 });
    setIsDialogOpen(true);
  };

  const handleEdit = (faq: FAQ) => {
    setEditingItem(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      sort_order: faq.sort_order,
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
      setFaqs(faqs.map((f) => (f.id === editingItem.id ? { ...f, ...formData } : f)));
      toast.success("FAQ diperbarui. Klik 'Simpan Semua' untuk menyimpan perubahan.");
    } else {
      setFaqs([...faqs, { id: Date.now().toString(), ...formData }]);
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

    setFaqs(mergedResult.merged);
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
  const categories = [...new Set(faqs.map((f) => f.category))];

  return (
    <SuperAdminLayout title="Manajemen FAQ" subtitle="Kelola pertanyaan yang sering diajukan">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari FAQ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <Switch checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} />
                <span className="text-sm font-medium">Auto-sync FAQ Rekomendasi</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total FAQ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{faqs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Kategori</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{categories.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Hasil Pencarian</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredFaqs.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* FAQ Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Daftar FAQ
            </CardTitle>
            <CardDescription>Kelola pertanyaan dan jawaban untuk halaman depan</CardDescription>
          </CardHeader>
          <CardContent>
            {loadError && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {loadError}
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">No</TableHead>
                      <TableHead>Pertanyaan</TableHead>
                      <TableHead className="hidden md:table-cell">Jawaban</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="w-[100px]">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedFaqs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          {searchQuery ? "Tidak ada FAQ yang cocok" : "Belum ada FAQ"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedFaqs.map((faq, index) => (
                        <TableRow key={faq.id}>
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
              <DialogTitle>{editingItem ? "Edit FAQ" : "Tambah FAQ Baru"}</DialogTitle>
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleSubmit}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SuperAdminLayout>
  );
}
