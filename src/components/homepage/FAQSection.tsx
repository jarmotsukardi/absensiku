import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { BannerSidebar } from "@/components/banners/BannerSidebar";
import { DeferredRender } from "@/components/homepage/DeferredRender";
import { ChevronRight } from "lucide-react";
import type { FAQ } from "@/hooks/useHomepageData";

interface FAQSectionProps {
  faqs: FAQ[];
  isLoading?: boolean;
  showPromoSidebar?: boolean;
  promoTitle?: string;
  promoSubtitle?: string;
}

const MAX_DISPLAY = 10;

const defaultFAQs: FAQ[] = [
  { id: "1", question: "Bagaimana cara mendaftar?", answer: "Klik tombol Daftar di halaman utama, lalu isi form pendaftaran dengan data organisasi Anda.", category: "Umum", sort_order: 1 },
  { id: "2", question: "Apakah ada masa trial gratis?", answer: "Ya, semua organisasi mendapat akses gratis untuk mencoba fitur dasar.", category: "Harga", sort_order: 2 },
  { id: "3", question: "Bagaimana sistem absensi GPS bekerja?", answer: "Sistem akan memvalidasi lokasi pegawai saat check-in/out menggunakan GPS smartphone.", category: "Fitur", sort_order: 3 },
  { id: "4", question: "Apakah bisa digunakan offline?", answer: "Absensi membutuhkan koneksi internet untuk validasi lokasi dan sinkronisasi data.", category: "Teknis", sort_order: 4 },
];

export function FAQSection({
  faqs,
  isLoading = false,
  showPromoSidebar = false,
  promoTitle,
  promoSubtitle,
}: FAQSectionProps) {
  const allFaqs = faqs.length > 0 ? faqs : isLoading ? [] : defaultFAQs;
  const orderedFaqs = [...allFaqs].sort((a, b) => {
    const left = Number.isFinite(a.sort_order) ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const right = Number.isFinite(b.sort_order) ? b.sort_order : Number.MAX_SAFE_INTEGER;
    return left - right;
  });
  const displayFAQs = orderedFaqs.slice(0, MAX_DISPLAY);
  const hasMore = orderedFaqs.length > MAX_DISPLAY;

  return (
    <section id="faq" className="py-20 px-4 bg-muted/30">
      <Helmet>
        <script
          type="application/ld+json"
        >{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: displayFAQs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: faq.answer,
            },
          })),
        })}</script>
      </Helmet>
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Pertanyaan Umum</h2>
          <p className="text-muted-foreground text-lg">Temukan jawaban untuk pertanyaan yang sering diajukan.</p>
        </div>

        <div className="max-w-4xl mx-auto mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-sm font-medium text-primary">Tahap 1</p>
            <h3 className="mt-2 text-xl font-bold text-foreground">Mulai dari Absensi</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Cocok untuk organisasi yang ingin merapikan check-in, check-out, validasi lokasi, sinkronisasi, dan laporan kehadiran harian.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-sm font-medium text-info">Tahap 2</p>
            <h3 className="mt-2 text-xl font-bold text-foreground">Pertimbangkan HR saat siap</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Saat absensi sudah stabil, organisasi bisa mulai membahas data pegawai, cuti, approval, onboarding, dokumen, dan workflow SDM.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-sm font-medium text-accent-foreground">Tahap 3</p>
            <h3 className="mt-2 text-xl font-bold text-foreground">Pertimbangkan Payroll bila perlu</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Setelah fondasi data operasional dan HR rapi, payroll bisa dipertimbangkan untuk menutup periode gaji dengan validasi, approval, slip, dan audit.
            </p>
          </div>
        </div>

        <div className={`grid gap-8 ${showPromoSidebar ? 'lg:grid-cols-3' : 'max-w-4xl mx-auto'}`}>
          {/* FAQ Content */}
          <div className={showPromoSidebar ? 'lg:col-span-2' : ''}>
            {isLoading && displayFAQs.length === 0 ? (
              <div className="space-y-4">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="rounded-lg border border-border/50 bg-card px-6 py-5">
                    <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="mt-4 h-4 w-full animate-pulse rounded bg-muted" />
                    <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : (
              <Accordion type="single" collapsible className="w-full space-y-4">
                {displayFAQs.map((faq) => (
                  <AccordionItem
                    key={faq.id}
                    value={faq.id}
                    className="bg-card border border-border/50 rounded-lg px-6"
                  >
                    <AccordionTrigger className="text-left hover:no-underline">
                      <span className="font-medium text-foreground">{faq.question}</span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}

            {/* See More Button */}
            {hasMore && (
              <div className="text-center mt-6">
                <Link to="/faq">
                  <Button variant="outline" className="gap-2">
                    Lihat Semua FAQ ({orderedFaqs.length})
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Promo Sidebar */}
          {showPromoSidebar && (
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-4">
                <div className="text-center lg:text-left">
                  <h3 className="text-xl font-bold text-foreground mb-2">{promoTitle || "Promosi & Info Terbaru"}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{promoSubtitle || "Dapatkan penawaran menarik"}</p>
                </div>
                <DeferredRender rootMargin="250px 0px" minHeight={240}>
                  <BannerSidebar position="homepage" />
                </DeferredRender>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
