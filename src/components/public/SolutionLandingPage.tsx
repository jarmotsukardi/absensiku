import { useEffect, useState, type ComponentType } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, type LucideProps } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { FloatingWhatsApp } from "@/components/common/FloatingWhatsApp";
import { FooterSection } from "@/components/homepage/FooterSection";
import { NavigationBar } from "@/components/homepage/NavigationBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import type { FooterSettings } from "@/hooks/useHomepageData";
import { PUBLIC_BASE_URL, PUBLIC_LOGO_URL, usePublicSeoSettings } from "@/hooks/usePublicSeoSettings";

type IconComponent = ComponentType<LucideProps>;

interface SolutionItem {
  title: string;
  description: string;
  icon: IconComponent;
}

interface SolutionHighlight {
  label: string;
  value: string;
}

interface SolutionModule {
  title: string;
  description: string;
  bullets: string[];
}

interface SolutionFaq {
  question: string;
  answer: string;
}

interface SolutionPreviewMetric {
  label: string;
  value: string;
}

interface SolutionPreviewRow {
  label: string;
  helper: string;
  status: string;
}

interface SolutionPreview {
  title: string;
  subtitle: string;
  badge: string;
  imageSrc?: string;
  imageAlt?: string;
  progressLabel: string;
  progressValue: number;
  metrics: SolutionPreviewMetric[];
  rows: SolutionPreviewRow[];
}

interface SolutionLandingPageProps {
  path: string;
  seoTitle: string;
  seoDescription: string;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  highlights: SolutionHighlight[];
  pillars: SolutionItem[];
  modulesTitle: string;
  modulesDescription: string;
  modules: SolutionModule[];
  workflows: string[];
  integrationsTitle: string;
  integrationsDescription: string;
  proofPoints: string[];
  integrationBullets: string[];
  previewTitle: string;
  previewDescription: string;
  previews: SolutionPreview[];
  faqTitle: string;
  faqs: SolutionFaq[];
  primaryCtaLabel: string;
  primaryCtaTo: string;
  secondaryCtaLabel: string;
  secondaryCtaTo: string;
}

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

export function SolutionLandingPage({
  path,
  seoTitle,
  seoDescription,
  badge,
  title,
  subtitle,
  description,
  highlights,
  pillars,
  modulesTitle,
  modulesDescription,
  modules,
  workflows,
  integrationsTitle,
  integrationsDescription,
  proofPoints,
  integrationBullets,
  previewTitle,
  previewDescription,
  previews,
  faqTitle,
  faqs,
  primaryCtaLabel,
  primaryCtaTo,
  secondaryCtaLabel,
  secondaryCtaTo,
}: SolutionLandingPageProps) {
  const seoSettings = usePublicSeoSettings({
    metaTitle: seoTitle,
    metaDescription: seoDescription,
  });
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(defaultFooterSettings);
  const [isLoadingFooter, setIsLoadingFooter] = useState(true);
  const canonicalUrl = `${PUBLIC_BASE_URL}${path}`;
  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: seoSettings.metaTitle,
    description: seoSettings.metaDescription,
    serviceType: badge,
    provider: {
      "@type": "Organization",
      name: footerSettings.company_name || "AbsensiKu",
      url: PUBLIC_BASE_URL,
    },
    areaServed: "ID",
    url: canonicalUrl,
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
  const webpageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: seoSettings.metaTitle,
    description: seoSettings.metaDescription,
    url: canonicalUrl,
    isPartOf: {
      "@type": "WebSite",
      name: "AbsensiKu",
      url: PUBLIC_BASE_URL,
    },
    primaryImageOfPage: seoSettings.ogImage || PUBLIC_LOGO_URL,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Beranda",
        item: PUBLIC_BASE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: badge,
        item: canonicalUrl,
      },
    ],
  };

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
      } finally {
        if (isMounted) {
          setIsLoadingFooter(false);
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
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={seoSettings.ogTitle} />
        <meta property="og:description" content={seoSettings.ogDescription} />
        <meta property="og:url" content={canonicalUrl} />
        {seoSettings.ogImage ? <meta property="og:image" content={seoSettings.ogImage} /> : null}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoSettings.twitterTitle} />
        <meta name="twitter:description" content={seoSettings.twitterDescription} />
        {seoSettings.ogImage ? <meta name="twitter:image" content={seoSettings.ogImage} /> : null}
        <meta property="og:site_name" content="AbsensiKu" />
        <script type="application/ld+json">{JSON.stringify(serviceJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(webpageJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbJsonLd)}</script>
      </Helmet>

      <NavigationBar />

      <main className="pt-24 pb-16 px-4 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 left-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-1/3 right-0 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-info/10 blur-3xl" />
        </div>

        <div className="container mx-auto max-w-6xl space-y-10">
          <section className="rounded-3xl border bg-card/80 backdrop-blur-sm p-6 md:p-10 shadow-soft">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-sm font-medium text-primary">
                  {badge}
                </div>
                <h1 className="mt-5 text-4xl font-bold leading-tight text-foreground md:text-5xl">
                  {title}
                  <span className="block text-gradient">{subtitle}</span>
                </h1>
                <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{description}</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to={primaryCtaTo}>
                    <Button variant="gold" size="lg" className="gap-2">
                      {primaryCtaLabel}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to={secondaryCtaTo}>
                    <Button variant="outline" size="lg">
                      {secondaryCtaLabel}
                    </Button>
                  </Link>
                </div>
                <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
                  AbsensiKu bisa dipakai langsung tanpa menunggu demo. Konsultasi dipakai saat organisasi butuh bantuan rollout lanjutan, pembahasan HR/Payroll, atau kebutuhan enterprise.
                </p>
                <div className="mt-6 flex flex-wrap gap-5 text-sm text-muted-foreground">
                  <Link to="/">Kembali ke platform utama</Link>
                  <Link to="/hr">Jalur lanjutan HR</Link>
                  <Link to="/payroll">Jalur lanjutan Payroll</Link>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {proofPoints.map((point) => (
                    <div key={point} className="flex items-start gap-2 rounded-xl border bg-background/70 p-4">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <p className="text-sm text-muted-foreground">{point}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                {highlights.map((item) => (
                  <div key={item.label} className="rounded-2xl border bg-background/70 p-5">
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {pillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <article key={pillar.title} className="rounded-2xl border bg-card p-6 shadow-soft">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold text-foreground">{pillar.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{pillar.description}</p>
                </article>
              );
            })}
          </section>

          <section className="rounded-3xl border bg-card p-6 shadow-soft md:p-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Modul Inti</p>
              <h2 className="mt-3 text-3xl font-bold text-foreground">{modulesTitle}</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{modulesDescription}</p>
            </div>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {modules.map((module) => (
                <Card key={module.title} className="border-border/60 bg-background/70">
                  <CardHeader>
                    <CardTitle className="text-lg">{module.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-6 text-muted-foreground">{module.description}</p>
                    <div className="space-y-2">
                      {module.bullets.map((bullet) => (
                        <div key={bullet} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <p className="text-sm text-muted-foreground">{bullet}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <article className="rounded-2xl border bg-card p-6 shadow-soft">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Alur Kerja</p>
              <div className="mt-6 space-y-4">
                {workflows.map((workflow, index) => (
                  <div key={workflow} className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{workflow}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border bg-card p-6 shadow-soft">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Integrasi Dengan Platform Utama</p>
              <h2 className="mt-4 text-2xl font-bold text-foreground">{integrationsTitle}</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{integrationsDescription}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {integrationBullets.map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-xl border bg-background/70 p-4">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="rounded-3xl border bg-card p-6 shadow-soft md:p-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Preview Solusi</p>
              <h2 className="mt-3 text-3xl font-bold text-foreground">{previewTitle}</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{previewDescription}</p>
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {previews.map((preview) => (
                <Card key={preview.title} className="overflow-hidden border-border/60 bg-background/80">
                  {preview.imageSrc ? (
                    <div className="border-b bg-muted/30 p-3">
                      <div className="overflow-hidden rounded-2xl border bg-background shadow-soft">
                        <img
                          src={preview.imageSrc}
                          alt={preview.imageAlt || preview.title}
                          className="h-auto w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  ) : null}
                  <CardHeader className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                          {preview.badge}
                        </Badge>
                        <CardTitle className="mt-3 text-xl">{preview.title}</CardTitle>
                        <p className="mt-2 text-sm text-muted-foreground">{preview.subtitle}</p>
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{preview.progressLabel}</span>
                        <span>{preview.progressValue}%</span>
                      </div>
                      <Progress value={preview.progressValue} className="h-2" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-3 gap-3">
                      {preview.metrics.map((metric) => (
                        <div key={metric.label} className="rounded-xl border bg-card p-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{metric.value}</p>
                        </div>
                      ))}
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      {preview.rows.map((row) => (
                        <div key={row.label} className="flex items-start justify-between gap-4 rounded-xl border bg-card/70 p-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{row.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{row.helper}</p>
                          </div>
                          <Badge variant="secondary" className="shrink-0">
                            {row.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border bg-card p-6 shadow-soft md:p-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">FAQ Solusi</p>
              <h2 className="mt-3 text-3xl font-bold text-foreground">{faqTitle}</h2>
            </div>
            <Accordion type="single" collapsible className="mt-8 space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={faq.question}
                  value={`faq-${index}`}
                  className="rounded-2xl border border-border/60 bg-background/70 px-5"
                >
                  <AccordionTrigger className="text-left hover:no-underline">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-7 text-muted-foreground">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <section className="rounded-3xl border bg-primary px-6 py-10 text-primary-foreground shadow-large md:px-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm uppercase tracking-[0.18em] text-primary-foreground/70">Solusi Terhubung</p>
                <h2 className="mt-3 text-3xl font-bold">Mulai dari absensi, konsultasikan tahap berikutnya saat diperlukan.</h2>
                <p className="mt-3 text-sm leading-6 text-primary-foreground/80">
                  Halaman ini adalah tur solusi lanjutan. Akuisisi publik utama tetap di platform AbsensiKu, lalu organisasi bisa
                  membahas kebutuhan HR atau Payroll saat fondasi operasionalnya sudah cukup siap.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to={primaryCtaTo}>
                  <Button variant="gold" size="lg">
                    {primaryCtaLabel}
                  </Button>
                </Link>
                <Link to="/">
                  <Button variant="hero-outline" size="lg">
                    Lihat Platform Utama
                  </Button>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>

      {isLoadingFooter ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <FooterSection settings={footerSettings} />
      )}

      <FloatingWhatsApp />
    </div>
  );
}
