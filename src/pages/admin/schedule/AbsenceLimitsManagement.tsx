import { useState, useEffect } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface AbsenceLimit {
  id: string;
  max_days: number;
  description: string;
  warning_type: string;
  is_active: boolean;
}
const ITEMS_PER_PAGE = 10;

export default function AbsenceLimitsManagement() {
  const [limits, setLimits] = useState<AbsenceLimit[]>([
    { id: "1", max_days: 3, description: "Teguran lisan", warning_type: "lisan", is_active: true },
    { id: "2", max_days: 5, description: "Teguran tertulis ringan", warning_type: "tertulis_ringan", is_active: true },
    { id: "3", max_days: 10, description: "Teguran tertulis sedang", warning_type: "tertulis_sedang", is_active: true },
    { id: "4", max_days: 15, description: "Teguran tertulis berat", warning_type: "tertulis_berat", is_active: true },
    { id: "5", max_days: 20, description: "Pemberhentian sementara", warning_type: "pemberhentian", is_active: true },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLimit, setEditingLimit] = useState<AbsenceLimit | null>(null);
  const [formData, setFormData] = useState({
    max_days: "",
    description: "",
    warning_type: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoadError(null);
      if (editingLimit) {
        setLimits(prev => prev.map(l => 
          l.id === editingLimit.id 
            ? { ...l, max_days: parseInt(formData.max_days), description: formData.description, warning_type: formData.warning_type }
            : l
        ));
        toast.success("Batas absen berhasil diperbarui");
      } else {
        const newLimit: AbsenceLimit = {
          id: Date.now().toString(),
          max_days: parseInt(formData.max_days),
          description: formData.description,
          warning_type: formData.warning_type,
          is_active: true,
        };
        setLimits(prev => [...prev, newLimit]);
        toast.success("Batas absen berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      setEditingLimit(null);
      setFormData({ max_days: "", description: "", warning_type: "" });
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.schedule.absence_limits.save");
      const message = appendErrorReference("Gagal menyimpan batas absen", errorRef);
      setLoadError(message);
      toast.error(message);
    }
  };

  const handleEdit = (limit: AbsenceLimit) => {
    setEditingLimit(limit);
    setFormData({
      max_days: limit.max_days.toString(),
      description: limit.description,
      warning_type: limit.warning_type,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Yakin ingin menghapus batas absen ini?")) return;
    try {
      setLoadError(null);
      setLimits(prev => prev.filter(l => l.id !== id));
      toast.success("Batas absen berhasil dihapus");
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.schedule.absence_limits.delete", { limit_id: id });
      const message = appendErrorReference("Gagal menghapus batas absen", errorRef);
      setLoadError(message);
      toast.error(message);
    }
  };

  const getWarningBadgeColor = (type: string) => {
    switch (type) {
      case "lisan": return "bg-yellow-500/10 text-yellow-500";
      case "tertulis_ringan": return "bg-orange-500/10 text-orange-500";
      case "tertulis_sedang": return "bg-red-500/10 text-red-500";
      case "tertulis_berat": return "bg-red-700/10 text-red-700";
      case "pemberhentian": return "bg-destructive/10 text-destructive";
      default: return "";
    }
  };
  const totalPages = Math.max(1, Math.ceil(limits.length / ITEMS_PER_PAGE));
  const paginatedLimits = limits.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [limits.length]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Batas Absen</h1>
            <p className="text-muted-foreground">
              Kelola batas ketidakhadiran dan sanksi untuk pegawai
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { 
                setEditingLimit(null); 
                setFormData({ max_days: "", description: "", warning_type: "" }); 
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah Batas
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingLimit ? "Edit Batas Absen" : "Tambah Batas Absen"}</DialogTitle>
                <DialogDescription>
                  {editingLimit ? "Perbarui data batas absen" : "Masukkan data batas absen baru"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="max_days">Maksimal Hari Tidak Hadir</Label>
                    <Input
                      id="max_days"
                      type="number"
                      min="1"
                      value={formData.max_days}
                      onChange={(e) => setFormData({ ...formData, max_days: e.target.value })}
                      placeholder="Contoh: 5"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="warning_type">Jenis Teguran</Label>
                    <Input
                      id="warning_type"
                      value={formData.warning_type}
                      onChange={(e) => setFormData({ ...formData, warning_type: e.target.value })}
                      placeholder="Contoh: tertulis_ringan"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Keterangan</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Deskripsi teguran atau sanksi"
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
              <AlertTriangle className="h-5 w-5" />
              Daftar Batas Absen
            </CardTitle>
            <CardDescription>
              Aturan sanksi berdasarkan jumlah hari ketidakhadiran
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead className="w-32">Maks. Hari</TableHead>
                    <TableHead>Jenis Teguran</TableHead>
                    <TableHead>Keterangan</TableHead>
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
                  ) : limits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Tidak ada data batas absen
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedLimits.map((limit, index) => (
                      <TableRow key={limit.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-bold text-lg">{limit.max_days} hari</TableCell>
                        <TableCell>
                          <Badge className={getWarningBadgeColor(limit.warning_type)}>
                            {limit.warning_type.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{limit.description}</TableCell>
                        <TableCell>
                          <Badge variant={limit.is_active ? "default" : "secondary"}>
                            {limit.is_active ? "Aktif" : "Non-Aktif"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(limit)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(limit.id)}
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
            {!isLoading && limits.length > 0 && (
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
      </div>
    </SuperAdminLayout>
  );
}
