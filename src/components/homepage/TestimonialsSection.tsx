import { Card, CardContent } from "@/components/ui/card";
import { Star, Quote } from "lucide-react";
import type { Testimonial } from "@/hooks/useHomepageData";

interface TestimonialsSectionProps {
  testimonials: Testimonial[];
  speed?: number; // seconds for one full cycle
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
    <Card className="border-border/50 min-w-[280px] max-w-[320px] flex-shrink-0">
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

export function TestimonialsSection({ testimonials, speed = 30 }: TestimonialsSectionProps) {
  const displayTestimonials = testimonials.length > 0 ? testimonials : defaultTestimonials;
  // Duplicate for seamless loop
  const marqueeItems = [...displayTestimonials, ...displayTestimonials];

  return (
    <section className="py-16 px-4 overflow-hidden">
      <div className="container mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Apa Kata Mereka</h2>
          <p className="text-muted-foreground text-sm">Testimoni dari pengguna AbsensiKu</p>
        </div>
      </div>

      {/* Infinite Marquee */}
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10" />
        
        <div 
          className="flex gap-4 animate-marquee"
          style={{ 
            animationDuration: `${speed}s`,
            width: 'max-content'
          }}
        >
          {marqueeItems.map((testimonial, index) => (
            <TestimonialCard key={`${testimonial.id}-${index}`} testimonial={testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}
