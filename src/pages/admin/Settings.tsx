import { useState, lazy, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { GeneralSettings } from "@/components/admin/settings/GeneralSettings";
import { WhatsAppGatewaySettings } from "@/components/admin/settings/WhatsAppGatewaySettings";
import { EmailGatewaySettings } from "@/components/admin/settings/EmailGatewaySettings";
import { SEOSettings } from "@/components/admin/settings/SEOSettings";
import { SystemSettings } from "@/components/admin/settings/SystemSettings";
import { APKUploadSettings } from "@/components/admin/settings/APKUploadSettings";
import { FloatingWhatsappSettings } from "@/components/admin/settings/FloatingWhatsappSettings";
import { LoginRateLimitSettings } from "@/components/admin/settings/LoginRateLimitSettings";
import { ScalabilitySettings } from "@/components/admin/settings/ScalabilitySettings";
import { CloudCapacitySettings } from "@/components/admin/settings/CloudCapacitySettings";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Key } from "lucide-react";

// Lazy load heavy settings pages
const DatabaseManagementContent = lazy(() => import("@/pages/admin/DatabaseManagement"));
const TrialSettingsContent = lazy(() => import("@/pages/admin/TrialSettings"));
const SupabaseSettingsContent = lazy(() => import("@/pages/admin/SupabaseSettings"));
const PartitionMonitoringContent = lazy(() => import("@/pages/admin/PartitionMonitoring"));
const CronJobsInfoContent = lazy(() => import("@/pages/admin/CronJobsInfo"));
const OrgOnboardingTemplatesContent = lazy(() => import("@/pages/admin/OrgOnboardingTemplates"));
const AdminAbsenceLimitsContent = lazy(() => import("@/pages/admin/schedule/AbsenceLimitsManagement"));

type SettingsCategoryId =
  | "general"
  | "security"
  | "integration"
  | "operations"
  | "onboarding"
  | "billing";

type SettingsTabId =
  | "umum"
  | "seo"
  | "apk"
  | "floating-wa"
  | "keamanan"
  | "rate-limit"
  | "whatsapp"
  | "email"
  | "infra-cloud"
  | "sistem"
  | "skalabilitas"
  | "monitoring-partition"
  | "info-cron"
  | "database"
  | "supabase"
  | "template-org"
  | "template-absence"
  | "streak";

const settingsCategories: Array<{ id: SettingsCategoryId; label: string }> = [
  { id: "general", label: "Umum & Branding" },
  { id: "security", label: "Keamanan & Akses" },
  { id: "integration", label: "Integrasi & Gateway" },
  { id: "operations", label: "Operasional Sistem" },
  { id: "onboarding", label: "Onboarding & Template" },
  { id: "billing", label: "Billing & Kebijakan" },
];

const settingsTabsByCategory: Record<SettingsCategoryId, Array<{ id: SettingsTabId; label: string }>> = {
  general: [
    { id: "umum", label: "Umum" },
    { id: "seo", label: "SEO" },
    { id: "apk", label: "Upload Aplikasi" },
    { id: "floating-wa", label: "Floating WhatsApp" },
  ],
  security: [
    { id: "keamanan", label: "Keamanan Akun" },
    { id: "rate-limit", label: "Rate Limit" },
  ],
  integration: [
    { id: "whatsapp", label: "WhatsApp Gateway" },
    { id: "email", label: "Email Gateway" },
    { id: "infra-cloud", label: "Supabase & Vercel" },
  ],
  operations: [
    { id: "sistem", label: "Sistem" },
    { id: "skalabilitas", label: "Skalabilitas" },
    { id: "monitoring-partition", label: "Monitoring Partisi" },
    { id: "info-cron", label: "Informasi Cron" },
    { id: "database", label: "Database" },
    { id: "supabase", label: "Pengaturan Supabase" },
  ],
  onboarding: [
    { id: "template-org", label: "Template Onboarding Org" },
    { id: "template-absence", label: "Template Batas Absen" },
  ],
  billing: [{ id: "streak", label: "Konfigurasi Streak" }],
};

const TabFallback = () => (
  <div className="space-y-4 p-4">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-32 w-full" />
  </div>
);

export default function Settings() {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>("general");
  const [activeTab, setActiveTab] = useState<SettingsTabId>("umum");
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleCategoryChange = (categoryId: string) => {
    const nextCategory = categoryId as SettingsCategoryId;
    setActiveCategory(nextCategory);
    const firstTab = settingsTabsByCategory[nextCategory]?.[0];
    if (firstTab) {
      setActiveTab(firstTab.id);
    }
  };

  const currentCategoryTabs = settingsTabsByCategory[activeCategory];

  return (
    <SuperAdminLayout
      title="Pengaturan Situs"
      subtitle="Kelola pengaturan umum, SEO, dan media sosial"
    >
      <Card>
        <CardContent className="p-0">
          <Tabs value={activeCategory} onValueChange={handleCategoryChange} className="w-full">
            <div className="border-b bg-muted/20 px-4 overflow-x-auto">
              <TabsList className="h-auto p-0 bg-transparent flex flex-nowrap gap-1">
                {settingsCategories.map((category) => (
                  <TabsTrigger
                    key={category.id}
                    value={category.id}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:shadow-none px-4 py-3 text-sm font-medium whitespace-nowrap"
                  >
                    {category.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTabId)} className="w-full">
              <div className="border-b bg-muted/30 px-4 overflow-x-auto">
                <TabsList className="h-auto p-0 bg-transparent flex flex-nowrap gap-1">
                  {currentCategoryTabs.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:shadow-none px-4 py-3 text-sm font-medium whitespace-nowrap"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="p-6">
                <TabsContent value="umum" className="mt-0">
                  <GeneralSettings />
                </TabsContent>
                <TabsContent value="keamanan" className="mt-0">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Key className="h-5 w-5" />
                        Lupa / Ganti Password
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Kelola password akun Super Admin Anda. Sistem akan memverifikasi email dan no. WhatsApp terdaftar.
                      </p>
                    </div>
                    <Button onClick={() => setShowForgotPassword(true)}>
                      <Key className="w-4 h-4 mr-2" />
                      Lupa / Ganti Password
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="skalabilitas" className="mt-0">
                  <ScalabilitySettings />
                </TabsContent>
                <TabsContent value="whatsapp" className="mt-0">
                  <WhatsAppGatewaySettings />
                </TabsContent>
                <TabsContent value="email" className="mt-0">
                  <EmailGatewaySettings />
                </TabsContent>
                <TabsContent value="seo" className="mt-0">
                  <SEOSettings />
                </TabsContent>
                <TabsContent value="apk" className="mt-0">
                  <APKUploadSettings />
                </TabsContent>
                <TabsContent value="sistem" className="mt-0">
                  <SystemSettings />
                </TabsContent>
                <TabsContent value="floating-wa" className="mt-0">
                  <FloatingWhatsappSettings />
                </TabsContent>
                <TabsContent value="rate-limit" className="mt-0">
                  <LoginRateLimitSettings />
                </TabsContent>
                <TabsContent value="streak" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <TrialSettingsContent embedded />
                  </Suspense>
                </TabsContent>
                <TabsContent value="template-org" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <OrgOnboardingTemplatesContent embedded />
                  </Suspense>
                </TabsContent>
                <TabsContent value="template-absence" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <AdminAbsenceLimitsContent embedded />
                  </Suspense>
                </TabsContent>
                <TabsContent value="monitoring-partition" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <PartitionMonitoringContent embedded />
                  </Suspense>
                </TabsContent>
                <TabsContent value="info-cron" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <CronJobsInfoContent embedded />
                  </Suspense>
                </TabsContent>
                <TabsContent value="infra-cloud" className="mt-0">
                  <CloudCapacitySettings />
                </TabsContent>
                <TabsContent value="database" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <DatabaseManagementContent embedded />
                  </Suspense>
                </TabsContent>
                <TabsContent value="supabase" className="mt-0">
                  <Suspense fallback={<TabFallback />}>
                    <SupabaseSettingsContent embedded />
                  </Suspense>
                </TabsContent>
              </div>
            </Tabs>
          </Tabs>
        </CardContent>
      </Card>

      <ForgotPasswordDialog
        open={showForgotPassword}
        onOpenChange={setShowForgotPassword}
        loginType="admin"
      />
    </SuperAdminLayout>
  );
}
