import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NavigationBar } from "@/components/homepage/NavigationBar";
import { FooterSection } from "@/components/homepage/FooterSection";
import { FloatingWhatsApp } from "@/components/common/FloatingWhatsApp";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  ArrowLeft,
  Sparkles,
  MessageCircle,
} from "lucide-react";
import type { FooterSettings } from "@/hooks/useHomepageData";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
}

interface FAQSettingsObject {
  items?: FAQ[];
  banner_image_url?: string;
}

const ITEMS_PER_PAGE = 10;

const defaultFooterSettings: FooterSettings = {
  company_name: "AbsensiKu",
  company_description: "Sistem absensi GPS modern untuk pemerintah dan perusahaan.",
  copyright_text: "© 2024 AbsensiKu. Hak cipta dilindungi.",
  address: "",
  email: "",
  phone: "",
  whatsapp: "",
  quick_links: [],
  legal_links: [],
  social_facebook: "",
  social_instagram: "",
  social_twitter: "",
  social_youtube: "",
};

const isFaq = (value: unknown): value is FAQ => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.question === "string" &&
    typeof item.answer === "string" &&
    typeof item.category === "string" &&
    typeof item.sort_order === "number"
  );
};

const asFaqArray = (value: unknown): FAQ[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isFaq).sort((a, b) => a.sort_order - b.sort_order);
};

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(defaultFooterSettings);

  useEffect(() => {
    fetchFAQs();
  }, []);

  const fetchFAQs = async () => {
    try {
      const { data: faqData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "faq_settings")
        .maybeSingle();

      if (faqData?.value) {
        const val = faqData.value as unknown;
        if (Array.isArray(val)) {
          setFaqs(asFaqArray(val));
        } else if (val && typeof val === "object") {
          const faqSettings = val as FAQSettingsObject;
          if (Array.isArray(faqSettings.items)) {
            setFaqs(asFaqArray(faqSettings.items));
          }
          setBannerImageUrl(
            typeof faqSettings.banner_image_url === "string" ? faqSettings.banner_image_url : ""
          );
        }
      }

      const { data: footerData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "footer_settings")
        .maybeSingle();

      if (footerData?.value) {
        setFooterSettings({
          ...defaultFooterSettings,
          ...(footerData.value as Partial<FooterSettings>),
        });
      }
    } catch (error) {
      console.error("Error fetching FAQs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFaqs = useMemo(() => {
    let result = [...faqs];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((faq) =>
        faq.question.toLowerCase().includes(query) ||
        faq.answer.toLowerCase().includes(query) ||
        faq.category.toLowerCase().includes(query)
      );
    }
    
    if (selectedCategory !== "all") {
      result = result.filter((faq) => faq.category === selectedCategory);
    }

    return result;
  }, [faqs, searchQuery, selectedCategory]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, faqs]);

  const categories = ["all", ...new Set(faqs.map((f) => f.category))];
  const totalPages = Math.ceil(filteredFaqs.length / ITEMS_PER_PAGE);
  const paginatedFaqs = filteredFaqs.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      
      <main className="pt-20 pb-16 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-info/10 blur-3xl" />
        </div>

        {/* Banner Image */}
        {bannerImageUrl && (
          <div className="w-full h-48 md:h-64 overflow-hidden rounded-b-2xl mb-8">
            <img src={bannerImageUrl} alt="FAQ Banner" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Hero */}
          <section className="rounded-2xl border bg-card/70 backdrop-blur-sm p-6 md:p-10 mb-8 animate-fade-in">
            <div className="text-center">
              <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Beranda
              </Link>
              <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 mb-4 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-accent" />
                Pusat Bantuan AbsensiKu
              </div>
              <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-3">
                Pertanyaan yang Sering Ditanyakan
              </h1>
              <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg">
                Cari jawaban secara cepat berdasarkan kategori, lalu temukan solusi untuk penggunaan
                layanan AbsensiKu sehari-hari.
              </p>
            </div>
          </section>

          {/* Search & Filter */}
          <Card className="mb-6 animate-slide-up">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari pertanyaan..."
                    aria-label="Cari pertanyaan FAQ"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <Button
                      key={cat}
                      size="sm"
                      variant={selectedCategory === cat ? "default" : "outline"}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat === "all" ? "Semua" : cat}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* FAQ Stats */}
          <div className="flex items-center justify-between mb-4 animate-fade-in">
            <p className="text-sm text-muted-foreground">
              Menampilkan {paginatedFaqs.length} dari {filteredFaqs.length} pertanyaan
            </p>
            {totalPages > 1 && (
              <p className="text-sm text-muted-foreground">
                Halaman {currentPage} dari {totalPages}
              </p>
            )}
          </div>

          {/* FAQ List */}
          {paginatedFaqs.length === 0 ? (
            <Card className="animate-scale-in">
              <CardContent className="p-8 text-center">
                <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "Tidak ada FAQ yang cocok dengan pencarian Anda." : "Belum ada FAQ tersedia."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Accordion type="single" collapsible className="space-y-3">
              {paginatedFaqs.map((faq, index) => (
                <AccordionItem
                  key={faq.id}
                  value={faq.id}
                  className="bg-card border border-border/50 rounded-lg px-6 animate-fade-in"
                  style={{ animationDelay: `${60 + index * 40}ms` }}
                >
                  <AccordionTrigger className="text-left hover:no-underline py-4">
                    <div className="flex items-start gap-3 flex-1 pr-4">
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {faq.category}
                      </Badge>
                      <span className="font-medium text-foreground">{faq.question}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="pl-0 md:pl-16 text-muted-foreground whitespace-pre-line">
                      {faq.answer}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
                Sebelumnya
              </Button>
              
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }
                  
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      className="w-9"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Berikutnya
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Contact CTA */}
          <Card className="mt-12 bg-primary/5 border-primary/20 animate-slide-up">
            <CardContent className="p-6 text-center">
              <h3 className="text-lg font-semibold mb-2">Tidak menemukan jawaban?</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Hubungi tim support kami untuk bantuan lebih lanjut.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" asChild>
                  <a href="mailto:support@absensiku.id">Email Support</a>
                </Button>
                <Button variant="gold" asChild>
                  <a href="https://wa.me/6281234567890" target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="w-4 h-4 mr-2" />
                    WhatsApp
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <FooterSection settings={footerSettings} />
      
      <FloatingWhatsApp />
    </div>
  );
}
