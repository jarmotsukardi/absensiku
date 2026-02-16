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
import { Plus, Pencil, Trash2, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";

type Office = Tables<"offices">;

const DAYS = [
  { value: "senin", label: "Senin" },
  { value: "selasa", label: "Selasa" },
  { value: "rabu", label: "Rabu" },
  { value: "kamis", label: "Kamis" },
  { value: "jumat", label: "Jumat" },
  { value: "sabtu", label: "Sabtu" },
  { value: "minggu", label: "Minggu" },
];

const CATEGORIES = [
  { value: "pemerintahan", label: "Pemerintahan" },
  { value: "rumah_sakit", label: "Rumah Sakit" },
  { value: "puskesmas", label: "Puskesmas" },
];

interface WorkHour {
  id: string;
  category: string;
  day: string;
  start_time: string;
  end_time: string;
}
const ITEMS_PER_PAGE = 10;

export default function WorkHoursManagement() {
  const [workHours, setWorkHours] = useState<WorkHour[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHour, setEditingHour] = useState<WorkHour | null>(null);
  const [formData, setFormData] = useState({
    category: "",
    day: "",
    start_time: "08:00",
    end_time: "17:00",
  });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Get offices to extract work hours
      const { data: officesData, error } = await supabase
        .from("offices")
        .select("*")
        .order("name");

      if (error) throw error;
      setOffices(officesData || []);

      // Transform offices to work hours format (using office settings)
      const hours: WorkHour[] = (officesData || []).map((office, index) => ({
        id: office.id,
        category: "pemerintahan",
        day: "senin-jumat",
        start_time: office.work_start_time || "08:00",
        end_time: office.work_end_time || "17:00",
      }));

      // Create default work hours structure
      const defaultHours: WorkHour[] = [
        { id: "1", category: "pemerintahan", day: "senin", start_time: "07:30", end_time: "16:00" },
        { id: "2", category: "pemerintahan", day: "selasa", start_time: "07:30", end_time: "16:00" },
        { id: "3", category: "pemerintahan", day: "rabu", start_time: "07:30", end_time: "16:00" },
        { id: "4", category: "pemerintahan", day: "kamis", start_time: "07:30", end_time: "16:00" },
        { id: "5", category: "pemerintahan", day: "jumat", start_time: "07:30", end_time: "11:30" },
        { id: "6", category: "rumah_sakit", day: "senin", start_time: "07:00", end_time: "14:00" },
        { id: "7", category: "puskesmas", day: "senin", start_time: "08:00", end_time: "14:00" },
      ];
      
      setWorkHours(defaultHours);
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
    
    if (editingHour) {
      setWorkHours(prev => prev.map(h => 
        h.id === editingHour.id 
          ? { ...h, ...formData }
          : h
      ));
      toast.success("Jam kerja berhasil diperbarui");
    } else {
      const newHour: WorkHour = {
        id: Date.now().toString(),
        ...formData,
      };
      setWorkHours(prev => [...prev, newHour]);
      toast.success("Jam kerja berhasil ditambahkan");
    }
    
    setIsDialogOpen(false);
    setEditingHour(null);
    setFormData({ category: "", day: "", start_time: "08:00", end_time: "17:00" });
  };

  const handleEdit = (hour: WorkHour) => {
    setEditingHour(hour);
    setFormData({
      category: hour.category,
      day: hour.day,
      start_time: hour.start_time,
      end_time: hour.end_time,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Yakin ingin menghapus jam kerja ini?")) return;
    setWorkHours(prev => prev.filter(h => h.id !== id));
    toast.success("Jam kerja berhasil dihapus");
  };

  const getCategoryLabel = (value: string) => CATEGORIES.find(c => c.value === value)?.label || value;
  const getDayLabel = (value: string) => DAYS.find(d => d.value === value)?.label || value;
  const totalPages = Math.max(1, Math.ceil(workHours.length / ITEMS_PER_PAGE));
  const paginatedWorkHours = workHours.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [workHours.length]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Jam Kerja</h1>
            <p className="text-muted-foreground">
              Kelola jadwal jam kerja berdasarkan kategori dan hari
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { 
                setEditingHour(null); 
                setFormData({ category: "", day: "", start_time: "08:00", end_time: "17:00" }); 
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah Jam Kerja
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingHour ? "Edit Jam Kerja" : "Tambah Jam Kerja"}</DialogTitle>
                <DialogDescription>
                  {editingHour ? "Perbarui data jam kerja" : "Masukkan data jam kerja baru"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="day">Hari</Label>
                    <Select
                      value={formData.day}
                      onValueChange={(value) => setFormData({ ...formData, day: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Hari" />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start_time">Jam Masuk</Label>
                      <Input
                        id="start_time"
                        type="time"
                        value={formData.start_time}
                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end_time">Jam Keluar</Label>
                      <Input
                        id="end_time"
                        type="time"
                        value={formData.end_time}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                        required
                      />
                    </div>
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
              <Timer className="h-5 w-5" />
              Daftar Jam Kerja
            </CardTitle>
            <CardDescription>
              Total {workHours.length} jadwal jam kerja
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Hari</TableHead>
                    <TableHead>Jam Masuk</TableHead>
                    <TableHead>Jam Keluar</TableHead>
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
                  ) : workHours.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Tidak ada data jam kerja
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedWorkHours.map((hour, index) => (
                      <TableRow key={hour.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getCategoryLabel(hour.category)}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{getDayLabel(hour.day)}</TableCell>
                        <TableCell>{hour.start_time}</TableCell>
                        <TableCell>{hour.end_time}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(hour)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(hour.id)}
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
            {!isLoading && workHours.length > 0 && (
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
