import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, Search, RotateCcw, Plus, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface Position {
  id: string;
  name: string;
  is_active: boolean;
  work_unit_id: string | null;
  work_units: {
    id: string;
    name: string;
    opd: {
      id: string;
      name: string;
    } | null;
  } | null;
}

interface WorkUnit {
  id: string;
  name: string;
  opd_id: string | null;
}

interface FormData {
  name: string;
  work_unit_id: string;
  is_active: boolean;
}

const ITEMS_PER_PAGE = 15;

export default function OrgPositionsManagement() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedWorkUnit, setSelectedWorkUnit] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [deletingPosition, setDeletingPosition] = useState<Position | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    work_unit_id: "",
    is_active: true,
  });

  const fetchPositions = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      let query = supabase
        .from('positions')
        .select(`
          id, name, is_active, work_unit_id,
          work_units (id, name, opd:opd_id (id, name))
        `, { count: 'exact' });

      if (searchTerm) {
        query = query.ilike('name', `%${searchTerm}%`);
      }
      if (selectedWorkUnit !== "all") {
        query = query.eq('work_unit_id', selectedWorkUnit);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await query
        .order('name')
        .range(from, to);

      if (error) throw error;
      setPositions(data as unknown as Position[] || []);
      setTotalCount(count || 0);
    } catch (error) {
      const errorRef = reportError(error, "org.positions.fetch", {
        page: currentPage,
        search: searchTerm,
        work_unit_id: selectedWorkUnit,
      });
      const message = appendErrorReference("Gagal memuat data jabatan", errorRef);
      setLoadError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchTerm, selectedWorkUnit]);

  const fetchWorkUnits = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('work_units')
        .select('id, name, opd_id')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setWorkUnits(data || []);
    } catch (error) {
      const errorRef = reportError(error, "org.positions.fetch_work_units");
      setLoadError(appendErrorReference("Gagal memuat daftar satuan kerja", errorRef));
    }
  }, []);

  useEffect(() => {
    void fetchWorkUnits();
  }, [fetchWorkUnits]);

  useEffect(() => {
    void fetchPositions();
  }, [fetchPositions]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const handleReset = () => {
    setSearchTerm("");
    setSelectedWorkUnit("all");
    setCurrentPage(1);
  };

  const openAddDialog = () => {
    setEditingPosition(null);
    setFormData({ name: "", work_unit_id: "", is_active: true });
    setIsDialogOpen(true);
  };

  const openEditDialog = (position: Position) => {
    setEditingPosition(position);
    setFormData({
      name: position.name,
      work_unit_id: position.work_unit_id || "",
      is_active: position.is_active,
    });
    setIsDialogOpen(true);
  };

  const openDeleteDialog = (position: Position) => {
    setDeletingPosition(position);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Nama jabatan harus diisi", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingPosition) {
        // Update
        const { error } = await supabase
          .from('positions')
          .update({
            name: formData.name.trim(),
            work_unit_id: formData.work_unit_id || null,
            is_active: formData.is_active,
          })
          .eq('id', editingPosition.id);

        if (error) throw error;
        toast({ title: "Berhasil", description: "Jabatan berhasil diperbarui" });
      } else {
        // Get tenant_id from current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const { data: employee } = await supabase
          .from('employees')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single();

        if (!employee) throw new Error("Employee not found");

        // Insert
        const { error } = await supabase
          .from('positions')
          .insert({
            name: formData.name.trim(),
            work_unit_id: formData.work_unit_id || null,
            is_active: formData.is_active,
            tenant_id: employee.tenant_id,
          });

        if (error) throw error;
        toast({ title: "Berhasil", description: "Jabatan berhasil ditambahkan" });
      }

      setIsDialogOpen(false);
      void fetchPositions();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.positions.save", { position_id: editingPosition?.id || undefined });
      toast({
        title: "Error",
        description: appendErrorReference("Gagal menyimpan jabatan", errorRef),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPosition) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('positions')
        .delete()
        .eq('id', deletingPosition.id);

      if (error) throw error;
      toast({ title: "Berhasil", description: "Jabatan berhasil dihapus" });
      setIsDeleteDialogOpen(false);
      void fetchPositions();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.positions.delete", { position_id: deletingPosition.id });
      toast({
        title: "Error",
        description: appendErrorReference("Gagal menghapus jabatan", errorRef),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="h-6 w-6" />
              Data Jabatan
            </h1>
            <p className="text-muted-foreground">Kelola jabatan pegawai</p>
          </div>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Tambah Jabatan
          </Button>
        </div>

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{loadError}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Jabatan</CardTitle>
            <CardDescription>
              Total {totalCount} jabatan terdaftar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari jabatan..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10"
                />
              </div>
              <Select value={selectedWorkUnit} onValueChange={(v) => { setSelectedWorkUnit(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-full sm:w-[250px]">
                  <SelectValue placeholder="Filter Satuan Kerja" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Satuan Kerja</SelectItem>
                  {workUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>

            {/* Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Satuan Kerja</TableHead>
                    <TableHead>Jabatan</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-24 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      </TableRow>
                    ))
                  ) : positions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Tidak ada data jabatan
                      </TableCell>
                    </TableRow>
                  ) : (
                    positions.map((position, index) => (
                      <TableRow key={position.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell>{position.work_units?.opd?.name || '-'}</TableCell>
                        <TableCell>{position.work_units?.name || '-'}</TableCell>
                        <TableCell className="font-medium">{position.name}</TableCell>
                        <TableCell>
                          <Badge variant={position.is_active ? "default" : "secondary"}>
                            {position.is_active ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(position)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(position)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Selanjutnya
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPosition ? "Edit Jabatan" : "Tambah Jabatan"}</DialogTitle>
            <DialogDescription>
              {editingPosition ? "Ubah informasi jabatan" : "Masukkan informasi jabatan baru"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nama Jabatan *</Label>
              <Input
                id="name"
                placeholder="Masukkan nama jabatan"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="work_unit">Satuan Kerja</Label>
              <Select
                value={formData.work_unit_id || "_none_"}
                onValueChange={(v) => setFormData({ ...formData, work_unit_id: v === "_none_" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih satuan kerja (opsional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">Tidak ada</SelectItem>
                  {workUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Status Aktif</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Jabatan</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus jabatan "{deletingPosition?.name}"? 
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isSubmitting ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </OrganizationLayout>
  );
}
