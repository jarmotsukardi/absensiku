import { useState, useEffect } from "react";
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

export default function OrgWorkUnitsManagement() {
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch OPD list
      const { data: opdData, error: opdError } = await supabase
        .from("opd")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name");

      if (opdError) throw opdError;
      setOpdList(opdData || []);

      // Fetch work units with OPD info
      const { data: workUnitsData, error: workUnitsError } = await supabase
        .from("work_units")
        .select(`
          *,
          opd:opd_id (name, code)
        `)
        .order("name");

      if (workUnitsError) throw workUnitsError;
      setWorkUnits(workUnitsData || []);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Gagal memuat data: " + errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Get tenant_id from current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User tidak ditemukan");

      const { data: employeeData, error: empError } = await supabase
        .from("employees")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (empError) throw empError;
      if (!employeeData) throw new Error("Data pegawai tidak ditemukan");

      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim() || null,
        opd_id: formData.opd_id || null,
        institution_type: formData.institution_type,
        description: formData.description.trim() || null,
        is_active: formData.is_active,
        tenant_id: employeeData.tenant_id,
      };

      if (editingUnit) {
        const { error } = await supabase
          .from("work_units")
          .update(payload)
          .eq("id", editingUnit.id);

        if (error) throw error;
        toast.success("Satuan kerja berhasil diperbarui");
      } else {
        const { error } = await supabase
          .from("work_units")
          .insert(payload);

        if (error) throw error;
        toast.success("Satuan kerja berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Gagal menyimpan: " + errorMessage);
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
    if (!confirm("Apakah Anda yakin ingin menghapus satuan kerja ini?")) return;

    try {
      const { error } = await supabase
        .from("work_units")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Satuan kerja berhasil dihapus");
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Gagal menghapus: " + errorMessage);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("work_units")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success("Status berhasil diperbarui");
      fetchData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Gagal mengubah status: " + errorMessage);
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
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Data Satuan Kerja
          </h1>
          <p className="text-muted-foreground">Kelola satuan kerja dalam organisasi</p>
        </div>

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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Menyimpan..." : "Simpan"}
                </Button>
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
              <div className="flex flex-col sm:flex-row gap-2">
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
      </div>
    </OrganizationLayout>
  );
}
