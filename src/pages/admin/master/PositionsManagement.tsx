import { useState, useEffect, useCallback } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Plus, Pencil, Trash2, Search, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type OPD = Tables<"opd">;

interface Position {
  id: string;
  name: string;
  work_unit_id: string;
  work_unit_name: string;
  is_active: boolean;
}

export default function PositionsManagement() {
  const confirmDialog = useConfirmDialog();
  const ITEMS_PER_PAGE = 15;
  const [positions, setPositions] = useState<Position[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState({ name: "", work_unit_id: "" });

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      
      const { data: opdData, error: opdError } = await supabase
        .from("opd")
        .select("*")
        .order("name");

      if (opdError) throw opdError;
      setOpdList(opdData || []);

      // Positions will need a dedicated table - for now we'll show a placeholder
      setPositions([]);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.master.positions.fetch");
      const message = appendErrorReference("Gagal memuat data", errorRef);
      setLoadError(message);
      setPositions([]);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.info("Fitur ini memerlukan tabel jabatan yang terpisah. Database akan diperbarui.");
    setIsDialogOpen(false);
  };

  const handleEdit = (position: Position) => {
    setEditingPosition(position);
    setFormData({ name: position.name, work_unit_id: position.work_unit_id });
    setIsDialogOpen(true);
  };

  const handleDelete = async (_id: string) => {
    if (
      !(await confirmDialog({
        title: "Hapus Jabatan",
        description: "Yakin ingin menghapus jabatan ini?",
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }
    toast.info("Fitur hapus jabatan belum tersedia");
  };

  const filteredPositions = positions.filter(
    (pos) =>
      pos.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pos.work_unit_name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredPositions.length / ITEMS_PER_PAGE));
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
  );
  const paginatedPositions = filteredPositions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data Jabatan</h1>
            <p className="text-muted-foreground">
              Kelola data jabatan dalam satuan kerja
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingPosition(null); setFormData({ name: "", work_unit_id: "" }); }}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah Jabatan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingPosition ? "Edit Jabatan" : "Tambah Jabatan"}</DialogTitle>
                <DialogDescription>
                  {editingPosition ? "Perbarui data jabatan" : "Masukkan data jabatan baru"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="work_unit">Satuan Kerja</Label>
                    <Select
                      value={formData.work_unit_id}
                      onValueChange={(value) => setFormData({ ...formData, work_unit_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Satuan Kerja" />
                      </SelectTrigger>
                      <SelectContent>
                        {opdList.map((opd) => (
                          <SelectItem key={opd.id} value={opd.id}>
                            {opd.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama Jabatan</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Contoh: Kepala Bidang"
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

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Daftar Jabatan
            </CardTitle>
            <CardDescription>
              Total {filteredPositions.length} jabatan terdaftar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari jabatan..."
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
                    <TableHead>Satuan Kerja</TableHead>
                    <TableHead>Nama Jabatan</TableHead>
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
                  ) : paginatedPositions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Tidak ada data jabatan. Tabel jabatan perlu dibuat di database.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPositions.map((pos, index) => (
                      <TableRow key={pos.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell>{pos.work_unit_name}</TableCell>
                        <TableCell className="font-medium">{pos.name}</TableCell>
                        <TableCell>
                          <Badge variant={pos.is_active ? "default" : "secondary"}>
                            {pos.is_active ? "Aktif" : "Non-Aktif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(pos)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(pos.id)}
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
            {!isLoading && filteredPositions.length > 0 && totalPages > 1 && (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          if (currentPage > 1) {
                            setCurrentPage((page) => page - 1);
                          }
                        }}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {pageNumbers.map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          href="#"
                          isActive={page === currentPage}
                          onClick={(event) => {
                            event.preventDefault();
                            setCurrentPage(page);
                          }}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          if (currentPage < totalPages) {
                            setCurrentPage((page) => page + 1);
                          }
                        }}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
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
