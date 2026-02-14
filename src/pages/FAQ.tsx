import { useState, useEffect } from "react";
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
import { Loader2, Search, ChevronLeft, ChevronRight, HelpCircle, ArrowLeft } from "lucide-react";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
}

const ITEMS_PER_PAGE = 10;

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [filteredFaqs, setFilteredFaqs] = useState<FAQ[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchFAQs();
  }, []);

  useEffect(() => {
    filterFAQs();
  }, [faqs, searchQuery, selectedCategory]);

  const fetchFAQs = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "faq_settings")
        .maybeSingle();

      if (data?.value) {
        const val = data.value as any;
        if (Array.isArray(val)) {
          setFaqs(val.sort((a: FAQ, b: FAQ) => a.sort_order - b.sort_order));
        } else if (val.items && Array.isArray(val.items)) {
          setFaqs(val.items.sort((a: FAQ, b: FAQ) => a.sort_order - b.sort_order));
          setBannerImageUrl(val.banner_image_url || "");
        }
      }
    } catch (error) {
      console.error("Error fetching FAQs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterFAQs = () => {
    let result = [...faqs];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(faq => 
        faq.question.toLowerCase().includes(query) ||
        faq.answer.toLowerCase().includes(query) ||
        faq.category.toLowerCase().includes(query)
      );
    }
    
    if (selectedCategory !== "all") {
      result = result.filter(faq => faq.category === selectedCategory);
    }
    
    setFilteredFaqs(result);
    setCurrentPage(1);
  };

  const categories = ["all", ...new Set(faqs.map(f => f.category))];
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
      
      <main className="pt-20 pb-16">
        {/* Banner Image */}
        {bannerImageUrl && (
          <div className="w-full h-48 md:h-64 overflow-hidden rounded-b-2xl mb-8">
            <img src={bannerImageUrl} alt="FAQ Banner" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Beranda
            </Link>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 flex items-center justify-center gap-3">
              <HelpCircle className="w-8 h-8 text-primary" />
              Pusat Bantuan FAQ
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Temukan jawaban untuk pertanyaan yang sering diajukan seputar layanan AbsensiKu.
            </p>
          </div>

          {/* Search & Filter */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari pertanyaan..."
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
          <div className="flex items-center justify-between mb-4">
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
            <Card>
              <CardContent className="p-8 text-center">
                <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "Tidak ada FAQ yang cocok dengan pencarian Anda." : "Belum ada FAQ tersedia."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Accordion type="single" collapsible className="space-y-3">
              {paginatedFaqs.map((faq) => (
                <AccordionItem
                  key={faq.id}
                  value={faq.id}
                  className="bg-card border border-border/50 rounded-lg px-6"
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
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Berikutnya
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Contact CTA */}
          <Card className="mt-12 bg-primary/5 border-primary/20">
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
                    WhatsApp
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <FooterSection settings={{
        company_name: "AbsensiKu",
        company_description: "Sistem absensi GPS modern untuk pemerintah dan perusahaan.",
        copyright_text: "© 2024 AbsensiKu. Hak cipta dilindungi.",
        address: "", email: "", phone: "", whatsapp: "",
        quick_links: [], legal_links: [],
        social_facebook: "", social_instagram: "", social_twitter: "", social_youtube: "",
      }} />
      
      <FloatingWhatsApp />
    </div>
  );
}
