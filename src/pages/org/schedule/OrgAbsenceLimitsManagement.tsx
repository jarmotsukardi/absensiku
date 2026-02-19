import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, AlertTriangle, RotateCcw, Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Switch } from "@/components/ui/switch";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import {
  ABSENCE_LIMIT_TEMPLATE_SETTING_KEY,
  normalizeAbsenceLimitTemplate,
} from "@/lib/absenceLimitTemplates";

interface AbsenceLimit {
  id: string;
  tenant_id: string;
  max_days: number;
  warning_type: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
const ABSENCE_LIMIT_NOTIFICATIONS_SETTING_KEY = "absence_limit_notifications_enabled";

const parseNotificationSetting = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value) && "enabled" in value) {
    const enabledValue = (value as { enabled?: unknown }).enabled;
    if (typeof enabledValue === "boolean") return enabledValue;
    if (typeof enabledValue === "string") {
      if (enabledValue.toLowerCase() === "true") return true;
      if (enabledValue.toLowerCase() === "false") return false;
    }
  }
  return fallback;
};

export default function OrgAbsenceLimitsManagement() {
  const [limits, setLimits] = useState<AbsenceLimit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [sendingRuleId, setSendingRuleId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isNotificationSettingEnabled, setIsNotificationSettingEnabled] = useState(true);
  const [isNotificationSettingLoading, setIsNotificationSettingLoading] = useState(true);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [hasAttemptedTemplateBootstrap, setHasAttemptedTemplateBootstrap] = useState(false);
  const [formData, setFormData] = useState({
    id: "",
    max_days: 3,
    warning_type: "",
    description: "",
    is_active: true,
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const fetchData = useCallback(async () => {
    try {
      setLoadError(null);
      const { data, error } = await supabase
        .from("absence_limits")
        .select("*")
        .order("max_days", { ascending: true });

      if (error) throw error;
      setLimits((data as AbsenceLimit[]) || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.absence_limits.fetch_data");
      const message = appendErrorReference("Gagal memuat data batas absen", errorRef);
      setLoadError(message);
      toast.error(message);
      setLimits([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getTenantId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("role", "admin_instansi")
      .maybeSingle();

    if (roleError) throw roleError;
    return roleData?.tenant_id || null;
  }, []);

  const fetchNotificationSetting = useCallback(async () => {
    try {
      setIsNotificationSettingLoading(true);
      const resolvedTenantId = await getTenantId();
      setTenantId(resolvedTenantId);
      if (!resolvedTenantId) {
        setIsNotificationSettingEnabled(true);
        return;
      }

      const { data, error } = await supabase
        .from("organization_settings")
        .select("setting_value")
        .eq("tenant_id", resolvedTenantId)
        .eq("setting_key", ABSENCE_LIMIT_NOTIFICATIONS_SETTING_KEY)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      setIsNotificationSettingEnabled(parseNotificationSetting(data?.setting_value, true));
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.absence_limits.fetch_notification_setting");
      const message = appendErrorReference("Gagal memuat pengaturan notifikasi batas absen", errorRef);
      toast.error(message);
      setIsNotificationSettingEnabled(true);
    } finally {
      setIsNotificationSettingLoading(false);
    }
  }, [getTenantId]);

  const resolveTenantId = useCallback(async (): Promise<string | null> => {
    if (tenantId) return tenantId;
    return getTenantId();
  }, [getTenantId, tenantId]);

  const applyAdminTemplate = useCallback(
    async (options?: { silentIfHasData?: boolean; showToast?: boolean }) => {
      const silentIfHasData = options?.silentIfHasData ?? false;
      const showToast = options?.showToast ?? true;

      try {
        setIsApplyingTemplate(true);
        const resolvedTenantId = await resolveTenantId();
        if (!resolvedTenantId) {
          if (showToast) toast.error("Tenant tidak ditemukan.");
          return false;
        }

        const { count, error: countError } = await supabase
          .from("absence_limits")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", resolvedTenantId);
        if (countError) throw countError;

        if ((count || 0) > 0) {
          if (!silentIfHasData && showToast) {
            toast.info("Template hanya diterapkan jika data batas absen masih kosong.");
          }
          return false;
        }

        const { data: templateData, error: templateError } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", ABSENCE_LIMIT_TEMPLATE_SETTING_KEY)
          .maybeSingle();
        if (templateError) throw templateError;

        const templateRules = normalizeAbsenceLimitTemplate(templateData?.value);
        if (templateRules.length === 0) {
          if (showToast) toast.info("Template admin belum diisi.");
          return false;
        }

        const payload = templateRules.map((rule) => ({
          tenant_id: resolvedTenantId,
          max_days: rule.max_days,
          warning_type: rule.warning_type,
          description: rule.description || null,
          is_active: rule.is_active,
        }));

        const { error: insertError } = await supabase.from("absence_limits").insert(payload);
        if (insertError) throw insertError;

        await fetchData();
        if (showToast) toast.success("Template batas absen admin berhasil diterapkan.");
        return true;
      } catch (error: unknown) {
        const errorRef = reportError(error, "org.schedule.absence_limits.apply_template", {
          tenant_id: tenantId,
        });
        if (showToast) {
          toast.error(appendErrorReference("Gagal menerapkan template admin", errorRef));
        } else {
          setLoadError(appendErrorReference("Template admin gagal diterapkan otomatis", errorRef));
        }
        return false;
      } finally {
        setIsApplyingTemplate(false);
      }
    },
    [fetchData, resolveTenantId, tenantId]
  );

  useEffect(() => {
    void fetchData();
    void fetchNotificationSetting();
  }, [fetchData, fetchNotificationSetting]);

  useEffect(() => {
    if (isLoading || loadError || hasAttemptedTemplateBootstrap || limits.length > 0) return;
    setHasAttemptedTemplateBootstrap(true);
    void applyAdminTemplate({ silentIfHasData: true, showToast: false });
  }, [applyAdminTemplate, hasAttemptedTemplateBootstrap, isLoading, limits.length, loadError]);

  const handleToggleNotificationSetting = async (nextValue: boolean) => {
    if (!tenantId) {
      toast.error("Tenant tidak ditemukan. Muat ulang halaman.");
      return;
    }

    setIsNotificationSettingLoading(true);
    try {
      const { data: existing, error: existingError } = await supabase
        .from("organization_settings")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("setting_key", ABSENCE_LIMIT_NOTIFICATIONS_SETTING_KEY)
        .maybeSingle();

      if (existingError && existingError.code !== "PGRST116") throw existingError;

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from("organization_settings")
          .update({
            setting_value: nextValue,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("organization_settings").insert({
          tenant_id: tenantId,
          setting_key: ABSENCE_LIMIT_NOTIFICATIONS_SETTING_KEY,
          setting_value: nextValue,
          description: "Aktif/nonaktifkan notifikasi otomatis batas absen ke pegawai.",
        });
        if (insertError) throw insertError;
      }

      setIsNotificationSettingEnabled(nextValue);
      toast.success(
        nextValue
          ? "Notifikasi batas absen diaktifkan. Aturan aktif akan mengirim notifikasi ke pegawai terkait."
          : "Notifikasi batas absen dinonaktifkan."
      );
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.absence_limits.toggle_notification_setting", {
        tenant_id: tenantId,
        next_value: nextValue,
      });
      toast.error(appendErrorReference("Gagal menyimpan pengaturan notifikasi", errorRef));
    } finally {
      setIsNotificationSettingLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.warning_type) {
      toast.error("Jenis teguran harus diisi");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let savedRule: AbsenceLimit | null = null;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();

      if (isEditing) {
        const { data, error } = await supabase
          .from("absence_limits")
          .update({
            max_days: formData.max_days,
            warning_type: formData.warning_type,
            description: formData.description || null,
            is_active: formData.is_active,
          })
          .eq("id", formData.id)
          .select("*")
          .single();
        if (error) throw error;
        savedRule = data as AbsenceLimit;
        toast.success("Batas absen berhasil diperbarui");
      } else {
        const { data, error } = await supabase
          .from("absence_limits")
          .insert({
            tenant_id: roleData?.tenant_id,
            max_days: formData.max_days,
            warning_type: formData.warning_type,
            description: formData.description || null,
            is_active: formData.is_active,
          })
          .select("*")
          .single();
        if (error) throw error;
        savedRule = data as AbsenceLimit;
        toast.success("Batas absen berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      void fetchData();
      if (savedRule?.is_active && isNotificationSettingEnabled) {
        void notifyEmployeesByRule(savedRule);
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.absence_limits.save", {
        rule_id: formData.id || null,
        is_editing: isEditing,
      });
      toast.error(appendErrorReference("Gagal menyimpan batas absen", errorRef));
    }
  };

  const resetForm = () => {
    setFormData({
      id: "",
      max_days: 3,
      warning_type: "",
      description: "",
      is_active: true,
    });
    setIsEditing(false);
  };

  const handleEdit = (limit: AbsenceLimit) => {
    setFormData({
      id: limit.id,
      max_days: limit.max_days,
      warning_type: limit.warning_type,
      description: limit.description || "",
      is_active: !!limit.is_active,
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const toggleRuleStatus = async (limit: AbsenceLimit, nextValue: boolean) => {
    try {
      const { error } = await supabase
        .from("absence_limits")
        .update({
          is_active: nextValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", limit.id);

      if (error) throw error;
      setLimits((prev) => prev.map((row) => (row.id === limit.id ? { ...row, is_active: nextValue } : row)));
      toast.success(`Aturan ${nextValue ? "diaktifkan" : "dinonaktifkan"}.`);
      if (nextValue && isNotificationSettingEnabled) {
        void notifyEmployeesByRule({ ...limit, is_active: true });
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.absence_limits.toggle_status", {
        rule_id: limit.id,
        next_value: nextValue,
      });
      toast.error(appendErrorReference("Gagal mengubah status aturan", errorRef));
    }
  };

  const notifyEmployeesByRule = async (limit: AbsenceLimit) => {
    if (!limit.is_active) {
      toast.error("Aturan ini nonaktif. Aktifkan terlebih dahulu.");
      return;
    }
    if (!isNotificationSettingEnabled) {
      toast.error("Notifikasi batas absen sedang dinonaktifkan. Aktifkan toggle notifikasi terlebih dahulu.");
      return;
    }

    setSendingRuleId(limit.id);
    try {
      const tenantId = await getTenantId();
      if (!tenantId) {
        toast.error("Tenant tidak ditemukan.");
        return;
      }

      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("id, user_id, name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .not("user_id", "is", null);
      if (employeesError) throw employeesError;

      if (!employees || employees.length === 0) {
        toast.info("Tidak ada pegawai aktif yang bisa dinotifikasi.");
        return;
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const period = `${year}-${String(month).padStart(2, "0")}`;
      const startDate = `${period}-01`;
      const endDate = now.toISOString().split("T")[0];
      const employeeIds = employees.map((emp) => emp.id);

      const { data: absentRows, error: absentError } = await supabase
        .from("attendance_records_partitioned")
        .select("employee_id, date, status")
        .in("employee_id", employeeIds)
        .gte("date", startDate)
        .lte("date", endDate)
        .eq("status", "tidak_hadir");
      if (absentError) throw absentError;

      const absenceCount = new Map<string, number>();
      for (const row of absentRows || []) {
        const current = absenceCount.get(row.employee_id) || 0;
        absenceCount.set(row.employee_id, current + 1);
      }

      const candidateEmployees = employees.filter((emp) => (absenceCount.get(emp.id) || 0) >= limit.max_days);
      if (candidateEmployees.length === 0) {
        toast.info(`Belum ada pegawai mencapai batas ${limit.max_days} hari tidak hadir.`);
        return;
      }

      const targetUserIds = candidateEmployees.map((emp) => emp.user_id).filter(Boolean) as string[];
      const { data: existingNotifs, error: notifError } = await supabase
        .from("notifications")
        .select("user_id")
        .in("user_id", targetUserIds)
        .eq("type", "warning")
        .contains("metadata", {
          absence_limit_rule_id: limit.id,
          period,
        });
      if (notifError) throw notifError;

      const existingUserSet = new Set((existingNotifs || []).map((n) => n.user_id));
      const inserts = candidateEmployees
        .filter((emp) => !!emp.user_id && !existingUserSet.has(emp.user_id as string))
        .map((emp) => {
          const days = absenceCount.get(emp.id) || 0;
          return {
            user_id: emp.user_id as string,
            title: "Peringatan Batas Absen",
            message: `Anda tercatat tidak hadir ${days} hari pada periode ${period}. Tindakan: ${limit.warning_type}.`,
            type: "warning",
            metadata: {
              source: "absence_limits",
              absence_limit_rule_id: limit.id,
              period,
              absent_days: days,
              warning_type: limit.warning_type,
            },
          };
        });

      if (inserts.length > 0) {
        const { error: insertError } = await supabase.from("notifications").insert(inserts);
        if (insertError) throw insertError;
      }

      toast.success(`Notifikasi terkirim: ${inserts.length} pegawai (aturan: ${limit.warning_type}).`);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.absence_limits.notify_rule", {
        rule_id: limit.id,
        tenant_id: limit.tenant_id,
      });
      toast.error(appendErrorReference("Gagal mengirim notifikasi aturan", errorRef));
    } finally {
      setSendingRuleId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus batas absen ini?")) return;

    try {
      const { error } = await supabase.from("absence_limits").delete().eq("id", id);
      if (error) throw error;
      toast.success("Batas absen berhasil dihapus");
      fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.absence_limits.delete", { rule_id: id });
      toast.error(appendErrorReference("Gagal menghapus batas absen", errorRef));
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setCurrentPage(1);
  };

  const filteredLimits = limits.filter((limit) => {
    return limit.warning_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      limit.description?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.ceil(filteredLimits.length / itemsPerPage);
  const paginatedLimits = filteredLimits.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getWarningBadgeColor = (type: string): BadgeVariant => {
    if (type.includes("Lisan")) return "secondary";
    if (type.includes("Tertulis") && !type.includes("Pemotongan")) return "outline";
    if (type.includes("Pemotongan")) return "default";
    if (type.includes("Penurunan") || type.includes("Pembebasan")) return "destructive";
    return "default";
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6" />
              Data Batas Absen
            </h1>
            <p className="text-muted-foreground">Kelola batas absen dan jenis teguran</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={isApplyingTemplate}
              onClick={() => {
                setHasAttemptedTemplateBootstrap(true);
                void applyAdminTemplate({ silentIfHasData: false, showToast: true });
              }}
            >
              {isApplyingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Terapkan Template Admin
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" /> Tambah Batas
                </Button>
              </DialogTrigger>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Batas Absen" : "Tambah Batas Absen"}</DialogTitle>
                <DialogDescription>
                  {isEditing ? "Perbarui data batas absen" : "Tambahkan batas absen baru"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Maksimal Hari Tidak Hadir</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.max_days}
                    onChange={(e) => setFormData({ ...formData, max_days: parseInt(e.target.value) || 1 })}
                    placeholder="Contoh: 3"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Jenis Teguran</Label>
                  <Input
                    value={formData.warning_type}
                    onChange={(e) => setFormData({ ...formData, warning_type: e.target.value })}
                    placeholder="Contoh: Teguran Lisan"
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <Label>Aktifkan Aturan</Label>
                    <p className="text-xs text-muted-foreground">Hanya aturan aktif yang dipakai untuk notifikasi.</p>
                  </div>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Keterangan (opsional)</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Contoh: Teguran lisan untuk ketidakhadiran 3 hari"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                <Button onClick={handleSubmit}>{isEditing ? "Simpan" : "Tambah"}</Button>
              </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Pengaturan Notifikasi Batas Absen</CardTitle>
            <CardDescription>
              Aktifkan/ nonaktifkan pengiriman notifikasi ke pegawai berdasarkan aturan batas absen.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Notifikasi ke pegawai bersangkutan</p>
              <p className="text-xs text-muted-foreground">
                Jika aktif, aturan batas absen yang aktif akan mengirim notifikasi otomatis ke pegawai yang melampaui batas.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={isNotificationSettingEnabled}
                disabled={isNotificationSettingLoading}
                onCheckedChange={(checked) => void handleToggleNotificationSetting(checked)}
              />
              <Badge variant={isNotificationSettingEnabled ? "default" : "secondary"}>
                {isNotificationSettingEnabled ? "Enable" : "Disable"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Batas Absen</CardTitle>
            <CardDescription>Semua aturan batas absen dan teguran yang berlaku</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari jenis teguran..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" size="icon" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead className="w-32">Maks. Hari</TableHead>
                  <TableHead>Jenis Teguran</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : paginatedLimits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Belum ada data batas absen
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLimits.map((limit, index) => (
                    <TableRow key={limit.id}>
                      <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                      <TableCell className="font-bold text-lg">{limit.max_days} hari</TableCell>
                      <TableCell>
                        <Badge variant={getWarningBadgeColor(limit.warning_type)}>
                          {limit.warning_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {limit.description || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!limit.is_active}
                            onCheckedChange={(checked) => void toggleRuleStatus(limit, checked)}
                          />
                          <Badge variant={limit.is_active ? "default" : "secondary"}>
                            {limit.is_active ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={
                            !limit.is_active ||
                            sendingRuleId === limit.id ||
                            !isNotificationSettingEnabled ||
                            isNotificationSettingLoading
                          }
                          onClick={() => void notifyEmployeesByRule(limit)}
                          title={
                            !isNotificationSettingEnabled
                              ? "Aktifkan toggle notifikasi terlebih dahulu"
                              : "Kirim notifikasi ke pegawai sesuai aturan ini"
                          }
                        >
                          <Bell className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(limit)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(limit.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredLimits.length)} dari {filteredLimits.length} data
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const page = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                      if (page > totalPages || page < 1) return null;
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_schedule_absence_limits" />
      </div>
    </OrganizationLayout>
  );
}
