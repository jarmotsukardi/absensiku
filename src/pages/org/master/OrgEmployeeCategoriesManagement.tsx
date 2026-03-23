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
import { Plus, Search, Pencil, Trash2, Briefcase, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import {
  type EmployeeCategoryMasterItem,
  fetchTenantEmployeeCategories,
  saveTenantEmployeeCategories,
} from "@/lib/employeeCategories";

const ITEMS_PER_PAGE = 12;

interface FormState {
  name: string;
  is_active: boolean;
}

const initialFormState: FormState = {
  name: "",
  is_active: true,
};

export default function OrgEmployeeCategoriesManagement() {
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [categories, setCategories] = useState<EmployeeCategoryMasterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(initialFormState);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      if (!tenantId) setTenantId(resolvedTenantId);
      const { categories: masterCategories } = await fetchTenantEmployeeCategories(resolvedTenantId);
      setCategories(masterCategories);
    } catch (error) {
      const errorRef = reportError(error, "org.master.employee_categories.fetch");
      const message = appendErrorReference("Gagal memuat master kategori pegawai", errorRef);
      setLoadError(message);
      toast.error(message);
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categories.length]);

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const keyword = searchTerm.trim().toLowerCase();
    return categories.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [categories, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / ITEMS_PER_PAGE));
  const paginatedCategories = filteredCategories.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const persistCategories = useCallback(
    async (nextCategories: EmployeeCategoryMasterItem[], successMessage: string) => {
      setIsSubmitting(true);
      try {
        const resolvedTenantId = tenantId || (await resolveOrgTenantId());
        if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

        if (!tenantId) setTenantId(resolvedTenantId);

        const withSort = nextCategories.map((item, index) => ({
          ...item,
          sort_order: index + 1,
        }));
        const savedCategories = await saveTenantEmployeeCategories(resolvedTenantId, withSort);
        setCategories(savedCategories);
        toast.success(successMessage);
        return true;
      } catch (error) {
        const errorRef = reportError(error, "org.master.employee_categories.save");
        toast.error(appendErrorReference("Gagal menyimpan master kategori pegawai", errorRef));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [tenantId]
  );

  const handleOpenAddDialog = () => {
    setEditingCategoryId(null);
    setFormState(initialFormState);
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (category: EmployeeCategoryMasterItem) => {
    setEditingCategoryId(category.id);
    setFormState({
      name: category.name,
      is_active: category.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    const normalizedName = formState.name.replace(/\s+/g, " ").trim();
    if (!normalizedName) {
      toast.error("Nama kategori pegawai wajib diisi");
      return;
    }

    const duplicate = categories.some(
      (item) => item.id !== editingCategoryId && item.name.toLowerCase() === normalizedName.toLowerCase()
    );
    if (duplicate) {
      toast.error("Nama kategori sudah ada, gunakan nama lain.");
      return;
    }

    const nextCategories = editingCategoryId
      ? categories.map((item) =>
          item.id === editingCategoryId
            ? { ...item, name: normalizedName, is_active: formState.is_active }
            : item
        )
      : [
          ...categories,
          {
            id:
              typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `cat-${Date.now()}`,
            name: normalizedName,
            is_active: formState.is_active,
            sort_order: categories.length + 1,
          },
        ];

    const success = await persistCategories(
      nextCategories,
      editingCategoryId ? "Kategori pegawai berhasil diperbarui" : "Kategori pegawai berhasil ditambahkan"
    );

    if (success) {
      setIsDialogOpen(false);
      setEditingCategoryId(null);
      setFormState(initialFormState);
    }
  };

  const handleDelete = async (category: EmployeeCategoryMasterItem) => {
    if (categories.length <= 1) {
      toast.error("Minimal harus ada satu kategori pegawai.");
      return;
    }

    if (
      !(await confirmDialog({
        title: "Hapus Kategori Pegawai",
        description: `Yakin ingin menghapus kategori "${category.name}"?`,
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }

    const nextCategories = categories.filter((item) => item.id !== category.id);
    await persistCategories(nextCategories, "Kategori pegawai berhasil dihapus");
  };

  const handleToggleStatus = async (category: EmployeeCategoryMasterItem, nextValue: boolean) => {
    if (!nextValue && categories.filter((item) => item.is_active).length <= 1 && category.is_active) {
      toast.error("Minimal harus ada satu kategori pegawai aktif.");
      return;
    }

    const nextCategories = categories.map((item) =>
      item.id === category.id ? { ...item, is_active: nextValue } : item
    );
    await persistCategories(nextCategories, "Status kategori pegawai berhasil diperbarui");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Briefcase className="h-6 w-6" />
            Master Kategori Pegawai
          </h1>
          <p className="text-muted-foreground">
            Kelola daftar kategori pegawai yang dipakai di form data pegawai dan pengajuan perubahan profil.
          </p>
        </div>

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void fetchCategories()}>
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
                <CardTitle>Daftar Kategori Pegawai</CardTitle>
                <CardDescription>Total {filteredCategories.length} kategori</CardDescription>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cari kategori..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="pl-9"
                  />
                </div>
                {(searchTerm || currentPage !== 1) && (
                  <Button variant="outline" onClick={() => { setSearchTerm(""); setCurrentPage(1); }}>
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
                    <TableHead>Nama Kategori</TableHead>
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
                  ) : paginatedCategories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Tidak ada kategori pegawai
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedCategories.map((category, index) => (
                      <TableRow key={category.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={category.is_active ? "default" : "secondary"}>
                              {category.is_active ? "Aktif" : "Nonaktif"}
                            </Badge>
                            <Switch
                              checked={category.is_active}
                              disabled={isSubmitting}
                              onCheckedChange={(checked) => void handleToggleStatus(category, checked)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditDialog(category)}
                            title="Edit kategori"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleDelete(category)}
                            title="Hapus kategori"
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
              <DialogTitle>{editingCategoryId ? "Edit Kategori Pegawai" : "Tambah Kategori Pegawai"}</DialogTitle>
              <DialogDescription>
                {editingCategoryId
                  ? "Perbarui nama atau status kategori pegawai."
                  : "Tambahkan kategori pegawai baru untuk dipakai di form pegawai."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="employee-category-name">Nama Kategori</Label>
                <Input
                  id="employee-category-name"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Contoh: ASN, P3K, Honorer"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Status Aktif</p>
                  <p className="text-xs text-muted-foreground">
                    Hanya kategori aktif yang tampil sebagai pilihan di form.
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
                  {editingCategoryId ? "Simpan" : "Tambah"}
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
