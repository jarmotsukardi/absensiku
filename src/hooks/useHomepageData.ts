import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveFaqAudience } from "@/lib/faqAudience";
import type { FaqAudience } from "@/lib/faqAudience";
import { getHomepageSectionOrder, isHomepageSectionEnabled } from "@/lib/homepageLayout";
import { mapSubscriptionPackagesToPricingPlans } from "@/lib/pricingPlans";

interface HomepageSection {
  id: string;
  section_key: string;
  section_name: string;
  is_enabled: boolean;
  sort_order: number;
  settings: Record<string, unknown>;
}

interface HeroSettings {
  title: string;
  subtitle: string;
  description: string;
  cta_text: string;
  cta_link: string;
  secondary_cta_text: string;
  secondary_cta_link: string;
  show_statistics: boolean;
}

interface StatisticsSettings {
  title: string;
  subtitle: string;
  show_active_institutions: boolean;
  show_employees: boolean;
  show_provinces: boolean;
  show_uptime: boolean;
  institutions_count: number;
  employees_count: number;
  provinces_count: number;
  uptime_percent: number;
}

interface NewsSettings {
  title: string;
  subtitle: string;
  max_display: number;
  show_category: boolean;
  show_date: boolean;
  show_excerpt: boolean;
}

interface TargetSegmentItem {
  title: string;
  description: string;
  features: string[];
  icon: string;
  color: string;
}

interface TargetSegmentSettings {
  section_title: string;
  section_subtitle: string;
  badge_text: string;
  segments: TargetSegmentItem[];
}

interface PromoSidebarSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  show_banner_sidebar: boolean;
}

interface Feature {
  id: string;
  icon: string;
  title: string;
  description: string;
}

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  period: string;
  features: string[];
  is_popular: boolean;
  original_price?: number | null;
  discount_percentage?: number | null;
  duration_months?: number | null;
  total_price?: number | null;
  total_price_before_discount?: number | null;
  popular_label?: string | null;
}

interface PricingSectionSettings {
  section_title: string;
  section_subtitle: string;
}

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  audience?: FaqAudience;
}

interface Testimonial {
  id: string;
  name: string;
  role: string;
  company: string;
  content: string;
  rating: number;
  avatar_url: string;
}

interface CTASettings {
  title: string;
  description: string;
  primary_button_text: string;
  primary_button_link: string;
  secondary_button_text: string;
  secondary_button_link: string;
  show_section: boolean;
}

interface FooterSettings {
  company_name: string;
  company_description: string;
  copyright_text: string;
  address: string;
  email: string;
  phone: string;
  whatsapp: string;
  quick_links: { id: string; label: string; url: string }[];
  legal_links: { id: string; label: string; url: string; content?: string }[];
  social_facebook: string;
  social_instagram: string;
  social_twitter: string;
  social_youtube: string;
  social_linkedin?: string;
  social_tiktok?: string;
  social_telegram?: string;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  image_url: string | null;
  category: string | null;
  published_at: string | null;
}

const parseNumericSettingValue = (raw: unknown, fallback: number): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const objectValue = raw as Record<string, unknown>;
    if ("value" in objectValue) {
      return parseNumericSettingValue(objectValue.value, fallback);
    }
    if ("amount" in objectValue) {
      return parseNumericSettingValue(objectValue.amount, fallback);
    }
  }
  return fallback;
};

// Default values
const defaultHeroSettings: HeroSettings = {
  title: "Sistem Absensi Digital",
  subtitle: "Berbasis GPS",
  description: "Solusi ABSENSI Modern dengan fitur lengkap untuk Pemerintah Daerah, Institusi, Perusahaan dan Sekolah.",
  cta_text: "Mulai Gratis",
  cta_link: "/org/login?mode=register",
  secondary_cta_text: "Masuk Pegawai",
  secondary_cta_link: "/auth",
  show_statistics: true,
};

const defaultStatisticsSettings: StatisticsSettings = {
  title: "Platform Terpercaya",
  subtitle: "Dipercaya oleh berbagai instansi di seluruh Indonesia",
  show_active_institutions: true,
  show_employees: true,
  show_provinces: true,
  show_uptime: true,
  institutions_count: 500,
  employees_count: 50000,
  provinces_count: 34,
  uptime_percent: 99.9,
};

const defaultNewsSettings: NewsSettings = {
  title: "Berita Terbaru",
  subtitle: "Update terbaru seputar AbsensiKu",
  max_display: 6,
  show_category: true,
  show_date: true,
  show_excerpt: true,
};

const defaultTargetSegmentSettings: TargetSegmentSettings = {
  section_title: "Dirancang untuk Berbagai Organisasi",
  section_subtitle: "AbsensiKu melayani kebutuhan absensi dari berbagai jenis organisasi dengan fitur yang dapat dikustomisasi.",
  badge_text: "Solusi untuk Semua",
  segments: [
    {
      title: "Pemerintah Daerah",
      description: "Solusi absensi untuk Pemda, OPD, dan unit kerja pemerintah daerah dengan standar audit BPK.",
      features: ["Multi OPD & Lokasi Kerja", "Audit trail Inspektorat", "Laporan rekapitulasi"],
      icon: "Landmark",
      color: "primary",
    },
    {
      title: "Instansi Pemerintah",
      description: "Untuk Kementerian, Lembaga, BUMN, BUMD, Institusi dan instansi pemerintah vertikal lainnya.",
      features: ["Struktur hierarki ASN", "Integrasi NIP", "Sinkronisasi SIMPEG"],
      icon: "Building",
      color: "info",
    },
    {
      title: "Perusahaan",
      description: "Solusi fleksibel untuk perusahaan swasta dari startup hingga korporasi besar.",
      features: ["Multi cabang & divisi", "Shift kerja fleksibel", "API Integrasi HR & payroll"],
      icon: "Briefcase",
      color: "accent",
    },
    {
      title: "Sekolah",
      description: "Sistem absensi guru, staf, dan tenaga kependidikan untuk semua jenjang pendidikan.",
      features: ["Guru & tenaga pendidik", "Kalender akademik", "Laporan"],
      icon: "GraduationCap",
      color: "success",
    },
  ],
};

const defaultPromoSidebarSettings: PromoSidebarSettings = {
  enabled: true,
  title: "Promosi & Info Terbaru",
  subtitle: "Dapatkan penawaran menarik dan informasi terkini dari AbsensiKu",
  show_banner_sidebar: true,
};

const defaultCTASettings: CTASettings = {
  title: "Siap Memulai?",
  description: "Coba gratis tanpa kartu kredit. Upgrade kapan saja sesuai kebutuhan.",
  primary_button_text: "Daftar Gratis Sekarang",
  primary_button_link: "/auth?mode=register",
  secondary_button_text: "Hubungi Sales",
  secondary_button_link: "/auth",
  show_section: true,
};

const defaultFooterSettings: FooterSettings = {
  company_name: "AbsensiKu",
  company_description: "Sistem absensi GPS modern untuk pemerintah dan perusahaan.",
  copyright_text: "© 2024 AbsensiKu. Hak cipta dilindungi.",
  address: "",
  email: "",
  phone: "",
  whatsapp: "",
  quick_links: [
    { id: "1", label: "Fitur", url: "/#fitur" },
    { id: "2", label: "Harga", url: "/#harga" },
    { id: "3", label: "FAQ", url: "/#faq" },
    { id: "4", label: "Tentang", url: "/about" },
  ],
  legal_links: [
    { id: "1", label: "Kebijakan Privasi", url: "/privacy-policy" },
    { id: "2", label: "Syarat & Ketentuan", url: "#", content: "<p>Syarat dan ketentuan layanan AbsensiKu.</p>" },
  ],
  social_facebook: "",
  social_instagram: "",
  social_twitter: "",
  social_youtube: "",
  social_linkedin: "",
  social_tiktok: "",
  social_telegram: "",
};

export function useHomepageData() {
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [heroSettings, setHeroSettings] = useState<HeroSettings>(defaultHeroSettings);
  const [statisticsSettings, setStatisticsSettings] = useState<StatisticsSettings>(defaultStatisticsSettings);
  const [newsSettings, setNewsSettings] = useState<NewsSettings>(defaultNewsSettings);
  const [targetSegmentSettings, setTargetSegmentSettings] = useState<TargetSegmentSettings>(defaultTargetSegmentSettings);
  const [promoSidebarSettings, setPromoSidebarSettings] = useState<PromoSidebarSettings>(defaultPromoSidebarSettings);
  const [pricingSectionSettings, setPricingSectionSettings] = useState<PricingSectionSettings>({ section_title: "Harga Transparan", section_subtitle: "Pilih paket yang sesuai dengan kebutuhan instansi Anda." });
  const [b2bNegotiationThreshold, setB2bNegotiationThreshold] = useState(2000);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [ctaSettings, setCTASettings] = useState<CTASettings>(defaultCTASettings);
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(defaultFooterSettings);
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      let resolvedNewsSettings: NewsSettings = defaultNewsSettings;
      let legacyPricingPlans: PricingPlan[] = [];

      // Fetch homepage sections
      const { data: sectionsData } = await supabase
        .from("homepage_sections")
        .select("*")
        .order("sort_order");
      
      if (sectionsData) {
        setSections(sectionsData.map(s => ({
          ...s,
          settings: (s.settings || {}) as Record<string, unknown>
        })));

        // Extract settings from sections
        const statsSection = sectionsData.find(s => s.section_key === "statistics");
        if (statsSection?.settings && typeof statsSection.settings === 'object') {
          setStatisticsSettings({ ...defaultStatisticsSettings, ...statsSection.settings as Partial<StatisticsSettings> });
        }

        const newsSection = sectionsData.find(s => s.section_key === "news");
        if (newsSection?.settings && typeof newsSection.settings === 'object') {
          const mergedNewsSettings = {
            ...defaultNewsSettings,
            ...newsSection.settings as Partial<NewsSettings>,
          };
          resolvedNewsSettings = {
            ...mergedNewsSettings,
            max_display: Number(mergedNewsSettings.max_display) > 0
              ? Number(mergedNewsSettings.max_display)
              : defaultNewsSettings.max_display,
          };
          setNewsSettings(resolvedNewsSettings);
        }

        // Extract pricing section settings
        const pricingSection = sectionsData.find(s => s.section_key === "pricing");
        if (pricingSection?.settings && typeof pricingSection.settings === 'object') {
          const ps = pricingSection.settings as Record<string, unknown>;
          setPricingSectionSettings({
            section_title: (ps.section_title as string) || "Harga Transparan",
            section_subtitle: (ps.section_subtitle as string) || "Pilih paket yang sesuai dengan kebutuhan instansi Anda.",
          });
        }
      }

      // Fetch system settings
      const { data: settingsData } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "hero_settings",
          "features_settings",
          "pricing_settings",
          "faq_settings",
          "testimonials_settings",
          "cta_settings",
          "footer_settings",
          "legal_links_settings",
          "target_segment_settings",
          "promo_sidebar_settings",
          "b2b_negotiation_threshold",
        ]);

      if (settingsData) {
        let footerBase = { ...defaultFooterSettings };
        let legalLinksFromSettings: { id: string; label: string; url: string; content?: string }[] | null = null;

        for (const setting of settingsData) {
          switch (setting.key) {
            case "hero_settings":
              if (setting.value) setHeroSettings({ ...defaultHeroSettings, ...setting.value as unknown as Partial<HeroSettings> });
              break;
            case "features_settings":
              if (Array.isArray(setting.value)) setFeatures(setting.value as unknown as Feature[]);
              break;
            case "pricing_settings":
              if (Array.isArray(setting.value)) {
                legacyPricingPlans = setting.value as unknown as PricingPlan[];
              }
              break;
            case "faq_settings":
              if (Array.isArray(setting.value)) {
                setFaqs(
                  (setting.value as unknown as FAQ[])
                    .filter(isPublicAudienceFaq)
                    .sort((a, b) => a.sort_order - b.sort_order),
                );
              } else if (setting.value && typeof setting.value === "object" && !Array.isArray(setting.value)) {
                const faqValue = setting.value as { items?: unknown };
                if (Array.isArray(faqValue.items)) {
                  setFaqs(
                    (faqValue.items as FAQ[])
                      .filter(isPublicAudienceFaq)
                      .sort((a, b) => a.sort_order - b.sort_order),
                  );
                }
              }
              break;
            case "testimonials_settings":
              if (Array.isArray(setting.value)) setTestimonials(setting.value as unknown as Testimonial[]);
              break;
            case "cta_settings":
              if (setting.value) setCTASettings({ ...defaultCTASettings, ...setting.value as Partial<CTASettings> });
              break;
            case "footer_settings":
              if (setting.value) footerBase = { ...footerBase, ...setting.value as Partial<FooterSettings> };
              break;
            case "legal_links_settings":
              // Store legal_links from dedicated settings table
              if (Array.isArray(setting.value)) {
                legalLinksFromSettings = setting.value as { id: string; label: string; url: string; content?: string }[];
              }
              break;
            case "target_segment_settings":
              if (setting.value && typeof setting.value === "object") {
                const value = setting.value as Partial<TargetSegmentSettings>;
                const normalizedSegments = Array.isArray(value.segments)
                  ? value.segments
                      .filter((segment): segment is TargetSegmentItem => !!segment && typeof segment === "object")
                      .map((segment) => ({
                        title: typeof segment.title === "string" ? segment.title : "",
                        description: typeof segment.description === "string" ? segment.description : "",
                        features: Array.isArray(segment.features)
                          ? segment.features.filter((feature): feature is string => typeof feature === "string")
                          : [],
                        icon: typeof segment.icon === "string" ? segment.icon : "Landmark",
                        color: typeof segment.color === "string" ? segment.color : "primary",
                      }))
                  : [];

                setTargetSegmentSettings({
                  ...defaultTargetSegmentSettings,
                  ...value,
                  segments: normalizedSegments.length > 0 ? normalizedSegments : defaultTargetSegmentSettings.segments,
                });
              }
              break;
            case "promo_sidebar_settings":
              if (setting.value && typeof setting.value === "object") {
                setPromoSidebarSettings({
                  ...defaultPromoSidebarSettings,
                  ...(setting.value as Partial<PromoSidebarSettings>),
                });
              }
              break;
            case "b2b_negotiation_threshold":
              setB2bNegotiationThreshold(Math.max(1, Math.floor(parseNumericSettingValue(setting.value, 2000))));
              break;
          }
        }

        // IMPORTANT: legal_links_settings is the source of truth, apply LAST to override footer_settings
        if (legalLinksFromSettings) {
          footerBase.legal_links = legalLinksFromSettings;
        }

        setFooterSettings(footerBase);
      }

      const { data: billingPackages, error: billingPackagesError } = await supabase
        .from("subscription_packages")
        .select("id, name, description, base_price_per_month, duration_months, discount_percentage, features, sort_order")
        .eq("is_active", true)
        .order("sort_order");

      if (billingPackagesError) {
        console.error("Error fetching billing packages for homepage pricing:", billingPackagesError);
      }

      if (billingPackages && billingPackages.length > 0) {
        setPricingPlans(mapSubscriptionPackagesToPricingPlans(billingPackages, legacyPricingPlans));
      } else if (legacyPricingPlans.length > 0) {
        setPricingPlans(legacyPricingPlans);
      } else {
        setPricingPlans([]);
      }

      // Fetch articles/news
      const { data: articlesData } = await supabase
        .from("articles")
        .select("id, title, slug, excerpt, image_url, category, published_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(resolvedNewsSettings.max_display || 6);

      if (articlesData) {
        setArticles(articlesData);
      }
    } catch (error) {
      console.error("Error fetching homepage data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const isSectionEnabled = (key: string): boolean => {
    return isHomepageSectionEnabled(sections, key);
  };

  const getSectionOrder = (key: string): number => {
    return getHomepageSectionOrder(sections, key);
  };

  return {
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
    getSectionOrder,
  };
}

export type {
  HomepageSection,
  HeroSettings,
  StatisticsSettings,
  NewsSettings,
  TargetSegmentSettings,
  TargetSegmentItem,
  PromoSidebarSettings,
  PricingSectionSettings,
  Feature,
  PricingPlan,
  FAQ,
  Testimonial,
  CTASettings,
  FooterSettings,
  Article,
};
const isPublicAudienceFaq = (faq: FAQ): boolean => {
  return (
    resolveFaqAudience({
      audience: faq.audience,
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
    }) === "public"
  );
};
