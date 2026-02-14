import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

interface AbsenceLimit {
  id: string;
  tenant_id: string;
  max_days: number;
  warning_type: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function OrgAbsenceLimitsManagement() {
  const [limits, setLimits] = useState<AbsenceLimit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    id: "",
    max_days: 3,
    warning_type: "",
    description: "",
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from("absence_limits")
        .select("*")
        .order("max_days", { ascending: true });

      if (error) throw error;
      setLimits((data as AbsenceLimit[]) || []);
    } catch (error) {
      console.error("Error fetching absence limits:", error);
      toast.error("Gagal memuat data batas absen");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.warning_type) {
      toast.error("Jenis teguran harus diisi");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();

      if (isEditing) {
        const { error } = await supabase
          .from("absence_limits")
          .update({
            max_days: formData.max_days,
            warning_type: formData.warning_type,
            description: formData.description || null,
          })
          .eq("id", formData.id);
        if (error) throw error;
        toast.success("Batas absen berhasil diperbarui");
      } else {
        const { error } = await supabase
          .from("absence_limits")
          .insert({
            tenant_id: roleData?.tenant_id,
            max_days: formData.max_days,
            warning_type: formData.warning_type,
            description: formData.description || null,
            is_active: true,
          });
        if (error) throw error;
        toast.success("Batas absen berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving absence limit:", error);
      toast.error("Gagal menyimpan batas absen");
    }
  };

  const resetForm = () => {
    setFormData({
      id: "",
      max_days: 3,
      warning_type: "",
      description: "",
    });
    setIsEditing(false);
  };

  const handleEdit = (limit: AbsenceLimit) => {
    setFormData({
      id: limit.id,
      max_days: limit.max_days,
      warning_type: limit.warning_type,
      description: limit.description || "",
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus batas absen ini?")) return;

    try {
      const { error } = await supabase.from("absence_limits").delete().eq("id", id);
      if (error) throw error;
      toast.success("Batas absen berhasil dihapus");
      fetchData();
    } catch (error) {
      console.error("Error deleting absence limit:", error);
      toast.error("Gagal menghapus batas absen");
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setCurrentPage(1);
  };

  const filteredLimits = limits.filter((limit) => {
    return limit.warning_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      limit.description?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.ceil(filteredLimits.length / itemsPerPage);
  const paginatedLimits = filteredLimits.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getWarningBadgeColor = (type: string) => {
    if (type.includes("Lisan")) return "secondary";
    if (type.includes("Tertulis") && !type.includes("Pemotongan")) return "outline";
    if (type.includes("Pemotongan")) return "default";
    if (type.includes("Penurunan") || type.includes("Pembebasan")) return "destructive";
    return "default";
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6" />
              Data Batas Absen
            </h1>
            <p className="text-muted-foreground">Kelola batas absen dan jenis teguran</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Batas
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Batas Absen" : "Tambah Batas Absen"}</DialogTitle>
                <DialogDescription>
                  {isEditing ? "Perbarui data batas absen" : "Tambahkan batas absen baru"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Maksimal Hari Tidak Hadir</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.max_days}
                    onChange={(e) => setFormData({ ...formData, max_days: parseInt(e.target.value) || 1 })}
                    placeholder="Contoh: 3"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Jenis Teguran</Label>
                  <Input
                    value={formData.warning_type}
                    onChange={(e) => setFormData({ ...formData, warning_type: e.target.value })}
                    placeholder="Contoh: Teguran Lisan"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Keterangan (opsional)</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Contoh: Teguran lisan untuk ketidakhadiran 3 hari"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                <Button onClick={handleSubmit}>{isEditing ? "Simpan" : "Tambah"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Batas Absen</CardTitle>
            <CardDescription>Semua aturan batas absen dan teguran yang berlaku</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari jenis teguran..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" size="icon" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead className="w-32">Maks. Hari</TableHead>
                  <TableHead>Jenis Teguran</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : paginatedLimits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Belum ada data batas absen
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLimits.map((limit, index) => (
                    <TableRow key={limit.id}>
                      <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                      <TableCell className="font-bold text-lg">{limit.max_days} hari</TableCell>
                      <TableCell>
                        <Badge variant={getWarningBadgeColor(limit.warning_type) as any}>
                          {limit.warning_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {limit.description || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={limit.is_active ? "default" : "secondary"}>
                          {limit.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(limit)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(limit.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredLimits.length)} dari {filteredLimits.length} data
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const page = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                      if (page > totalPages || page < 1) return null;
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
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
