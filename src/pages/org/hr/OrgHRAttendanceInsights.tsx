import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, RefreshCw, Clock3, CheckCircle2, AlertTriangle, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { getHrRoutePolicy } from "@/lib/hrRouteAccess";
import { getHrRouteStatusBadgeLabel, getHrRouteStatusDescription } from "@/lib/hrRouteStatusPresentation";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { toast } from "sonner";

type AttendanceRow = {
  id: string;
  date: string;
  status: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  is_wfh: boolean | null;
  employees: {
    name: string | null;
    email: string | null;
  } | null;
};

type EmployeeIssueSummary = {
  name: string;
  email: string;
  total: number;
};

const toStatusLabel = (value: string | null) => {
  if (!value) return "Belum Ditentukan";
  return value.replaceAll("_", " ");
};

const toTime = (value: string | null) => {
  if (!value) return "-";
  try {
    return format(new Date(value), "HH:mm");
  } catch {
    return "-";
  }
};

const isLateStatus = (status: string | null) => {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized.includes("late") || normalized.includes("terlambat");
};

export default function OrgHRAttendanceInsights() {
  const routePolicy = getHrRoutePolicy("/org/hr/attendance-insights");
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    today.setDate(today.getDate() - 30);
    return format(today, "yyyy-MM-dd");
  });
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "name_asc" | "name_desc">("date_desc");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"semua" | "terlambat" | "wfh" | "anomali">("semua");
  const pageSize = 20;
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/attendance-insights");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (startDate > endDate) {
        toast.error("Rentang tanggal tidak valid. Tanggal awal harus <= tanggal akhir.");
        setRows([]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc("get_org_hr_attendance_insights" as never, {
        p_tenant_id: tenantId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_limit: 1000,
      } as never);
      if (error) throw error;

      const normalizedRows = ((data || []) as Array<{
        id: string;
        date: string;
        status: string | null;
        check_in_time: string | null;
        check_out_time: string | null;
        is_wfh: boolean | null;
        employee_name: string | null;
        employee_email: string | null;
      }>).map((item) => ({
        id: item.id,
        date: item.date,
        status: item.status,
        check_in_time: item.check_in_time,
        check_out_time: item.check_out_time,
        is_wfh: item.is_wfh,
        employees: {
          name: item.employee_name,
          email: item.employee_email,
        },
      }));

      setRows(normalizedRows);
      setPage(1);
    } catch (error) {
      const ref = reportError(error, "org.hr.attendance_insights.fetch");
      toast.error(appendErrorReference("Gagal memuat analitik kehadiran HR", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const keyword = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!keyword) return rows;
    return rows.filter((item) => {
      const employeeName = item.employees?.name || "";
      const employeeEmail = item.employees?.email || "";
      return [employeeName, employeeEmail, item.date, item.status || ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [rows, keyword]);

  const sorted = useMemo(() => {
    const cloned = [...filtered];
    if (sortBy === "date_desc") {
      cloned.sort((a, b) => b.date.localeCompare(a.date));
    } else if (sortBy === "date_asc") {
      cloned.sort((a, b) => a.date.localeCompare(b.date));
    } else if (sortBy === "name_asc") {
      cloned.sort((a, b) => (a.employees?.name || "").localeCompare(b.employees?.name || ""));
    } else {
      cloned.sort((a, b) => (b.employees?.name || "").localeCompare(a.employees?.name || ""));
    }
    return cloned;
  }, [filtered, sortBy]);

  const total = sorted.length;
  const checkedIn = sorted.filter((item) => Boolean(item.check_in_time)).length;
  const checkedOut = sorted.filter((item) => Boolean(item.check_out_time)).length;
  const lateCount = sorted.filter((item) => isLateStatus(item.status)).length;
  const wfhCount = sorted.filter((item) => item.is_wfh === true).length;
  const noCheckoutCount = sorted.filter((item) => Boolean(item.check_in_time) && !item.check_out_time).length;
  const activeRows = useMemo(() => {
    if (activeTab === "terlambat") return sorted.filter((item) => isLateStatus(item.status));
    if (activeTab === "wfh") return sorted.filter((item) => item.is_wfh === true);
    if (activeTab === "anomali") return sorted.filter((item) => Boolean(item.check_in_time) && !item.check_out_time);
    return sorted;
  }, [activeTab, sorted]);
  const anomalyRows = useMemo(
    () => sorted.filter((item) => Boolean(item.check_in_time) && !item.check_out_time),
    [sorted],
  );
  const topLateEmployees = useMemo<EmployeeIssueSummary[]>(() => {
    const map = new Map<string, EmployeeIssueSummary>();
    sorted.forEach((item) => {
      if (!isLateStatus(item.status)) return;
      const name = item.employees?.name || "Tanpa Nama";
      const email = item.employees?.email || "-";
      const key = `${name}|${email}`;
      const current = map.get(key);
      map.set(key, {
        name,
        email,
        total: (current?.total || 0) + 1,
      });
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [sorted]);
  const topNoCheckoutEmployees = useMemo<EmployeeIssueSummary[]>(() => {
    const map = new Map<string, EmployeeIssueSummary>();
    sorted.forEach((item) => {
      if (!item.check_in_time || item.check_out_time) return;
      const name = item.employees?.name || "Tanpa Nama";
      const email = item.employees?.email || "-";
      const key = `${name}|${email}`;
      const current = map.get(key);
      map.set(key, {
        name,
        email,
        total: (current?.total || 0) + 1,
      });
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [sorted]);
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = activeRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [activeTab, endDate, search, sortBy, startDate]);

  const handleExportCsv = () => {
    if (sorted.length === 0) {
      toast.info("Belum ada data untuk diekspor.");
      return;
    }
    const header = ["Nama", "Email", "Tanggal", "Status", "Jam Masuk", "Jam Pulang", "Mode"];
    const body = sorted.map((item) => [
      item.employees?.name || "-",
      item.employees?.email || "-",
      item.date,
      toStatusLabel(item.status),
      toTime(item.check_in_time),
      toTime(item.check_out_time),
      item.is_wfh ? "WFH" : "Onsite",
    ]);
    const csv = [header, ...body]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `hr-attendance-insights-${startDate}-${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">HR</Badge>
            <Badge variant="secondary">{getHrRouteStatusBadgeLabel(routePolicy.status)}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Analitik Kehadiran HR</h1>
          <p className="text-sm text-muted-foreground">
            Analitik HR berbasis data absensi tenant. Halaman ini termasuk paket produksi HR.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canExport ? "admin dapat analisis dan ekspor" : access.canView ? "analitik internal hanya-baca" : "akses dibatasi"}
          </p>
        </div>

        <Card className="border-dashed">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{getHrRouteStatusDescription(routePolicy.status, "analytics")}</p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-6">
          <StatCard title="Total Rekam" value={total} icon={Clock3} />
          <StatCard title="Sudah Check-in" value={checkedIn} icon={CheckCircle2} />
          <StatCard title="Sudah Check-out" value={checkedOut} icon={CheckCircle2} />
          <StatCard title="Belum Check-out" value={noCheckoutCount} icon={AlertTriangle} />
          <StatCard title="Terlambat" value={lateCount} icon={AlertTriangle} />
          <StatCard title="WFH" value={wfhCount} icon={Home} />
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
              <Button size="sm" variant="outline" onClick={() => void fetchData()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Muat Ulang
              </Button>
              <Button size="sm" variant="outline" onClick={handleExportCsv} disabled={isLoadingAccess || !access.canExport}>
                Ekspor CSV
              </Button>
              <select
                aria-label="Urutan data kehadiran"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value as typeof sortBy);
                  setPage(1);
                }}
              >
                <option value="date_desc">Tanggal terbaru</option>
                <option value="date_asc">Tanggal terlama</option>
                <option value="name_asc">Nama A-Z</option>
                <option value="name_desc">Nama Z-A</option>
              </select>
            </div>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, email, status, tanggal..."
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
              <TabsList>
                <TabsTrigger value="semua">Semua ({sorted.length})</TabsTrigger>
                <TabsTrigger value="terlambat">Terlambat ({lateCount})</TabsTrigger>
                <TabsTrigger value="wfh">WFH ({wfhCount})</TabsTrigger>
                <TabsTrigger value="anomali">Anomali Checkout ({noCheckoutCount})</TabsTrigger>
              </TabsList>
              <TabsContent value="semua">
                <AttendanceTable rows={paged} isLoading={isLoading} />
              </TabsContent>
              <TabsContent value="terlambat">
                <AttendanceTable rows={paged} isLoading={isLoading} />
              </TabsContent>
              <TabsContent value="wfh">
                <AttendanceTable rows={paged} isLoading={isLoading} />
              </TabsContent>
              <TabsContent value="anomali">
                <AttendanceTable rows={paged} isLoading={isLoading} />
                {!isLoading ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Total anomali check-out belum lengkap pada filter saat ini: {anomalyRows.length}
                  </p>
                ) : null}
              </TabsContent>
            </Tabs>
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <p>
                Halaman {safePage} dari {totalPages} • Total {activeRows.length} data
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Sebelumnya
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 5 Pegawai Paling Sering Terlambat</CardTitle>
              <CardDescription>Prioritas pembinaan disiplin berdasarkan periode filter aktif.</CardDescription>
            </CardHeader>
            <CardContent>
              <IssueSummaryTable
                rows={topLateEmployees}
                emptyText="Belum ada data keterlambatan pada periode ini."
                countLabel="Total Terlambat"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 5 Pegawai Paling Sering Belum Checkout</CardTitle>
              <CardDescription>Prioritas edukasi proses absensi pulang pada periode filter aktif.</CardDescription>
            </CardHeader>
            <CardContent>
              <IssueSummaryTable
                rows={topNoCheckoutEmployees}
                emptyText="Belum ada anomali check-out pada periode ini."
                countLabel="Total Anomali"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </OrganizationLayout>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function AttendanceTable({ rows, isLoading }: { rows: AttendanceRow[]; isLoading: boolean }) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Memuat data kehadiran...</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada data untuk filter saat ini.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pegawai</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Tanggal</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Masuk</TableHead>
          <TableHead>Pulang</TableHead>
          <TableHead>Mode</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.employees?.name || "-"}</TableCell>
            <TableCell>{item.employees?.email || "-"}</TableCell>
            <TableCell>
              {format(new Date(item.date), "dd MMM yyyy", { locale: localeId })}
            </TableCell>
            <TableCell className="capitalize">{toStatusLabel(item.status)}</TableCell>
            <TableCell>{toTime(item.check_in_time)}</TableCell>
            <TableCell>{toTime(item.check_out_time)}</TableCell>
            <TableCell>{item.is_wfh ? "WFH" : "Onsite"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function IssueSummaryTable({
  rows,
  emptyText,
  countLabel,
}: {
  rows: EmployeeIssueSummary[];
  emptyText: string;
  countLabel: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nama Pegawai</TableHead>
          <TableHead>Email</TableHead>
          <TableHead className="text-right">{countLabel}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((item) => (
            <TableRow key={`${item.name}-${item.email}`}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>{item.email}</TableCell>
              <TableCell className="text-right">{item.total}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
