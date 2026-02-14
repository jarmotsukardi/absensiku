import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, Search, Download, RotateCcw, Flag } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";

interface NationalHoliday {
  id: string;
  name: string;
  date: string;
  year: number;
  description: string | null;
  is_active: boolean;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

export default function OrgNationalHolidaysManagement() {
  const [holidays, setHolidays] = useState<NationalHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPulling, setIsPulling] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterYear, setFilterYear] = useState<string>(currentYear.toString());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      const { data, error } = await supabase
        .from("national_holidays")
        .select("*")
        .order("date", { ascending: true });

      if (error) throw error;
      setHolidays((data as NationalHoliday[]) || []);
    } catch (error) {
      console.error("Error fetching holidays:", error);
      toast.error("Gagal memuat data libur nasional");
    } finally {
      setIsLoading(false);
    }
  };

  const pullFromNational = async () => {
    setIsPulling(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!roleData?.tenant_id) return;

      const selectedYearNum = parseInt(filterYear);
      
      // Get national holidays for selected year
      const { data: nationalData, error: nationalError } = await supabase
        .from("national_holidays")
        .select("*")
        .eq("year", selectedYearNum)
        .eq("is_active", true);

      if (nationalError) throw nationalError;

      if (!nationalData || nationalData.length === 0) {
        toast.info(`Tidak ada data libur nasional untuk tahun ${selectedYearNum}`);
        setIsPulling(false);
        return;
      }

      // Convert national holidays to work_holidays format
      const holidaysByMonth: Record<number, string[]> = {};
      
      nationalData.forEach((holiday: NationalHoliday) => {
        const date = new Date(holiday.date);
        const month = date.getMonth() + 1;
        const day = date.getDate().toString().padStart(2, "0");
        
        if (!holidaysByMonth[month]) {
          holidaysByMonth[month] = [];
        }
        holidaysByMonth[month].push(day);
      });

      // Insert into work_holidays
      for (const [month, dates] of Object.entries(holidaysByMonth)) {
        const { error: insertError } = await supabase
          .from("work_holidays")
          .upsert({
            tenant_id: roleData.tenant_id,
            year: selectedYearNum,
            month: parseInt(month),
            dates: dates.join(","),
            description: "Libur Nasional (ditarik dari kalender nasional)",
            institution_type: "pemerintahan",
          }, {
            onConflict: "tenant_id,year,month,institution_type",
          });

        if (insertError) {
          console.error("Insert error:", insertError);
        }
      }

      toast.success(`Berhasil menarik ${nationalData.length} libur nasional tahun ${selectedYearNum}`);
    } catch (error) {
      console.error("Error pulling holidays:", error);
      toast.error("Gagal menarik data libur nasional");
    } finally {
      setIsPulling(false);
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setFilterYear(currentYear.toString());
    setCurrentPage(1);
  };

  const filteredHolidays = holidays.filter((holiday) => {
    const matchesSearch = holiday.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      holiday.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesYear = filterYear === "all" || holiday.year === parseInt(filterYear);
    return matchesSearch && matchesYear;
  });

  const totalPages = Math.ceil(filteredHolidays.length / itemsPerPage);
  const paginatedHolidays = filteredHolidays.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "EEEE, d MMMM yyyy", { locale: localeId });
    } catch {
      return dateStr;
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Flag className="h-6 w-6" />
              Libur Nasional
            </h1>
            <p className="text-muted-foreground">
              Tarik data libur nasional ke kalender organisasi
            </p>
          </div>
          <Button onClick={pullFromNational} disabled={isPulling}>
            <Download className="mr-2 h-4 w-4" />
            {isPulling ? "Menarik..." : "Tarik ke Kalender Organisasi"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Libur Nasional Indonesia</CardTitle>
            <CardDescription>
              Data libur nasional yang dapat ditarik ke kalender kerja organisasi Anda
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari libur nasional..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
              <Select value={filterYear} onValueChange={(v) => { setFilterYear(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Tahun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>Nama Libur</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Tahun</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : paginatedHolidays.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Belum ada data libur nasional
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedHolidays.map((holiday, index) => (
                    <TableRow key={holiday.id}>
                      <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                      <TableCell className="font-medium">{holiday.name}</TableCell>
                      <TableCell>{formatDate(holiday.date)}</TableCell>
                      <TableCell>{holiday.year}</TableCell>
                      <TableCell>
                        <Badge variant={holiday.is_active ? "default" : "secondary"}>
                          {holiday.is_active ? "Aktif" : "Non-Aktif"}
                        </Badge>
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
                      const page = i + 1;
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
