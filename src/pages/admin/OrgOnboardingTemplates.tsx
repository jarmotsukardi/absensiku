import { useCallback, useEffect, useMemo, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  DEFAULT_ORG_ONBOARDING_TEMPLATE,
  type OrgOnboardingTemplate,
  loadOrgOnboardingTemplate,
  normalizeOrgOnboardingTemplate,
  saveOrgOnboardingTemplate,
} from "@/lib/orgOnboardingTemplates";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { Loader2, RefreshCcw, Save, Wand2 } from "lucide-react";

interface OrgTemplateFormState {
  label: string;
  description: string;
  opdName: string;
  opdCode: string;
  workUnitName: string;
  workUnitCode: string;
  institutionType: string;
  positionCsv: string;
  officeName: string;
  officeAddress: string;
  officeLatitude: string;
  officeLongitude: string;
  officeRadiusMeters: string;
  officeWorkStart: string;
  officeWorkEnd: string;
  officeLateTolerance: string;
  activeDaysCsv: string;
  scheduleTimeIn: string;
  scheduleTimeOut: string;
  scheduleLateTolerance: string;
  allowWfh: boolean;
  wfhRequiresApproval: boolean;
  absenceLimitNotifications: boolean;
  autoApplyAbsenceLimits: boolean;
  seedAnnouncements: boolean;
  announcementsJson: string;
}

const defaultFormFromTemplate = (template: OrgOnboardingTemplate): OrgTemplateFormState => {
  const firstOpd = template.opd_defaults[0] || DEFAULT_ORG_ONBOARDING_TEMPLATE.opd_defaults[0];
  const firstWorkUnit =
    template.work_unit_defaults[0] || DEFAULT_ORG_ONBOARDING_TEMPLATE.work_unit_defaults[0];
  const firstOffice = template.office_defaults[0] || DEFAULT_ORG_ONBOARDING_TEMPLATE.office_defaults[0];

  return {
    label: template.label,
    description: template.description,
    opdName: firstOpd.name,
    opdCode: firstOpd.code,
    workUnitName: firstWorkUnit.name,
    workUnitCode: firstWorkUnit.code,
    institutionType: firstWorkUnit.institution_type || template.schedule_defaults.institution_type,
    positionCsv: template.position_defaults.map((item) => item.name).join(", "),
    officeName: firstOffice.name,
    officeAddress: firstOffice.address || "",
    officeLatitude: String(firstOffice.latitude),
    officeLongitude: String(firstOffice.longitude),
    officeRadiusMeters: String(firstOffice.radius_meters),
    officeWorkStart: firstOffice.work_start_time,
    officeWorkEnd: firstOffice.work_end_time,
    officeLateTolerance: String(firstOffice.late_tolerance_minutes),
    activeDaysCsv: template.schedule_defaults.active_days.join(","),
    scheduleTimeIn: template.schedule_defaults.time_in,
    scheduleTimeOut: template.schedule_defaults.time_out,
    scheduleLateTolerance: String(template.schedule_defaults.late_tolerance_minutes),
    allowWfh: template.feature_flags.allow_wfh,
    wfhRequiresApproval: template.feature_flags.wfh_requires_approval,
    absenceLimitNotifications: template.feature_flags.absence_limit_notifications_enabled,
    autoApplyAbsenceLimits: template.feature_flags.auto_apply_absence_limits,
    seedAnnouncements: template.feature_flags.seed_sample_announcements,
    announcementsJson: JSON.stringify(template.announcement_defaults, null, 2),
  };
};

const normalizeTimeInput = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return fallback;
};

const parsePositiveNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return fallback;
};

export default function OrgOnboardingTemplates({ embedded = false }: { embedded?: boolean }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [template, setTemplate] = useState<OrgOnboardingTemplate>(DEFAULT_ORG_ONBOARDING_TEMPLATE);
  const [form, setForm] = useState<OrgTemplateFormState>(
    defaultFormFromTemplate(DEFAULT_ORG_ONBOARDING_TEMPLATE)
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const loadTemplate = useCallback(async () => {
    try {
      setIsLoading(true);
      const { template: loadedTemplate, updatedAt: settingUpdatedAt } = await loadOrgOnboardingTemplate();
      setTemplate(loadedTemplate);
      setForm(defaultFormFromTemplate(loadedTemplate));
      setUpdatedAt(settingUpdatedAt);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.org_onboarding_template.fetch");
      toast.error(appendErrorReference("Gagal memuat template onboarding organisasi", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

  const handleChange = (key: keyof OrgTemplateFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const parsedActiveDays = useMemo(() => {
    const unique = new Set<number>();
    form.activeDaysCsv
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      .forEach((day) => unique.add(day));
    return Array.from(unique).sort((a, b) => a - b);
  }, [form.activeDaysCsv]);

  const handleResetToDefault = () => {
    setTemplate(DEFAULT_ORG_ONBOARDING_TEMPLATE);
    setForm(defaultFormFromTemplate(DEFAULT_ORG_ONBOARDING_TEMPLATE));
    toast.info("Form templat dikembalikan ke nilai bawaan. Klik Simpan untuk menerapkan.");
  };

  const handleSave = async () => {
    if (!form.opdName.trim() || !form.opdCode.trim()) {
      toast.error("Nama dan kode OPD bawaan wajib diisi.");
      return;
    }
    if (!form.workUnitName.trim() || !form.workUnitCode.trim()) {
      toast.error("Nama dan kode satuan kerja bawaan wajib diisi.");
      return;
    }
    if (parsedActiveDays.length === 0) {
      toast.error("Hari kerja aktif minimal 1 hari (rentang 1-7).");
      return;
    }

    let announcementDefaults = template.announcement_defaults;
    try {
      const raw = JSON.parse(form.announcementsJson);
      if (!Array.isArray(raw)) throw new Error("Format JSON pengumuman harus array.");
      announcementDefaults = raw
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const row = item as Record<string, unknown>;
          const title = typeof row.title === "string" ? row.title.trim() : "";
          const content = typeof row.content === "string" ? row.content.trim() : "";
          if (!title || !content) return null;
          return {
            title,
            content,
            is_published: row.is_published !== false,
            is_pinned: row.is_pinned === true,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (announcementDefaults.length === 0) {
        throw new Error("Minimal 1 pengumuman bawaan yang valid.");
      }
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "JSON tidak valid.";
      toast.error(`Format JSON pengumuman tidak valid: ${reason}`);
      return;
    }

    const nextTemplate = normalizeOrgOnboardingTemplate({
      version: 1,
      label: form.label.trim() || DEFAULT_ORG_ONBOARDING_TEMPLATE.label,
      description: form.description.trim() || DEFAULT_ORG_ONBOARDING_TEMPLATE.description,
      opd_defaults: [
        {
          name: form.opdName.trim(),
          code: form.opdCode.trim().toUpperCase(),
          is_active: true,
        },
      ],
      work_unit_defaults: [
        {
          name: form.workUnitName.trim(),
          code: form.workUnitCode.trim().toUpperCase(),
          opd_code: form.opdCode.trim().toUpperCase(),
          institution_type: form.institutionType.trim() || "pemerintahan",
          is_active: true,
        },
      ],
      position_defaults: form.positionCsv
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((name) => ({
          name,
          is_active: true,
        })),
      office_defaults: [
        {
          name: form.officeName.trim() || "Kantor Pusat Organisasi",
          address: form.officeAddress.trim(),
          opd_code: form.opdCode.trim().toUpperCase(),
          latitude: parsePositiveNumber(form.officeLatitude, -3.69543),
          longitude: parsePositiveNumber(form.officeLongitude, 128.1814),
          radius_meters: Math.max(10, Math.floor(parsePositiveNumber(form.officeRadiusMeters, 100))),
          work_start_time: normalizeTimeInput(form.officeWorkStart, "08:00:00"),
          work_end_time: normalizeTimeInput(form.officeWorkEnd, "16:30:00"),
          late_tolerance_minutes: Math.max(0, Math.floor(parsePositiveNumber(form.officeLateTolerance, 0))),
          is_active: true,
        },
      ],
      schedule_defaults: {
        institution_type: form.institutionType.trim() || "pemerintahan",
        active_days: parsedActiveDays,
        time_in: normalizeTimeInput(form.scheduleTimeIn, "08:00:00"),
        time_out: normalizeTimeInput(form.scheduleTimeOut, "16:30:00"),
        late_tolerance_minutes: Math.max(0, Math.floor(parsePositiveNumber(form.scheduleLateTolerance, 0))),
        is_active: true,
      },
      announcement_defaults: announcementDefaults,
      feature_flags: {
        allow_wfh: form.allowWfh,
        wfh_requires_approval: form.wfhRequiresApproval,
        absence_limit_notifications_enabled: form.absenceLimitNotifications,
        auto_apply_absence_limits: form.autoApplyAbsenceLimits,
        seed_sample_announcements: form.seedAnnouncements,
      },
    });

    try {
      setIsSaving(true);
      await saveOrgOnboardingTemplate(nextTemplate);
      setTemplate(nextTemplate);
      setUpdatedAt(new Date().toISOString());
      toast.success("Templat onboarding organisasi berhasil disimpan.");
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.org_onboarding_template.save");
      toast.error(appendErrorReference("Gagal menyimpan templat onboarding organisasi", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const pageContent = (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Konfigurasi Templat Setup Awal
            </CardTitle>
            <CardDescription>
              Templat ini dipakai oleh wizard onboarding organisasi dan bisa diterapkan otomatis saat tenant baru dibuat.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Versi Templat: v{template.version}</Badge>
              <Badge variant="outline">Hari Kerja Bawaan: {parsedActiveDays.join(", ") || "-"}</Badge>
              <Badge variant={form.seedAnnouncements ? "default" : "secondary"}>
                Seed Pengumuman: {form.seedAnnouncements ? "Aktif" : "Nonaktif"}
              </Badge>
            </div>
            {updatedAt && (
              <p className="text-xs text-muted-foreground">
                Update terakhir: {format(new Date(updatedAt), "dd MMM yyyy, HH:mm:ss", { locale: idLocale })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void loadTemplate()} disabled={isLoading || isSaving}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                Muat Ulang
              </Button>
              <Button variant="outline" onClick={handleResetToDefault} disabled={isLoading || isSaving}>
                Reset ke Bawaan
              </Button>
              <Button onClick={() => void handleSave()} disabled={isLoading || isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Simpan Templat
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informasi Umum Templat</CardTitle>
            <CardDescription>Metadata yang ditampilkan di wizard onboarding /org.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nama Templat</Label>
              <Input value={form.label} onChange={(e) => handleChange("label", e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Deskripsi Templat</Label>
              <Textarea
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Master Data Bawaan</CardTitle>
            <CardDescription>Data awal struktur organisasi yang disiapkan untuk tenant baru.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nama OPD Bawaan</Label>
                <Input value={form.opdName} onChange={(e) => handleChange("opdName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Kode OPD Bawaan</Label>
                <Input value={form.opdCode} onChange={(e) => handleChange("opdCode", e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Nama Satuan Kerja Bawaan</Label>
                <Input value={form.workUnitName} onChange={(e) => handleChange("workUnitName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Kode Satuan Kerja</Label>
                <Input value={form.workUnitCode} onChange={(e) => handleChange("workUnitCode", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Jenis Instansi</Label>
                <Input
                  value={form.institutionType}
                  onChange={(e) => handleChange("institutionType", e.target.value)}
                  placeholder="pemerintahan"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Daftar Jabatan Bawaan (pisahkan dengan koma)</Label>
              <Input
                value={form.positionCsv}
                onChange={(e) => handleChange("positionCsv", e.target.value)}
                placeholder="Staf, Operator Absensi, Supervisor"
              />
              <p className="text-xs text-muted-foreground">
                Jabatan disiapkan sebagai daftar global tenant, tidak terikat OPD/satuan kerja.
              </p>
            </div>
            <Separator />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nama Kantor Bawaan</Label>
                <Input value={form.officeName} onChange={(e) => handleChange("officeName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Alamat Kantor Bawaan</Label>
                <Input value={form.officeAddress} onChange={(e) => handleChange("officeAddress", e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Latitude</Label>
                <Input
                  value={form.officeLatitude}
                  onChange={(e) => handleChange("officeLatitude", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Longitude</Label>
                <Input
                  value={form.officeLongitude}
                  onChange={(e) => handleChange("officeLongitude", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Radius (meter)</Label>
                <Input
                  value={form.officeRadiusMeters}
                  onChange={(e) => handleChange("officeRadiusMeters", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Toleransi (menit)</Label>
                <Input
                  value={form.officeLateTolerance}
                  onChange={(e) => handleChange("officeLateTolerance", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Jam Masuk Lokasi</Label>
                <Input
                  value={form.officeWorkStart}
                  onChange={(e) => handleChange("officeWorkStart", e.target.value)}
                  placeholder="08:00:00"
                />
              </div>
              <div className="space-y-2">
                <Label>Jam Pulang Lokasi</Label>
                <Input
                  value={form.officeWorkEnd}
                  onChange={(e) => handleChange("officeWorkEnd", e.target.value)}
                  placeholder="16:30:00"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jadwal & Pengaturan Fitur</CardTitle>
            <CardDescription>
              Aturan kerja bawaan dan toggle fitur yang dipakai saat setup awal tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Hari Kerja Aktif (1-7)</Label>
                <Input
                  value={form.activeDaysCsv}
                  onChange={(e) => handleChange("activeDaysCsv", e.target.value)}
                  placeholder="1,2,3,4,5"
                />
              </div>
              <div className="space-y-2">
                <Label>Jam Masuk Bawaan</Label>
                <Input
                  value={form.scheduleTimeIn}
                  onChange={(e) => handleChange("scheduleTimeIn", e.target.value)}
                  placeholder="08:00:00"
                />
              </div>
              <div className="space-y-2">
                <Label>Jam Pulang Bawaan</Label>
                <Input
                  value={form.scheduleTimeOut}
                  onChange={(e) => handleChange("scheduleTimeOut", e.target.value)}
                  placeholder="16:30:00"
                />
              </div>
            </div>
            <div className="space-y-2 md:max-w-xs">
              <Label>Toleransi Terlambat Bawaan (menit)</Label>
              <Input
                value={form.scheduleLateTolerance}
                onChange={(e) => handleChange("scheduleLateTolerance", e.target.value)}
              />
            </div>

            <Separator />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Aktifkan WFH</p>
                  <p className="text-xs text-muted-foreground">Pengaturan bawaan `allow_wfh` untuk tenant baru</p>
                </div>
                <Switch checked={form.allowWfh} onCheckedChange={(v) => handleChange("allowWfh", v)} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">WFH Wajib Approval</p>
                  <p className="text-xs text-muted-foreground">Pengaturan bawaan `wfh_requires_approval`</p>
                </div>
                <Switch
                  checked={form.wfhRequiresApproval}
                  onCheckedChange={(v) => handleChange("wfhRequiresApproval", v)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Notifikasi Batas Absen</p>
                  <p className="text-xs text-muted-foreground">Notifikasi batas absen bawaan ke pegawai</p>
                </div>
                <Switch
                  checked={form.absenceLimitNotifications}
                  onCheckedChange={(v) => handleChange("absenceLimitNotifications", v)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Auto Apply Batas Absen</p>
                  <p className="text-xs text-muted-foreground">Ambil dari templat /admin/schedule/absence-limits</p>
                </div>
                <Switch
                  checked={form.autoApplyAbsenceLimits}
                  onCheckedChange={(v) => handleChange("autoApplyAbsenceLimits", v)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
                <div>
                  <p className="text-sm font-medium">Pengisian Pengumuman Awal</p>
                  <p className="text-xs text-muted-foreground">Tambahkan pengumuman bawaan jika tenant masih kosong</p>
                </div>
                <Switch
                  checked={form.seedAnnouncements}
                  onCheckedChange={(v) => handleChange("seedAnnouncements", v)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Templat Pengumuman Awal (JSON)</CardTitle>
            <CardDescription>
              Format array objek: title, content, is_published, is_pinned. Dipakai untuk /org/news saat penyiapan awal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.announcementsJson}
              onChange={(e) => handleChange("announcementsJson", e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
          </CardContent>
        </Card>

        <PageGlossarySection preset="admin_org_onboarding_templates" />
      </div>
    </>
  );
  if (embedded) return pageContent;
  return (
    <SuperAdminLayout
      title="Templat Onboarding Organisasi"
      subtitle="Templat penyiapan awal untuk membantu member/tenant baru /org."
    >
      {pageContent}
    </SuperAdminLayout>
  );
}
