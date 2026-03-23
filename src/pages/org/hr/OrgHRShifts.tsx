import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { Clock3, Plus, Pencil, Trash2, Shuffle } from "lucide-react";
import { toast } from "sonner";

type WorkUnitOption = {
  id: string;
  name: string;
  enable_auto_shift: boolean | null;
  auto_shift_tolerance_minutes: number | null;
};

type ShiftRow = {
  id?: string;
  shift_name: string;
  work_unit_id: string | null;
  shift_order: number;
  time_start: string;
  time_end: string;
  tolerance_minutes: number;
  description: string;
  is_active: boolean;
};

type ShiftDbRow = {
  id: string;
  shift_name: string;
  work_unit_id: string | null;
  shift_order: number;
  time_start: string;
  time_end: string;
  tolerance_minutes: number | null;
  description: string | null;
  is_active: boolean | null;
};

const initialFormState: ShiftRow = {
  shift_name: "",
  work_unit_id: null,
  shift_order: 1,
  time_start: "08:00",
  time_end: "17:00",
  tolerance_minutes: 15,
  description: "",
  is_active: true,
};

export default function OrgHRShifts() {
  const [workUnits, setWorkUnits] = useState<WorkUnitOption[]>([]);
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ShiftRow>(initialFormState);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/shifts");
  const confirmDialog = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const [workUnitsRes, shiftsRes] = await Promise.all([
        supabase
          .from("work_units")
          .select("id, name, enable_auto_shift, auto_shift_tolerance_minutes")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("work_shifts")
          .select("id, shift_name, work_unit_id, shift_order, time_start, time_end, tolerance_minutes, description, is_active")
          .eq("tenant_id", tenantId)
          .order("shift_order", { ascending: true })
          .order("shift_name", { ascending: true }),
      ]);

      if (workUnitsRes.error) throw workUnitsRes.error;
      if (shiftsRes.error) throw shiftsRes.error;

      setWorkUnits((workUnitsRes.data || []) as WorkUnitOption[]);
      setRows(
        ((shiftsRes.data || []) as ShiftDbRow[]).map((item) => ({
          id: item.id,
          shift_name: item.shift_name,
          work_unit_id: item.work_unit_id,
          shift_order: item.shift_order,
          time_start: item.time_start.slice(0, 5),
          time_end: item.time_end.slice(0, 5),
          tolerance_minutes: item.tolerance_minutes ?? 15,
          description: item.description || "",
          is_active: item.is_active ?? true,
        })),
      );
    } catch (error) {
      const ref = reportError(error, "org.hr.shifts.fetch");
      toast.error(appendErrorReference("Gagal memuat pola shift", ref));
      setRows([]);
      setWorkUnits([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const summary = useMemo(() => {
    const autoShiftEnabled = workUnits.filter((item) => item.enable_auto_shift).length;
    return {
      totalShifts: rows.length,
      activeShifts: rows.filter((item) => item.is_active).length,
      unitCount: workUnits.length,
      autoShiftEnabled,
    };
  }, [rows, workUnits]);

  const getWorkUnitLabel = useCallback(
    (workUnitId: string | null) => {
      if (!workUnitId) return "Global tenant";
      return workUnits.find((item) => item.id === workUnitId)?.name || "Unit tidak dikenal";
    },
    [workUnits],
  );

  const handleOpenDialog = (row?: ShiftRow) => {
    if (!access.canConfigure) {
      toast.error(`Aksi ${row?.id ? "edit" : "tambah"} shift hanya tersedia untuk admin organisasi.`);
      return;
    }
    if (row?.id) {
      setEditingId(row.id);
      setFormState(row);
    } else {
      setEditingId(null);
      setFormState(initialFormState);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!access.canConfigure) {
      toast.error("Aksi simpan shift hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!formState.shift_name.trim()) {
      toast.error("Nama shift wajib diisi.");
      return;
    }

    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const payload = {
        tenant_id: tenantId,
        shift_name: formState.shift_name.trim(),
        work_unit_id: formState.work_unit_id,
        shift_order: Number(formState.shift_order),
        time_start: `${formState.time_start}:00`,
        time_end: `${formState.time_end}:00`,
        tolerance_minutes: Number(formState.tolerance_minutes),
        description: formState.description.trim() || null,
        is_active: formState.is_active,
      };

      if (editingId) {
        const { error } = await supabase
          .from("work_shifts")
          .update(payload)
          .eq("id", editingId)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("work_shifts").insert(payload);
        if (error) throw error;
      }

      toast.success(`Pola shift berhasil ${editingId ? "diperbarui" : "ditambahkan"}.`);
      setIsDialogOpen(false);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.shifts.save");
      toast.error(appendErrorReference("Gagal menyimpan pola shift", ref));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (row: ShiftRow) => {
    if (!access.canConfigure) {
      toast.error("Aksi hapus shift hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!row.id) return;
    const confirmed = await confirmDialog({
      title: "Hapus Pola Shift",
      description: `Pola shift "${row.shift_name}" akan dihapus dari tenant ini. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { error } = await supabase
        .from("work_shifts")
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      toast.success("Pola shift berhasil dihapus.");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.shifts.delete", { shift_id: row.id });
      toast.error(appendErrorReference("Gagal menghapus pola shift", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Kebijakan HR</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Pola Shift</h1>
          <p className="text-sm text-muted-foreground">
            Kelola pola shift per unit kerja agar distribusi jam kerja dan toleransi absensi tetap konsisten.
          </p>
          <p className="text-xs text-muted-foreground">
            Kemampuan halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "admin dapat konfigurasi" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Total Pola Shift" value={summary.totalShifts} icon={Clock3} description="Semua pola shift" />
          <StatCard title="Pola Shift Aktif" value={summary.activeShifts} icon={Clock3} description="Masih dipakai tenant" />
          <StatCard title="Unit Kerja" value={summary.unitCount} icon={Shuffle} description="Unit aktif terdaftar" />
          <StatCard title="Pola Shift Otomatis Aktif" value={summary.autoShiftEnabled} icon={Shuffle} description="Unit dengan pola shift otomatis" />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Daftar Pola Shift</CardTitle>
                <CardDescription>Pola shift dapat diterapkan global tenant atau spesifik per unit kerja.</CardDescription>
              </div>
              {access.canConfigure && (
                <Button size="sm" onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Pola Shift
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada pola shift yang terdaftar.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pola Shift</TableHead>
                    <TableHead>Unit Kerja</TableHead>
                    <TableHead>Jam</TableHead>
                    <TableHead>Toleransi</TableHead>
                    <TableHead>Urutan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{row.shift_name}</div>
                          <div className="text-xs text-muted-foreground">{row.description || "-"}</div>
                        </div>
                      </TableCell>
                      <TableCell>{getWorkUnitLabel(row.work_unit_id)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.time_start} - {row.time_end}
                      </TableCell>
                      <TableCell>{row.tolerance_minutes} menit</TableCell>
                      <TableCell>{row.shift_order}</TableCell>
                      <TableCell>
                        <Badge variant={row.is_active ? "default" : "secondary"}>
                          {row.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {access.canConfigure && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => handleOpenDialog(row)} disabled={isLoadingAccess || !access.canConfigure}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void handleDelete(row)} disabled={isLoadingAccess || !access.canConfigure}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Ubah Pola Shift" : "Tambah Pola Shift"}</DialogTitle>
              <DialogDescription>Atur nama shift, unit kerja, jam mulai-akhir, dan toleransi keterlambatan shift.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="shift_name">Nama Pola Shift</Label>
                <Input
                  id="shift_name"
                  value={formState.shift_name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, shift_name: event.target.value }))}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Kerja</Label>
                <Select
                  value={formState.work_unit_id || "global"}
                  onValueChange={(value) => setFormState((prev) => ({ ...prev, work_unit_id: value === "global" ? null : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih unit kerja" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global tenant</SelectItem>
                    {workUnits.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="time_start">Jam Mulai</Label>
                  <Input
                    id="time_start"
                    type="time"
                    value={formState.time_start}
                    onChange={(event) => setFormState((prev) => ({ ...prev, time_start: event.target.value }))}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time_end">Jam Selesai</Label>
                  <Input
                    id="time_end"
                    type="time"
                    value={formState.time_end}
                    onChange={(event) => setFormState((prev) => ({ ...prev, time_end: event.target.value }))}
                    disabled={isLoading}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="shift_order">Urutan Pola Shift</Label>
                  <Input
                    id="shift_order"
                    type="number"
                    min={1}
                    value={formState.shift_order}
                    onChange={(event) => setFormState((prev) => ({ ...prev, shift_order: Math.max(1, Number.parseInt(event.target.value, 10) || 1) }))}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tolerance_minutes">Toleransi (menit)</Label>
                  <Input
                    id="tolerance_minutes"
                    type="number"
                    min={0}
                    value={formState.tolerance_minutes}
                    onChange={(event) => setFormState((prev) => ({ ...prev, tolerance_minutes: Math.max(0, Number.parseInt(event.target.value, 10) || 0) }))}
                    disabled={isLoading}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Deskripsi</Label>
                <Textarea
                  id="description"
                  value={formState.description}
                  onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                  disabled={isLoading}
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">Aktifkan Pola Shift</div>
                  <div className="text-xs text-muted-foreground">Pola shift nonaktif tetap tersimpan tetapi tidak dipakai.</div>
                </div>
                <Switch
                  checked={formState.is_active}
                  onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, is_active: checked }))}
                  disabled={isLoading}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
                Batal
              </Button>
              <Button onClick={handleSave} disabled={isLoading || !access.canConfigure}>
                {isLoading ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          <Icon className="h-4 w-4 text-sky-600" />
        </div>
      </CardContent>
    </Card>
  );
}
