import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, LifeBuoy, Palette, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

const HR_PROFILE_SETTINGS_KEY = "hr_workspace_profile_v1";

const DOMAIN_SECTIONS = [
  {
    title: "Fondasi HR",
    description: "Mencakup pegawai, struktur organisasi, jabatan, kontrak, dokumen, dan templat dokumen.",
    routes: ["/org/hr/employees", "/org/hr/structure", "/org/hr/contracts", "/org/hr/document-templates"],
  },
  {
    title: "Operasional & Pemantauan",
    description: "Mencakup onboarding, offboarding, cuti, analitik kehadiran, log error, dan SLA bantuan HR.",
    routes: ["/org/hr/onboarding", "/org/hr/leave-types", "/org/hr/attendance-insights", "/org/hr/help/error-logs"],
  },
  {
    title: "Governance & Dukungan",
    description: "Mencakup kebijakan, pengaturan, tiket HR, FAQ, dan alur eskalasi lintas tenant.",
    routes: ["/admin/hr/policies", "/admin/hr/settings", "/admin/hr/help/tickets", "/admin/hr/help/support"],
  },
];

const BRAND_GUARDRAILS = [
  "Area kerja HR harus diposisikan sebagai area operasional internal, bukan halaman publik marketing.",
  "Istilah menu dan FAQ harus konsisten antara /admin/hr dan /org/hr agar dukungan tidak memberi arahan yang bertentangan.",
  "Perubahan rute alias, internal, dan bridge harus tercermin di pengaturan/audit supaya tidak melebihkan kesiapan produk.",
];

type HrWorkspaceProfileSettings = {
  workspaceLabel: string;
  primaryAudience: string;
  positioning: string;
  summary: string;
  brandTone: string;
  operationalNote: string;
};

const DEFAULT_PROFILE_SETTINGS: HrWorkspaceProfileSettings = {
  workspaceLabel: "Area HR",
  primaryAudience: "Super Admin",
  positioning: "Operasional",
  summary: "Area governance lintas tenant untuk domain HRIS.",
  brandTone: "Tegas, audit-friendly, dan minim ambiguitas.",
  operationalNote: "Gunakan halaman ini sebagai referensi identitas area HR ketika memeriksa konsistensi pengaturan, FAQ, audit, dan bantuan.",
};

const normalizeProfileSettings = (value: unknown): HrWorkspaceProfileSettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_PROFILE_SETTINGS;
  const raw = value as Record<string, unknown>;
  return {
    workspaceLabel: typeof raw.workspace_label === "string" && raw.workspace_label.trim() ? raw.workspace_label.trim() : DEFAULT_PROFILE_SETTINGS.workspaceLabel,
    primaryAudience: typeof raw.primary_audience === "string" && raw.primary_audience.trim() ? raw.primary_audience.trim() : DEFAULT_PROFILE_SETTINGS.primaryAudience,
    positioning: typeof raw.positioning === "string" && raw.positioning.trim() ? raw.positioning.trim() : DEFAULT_PROFILE_SETTINGS.positioning,
    summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : DEFAULT_PROFILE_SETTINGS.summary,
    brandTone: typeof raw.brand_tone === "string" && raw.brand_tone.trim() ? raw.brand_tone.trim() : DEFAULT_PROFILE_SETTINGS.brandTone,
    operationalNote: typeof raw.operational_note === "string" && raw.operational_note.trim() ? raw.operational_note.trim() : DEFAULT_PROFILE_SETTINGS.operationalNote,
  };
};

const serializeProfileSettings = (value: HrWorkspaceProfileSettings) => ({
  workspace_label: value.workspaceLabel.trim(),
  primary_audience: value.primaryAudience.trim(),
  positioning: value.positioning.trim(),
  summary: value.summary.trim(),
  brand_tone: value.brandTone.trim(),
  operational_note: value.operationalNote.trim(),
});

export default function AdminHRProfile() {
  const [settings, setSettings] = useState<HrWorkspaceProfileSettings>(DEFAULT_PROFILE_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<HrWorkspaceProfileSettings>(DEFAULT_PROFILE_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const loadProfileSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("id, value, updated_at")
        .eq("key", HR_PROFILE_SETTINGS_KEY)
        .maybeSingle();

      if (error) throw error;
      const normalizedSettings = normalizeProfileSettings(data?.value);
      setSettings(normalizedSettings);
      setSavedSettings(normalizedSettings);
      setLastUpdatedAt(data?.updated_at ?? null);
    } catch (error) {
      const ref = reportError(error, "admin.hr.profile.load");
      toast.error(appendErrorReference("Gagal memuat profil area kerja HR", ref));
      setSettings(DEFAULT_PROFILE_SETTINGS);
      setSavedSettings(DEFAULT_PROFILE_SETTINGS);
      setLastUpdatedAt(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfileSettings();
  }, [loadProfileSettings]);

  const quickSummary = useMemo(
    () => [
      {
        title: "Identitas Area Kerja",
        value: settings.workspaceLabel,
        note: settings.summary,
        icon: Building2,
      },
      {
        title: "Fokus Pengguna",
        value: settings.primaryAudience,
        note: "Digunakan tim internal untuk dukungan, kebijakan, dan pemantauan tenant.",
        icon: Users,
      },
      {
        title: "Arah Branding",
        value: settings.positioning,
        note: settings.brandTone,
        icon: Palette,
      },
      {
        title: "Kontrol Kritis",
        value: "Pengaturan + Audit",
        note: "Perubahan identitas/coverage harus selalu bisa ditelusuri balik.",
        icon: ShieldCheck,
      },
    ],
    [settings],
  );

  const hasUnsavedChanges = useMemo(() => {
    const current = serializeProfileSettings(settings);
    const saved = serializeProfileSettings(savedSettings);
    return JSON.stringify(current) !== JSON.stringify(saved);
  }, [savedSettings, settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = serializeProfileSettings(settings);

      if (JSON.stringify(payload) === JSON.stringify(serializeProfileSettings(savedSettings))) {
      toast.info("Belum ada perubahan profil area kerja HR yang perlu disimpan.");
        return;
      }

      const { data, error } = await supabase.rpc(
        "save_admin_hr_workspace_profile" as never,
        { p_profile: payload } as never,
      );
      if (error) throw error;

      const savedRecord = Array.isArray(data) ? data[0] : data;
      setSavedSettings({ ...settings });
      setLastUpdatedAt(savedRecord?.updated_at ?? new Date().toISOString());
      toast.success("Profil area kerja HR berhasil disimpan.");
    } catch (error) {
      const ref = reportError(error, "admin.hr.profile.save");
      toast.error(appendErrorReference("Gagal menyimpan profil area kerja HR", ref));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminHRPageShell
      title="Profil HR Tenant"
      subtitle="Profil sekunder area HR admin"
      description="Halaman ini menjelaskan posisi area kerja HR pada panel super admin: identitas area, domain utama, guardrail branding, dan jalur kontrol yang harus dipakai tim internal."
    >
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Editor Profil Workspace HR</CardTitle>
                <CardDescription>Sumber kebenaran ringan untuk identitas dan posisi area HR di panel super admin.</CardDescription>
              </div>
              <p className="text-xs text-muted-foreground">
                {isLoading ? "Memuat..." : `Update terakhir: ${lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("id-ID") : "-"}`}
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workspaceLabel">Label Workspace</Label>
                <Input
                  id="workspaceLabel"
                  value={settings.workspaceLabel}
                  onChange={(event) => setSettings((prev) => ({ ...prev, workspaceLabel: event.target.value }))}
                  placeholder="Contoh: Area HR"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="primaryAudience">Audiens Utama</Label>
                <Input
                  id="primaryAudience"
                  value={settings.primaryAudience}
                  onChange={(event) => setSettings((prev) => ({ ...prev, primaryAudience: event.target.value }))}
                  placeholder="Contoh: Super Admin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="positioning">Positioning</Label>
                <Input
                  id="positioning"
                  value={settings.positioning}
                  onChange={(event) => setSettings((prev) => ({ ...prev, positioning: event.target.value }))}
                  placeholder="Contoh: Operasional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Ringkasan</Label>
                <Textarea
                  id="summary"
                  value={settings.summary}
                  onChange={(event) => setSettings((prev) => ({ ...prev, summary: event.target.value }))}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brandTone">Nada Branding</Label>
                <Textarea
                  id="brandTone"
                  value={settings.brandTone}
                  onChange={(event) => setSettings((prev) => ({ ...prev, brandTone: event.target.value }))}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="operationalNote">Catatan Operasional</Label>
                <Textarea
                  id="operationalNote"
                  value={settings.operationalNote}
                  onChange={(event) => setSettings((prev) => ({ ...prev, operationalNote: event.target.value }))}
                  rows={4}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={isSaving || isLoading || !hasUnsavedChanges}>
                  Simpan Profil
                </Button>
                <Button variant="outline" onClick={() => setSettings(DEFAULT_PROFILE_SETTINGS)} disabled={isSaving}>
                  Reset Default
                </Button>
                {hasUnsavedChanges ? <Badge variant="secondary">Perubahan belum disimpan</Badge> : null}
              </div>
            </div>

            <Card className="bg-muted/20">
              <CardHeader>
                <CardTitle>Preview Ringkas</CardTitle>
                <CardDescription>Ringkasan yang akan tampil sebagai identitas area kerja HR.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Posisi</Badge>
                  <Badge variant="secondary">{settings.positioning}</Badge>
                </div>
                <p className="text-lg font-semibold">{settings.workspaceLabel}</p>
                <p className="text-sm text-muted-foreground">{settings.summary}</p>
                <div className="rounded-lg border bg-background p-3 text-sm">
                  <p><strong>Audiens:</strong> {settings.primaryAudience}</p>
                  <p className="mt-2"><strong>Nada:</strong> {settings.brandTone}</p>
                  <p className="mt-2 text-muted-foreground">{settings.operationalNote}</p>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {quickSummary.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardDescription>{item.title}</CardDescription>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-2xl">{item.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{item.note}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Posisi</Badge>
              <Badge variant="secondary">Area Kerja Admin Internal</Badge>
            </div>
            <CardTitle>Peran Area Kerja HR</CardTitle>
            <CardDescription>
              Area kerja HR di panel admin bukan profil tenant tunggal, melainkan pusat kontrol lintas tenant untuk menjaga kesiapan produk HR.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Rute ini dipakai sebagai referensi identitas area HR ketika tim internal perlu memeriksa apakah navigasi, FAQ,
              pengaturan, audit, dan bantuan sudah menggambarkan produk HR dengan benar.
            </p>
            <p>
              Jika ada menu HR baru atau perubahan status rute, gunakan halaman ini sebagai acuan bahwa posisi utamanya
              tetap: stabilitas operasional, konsistensi panduan, dan kemudahan triase lintas tenant.
            </p>
            <p>{settings.operationalNote}</p>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Cakupan Domain</CardTitle>
              <CardDescription>Ringkasan area kerja utama yang harus tetap sinkron antara admin dan tenant.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {DOMAIN_SECTIONS.map((section) => (
                <div key={section.title} className="rounded-lg border p-4">
                  <p className="font-medium">{section.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {section.routes.map((route) => (
                      <Badge key={route} variant="outline" className="font-mono text-[11px]">
                        {route}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guardrail Branding & Panduan</CardTitle>
              <CardDescription>Hal-hal yang harus tetap dijaga saat menambah menu, FAQ, atau alur dukungan HR.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {BRAND_GUARDRAILS.map((item) => (
                <div key={item} className="rounded-lg border p-4 text-sm text-muted-foreground">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Shortcut Kontrol</CardTitle>
            <CardDescription>Jalur utama yang dipakai saat tim internal perlu mengubah posisi, panduan, atau tata kelola area kerja HR.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ShortcutCard
              title="Pengaturan HR"
              description="Kelola peta cakupan, area kerja tenant, kebijakan tiket, dan peringatan bawaan."
              path="/admin/hr/settings"
              cta="Buka Settings"
            />
            <ShortcutCard
              title="Kebijakan HR"
              description="Kelola acuan bawaan domain HR seperti ESS, pelatihan, ulasan 360, dan tata kelola rute."
              path="/admin/hr/policies"
              cta="Buka Policies"
            />
            <ShortcutCard
              title="FAQ & Dukungan"
              description="Pastikan jawaban dukungan dan panduan eskalasi tetap konsisten dengan kondisi produk."
              path="/admin/hr/help/faq"
              cta="Buka FAQ"
            />
            <ShortcutCard
              title="Audit HR"
              description="Cek mismatch readiness, risiko tenant, dan area yang belum final."
              path="/admin/hr/audit"
              cta="Buka Audit"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Catatan Operasional</CardTitle>
            <CardDescription>Gunakan rute ini untuk orientasi cepat anggota tim baru yang menangani dukungan atau tata kelola HR.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/hr/help/support">
                <LifeBuoy className="mr-2 h-4 w-4" />
                Buka Playbook Support
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/admin/hr/help/tickets">
                <Users className="mr-2 h-4 w-4" />
                Buka Tiket HR
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminHRPageShell>
  );
}

function ShortcutCard({
  title,
  description,
  path,
  cta,
}: {
  title: string;
  description: string;
  path: string;
  cta: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full justify-start">
          <Link to={path}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
