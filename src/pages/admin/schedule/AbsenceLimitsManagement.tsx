import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, AlertTriangle, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { supabase } from "@/integrations/supabase/client";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  ABSENCE_LIMIT_TEMPLATE_SETTING_KEY,
  DEFAULT_ABSENCE_LIMIT_TEMPLATE,
  normalizeAbsenceLimitTemplate,
  type AbsenceLimitTemplateItem,
} from "@/lib/absenceLimitTemplates";

const ITEMS_PER_PAGE = 10;

export default function AbsenceLimitsManagement({ embedded = false }: { embedded?: boolean }) {
  const confirmDialog = useConfirmDialog();
  const [limits, setLimits] = useState<AbsenceLimitTemplateItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLimit, setEditingLimit] = useState<AbsenceLimitTemplateItem | null>(null);
  const [formData, setFormData] = useState({
    max_days: "",
    description: "",
    warning_type: "",
    is_active: true,
  });

  const fetchTemplate = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", ABSENCE_LIMIT_TEMPLATE_SETTING_KEY)
        .maybeSingle();

      if (error) throw error;

      const normalized = normalizeAbsenceLimitTemplate(data?.value);
      setLimits(normalized);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.schedule.absence_limits_template.fetch");
      const message = appendErrorReference("Gagal memuat template batas absen", errorRef);
      setLoadError(message);
      setLimits([...DEFAULT_ABSENCE_LIMIT_TEMPLATE]);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplate();
  }, [fetchTemplate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [limits.length]);

  const saveTemplate = async (nextLimits: AbsenceLimitTemplateItem[], successMessage: string) => {
    try {
      setIsSaving(true);
      setLoadError(null);
      const payload = nextLimits.map((item) => ({
        id: item.id,
        max_days: item.max_days,
        warning_type: item.warning_type,
        description: item.description,
        is_active: item.is_active,
      }));

      const { error } = await supabase
        .from("system_settings")
        .upsert(
          {
            key: ABSENCE_LIMIT_TEMPLATE_SETTING_KEY,
            value: payload,
            description: "Template aturan batas absen default untuk tenant/member baru.",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) throw error;
      setLimits(nextLimits);
      toast.success(successMessage);
      return true;
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.schedule.absence_limits_template.save", {
        item_count: nextLimits.length,
      });
      const message = appendErrorReference("Gagal menyimpan template batas absen", errorRef);
      setLoadError(message);
      toast.error(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const maxDays = Number(formData.max_days);
    if (!Number.isFinite(maxDays) || maxDays < 1) {
      toast.error("Maksimal hari tidak hadir harus lebih dari 0.");
      return;
    }
    if (!formData.warning_type.trim()) {
      toast.error("Jenis teguran harus diisi.");
      return;
    }

    let nextLimits: AbsenceLimitTemplateItem[];
    if (editingLimit) {
      nextLimits = limits.map((item) =>
        item.id === editingLimit.id
          ? {
              ...item,
              max_days: Math.floor(maxDays),
              description: formData.description.trim(),
              warning_type: formData.warning_type.trim(),
              is_active: formData.is_active,
            }
          : item
      );
    } else {
      nextLimits = [
        ...limits,
        {
          id: `rule-${Date.now()}`,
          max_days: Math.floor(maxDays),
          description: formData.description.trim(),
          warning_type: formData.warning_type.trim(),
          is_active: formData.is_active,
        },
      ];
    }

    nextLimits = [...nextLimits].sort((a, b) => a.max_days - b.max_days);
    const ok = await saveTemplate(
      nextLimits,
      editingLimit ? "Template batas absen berhasil diperbarui." : "Template batas absen berhasil ditambahkan."
    );

    if (ok) {
      setIsDialogOpen(false);
      setEditingLimit(null);
      setFormData({ max_days: "", description: "", warning_type: "", is_active: true });
    }
  };

  const handleEdit = (limit: AbsenceLimitTemplateItem) => {
    setEditingLimit(limit);
    setFormData({
      max_days: String(limit.max_days),
      description: limit.description ?? "",
      warning_type: limit.warning_type,
      is_active: limit.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Hapus Template Batas Absen",
        description: "Yakin ingin menghapus batas absen ini dari template admin?",
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }
    const next = limits.filter((item) => item.id !== id);
    await saveTemplate(next, "Template batas absen berhasil dihapus.");
  };

  const handleToggleStatus = async (target: AbsenceLimitTemplateItem, nextValue: boolean) => {
    const next = limits.map((item) => (item.id === target.id ? { ...item, is_active: nextValue } : item));
    await saveTemplate(next, `Template aturan ${nextValue ? "diaktifkan" : "dinonaktifkan"}.`);
  };

  const getWarningBadgeColor = (type: string) => {
    switch (type) {
      case "lisan":
        return "bg-yellow-500/10 text-yellow-500";
      case "tertulis_ringan":
        return "bg-orange-500/10 text-orange-500";
      case "tertulis_sedang":
        return "bg-red-500/10 text-red-500";
      case "tertulis_berat":
        return "bg-red-700/10 text-red-700";
      case "pemberhentian":
        return "bg-destructive/10 text-destructive";
      default:
        return "";
    }
  };

  const totalPages = Math.max(1, Math.ceil(limits.length / ITEMS_PER_PAGE));
  const paginatedLimits = limits.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const pageContent = (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Template Batas Absen</h1>
            <p className="text-muted-foreground">
              Template ini otomatis dipakai untuk tenant/member baru pada menu /org/schedule/absence-limits.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void fetchTemplate()} disabled={isLoading || isSaving}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingLimit(null);
                    setFormData({ max_days: "", description: "", warning_type: "", is_active: true });
                  }}
                  disabled={isLoading || isSaving}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Batas
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingLimit ? "Edit Template Batas Absen" : "Tambah Template Batas Absen"}</DialogTitle>
                  <DialogDescription>
                    {editingLimit
                      ? "Perbarui aturan template yang akan dipakai tenant baru."
                      : "Tambahkan aturan template baru untuk tenant/member baru."}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="max_days">Maksimal Hari Tidak Hadir</Label>
                      <Input
                        id="max_days"
                        type="number"
                        min="1"
                        value={formData.max_days}
                        onChange={(e) => setFormData({ ...formData, max_days: e.target.value })}
                        placeholder="Contoh: 5"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="warning_type">Jenis Teguran</Label>
                      <Input
                        id="warning_type"
                        value={formData.warning_type}
                        onChange={(e) => setFormData({ ...formData, warning_type: e.target.value })}
                        placeholder="Contoh: tertulis_ringan"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Keterangan</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Deskripsi teguran atau sanksi"
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <Label>Aturan Aktif</Label>
                        <p className="text-xs text-muted-foreground">Aturan aktif langsung bisa dipakai tenant baru.</p>
                      </div>
                      <Button
                        type="button"
                        variant={formData.is_active ? "default" : "secondary"}
                        onClick={() => setFormData((prev) => ({ ...prev, is_active: !prev.is_active }))}
                      >
                        {formData.is_active ? "Aktif" : "Nonaktif"}
                      </Button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Simpan
                    </Button>
                  </DialogFooter>
                </form>
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
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Daftar Template Batas Absen
            </CardTitle>
            <CardDescription>
              Aturan ini menjadi default untuk organisasi baru. Organisasi juga bisa menerapkan ulang template saat data masih kosong.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead className="w-32">Maks. Hari</TableHead>
                    <TableHead>Jenis Teguran</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-40 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : paginatedLimits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Tidak ada data template batas absen
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedLimits.map((limit, index) => (
                      <TableRow key={limit.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-bold text-lg">{limit.max_days} hari</TableCell>
                        <TableCell>
                          <Badge className={getWarningBadgeColor(limit.warning_type)}>
                            {limit.warning_type.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{limit.description || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={limit.is_active ? "default" : "secondary"}>
                            {limit.is_active ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => void handleToggleStatus(limit, !limit.is_active)} disabled={isSaving}>
                              {limit.is_active ? "Disable" : "Enable"}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(limit)} disabled={isSaving}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => void handleDelete(limit.id)} disabled={isSaving}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {!isLoading && limits.length > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Sebelumnya
                </Button>
                <span className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Berikutnya
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
  if (embedded) return pageContent;
  return <SuperAdminLayout>{pageContent}</SuperAdminLayout>;
}
