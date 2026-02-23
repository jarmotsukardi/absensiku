import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { resolveFaqAudience } from "@/lib/faqAudience";
import type { FaqAudience } from "@/lib/faqAudience";
import { toast } from "sonner";
import {
  HelpCircle,
  Search,
  MessageSquare,
  ExternalLink,
  BookOpen,
  Clock,
  FileText,
  Shield,
  Smartphone,
  Loader2,
  Wallet,
} from "lucide-react";

interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  sort_order?: number | null;
  audience?: FaqAudience;
}

interface GeneralSettingsValue {
  supportPhone?: string;
}

interface FAQSettingsValue {
  items?: FAQ[];
}

type SubscriptionStatus = "trial" | "active" | "expired" | "cancelled" | "unknown";

const DUMMY_FAQS: FAQ[] = [
  {
    id: "1",
    category: "Umum",
    question: "Bagaimana cara login ke aplikasi absensi?",
    answer:
      "Untuk login, buka aplikasi atau website absensi, masukkan email dan password yang telah didaftarkan oleh admin organisasi Anda.",
  },
  {
    id: "2",
    category: "Absensi",
    question: "Mengapa absensi saya gagal karena lokasi tidak valid?",
    answer:
      "Absensi hanya bisa dilakukan dalam radius yang ditentukan. Pastikan GPS aktif dan Anda berada di lokasi yang benar.",
  },
  {
    id: "3",
    category: "Izin & Cuti",
    question: "Bagaimana cara mengajukan cuti?",
    answer:
      "Buka menu Izin/Cuti, pilih jenis cuti, tentukan tanggal, isi alasan, lalu kirim permohonan untuk persetujuan.",
  },
  {
    id: "6",
    category: "Izin & Cuti",
    question: "Mengapa submenu Izin/Cuti tidak terlihat di sidebar?",
    answer:
      "Submenu Izin/Cuti sudah dipusatkan menjadi tab di dalam halaman Permohonan. Klik menu Izin/Cuti di sidebar, lalu pilih tab sesuai kebutuhan.",
  },
  {
    id: "4",
    category: "Perangkat",
    question: "Mengapa perangkat saya tidak bisa digunakan untuk absensi?",
    answer:
      "Akun terikat ke satu perangkat untuk keamanan. Jika ganti perangkat, hubungi admin untuk reset Device ID.",
  },
  {
    id: "5",
    category: "Keamanan",
    question: "Apakah data absensi saya aman?",
    answer:
      "Data disimpan dengan enkripsi dan hanya dapat diakses oleh pihak berwenang sesuai hak akses.",
  },
  {
    id: "7",
    category: "Keamanan",
    question: "Apa perbedaan akses Admin Organisasi dan Operator?",
    answer:
      "Admin Organisasi memiliki akses penuh untuk konfigurasi, master data, jadwal, konten, dan manajemen role. Operator fokus pada modul operasional seperti permohonan, laporan permohonan, bantuan, dan profil saya.",
  },
  {
    id: "8",
    category: "Keamanan",
    question: "Kenapa menu tertentu tidak tampil saat login sebagai Operator?",
    answer:
      "Itu normal. Sistem membatasi akses Operator agar tidak bisa mengubah pengaturan sensitif seperti setup awal, master data, jadwal, konten, billing, audit log, dan manajemen role.",
  },
  {
    id: "9",
    category: "Billing & Harga",
    question: "Bagaimana cara membayar faktur di menu /org/billing?",
    answer:
      "Buka detail faktur, lalu gunakan Buka Link Pembayaran jika tersedia. Untuk transfer manual, unggah URL/file bukti pembayaran dan kirim untuk verifikasi admin.",
  },
  {
    id: "10",
    category: "Billing & Harga",
    question: "Apa arti status Menunggu Verifikasi pada faktur?",
    answer:
      "Status ini berarti bukti pembayaran sudah dikirim tetapi belum disetujui admin. Tunggu proses verifikasi atau cek alasan penolakan jika status berubah.",
  },
  {
    id: "11",
    category: "Billing & Harga",
    question: "Bagaimana jika bukti bayar transfer ditolak oleh admin?",
    answer:
      "Lihat alasan penolakan di detail faktur, perbaiki URL/file bukti pembayaran, lalu kirim ulang agar status kembali ke Menunggu Verifikasi.",
  },
  {
    id: "12",
    category: "Billing & Harga",
    question: "Kenapa rincian PPN/PPH tidak tampil di faktur klien?",
    answer:
      "Rincian pajak diproses sebagai komponen biaya internal sistem. Di sisi klien, yang ditampilkan hanya total akhir tagihan agar format invoice lebih ringkas.",
  },
  {
    id: "13",
    category: "Billing & Harga",
    question: "Apakah total tagihan sudah termasuk komponen biaya pajak?",
    answer:
      "Ya. Total pada invoice adalah nilai final yang sudah memperhitungkan kebijakan biaya internal, sehingga tidak perlu perhitungan tambahan dari pihak klien.",
  },
  {
    id: "14",
    category: "Billing & Harga",
    question: "Di mana admin bisa melihat pemisahan PPN dan PPH?",
    answer:
      "Pemisahan kolom PPN dan PPH tersedia di panel admin pada tab Paket Langganan dan Laporan Keuangan. Di sisi organisasi (/org/billing), invoice tetap tampil sebagai total akhir tagihan.",
  },
  {
    id: "15",
    category: "Billing & Harga",
    question: "Apakah pilihan kalkulator langganan di /org/activation tersimpan otomatis?",
    answer:
      "Ya. Pilihan paket dan jumlah member terakhir disimpan otomatis per organisasi. Gunakan tombol 'Lanjut Buat Invoice' untuk langsung menuju bagian metode pembayaran.",
  },
  {
    id: "16",
    category: "Umum",
    question: "Bagaimana mengelola pilihan Golongan pegawai agar muncul di form data pegawai?",
    answer:
      "Buka menu Master Data > Golongan Pegawai. Tambahkan atau aktifkan golongan yang dibutuhkan. Hanya golongan berstatus aktif yang tampil di form Pegawai Aktif, mutasi pegawai, dan import pegawai.",
  },
  {
    id: "17",
    category: "Umum",
    question: "Kenapa submenu Admin OPD/Jabatan/Kategori Pegawai/Golongan Pegawai tidak terlihat?",
    answer:
      "Periksa Setup Awal Organisasi di /org/onboarding pada bagian Pilihan Modul Master Data. Jika modul dimatikan, submenu disembunyikan. Aktifkan kembali modul yang dibutuhkan lalu simpan preferensi.",
  },
  {
    id: "18",
    category: "Umum",
    question: "Bagaimana alur yang benar antara Import Pegawai dan Undangan Pegawai?",
    answer:
      "Gunakan alur dua tahap: import dulu data pegawai ke master, lalu kirim undangan aktivasi akun. Dengan cara ini data tetap rapi dan akun login tidak duplikat.",
  },
  {
    id: "19",
    category: "Umum",
    question: "Kenapa saat import pegawai diminta Lokasi Kerja Mapping?",
    answer:
      "Lokasi Kerja Mapping dipakai sebagai fallback untuk menjaga setiap data pegawai tetap punya relasi lokasi kerja yang valid saat data pada file belum lengkap.",
  },
  {
    id: "20",
    category: "Umum",
    question: "Apakah template import pegawai bisa dalam format XLS?",
    answer:
      "Bisa. Gunakan template resmi CSV atau XLS dari halaman import pegawai, lalu isi header kolom persis seperti template agar lolos validasi.",
  },
];

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Umum: BookOpen,
  Absensi: Clock,
  "Izin & Cuti": FileText,
  Perangkat: Smartphone,
  Keamanan: Shield,
  "Billing & Harga": Wallet,
};

const normalizeFaqSettings = (raw: unknown): FAQ[] => {
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === "object" && Array.isArray((raw as FAQSettingsValue).items)) {
    items = (raw as FAQSettingsValue).items ?? [];
  }

  return items
    .map((item, index) => {
      const row = item as Partial<FAQ>;
      if (typeof row.question !== "string" || typeof row.answer !== "string") return null;
      const category = typeof row.category === "string" && row.category.trim() ? row.category.trim() : "Umum";
      const sort_order =
        typeof row.sort_order === "number" && Number.isFinite(row.sort_order) ? row.sort_order : null;
      return {
        id: typeof row.id === "string" && row.id.trim() ? row.id : `faq-${index + 1}`,
        category,
        question: row.question,
        answer: row.answer,
        sort_order,
        audience: resolveFaqAudience({
          audience: row.audience,
          category,
          question: row.question,
          answer: row.answer,
        }),
      } satisfies FAQ;
    })
    .filter((row): row is FAQ => Boolean(row))
    .filter((row) => row.audience === "org_admin")
    .sort((a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER));
};

export default function OrgHelp() {
  const ORG_HELP_QUERY_TIMEOUT_MS = 15000;
  const ORG_HELP_QUERY_RETRY_MAX = 1;
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [supportPhone, setSupportPhone] = useState("6281234567890");
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("unknown");
  const activeTab = location.pathname === "/org/help/support" ? "support" : "faq";
  const canCreateTicket = subscriptionStatus === "active";

  const loadData = async () => {
    try {
      setIsLoading(true);
      setIsRetrying(false);
      setLoadError(null);
      const { data: authData } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.getUser(),
            ORG_HELP_QUERY_TIMEOUT_MS,
            "org.help.load_data.auth timeout",
          ),
        {
          maxRetries: ORG_HELP_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
        const userId = authData.user?.id;

        if (!userId) {
          setSubscriptionStatus("unknown");
          setFaqs(DUMMY_FAQS);
          return;
        }

        const [generalRes, faqSettingsRes] = await withExponentialBackoff(
          () =>
            Promise.all([
              withTimeout(
                supabase.from("system_settings").select("value").eq("key", "general_settings").maybeSingle(),
                ORG_HELP_QUERY_TIMEOUT_MS,
                "org.help.load_data.system_settings.general timeout",
              ),
              withTimeout(
                supabase.from("system_settings").select("value").eq("key", "faq_settings").maybeSingle(),
                ORG_HELP_QUERY_TIMEOUT_MS,
                "org.help.load_data.system_settings.faq timeout",
              ),
            ]),
          {
            maxRetries: ORG_HELP_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );

        if (generalRes.data?.value && typeof generalRes.data.value === "object") {
          const v = generalRes.data.value as unknown as GeneralSettingsValue;
          if (typeof v.supportPhone === "string" && v.supportPhone.trim()) {
            setSupportPhone(v.supportPhone.trim());
          }
        }

        const tenantId = await withExponentialBackoff(
          () =>
            withTimeout(
              resolveOrgTenantId(),
              ORG_HELP_QUERY_TIMEOUT_MS,
              "org.help.load_data.resolve_tenant timeout",
            ),
          {
            maxRetries: ORG_HELP_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );

        try {
          if (!tenantId) {
            setSubscriptionStatus("unknown");
          } else {
            const { data: subscriptionRow, error: subscriptionError } = await withExponentialBackoff(
              () =>
                withTimeout(
                  supabase
                    .from("subscriptions")
                    .select("status")
                    .eq("tenant_id", tenantId)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                  ORG_HELP_QUERY_TIMEOUT_MS,
                  "org.help.check_subscription timeout",
                ),
              {
                maxRetries: ORG_HELP_QUERY_RETRY_MAX,
                shouldRetry: isRetryableError,
                onRetry: () => setIsRetrying(true),
              },
            );
            if (subscriptionError) throw subscriptionError;
            if (subscriptionRow?.status) {
              setSubscriptionStatus(subscriptionRow.status as SubscriptionStatus);
            } else {
              setSubscriptionStatus("unknown");
            }
          }
        } catch (error) {
          reportError(error, "org.help.check_subscription");
          setSubscriptionStatus("unknown");
        }

        const managedFaqs = normalizeFaqSettings(faqSettingsRes.data?.value);
        if (managedFaqs.length > 0) {
          setFaqs(managedFaqs);
          return;
        }

        if (!tenantId) {
          setFaqs(DUMMY_FAQS);
          return;
        }

        const { data: tenantFaqs, error: tenantErr } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("faqs")
                .select("id, category, question, answer, sort_order")
                .eq("tenant_id", tenantId)
                .eq("is_active", true)
                .order("sort_order", { ascending: true, nullsFirst: false }),
              ORG_HELP_QUERY_TIMEOUT_MS,
              "org.help.load_data.tenant_faq timeout",
            ),
          {
            maxRetries: ORG_HELP_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );

        if (tenantErr) throw tenantErr;

        let finalFaqs: FAQ[] = (tenantFaqs || []).map((f) => ({
          id: f.id,
          category: f.category || "Umum",
          question: f.question,
          answer: f.answer,
          sort_order: f.sort_order,
        }));

        if (finalFaqs.length === 0) {
          const { data: globalFaqs, error: globalErr } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase
                  .from("faqs")
                  .select("id, category, question, answer, sort_order")
                  .is("tenant_id", null)
                  .eq("is_active", true)
                  .order("sort_order", { ascending: true, nullsFirst: false }),
                ORG_HELP_QUERY_TIMEOUT_MS,
                "org.help.load_data.global_faq timeout",
              ),
            {
              maxRetries: ORG_HELP_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            },
          );

          if (globalErr) throw globalErr;
          finalFaqs = (globalFaqs || []).map((f) => ({
            id: f.id,
            category: f.category || "Umum",
            question: f.question,
            answer: f.answer,
            sort_order: f.sort_order,
          }));
        }

        setFaqs(finalFaqs.length > 0 ? finalFaqs : DUMMY_FAQS);
    } catch (error) {
      const errorRef = reportError(error, "org.help.load_data");
      const message = appendErrorReference("Gagal memuat pusat bantuan", errorRef);
      setLoadError(message);
      toast.error(message);
      setFaqs(DUMMY_FAQS);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const categories = useMemo(() => {
    const uniq = Array.from(new Set(faqs.map((f) => f.category))).filter(Boolean);
    return uniq.length > 0 ? uniq : ["Umum", "Absensi", "Izin & Cuti", "Perangkat", "Keamanan"];
  }, [faqs]);

  const filteredFaqs = useMemo(
    () =>
      faqs.filter((faq) => {
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
          !q || faq.question.toLowerCase().includes(q) || faq.answer.toLowerCase().includes(q);
        const matchesCategory = !selectedCategory || faq.category === selectedCategory;
        return matchesSearch && matchesCategory;
      }),
    [faqs, searchQuery, selectedCategory]
  );

  const groupedFaqs = useMemo(
    () =>
      filteredFaqs.reduce((acc, faq) => {
        if (!acc[faq.category]) acc[faq.category] = [];
        acc[faq.category].push(faq);
        return acc;
      }, {} as Record<string, FAQ[]>),
    [filteredFaqs]
  );

  const waPhone = supportPhone.replace(/[^0-9]/g, "");
  const waLink = waPhone
    ? `https://wa.me/${waPhone.startsWith("0") ? `62${waPhone.slice(1)}` : waPhone}`
    : "";

  const setTab = (tab: "faq" | "support") => {
    navigate(tab === "support" ? "/org/help/support" : "/org/help/faq");
  };

  const handleOpenTicketModule = () => {
    if (!canCreateTicket) {
      toast.info("Tiket bantuan hanya untuk organisasi berlangganan aktif. Silakan gunakan FAQ.");
      navigate("/org/help/faq");
      return;
    }
    navigate("/org/help/tickets");
  };

  if (isLoading) {
    return (
      <OrganizationLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6" />
            FAQ & Bantuan
          </h1>
          <p className="text-muted-foreground">
            Temukan jawaban FAQ, kategori bantuan, dan kanal dukungan seputar aplikasi absensi
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-2">
              <Button variant={activeTab === "faq" ? "default" : "outline"} size="sm" onClick={() => setTab("faq")}>
                FAQ
              </Button>
              <Button variant={activeTab === "support" ? "default" : "outline"} size="sm" onClick={() => setTab("support")}>
                Bantuan
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenTicketModule} disabled={!canCreateTicket}>
                Buat Tiket
              </Button>
            </div>
            {!canCreateTicket && (
              <p className="mt-2 text-xs text-muted-foreground">
                Tiket bantuan hanya tersedia untuk tenant dengan langganan aktif. Gunakan FAQ untuk bantuan mandiri.
              </p>
            )}
          </CardContent>
        </Card>
        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadData()}>
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {isRetrying && (
          <Card className="border-amber-300/60 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm text-amber-800">Sedang mencoba ulang koneksi data pusat bantuan...</p>
            </CardContent>
          </Card>
        )}

        {activeTab === "faq" && (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari pertanyaan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                Semua
              </Button>
              {categories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat] || HelpCircle;
                return (
                  <Button
                    key={cat}
                    variant={selectedCategory === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(cat)}
                    className="flex items-center gap-1"
                  >
                    <Icon className="h-3 w-3" />
                    {cat}
                  </Button>
                );
              })}
            </div>

            {Object.keys(groupedFaqs).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <HelpCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Tidak ada FAQ yang sesuai dengan pencarian Anda.</p>
                </CardContent>
              </Card>
            ) : (
              Object.entries(groupedFaqs).map(([category, items]) => {
                const Icon = CATEGORY_ICONS[category] || HelpCircle;
                return (
                  <Card key={category}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Icon className="h-5 w-5" />
                        {category}
                      </CardTitle>
                      <CardDescription>{items.length} pertanyaan</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="single" collapsible className="w-full">
                        {items.map((faq) => (
                          <AccordionItem key={faq.id} value={faq.id}>
                            <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
                            <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </>
        )}

        {activeTab === "support" && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Bantuan Langsung
              </CardTitle>
              <CardDescription>
                Jika pertanyaan belum terjawab, hubungi tim support atau buat tiket bantuan.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => waLink && window.open(waLink, "_blank")} disabled={!waLink}>
                <ExternalLink className="h-4 w-4 mr-2" />
                WhatsApp Support
              </Button>
              <Button onClick={handleOpenTicketModule} disabled={!canCreateTicket}>
                <HelpCircle className="h-4 w-4 mr-2" />
                Buka Modul Tiket
              </Button>
            </CardContent>
          </Card>
        )}

        <PageGlossarySection preset="org_help_center" />
      </div>
    </OrganizationLayout>
  );
}
