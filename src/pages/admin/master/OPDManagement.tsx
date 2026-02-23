import { useState, useEffect, useCallback } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, FolderTree } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { buildOpdCodeFromName, normalizeOpdCode } from "@/lib/opdCode";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type OPD = Tables<"opd">;
const ADMIN_OPD_READ_TIMEOUT_MS = 12000;
const ADMIN_OPD_WRITE_TIMEOUT_MS = 15000;
const ADMIN_OPD_MAX_RETRIES = 2;

export default function OPDManagement() {
  const confirmDialog = useConfirmDialog();
  const PAGE_SIZE = 20;
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOpd, setEditingOpd] = useState<OPD | null>(null);
  const [formData, setFormData] = useState({ code: "", name: "" });
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = useState(false);

  const fetchOPD = useCallback(async () => {
    setLoadError(null);
    try {
      setIsLoading(true);
      setIsRetrying(false);
      let query = supabase
        .from("opd")
        .select("*", { count: "exact" })
        .order("name")
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

      if (searchTerm.trim()) {
        const escaped = searchTerm.trim().replace(/[%_]/g, "\\$&");
        query = query.or(`name.ilike.%${escaped}%,code.ilike.%${escaped}%`);
      }

      const { data, error, count } = await withExponentialBackoff(
        () =>
          withTimeout(
            query,
            ADMIN_OPD_READ_TIMEOUT_MS,
            "Permintaan data OPD admin timeout."
          ),
        {
          maxRetries: ADMIN_OPD_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setOpdList(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      const errorRef = reportError(error, "admin.master.opd.fetch", {
        page: currentPage,
        search: searchTerm.trim() || null,
      });
      const message = appendErrorReference("Gagal memuat data OPD", errorRef);
      toast.error(message);
      setLoadError(message);
      setOpdList([]);
      setTotalCount(0);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    void fetchOPD();
  }, [fetchOPD]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadError(null);

    const normalizedName = formData.name.trim();
    const generatedCode = buildOpdCodeFromName(normalizedName);
    const normalizedCode = normalizeOpdCode(formData.code || generatedCode);

    if (!normalizedName) {
      toast.error("Nama OPD wajib diisi terlebih dahulu");
      return;
    }

    if (!normalizedCode) {
      toast.error("Kode/Singkatan OPD wajib diisi");
      return;
    }

    try {
      let duplicateQuery = supabase
        .from("opd")
        .select("id")
        .ilike("code", normalizedCode)
        .limit(1);
      if (editingOpd) {
        duplicateQuery = duplicateQuery.neq("id", editingOpd.id);
      }
      const { data: duplicateCode, error: duplicateError } = await withTimeout(
        duplicateQuery,
        ADMIN_OPD_WRITE_TIMEOUT_MS,
        "Cek duplikasi OPD timeout."
      );
      if (duplicateError) throw duplicateError;
      if (duplicateCode && duplicateCode.length > 0) {
        toast.error(`Kode/Singkatan OPD "${normalizedCode}" sudah digunakan`);
        return;
      }

      if (editingOpd) {
        const { error } = await withTimeout(
          supabase
            .from("opd")
            .update({ code: normalizedCode, name: normalizedName })
            .eq("id", editingOpd.id),
          ADMIN_OPD_WRITE_TIMEOUT_MS,
          "Update OPD admin timeout."
        );

        if (error) throw error;
        toast.success("OPD berhasil diperbarui");
      } else {
        // Get current user's tenant_id
        const { data: { user } } = await withTimeout(
          supabase.auth.getUser(),
          ADMIN_OPD_WRITE_TIMEOUT_MS,
          "Permintaan user auth timeout."
        );
        if (!user) throw new Error("User not authenticated");

        const { data: employee, error: employeeError } = await withTimeout(
          supabase
            .from("employees")
            .select("tenant_id")
            .eq("user_id", user.id)
            .single(),
          ADMIN_OPD_WRITE_TIMEOUT_MS,
          "Permintaan tenant employee timeout."
        );
        if (employeeError) throw employeeError;

        if (!employee?.tenant_id) throw new Error("Tenant not found");

        const { error } = await withTimeout(
          supabase
            .from("opd")
            .insert({ 
              code: normalizedCode, 
              name: normalizedName,
              tenant_id: employee.tenant_id
            }),
          ADMIN_OPD_WRITE_TIMEOUT_MS,
          "Tambah OPD admin timeout."
        );

        if (error) throw error;
        toast.success("OPD berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      setEditingOpd(null);
      setIsCodeManuallyEdited(false);
      setFormData({ code: "", name: "" });
      void fetchOPD();
    } catch (error) {
      const errorRef = reportError(error, "admin.master.opd.save", {
        opd_id: editingOpd?.id || null,
        mode: editingOpd ? "update" : "insert",
      });
      const message = appendErrorReference("Gagal menyimpan OPD", errorRef);
      toast.error(message);
      setLoadError(message);
    }
  };

  const handleEdit = (opd: OPD) => {
    setEditingOpd(opd);
    setFormData({ code: opd.code, name: opd.name });
    setIsCodeManuallyEdited(opd.code.toUpperCase() !== buildOpdCodeFromName(opd.name));
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Hapus OPD",
        description: "Yakin ingin menghapus OPD ini?",
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }

    setLoadError(null);
    try {
      const { error } = await withTimeout(
        supabase.from("opd").delete().eq("id", id),
        ADMIN_OPD_WRITE_TIMEOUT_MS,
        "Hapus OPD admin timeout."
      );
      if (error) throw error;
      toast.success("OPD berhasil dihapus");
      void fetchOPD();
    } catch (error) {
      const errorRef = reportError(error, "admin.master.opd.delete", { opd_id: id });
      const message = appendErrorReference("Gagal menghapus OPD", errorRef);
      toast.error(message);
      setLoadError(message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const visiblePages =
    totalPages <= 5
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : currentPage <= 3
        ? [1, 2, 3, 4, 5]
        : currentPage >= totalPages - 2
          ? [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
          : [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            Mencoba ulang memuat data OPD...
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data OPD</h1>
            <p className="text-muted-foreground">
              Kelola Organisasi Perangkat Daerah
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingOpd(null); setIsCodeManuallyEdited(false); setFormData({ code: "", name: "" }); }}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah OPD
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingOpd ? "Edit OPD" : "Tambah OPD"}</DialogTitle>
                <DialogDescription>
                  {editingOpd ? "Perbarui data OPD" : "Masukkan data OPD baru"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama OPD</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => {
                        const nextName = e.target.value;
                        const prevGeneratedCode = buildOpdCodeFromName(formData.name);
                        const shouldAutoGenerate = !isCodeManuallyEdited || formData.code === prevGeneratedCode;
                        setFormData({
                          ...formData,
                          name: nextName,
                          code: shouldAutoGenerate ? buildOpdCodeFromName(nextName) : formData.code,
                        });
                      }}
                      placeholder="Contoh: Dinas Komunikasi dan Informatika"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Singkatan/Kode OPD</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => {
                        setIsCodeManuallyEdited(true);
                        setFormData({ ...formData, code: normalizeOpdCode(e.target.value) });
                      }}
                      placeholder={formData.name.trim() ? "Contoh: DPKD atau DPKDLPSA" : "Isi Nama OPD terlebih dahulu"}
                      disabled={!formData.name.trim()}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Kode otomatis dari huruf pertama tiap kata. Anda tetap bisa mengedit manual bila diperlukan.
                    </p>
                  </div>
                </div>
                <DialogFooter className={dialogActionBarClassName}>
                  <DialogActionHint>Kode OPD harus unik dan akan divalidasi saat disimpan.</DialogActionHint>
                  <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button type="submit">Simpan</Button>
                  </div>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              Daftar OPD
            </CardTitle>
            <CardDescription>
              Total {totalCount} OPD terdaftar
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadError && (
              <div className="mb-4 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
                <span>{loadError}</span>
                <Button variant="outline" size="sm" onClick={() => void fetchOPD()}>
                  Coba Lagi
                </Button>
              </div>
            )}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari OPD..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead className="w-32">Kode</TableHead>
                    <TableHead>Nama OPD</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-32 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : opdList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Tidak ada data OPD
                      </TableCell>
                    </TableRow>
                  ) : (
                    opdList.map((opd, index) => (
                      <TableRow key={opd.id}>
                        <TableCell>{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                        <TableCell className="font-medium">{opd.code}</TableCell>
                        <TableCell>{opd.name}</TableCell>
                        <TableCell>
                          <Badge variant={opd.is_active ? "default" : "secondary"}>
                            {opd.is_active ? "Aktif" : "Non-Aktif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(opd)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(opd.id)}
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
                        onClick={() => {
                          if (currentPage > 1) setCurrentPage((prev) => prev - 1);
                        }}
                        className={currentPage <= 1 ? "pointer-events-none opacity-50 cursor-pointer" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {visiblePages.map((page) => (
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
                        onClick={() => {
                          if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
                        }}
                        className={currentPage >= totalPages ? "pointer-events-none opacity-50 cursor-pointer" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
