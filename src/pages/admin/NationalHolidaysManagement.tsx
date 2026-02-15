import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { 
  Calendar, 
  Plus, 
  Pencil, 
  Trash2, 
  Loader2,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Globe,
  RefreshCw,
} from "lucide-react";

interface NationalHoliday {
  id: string;
  date: string;
  name: string;
  description: string | null;
  year: number;
  is_active: boolean;
}

interface PublicHolidayApiItem {
  holiday_date: string;
  holiday_name: string;
  is_national_holiday: boolean;
}

const ITEMS_PER_PAGE = 15;

export default function NationalHolidaysManagement() {
  const [holidays, setHolidays] = useState<NationalHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingAPI, setIsFetchingAPI] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<NationalHoliday | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    date: "",
    name: "",
    description: "",
  });

  const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - 1 + i).toString());

  const fetchHolidays = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("national_holidays")
        .select("*")
        .eq("year", parseInt(selectedYear))
        .order("date");

      if (error) throw error;
      setHolidays(data || []);
    } catch (error) {
      console.error("Error fetching holidays:", error);
      toast.error("Gagal memuat data");
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  // Fetch from external API (hari-libur-api.vercel.app)
  const fetchFromAPI = async () => {
    setIsFetchingAPI(true);
    try {
      const response = await fetch(`https://api-harilibur.vercel.app/api?year=${selectedYear}`);
      
      if (!response.ok) {
        // API tidak tersedia untuk tahun ini, gunakan import default
        toast.info(`Data API tidak tersedia untuk tahun ${selectedYear}. Menggunakan import default...`);
        await importDefaultHolidays();
        setIsFetchingAPI(false);
        return;
      }
      
      const data: unknown = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        // Data kosong, gunakan import default
        toast.info(`Data API kosong untuk tahun ${selectedYear}. Menggunakan import default...`);
        await importDefaultHolidays();
        setIsFetchingAPI(false);
        return;
      }

      // Filter hanya hari libur nasional (bukan cuti bersama)
      const nationalHolidays = (data as PublicHolidayApiItem[]).filter(
        (holiday) => holiday.is_national_holiday === true
      );
      
      if (nationalHolidays.length === 0) {
        toast.info(`Tidak ada libur nasional dari API untuk tahun ${selectedYear}. Menggunakan import default...`);
        await importDefaultHolidays();
        setIsFetchingAPI(false);
        return;
      }
      
      let insertedCount = 0;
      let skippedCount = 0;

      for (const holiday of nationalHolidays) {
        const holidayDate = holiday.holiday_date;
        const holidayName = holiday.holiday_name;
        
        // Check if already exists
        const exists = holidays.some(h => h.date === holidayDate);
        
        if (!exists) {
          const { error } = await supabase.from("national_holidays").insert({
            date: holidayDate,
            name: holidayName,
            description: holiday.is_national_holiday ? "Libur Nasional" : "Cuti Bersama",
            year: parseInt(selectedYear),
            is_active: true,
          });
          
          if (!error) insertedCount++;
        } else {
          skippedCount++;
        }
      }
      
      toast.success(`Berhasil menambahkan ${insertedCount} libur nasional. ${skippedCount} sudah ada.`);
      fetchHolidays();
    } catch (error) {
      console.error("Error fetching from API:", error);
      toast.info(`Gagal mengambil data API. Menggunakan import default untuk tahun ${selectedYear}...`);
      await importDefaultHolidays();
    } finally {
      setIsFetchingAPI(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.date || !formData.name) {
      toast.error("Tanggal dan nama harus diisi");
      return;
    }

    // Check duplicate
    const exists = holidays.some(h => 
      h.date === formData.date && 
      h.id !== editingHoliday?.id
    );
    if (exists) {
      toast.error("Tanggal libur sudah ada");
      return;
    }

    try {
      const year = new Date(formData.date).getFullYear();
      
      if (editingHoliday) {
        const { error } = await supabase
          .from("national_holidays")
          .update({
            date: formData.date,
            name: formData.name,
            description: formData.description || null,
            year,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingHoliday.id);

        if (error) throw error;
        toast.success("Hari libur berhasil diupdate");
      } else {
        const { error } = await supabase
          .from("national_holidays")
          .insert({
            date: formData.date,
            name: formData.name,
            description: formData.description || null,
            year,
          });

        if (error) throw error;
        toast.success("Hari libur berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchHolidays();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menyimpan data";
      toast.error(message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus hari libur ini?")) return;

    try {
      const { error } = await supabase
        .from("national_holidays")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Hari libur berhasil dihapus");
      fetchHolidays();
    } catch (error) {
      toast.error("Gagal menghapus data");
    }
  };

  const handleEdit = (holiday: NationalHoliday) => {
    setEditingHoliday(holiday);
    setFormData({
      date: holiday.date,
      name: holiday.name,
      description: holiday.description || "",
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({ date: "", name: "", description: "" });
    setEditingHoliday(null);
  };

  const importDefaultHolidays = async () => {
    const year = parseInt(selectedYear);
    const defaultHolidays = [
      { date: `${year}-01-01`, name: "Tahun Baru Masehi" },
      { date: `${year}-02-08`, name: "Isra Mi'raj Nabi Muhammad SAW" },
      { date: `${year}-03-29`, name: "Hari Suci Nyepi" },
      { date: `${year}-03-31`, name: "Idul Fitri 1446 H" },
      { date: `${year}-04-01`, name: "Idul Fitri 1446 H" },
      { date: `${year}-04-18`, name: "Wafat Isa Almasih" },
      { date: `${year}-05-01`, name: "Hari Buruh Internasional" },
      { date: `${year}-05-12`, name: "Hari Raya Waisak" },
      { date: `${year}-05-29`, name: "Kenaikan Isa Almasih" },
      { date: `${year}-06-01`, name: "Hari Lahir Pancasila" },
      { date: `${year}-06-07`, name: "Idul Adha 1446 H" },
      { date: `${year}-06-27`, name: "Tahun Baru Islam 1447 H" },
      { date: `${year}-08-17`, name: "Hari Kemerdekaan RI" },
      { date: `${year}-09-05`, name: "Maulid Nabi Muhammad SAW" },
      { date: `${year}-12-25`, name: "Hari Natal" },
    ];

    try {
      let insertedCount = 0;
      for (const holiday of defaultHolidays) {
        const exists = holidays.some(h => h.date === holiday.date);
        if (!exists) {
          await supabase.from("national_holidays").insert({
            ...holiday,
            year,
            is_active: true,
          });
          insertedCount++;
        }
      }
      toast.success(`${insertedCount} hari libur nasional berhasil diimport`);
      fetchHolidays();
    } catch (error) {
      toast.error("Gagal mengimport hari libur");
    }
  };

  const copyFromPreviousYear = async () => {
    const sourceYear = parseInt(selectedYear) - 1;
    const targetYear = parseInt(selectedYear);
    
    if (!confirm(`Salin semua libur nasional dari tahun ${sourceYear} ke tahun ${targetYear}?`)) return;

    try {
      const { data: sourceHolidays } = await supabase
        .from("national_holidays")
        .select("*")
        .eq("year", sourceYear);
      
      if (!sourceHolidays || sourceHolidays.length === 0) {
        toast.error(`Tidak ada data libur nasional untuk tahun ${sourceYear}`);
        return;
      }

      let copiedCount = 0;
      for (const holiday of sourceHolidays) {
        const newDate = holiday.date.replace(sourceYear.toString(), targetYear.toString());
        const exists = holidays.some(h => h.date === newDate);
        if (!exists) {
          await supabase.from("national_holidays").insert({
            date: newDate,
            name: holiday.name,
            description: holiday.description,
            year: targetYear,
            is_active: true,
          });
          copiedCount++;
        }
      }
      
      toast.success(`Berhasil menyalin ${copiedCount} libur nasional ke tahun ${targetYear}`);
      fetchHolidays();
    } catch (error) {
      console.error("Error copying holidays:", error);
      toast.error("Gagal menyalin data libur");
    }
  };

  const filteredHolidays = holidays.filter(h =>
    h.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredHolidays.length / ITEMS_PER_PAGE);
  const paginatedHolidays = filteredHolidays.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (isLoading) {
    return (
      <SuperAdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </SuperAdminLayout>
    );
  }

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6" />
              Hari Libur Nasional Indonesia
            </h1>
            <p className="text-muted-foreground">Kelola kalender hari libur nasional untuk semua organisasi</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={fetchFromAPI} disabled={isFetchingAPI}>
              {isFetchingAPI ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
              Tarik dari API
            </Button>
            <Button variant="outline" onClick={copyFromPreviousYear}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Salin Tahun Lalu
            </Button>
            <Button variant="outline" onClick={importDefaultHolidays}>
              <Download className="h-4 w-4 mr-2" />
              Import Default
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> Tambah Hari Libur</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingHoliday ? "Edit Hari Libur" : "Tambah Hari Libur"}</DialogTitle>
                  <DialogDescription>Masukkan data hari libur nasional</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Tanggal *</Label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nama Hari Libur *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Contoh: Idul Fitri 1446 H"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Keterangan</Label>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Keterangan tambahan (opsional)"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                  <Button onClick={handleSubmit}>Simpan</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row gap-4 justify-between">
              <div className="flex gap-2 items-center">
                <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="secondary">{filteredHolidays.length} hari libur</Badge>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari hari libur..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Nama Hari Libur</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedHolidays.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Belum ada hari libur untuk tahun {selectedYear}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedHolidays.map((holiday, index) => (
                    <TableRow key={holiday.id}>
                      <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {format(parseISO(holiday.date), "dd MMMM yyyy", { locale: idLocale })}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{holiday.name}</TableCell>
                      <TableCell className="text-muted-foreground">{holiday.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(holiday)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(holiday.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
