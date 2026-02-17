import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NavigationBar } from "@/components/homepage/NavigationBar";
import { FooterSection } from "@/components/homepage/FooterSection";
import { FloatingWhatsApp } from "@/components/common/FloatingWhatsApp";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Building2,
  Loader2,
  MapPinned,
  Quote,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import DOMPurify from "dompurify";
import type { FooterSettings } from "@/hooks/useHomepageData";

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

const journeyMilestones = [
  {
    year: "2023",
    title: "Fondasi Produk",
    description: "Memvalidasi kebutuhan absensi GPS untuk instansi dengan alur kerja kompleks.",
  },
  {
    year: "2024",
    title: "Skala Multi-Organisasi",
    description: "Menambahkan dukungan role, tenant, approval, dan pelaporan lintas unit kerja.",
  },
  {
    year: "2025",
    title: "Otomasi Operasional",
    description: "Integrasi billing, notifikasi, dan otomasi edge function untuk reliabilitas layanan.",
  },
];

const trustStats = [
  { value: "99.9%", label: "Target Ketersediaan Layanan" },
  { value: "< 3 Menit", label: "Waktu Aktivasi Organisasi" },
  { value: "24/7", label: "Monitoring Operasional" },
];

const testimonials = [
  {
    quote:
      "AbsensiKu mempercepat proses validasi kehadiran harian dan mengurangi pekerjaan administratif tim kami.",
    source: "Tim Kepegawaian Instansi",
  },
  {
    quote:
      "Dashboard pelaporan membantu pimpinan mengambil keputusan lebih cepat karena data hadir real-time.",
    source: "Manajemen Organisasi",
  },
];

const withFallbackImageAlt = (html: string) =>
  html.replace(/<img\b(?![^>]*\balt=)([^>]*)>/gi, '<img alt="Ilustrasi konten AbsensiKu"$1>');

const About = () => {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(defaultFooterSettings);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch about page content
      const { data: aboutData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "about_page_content")
        .maybeSingle();

      if (aboutData?.value && typeof aboutData.value === "object" && "content" in aboutData.value) {
        setContent((aboutData.value as { content: string }).content || "");
      }

      // Fetch footer settings
      const { data: footerData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "footer_settings")
        .maybeSingle();

      if (footerData?.value) {
        setFooterSettings({ ...defaultFooterSettings, ...(footerData.value as Partial<FooterSettings>) });
      }
    } catch (error) {
      console.error("Error fetching about page:", error);
    } finally {
      setIsLoading(false);
    }
  };

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

      <main className="pt-24 pb-16 px-4 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-info/10 blur-3xl" />
        </div>

        <div className="container mx-auto max-w-6xl space-y-12">
          <section className="rounded-2xl border bg-card/70 backdrop-blur-sm p-6 md:p-10 animate-fade-in">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 mb-4 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4 text-accent" />
                  Platform Absensi Digital Berbasis GPS
                </div>
                <h1 className="text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  Tentang <span className="text-gradient">AbsensiKu</span>
                </h1>
                <p className="mt-5 text-lg text-muted-foreground max-w-xl">
                  Kami membantu instansi pemerintah dan organisasi modern mengelola kehadiran pegawai
                  dengan lebih akurat, aman, dan mudah dipantau secara real-time.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to="/org/login?mode=register">
                    <Button variant="gold" className="gap-2">
                      Mulai Gratis
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/faq">
                    <Button variant="outline">Lihat FAQ</Button>
                  </Link>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-background/60 p-4">
                  <MapPinned className="h-5 w-5 text-primary mb-2" />
                  <p className="font-semibold text-foreground">Akurasi Lokasi</p>
                  <p className="text-sm text-muted-foreground">Validasi GPS untuk mencegah absensi tidak valid.</p>
                </div>
                <div className="rounded-xl border bg-background/60 p-4">
                  <ShieldCheck className="h-5 w-5 text-primary mb-2" />
                  <p className="font-semibold text-foreground">Keamanan Data</p>
                  <p className="text-sm text-muted-foreground">Arsitektur dengan kontrol akses dan audit log.</p>
                </div>
                <div className="rounded-xl border bg-background/60 p-4 sm:col-span-2">
                  <Building2 className="h-5 w-5 text-primary mb-2" />
                  <p className="font-semibold text-foreground">Siap Multi-Organisasi</p>
                  <p className="text-sm text-muted-foreground">
                    Cocok untuk instansi dengan struktur unit kerja dan kebutuhan pelaporan yang kompleks.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {content ? (
            <section className="rounded-2xl border bg-card p-6 md:p-10 animate-slide-up">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">Profil Perusahaan</h2>
              <div
                className="prose prose-lg dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground"
                dangerouslySetInnerHTML={{
                  __html: withFallbackImageAlt(
                    DOMPurify.sanitize(content, {
                      ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "h1", "h2", "h3", "h4", "ul", "ol", "li", "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "img"],
                      ALLOWED_ATTR: ["href", "target", "rel", "class", "src", "alt", "width", "height"],
                    })
                  ),
                }}
              />
            </section>
          ) : (
            <section className="space-y-8 animate-slide-up">
              <div className="text-center max-w-3xl mx-auto">
                <h2 className="text-3xl font-bold text-foreground mb-3">Misi Kami</h2>
                <p className="text-muted-foreground text-lg">
                  Menghadirkan sistem absensi modern yang andal, mudah digunakan, dan relevan untuk kebutuhan organisasi di Indonesia.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="p-6 bg-card rounded-xl border animate-scale-in" style={{ animationDelay: "60ms" }}>
                  <h3 className="text-xl font-semibold mb-3">Visi</h3>
                  <p className="text-muted-foreground">
                    Menjadi platform absensi digital terpercaya untuk instansi dan organisasi skala nasional.
                  </p>
                </div>
                <div className="p-6 bg-card rounded-xl border animate-scale-in" style={{ animationDelay: "120ms" }}>
                  <h3 className="text-xl font-semibold mb-3">Misi</h3>
                  <p className="text-muted-foreground">
                    Menyederhanakan proses kehadiran, persetujuan, dan pelaporan dengan pengalaman yang jelas.
                  </p>
                </div>
                <div className="p-6 bg-card rounded-xl border animate-scale-in" style={{ animationDelay: "180ms" }}>
                  <h3 className="text-xl font-semibold mb-3">Nilai</h3>
                  <p className="text-muted-foreground">
                    Akurasi, keamanan, dan transparansi menjadi fondasi dalam setiap pengembangan produk.
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="grid lg:grid-cols-3 gap-6">
            {trustStats.map((stat, index) => (
              <div
                key={stat.label}
                className="rounded-xl border bg-card/80 p-6 animate-scale-in"
                style={{ animationDelay: `${120 + index * 80}ms` }}
              >
                <p className="text-3xl font-bold text-primary">{stat.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border bg-card p-6 md:p-10 animate-slide-up">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8">Perjalanan Produk</h2>
            <div className="space-y-5">
              {journeyMilestones.map((milestone, index) => (
                <div
                  key={milestone.year}
                  className="grid md:grid-cols-[120px_1fr] gap-4 items-start animate-fade-in"
                  style={{ animationDelay: `${200 + index * 100}ms` }}
                >
                  <div>
                    <span className="inline-flex rounded-full border px-3 py-1 text-sm font-semibold text-primary">
                      {milestone.year}
                    </span>
                  </div>
                  <div className="rounded-xl border bg-background/60 p-4">
                    <h3 className="text-lg font-semibold text-foreground">{milestone.title}</h3>
                    <p className="mt-2 text-muted-foreground">{milestone.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid lg:grid-cols-2 gap-6">
            {testimonials.map((item, index) => (
              <article
                key={item.source}
                className="rounded-2xl border bg-card p-6 animate-slide-up"
                style={{ animationDelay: `${250 + index * 120}ms` }}
              >
                <Quote className="h-6 w-6 text-accent mb-3" />
                <p className="text-foreground leading-relaxed">{item.quote}</p>
                <p className="mt-4 text-sm font-medium text-muted-foreground">{item.source}</p>
              </article>
            ))}
          </section>
        </div>
      </main>

      <FooterSection settings={footerSettings} />
      <FloatingWhatsApp />
    </div>
  );
};

export default About;
