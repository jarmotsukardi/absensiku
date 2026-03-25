import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Briefcase, Calculator, CheckCircle2, MapPin, Rocket } from "lucide-react";

import { FloatingWhatsApp } from "@/components/common/FloatingWhatsApp";
import { NavigationBar } from "@/components/homepage/NavigationBar";
import { FooterSection } from "@/components/homepage/FooterSection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import type { FooterSettings } from "@/hooks/useHomepageData";
import { PUBLIC_BASE_URL, usePublicSeoSettings } from "@/hooks/usePublicSeoSettings";

const defaultFooterSettings: FooterSettings = {
  company_name: "AbsensiKu",
  company_description: "Platform absensi untuk organisasi modern dengan jalur lanjutan ke HR dan payroll.",
  copyright_text: "© 2026 AbsensiKu. Hak cipta dilindungi.",
  enable_contact: true,
  enable_social_media: true,
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

const consultationCases = [
  {
    title: "Rollout instansi besar",
    description: "Cocok saat organisasi ingin mulai gratis, tetapi butuh arahan rollout untuk banyak pegawai, unit kerja, atau perangkat lapangan.",
    icon: Rocket,
  },
  {
    title: "Ekspansi ke HR",
    description: "Dipakai saat fondasi absensi sudah stabil dan tim mulai butuh alur data pegawai, cuti, approval, dan dokumen yang lebih rapi.",
    icon: Briefcase,
  },
  {
    title: "Ekspansi ke Payroll",
    description: "Dipakai saat organisasi ingin menutup alur sampai payroll, validasi, slip, pembayaran, dan audit dengan sumber data yang sama.",
    icon: Calculator,
  },
];

const Consultation = () => {
  const seoSettings = usePublicSeoSettings({
    metaTitle: "Konsultasi Implementasi AbsensiKu",
    metaDescription:
      "Diskusikan rollout lanjutan, kebutuhan enterprise, dan tahap berikutnya setelah AbsensiKu berjalan stabil.",
    metaKeywords: "konsultasi absensi, implementasi absensi, konsultasi tahap lanjutan, enterprise absensi",
  });
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(defaultFooterSettings);

  useEffect(() => {
    let isMounted = true;

    const fetchFooterSettings = async () => {
      try {
        const { data } = await supabase.from("system_settings").select("value").eq("key", "footer_settings").maybeSingle();
        if (!isMounted || !data?.value || typeof data.value !== "object") return;

        const candidate = data.value as Partial<FooterSettings>;
        setFooterSettings({
          ...defaultFooterSettings,
          ...candidate,
          quick_links: Array.isArray(candidate.quick_links) ? candidate.quick_links : [],
          legal_links: Array.isArray(candidate.legal_links) ? candidate.legal_links : [],
        });
      } catch {
        if (isMounted) {
          setFooterSettings(defaultFooterSettings);
        }
      }
    };

    void fetchFooterSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{seoSettings.metaTitle}</title>
        <meta name="description" content={seoSettings.metaDescription} />
        <meta name="keywords" content={seoSettings.metaKeywords} />
        <link rel="canonical" href={`${PUBLIC_BASE_URL}/konsultasi`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={seoSettings.ogTitle} />
        <meta property="og:description" content={seoSettings.ogDescription} />
        <meta property="og:url" content={`${PUBLIC_BASE_URL}/konsultasi`} />
        {seoSettings.ogImage ? <meta property="og:image" content={seoSettings.ogImage} /> : null}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoSettings.twitterTitle} />
        <meta name="twitter:description" content={seoSettings.twitterDescription} />
        {seoSettings.ogImage ? <meta name="twitter:image" content={seoSettings.ogImage} /> : null}
      </Helmet>

      <NavigationBar />

      <main className="px-4 pb-16 pt-24">
        <div className="container mx-auto max-w-6xl space-y-10">
          <section className="rounded-3xl border bg-card/80 p-6 shadow-soft backdrop-blur-sm md:p-10">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-sm font-medium text-primary">
                  Konsultasi Implementasi
                </div>
                <h1 className="mt-5 text-4xl font-bold leading-tight text-foreground md:text-5xl">
                  Mulai gratis dulu.
                  <span className="block text-gradient">Konsultasi dipakai saat organisasi butuh bantuan lebih jauh.</span>
                </h1>
                <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
                  AbsensiKu tidak mewajibkan demo sebelum dipakai. Halaman ini disiapkan untuk organisasi yang ingin
                  berdiskusi soal rollout besar, tahap lanjutan ke HR atau Payroll, maupun kebutuhan enterprise tanpa memutus alur adopsi gratis.
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <Link to="/org/login?mode=register" className="w-full">
                    <Button variant="gold" size="lg" className="w-full">
                      Mulai Gratis Sekarang
                    </Button>
                  </Link>
                  <a href="#hubungi" className="w-full">
                    <Button variant="outline" size="lg" className="w-full">
                      Hubungi Tim Konsultasi
                    </Button>
                  </a>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    "Tidak perlu menunggu demo untuk mencoba produk inti.",
                    "Konsultasi dipakai saat organisasi perlu rollout atau scope yang lebih kompleks.",
                    "Absensi tetap jadi fondasi, lalu kebutuhan HR/Payroll dibahas sebagai tahap berikutnya.",
                    "Tim implementasi bisa membantu menyusun tahap adopsi yang realistis.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-2 rounded-xl border bg-background/70 p-4">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <p className="text-sm text-muted-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Card className="border-border/60 bg-background/80">
                <CardHeader>
                  <CardTitle>Kapan konsultasi biasanya dipakai?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">Banyak lokasi atau unit kerja</p>
                      <p className="mt-1 text-sm text-muted-foreground">Perlu bantuan setup tenant, struktur organisasi, dan tahapan aktivasi.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
                    <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">Mulai masuk HR</p>
                      <p className="mt-1 text-sm text-muted-foreground">Perlu diskusi modul, approval, dan prioritas kerja HR setelah absensi stabil.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
                    <Calculator className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">Mulai masuk Payroll</p>
                      <p className="mt-1 text-sm text-muted-foreground">Perlu menyusun jalur dari data hadir ke payroll run, slip, dan audit.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {consultationCases.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-2xl border bg-card p-6 shadow-soft">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold text-foreground">{item.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </article>
              );
            })}
          </section>

          <section id="hubungi" className="rounded-3xl border bg-primary p-6 text-primary-foreground shadow-soft md:p-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold">Pilih jalur yang paling sesuai</h2>
              <p className="mt-4 text-sm text-primary-foreground/80">
                Kalau Anda ingin mulai cepat, gunakan jalur gratis. Kalau butuh rollout, kebutuhan enterprise, atau pembahasan tahap lanjutan,
                gunakan WhatsApp publik atau lanjutkan ke jalur yang paling dekat dengan kebutuhan Anda.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Link to="/org/login?mode=register" className="w-full">
                  <Button variant="gold" className="w-full">Mulai Gratis</Button>
                </Link>
                <Link to="/hr" className="w-full">
                  <Button variant="outline" className="w-full border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground hover:bg-primary-foreground/10">Bahas HR</Button>
                </Link>
                <Link to="/payroll" className="w-full">
                  <Button variant="outline" className="w-full border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground hover:bg-primary-foreground/10">Bahas Payroll</Button>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>

      <FooterSection settings={footerSettings} />
      <FloatingWhatsApp />
    </div>
  );
};

export default Consultation;
