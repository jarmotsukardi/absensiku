import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download, RotateCcw, Flag } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface NationalHoliday {
  id: string;
  name: string;
  date: string;
  year: number;
  description: string | null;
  is_active: boolean;
}

interface SourceHoliday {
  date: string;
  name: string;
}

interface LiburDenoApiItem {
  date: string;
  name: string;
}

interface NagerHolidayApiItem {
  date: string;
  localName?: string;
  name?: string;
  global?: boolean;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const normalizeDayValues = (values: string[]): string[] =>
  Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map((value) => value.padStart(2, "0"))
        .filter((value) => /^\d{2}$/.test(value))
    )
  ).sort((a, b) => Number(a) - Number(b));

const parseDayValues = (dates: string | null | undefined): string[] => {
  if (!dates) return [];
  return normalizeDayValues(dates.split(","));
};

const parseIsoDateParts = (dateValue: string): { year: number; month: number; day: string } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateValue);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: match[3],
  };
};

const buildDefaultHolidays = (year: number): SourceHoliday[] => [
  { date: `${year}-01-01`, name: "Tahun Baru Masehi" },
  { date: `${year}-02-08`, name: "Isra Mi'raj Nabi Muhammad SAW" },
  { date: `${year}-03-29`, name: "Hari Suci Nyepi" },
  { date: `${year}-03-31`, name: "Idul Fitri" },
  { date: `${year}-04-01`, name: "Idul Fitri" },
  { date: `${year}-04-18`, name: "Wafat Isa Almasih" },
  { date: `${year}-05-01`, name: "Hari Buruh Internasional" },
  { date: `${year}-05-12`, name: "Hari Raya Waisak" },
  { date: `${year}-05-29`, name: "Kenaikan Isa Almasih" },
  { date: `${year}-06-01`, name: "Hari Lahir Pancasila" },
  { date: `${year}-06-07`, name: "Idul Adha" },
  { date: `${year}-06-27`, name: "Tahun Baru Islam" },
  { date: `${year}-08-17`, name: "Hari Kemerdekaan RI" },
  { date: `${year}-09-05`, name: "Maulid Nabi Muhammad SAW" },
  { date: `${year}-12-25`, name: "Hari Natal" },
];

const fetchExternalHolidays = async (year: number): Promise<{ holidays: SourceHoliday[]; sourceLabel: string }> => {
  // Source 1: libur.deno.dev (primary)
  try {
    const response = await fetch(`https://libur.deno.dev/api?year=${year}`);
    if (response.ok) {
      const apiData: unknown = await response.json();
      if (Array.isArray(apiData)) {
        const denoItems = (apiData as LiburDenoApiItem[])
          .filter((item) => typeof item?.date === "string" && typeof item?.name === "string");
        if (denoItems.length > 0) {
          return {
            holidays: denoItems.map((item) => ({
              date: item.date,
              name: item.name || "Libur Nasional",
            })),
            sourceLabel: "libur.deno.dev",
          };
        }
      }
    }
  } catch {
    // continue to next source
  }

  // Source 2: Nager public holidays (fallback)
  try {
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ID`);
    if (response.ok) {
      const apiData: unknown = await response.json();
      if (Array.isArray(apiData)) {
        const nagerItems = (apiData as NagerHolidayApiItem[])
          .filter((item) => typeof item?.date === "string")
          .filter((item) => item.global !== false);
        if (nagerItems.length > 0) {
          return {
            holidays: nagerItems.map((item) => ({
              date: item.date,
              name: item.localName || item.name || "Libur Nasional",
            })),
            sourceLabel: "API fallback internasional",
          };
        }
      }
    }
  } catch {
    // continue to default source
  }

  // Source 3: local default seed
  return {
    holidays: buildDefaultHolidays(year),
    sourceLabel: "default lokal",
  };
};

export default function OrgNationalHolidaysManagement() {
  const [searchParams] = useSearchParams();
  const queryTenantId = searchParams.get("tenant_id");
  const [holidays, setHolidays] = useState<NationalHoliday[]>([]);
  const [fallbackPreviewHolidays, setFallbackPreviewHolidays] = useState<NationalHoliday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPulling, setIsPulling] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterYear, setFilterYear] = useState<string>(currentYear.toString());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const fetchHolidays = useCallback(async () => {
    try {
      setLoadError(null);
      let query = supabase
        .from("national_holidays")
        .select("*")
        .order("date", { ascending: true });
      if (filterYear !== "all") {
        query = query.eq("year", parseInt(filterYear));
      }

      const { data, error } = await query;

      if (error) throw error;
      setHolidays((data as NationalHoliday[]) || []);
    } catch (error) {
      const errorRef = reportError(error, "org.national_holidays.fetch", {
        year: filterYear,
      });
      const message = appendErrorReference("Gagal memuat data libur nasional", errorRef);
      setLoadError(message);
      toast.error(message);
      setHolidays([]);
    } finally {
      setIsLoading(false);
    }
  }, [filterYear]);

  useEffect(() => {
    void fetchHolidays();
  }, [fetchHolidays]);

  const pullFromNational = async () => {
    setIsPulling(true);
    setLoadError(null);
    setFallbackPreviewHolidays([]);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roles, error: roleError } = await supabase
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id)
        .in("role", ["admin_instansi", "super_admin"]);

      if (roleError) throw roleError;
      const adminRole = roles?.find((r) => r.role === "admin_instansi" && r.tenant_id);
      const isSuperAdmin = roles?.some((r) => r.role === "super_admin");
      const tenantId = adminRole?.tenant_id || (isSuperAdmin ? queryTenantId : null);
      if (!tenantId) {
        toast.error("Tenant organisasi tidak ditemukan. Buka halaman ini dari menu organisasi.");
        return;
      }

      if (filterYear === "all") {
        toast.info("Pilih tahun spesifik sebelum menarik ke kalender organisasi.");
        return;
      }
      const selectedYearNum = parseInt(filterYear);
      if (!Number.isFinite(selectedYearNum)) {
        toast.error("Tahun tidak valid.");
        return;
      }
      
      // Get national holidays for selected year from DB first
      const { data: nationalData, error: nationalError } = await supabase
        .from("national_holidays")
        .select("*")
        .eq("year", selectedYearNum)
        .eq("is_active", true);

      if (nationalError) throw nationalError;

      let sourceHolidays: SourceHoliday[] = ((nationalData as NationalHoliday[] | null) || [])
        .filter((row) => typeof row.date === "string")
        .map((row) => ({
          date: row.date,
          name: row.name || "Libur Nasional",
        }));
      let sourceLabel = "database nasional";

      // Fallback: if source table empty, use public holiday API
      if (sourceHolidays.length === 0) {
        const external = await fetchExternalHolidays(selectedYearNum);
        sourceHolidays = external.holidays;
        sourceLabel = external.sourceLabel;
      }

      if (sourceHolidays.length === 0) {
        toast.info(`Tidak ada data libur nasional untuk tahun ${selectedYearNum}.`);
        return;
      }

      if (sourceLabel !== "database nasional") {
        setFallbackPreviewHolidays(
          sourceHolidays.map((item) => ({
            id: `preview-${selectedYearNum}-${item.date}`,
            name: item.name,
            date: item.date,
            year: selectedYearNum,
            description: `Sumber ${sourceLabel}`,
            is_active: true,
          }))
        );
      }

      // Jika sumber dari API, coba simpan ke tabel master agar daftar nasional ikut terisi.
      if (sourceLabel !== "database nasional") {
        try {
          const existingDateSet = new Set(
            (((nationalData as NationalHoliday[] | null) || []).map((row) => row.date)).filter(Boolean)
          );
          const toInsert = sourceHolidays.filter((item) => !existingDateSet.has(item.date));
          if (toInsert.length > 0) {
            const insertPayload = toInsert.map((item) => ({
              date: item.date,
              name: item.name,
              description: "Libur Nasional (sumber API)",
              year: selectedYearNum,
              is_active: true,
            }));
            const { error: insertMasterError } = await supabase
              .from("national_holidays")
              .insert(insertPayload);
            if (insertMasterError) throw insertMasterError;
          }
          await fetchHolidays();
        } catch (masterSyncError) {
          const masterSyncRef = reportError(masterSyncError, "org.national_holidays.pull_master_sync", {
            year: selectedYearNum,
          });
          toast.info(
            appendErrorReference(
              "Sinkron ke kalender organisasi berhasil, tetapi daftar master nasional ditampilkan sebagai preview.",
              masterSyncRef
            )
          );
        }
      }

      // Convert national holidays to work_holidays format
      const holidaysByMonth: Record<number, string[]> = {};
      const sourceHolidayDates = sourceHolidays.map((item) => item.date);
      
      sourceHolidayDates.forEach((dateValue) => {
        const parsed = parseIsoDateParts(dateValue);
        if (!parsed || parsed.year !== selectedYearNum) return;
        const month = parsed.month;
        const day = parsed.day;
        
        if (!holidaysByMonth[month]) {
          holidaysByMonth[month] = [];
        }
        holidaysByMonth[month].push(day);
      });

      const { data: institutionTypeRows, error: institutionTypeError } = await supabase
        .from("work_hours")
        .select("institution_type")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (institutionTypeError) throw institutionTypeError;

      const institutionTypes = Array.from(
        new Set((institutionTypeRows || []).map((row) => row.institution_type).filter(Boolean))
      );
      if (institutionTypes.length === 0) {
        institutionTypes.push("pemerintahan");
      }

      const { data: existingRows, error: existingRowsError } = await supabase
        .from("work_holidays")
        .select("id, month, institution_type, dates, description")
        .eq("tenant_id", tenantId)
        .eq("year", selectedYearNum);
      if (existingRowsError) throw existingRowsError;

      const existingMap = new Map(
        (existingRows || []).map((row) => [`${row.institution_type}-${row.month}`, row] as const)
      );

      let insertedCount = 0;
      let updatedCount = 0;
      const syncDescription = "Libur Nasional (sinkron dari kalender nasional)";

      for (const institutionType of institutionTypes) {
        for (const [month, rawDates] of Object.entries(holidaysByMonth)) {
          const monthNum = parseInt(month);
          const incomingDays = normalizeDayValues(rawDates);
          const key = `${institutionType}-${monthNum}`;
          const existing = existingMap.get(key);

          if (!existing) {
            const { error: insertError } = await supabase.from("work_holidays").insert({
              tenant_id: tenantId,
              institution_type: institutionType,
              year: selectedYearNum,
              month: monthNum,
              dates: incomingDays.join(","),
              description: syncDescription,
            });
            if (insertError) throw insertError;
            insertedCount += 1;
            continue;
          }

          const mergedDays = normalizeDayValues([...parseDayValues(existing.dates), ...incomingDays]);
          const mergedDates = mergedDays.join(",");
          if (mergedDates === parseDayValues(existing.dates).join(",")) {
            continue;
          }

          const { error: updateError } = await supabase
            .from("work_holidays")
            .update({
              dates: mergedDates,
              description: existing.description || syncDescription,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          if (updateError) throw updateError;
          updatedCount += 1;
        }
      }

      toast.success(
        `Sinkron selesai (${sourceLabel}): ${sourceHolidayDates.length} hari sumber, ${insertedCount} baris baru, ${updatedCount} baris diperbarui.`
      );
    } catch (error) {
      const errorRef = reportError(error, "org.national_holidays.pull", {
        year: filterYear,
        tenant_id: queryTenantId,
      });
      const message = appendErrorReference("Gagal menarik data libur nasional", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsPulling(false);
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setFilterYear(currentYear.toString());
    setCurrentPage(1);
  };

  const mergedMap = new Map<string, NationalHoliday>();
  holidays.forEach((holiday) => {
    mergedMap.set(holiday.date, holiday);
  });
  fallbackPreviewHolidays.forEach((holiday) => {
    if (!mergedMap.has(holiday.date)) {
      mergedMap.set(holiday.date, holiday);
    }
  });
  const displayHolidays = Array.from(mergedMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const filteredHolidays = displayHolidays.filter((holiday) => {
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

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

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
