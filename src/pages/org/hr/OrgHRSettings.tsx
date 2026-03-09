import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Lock, Settings, ShieldCheck, BriefcaseBusiness } from "lucide-react";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import {
  DEFAULT_ORG_WORKSPACE_MODULES,
  emitOrgWorkspaceModulesUpdated,
  fetchTenantOrgWorkspaceModules,
  saveTenantOrgWorkspaceModules,
  type OrgWorkspaceModules,
} from "@/lib/orgWorkspaceModules";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function OrgHRSettings() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [modules, setModules] = useState<OrgWorkspaceModules>(DEFAULT_ORG_WORKSPACE_MODULES);
  const [isLoadingModules, setIsLoadingModules] = useState(true);
  const [isSavingModules, setIsSavingModules] = useState(false);
  const [hasAdminAccess, setHasAdminAccess] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadWorkspaceModules = async () => {
      setIsLoadingModules(true);
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) {
          setHasAdminAccess(false);
          return;
        }
        const { data: roles, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", authData.user.id);
        if (roleError) throw roleError;

        const adminAccess = (roles || []).some((row) => row.role === "admin_instansi" || row.role === "super_admin");
        if (!adminAccess) {
          if (!cancelled) setHasAdminAccess(false);
          return;
        }
        if (!cancelled) setHasAdminAccess(true);

        const resolvedTenantId = await resolveOrgTenantId();
        if (!resolvedTenantId) {
          if (!cancelled) {
            setTenantId(null);
            setModules(DEFAULT_ORG_WORKSPACE_MODULES);
          }
          return;
        }
        const setting = await fetchTenantOrgWorkspaceModules(resolvedTenantId);
        if (!cancelled) {
          setTenantId(resolvedTenantId);
          setModules(setting.modules);
        }
      } catch (error) {
        const errorRef = reportError(error, "org.hr.settings.fetch_workspace_modules");
        toast.error(appendErrorReference("Gagal memuat pengaturan workspace", errorRef));
        if (!cancelled) {
          setModules(DEFAULT_ORG_WORKSPACE_MODULES);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingModules(false);
        }
      }
    };

    void loadWorkspaceModules();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleModule = async (key: keyof OrgWorkspaceModules, value: boolean) => {
    if (!hasAdminAccess) {
      toast.error("Hanya admin organisasi yang dapat mengubah pengaturan workspace.");
      return;
    }
    if (!tenantId) {
      toast.error("Tenant organisasi belum ditemukan.");
      return;
    }
    const nextModules = { ...modules, [key]: value };
    setModules(nextModules);
    setIsSavingModules(true);
    try {
      const saved = await saveTenantOrgWorkspaceModules(tenantId, nextModules);
      setModules(saved);
      emitOrgWorkspaceModulesUpdated(saved);
      toast.success("Pengaturan workspace berhasil diperbarui.");
    } catch (error) {
      const errorRef = reportError(error, "org.hr.settings.save_workspace_modules", {
        tenant_id: tenantId,
        module: key,
      });
      setModules((prev) => ({ ...prev, [key]: !value }));
      toast.error(appendErrorReference("Gagal menyimpan pengaturan workspace", errorRef));
    } finally {
      setIsSavingModules(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">HR Settings</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Pengaturan HR</h1>
          <p className="text-sm text-muted-foreground">
            Pusat konfigurasi tata kelola data HR, akses pengguna, dan audit aktivitas.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Otomasi Akses Workspace</CardTitle>
            <CardDescription>
              Aktif/nonaktifkan workspace HR untuk organisasi. Menu sidebar dan app switcher akan sinkron otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasAdminAccess ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Akses dibatasi. Pengaturan workspace hanya dapat diubah oleh admin organisasi.
              </div>
            ) : null}
            <ModuleToggleRow
              icon={BriefcaseBusiness}
              title="Workspace HR"
              description="Mengaktifkan area kerja HR (/org/hr) dengan sidebar khusus HR."
              checked={modules.hr}
              disabled={isLoadingModules || isSavingModules || !hasAdminAccess}
              onCheckedChange={(checked) => void handleToggleModule("hr", checked)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Konfigurasi & Tata Kelola</CardTitle>
            <CardDescription>
              Pengaturan HR tetap terhubung ke pengaturan organisasi agar governance tetap satu pintu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="konfigurasi">
              <TabsList>
                <TabsTrigger value="konfigurasi">Konfigurasi Data</TabsTrigger>
                <TabsTrigger value="akses">Akses & Role</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>
              <TabsContent value="konfigurasi">
                <ActionCard
                  icon={Settings}
                  title="Konfigurasi Data HR"
                  description="Atur field, validasi, dan preferensi umum data kepegawaian."
                  onClick={() => navigate("/org/hr/settings")}
                  buttonLabel="Tetap di Pengaturan HR"
                />
              </TabsContent>
              <TabsContent value="akses">
                <ActionCard
                  icon={Lock}
                  title="Akses Admin & Operator"
                  description="Kelola hak akses workspace HR, FAQ HR, dan tiket bantuan HR."
                  onClick={() => navigate("/org/hr/help/tickets")}
                  buttonLabel="Buka Tiket HR"
                />
              </TabsContent>
              <TabsContent value="audit">
                <ActionCard
                  icon={ShieldCheck}
                  title="Audit Aktivitas HR"
                  description="Pantau perubahan data kritis HR dan tindak lanjuti dari Bantuan HR."
                  onClick={() => navigate("/org/hr/help/support")}
                  buttonLabel="Buka Bantuan HR"
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Matriks Kebutuhan /org/hr</CardTitle>
            <CardDescription>
              Hasil audit menu, tab, dan link HR organisasi untuk memastikan tiap halaman memiliki kebutuhan minimal yang jelas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Total Link Sidebar HR</p>
                <p className="text-xl font-semibold">66</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Full Page Siap Pakai</p>
                <p className="text-xl font-semibold">42</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Bridge / Scaffold</p>
                <p className="text-xl font-semibold">24</p>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="font-medium">Definisi selesai minimum per halaman:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Heading konsisten dengan menu sidebar.</li>
                <li>Tidak ada tab yang menduplikasi submenu sidebar.</li>
                <li>Ada state loading, empty, dan error (dengan referensi error).</li>
                <li>Ada aksi inti domain: create/update/filter/export sesuai konteks halaman.</li>
                <li>Tidak keluar ke workspace absensi (kecuali switcher di header).</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Prioritas implementasi bridge/scaffold:</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/org/hr/onboarding")}>
                  Lifecycle Karyawan
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/org/hr/work-hours")}>
                  Kebijakan Kehadiran
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/org/hr/leave-types")}>
                  Kebijakan Cuti
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/org/hr/kpi")}>
                  Performance
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/org/hr/ess/requests")}>
                  ESS
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}

function ModuleToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between rounded-lg border p-4">
      <div className="pr-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  buttonLabel,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <span className="inline-flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            {title}
          </span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={onClick}>{buttonLabel}</Button>
      </CardContent>
    </Card>
  );
}
