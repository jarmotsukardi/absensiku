import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ArrowLeft, Calendar, Loader2, Newspaper, Search } from "lucide-react";

import { FloatingWhatsApp } from "@/components/common/FloatingWhatsApp";
import { NavigationBar } from "@/components/homepage/NavigationBar";
import { FooterSection } from "@/components/homepage/FooterSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FooterSettings } from "@/hooks/useHomepageData";
import { PUBLIC_BASE_URL, PUBLIC_LOGO_URL, usePublicSeoSettings } from "@/hooks/usePublicSeoSettings";
import { supabase } from "@/integrations/supabase/client";

interface PublicArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
}

const defaultFooterSettings: FooterSettings = {
  company_name: "AbsensiKu",
  company_description: "Platform absensi, HR, dan payroll untuk organisasi modern.",
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

export default function NewsIndex() {
  const seoSettings = usePublicSeoSettings({
    metaTitle: "Berita AbsensiKu | Update Produk, Panduan, dan Insight",
    metaDescription:
      "Ikuti berita terbaru AbsensiKu, panduan implementasi absensi GPS, update produk, dan insight operasional untuk organisasi modern.",
    metaKeywords: "berita absensi, artikel absensi gps, update absensiku, panduan absensi",
  });
  const [articles, setArticles] = useState<PublicArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(defaultFooterSettings);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const [{ data: articlesData }, { data: footerData }] = await Promise.all([
          supabase
            .from("articles")
            .select("id, slug, title, excerpt, image_url, category, published_at, created_at")
            .eq("is_published", true)
            .order("published_at", { ascending: false }),
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "footer_settings")
            .maybeSingle(),
        ]);

        if (!isMounted) return;

        setArticles(Array.isArray(articlesData) ? articlesData.filter((item) => Boolean(item.slug)) : []);

        if (footerData?.value && typeof footerData.value === "object") {
          const candidate = footerData.value as Partial<FooterSettings>;
          setFooterSettings({
            ...defaultFooterSettings,
            ...candidate,
            quick_links: Array.isArray(candidate.quick_links) ? candidate.quick_links : [],
            legal_links: Array.isArray(candidate.legal_links) ? candidate.legal_links : [],
          });
        }
      } catch (error) {
        console.error("Error fetching news index:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return articles;

    const query = searchQuery.toLowerCase();
    return articles.filter((article) =>
      article.title.toLowerCase().includes(query) ||
      (article.excerpt || "").toLowerCase().includes(query) ||
      (article.category || "").toLowerCase().includes(query),
    );
  }, [articles, searchQuery]);

  const canonicalUrl = `${PUBLIC_BASE_URL}/news`;
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: seoSettings.metaTitle,
    description: seoSettings.metaDescription,
    url: canonicalUrl,
    publisher: {
      "@type": "Organization",
      name: footerSettings.company_name || "AbsensiKu",
      logo: {
        "@type": "ImageObject",
        url: PUBLIC_LOGO_URL,
      },
    },
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
        name: "Berita",
        item: canonicalUrl,
      },
    ],
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
      <Helmet>
        <title>{seoSettings.metaTitle}</title>
        <meta name="description" content={seoSettings.metaDescription} />
        <meta name="keywords" content={seoSettings.metaKeywords} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="AbsensiKu" />
        <meta property="og:title" content={seoSettings.ogTitle} />
        <meta property="og:description" content={seoSettings.ogDescription} />
        <meta property="og:url" content={canonicalUrl} />
        {seoSettings.ogImage ? <meta property="og:image" content={seoSettings.ogImage} /> : null}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoSettings.twitterTitle} />
        <meta name="twitter:description" content={seoSettings.twitterDescription} />
        {seoSettings.ogImage ? <meta name="twitter:image" content={seoSettings.ogImage} /> : null}
        <script type="application/ld+json">{JSON.stringify(collectionJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbJsonLd)}</script>
      </Helmet>

      <NavigationBar />

      <main className="pt-24 pb-16 px-4 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-info/10 blur-3xl" />
        </div>

        <div className="container mx-auto max-w-6xl space-y-8">
          <section className="rounded-3xl border bg-card/80 p-6 shadow-soft backdrop-blur-sm md:p-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Beranda
            </Link>

            <div className="mt-6 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-sm font-medium text-primary">
                <Newspaper className="h-4 w-4" />
                Pusat Berita Publik
              </div>
              <h1 className="mt-5 text-4xl font-bold leading-tight text-foreground md:text-5xl">
                Berita, panduan, dan update terbaru
                <span className="block text-gradient">dari ekosistem AbsensiKu.</span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground">
                Halaman ini menjadi indeks publik untuk artikel dan berita yang terbit, sehingga update produk,
                panduan implementasi, dan insight operasional punya halaman yang stabil untuk dibaca dan diindeks.
              </p>
            </div>
          </section>

          <Card className="border-border/60 bg-card/70">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Cari berita atau artikel publik..."
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {filteredArticles.length === 0 ? (
            <Card className="border-border/60">
              <CardContent className="p-10 text-center text-muted-foreground">
                Tidak ada berita yang cocok dengan pencarian Anda.
              </CardContent>
            </Card>
          ) : (
            <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredArticles.map((article) => {
                const publishedAt = article.published_at || article.created_at;

                return (
                  <Card key={article.id} className="overflow-hidden border-border/60 bg-card/85 shadow-soft">
                    {article.image_url ? (
                      <div className="h-52 overflow-hidden border-b bg-muted/30">
                        <img
                          src={article.image_url}
                          alt={article.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    <CardHeader className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{article.category || "Berita"}</Badge>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(new Date(publishedAt), "dd MMM yyyy", { locale: idLocale })}
                        </span>
                      </div>
                      <CardTitle className="text-xl leading-8">{article.title}</CardTitle>
                      <CardDescription className="line-clamp-3">
                        {article.excerpt || "Buka detail untuk membaca konten lengkap artikel ini."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button asChild variant="outline" className="w-full">
                        <Link to={`/news/${article.slug}`}>Baca Selengkapnya</Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          )}
        </div>
      </main>

      <FooterSection settings={footerSettings} />
      <FloatingWhatsApp />
    </div>
  );
}
