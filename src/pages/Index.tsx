import { Suspense, lazy, useEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useHomepageData } from "@/hooks/useHomepageData";
import { NavigationBar } from "@/components/homepage/NavigationBar";
import { HeroSection } from "@/components/homepage/HeroSection";
import { TargetSegmentSection } from "@/components/homepage/TargetSegmentSection";
import { SolutionsSection } from "@/components/homepage/SolutionsSection";
import { FeaturesSection } from "@/components/homepage/FeaturesSection";
import { PricingSection } from "@/components/homepage/PricingSection";
import { FAQSection } from "@/components/homepage/FAQSection";
import { BannerPromoCarousel } from "@/components/banners/BannerPromoCarousel";
import { DeferredRender } from "@/components/homepage/DeferredRender";
import { sortHomepageSectionDefinitions, stabilizeHomepageSectionDefinitions } from "@/lib/homepageLayout";
import { PUBLIC_BASE_URL, PUBLIC_LOGO_URL, usePublicSeoSettings } from "@/hooks/usePublicSeoSettings";

const TestimonialsSection = lazy(() =>
  import("@/components/homepage/TestimonialsSection").then((module) => ({ default: module.TestimonialsSection })),
);
const NewsSection = lazy(() =>
  import("@/components/homepage/NewsSection").then((module) => ({ default: module.NewsSection })),
);
const CTASection = lazy(() =>
  import("@/components/homepage/CTASection").then((module) => ({ default: module.CTASection })),
);
const FooterSection = lazy(() =>
  import("@/components/homepage/FooterSection").then((module) => ({ default: module.FooterSection })),
);
const FloatingWhatsApp = lazy(() =>
  import("@/components/common/FloatingWhatsApp").then((module) => ({ default: module.FloatingWhatsApp })),
);
const HomepageChatAgent = lazy(() =>
  import("@/components/common/HomepageChatAgent").then((module) => ({ default: module.HomepageChatAgent })),
);
const SmartAppBanner = lazy(() =>
  import("@/components/common/SmartAppBanner").then((module) => ({ default: module.SmartAppBanner })),
);
const AppDownloadSection = lazy(() =>
  import("@/components/homepage/AppDownloadSection").then((module) => ({ default: module.AppDownloadSection })),
);
const PaymentMethodsSection = lazy(() =>
  import("@/components/homepage/PaymentMethodsSection").then((module) => ({ default: module.PaymentMethodsSection })),
);
const ClientLogosSection = lazy(() =>
  import("@/components/homepage/ClientLogosSection").then((module) => ({ default: module.ClientLogosSection })),
);

interface DeferredHomepageBlockProps {
  children: ReactNode;
  rootMargin?: string;
  idleMs?: number | null;
  minHeight?: number | string;
  onRender?: () => void;
}

const DeferredHomepageBlock = ({ children, rootMargin, idleMs, minHeight, onRender }: DeferredHomepageBlockProps) => (
  <DeferredRender rootMargin={rootMargin} idleMs={idleMs} minHeight={minHeight} onRender={onRender}>
    <Suspense fallback={null}>{children}</Suspense>
  </DeferredRender>
);

const Index = () => {
  const location = useLocation();
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
    loadArticles,
    isLoading,
    isSectionEnabled,
  } = useHomepageData();

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
      render: () =>
        isSectionEnabled("banner_promo") && (
          <DeferredHomepageBlock key="banner_promo" rootMargin="800px 0px" minHeight={240}>
            <BannerPromoCarousel />
          </DeferredHomepageBlock>
        ),
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
      render: () =>
        isSectionEnabled("payment_methods") && (
          <DeferredHomepageBlock key="payment_methods" rootMargin="700px 0px" minHeight={120}>
            <PaymentMethodsSection key="payment_methods" />
          </DeferredHomepageBlock>
        ),
    },
    {
      key: "news",
      render: () => {
        if (!isSectionEnabled("news") || !isSectionEnabled("articles")) return null;
        return (
          <DeferredHomepageBlock key="news" rootMargin="400px 0px" minHeight={160} onRender={loadArticles}>
            {articles.length > 0 ? <NewsSection key="news" articles={articles} settings={newsSettings} /> : null}
          </DeferredHomepageBlock>
        );
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
      render: () =>
        isSectionEnabled("testimonials") && (
          <DeferredHomepageBlock key="testimonials" rootMargin="700px 0px" minHeight={160}>
            <TestimonialsSection key="testimonials" testimonials={testimonials} />
          </DeferredHomepageBlock>
        ),
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
      render: () =>
        isSectionEnabled("clients") && (
          <DeferredHomepageBlock key="clients" rootMargin="800px 0px" minHeight={120}>
            <ClientLogosSection key="clients" />
          </DeferredHomepageBlock>
        ),
    },
    {
      key: "app_download",
      render: () =>
        isSectionEnabled("app_download") && (
          <DeferredHomepageBlock key="app_download" rootMargin="700px 0px" minHeight={260}>
            <AppDownloadSection key="app_download" features={features} />
          </DeferredHomepageBlock>
        ),
    },
    {
      key: "cta",
      render: () =>
        isSectionEnabled("cta") &&
        ctaSettings.show_section && (
          <DeferredHomepageBlock key="cta" rootMargin="900px 0px" minHeight={160}>
            <CTASection key="cta" settings={ctaSettings} />
          </DeferredHomepageBlock>
        ),
    },
    {
      key: "footer",
      render: () =>
        isSectionEnabled("footer") && (
          <DeferredHomepageBlock key="footer" rootMargin="900px 0px" minHeight={220}>
            <FooterSection key="footer" settings={footerSettings} />
          </DeferredHomepageBlock>
        ),
    },
  ], [
    heroSettings, statisticsSettings, newsSettings, targetSegmentSettings, pricingSectionSettings, b2bNegotiationThreshold,
    features, pricingPlans, faqs, testimonials, ctaSettings, footerSettings,
    articles, promoSidebarSettings, isSectionEnabled, loadArticles,
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

  return (
    <div className="min-h-screen bg-background" aria-busy={isLoading}>
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
      <DeferredHomepageBlock idleMs={3500}>
        <SmartAppBanner
          appName="AbsensiKu"
          dismissKey="smart_app_banner_homepage_dismissed"
        />
      </DeferredHomepageBlock>

      {/* NavigationBar is always fixed at top */}
      <NavigationBar />

      {/* ALL sections are now dynamically ordered based on sort_order from database */}
      {sortedSections.map((section) => section.render())}

      <DeferredHomepageBlock idleMs={4000}>
        <HomepageChatAgent
          features={features}
          pricingPlans={pricingPlans}
          faqs={faqs}
          articles={articles}
          hideLauncher
        />
      </DeferredHomepageBlock>
      <DeferredHomepageBlock idleMs={4500}>
        <FloatingWhatsApp
          showChatAgentOption
          chatAgentNoticeText="Chat Agent akan menjawab semua pertanyaan Anda dengan cepat."
          chatAgentButtonText="Tanya Chat Agent"
        />
      </DeferredHomepageBlock>
    </div>
  );
};

export default Index;
