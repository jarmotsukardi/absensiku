import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { toast } from "sonner";
import { Plus, Search, Edit, Trash2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { resolveOrgTenantIdWithQueryOverride } from "@/lib/orgTenantContext";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

interface WorkUnit {
  id: string;
  name: string;
  code: string | null;
  opd_id: string | null;
  institution_type: string;
  description: string | null;
  is_active: boolean;
  opd?: {
    name: string;
    code: string;
  } | null;
}

interface OPD {
  id: string;
  name: string;
  code: string;
}

const INSTITUTION_TYPES = [
  { value: "pemerintahan", label: "Pemerintahan" },
  { value: "rumah_sakit", label: "Rumah Sakit" },
  { value: "puskesmas", label: "Puskesmas" },
  { value: "sekolah", label: "Sekolah" },
];

const ITEMS_PER_PAGE = 10;
const WORK_UNITS_READ_TIMEOUT_MS = 12000;
const WORK_UNITS_WRITE_TIMEOUT_MS = 15000;
const WORK_UNITS_MAX_RETRIES = 2;

export default function OrgWorkUnitsManagement() {
  const confirmDialog = useConfirmDialog();
  const [searchParams] = useSearchParams();
  const queryTenantId = searchParams.get("tenant_id");
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<WorkUnit | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    opd_id: "",
    institution_type: "pemerintahan",
    description: "",
    is_active: true,
  });

  const resolveTenantId = useCallback(
    () => resolveOrgTenantIdWithQueryOverride(queryTenantId),
    [queryTenantId],
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setLoadError(null);
      setIsRetrying(false);
      const resolvedTenantId = await resolveTenantId();
      if (!resolvedTenantId) {
        setWorkUnits([]);
        setOpdList([]);
        setLoadError("Tenant organisasi tidak ditemukan.");
        return;
      }
      // Fetch OPD list
      const { data: opdData, error: opdError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("opd")
              .select("id, name, code")
              .eq("tenant_id", resolvedTenantId)
              .eq("is_active", true)
              .order("name"),
            WORK_UNITS_READ_TIMEOUT_MS,
            "Permintaan data OPD timeout."
          ),
        {
          maxRetries: WORK_UNITS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (opdError) throw opdError;
      setOpdList(opdData || []);

      // Fetch work units with OPD info
      const { data: workUnitsData, error: workUnitsError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("work_units")
              .select(`
                *,
                opd:opd_id (name, code)
              `)
              .eq("tenant_id", resolvedTenantId)
              .order("name"),
            WORK_UNITS_READ_TIMEOUT_MS,
            "Permintaan data satuan kerja timeout."
          ),
        {
          maxRetries: WORK_UNITS_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (workUnitsError) throw workUnitsError;
      setWorkUnits(workUnitsData || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.master.work_units.fetch_data");
      const message = appendErrorReference("Gagal memuat data satuan kerja", errorRef);
      setLoadError(message);
      toast.error(message);
      setWorkUnits([]);
      setOpdList([]);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [resolveTenantId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const resolvedTenantId = await resolveTenantId();
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan");

      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim() || null,
        opd_id: formData.opd_id || null,
        institution_type: formData.institution_type,
        description: formData.description.trim() || null,
        is_active: formData.is_active,
        tenant_id: resolvedTenantId,
      };

      if (editingUnit) {
        const { error } = await withTimeout(
          supabase
            .from("work_units")
            .update(payload)
            .eq("id", editingUnit.id)
            .eq("tenant_id", resolvedTenantId),
          WORK_UNITS_WRITE_TIMEOUT_MS,
          "Update satuan kerja timeout."
        );

        if (error) throw error;
        toast.success("Satuan kerja berhasil diperbarui");
      } else {
        const { error } = await withTimeout(
          supabase
            .from("work_units")
            .insert(payload),
          WORK_UNITS_WRITE_TIMEOUT_MS,
          "Tambah satuan kerja timeout."
        );

        if (error) throw error;
        toast.success("Satuan kerja berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      void fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.master.work_units.save", {
        editing_id: editingUnit?.id ?? null,
      });
      toast.error(appendErrorReference("Gagal menyimpan satuan kerja", errorRef));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (unit: WorkUnit) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.name,
      code: unit.code || "",
      opd_id: unit.opd_id || "",
      institution_type: unit.institution_type,
      description: unit.description || "",
      is_active: unit.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Hapus Satuan Kerja",
        description: "Apakah Anda yakin ingin menghapus satuan kerja ini?",
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }

    try {
      const resolvedTenantId = await resolveTenantId();
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan");
      const { error } = await withTimeout(
        supabase
          .from("work_units")
          .delete()
          .eq("id", id)
          .eq("tenant_id", resolvedTenantId),
        WORK_UNITS_WRITE_TIMEOUT_MS,
        "Hapus satuan kerja timeout."
      );

      if (error) throw error;
      toast.success("Satuan kerja berhasil dihapus");
      void fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.master.work_units.delete", { work_unit_id: id });
      toast.error(appendErrorReference("Gagal menghapus satuan kerja", errorRef));
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const resolvedTenantId = await resolveTenantId();
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan");
      const { error } = await withTimeout(
        supabase
          .from("work_units")
          .update({ is_active: !currentStatus })
          .eq("id", id)
          .eq("tenant_id", resolvedTenantId),
        WORK_UNITS_WRITE_TIMEOUT_MS,
        "Ubah status satuan kerja timeout."
      );

      if (error) throw error;
      toast.success("Status berhasil diperbarui");
      void fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.master.work_units.toggle_status", {
        work_unit_id: id,
        current_status: currentStatus,
      });
      toast.error(appendErrorReference("Gagal mengubah status satuan kerja", errorRef));
    }
  };

  const resetForm = () => {
    setEditingUnit(null);
    setFormData({
      name: "",
      code: "",
      opd_id: "",
      institution_type: "pemerintahan",
      description: "",
      is_active: true,
    });
  };

  const getInstitutionLabel = (value: string) => {
    return INSTITUTION_TYPES.find(t => t.value === value)?.label || value;
  };

  const filteredUnits = workUnits.filter(unit =>
    unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (unit.code?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (unit.opd?.code?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalPages = Math.ceil(filteredUnits.length / ITEMS_PER_PAGE);
  const paginatedUnits = filteredUnits.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            Mencoba ulang memuat data satuan kerja...
          </div>
        )}

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Data Satuan Kerja
          </h1>
          <p className="text-muted-foreground">Kelola satuan kerja dalam organisasi</p>
        </div>

        {queryTenantId ? (
          <div className="rounded-md border border-sky-300/40 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            Mode tindak lanjut super admin aktif. Halaman ini sedang menampilkan satuan kerja tenant yang dipilih dari panel admin.
          </div>
        ) : null}

        {loadError && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchData()}>
              Coba Lagi
            </Button>
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingUnit ? "Edit Satuan Kerja" : "Tambah Satuan Kerja"}
              </DialogTitle>
              <DialogDescription>
                {editingUnit ? "Perbarui informasi satuan kerja" : "Tambahkan satuan kerja baru"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Satuan Kerja *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Masukkan nama satuan kerja"
                    required
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Kode</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="Masukkan kode (opsional)"
                    maxLength={50}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="opd_id">OPD</Label>
                  <Select
                    value={formData.opd_id || "_none_"}
                    onValueChange={(value) => setFormData({ ...formData, opd_id: value === "_none_" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih OPD (opsional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none_">Tidak ada</SelectItem>
                      {opdList.map((opd) => (
                        <SelectItem key={opd.id} value={opd.id}>
                          {opd.code} - {opd.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="institution_type">Jenis Instansi *</Label>
                  <Select
                    value={formData.institution_type}
                    onValueChange={(value) => setFormData({ ...formData, institution_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis instansi" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSTITUTION_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Deskripsi</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Deskripsi singkat (opsional)"
                    maxLength={500}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Status Aktif</Label>
                </div>
              </div>
              <DialogFooter className={dialogActionBarClassName}>
                <DialogActionHint>Periksa OPD dan tipe institusi sebelum menyimpan satuan kerja.</DialogActionHint>
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Menyimpan..." : "Simpan"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Daftar Satuan Kerja</CardTitle>
                <CardDescription>
                  Total {filteredUnits.length} satuan kerja
                </CardDescription>
              </div>
              <div className="w-full rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm md:w-auto">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari satuan kerja..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                  />
                </div>
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah
                </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Nama Satuan Kerja</TableHead>
                    <TableHead>Kode OPD</TableHead>
                    <TableHead>Jenis Instansi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : paginatedUnits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? "Tidak ada data yang sesuai pencarian" : "Belum ada data satuan kerja"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedUnits.map((unit, index) => (
                      <TableRow key={unit.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-medium">{unit.name}</TableCell>
                        <TableCell>
                          {unit.opd ? (
                            <Badge variant="outline">{unit.opd.code}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {getInstitutionLabel(unit.institution_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={unit.is_active}
                            onCheckedChange={() => handleToggleStatus(unit.id, unit.is_active)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(unit)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(unit.id)}
                              className="text-destructive hover:text-destructive"
                            >
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

            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
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

        <PageGlossarySection preset="org_master_data" />
      </div>
    </OrganizationLayout>
  );
}
