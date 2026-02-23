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
import { toast } from "sonner";
import { 
  GripVertical, Save, Layout, Image, FileText, Users, CreditCard, HelpCircle, Phone, Loader2, Megaphone, PanelRight, BarChart3, Newspaper, FileCheck, Share2, Info, Link2, Download, HeartHandshake, MessageSquare,
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
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

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

  const fetchSections = useCallback(async () => {
    try {
      setLoadError(null);
      setIsRetrying(false);
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
      setSections(data || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.homepage_layout.fetch_sections");
      const message = appendErrorReference("Gagal memuat data layout homepage", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSections(); }, [fetchSections]);

  const handleToggle = async (id: string, isEnabled: boolean) => {
    try {
      setIsRetrying(false);
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
    }
  };

  const handleDragStart = (index: number) => setDraggedItem(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;
    const newSections = [...sections];
    const draggedSection = newSections[draggedItem];
    newSections.splice(draggedItem, 1);
    newSections.splice(index, 0, draggedSection);
    newSections.forEach((s, i) => { s.sort_order = i + 1; });
    setSections(newSections);
    setDraggedItem(index);
  };
  const handleDragEnd = () => setDraggedItem(null);

  const handleSaveOrder = async () => {
    setIsSaving(true);
    try {
      setIsRetrying(false);
      const updatedAt = new Date().toISOString();
      const results = await withExponentialBackoff(
        () =>
          withTimeout(
            Promise.all(
              sections.map((section) =>
                supabase
                  .from("homepage_sections")
                  .update({ sort_order: section.sort_order, updated_at: updatedAt })
                  .eq("id", section.id),
              )
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
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        throw failed.error;
      }
      toast.success("Urutan berhasil disimpan");
    } catch (error) {
      const errorRef = reportError(error, "admin.homepage_layout.save_order", {
        section_count: sections.length,
      });
      toast.error(`Gagal menyimpan urutan (Ref: ${errorRef})`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (<SuperAdminLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div></SuperAdminLayout>);
  }

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><Layout className="h-6 w-6" />Pengaturan Layout Halaman Depan</h1>
          <p className="text-muted-foreground">Atur section, banner, dan konten halaman utama</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="min-w-max h-auto flex-nowrap gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
              <TabsTrigger value="layout" className="flex-shrink-0 whitespace-nowrap"><Layout className="h-4 w-4" /><span className="hidden sm:inline ml-1">Tata Letak</span></TabsTrigger>
              <TabsTrigger value="hero" className="flex-shrink-0 whitespace-nowrap"><Image className="h-4 w-4" /><span className="hidden sm:inline ml-1">Hero</span></TabsTrigger>
              <TabsTrigger value="target_segment" className="flex-shrink-0 whitespace-nowrap"><HeartHandshake className="h-4 w-4" /><span className="hidden sm:inline ml-1">Solusi</span></TabsTrigger>
              <TabsTrigger value="statistics" className="flex-shrink-0 whitespace-nowrap"><BarChart3 className="h-4 w-4" /><span className="hidden sm:inline ml-1">Statistik</span></TabsTrigger>
              <TabsTrigger value="features" className="flex-shrink-0 whitespace-nowrap"><Layout className="h-4 w-4" /><span className="hidden sm:inline ml-1">Fitur</span></TabsTrigger>
              <TabsTrigger value="news" className="flex-shrink-0 whitespace-nowrap"><Newspaper className="h-4 w-4" /><span className="hidden sm:inline ml-1">Berita</span></TabsTrigger>
              <TabsTrigger value="articles" className="flex-shrink-0 whitespace-nowrap"><FileText className="h-4 w-4" /><span className="hidden sm:inline ml-1">Artikel</span></TabsTrigger>
              <TabsTrigger value="pricing" className="flex-shrink-0 whitespace-nowrap"><CreditCard className="h-4 w-4" /><span className="hidden sm:inline ml-1">Harga</span></TabsTrigger>
              <TabsTrigger value="testimonials" className="flex-shrink-0 whitespace-nowrap"><Users className="h-4 w-4" /><span className="hidden sm:inline ml-1">Testimoni</span></TabsTrigger>
              <TabsTrigger value="faq" className="flex-shrink-0 whitespace-nowrap"><HelpCircle className="h-4 w-4" /><span className="hidden sm:inline ml-1">FAQ</span></TabsTrigger>
              <TabsTrigger value="payment" className="flex-shrink-0 whitespace-nowrap"><CreditCard className="h-4 w-4" /><span className="hidden sm:inline ml-1">Pembayaran</span></TabsTrigger>
              <TabsTrigger value="cta" className="flex-shrink-0 whitespace-nowrap"><Phone className="h-4 w-4" /><span className="hidden sm:inline ml-1">CTA</span></TabsTrigger>
              <TabsTrigger value="footer" className="flex-shrink-0 whitespace-nowrap"><Layout className="h-4 w-4" /><span className="hidden sm:inline ml-1">Footer</span></TabsTrigger>
              <TabsTrigger value="quicklinks" className="flex-shrink-0 whitespace-nowrap"><Link2 className="h-4 w-4" /><span className="hidden sm:inline ml-1">Quick Links</span></TabsTrigger>
              <TabsTrigger value="legal" className="flex-shrink-0 whitespace-nowrap"><FileCheck className="h-4 w-4" /><span className="hidden sm:inline ml-1">Legal</span></TabsTrigger>
              <TabsTrigger value="social" className="flex-shrink-0 whitespace-nowrap"><Share2 className="h-4 w-4" /><span className="hidden sm:inline ml-1">Sosmed</span></TabsTrigger>
              <TabsTrigger value="chat_agent" className="flex-shrink-0 whitespace-nowrap"><MessageSquare className="h-4 w-4" /><span className="hidden sm:inline ml-1">Chat Agent</span></TabsTrigger>
              <TabsTrigger value="banners" className="flex-shrink-0 whitespace-nowrap"><Megaphone className="h-4 w-4" /><span className="hidden sm:inline ml-1">Banner</span></TabsTrigger>
              <TabsTrigger value="sidebar" className="flex-shrink-0 whitespace-nowrap"><PanelRight className="h-4 w-4" /><span className="hidden sm:inline ml-1">Sidebar</span></TabsTrigger>
              <TabsTrigger value="promo" className="flex-shrink-0 whitespace-nowrap"><Megaphone className="h-4 w-4" /><span className="hidden sm:inline ml-1">Promosi</span></TabsTrigger>
              <TabsTrigger value="download" className="flex-shrink-0 whitespace-nowrap"><Download className="h-4 w-4" /><span className="hidden sm:inline ml-1">Download</span></TabsTrigger>
              <TabsTrigger value="clients" className="flex-shrink-0 whitespace-nowrap"><Users className="h-4 w-4" /><span className="hidden sm:inline ml-1">Klien</span></TabsTrigger>
              <TabsTrigger value="about" className="flex-shrink-0 whitespace-nowrap"><Info className="h-4 w-4" /><span className="hidden sm:inline ml-1">Tentang</span></TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="layout" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div><CardTitle>Section Halaman Depan</CardTitle><CardDescription>Drag & drop untuk mengubah urutan</CardDescription></div>
                  <Button onClick={handleSaveOrder} disabled={isSaving}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Simpan Urutan</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sections.map((section, index) => {
                    const IconComponent = sectionIcons[section.section_key] || Layout;
                    return (
                      <div key={section.id} draggable onDragStart={() => handleDragStart(index)} onDragOver={(e) => handleDragOver(e, index)} onDragEnd={handleDragEnd}
                        className={`flex items-center gap-4 p-4 rounded-lg border bg-card transition-all ${draggedItem === index ? "opacity-50 border-primary" : ""} ${!section.is_enabled ? "opacity-60" : ""}`}>
                        <div className="cursor-grab active:cursor-grabbing"><GripVertical className="h-5 w-5 text-muted-foreground" /></div>
                        <div className="flex items-center gap-3 flex-1">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${section.is_enabled ? "bg-primary/10" : "bg-muted"}`}>
                            <IconComponent className={`h-5 w-5 ${section.is_enabled ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div><p className="font-medium">{section.section_name}</p><p className="text-sm text-muted-foreground">Key: {section.section_key}</p></div>
                        </div>
                        <Badge variant={section.is_enabled ? "default" : "secondary"}>{section.is_enabled ? "Aktif" : "Nonaktif"}</Badge>
                        <Switch checked={section.is_enabled} onCheckedChange={(checked) => handleToggle(section.id, checked)} />
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
