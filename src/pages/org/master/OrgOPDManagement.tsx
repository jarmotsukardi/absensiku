import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Pencil, Trash2, FolderTree, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { buildOpdCodeFromName, normalizeOpdCode } from "@/lib/opdCode";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

type OPD = Tables<"opd">;

const ITEMS_PER_PAGE = 10;
const OPD_READ_TIMEOUT_MS = 12000;
const OPD_WRITE_TIMEOUT_MS = 15000;
const OPD_MAX_RETRIES = 2;

export default function OrgOPDManagement() {
  const confirmDialog = useConfirmDialog();
  const [opds, setOpds] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ id: "", code: "", name: "", is_active: true });
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoadError(null);
    try {
      setIsRetrying(false);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("opd")
              .select("*")
              .order("name"),
            OPD_READ_TIMEOUT_MS,
            "Permintaan data OPD timeout."
          ),
        {
          maxRetries: OPD_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setOpds(data || []);
    } catch (error) {
      const errorRef = reportError(error, "org.opd.fetch");
      const message = appendErrorReference("Gagal memuat data OPD", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
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

    const hasDuplicateCode = opds.some((opd) =>
      opd.id !== formData.id && opd.code.toUpperCase() === normalizedCode,
    );
    if (hasDuplicateCode) {
      toast.error(`Kode/Singkatan OPD "${normalizedCode}" sudah digunakan`);
      return;
    }

    try {
      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        OPD_WRITE_TIMEOUT_MS,
        "Permintaan user auth timeout."
      );
      if (!user) return;

      const { data: roleData, error: roleError } = await withTimeout(
        supabase
          .from("user_roles")
          .select("tenant_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        OPD_WRITE_TIMEOUT_MS,
        "Permintaan tenant role timeout."
      );
      if (roleError) throw roleError;

      if (!roleData?.tenant_id) {
        toast.error("Tenant tidak ditemukan");
        return;
      }

      if (isEditing) {
        const { error } = await withTimeout(
          supabase
            .from("opd")
            .update({ code: normalizedCode, name: normalizedName, is_active: formData.is_active })
            .eq("id", formData.id)
            .eq("tenant_id", roleData.tenant_id),
          OPD_WRITE_TIMEOUT_MS,
          "Update OPD timeout."
        );
        if (error) throw error;
        toast.success("OPD berhasil diperbarui");
      } else {
        const { error } = await withTimeout(
          supabase
            .from("opd")
            .insert({ code: normalizedCode, name: normalizedName, tenant_id: roleData.tenant_id, is_active: formData.is_active }),
          OPD_WRITE_TIMEOUT_MS,
          "Tambah OPD timeout."
        );
        if (error) throw error;
        toast.success("OPD berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      setFormData({ id: "", code: "", name: "", is_active: true });
      setIsCodeManuallyEdited(false);
      setIsEditing(false);
      void fetchData();
    } catch (error) {
      const errorRef = reportError(error, "org.opd.save", { opd_id: formData.id || undefined });
      toast.error(appendErrorReference("Gagal menyimpan OPD", errorRef));
    }
  };

  const handleEdit = (opd: OPD) => {
    const generatedFromName = buildOpdCodeFromName(opd.name);
    setFormData({
      id: opd.id,
      code: opd.code,
      name: opd.name,
      is_active: opd.is_active ?? true,
    });
    setIsCodeManuallyEdited(opd.code.toUpperCase() !== generatedFromName);
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleToggleStatus = async (opd: OPD) => {
    try {
      const {
        data: { user },
      } = await withTimeout(
        supabase.auth.getUser(),
        OPD_WRITE_TIMEOUT_MS,
        "Permintaan user OPD timeout."
      );
      if (!user) {
        toast.error("Sesi tidak ditemukan");
        return;
      }
      const { data: roleData, error: roleError } = await withTimeout(
        supabase.from("user_roles").select("tenant_id").eq("user_id", user.id).maybeSingle(),
        OPD_WRITE_TIMEOUT_MS,
        "Permintaan tenant role timeout."
      );
      if (roleError) throw roleError;
      if (!roleData?.tenant_id) {
        toast.error("Tenant tidak ditemukan");
        return;
      }
      const { error } = await withTimeout(
        supabase
          .from("opd")
          .update({ is_active: !opd.is_active })
          .eq("id", opd.id)
          .eq("tenant_id", roleData.tenant_id),
        OPD_WRITE_TIMEOUT_MS,
        "Ubah status OPD timeout."
      );
      if (error) throw error;
      toast.success(`OPD berhasil ${opd.is_active ? "dinonaktifkan" : "diaktifkan"}`);
      void fetchData();
    } catch (error) {
      const errorRef = reportError(error, "org.opd.toggle_status", { opd_id: opd.id });
      toast.error(appendErrorReference("Gagal mengubah status OPD", errorRef));
    }
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

    try {
      const {
        data: { user },
      } = await withTimeout(
        supabase.auth.getUser(),
        OPD_WRITE_TIMEOUT_MS,
        "Permintaan user OPD timeout."
      );
      if (!user) {
        toast.error("Sesi tidak ditemukan");
        return;
      }
      const { data: roleData, error: roleError } = await withTimeout(
        supabase.from("user_roles").select("tenant_id").eq("user_id", user.id).maybeSingle(),
        OPD_WRITE_TIMEOUT_MS,
        "Permintaan tenant role timeout."
      );
      if (roleError) throw roleError;
      if (!roleData?.tenant_id) {
        toast.error("Tenant tidak ditemukan");
        return;
      }
      const { error } = await withTimeout(
        supabase.from("opd").delete().eq("id", id).eq("tenant_id", roleData.tenant_id),
        OPD_WRITE_TIMEOUT_MS,
        "Hapus OPD timeout."
      );
      if (error) throw error;
      toast.success("OPD berhasil dihapus");
      void fetchData();
    } catch (error) {
      const errorRef = reportError(error, "org.opd.delete", { opd_id: id });
      toast.error(appendErrorReference("Gagal menghapus OPD", errorRef));
    }
  };

  const filteredOpds = opds.filter(opd =>
    opd.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    opd.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredOpds.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedOpds = filteredOpds.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            Mencoba ulang memuat data OPD...
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FolderTree className="h-6 w-6" />
              Data OPD
            </h1>
            <p className="text-muted-foreground">Kelola Organisasi Perangkat Daerah</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setIsEditing(false); setIsCodeManuallyEdited(false); setFormData({ id: "", code: "", name: "", is_active: true }); }}>
                <Plus className="mr-2 h-4 w-4" /> Tambah OPD
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit OPD" : "Tambah OPD"}</DialogTitle>
                <DialogDescription>
                  {isEditing ? "Perbarui data OPD" : "Tambahkan OPD baru"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Nama OPD</Label>
                  <Input
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
                    placeholder="Contoh: Badan Pengelolaan Keuangan dan Aset Daerah"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Kode/Singkatan OPD</Label>
                  <Input
                    value={formData.code}
                    onChange={(e) => {
                      setIsCodeManuallyEdited(true);
                      setFormData({ ...formData, code: normalizeOpdCode(e.target.value) });
                    }}
                    placeholder={formData.name.trim() ? "Contoh: DPKD atau DPKDLPSA" : "Isi Nama OPD terlebih dahulu"}
                    disabled={!formData.name.trim()}
                  />
                  <p className="text-xs text-muted-foreground">
                    Kode otomatis dari huruf pertama tiap kata. Anda tetap bisa mengedit manual bila diperlukan.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Status Aktif</Label>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
              </div>
              <DialogFooter className={dialogActionBarClassName}>
                <DialogActionHint>Kode OPD harus unik dan akan divalidasi saat simpan.</DialogActionHint>
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                  <Button onClick={handleSubmit}>{isEditing ? "Simpan" : "Tambah"}</Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="flex flex-col gap-2 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchData()}>
                Coba Lagi
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar OPD</CardTitle>
            <CardDescription>
              Menampilkan {paginatedOpds.length} dari {filteredOpds.length} OPD
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari OPD..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama OPD</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : paginatedOpds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Belum ada data OPD
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOpds.map((opd, index) => (
                    <TableRow key={opd.id}>
                      <TableCell>{startIndex + index + 1}</TableCell>
                      <TableCell className="font-mono font-medium">{opd.code}</TableCell>
                      <TableCell>{opd.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={opd.is_active ?? true}
                            onCheckedChange={() => handleToggleStatus(opd)}
                          />
                          <Badge variant={opd.is_active ? "default" : "secondary"}>
                            {opd.is_active ? "Aktif" : "Non-Aktif"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(opd)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(opd.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Selanjutnya
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <PageGlossarySection preset="org_master_data" />
      </div>
    </OrganizationLayout>
  );
}
