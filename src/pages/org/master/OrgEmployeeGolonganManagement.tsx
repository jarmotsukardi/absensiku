import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, UserCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import {
  type EmployeeGolonganMasterItem,
  fetchTenantEmployeeGolongan,
  saveTenantEmployeeGolongan,
} from "@/lib/employeeGolongan";

const ITEMS_PER_PAGE = 12;

interface FormState {
  name: string;
  is_active: boolean;
}

const initialFormState: FormState = {
  name: "",
  is_active: true,
};

export default function OrgEmployeeGolonganManagement() {
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [golongan, setGolongan] = useState<EmployeeGolonganMasterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGolonganId, setEditingGolonganId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(initialFormState);

  const fetchGolongan = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      if (!tenantId) setTenantId(resolvedTenantId);
      const { golongan: masterGolongan } = await fetchTenantEmployeeGolongan(resolvedTenantId);
      setGolongan(masterGolongan);
    } catch (error) {
      const errorRef = reportError(error, "org.master.employee_golongan.fetch");
      const message = appendErrorReference("Gagal memuat master golongan pegawai", errorRef);
      setLoadError(message);
      toast.error(message);
      setGolongan([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchGolongan();
  }, [fetchGolongan]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, golongan.length]);

  const filteredGolongan = useMemo(() => {
    if (!searchTerm.trim()) return golongan;
    const keyword = searchTerm.trim().toLowerCase();
    return golongan.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [golongan, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredGolongan.length / ITEMS_PER_PAGE));
  const paginatedGolongan = filteredGolongan.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const persistGolongan = useCallback(
    async (nextGolongan: EmployeeGolonganMasterItem[], successMessage: string) => {
      setIsSubmitting(true);
      try {
        const resolvedTenantId = tenantId || (await resolveOrgTenantId());
        if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

        if (!tenantId) setTenantId(resolvedTenantId);

        const withSort = nextGolongan.map((item, index) => ({
          ...item,
          sort_order: index + 1,
        }));
        const savedGolongan = await saveTenantEmployeeGolongan(resolvedTenantId, withSort);
        setGolongan(savedGolongan);
        toast.success(successMessage);
        return true;
      } catch (error) {
        const errorRef = reportError(error, "org.master.employee_golongan.save");
        toast.error(appendErrorReference("Gagal menyimpan master golongan pegawai", errorRef));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [tenantId]
  );

  const handleOpenAddDialog = () => {
    setEditingGolonganId(null);
    setFormState(initialFormState);
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (item: EmployeeGolonganMasterItem) => {
    setEditingGolonganId(item.id);
    setFormState({
      name: item.name,
      is_active: item.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    const normalizedName = formState.name.replace(/\s+/g, " ").trim();
    if (!normalizedName) {
      toast.error("Nama golongan pegawai wajib diisi");
      return;
    }

    const duplicate = golongan.some(
      (item) => item.id !== editingGolonganId && item.name.toLowerCase() === normalizedName.toLowerCase()
    );
    if (duplicate) {
      toast.error("Nama golongan sudah ada, gunakan nama lain.");
      return;
    }

    const nextGolongan = editingGolonganId
      ? golongan.map((item) =>
          item.id === editingGolonganId
            ? { ...item, name: normalizedName, is_active: formState.is_active }
            : item
        )
      : [
          ...golongan,
          {
            id:
              typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `gol-${Date.now()}`,
            name: normalizedName,
            is_active: formState.is_active,
            sort_order: golongan.length + 1,
          },
        ];

    const success = await persistGolongan(
      nextGolongan,
      editingGolonganId ? "Golongan pegawai berhasil diperbarui" : "Golongan pegawai berhasil ditambahkan"
    );

    if (success) {
      setIsDialogOpen(false);
      setEditingGolonganId(null);
      setFormState(initialFormState);
    }
  };

  const handleDelete = async (item: EmployeeGolonganMasterItem) => {
    if (golongan.length <= 1) {
      toast.error("Minimal harus ada satu golongan pegawai.");
      return;
    }

    if (
      !(await confirmDialog({
        title: "Hapus Golongan Pegawai",
        description: `Yakin ingin menghapus golongan "${item.name}"?`,
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }

    const nextGolongan = golongan.filter((row) => row.id !== item.id);
    await persistGolongan(nextGolongan, "Golongan pegawai berhasil dihapus");
  };

  const handleToggleStatus = async (item: EmployeeGolonganMasterItem, nextValue: boolean) => {
    if (!nextValue && golongan.filter((row) => row.is_active).length <= 1 && item.is_active) {
      toast.error("Minimal harus ada satu golongan pegawai aktif.");
      return;
    }

    const nextGolongan = golongan.map((row) =>
      row.id === item.id ? { ...row, is_active: nextValue } : row
    );
    await persistGolongan(nextGolongan, "Status golongan pegawai berhasil diperbarui");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <UserCheck className="h-6 w-6" />
            Master Golongan Pegawai
          </h1>
          <p className="text-muted-foreground">
            Kelola daftar golongan pegawai yang dipakai di form data pegawai dan pengajuan perubahan profil.
          </p>
        </div>

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void fetchGolongan()}>
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Daftar Golongan Pegawai</CardTitle>
                <CardDescription>Total {filteredGolongan.length} golongan</CardDescription>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari golongan..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="pl-9"
                  />
                </div>
                {(searchTerm || currentPage !== 1) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm("");
                      setCurrentPage(1);
                    }}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                )}
                <Button onClick={handleOpenAddDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Nama Golongan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : paginatedGolongan.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Tidak ada golongan pegawai
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedGolongan.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={item.is_active ? "default" : "secondary"}>
                              {item.is_active ? "Aktif" : "Nonaktif"}
                            </Badge>
                            <Switch
                              checked={item.is_active}
                              disabled={isSubmitting}
                              onCheckedChange={(checked) => void handleToggleStatus(item, checked)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditDialog(item)}
                            title="Edit golongan"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleDelete(item)}
                            title="Hapus golongan"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
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

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingGolonganId ? "Edit Golongan Pegawai" : "Tambah Golongan Pegawai"}</DialogTitle>
              <DialogDescription>
                {editingGolonganId
                  ? "Perbarui nama atau status golongan pegawai."
                  : "Tambahkan golongan pegawai baru untuk dipakai di form pegawai."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="employee-golongan-name">Nama Golongan</Label>
                <Input
                  id="employee-golongan-name"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Contoh: III/a"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Status Aktif</p>
                  <p className="text-xs text-muted-foreground">
                    Hanya golongan aktif yang tampil sebagai pilihan di form.
                  </p>
                </div>
                <Switch
                  checked={formState.is_active}
                  onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, is_active: checked }))}
                />
              </div>
            </div>
            <DialogFooter className={dialogActionBarClassName}>
              <DialogActionHint>Perubahan langsung berlaku pada form data pegawai organisasi.</DialogActionHint>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                  Batal
                </Button>
                <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
                  {editingGolonganId ? "Simpan" : "Tambah"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PageGlossarySection preset="org_master_data" />
      </div>
    </OrganizationLayout>
  );
}
