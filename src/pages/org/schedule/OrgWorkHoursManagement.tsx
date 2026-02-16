import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Timer, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface WorkHour {
  id: string;
  tenant_id: string;
  institution_type: string;
  day_of_week: number;
  time_in: string;
  time_out: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const institutionTypes = [
  { value: "pemerintahan", label: "Pemerintahan" },
  { value: "rumah_sakit", label: "Rumah Sakit" },
  { value: "puskesmas", label: "Puskesmas" },
  { value: "sekolah", label: "Sekolah" },
];

const daysOfWeek = [
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
  { value: 7, label: "Minggu" },
];

export default function OrgWorkHoursManagement() {
  const [workHours, setWorkHours] = useState<WorkHour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    id: "",
    institution_type: "pemerintahan",
    day_of_week: 1,
    time_in: "08:00",
    time_out: "17:00",
  });

  // Filters
  const [filterInstitution, setFilterInstitution] = useState<string>("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    fetchData();
  }, []);

  const getCurrentTenantId = async (): Promise<string | null> => {
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
  };

  const fetchData = async () => {
    try {
      setLoadError(null);
      const { data, error } = await supabase
        .from("work_hours")
        .select("*")
        .order("institution_type", { ascending: true })
        .order("day_of_week", { ascending: true });

      if (error) throw error;
      setWorkHours((data as WorkHour[]) || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.work_hours.fetch_data");
      const message = appendErrorReference("Gagal memuat data jam kerja", errorRef);
      setLoadError(message);
      toast.error(message);
      setWorkHours([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.time_in || !formData.time_out) {
      toast.error("Jam masuk dan pulang harus diisi");
      return;
    }

    try {
      const tenantId = await getCurrentTenantId();
      if (!tenantId) {
        toast.error("Tenant tidak ditemukan untuk akun ini");
        return;
      }

      if (isEditing) {
        const { error } = await supabase
          .from("work_hours")
          .update({
            institution_type: formData.institution_type,
            day_of_week: formData.day_of_week,
            time_in: formData.time_in,
            time_out: formData.time_out,
          })
          .eq("id", formData.id);
        if (error) throw error;
        toast.success("Jam kerja berhasil diperbarui");
      } else {
        const { error } = await supabase
          .from("work_hours")
          .insert({
            tenant_id: tenantId,
            institution_type: formData.institution_type,
            day_of_week: formData.day_of_week,
            time_in: formData.time_in,
            time_out: formData.time_out,
            is_active: true,
          });
        if (error) {
          if (error.code === "23505") {
            toast.error("Jam kerja untuk hari ini sudah ada");
            return;
          }
          throw error;
        }
        toast.success("Jam kerja berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.work_hours.save", {
        work_hour_id: formData.id || null,
        institution_type: formData.institution_type,
        day_of_week: formData.day_of_week,
      });
      toast.error(appendErrorReference("Gagal menyimpan jam kerja", errorRef));
    }
  };

  const applyWorkDayTemplate = async (days: number[], label: string) => {
    setIsApplyingTemplate(true);
    try {
      const tenantId = await getCurrentTenantId();
      if (!tenantId) {
        toast.error("Tenant tidak ditemukan untuk akun ini");
        return;
      }

      const targetInstitution = filterInstitution === "all" ? formData.institution_type : filterInstitution;
      const { data: existingRows, error: existingError } = await supabase
        .from("work_hours")
        .select("id, day_of_week, is_active")
        .eq("tenant_id", tenantId)
        .eq("institution_type", targetInstitution);
      if (existingError) throw existingError;

      const existingMap = new Map((existingRows || []).map((row) => [row.day_of_week, row] as const));
      let affectedRows = 0;
      const selectedDays = new Set(days);

      for (const day of days) {
        const existing = existingMap.get(day);
        if (existing) {
          const { error } = await supabase
            .from("work_hours")
            .update({
              time_in: "08:00",
              time_out: "17:00",
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("work_hours")
            .insert({
              tenant_id: tenantId,
              institution_type: targetInstitution,
              day_of_week: day,
              time_in: "08:00",
              time_out: "17:00",
              is_active: true,
            });
          if (error) throw error;
        }
        affectedRows += 1;
      }

      for (const existing of existingRows || []) {
        if (selectedDays.has(existing.day_of_week) || !existing.is_active) continue;
        const { error } = await supabase
          .from("work_hours")
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      }

      toast.success(`${label} diterapkan untuk ${getInstitutionLabel(targetInstitution)} (${affectedRows} hari aktif).`);
      fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.work_hours.apply_template", {
        institution_type: filterInstitution,
        template_label: label,
      });
      toast.error(appendErrorReference("Gagal menerapkan template hari kerja", errorRef));
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const resetForm = () => {
    setFormData({
      id: "",
      institution_type: "pemerintahan",
      day_of_week: 1,
      time_in: "08:00",
      time_out: "17:00",
    });
    setIsEditing(false);
  };

  const handleEdit = (workHour: WorkHour) => {
    setFormData({
      id: workHour.id,
      institution_type: workHour.institution_type,
      day_of_week: workHour.day_of_week,
      time_in: workHour.time_in,
      time_out: workHour.time_out,
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus jam kerja ini?")) return;

    try {
      const { error } = await supabase.from("work_hours").delete().eq("id", id);
      if (error) throw error;
      toast.success("Jam kerja berhasil dihapus");
      fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.work_hours.delete", { work_hour_id: id });
      toast.error(appendErrorReference("Gagal menghapus jam kerja", errorRef));
    }
  };

  const resetFilters = () => {
    setFilterInstitution("all");
    setCurrentPage(1);
  };

  const filteredWorkHours = workHours.filter((wh) => {
    return filterInstitution === "all" || wh.institution_type === filterInstitution;
  });

  const totalPages = Math.ceil(filteredWorkHours.length / itemsPerPage);
  const paginatedWorkHours = filteredWorkHours.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getInstitutionLabel = (type: string) => {
    return institutionTypes.find(t => t.value === type)?.label || type;
  };

  const getDayLabel = (day: number) => {
    return daysOfWeek.find(d => d.value === day)?.label || day;
  };

  const formatTime = (time: string) => {
    return time.substring(0, 5);
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Timer className="h-6 w-6" />
              Data Jam Kerja
            </h1>
            <p className="text-muted-foreground">Kelola jam kerja per jenis instansi dan hari</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Jam Kerja
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Jam Kerja" : "Tambah Jam Kerja"}</DialogTitle>
                <DialogDescription>
                  {isEditing ? "Perbarui data jam kerja" : "Tambahkan jam kerja baru"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Jenis Instansi</Label>
                  <Select
                    value={formData.institution_type}
                    onValueChange={(value) => setFormData({ ...formData, institution_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis instansi" />
                    </SelectTrigger>
                    <SelectContent>
                      {institutionTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Hari Kerja</Label>
                  <Select
                    value={formData.day_of_week.toString()}
                    onValueChange={(value) => setFormData({ ...formData, day_of_week: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih hari" />
                    </SelectTrigger>
                    <SelectContent>
                      {daysOfWeek.map((day) => (
                        <SelectItem key={day.value} value={day.value.toString()}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Jam Masuk</Label>
                    <Input
                      type="time"
                      value={formData.time_in}
                      onChange={(e) => setFormData({ ...formData, time_in: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Jam Pulang</Label>
                    <Input
                      type="time"
                      value={formData.time_out}
                      onChange={(e) => setFormData({ ...formData, time_out: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                <Button onClick={handleSubmit}>{isEditing ? "Simpan" : "Tambah"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Jam Kerja</CardTitle>
            <CardDescription>Semua jam kerja per jenis instansi dan hari</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <Select value={filterInstitution} onValueChange={(v) => { setFilterInstitution(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Jenis Instansi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Instansi</SelectItem>
                  {institutionTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Button
                variant="secondary"
                disabled={isApplyingTemplate}
                onClick={() => void applyWorkDayTemplate([1, 2, 3, 4, 5], "Template Senin-Jumat")}
              >
                {isApplyingTemplate ? "Memproses..." : "Template Senin-Jumat"}
              </Button>
              <Button
                variant="secondary"
                disabled={isApplyingTemplate}
                onClick={() => void applyWorkDayTemplate([1, 2, 3, 4, 5, 6, 7], "Template Senin-Minggu")}
              >
                {isApplyingTemplate ? "Memproses..." : "Template Senin-Minggu"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Template diterapkan ke jenis instansi pada filter saat ini. Jika filter `Semua Instansi`, default ke `Pemerintahan`.
              </p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>Jenis Instansi</TableHead>
                  <TableHead>Hari Kerja</TableHead>
                  <TableHead>Jam Masuk</TableHead>
                  <TableHead>Jam Pulang</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : paginatedWorkHours.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Belum ada data jam kerja
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedWorkHours.map((wh, index) => (
                    <TableRow key={wh.id}>
                      <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getInstitutionLabel(wh.institution_type)}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{getDayLabel(wh.day_of_week)}</TableCell>
                      <TableCell>{formatTime(wh.time_in)}</TableCell>
                      <TableCell>{formatTime(wh.time_out)}</TableCell>
                      <TableCell>
                        <Badge variant={wh.is_active ? "default" : "secondary"}>
                          {wh.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(wh)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(wh.id)}>
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
                  Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredWorkHours.length)} dari {filteredWorkHours.length} data
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
      </div>
    </OrganizationLayout>
  );
}
