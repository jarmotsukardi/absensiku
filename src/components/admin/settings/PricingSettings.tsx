import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { CreditCard, ExternalLink, Loader2, Save } from "lucide-react";
import { mapSubscriptionPackagesToPricingPlans, type HomepagePricingPlan } from "@/lib/pricingPlans";

interface PricingSectionSettings {
  section_title: string;
  section_subtitle: string;
  show_section: boolean;
}

interface BillingPackageRow {
  id: string;
  name: string;
  description: string | null;
  base_price_per_month: number;
  duration_months: number;
  discount_percentage: number;
  features: Json | null;
  sort_order: number;
}

const defaultSectionSettings: PricingSectionSettings = {
  section_title: "Harga Transparan",
  section_subtitle: "Pilih paket yang sesuai dengan kebutuhan instansi Anda.",
  show_section: true,
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);

export function PricingSettings() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<HomepagePricingPlan[]>([]);
  const [sectionSettings, setSectionSettings] = useState<PricingSectionSettings>(defaultSectionSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const [sectionRes, packageRes, legacyPricingRes] = await Promise.all([
        supabase
          .from("homepage_sections")
          .select("settings, is_enabled")
          .eq("section_key", "pricing")
          .maybeSingle(),
        supabase
          .from("subscription_packages")
          .select("id, name, description, base_price_per_month, duration_months, discount_percentage, features, sort_order")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", "pricing_settings")
          .maybeSingle(),
      ]);

      const sectionData = sectionRes.data;
      if (sectionData?.settings && typeof sectionData.settings === "object") {
        setSectionSettings({
          ...defaultSectionSettings,
          ...(sectionData.settings as Record<string, unknown>),
          show_section: sectionData.is_enabled ?? true,
        });
      }

      const legacyPlans = Array.isArray(legacyPricingRes.data?.value)
        ? (legacyPricingRes.data.value as HomepagePricingPlan[])
        : [];

      const packageRows = (packageRes.data || []) as BillingPackageRow[];
      setPlans(mapSubscriptionPackagesToPricingPlans(packageRows, legacyPlans));
    } catch (error) {
      console.error("Failed to load pricing settings:", error);
      toast.error("Gagal memuat pengaturan harga");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { section_title, section_subtitle, show_section } = sectionSettings;

      const [{ error: sectionError }, { data: existing, error: existingError }] = await Promise.all([
        supabase
          .from("homepage_sections")
          .update({
            settings: { section_title, section_subtitle },
            is_enabled: show_section,
            updated_at: new Date().toISOString(),
          })
          .eq("section_key", "pricing"),
        supabase
          .from("system_settings")
          .select("id")
          .eq("key", "pricing_settings")
          .maybeSingle(),
      ]);

      if (sectionError) throw sectionError;
      if (existingError) throw existingError;

      const mirroredPlans = JSON.parse(JSON.stringify(plans));

      if (existing) {
        const { error } = await supabase
          .from("system_settings")
          .update({ value: mirroredPlans, updated_at: new Date().toISOString() })
          .eq("key", "pricing_settings");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("system_settings")
          .insert({ key: "pricing_settings", value: mirroredPlans });
        if (error) throw error;
      }

      toast.success("Pengaturan harga berhasil disimpan");
    } catch (error) {
      console.error("Failed to save pricing settings:", error);
      toast.error("Gagal menyimpan pengaturan harga");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Relasi Harga dengan Billing
          </CardTitle>
          <CardDescription>
            Section <strong>Harga Transparan</strong> sekarang memakai sumber data yang sama dengan <strong>/admin/billing</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Paket, nominal, durasi, dan fitur dikelola terpusat pada tab <strong>Paket Langganan</strong> di Billing & Payment.
              Halaman ini hanya mengatur tampilan section di landing page.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => navigate("/admin/billing")}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Buka Billing &amp; Payment
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pengaturan Section Harga</CardTitle>
          <CardDescription>Atur visibilitas dan copywriting section harga di halaman utama.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <Label className="font-medium">Tampilkan Section Harga</Label>
              <p className="text-sm text-muted-foreground">Aktifkan/tutup section harga di landing page</p>
            </div>
            <Switch
              checked={sectionSettings.show_section}
              onCheckedChange={(checked) => setSectionSettings((prev) => ({ ...prev, show_section: checked }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Judul Section</Label>
              <Input
                value={sectionSettings.section_title}
                onChange={(e) => setSectionSettings((prev) => ({ ...prev, section_title: e.target.value }))}
                placeholder="Harga Transparan"
              />
            </div>
            <div className="space-y-2">
              <Label>Subtitle</Label>
              <Input
                value={sectionSettings.section_subtitle}
                onChange={(e) => setSectionSettings((prev) => ({ ...prev, section_subtitle: e.target.value }))}
                placeholder="Pilih paket yang sesuai..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paket Harga dari Billing ({plans.length})</CardTitle>
          <CardDescription>Preview realtime paket aktif yang akan tampil di halaman utama.</CardDescription>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Belum ada paket aktif di Billing. Tambahkan paket pada <strong>/admin/billing</strong> agar section harga terisi.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <Card key={plan.id} className={`relative ${plan.is_popular ? "border-primary border-2" : ""}`}>
                  {plan.is_popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary">Populer</Badge>
                    </div>
                  )}
                  <CardContent className="p-4 pt-6">
                    <h4 className="font-semibold text-lg">{plan.name}</h4>
                    <p className="text-sm text-muted-foreground mb-3">{plan.description}</p>
                    <p className="text-2xl font-bold mb-2">
                      {plan.price === 0 ? "Gratis / Custom" : formatCurrency(plan.price)}
                      <span className="text-sm text-muted-foreground font-normal"> {plan.period}</span>
                    </p>
                    <ul className="space-y-1">
                      {plan.features.slice(0, 4).map((feature, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground">
                          • {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Simpan Pengaturan
        </Button>
      </div>
    </div>
  );
}

