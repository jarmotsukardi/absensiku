import { useState, useEffect } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";

type OPD = Tables<"opd">;

interface WorkUnit {
  id: string;
  name: string;
  opd_id: string;
  category: string;
  is_active: boolean;
  opd?: OPD;
}

const CATEGORIES = [
  { value: "pemerintahan", label: "Pemerintahan" },
  { value: "rumah_sakit", label: "Rumah Sakit" },
  { value: "puskesmas", label: "Puskesmas" },
];

export default function WorkUnitsManagement() {
  const ITEMS_PER_PAGE = 15;
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<WorkUnit | null>(null);
  const [formData, setFormData] = useState({ name: "", opd_id: "", category: "" });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      const { data: opdData, error: opdError } = await supabase
        .from("opd")
        .select("*")
        .order("name");

      if (opdError) throw opdError;
      setOpdList(opdData || []);

      // For now, work units will be stored as offices with additional metadata
      // We'll need to create a proper work_units table later
      const { data: officesData, error: officesError } = await supabase
        .from("offices")
        .select("*, opd:opd_id(*)")
        .order("name");

      if (officesError) throw officesError;
      
      // Transform offices to work units format
      const units = (officesData || []).map(office => ({
        id: office.id,
        name: office.name,
        opd_id: office.opd_id || "",
        category: "pemerintahan", // default category
        is_active: office.is_active ?? true,
        opd: office.opd as OPD | undefined,
      }));
      
      setWorkUnits(units);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Gagal memuat data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    toast.info("Fitur ini memerlukan tabel satuan kerja yang terpisah. Silakan hubungi administrator.");
    setIsDialogOpen(false);
  };

  const handleEdit = (unit: WorkUnit) => {
    setEditingUnit(unit);
    setFormData({ name: unit.name, opd_id: unit.opd_id, category: unit.category });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus satuan kerja ini?")) return;
    toast.info("Fitur hapus satuan kerja belum tersedia");
  };

  const filteredUnits = workUnits.filter(
    (unit) =>
      unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      unit.opd?.code.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredUnits.length / ITEMS_PER_PAGE));
  const paginatedUnits = filteredUnits.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getCategoryLabel = (value: string) => {
    return CATEGORIES.find(c => c.value === value)?.label || value;
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Satuan Kerja</h1>
            <p className="text-muted-foreground">
              Kelola data satuan kerja dalam organisasi
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingUnit(null); setFormData({ name: "", opd_id: "", category: "" }); }}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah Satuan Kerja
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingUnit ? "Edit Satuan Kerja" : "Tambah Satuan Kerja"}</DialogTitle>
                <DialogDescription>
                  {editingUnit ? "Perbarui data satuan kerja" : "Masukkan data satuan kerja baru"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama Satuan Kerja</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Contoh: Bidang Infrastruktur"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="opd">OPD</Label>
                    <Select
                      value={formData.opd_id}
                      onValueChange={(value) => setFormData({ ...formData, opd_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih OPD" />
                      </SelectTrigger>
                      <SelectContent>
                        {opdList.map((opd) => (
                          <SelectItem key={opd.id} value={opd.id}>
                            {opd.code} - {opd.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Kategori</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
              <Building2 className="h-5 w-5" />
              Daftar Satuan Kerja
            </CardTitle>
            <CardDescription>
              Total {filteredUnits.length} satuan kerja terdaftar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari satuan kerja..."
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
                    <TableHead>OPD</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-32 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : paginatedUnits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Tidak ada data satuan kerja
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedUnits.map((unit, index) => (
                      <TableRow key={unit.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-medium">{unit.name}</TableCell>
                        <TableCell>{unit.opd?.code || "-"}</TableCell>
                        <TableCell>{getCategoryLabel(unit.category)}</TableCell>
                        <TableCell>
                          <Badge variant={unit.is_active ? "default" : "secondary"}>
                            {unit.is_active ? "Aktif" : "Non-Aktif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(unit)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(unit.id)}
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
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Berikutnya
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
