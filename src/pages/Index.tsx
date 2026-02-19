import { useMemo } from "react";
import { useHomepageData } from "@/hooks/useHomepageData";
import { NavigationBar } from "@/components/homepage/NavigationBar";
import { HeroSection } from "@/components/homepage/HeroSection";
import { TargetSegmentSection } from "@/components/homepage/TargetSegmentSection";
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
import { AppDownloadSection } from "@/components/homepage/AppDownloadSection";
import { PaymentMethodsSection } from "@/components/homepage/PaymentMethodsSection";
import { ClientLogosSection } from "@/components/homepage/ClientLogosSection";
import { Loader2 } from "lucide-react";
import { sortHomepageSectionDefinitions } from "@/lib/homepageLayout";

const Index = () => {
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
      render: () => isSectionEnabled("app_download") && <AppDownloadSection key="app_download" />,
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
    return sortHomepageSectionDefinitions(sectionDefinitions, sections);
  }, [sectionDefinitions, sections]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
