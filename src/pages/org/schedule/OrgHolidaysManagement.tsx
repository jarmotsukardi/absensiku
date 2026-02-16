import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, Calendar as CalendarIcon, RotateCcw, Copy } from "lucide-react";
import { toast } from "sonner";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface WorkHoliday {
  id: string;
  tenant_id: string;
  institution_type: string;
  year: number;
  month: number;
  dates: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const institutionTypes = [
  { value: "pemerintahan", label: "Pemerintahan" },
  { value: "rumah_sakit", label: "Rumah Sakit" },
  { value: "puskesmas", label: "Puskesmas" },
  { value: "sekolah", label: "Sekolah" },
];

const months = [
  { value: 1, label: "Januari" },
  { value: 2, label: "Februari" },
  { value: 3, label: "Maret" },
  { value: 4, label: "April" },
  { value: 5, label: "Mei" },
  { value: 6, label: "Juni" },
  { value: 7, label: "Juli" },
  { value: 8, label: "Agustus" },
  { value: 9, label: "September" },
  { value: 10, label: "Oktober" },
  { value: 11, label: "November" },
  { value: 12, label: "Desember" },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

export default function OrgHolidaysManagement() {
  const [holidays, setHolidays] = useState<WorkHoliday[]>([]);
  const [workHours, setWorkHours] = useState<{ day_of_week: number; institution_type: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    id: "",
    institution_type: "pemerintahan",
    year: currentYear,
    month: 1,
    dates: "",
    description: "",
  });

  // Filters
  const [filterInstitution, setFilterInstitution] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    fetchData();
    fetchWorkHours();
  }, []);

  const fetchData = async () => {
    try {
      setLoadError(null);
      const { data, error } = await supabase
        .from("work_holidays")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: true });

      if (error) throw error;
      setHolidays((data as WorkHoliday[]) || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.holidays.fetch_data");
      const message = appendErrorReference("Gagal memuat data libur kerja", errorRef);
      setLoadError(message);
      toast.error(message);
      setHolidays([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWorkHours = async () => {
    try {
      const { data } = await supabase
        .from("work_hours")
        .select("day_of_week, institution_type")
        .eq("is_active", true);
      
      setWorkHours(data || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.holidays.fetch_work_hours");
      const message = appendErrorReference("Gagal memuat jam kerja untuk validasi kalender", errorRef);
      setLoadError(message);
      toast.error(message);
      setWorkHours([]);
    }
  };

  // Get working days for institution (days that have work hours configured)
  const getWorkingDays = (institutionType: string): number[] => {
    return workHours
      .filter(wh => wh.institution_type === institutionType)
      .map(wh => wh.day_of_week);
  };

  // Get weekend dates for the calendar
  const getWeekendDates = (): Date[] => {
    const weekends: Date[] = [];
    const workingDays = getWorkingDays(formData.institution_type);
    
    // Get all dates in the selected month
    const daysInMonth = new Date(formData.year, formData.month, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(formData.year, formData.month - 1, day);
      const dayOfWeek = date.getDay();
      // Convert to our format (1=Monday, 7=Sunday vs 0=Sunday, 6=Saturday)
      const ourDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
      
      // If this day is not in working days, it's a weekend/off day
      if (!workingDays.includes(ourDayOfWeek)) {
        weekends.push(date);
      }
    }
    
    return weekends;
  };

  // Copy holidays from previous year
  const handleCopyFromPreviousYear = async () => {
    const previousYear = parseInt(filterYear === "all" ? currentYear.toString() : filterYear) - 1;
    const targetYear = parseInt(filterYear === "all" ? currentYear.toString() : filterYear);
    const targetInstitution = filterInstitution === "all" ? "pemerintahan" : filterInstitution;
    
    if (!confirm(`Salin semua libur dari tahun ${previousYear} ke tahun ${targetYear} untuk jenis instansi ${targetInstitution}?`)) return;
    
    setIsCopying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();

      // Get holidays from previous year
      const sourceHolidays = holidays.filter(h => 
        h.year === previousYear && 
        h.institution_type === targetInstitution
      );
      
      if (sourceHolidays.length === 0) {
        toast.error(`Tidak ada data libur untuk tahun ${previousYear}`);
        return;
      }

      let copiedCount = 0;
      for (const holiday of sourceHolidays) {
        // Check if already exists
        const exists = holidays.some(h => 
          h.year === targetYear && 
          h.month === holiday.month && 
          h.institution_type === targetInstitution
        );
        
        if (!exists) {
          await supabase.from("work_holidays").insert({
            tenant_id: roleData?.tenant_id,
            institution_type: targetInstitution,
            year: targetYear,
            month: holiday.month,
            dates: holiday.dates,
            description: holiday.description,
          });
          copiedCount++;
        }
      }
      
      toast.success(`Berhasil menyalin ${copiedCount} data libur ke tahun ${targetYear}`);
      fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.holidays.copy_previous_year", {
        institution_type: targetInstitution,
        source_year: previousYear,
        target_year: targetYear,
      });
      toast.error(appendErrorReference("Gagal menyalin data libur", errorRef));
    } finally {
      setIsCopying(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.dates) {
      toast.error("Tanggal harus diisi");
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

      // Validasi duplikat tanggal
      const newDates = formData.dates.split(",").map(d => d.trim());
      const existingHolidays = holidays.filter(h =>
        h.institution_type === formData.institution_type &&
        h.year === formData.year &&
        h.month === formData.month &&
        (!isEditing || h.id !== formData.id)
      );
      
      const existingDates: string[] = [];
      existingHolidays.forEach(h => {
        h.dates.split(",").forEach(d => existingDates.push(d.trim().padStart(2, "0")));
      });
      
      const duplicates = newDates.filter(d => existingDates.includes(d.padStart(2, "0")));
      if (duplicates.length > 0) {
        toast.error(`Tanggal ${duplicates.join(", ")} sudah terdaftar sebagai libur`);
        return;
      }

      if (isEditing) {
        const { error } = await supabase
          .from("work_holidays")
          .update({
            institution_type: formData.institution_type,
            year: formData.year,
            month: formData.month,
            dates: formData.dates,
            description: formData.description || null,
          })
          .eq("id", formData.id);
        if (error) throw error;
        toast.success("Libur kerja berhasil diperbarui");
      } else {
        const { error } = await supabase
          .from("work_holidays")
          .insert({
            tenant_id: roleData?.tenant_id,
            institution_type: formData.institution_type,
            year: formData.year,
            month: formData.month,
            dates: formData.dates,
            description: formData.description || null,
          });
        if (error) throw error;
        toast.success("Libur kerja berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.holidays.save", {
        holiday_id: formData.id || null,
        institution_type: formData.institution_type,
        year: formData.year,
        month: formData.month,
      });
      toast.error(appendErrorReference("Gagal menyimpan libur kerja", errorRef));
    }
  };

  const resetForm = () => {
    setFormData({
      id: "",
      institution_type: "pemerintahan",
      year: currentYear,
      month: 1,
      dates: "",
      description: "",
    });
    setIsEditing(false);
  };

  const handleEdit = (holiday: WorkHoliday) => {
    setFormData({
      id: holiday.id,
      institution_type: holiday.institution_type,
      year: holiday.year,
      month: holiday.month,
      dates: holiday.dates,
      description: holiday.description || "",
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Yakin ingin menghapus libur kerja ini?")) return;

    try {
      const { error } = await supabase.from("work_holidays").delete().eq("id", id);
      if (error) throw error;
      toast.success("Libur kerja berhasil dihapus");
      fetchData();
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.schedule.holidays.delete", { holiday_id: id });
      toast.error(appendErrorReference("Gagal menghapus libur kerja", errorRef));
    }
  };

  const resetFilters = () => {
    setFilterInstitution("all");
    setFilterYear("all");
    setFilterMonth("all");
    setSearchTerm("");
    setCurrentPage(1);
  };

  const filteredHolidays = holidays.filter((holiday) => {
    const matchesSearch = holiday.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      holiday.dates.includes(searchTerm);
    const matchesInstitution = filterInstitution === "all" || holiday.institution_type === filterInstitution;
    const matchesYear = filterYear === "all" || holiday.year === parseInt(filterYear);
    const matchesMonth = filterMonth === "all" || holiday.month === parseInt(filterMonth);
    return matchesSearch && matchesInstitution && matchesYear && matchesMonth;
  });

  const totalPages = Math.ceil(filteredHolidays.length / itemsPerPage);
  const paginatedHolidays = filteredHolidays.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getInstitutionLabel = (type: string) => {
    return institutionTypes.find(t => t.value === type)?.label || type;
  };

  const getMonthLabel = (month: number) => {
    return months.find(m => m.value === month)?.label || month;
  };

  // Get existing holiday dates for the selected institution, year, and month
  const getExistingHolidayDates = (): Date[] => {
    const existingDates: Date[] = [];
    
    holidays
      .filter(h => 
        h.institution_type === formData.institution_type &&
        h.year === formData.year &&
        h.month === formData.month &&
        (!isEditing || h.id !== formData.id) // Exclude current editing record
      )
      .forEach(holiday => {
        holiday.dates.split(",").forEach(d => {
          const day = parseInt(d.trim());
          if (!isNaN(day)) {
            existingDates.push(new Date(formData.year, formData.month - 1, day));
          }
        });
      });
    
    return existingDates;
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarIcon className="h-6 w-6" />
              Data Libur Kerja
            </h1>
            <p className="text-muted-foreground">Kelola hari libur kerja per jenis instansi</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Libur
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Libur Kerja" : "Tambah Libur Kerja"}</DialogTitle>
                <DialogDescription>
                  {isEditing ? "Perbarui data libur kerja" : "Tambahkan libur kerja baru"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Jenis Instansi</Label>
                  <Select
                    value={formData.institution_type}
                    onValueChange={(value) => setFormData({ ...formData, institution_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis instansi" />
                    </SelectTrigger>
                    <SelectContent>
                      {institutionTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Tahun</Label>
                    <Select
                      value={formData.year.toString()}
                      onValueChange={(value) => setFormData({ ...formData, year: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih tahun" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Bulan</Label>
                    <Select
                      value={formData.month.toString()}
                      onValueChange={(value) => setFormData({ ...formData, month: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih bulan" />
                      </SelectTrigger>
                      <SelectContent>
                        {months.map((month) => (
                          <SelectItem key={month.value} value={month.value.toString()}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Pilih Tanggal Libur (Multi-Pilih)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.dates && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.dates ? (
                          <span>
                            {formData.dates.split(",").length} tanggal dipilih: {formData.dates}
                          </span>
                        ) : (
                          <span>Klik untuk memilih tanggal</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <DateCalendar
                        mode="multiple"
                        selected={formData.dates
                          ? formData.dates.split(",").map((d) => {
                              const day = parseInt(d.trim());
                              return new Date(formData.year, formData.month - 1, day);
                            })
                          : []
                        }
                        onSelect={(dates) => {
                          if (dates && dates.length > 0) {
                            // Filter out weekend dates
                            const weekendDates = getWeekendDates();
                            const filteredDates = dates.filter(d => 
                              !weekendDates.some(wd => 
                                wd.getDate() === d.getDate() && 
                                wd.getMonth() === d.getMonth() && 
                                wd.getFullYear() === d.getFullYear()
                              )
                            );
                            const datesStr = filteredDates
                              .map((d) => d.getDate().toString().padStart(2, "0"))
                              .sort()
                              .join(",");
                            setFormData({ ...formData, dates: datesStr });
                          } else {
                            setFormData({ ...formData, dates: "" });
                          }
                        }}
                        month={new Date(formData.year, formData.month - 1)}
                        onMonthChange={(date) => {
                          setFormData({
                            ...formData,
                            year: date.getFullYear(),
                            month: date.getMonth() + 1,
                          });
                        }}
                        locale={localeId}
                        className={cn("p-3 pointer-events-auto")}
                        disabled={getWeekendDates()}
                        modifiers={{
                          existingHoliday: getExistingHolidayDates(),
                          weekend: getWeekendDates(),
                        }}
                        modifiersStyles={{
                          existingHoliday: {
                            backgroundColor: "hsl(var(--destructive) / 0.2)",
                            color: "hsl(var(--destructive))",
                            fontWeight: "bold",
                          },
                          weekend: {
                            backgroundColor: "hsl(var(--muted))",
                            color: "hsl(var(--muted-foreground))",
                            opacity: 0.5,
                          },
                        }}
                      />
                      <div className="p-2 border-t space-y-1">
                        <p className="text-xs text-muted-foreground text-center">
                          Klik tanggal untuk memilih/hapus. Bisa pilih banyak tanggal.
                        </p>
                        <div className="flex items-center justify-center gap-4 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "hsl(var(--destructive) / 0.2)" }}></span>
                            <span className="text-muted-foreground">Sudah libur</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded bg-muted opacity-50"></span>
                            <span className="text-muted-foreground">Akhir pekan</span>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input
                    value={formData.dates}
                    onChange={(e) => setFormData({ ...formData, dates: e.target.value })}
                    placeholder="Atau ketik manual: 01,02,03,15"
                    className="mt-2"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Keterangan (opsional)</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Contoh: Libur Lebaran"
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

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Daftar Libur Kerja</CardTitle>
            <CardDescription>Semua hari libur kerja per jenis instansi</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari keterangan atau tanggal..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
              <Select value={filterInstitution} onValueChange={(v) => { setFilterInstitution(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Jenis Instansi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Instansi</SelectItem>
                  {institutionTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterYear} onValueChange={(v) => { setFilterYear(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Tahun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tahun</SelectItem>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterMonth} onValueChange={(v) => { setFilterMonth(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Bulan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Bulan</SelectItem>
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value.toString()}>{month.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={handleCopyFromPreviousYear} disabled={isCopying}>
                <Copy className="h-4 w-4 mr-2" />
                {isCopying ? "Menyalin..." : "Salin dari Tahun Lalu"}
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>Jenis Instansi</TableHead>
                  <TableHead>Tahun</TableHead>
                  <TableHead>Bulan</TableHead>
                  <TableHead>Tanggal Libur</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : paginatedHolidays.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Belum ada data libur kerja
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedHolidays.map((holiday, index) => (
                    <TableRow key={holiday.id}>
                      <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{getInstitutionLabel(holiday.institution_type)}</Badge>
                      </TableCell>
                      <TableCell>{holiday.year}</TableCell>
                      <TableCell>{getMonthLabel(holiday.month)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {holiday.dates.split(",").map((date, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {date.trim()}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{holiday.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(holiday)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(holiday.id)}>
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
                  Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredHolidays.length)} dari {filteredHolidays.length} data
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
