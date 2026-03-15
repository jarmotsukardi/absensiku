import { useEffect, useState } from "react";
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
import { buildHrSidebarGroupsStorageKey, clearHrSidebarGroupsState } from "@/lib/hrSidebarPreferences";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useOrgHrContextNavigate } from "@/hooks/useOrgHrContextNavigate";

const DATA_CONFIGURATION_ACTIONS = [
  {
    icon: Settings,
    title: "Struktur Organisasi",
    description: "Kelola OPD, unit kerja, lokasi, dan struktur dasar yang dipakai modul HR.",
    buttonLabel: "Buka Struktur",
    path: "/org/hr/structure",
  },
  {
    icon: BriefcaseBusiness,
    title: "Templat Dokumen",
    description: "Atur template dokumen HR yang dipakai kontrak, surat, dan administrasi pegawai.",
    buttonLabel: "Buka Templat",
    path: "/org/hr/document-templates",
  },
  {
    icon: ShieldCheck,
    title: "Jenis Cuti & Persetujuan",
    description: "Sinkronkan jenis cuti, kebutuhan dokumen, dan alur persetujuan tenant.",
    buttonLabel: "Buka Kebijakan Cuti",
    path: "/org/hr/leave-types",
  },
];

const ACCESS_AND_ROLE_ACTIONS = [
  {
    icon: Lock,
    title: "Matriks Persetujuan",
    description: "Tetapkan approver role dan level persetujuan untuk workflow HR sensitif.",
    buttonLabel: "Buka Persetujuan",
    path: "/org/hr/approval-hierarchy",
  },
  {
    icon: ShieldCheck,
    title: "Log Error HR",
    description: "Pantau error internal HR dan kelola alert hanya untuk admin yang berwenang.",
    buttonLabel: "Buka Log Error",
    path: "/org/hr/help/error-logs",
  },
  {
    icon: BriefcaseBusiness,
      title: "Tiket & Bantuan HR",
    description: "Tindak lanjuti permintaan bantuan, eskalasi, dan follow-up operasional tenant.",
    buttonLabel: "Buka Tiket HR",
    path: "/org/hr/help/tickets",
  },
];

const AUDIT_ACTIONS = [
  {
    icon: ShieldCheck,
    title: "Laporan HR",
    description: "Tinjau headcount, lifecycle, kontrak, dan audit operasional dari satu tempat.",
    buttonLabel: "Buka Laporan",
    path: "/org/hr/reports",
  },
  {
    icon: BriefcaseBusiness,
    title: "Prioritas Kerja",
    description: "Gunakan peta prioritas untuk melihat domain HR yang masih perlu diperdalam.",
    buttonLabel: "Buka Prioritas",
    path: "/org/hr/priority",
  },
  {
    icon: Lock,
    title: "Dokumen HR",
    description: "Cek readiness repository dokumen pegawai dan referensi administrasi tenant.",
    buttonLabel: "Buka Dokumen",
    path: "/org/hr/documents",
  },
];

export default function OrgHRSettings() {
  const navigate = useOrgHrContextNavigate();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [modules, setModules] = useState<OrgWorkspaceModules>(DEFAULT_ORG_WORKSPACE_MODULES);
  const [isLoadingModules, setIsLoadingModules] = useState(true);
  const [isSavingModules, setIsSavingModules] = useState(false);
  const [hasAdminAccess, setHasAdminAccess] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/settings");

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
        if (!cancelled) setCurrentUserId(authData.user.id);
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
        toast.error(appendErrorReference("Gagal memuat pengaturan area kerja", errorRef));
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

  const handleResetSidebarPreferences = () => {
    const storageKey = buildHrSidebarGroupsStorageKey({
      tenantId,
      userId: currentUserId,
      accessLevel: "admin",
    });
    clearHrSidebarGroupsState(storageKey);
    toast.success("Preferensi sidebar HR direset.");
  };

  const handleToggleModule = async (key: keyof OrgWorkspaceModules, value: boolean) => {
    if (!hasAdminAccess || !access.canConfigure) {
      toast.error("Hanya admin organisasi yang dapat mengubah pengaturan area kerja.");
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
      toast.success("Pengaturan area kerja berhasil diperbarui.");
    } catch (error) {
      const errorRef = reportError(error, "org.hr.settings.save_workspace_modules", {
        tenant_id: tenantId,
        module: key,
      });
      setModules((prev) => ({ ...prev, [key]: !value }));
      toast.error(appendErrorReference("Gagal menyimpan pengaturan area kerja", errorRef));
    } finally {
      setIsSavingModules(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Pengaturan</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Pengaturan HR</h1>
          <p className="text-sm text-muted-foreground">
            Pusat konfigurasi area kerja, tata kelola data, dan kontrol akses HR tenant.
          </p>
          <p className="text-xs text-muted-foreground">
            Kemampuan halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Otomasi Akses Area Kerja</CardTitle>
            <CardDescription>
              Aktif/nonaktifkan area kerja HR untuk organisasi. Menu sidebar dan pemilih aplikasi akan sinkron otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasAdminAccess ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Akses dibatasi. Pengaturan area kerja hanya dapat diubah oleh admin organisasi.
              </div>
            ) : null}
            <ModuleToggleRow
              icon={BriefcaseBusiness}
              title="Area Kerja HR"
              description="Mengaktifkan area kerja HR (/org/hr) dengan sidebar khusus HR."
              checked={modules.hr}
              disabled={isLoadingModules || isSavingModules || isLoadingAccess || !hasAdminAccess || !access.canConfigure}
              onCheckedChange={(checked) => void handleToggleModule("hr", checked)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Konfigurasi & Tata Kelola</CardTitle>
            <CardDescription>
              Pengaturan HR tetap terhubung ke pengaturan organisasi agar tata kelola tetap satu pintu.
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
                <div className="grid gap-4 md:grid-cols-3">
                  {DATA_CONFIGURATION_ACTIONS.map((action) => (
                    <ActionCard
                      key={action.path}
                      icon={action.icon}
                      title={action.title}
                      description={action.description}
                      onClick={() => navigate(action.path)}
                      buttonLabel={action.buttonLabel}
                      disabled={!access.canConfigure}
                    />
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="akses">
                <div className="grid gap-4 md:grid-cols-3">
                  {ACCESS_AND_ROLE_ACTIONS.map((action) => (
                    <ActionCard
                      key={action.path}
                      icon={action.icon}
                      title={action.title}
                      description={action.description}
                      onClick={() => navigate(action.path)}
                      buttonLabel={action.buttonLabel}
                      disabled={!access.canConfigure}
                    />
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="audit">
                <div className="grid gap-4 md:grid-cols-3">
                  {AUDIT_ACTIONS.map((action) => (
                    <ActionCard
                      key={action.path}
                      icon={action.icon}
                      title={action.title}
                      description={action.description}
                      onClick={() => navigate(action.path)}
                      buttonLabel={action.buttonLabel}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ringkasan Tata Kelola Tenant</CardTitle>
            <CardDescription>
              Baca cepat apakah tenant siap mengelola area kerja HR tanpa terlalu banyak penyesuaian manual.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <StatusCard
              title="Area Kerja HR"
              value={modules.hr ? "Aktif" : "Nonaktif"}
              tone={modules.hr ? "positive" : "warning"}
              description="Sinkron dengan sidebar dan pemilih aplikasi."
            />
            <StatusCard
              title="Akses Admin"
              value={hasAdminAccess ? "Terverifikasi" : "Terbatas"}
              tone={hasAdminAccess ? "positive" : "warning"}
              description="Dicek dari role user aktif."
            />
            <StatusCard
              title="Hak Konfigurasi"
              value={isLoadingAccess ? "Memuat" : access.canConfigure ? "Siap Dikonfigurasi" : "Baca Saja"}
              tone={access.canConfigure ? "positive" : "neutral"}
              description="Mengikuti policy route HR saat ini."
            />
            <StatusCard
              title="Konteks Tenant"
              value={tenantId ? "Siap" : "Belum Tersedia"}
              tone={tenantId ? "positive" : "warning"}
              description="Diperlukan untuk menyimpan policy tenant."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferensi Area Kerja</CardTitle>
            <CardDescription>
              Kelola preferensi tampilan lokal untuk sidebar HR tanpa memengaruhi pengguna lain dalam tenant yang sama.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
              Preferensi ini menyimpan section sidebar HR yang terakhir Anda buka/tutup pada perangkat ini.
            </div>
            <Button
              variant="outline"
              onClick={handleResetSidebarPreferences}
              disabled={!tenantId || !currentUserId}
            >
              Reset Preferensi Sidebar HR
            </Button>
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
                <p className="text-xs text-muted-foreground">Rute Produksi Minimum</p>
                <p className="text-xl font-semibold">9</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Rute Bantuan Aktif</p>
                <p className="text-xl font-semibold">2</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">Rute Bridge / Internal Aktif</p>
                <p className="text-xl font-semibold">Transisi</p>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="font-medium">Definisi selesai minimum per halaman:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Heading konsisten dengan menu sidebar.</li>
                <li>Tidak ada tab yang menduplikasi submenu sidebar.</li>
                <li>Ada state loading, empty, dan error (dengan referensi error).</li>
                <li>Ada aksi inti domain: create/update/filter/export sesuai konteks halaman.</li>
                <li>Tidak keluar ke area kerja absensi (kecuali pemilih aplikasi di header).</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Prioritas pematangan domain HR:</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/org/hr/onboarding")}>
                  Siklus Karyawan
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/org/hr/work-hours")}>
                  Kebijakan Kehadiran
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/org/hr/leave-types")}>
                  Kebijakan Cuti
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/org/hr/kpi")}>
                  Kinerja
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate("/org/hr/ess/requests")}>
                  Layanan Mandiri
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
  disabled = false,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  disabled?: boolean;
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
        <Button onClick={onClick} disabled={disabled}>{buttonLabel}</Button>
      </CardContent>
    </Card>
  );
}

function StatusCard({
  title,
  value,
  description,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  tone: "positive" | "warning" | "neutral";
}) {
  const toneClassName =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : "text-foreground";

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className={`mt-2 text-lg font-semibold ${toneClassName}`}>{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
