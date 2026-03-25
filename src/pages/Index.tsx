import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useHomepageData } from "@/hooks/useHomepageData";
import { NavigationBar } from "@/components/homepage/NavigationBar";
import { HeroSection } from "@/components/homepage/HeroSection";
import { TargetSegmentSection } from "@/components/homepage/TargetSegmentSection";
import { SolutionsSection } from "@/components/homepage/SolutionsSection";
import { FeaturesSection } from "@/components/homepage/FeaturesSection";
import { PricingSection } from "@/components/homepage/PricingSection";
import { FAQSection } from "@/components/homepage/FAQSection";
import { TestimonialsSection } from "@/components/homepage/TestimonialsSection";
import { NewsSection } from "@/components/homepage/NewsSection";
import { CTASection } from "@/components/homepage/CTASection";
import { FooterSection } from "@/components/homepage/FooterSection";
import { BannerPromoCarousel } from "@/components/banners/BannerPromoCarousel";
import { FloatingWhatsApp } from "@/components/common/FloatingWhatsApp";
import { HomepageChatAgent } from "@/components/common/HomepageChatAgent";
import { SmartAppBanner } from "@/components/common/SmartAppBanner";
import { AppDownloadSection } from "@/components/homepage/AppDownloadSection";
import { PaymentMethodsSection } from "@/components/homepage/PaymentMethodsSection";
import { ClientLogosSection } from "@/components/homepage/ClientLogosSection";
import { Loader2 } from "lucide-react";
import { sortHomepageSectionDefinitions, stabilizeHomepageSectionDefinitions } from "@/lib/homepageLayout";
import { HOMEPAGE_PUBLIC_APK_URL, resolveApkUrl } from "@/lib/apkDownload";
import { PUBLIC_BASE_URL, PUBLIC_LOGO_URL, usePublicSeoSettings } from "@/hooks/usePublicSeoSettings";

const Index = () => {
  const location = useLocation();
  const [apkUrl, setApkUrl] = useState<string | null>(HOMEPAGE_PUBLIC_APK_URL);
  const seoSettings = usePublicSeoSettings();
  const {
    sections,
    heroSettings,
    statisticsSettings,
    newsSettings,
    targetSegmentSettings,
    promoSidebarSettings,
    pricingSectionSettings,
    b2bNegotiationThreshold,
    features,
    pricingPlans,
    faqs,
    testimonials,
    ctaSettings,
    footerSettings,
    articles,
    isLoading,
    isSectionEnabled,
  } = useHomepageData();

  useEffect(() => {
    let isMounted = true;

    const fetchHomepagePublicSettings = async () => {
      try {
        const [apkSettingsRes, globalApkRes, appDownloadRes] = await Promise.all([
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "apk_settings")
            .maybeSingle(),
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "global_apk")
            .maybeSingle(),
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "app_download_settings")
            .maybeSingle(),
        ]);

        let resolvedUrl: string | null = HOMEPAGE_PUBLIC_APK_URL;
        resolvedUrl = resolveApkUrl({
          appDownloadValue: appDownloadRes.data?.value as Record<string, unknown> | null | undefined,
          globalApkValue: globalApkRes.data?.value as Record<string, unknown> | null | undefined,
          apkSettingsValue: apkSettingsRes.data?.value as Record<string, unknown> | null | undefined,
          fallbackUrl: HOMEPAGE_PUBLIC_APK_URL,
        });

        if (isMounted) {
          setApkUrl(resolvedUrl);
        }
      } catch {
        if (isMounted) {
          setApkUrl(HOMEPAGE_PUBLIC_APK_URL);
        }
      }
    };

    void fetchHomepagePublicSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const hash = location.hash.replace("#", "").trim();
    if (!hash) return;

    let attempts = 0;
    const maxAttempts = 12;

    const scrollToHashTarget = () => {
      const target = document.getElementById(hash);

      if (target) {
        const offsetTop = target.getBoundingClientRect().top + window.scrollY - 96;
        window.scrollTo({
          top: Math.max(0, offsetTop),
          behavior: "smooth",
        });
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(scrollToHashTarget, 120);
      }
    };

    const timer = window.setTimeout(scrollToHashTarget, 80);
    return () => window.clearTimeout(timer);
  }, [isLoading, location.hash]);

  // Define all sections with their render functions and keys
  // ALL sections are now dynamically ordered based on database sort_order
  const sectionDefinitions = useMemo(() => [
    {
      key: "banner_promo",
      render: () => isSectionEnabled("banner_promo") && <BannerPromoCarousel key="banner_promo" />,
    },
    {
      key: "hero",
      render: () => isSectionEnabled("hero") && (
        <HeroSection
          key="hero"
          heroSettings={heroSettings}
          statisticsSettings={statisticsSettings}
          showStats={isSectionEnabled("statistics")}
        />
      ),
    },
    {
      key: "solutions",
      render: () => <SolutionsSection key="solutions" />,
    },
    {
      key: "target_segment",
      render: () => isSectionEnabled("target_segment") && (
        <TargetSegmentSection key="target_segment" settings={targetSegmentSettings} />
      ),
    },
    {
      key: "statistics",
      // Statistics is rendered inside HeroSection, so we skip standalone rendering
      render: () => null,
    },
    {
      key: "features",
      render: () => isSectionEnabled("features") && <FeaturesSection key="features" features={features} />,
    },
    {
      key: "payment_methods",
      render: () => isSectionEnabled("payment_methods") && <PaymentMethodsSection key="payment_methods" />,
    },
    {
      key: "news",
      render: () => {
        // News/Articles section - requires BOTH news AND articles sections to be enabled
        if (!isSectionEnabled("news") || !isSectionEnabled("articles") || articles.length === 0) return null;
        return <NewsSection key="news" articles={articles} settings={newsSettings} />;
      },
    },
    {
      key: "articles",
      // Articles visibility is handled in the news section render
      render: () => null,
    },
    {
      key: "pricing",
      render: () => isSectionEnabled("pricing") && (
        <PricingSection 
          key="pricing" 
          plans={pricingPlans} 
          title={pricingSectionSettings.section_title} 
          subtitle={pricingSectionSettings.section_subtitle}
          negotiationThreshold={b2bNegotiationThreshold}
        />
      ),
    },
    {
      key: "testimonials",
      render: () => isSectionEnabled("testimonials") && <TestimonialsSection key="testimonials" testimonials={testimonials} />,
    },
    {
      key: "faq",
      render: () => {
        if (!isSectionEnabled("faq")) return null;
        // Combine FAQ with Promo Sidebar if promo is enabled
        const showPromoInFaq = isSectionEnabled("promo_sidebar") && promoSidebarSettings.enabled && promoSidebarSettings.show_banner_sidebar;
        return (
          <FAQSection 
            key="faq" 
            faqs={faqs} 
            showPromoSidebar={showPromoInFaq}
            promoTitle={promoSidebarSettings.title}
            promoSubtitle={promoSidebarSettings.subtitle}
          />
        );
      },
    },
    {
      key: "promo_sidebar",
      // Promo sidebar is now integrated into FAQ section, so we skip standalone rendering
      render: () => null,
    },
    {
      key: "clients",
      render: () => isSectionEnabled("clients") && <ClientLogosSection key="clients" />,
    },
    {
      key: "app_download",
      render: () => isSectionEnabled("app_download") && <AppDownloadSection key="app_download" features={features} />,
    },
    {
      key: "cta",
      render: () => isSectionEnabled("cta") && ctaSettings.show_section && <CTASection key="cta" settings={ctaSettings} />,
    },
    {
      key: "footer",
      render: () => isSectionEnabled("footer") && <FooterSection key="footer" settings={footerSettings} />,
    },
  ], [
    heroSettings, statisticsSettings, newsSettings, targetSegmentSettings, pricingSectionSettings, b2bNegotiationThreshold,
    features, pricingPlans, faqs, testimonials, ctaSettings, footerSettings,
    articles, promoSidebarSettings, isSectionEnabled
  ]);

  // Sort sections by their sort_order from database
  const sortedSections = useMemo(() => {
    return stabilizeHomepageSectionDefinitions(sortHomepageSectionDefinitions(sectionDefinitions, sections));
  }, [sectionDefinitions, sections]);

  const canonicalUrl = `${PUBLIC_BASE_URL}/`;
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: footerSettings.company_name || "AbsensiKu",
    url: canonicalUrl,
    logo: PUBLIC_LOGO_URL,
    description: seoSettings.metaDescription,
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AbsensiKu",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android",
    url: canonicalUrl,
    description: seoSettings.metaDescription,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "IDR",
    },
  };
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: footerSettings.company_name || "AbsensiKu",
    url: canonicalUrl,
    description: seoSettings.metaDescription,
    publisher: {
      "@type": "Organization",
      name: footerSettings.company_name || "AbsensiKu",
      logo: {
        "@type": "ImageObject",
        url: PUBLIC_LOGO_URL,
      },
    },
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
        <meta property="og:title" content={seoSettings.ogTitle} />
        <meta property="og:description" content={seoSettings.ogDescription} />
        <meta property="og:url" content={canonicalUrl} />
        {seoSettings.ogImage ? <meta property="og:image" content={seoSettings.ogImage} /> : null}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoSettings.twitterTitle} />
        <meta name="twitter:description" content={seoSettings.twitterDescription} />
        {seoSettings.ogImage ? <meta name="twitter:image" content={seoSettings.ogImage} /> : null}
        <script type="application/ld+json">{JSON.stringify(organizationJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(websiteJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(softwareJsonLd)}</script>
      </Helmet>
      <SmartAppBanner
        apkUrl={apkUrl}
        appName="AbsensiKu"
        dismissKey="smart_app_banner_homepage_dismissed"
      />

      {/* NavigationBar is always fixed at top */}
      <NavigationBar />

      {/* ALL sections are now dynamically ordered based on sort_order from database */}
      {sortedSections.map((section) => section.render())}

      <HomepageChatAgent
        features={features}
        pricingPlans={pricingPlans}
        faqs={faqs}
        articles={articles}
        hideLauncher
      />
      <FloatingWhatsApp
        showChatAgentOption
        chatAgentNoticeText="Chat Agent akan menjawab semua pertanyaan Anda dengan cepat."
        chatAgentButtonText="Tanya Chat Agent"
      />
    </div>
  );
};

export default Index;
