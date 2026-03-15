import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { resolveFaqAudience, type FaqAudience } from "@/lib/faqAudience";

type ManagedFaqItem = {
  id: string;
  category: string;
  question: string;
  answer: string;
  audience: FaqAudience;
  sortOrder: number | null;
};

type FaqSettingsValue = {
  items?: unknown[];
};

const FALLBACK_FAQS: ManagedFaqItem[] = [
  {
    id: "hr-faq-1",
    category: "Operasional",
    question: "Kapan tim dukungan HR harus mengarahkan tenant ke tiket dibanding menjawab via FAQ?",
    answer: "Jika isu melibatkan data tenant spesifik, error ref/trace, atau butuh tindak lanjut status/SLA, arahkan ke tiket HR agar ada jejak audit dan PIC yang jelas.",
    audience: "super_admin",
    sortOrder: 1,
  },
  {
    id: "hr-faq-2",
    category: "Troubleshooting",
    question: "Apa langkah awal saat tenant melaporkan halaman HR kosong atau teralihkan tak semestinya?",
    answer: "Cek rute yang dibuka, status area kerja HR tenant, peran pengguna, lalu cocokkan error_ref/trace_id di log error HR. Jika rute valid tapi teralihkan, cek kebijakan rute HR dan guard terkait.",
    audience: "super_admin",
    sortOrder: 2,
  },
  {
    id: "hr-faq-3",
    category: "Dokumen",
    question: "Bagaimana menjawab pertanyaan tentang templat dokumen HR yang tidak muncul?",
    answer: "Pastikan tenant membuka menu Templat Dokumen, cek apakah templat aktif, dan verifikasi tenant memiliki data templat pada tabel HR. Jika hilang setelah perubahan, audit dulu pembaruan terakhir tenant dan log error terkait.",
    audience: "super_admin",
    sortOrder: 3,
  },
  {
    id: "hr-faq-4",
    category: "SLA",
    question: "Apa indikator bahwa isu harus dieskalasi ke audit atau engineering?",
    answer: "Eskalasi bila error kritis terbuka berulang, pelanggaran SLA >72 jam, ada dampak multi-tenant, atau ada ketidakcocokan data penting seperti kontrak, status kepegawaian, approval, dan tiket.",
    audience: "super_admin",
    sortOrder: 4,
  },
  {
    id: "hr-faq-5",
    category: "Governance",
    question: "Bagaimana membedakan isu konfigurasi tenant dengan isu produk sistem?",
    answer: "Jika masalah hanya muncul pada satu tenant dan terkait pengaturan modul/alert/kebijakan, itu biasanya konfigurasi. Jika pola error muncul lintas tenant dengan rute/konteks sama, itu indikasi isu sistem dan perlu investigasi lebih dalam.",
    audience: "super_admin",
    sortOrder: 5,
  },
  {
    id: "hr-faq-6",
    category: "Operasional Agent",
    question: "MCP apa yang diprioritaskan untuk investigasi dan validasi operasional repo ini?",
    answer: "Prioritaskan filesystem, Playwright, memory, dan context7. Jika akses GitHub atau inspeksi DB remote diperlukan, gunakan mode hanya-baca lebih dulu lalu naikkan izin hanya untuk task yang eksplisit.",
    audience: "super_admin",
    sortOrder: 6,
  },
  {
    id: "hr-faq-7",
    category: "Supabase Remote",
    question: "Kenapa akses Supabase remote sebaiknya hanya-baca secara bawaan?",
    answer: "Karena Supabase remote adalah sumber kebenaran. Aksi tulis seperti migration, cleanup data, perubahan auth, billing, peran, atau kebijakan bisa berdampak langsung ke environment aktif sehingga harus eksplisit per task dan didahului backup.",
    audience: "super_admin",
    sortOrder: 7,
  },
  {
    id: "hr-faq-8",
    category: "Playwright",
    question: "Apa preflight wajib sebelum menjalankan test browser di lingkungan lokal?",
    answer: "Jalankan npm run ops:sandbox:doctor:strict terlebih dahulu. Jika doctor gagal, jangan lanjutkan suite browser sampai environment lokal siap kembali agar hasil test tidak menyesatkan.",
    audience: "super_admin",
    sortOrder: 8,
  },
  {
    id: "hr-faq-9",
    category: "Operasional",
    question: "Bagaimana mematikan log error global tetapi tetap mengaktifkan untuk tenant tertentu?",
    answer: "Buka /admin/error-logs, set Mode Log Error ke paused lalu simpan. Jika ada permintaan dari admin organisasi, gunakan Override Tenant untuk memilih tenant dan set mode full atau critical_only. Override ini hanya bisa diatur super admin.",
    audience: "super_admin",
    sortOrder: 9,
  },
  {
    id: "hr-faq-10",
    category: "Operasional",
    question: "Bagaimana menonaktifkan audit trail per tenant dan apa risikonya?",
    answer: "Gunakan kebijakan audit_logs_activity_policy: default_org_logging_enabled untuk global dan tenant_overrides untuk tenant tertentu. Menonaktifkan audit menurunkan beban tulis/retensi, tetapi menghilangkan jejak aktivitas untuk investigasi, compliance, dan sengketa data.",
    audience: "super_admin",
    sortOrder: 10,
  },
];

const normalizeFaqSettings = (raw: unknown): ManagedFaqItem[] => {
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === "object" && Array.isArray((raw as FaqSettingsValue).items)) {
    items = (raw as FaqSettingsValue).items ?? [];
  }

  return items
    .map((item, index) => {
      const row = item as Partial<{
        id: string;
        category: string;
        question: string;
        answer: string;
        audience: FaqAudience;
        sort_order: number | null;
      }>;

      if (typeof row.question !== "string" || typeof row.answer !== "string") return null;
      const category = typeof row.category === "string" && row.category.trim() ? row.category.trim() : "Umum";
      const audience = resolveFaqAudience({
        audience: row.audience,
        category,
        question: row.question,
        answer: row.answer,
      });

      const isHrRelevant =
        `${category} ${row.question} ${row.answer}`.toLowerCase().includes("hr") ||
        `${category} ${row.question} ${row.answer}`.toLowerCase().includes("/org/hr");

      if (!(audience === "super_admin" || audience === "org_admin" || isHrRelevant)) return null;

      return {
        id: typeof row.id === "string" && row.id.trim() ? row.id : `admin-hr-faq-${index + 1}`,
        category,
        question: row.question,
        answer: row.answer,
        audience,
        sortOrder: typeof row.sort_order === "number" && Number.isFinite(row.sort_order) ? row.sort_order : null,
      } satisfies ManagedFaqItem;
    })
    .filter((row): row is ManagedFaqItem => Boolean(row))
    .sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
};

export default function AdminHRFAQ() {
  const [items, setItems] = useState<ManagedFaqItem[]>(FALLBACK_FAQS);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loadFaq = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "faq_settings")
        .maybeSingle();

      if (error) throw error;
      const managedFaqs = normalizeFaqSettings(data?.value);
      setItems(managedFaqs.length > 0 ? managedFaqs : FALLBACK_FAQS);
    } catch (error) {
      const ref = reportError(error, "admin.hr.faq.load");
      toast.error(appendErrorReference("Gagal memuat FAQ dukungan HR", ref));
      setItems(FALLBACK_FAQS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFaq();
  }, [loadFaq]);

  const filteredItems = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      `${item.category} ${item.question} ${item.answer}`.toLowerCase().includes(keyword),
    );
  }, [items, searchQuery]);

  const categoryCount = useMemo(() => new Set(items.map((item) => item.category)).size, [items]);

  return (
    <AdminHRPageShell
      title="FAQ Dukungan HR"
      subtitle="Pertanyaan umum dukungan HR"
      description="Kumpulan jawaban standar untuk tim dukungan HR agar respons ke tenant tetap konsisten, cepat, dan dapat ditelusuri."
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard title="FAQ Aktif" value={items.length} note="Item FAQ yang siap dipakai tim dukungan." />
          <MetricCard title="Kategori" value={categoryCount} note="Kelompok topik untuk navigasi internal." />
          <MetricCard title="Hasil Pencarian" value={filteredItems.length} note="Item yang cocok dengan query saat ini." />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Cari FAQ HR</CardTitle>
                <CardDescription>
                  Gunakan sebagai jawaban acuan bawaan sebelum mengarahkan tenant ke tiket, audit, atau tim engineering.
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/faq">Buka Manajemen FAQ Global</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari topik, pertanyaan, atau jawaban..."
                className="pl-9"
              />
            </div>

            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat FAQ HR...</div>
            ) : filteredItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Tidak ada FAQ yang cocok. Coba kata kunci lain atau kelola kontennya dari Manajemen FAQ.
              </div>
            ) : (
              <Accordion type="single" collapsible className="space-y-3">
                {filteredItems.map((item) => (
                  <Card key={item.id}>
                    <AccordionItem value={item.id} className="border-none">
                      <CardHeader className="pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{item.category}</Badge>
                          <Badge variant={item.audience === "super_admin" ? "secondary" : "outline"}>
                            {item.audience === "super_admin" ? "Super Admin" : "Admin Org/Relevan"}
                          </Badge>
                        </div>
                        <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
                      </CardHeader>
                      <AccordionContent>
                        <CardContent className="pt-0 text-sm text-muted-foreground">
                          {item.answer}
                        </CardContent>
                      </AccordionContent>
                    </AccordionItem>
                  </Card>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminHRPageShell>
  );
}

function MetricCard({ title, value, note }: { title: string; value: number; note: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
