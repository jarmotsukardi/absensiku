import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, Quote, ChevronLeft, ChevronRight } from "lucide-react";
import type { Testimonial } from "@/hooks/useHomepageData";

interface TestimonialsSectionProps {
  testimonials: Testimonial[];
}

const defaultTestimonials: Testimonial[] = [
  { id: "1", name: "Budi Santoso", role: "Kepala Dinas", company: "Dinas Kominfo Kota Bandung", content: "Sistem absensi yang sangat membantu dalam monitoring kehadiran pegawai secara real-time.", rating: 5, avatar_url: "" },
  { id: "2", name: "Siti Rahayu", role: "HRD Manager", company: "PT. Maju Bersama", content: "Mudah digunakan dan laporan sangat lengkap untuk kebutuhan HR kami.", rating: 5, avatar_url: "" },
  { id: "3", name: "Ahmad Fauzi", role: "Sekretaris Daerah", company: "Pemkab Maluku Tengah", content: "Solusi terbaik untuk absensi ASN dengan fitur anti fake GPS yang handal.", rating: 5, avatar_url: "" },
  { id: "4", name: "Dewi Lestari", role: "Direktur SDM", company: "RS Harapan Sehat", content: "Multi-shift dan multi-lokasi sangat membantu manajemen rumah sakit.", rating: 5, avatar_url: "" },
  { id: "5", name: "Roni Kurniawan", role: "Kepala Sekolah", company: "SMA Negeri 1 Ambon", content: "Implementasi cepat dan support yang responsif, sangat direkomendasikan.", rating: 4, avatar_url: "" },
  { id: "6", name: "Iwan Setiawan", role: "IT Manager", company: "PT. Digital Nusantara", content: "API yang lengkap dan integrasi yang mudah dengan sistem existing kami.", rating: 5, avatar_url: "" },
];

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <Card className="border-border/50 h-full">
      <CardContent className="p-5">
        <div className="flex items-center gap-1 mb-3">
          {[...Array(testimonial.rating)].map((_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
          ))}
        </div>
        <div className="relative mb-3">
          <Quote className="absolute -top-1 -left-1 h-6 w-6 text-primary/10" />
          <p className="text-muted-foreground italic text-sm pl-4 line-clamp-3">"{testimonial.content}"</p>
        </div>
        <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-border">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-semibold text-xs">
              {testimonial.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </span>
          </div>
          <div>
            <p className="font-medium text-foreground text-sm">{testimonial.name}</p>
            <p className="text-[11px] text-muted-foreground">{testimonial.role} - {testimonial.company}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TestimonialsSection({ testimonials }: TestimonialsSectionProps) {
  const displayTestimonials = testimonials.length > 0 ? testimonials : defaultTestimonials;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(1);

  useEffect(() => {
    const updateCardsPerView = () => {
      const width = window.innerWidth;
      if (width >= 1280) {
        setCardsPerView(3);
      } else if (width >= 768) {
        setCardsPerView(2);
      } else {
        setCardsPerView(1);
      }
    };

    updateCardsPerView();
    window.addEventListener("resize", updateCardsPerView);
    return () => window.removeEventListener("resize", updateCardsPerView);
  }, []);

  const maxCards = Math.min(cardsPerView, displayTestimonials.length);
  const canSlide = displayTestimonials.length > maxCards;

  useEffect(() => {
    if (!canSlide) return;
    const intervalId = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % displayTestimonials.length);
    }, 6500);
    return () => window.clearInterval(intervalId);
  }, [canSlide, displayTestimonials.length]);

  useEffect(() => {
    if (currentIndex >= displayTestimonials.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, displayTestimonials.length]);

  const visibleTestimonials = useMemo(() => {
    if (displayTestimonials.length === 0) return [];
    return Array.from({ length: maxCards }, (_, offset) => {
      const index = (currentIndex + offset) % displayTestimonials.length;
      return displayTestimonials[index];
    });
  }, [currentIndex, displayTestimonials, maxCards]);

  const goNext = () => {
    if (!canSlide) return;
    setCurrentIndex((prev) => (prev + 1) % displayTestimonials.length);
  };

  const goPrev = () => {
    if (!canSlide) return;
    setCurrentIndex((prev) => (prev - 1 + displayTestimonials.length) % displayTestimonials.length);
  };

  return (
    <section className="py-20 px-4 bg-muted/20">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div className="text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Apa Kata Mereka</h2>
            <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
              Testimoni dari pengguna AbsensiKu setelah menjalankan operasional absensi di lapangan maupun kantor.
            </p>
          </div>
          <div className="flex items-center justify-center md:justify-end gap-2">
            <Button variant="outline" size="icon" onClick={goPrev} disabled={!canSlide} aria-label="Testimoni sebelumnya">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goNext} disabled={!canSlide} aria-label="Testimoni berikutnya">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
          {visibleTestimonials.map((testimonial, index) => (
            <TestimonialCard key={`${testimonial.id}-${currentIndex}-${index}`} testimonial={testimonial} />
          ))}
        </div>

        {canSlide && (
          <div className="flex items-center justify-center gap-2 mt-6">
            {displayTestimonials.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`h-2 rounded-full transition-all ${idx === currentIndex ? "w-6 bg-primary" : "w-2 bg-border hover:bg-primary/40"}`}
                aria-label={`Lihat testimoni ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
