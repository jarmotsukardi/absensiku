import { useCallback, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { 
  GripVertical, Save, Layout, Image, FileText, Users, CreditCard, HelpCircle, Phone, Loader2, Megaphone, PanelRight, BarChart3, Newspaper, FileCheck, Share2, Info, Link2, Download, HeartHandshake, MessageSquare, ChevronDown, ArrowDown, ArrowUp,
} from "lucide-react";
import { BannerPromoSettings } from "@/components/admin/settings/BannerPromoSettings";
import { BannerSidebarSettings } from "@/components/admin/settings/BannerSidebarSettings";
import { ClientLogoSettings } from "@/components/admin/settings/ClientLogoSettings";
import { HeroSettings } from "@/components/admin/settings/HeroSettings";
import { FeaturesSettings } from "@/components/admin/settings/FeaturesSettings";
import { PricingSettings } from "@/components/admin/settings/PricingSettings";
import { TestimonialsSettings } from "@/components/admin/settings/TestimonialsSettings";
import { PaymentMethodsSettings } from "@/components/admin/settings/PaymentMethodsSettings";
import { CTASettings } from "@/components/admin/settings/CTASettings";
import { FooterSettings } from "@/components/admin/settings/FooterSettings";
import { ArticlesSettings } from "@/components/admin/settings/ArticlesSettings";
import { StatisticsSettings } from "@/components/admin/settings/StatisticsSettings";
import { NewsSettings } from "@/components/admin/settings/NewsSettings";
import { LegalLinksSettings } from "@/components/admin/settings/LegalLinksSettings";
import { SocialMediaSettings } from "@/components/admin/settings/SocialMediaSettings";
import { AboutPageSettings } from "@/components/admin/settings/AboutPageSettings";
import { QuickLinksSettings } from "@/components/admin/settings/QuickLinksSettings";
import { AppDownloadSettings } from "@/components/admin/settings/AppDownloadSettings";
import { PromoSidebarSettings } from "@/components/admin/settings/PromoSidebarSettings";
import { TargetSegmentSettings } from "@/components/admin/settings/TargetSegmentSettings";
import { HomepageChatAgentSettings } from "@/components/admin/settings/HomepageChatAgentSettings";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { getHomepagePinnedPlacement, stabilizeHomepageSectionRecords } from "@/lib/homepageLayout";

interface HomepageSection {
  id: string;
  section_key: string;
  section_name: string;
  is_enabled: boolean;
  sort_order: number;
  settings: Json;
}

const sectionIcons: Record<string, ComponentType<{ className?: string }>> = {
  banner_promo: Megaphone, hero: Image, features: Layout, clients: Users, payment_methods: CreditCard,
  articles: FileText, testimonials: Users, faq: HelpCircle, cta: Phone,
  footer: Layout, pricing: CreditCard, statistics: BarChart3, partners: Users,
  news: Newspaper, promo_sidebar: Megaphone, app_download: Download, target_segment: HeartHandshake,
};

const HOMEPAGE_TAB_GROUPS: Array<{
  title: string;
  description: string;
  items: Array<{
    value: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }>;
}> = [
  {
    title: "Struktur Utama",
    description: "Kontrol susunan, hero, dan konten inti halaman utama.",
    items: [
      { value: "layout", label: "Tata Letak", icon: Layout },
      { value: "hero", label: "Hero", icon: Image },
      { value: "target_segment", label: "Solusi", icon: HeartHandshake },
      { value: "statistics", label: "Statistik", icon: BarChart3 },
      { value: "features", label: "Fitur", icon: Layout },
      { value: "news", label: "Berita", icon: Newspaper },
      { value: "articles", label: "Artikel", icon: FileText },
      { value: "about", label: "Tentang", icon: Info },
    ],
  },
  {
    title: "Konversi & Engagement",
    description: "Atur elemen yang mendorong konversi dan interaksi pengunjung.",
    items: [
      { value: "pricing", label: "Harga", icon: CreditCard },
      { value: "testimonials", label: "Testimoni", icon: Users },
      { value: "faq", label: "FAQ", icon: HelpCircle },
      { value: "payment", label: "Pembayaran", icon: CreditCard },
      { value: "cta", label: "CTA", icon: Phone },
      { value: "chat_agent", label: "Chat Agent", icon: MessageSquare },
      { value: "promo", label: "Promosi", icon: Megaphone },
      { value: "download", label: "Unduhan", icon: Download },
    ],
  },
  {
    title: "Navigasi & Branding",
    description: "Kelola footer, link penting, branding, dan area promosi.",
    items: [
      { value: "footer", label: "Footer", icon: Layout },
      { value: "quicklinks", label: "Tautan Cepat", icon: Link2 },
      { value: "legal", label: "Legal", icon: FileCheck },
      { value: "social", label: "Sosmed", icon: Share2 },
      { value: "banners", label: "Banner", icon: Megaphone },
      { value: "sidebar", label: "Sidebar", icon: PanelRight },
      { value: "clients", label: "Klien", icon: Users },
    ],
  },
];
const HOMEPAGE_TAB_ITEMS = HOMEPAGE_TAB_GROUPS.flatMap((group) => group.items);
const HOMEPAGE_LAYOUT_QUERY_TIMEOUT_MS = 12000;
const HOMEPAGE_LAYOUT_QUERY_RETRY_MAX = 2;

export default function HomepageLayoutSettings() {
  const navigate = useNavigate();
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("layout");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [pendingSectionIds, setPendingSectionIds] = useState<string[]>([]);
  const [isAccessReady, setIsAccessReady] = useState(false);
  const [isAccessGranted, setIsAccessGranted] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    "Konversi & Engagement": true,
    "Navigasi & Branding": true,
  });

  useEffect(() => {
    let isMounted = true;

    const verifyAccess = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted || !session?.user) {
          if (isMounted) {
            setIsAccessGranted(false);
            setIsAccessReady(true);
          }
          return;
        }

        const { data: isSuperAdminByRpc } = await supabase.rpc("is_super_admin", {
          _user_id: session.user.id,
        });

        if (!isMounted) return;

        if (isSuperAdminByRpc === true) {
          setIsAccessGranted(true);
          setIsAccessReady(true);
          return;
        }

        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "super_admin")
          .limit(1);

        if (!isMounted) return;

        setIsAccessGranted(Boolean(roles?.length));
      } catch {
        if (isMounted) {
          setIsAccessGranted(false);
        }
      } finally {
        if (isMounted) {
          setIsAccessReady(true);
        }
      }
    };

    void verifyAccess();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchSections = useCallback(async () => {
    try {
      setLoadError(null);
      setIsRetrying(false);
      setIsLoading(true);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.from("homepage_sections").select("*").order("sort_order"),
            HOMEPAGE_LAYOUT_QUERY_TIMEOUT_MS,
            "admin.homepage_layout.fetch_sections timeout"
          ),
        {
          maxRetries: HOMEPAGE_LAYOUT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;
      setSections(stabilizeHomepageSectionRecords(data || []));
    } catch (error) {
      const errorRef = reportError(error, "admin.homepage_layout.fetch_sections");
      const message = appendErrorReference("Gagal memuat data layout homepage", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAccessGranted) return;
    void fetchSections();
  }, [fetchSections, isAccessGranted]);

  const handleToggle = async (id: string, isEnabled: boolean) => {
    if (pendingSectionIds.includes(id)) return;
    try {
      setIsRetrying(false);
      setPendingSectionIds((prev) => [...prev, id]);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("homepage_sections")
              .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
              .eq("id", id),
            HOMEPAGE_LAYOUT_QUERY_TIMEOUT_MS,
            "admin.homepage_layout.toggle_section timeout"
          ),
        {
          maxRetries: HOMEPAGE_LAYOUT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;
      setSections(prev => prev.map(s => s.id === id ? { ...s, is_enabled: isEnabled } : s));
      toast.success("Status berhasil diubah");
    } catch (error) {
      const errorRef = reportError(error, "admin.homepage_layout.toggle_section", {
        section_id: id,
        is_enabled: isEnabled,
      });
      toast.error(`Gagal mengubah status (Ref: ${errorRef})`);
      void fetchSections();
    } finally {
      setPendingSectionIds((prev) => prev.filter((currentId) => currentId !== id));
    }
  };

  const moveSection = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= sections.length || fromIndex === toIndex) return;
    if (getHomepagePinnedPlacement(sections[fromIndex]?.section_key || "")) return;
    if (getHomepagePinnedPlacement(sections[toIndex]?.section_key || "")) return;
    setSections((prev) => {
      const next = [...prev];
      const [movedSection] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedSection);
      return stabilizeHomepageSectionRecords(next);
    });
  };

  const handleDragStart = (index: number) => {
    if (getHomepagePinnedPlacement(sections[index]?.section_key || "")) return;
    setDraggedItem(index);
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;
    if (getHomepagePinnedPlacement(sections[index]?.section_key || "")) return;
    const newSections = [...sections];
    const draggedSection = newSections[draggedItem];
    newSections.splice(draggedItem, 1);
    newSections.splice(index, 0, draggedSection);
    setSections(stabilizeHomepageSectionRecords(newSections));
    setDraggedItem(index);
  };
  const handleDragEnd = () => setDraggedItem(null);

  const handleSaveOrder = async () => {
    setIsSaving(true);
    try {
      setIsRetrying(false);
      const updatedAt = new Date().toISOString();
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("homepage_sections")
              .upsert(
                sections.map((section) => ({
                  id: section.id,
                  section_key: section.section_key,
                  section_name: section.section_name,
                  is_enabled: section.is_enabled,
                  settings: section.settings,
                  sort_order: section.sort_order,
                  updated_at: updatedAt,
                })),
                { onConflict: "id" }
              ),
            HOMEPAGE_LAYOUT_QUERY_TIMEOUT_MS,
            "admin.homepage_layout.save_order timeout"
          ),
        {
          maxRetries: HOMEPAGE_LAYOUT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;
      void fetchSections();
      toast.success("Urutan berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.homepage_layout.save_order", {
        section_count: sections.length,
      });
      toast.error(`Gagal menyimpan urutan (Ref: ${errorRef})`);
      void fetchSections();
    } finally {
      setIsSaving(false);
    }
  };
  const activeTabMeta = HOMEPAGE_TAB_ITEMS.find((item) => item.value === activeTab);
  const toggleGroup = (title: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  if (!isAccessReady || !isAccessGranted || isLoading) {
    return (<SuperAdminLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div></SuperAdminLayout>);
  }

  return (
    <SuperAdminLayout>
      <Helmet>
        <title>Admin - Tata Letak Homepage | AbsensiKu</title>
      </Helmet>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sedang mencoba ulang memuat pengaturan layout...
          </div>
        )}
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span>{loadError}</span>
            <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => void fetchSections()}>
              Coba Lagi
            </Button>
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Layout className="h-6 w-6" />Pengaturan Tata Letak Halaman Depan</h1>
          <p className="text-muted-foreground">Atur bagian, banner, dan konten halaman utama</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <Card className="border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-base">Navigasi Pengaturan</CardTitle>
                  <CardDescription>
                    Mode compact aktif: lebih padat, tetap rapi, tanpa scroll horizontal panjang.
                  </CardDescription>
                </div>
                {activeTabMeta && (
                  <Badge variant="secondary" className="h-7 w-fit border border-primary/20 bg-primary/10 px-2.5 text-primary">
                    Tab Aktif: {activeTabMeta.label}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 pb-4">
              {HOMEPAGE_TAB_GROUPS.map((group) => (
                <Collapsible key={group.title} open={!collapsedGroups[group.title]}>
                  <div className="rounded-xl border border-slate-200/70 bg-white/80 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.title}</p>
                        <p className="hidden text-[11px] text-muted-foreground lg:block">{group.description}</p>
                      </div>
                      {group.title !== "Struktur Utama" && (
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleGroup(group.title)}
                            className="h-7 gap-1 px-2 text-[11px]"
                          >
                            {collapsedGroups[group.title] ? "Buka" : "Tutup"}
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${
                                collapsedGroups[group.title] ? "" : "rotate-180"
                              }`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                      )}
                    </div>
                    <CollapsibleContent forceMount className={collapsedGroups[group.title] ? "hidden" : ""}>
                      <TabsList className="mt-2 grid h-auto grid-cols-2 gap-1.5 border-0 bg-transparent p-0 shadow-none md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <TabsTrigger
                              key={item.value}
                              value={item.value}
                              className="h-8 justify-start gap-1.5 rounded-md border border-slate-200/70 bg-white px-2 text-left text-xs shadow-none hover:bg-slate-50 data-[state=active]:shadow-sm"
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </CardContent>
          </Card>

          <TabsContent value="layout" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Bagian Halaman Depan</CardTitle>
                    <CardDescription>
                      Urutan tengah tetap bisa diatur. Bagian inti seperti hero, solusi, pricing, CTA, dan footer dipin agar landing publik tetap stabil.
                    </CardDescription>
                  </div>
                  <Button onClick={handleSaveOrder} disabled={isSaving}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Simpan Urutan</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sections.map((section, index) => {
                    const IconComponent = sectionIcons[section.section_key] || Layout;
                    const pinnedPlacement = getHomepagePinnedPlacement(section.section_key);
                    const isPinned = Boolean(pinnedPlacement);
                    return (
                      <div key={section.id} draggable={!isPinned} onDragStart={() => handleDragStart(index)} onDragOver={(e) => handleDragOver(e, index)} onDragEnd={handleDragEnd}
                        className={`flex items-center gap-4 p-4 rounded-lg border bg-card transition-all ${draggedItem === index ? "opacity-50 border-primary" : ""} ${!section.is_enabled ? "opacity-60" : ""}`}>
                        <div className={isPinned ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing"}>
                          <GripVertical className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${section.is_enabled ? "bg-primary/10" : "bg-muted"}`}>
                            <IconComponent className={`h-5 w-5 ${section.is_enabled ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{section.section_name}</p>
                              {pinnedPlacement && (
                                <Badge variant="outline" className="text-xs">
                                  Dipin di {pinnedPlacement === "top" ? "atas" : "bawah"}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">Key: {section.section_key}</p>
                          </div>
                        </div>
                        <Badge variant={section.is_enabled ? "default" : "secondary"}>{section.is_enabled ? "Aktif" : "Nonaktif"}</Badge>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => moveSection(index, index - 1)}
                              disabled={isSaving || index === 0 || isPinned}
                              aria-label={`Pindahkan ${section.section_name} ke atas`}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => moveSection(index, index + 1)}
                              disabled={isSaving || index === sections.length - 1 || isPinned}
                              aria-label={`Pindahkan ${section.section_name} ke bawah`}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          </div>
                          <Switch
                            checked={section.is_enabled}
                            disabled={pendingSectionIds.includes(section.id)}
                            onCheckedChange={(checked) => handleToggle(section.id, checked)}
                            aria-label={`Ubah status ${section.section_name}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hero" className="mt-6"><Card><CardHeader><CardTitle>Pengaturan Hero</CardTitle></CardHeader><CardContent><HeroSettings /></CardContent></Card></TabsContent>
          <TabsContent value="target_segment" className="mt-6"><TargetSegmentSettings /></TabsContent>
          <TabsContent value="statistics" className="mt-6"><StatisticsSettings /></TabsContent>
          <TabsContent value="features" className="mt-6"><Card><CardHeader><CardTitle>Pengaturan Fitur</CardTitle></CardHeader><CardContent><FeaturesSettings /></CardContent></Card></TabsContent>
          <TabsContent value="news" className="mt-6"><NewsSettings /></TabsContent>
          <TabsContent value="articles" className="mt-6"><Card><CardHeader><CardTitle>Pengaturan Artikel</CardTitle></CardHeader><CardContent><ArticlesSettings /></CardContent></Card></TabsContent>
          <TabsContent value="pricing" className="mt-6"><Card><CardHeader><CardTitle>Pengaturan Harga</CardTitle></CardHeader><CardContent><PricingSettings /></CardContent></Card></TabsContent>
          <TabsContent value="testimonials" className="mt-6"><Card><CardHeader><CardTitle>Pengaturan Testimoni</CardTitle></CardHeader><CardContent><TestimonialsSettings /></CardContent></Card></TabsContent>
          <TabsContent value="faq" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>FAQ Halaman Publik</CardTitle>
                <CardDescription>
                  Pengelolaan item FAQ dipusatkan di satu halaman agar tidak duplikat.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Kelola daftar pertanyaan, jawaban, kategori, dan urutan FAQ melalui menu Manajemen FAQ.
                </div>
                <Button onClick={() => navigate("/admin/faq")}>Buka Manajemen FAQ</Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payment" className="mt-6"><Card><CardHeader><CardTitle>Metode Pembayaran</CardTitle></CardHeader><CardContent><PaymentMethodsSettings /></CardContent></Card></TabsContent>
          <TabsContent value="cta" className="mt-6"><Card><CardHeader><CardTitle>Pengaturan CTA</CardTitle></CardHeader><CardContent><CTASettings /></CardContent></Card></TabsContent>
          <TabsContent value="footer" className="mt-6"><Card><CardHeader><CardTitle>Pengaturan Footer</CardTitle></CardHeader><CardContent><FooterSettings /></CardContent></Card></TabsContent>
          <TabsContent value="quicklinks" className="mt-6"><QuickLinksSettings /></TabsContent>
          <TabsContent value="legal" className="mt-6"><LegalLinksSettings /></TabsContent>
          <TabsContent value="social" className="mt-6"><SocialMediaSettings /></TabsContent>
          <TabsContent value="chat_agent" className="mt-6"><HomepageChatAgentSettings /></TabsContent>
          <TabsContent value="banners" className="mt-6"><Card><CardContent className="pt-6"><BannerPromoSettings /></CardContent></Card></TabsContent>
          <TabsContent value="sidebar" className="mt-6"><Card><CardContent className="pt-6"><BannerSidebarSettings /></CardContent></Card></TabsContent>
          <TabsContent value="promo" className="mt-6"><PromoSidebarSettings /></TabsContent>
          <TabsContent value="download" className="mt-6"><AppDownloadSettings /></TabsContent>
          <TabsContent value="clients" className="mt-6"><Card><CardContent className="pt-6"><ClientLogoSettings /></CardContent></Card></TabsContent>
          <TabsContent value="about" className="mt-6"><AboutPageSettings /></TabsContent>
        </Tabs>
      </div>
    </SuperAdminLayout>
  );
}
