import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Clock,
  Plus,
  Pencil,
  Trash2,
  Settings2,
  Building2,
  ToggleLeft,
  ToggleRight,
  ArrowUpDown,
} from "lucide-react";

interface WorkShift {
  id: string;
  tenant_id: string;
  work_unit_id: string | null;
  shift_name: string;
  shift_order: number;
  time_start: string;
  time_end: string;
  tolerance_minutes: number;
  is_active: boolean;
  description: string | null;
  work_unit?: { id: string; name: string } | null;
}

interface WorkUnit {
  id: string;
  name: string;
  enable_auto_shift: boolean;
  auto_shift_tolerance_minutes: number;
}

interface WorkShiftManagementProps {
  tenantId: string;
}

export default function WorkShiftManagement({ tenantId }: WorkShiftManagementProps) {
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkUnit, setSelectedWorkUnit] = useState<string>("all");
  
  // Dialog states
  const [isShiftDialogOpen, setIsShiftDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<WorkShift | null>(null);
  const [deletingShift, setDeletingShift] = useState<WorkShift | null>(null);
  const [configuringWorkUnit, setConfiguringWorkUnit] = useState<WorkUnit | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    shift_name: "",
    shift_order: 1,
    time_start: "08:00",
    time_end: "16:00",
    tolerance_minutes: 15,
    description: "",
    work_unit_id: "",
  });
  
  const [configData, setConfigData] = useState({
    enable_auto_shift: false,
    auto_shift_tolerance_minutes: 30,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch data
  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch work units
      const { data: unitsData, error: unitsError } = await supabase
        .from("work_units")
        .select("id, name, enable_auto_shift, auto_shift_tolerance_minutes")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");

      if (!unitsError && unitsData) {
        setWorkUnits(unitsData as WorkUnit[]);
      }

      // Fetch shifts
      const { data: shiftsData, error: shiftsError } = await supabase
        .from("work_shifts")
        .select("*, work_unit:work_unit_id(id, name)")
        .eq("tenant_id", tenantId)
        .order("work_unit_id")
        .order("shift_order");

      if (!shiftsError && shiftsData) {
        setShifts(shiftsData as WorkShift[]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter shifts
  const filteredShifts = useMemo(() => {
    if (selectedWorkUnit === "all") return shifts;
    if (selectedWorkUnit === "general") return shifts.filter(s => !s.work_unit_id);
    return shifts.filter(s => s.work_unit_id === selectedWorkUnit);
  }, [shifts, selectedWorkUnit]);

  // Open add dialog
  const handleAddShift = () => {
    setEditingShift(null);
    setFormData({
      shift_name: "",
      shift_order: (shifts.length + 1),
      time_start: "08:00",
      time_end: "16:00",
      tolerance_minutes: 15,
      description: "",
      work_unit_id: selectedWorkUnit !== "all" && selectedWorkUnit !== "general" ? selectedWorkUnit : "",
    });
    setIsShiftDialogOpen(true);
  };

  // Open edit dialog
  const handleEditShift = (shift: WorkShift) => {
    setEditingShift(shift);
    setFormData({
      shift_name: shift.shift_name,
      shift_order: shift.shift_order,
      time_start: shift.time_start.substring(0, 5),
      time_end: shift.time_end.substring(0, 5),
      tolerance_minutes: shift.tolerance_minutes,
      description: shift.description || "",
      work_unit_id: shift.work_unit_id || "",
    });
    setIsShiftDialogOpen(true);
  };

  // Open delete dialog
  const handleDeleteClick = (shift: WorkShift) => {
    setDeletingShift(shift);
    setIsDeleteDialogOpen(true);
  };

  // Open config dialog
  const handleConfigClick = (workUnit: WorkUnit) => {
    setConfiguringWorkUnit(workUnit);
    setConfigData({
      enable_auto_shift: workUnit.enable_auto_shift,
      auto_shift_tolerance_minutes: workUnit.auto_shift_tolerance_minutes,
    });
    setIsConfigDialogOpen(true);
  };

  // Save shift
  const handleSaveShift = async () => {
    if (!formData.shift_name.trim()) {
      toast.error("Nama shift wajib diisi");
      return;
    }

    setIsSubmitting(true);
    try {
      const shiftData = {
        tenant_id: tenantId,
        shift_name: formData.shift_name.trim(),
        shift_order: formData.shift_order,
        time_start: formData.time_start + ":00",
        time_end: formData.time_end + ":00",
        tolerance_minutes: formData.tolerance_minutes,
        description: formData.description.trim() || null,
        work_unit_id: formData.work_unit_id || null,
      };

      if (editingShift) {
        const { error } = await supabase
          .from("work_shifts")
          .update(shiftData)
          .eq("id", editingShift.id);

        if (error) throw error;
        toast.success("Shift berhasil diperbarui");
      } else {
        const { error } = await supabase
          .from("work_shifts")
          .insert(shiftData);

        if (error) throw error;
        toast.success("Shift berhasil ditambahkan");
      }

      setIsShiftDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error("Gagal menyimpan shift", { description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete shift
  const handleDeleteShift = async () => {
    if (!deletingShift) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("work_shifts")
        .delete()
        .eq("id", deletingShift.id);

      if (error) throw error;
      toast.success("Shift berhasil dihapus");
      setIsDeleteDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error("Gagal menghapus shift", { description: error.message });
    } finally {
      setIsSubmitting(false);
      setDeletingShift(null);
    }
  };

  // Save work unit config
  const handleSaveConfig = async () => {
    if (!configuringWorkUnit) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("work_units")
        .update({
          enable_auto_shift: configData.enable_auto_shift,
          auto_shift_tolerance_minutes: configData.auto_shift_tolerance_minutes,
        })
        .eq("id", configuringWorkUnit.id);

      if (error) throw error;
      toast.success("Konfigurasi Auto-Shift berhasil disimpan");
      setIsConfigDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error("Gagal menyimpan konfigurasi", { description: error.message });
    } finally {
      setIsSubmitting(false);
      setConfiguringWorkUnit(null);
    }
  };

  // Toggle shift active
  const handleToggleActive = async (shift: WorkShift) => {
    try {
      const { error } = await supabase
        .from("work_shifts")
        .update({ is_active: !shift.is_active })
        .eq("id", shift.id);

      if (error) throw error;
      toast.success(shift.is_active ? "Shift dinonaktifkan" : "Shift diaktifkan");
      fetchData();
    } catch (error: any) {
      toast.error("Gagal mengubah status shift");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6" />
            Manajemen Shift Kerja
          </h1>
          <p className="text-muted-foreground">
            Atur konfigurasi shift untuk satuan kerja dengan sistem bergilir
          </p>
        </div>
        <Button onClick={handleAddShift}>
          <Plus className="w-4 h-4 mr-2" />
          Tambah Shift
        </Button>
      </div>

      {/* Work Unit Config Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workUnits.map((unit) => (
          <Card key={unit.id} className={unit.enable_auto_shift ? "border-primary/50" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  {unit.name}
                </span>
                <Badge variant={unit.enable_auto_shift ? "default" : "secondary"}>
                  {unit.enable_auto_shift ? "Auto-Shift Aktif" : "Non-Aktif"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Toleransi: {unit.auto_shift_tolerance_minutes} menit
                </span>
                <Button variant="ghost" size="sm" onClick={() => handleConfigClick(unit)}>
                  <Settings2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-4 items-center">
        <Label>Filter Satuan Kerja:</Label>
        <Select value={selectedWorkUnit} onValueChange={setSelectedWorkUnit}>
          <SelectTrigger className="w-[250px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            <SelectItem value="general">Umum (Tanpa Satuan Kerja)</SelectItem>
            {workUnits.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Shifts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Shift</CardTitle>
          <CardDescription>
            {filteredShifts.length} shift terdaftar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">
                  <ArrowUpDown className="w-4 h-4" />
                </TableHead>
                <TableHead>Nama Shift</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead>Toleransi</TableHead>
                <TableHead>Satuan Kerja</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredShifts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Belum ada shift. Klik "Tambah Shift" untuk membuat.
                  </TableCell>
                </TableRow>
              ) : (
                filteredShifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="font-mono text-center">
                      {shift.shift_order}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{shift.shift_name}</p>
                        {shift.description && (
                          <p className="text-xs text-muted-foreground">{shift.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <Clock className="w-3 h-3 mr-1" />
                        {shift.time_start.substring(0, 5)} - {shift.time_end.substring(0, 5)}
                      </Badge>
                    </TableCell>
                    <TableCell>{shift.tolerance_minutes} menit</TableCell>
                    <TableCell>
                      {shift.work_unit?.name || (
                        <span className="text-muted-foreground">Umum</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={shift.is_active}
                        onCheckedChange={() => handleToggleActive(shift)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEditShift(shift)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(shift)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Shift Dialog */}
      <Dialog open={isShiftDialogOpen} onOpenChange={setIsShiftDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Tambah Shift Baru"}</DialogTitle>
            <DialogDescription>
              Atur detail shift kerja untuk pegawai
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Nama Shift *</Label>
                <Input
                  value={formData.shift_name}
                  onChange={(e) => setFormData({ ...formData, shift_name: e.target.value })}
                  placeholder="contoh: Shift Pagi"
                />
              </div>
              <div className="space-y-2">
                <Label>Urutan</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.shift_order}
                  onChange={(e) => setFormData({ ...formData, shift_order: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Jam Mulai</Label>
                <Input
                  type="time"
                  value={formData.time_start}
                  onChange={(e) => setFormData({ ...formData, time_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Jam Selesai</Label>
                <Input
                  type="time"
                  value={formData.time_end}
                  onChange={(e) => setFormData({ ...formData, time_end: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Toleransi Terlambat (menit)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.tolerance_minutes}
                  onChange={(e) => setFormData({ ...formData, tolerance_minutes: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Satuan Kerja</Label>
                <Select
                  value={formData.work_unit_id}
                  onValueChange={(v) => setFormData({ ...formData, work_unit_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih satuan kerja" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Umum (Semua Satuan Kerja)</SelectItem>
                    {workUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Deskripsi (opsional)</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Catatan tambahan tentang shift ini"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShiftDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSaveShift} disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Shift?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus shift "{deletingShift?.shift_name}"?
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteShift} disabled={isSubmitting}>
              {isSubmitting ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Config Dialog */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfigurasi Auto-Shift</DialogTitle>
            <DialogDescription>
              Atur fitur Auto-Shift untuk {configuringWorkUnit?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label className="text-base">Aktifkan Auto-Shift</Label>
                <p className="text-sm text-muted-foreground">
                  Sistem akan otomatis menawarkan shift berikutnya jika pegawai melewati waktu shift
                </p>
              </div>
              <Switch
                checked={configData.enable_auto_shift}
                onCheckedChange={(checked) => setConfigData({ ...configData, enable_auto_shift: checked })}
              />
            </div>
            <div className="space-y-2">
              <Label>Toleransi Waktu (menit)</Label>
              <Input
                type="number"
                min={0}
                value={configData.auto_shift_tolerance_minutes}
                onChange={(e) => setConfigData({ ...configData, auto_shift_tolerance_minutes: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">
                Waktu tunggu sebelum menampilkan popup konfirmasi shift
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSaveConfig} disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
