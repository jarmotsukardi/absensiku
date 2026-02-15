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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type OPD = Tables<"opd">;

export default function OPDManagement() {
  const PAGE_SIZE = 20;
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOpd, setEditingOpd] = useState<OPD | null>(null);
  const [formData, setFormData] = useState({ code: "", name: "" });

  const fetchOPD = useCallback(async () => {
    try {
      setIsLoading(true);
      let query = supabase
        .from("opd")
        .select("*", { count: "exact" })
        .order("name")
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

      if (searchTerm.trim()) {
        const escaped = searchTerm.trim().replace(/[%_]/g, "\\$&");
        query = query.or(`name.ilike.%${escaped}%,code.ilike.%${escaped}%`);
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setOpdList(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching OPD:", error);
      toast.error("Gagal memuat data OPD");
    } finally {
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
    try {
      if (editingOpd) {
        const { error } = await supabase
          .from("opd")
          .update({ code: formData.code, name: formData.name })
          .eq("id", editingOpd.id);

        if (error) throw error;
        toast.success("OPD berhasil diperbarui");
      } else {
        // Get current user's tenant_id
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const { data: employee } = await supabase
          .from("employees")
          .select("tenant_id")
          .eq("user_id", user.id)
          .single();

        if (!employee?.tenant_id) throw new Error("Tenant not found");

        const { error } = await supabase
          .from("opd")
          .insert({ 
            code: formData.code, 
            name: formData.name,
            tenant_id: employee.tenant_id
          });

        if (error) throw error;
        toast.success("OPD berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      setEditingOpd(null);
      setFormData({ code: "", name: "" });
      void fetchOPD();
    } catch (error) {
      console.error("Error saving OPD:", error);
      toast.error("Gagal menyimpan OPD");
    }
  };

  const handleEdit = (opd: OPD) => {
    setEditingOpd(opd);
    setFormData({ code: opd.code, name: opd.name });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus OPD ini?")) return;

    try {
      const { error } = await supabase.from("opd").delete().eq("id", id);
      if (error) throw error;
      toast.success("OPD berhasil dihapus");
      void fetchOPD();
    } catch (error) {
      console.error("Error deleting OPD:", error);
      toast.error("Gagal menghapus OPD");
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data OPD</h1>
            <p className="text-muted-foreground">
              Kelola Organisasi Perangkat Daerah
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingOpd(null); setFormData({ code: "", name: "" }); }}>
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
                    <Label htmlFor="code">Singkatan/Kode OPD</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="Contoh: DISKOMINFO"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama OPD</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Contoh: Dinas Komunikasi dan Informatika"
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Batal
                  </Button>
                  <Button type="submit">Simpan</Button>
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
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1) setCurrentPage((prev) => prev - 1);
                        }}
                        className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                      .map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(page);
                            }}
                            isActive={currentPage === page}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
                        }}
                        className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
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
