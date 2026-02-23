import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
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
  date: string;
  name: string;
}

interface NagerHolidayApiItem {
  date: string;
  localName?: string;
  name?: string;
  global?: boolean;
}

const ITEMS_PER_PAGE = 15;
const EXTERNAL_API_TIMEOUT_MS = 12000;

const fetchExternalNationalHolidays = async (year: string): Promise<{ holidays: PublicHolidayApiItem[]; sourceLabel: string }> => {
  try {
    const response = await withTimeout(
      () => fetch(`https://libur.deno.dev/api?year=${year}`),
      EXTERNAL_API_TIMEOUT_MS,
      "admin.national_holidays.fetch_external.libur_deno timeout",
    );
    if (response.ok) {
      const data: unknown = await withTimeout(
        () => response.json(),
        EXTERNAL_API_TIMEOUT_MS,
        "admin.national_holidays.parse_external.libur_deno timeout",
      );
      if (Array.isArray(data)) {
        const holidays = (data as PublicHolidayApiItem[])
          .filter((holiday) => typeof holiday?.date === "string" && typeof holiday?.name === "string");
        if (holidays.length > 0) {
          return { holidays, sourceLabel: "libur.deno.dev" };
        }
      }
    }
  } catch (error) {
    reportError(error, "admin.national_holidays.fetch_external.libur_deno", { year });
    // fallback
  }

  try {
    const response = await withTimeout(
      () => fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ID`),
      EXTERNAL_API_TIMEOUT_MS,
      "admin.national_holidays.fetch_external.nager timeout",
    );
    if (response.ok) {
      const data: unknown = await withTimeout(
        () => response.json(),
        EXTERNAL_API_TIMEOUT_MS,
        "admin.national_holidays.parse_external.nager timeout",
      );
      if (Array.isArray(data)) {
        const holidays = (data as NagerHolidayApiItem[])
          .filter((item) => typeof item?.date === "string")
          .filter((item) => item.global !== false)
          .map((item) => ({
            date: item.date,
            name: item.localName || item.name || "Libur Nasional",
          }));
        if (holidays.length > 0) {
          return { holidays, sourceLabel: "API fallback internasional" };
        }
      }
    }
  } catch (error) {
    reportError(error, "admin.national_holidays.fetch_external.nager", { year });
    // fallback
  }

  return { holidays: [], sourceLabel: "default lokal" };
};

export default function NationalHolidaysManagement() {
  const confirmDialog = useConfirmDialog();
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
      const { data, error } = await withTimeout(
        () =>
          supabase
            .from("national_holidays")
            .select("*")
            .eq("year", parseInt(selectedYear))
            .order("date"),
        10000,
        "Load national holidays timeout"
      );

      if (error) throw error;
      setHolidays(data || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.national_holidays.fetch", {
        year: selectedYear,
      });
      toast.error(appendErrorReference("Gagal memuat data", errorRef));
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    void fetchHolidays();
  }, [fetchHolidays]);

  // Fetch from external holiday API
  const fetchFromAPI = async () => {
    setIsFetchingAPI(true);
    try {
      const external = await fetchExternalNationalHolidays(selectedYear);
      const nationalHolidays = external.holidays;
      
      if (nationalHolidays.length === 0) {
        toast.info(`Data API kosong untuk tahun ${selectedYear}. Menggunakan impor default...`);
        await importDefaultHolidays();
        return;
      }
      
      let insertedCount = 0;
      let skippedCount = 0;

      for (const holiday of nationalHolidays) {
        const holidayDate = holiday.date;
        const holidayName = holiday.name;
        
        // Check if already exists
        const exists = holidays.some(h => h.date === holidayDate);
        
        if (!exists) {
          const { error } = await withTimeout(
            () =>
              supabase.from("national_holidays").insert({
                date: holidayDate,
                name: holidayName,
                description: `Libur Nasional (sumber ${external.sourceLabel})`,
                year: parseInt(selectedYear),
                is_active: true,
              }),
            10000,
            "Insert holiday from API timeout"
          );
          
          if (!error) insertedCount++;
        } else {
          skippedCount++;
        }
      }
      
      toast.success(`Sumber ${external.sourceLabel}: ${insertedCount} ditambahkan, ${skippedCount} sudah ada.`);
      await fetchHolidays();
    } catch (error) {
      const errorRef = reportError(error, "admin.national_holidays.pull", {
        year: selectedYear,
      });
      toast.info(
        appendErrorReference(
          `Gagal mengambil data API. Menggunakan impor default untuk tahun ${selectedYear}...`,
          errorRef
        )
      );
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
        const { error } = await withTimeout(
          () =>
            supabase
              .from("national_holidays")
              .update({
                date: formData.date,
                name: formData.name,
                description: formData.description || null,
                year,
                updated_at: new Date().toISOString(),
              })
              .eq("id", editingHoliday.id),
          10000,
          "Update national holiday timeout"
        );

        if (error) throw error;
        toast.success("Hari libur berhasil diupdate");
      } else {
        const { error } = await withTimeout(
          () =>
            supabase
              .from("national_holidays")
              .insert({
                date: formData.date,
                name: formData.name,
                description: formData.description || null,
                year,
              }),
          10000,
          "Insert national holiday timeout"
        );

        if (error) throw error;
        toast.success("Hari libur berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      void fetchHolidays();
    } catch (error) {
      const errorRef = reportError(error, "admin.national_holidays.save", {
        holiday_id: editingHoliday?.id ?? null,
        date: formData.date,
      });
      toast.error(appendErrorReference("Gagal menyimpan data", errorRef));
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Hapus Hari Libur",
        description: "Yakin ingin menghapus hari libur ini?",
        confirmText: "Ya, hapus",
        variant: "destructive",
      }))
    ) {
      return;
    }

    try {
      const { error } = await withTimeout(
        () =>
          supabase
            .from("national_holidays")
            .delete()
            .eq("id", id),
        10000,
        "Delete national holiday timeout"
      );

      if (error) throw error;
      toast.success("Hari libur berhasil dihapus");
      void fetchHolidays();
    } catch (error) {
      const errorRef = reportError(error, "admin.national_holidays.delete", { holiday_id: id });
      toast.error(appendErrorReference("Gagal menghapus data", errorRef));
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
          const { error } = await withTimeout(
            () =>
              supabase.from("national_holidays").insert({
                ...holiday,
                year,
                is_active: true,
              }),
            10000,
            "Insert default national holiday timeout"
          );
          if (error) throw error;
          insertedCount++;
        }
      }
      toast.success(`${insertedCount} hari libur nasional berhasil diimport`);
      void fetchHolidays();
    } catch (error) {
      const errorRef = reportError(error, "admin.national_holidays.import_default", {
        year: selectedYear,
      });
      toast.error(appendErrorReference("Gagal mengimpor hari libur", errorRef));
    }
  };

  const copyFromPreviousYear = async () => {
    const sourceYear = parseInt(selectedYear) - 1;
    const targetYear = parseInt(selectedYear);
    
    if (
      !(await confirmDialog({
        title: "Salin Libur Nasional",
        description: `Salin semua libur nasional dari tahun ${sourceYear} ke tahun ${targetYear}?`,
        confirmText: "Ya, salin",
      }))
    ) {
      return;
    }

    try {
      const { data: sourceHolidays, error: sourceError } = await withTimeout(
        () =>
          supabase
            .from("national_holidays")
            .select("*")
            .eq("year", sourceYear),
        10000,
        "Load source holidays from previous year timeout"
      );
      if (sourceError) throw sourceError;
      
      if (!sourceHolidays || sourceHolidays.length === 0) {
        toast.error(`Tidak ada data libur nasional untuk tahun ${sourceYear}`);
        return;
      }

      let copiedCount = 0;
      for (const holiday of sourceHolidays) {
        const newDate = holiday.date.replace(sourceYear.toString(), targetYear.toString());
        const exists = holidays.some(h => h.date === newDate);
        if (!exists) {
          const { error } = await withTimeout(
            () =>
              supabase.from("national_holidays").insert({
                date: newDate,
                name: holiday.name,
                description: holiday.description,
                year: targetYear,
                is_active: true,
              }),
            10000,
            "Insert copied holiday timeout"
          );
          if (error) throw error;
          copiedCount++;
        }
      }
      
      toast.success(`Berhasil menyalin ${copiedCount} libur nasional ke tahun ${targetYear}`);
      void fetchHolidays();
    } catch (error) {
      const errorRef = reportError(error, "admin.national_holidays.copy_prev_year", {
        source_year: sourceYear,
        target_year: targetYear,
      });
      toast.error(appendErrorReference("Gagal menyalin data libur", errorRef));
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
                <DialogFooter className={dialogActionBarClassName}>
                  <DialogActionHint>Perubahan hari libur akan memengaruhi perhitungan jadwal kerja nasional.</DialogActionHint>
                  <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                    <Button variant="outline" className="w-full sm:w-auto bg-white" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                    <Button className="w-full sm:w-auto" onClick={handleSubmit}>Simpan</Button>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2 items-center">
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
