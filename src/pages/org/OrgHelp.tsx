import { useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
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
} from "lucide-react";

interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  sort_order?: number | null;
}

interface GeneralSettingsValue {
  supportEmail?: string;
  supportPhone?: string;
}

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
];

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Umum: BookOpen,
  Absensi: Clock,
  "Izin & Cuti": FileText,
  Perangkat: Smartphone,
  Keamanan: Shield,
};

export default function OrgHelp() {
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [supportEmail, setSupportEmail] = useState("support@absensi.app");
  const [supportPhone, setSupportPhone] = useState("6281234567890");

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;

        if (!userId) {
          setFaqs(DUMMY_FAQS);
          return;
        }

        const [roleRes, generalRes] = await Promise.all([
          supabase
            .from("user_roles")
            .select("tenant_id")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase.from("system_settings").select("value").eq("key", "general_settings").maybeSingle(),
        ]);

        if (generalRes.data?.value && typeof generalRes.data.value === "object") {
          const v = generalRes.data.value as unknown as GeneralSettingsValue;
          if (typeof v.supportEmail === "string" && v.supportEmail.trim()) {
            setSupportEmail(v.supportEmail.trim());
          }
          if (typeof v.supportPhone === "string" && v.supportPhone.trim()) {
            setSupportPhone(v.supportPhone.trim());
          }
        }

        const tenantId = roleRes.data?.tenant_id;
        if (!tenantId) {
          setFaqs(DUMMY_FAQS);
          return;
        }

        const { data: tenantFaqs, error: tenantErr } = await supabase
          .from("faqs")
          .select("id, category, question, answer, sort_order")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true, nullsFirst: false });

        if (tenantErr) throw tenantErr;

        let finalFaqs: FAQ[] = (tenantFaqs || []).map((f) => ({
          id: f.id,
          category: f.category || "Umum",
          question: f.question,
          answer: f.answer,
          sort_order: f.sort_order,
        }));

        if (finalFaqs.length === 0) {
          const { data: globalFaqs, error: globalErr } = await supabase
            .from("faqs")
            .select("id, category, question, answer, sort_order")
            .is("tenant_id", null)
            .eq("is_active", true)
            .order("sort_order", { ascending: true, nullsFirst: false });

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
        toast.error(appendErrorReference("Gagal memuat pusat bantuan", errorRef));
        setFaqs(DUMMY_FAQS);
      } finally {
        setIsLoading(false);
      }
    };

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
            Pusat Bantuan
          </h1>
          <p className="text-muted-foreground">
            Temukan jawaban untuk pertanyaan umum seputar aplikasi absensi
          </p>
        </div>

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

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Butuh Bantuan Lebih Lanjut?
            </CardTitle>
            <CardDescription>
              Jika pertanyaan Anda belum terjawab, silakan hubungi tim support kami
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => window.open(`mailto:${supportEmail}`, "_blank")}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Kirim Email
            </Button>
            <Button variant="outline" onClick={() => waLink && window.open(waLink, "_blank")} disabled={!waLink}>
              <ExternalLink className="h-4 w-4 mr-2" />
              WhatsApp Support
            </Button>
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_help_center" />
      </div>
    </OrganizationLayout>
  );
}
