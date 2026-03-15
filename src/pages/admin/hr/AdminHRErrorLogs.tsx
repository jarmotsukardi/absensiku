import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Download, ExternalLink, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

type ClientErrorLogRow = Database["public"]["Tables"]["client_error_logs"]["Row"];
type TenantOption = { id: string; name: string; code: string };
type ErrorTab = "critical" | "non_critical" | "resolved" | "archived";
type TimeRange = "24h" | "7d" | "30d";

const ITEMS_PER_PAGE = 20;

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const isHrError = (row: Pick<ClientErrorLogRow, "context" | "route">) => {
  const context = (row.context || "").toLowerCase();
  const route = (row.route || "").toLowerCase();
  return context.startsWith("org.hr.") || route.includes("/org/hr");
};

const toCsvSafe = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) return `"${text.replaceAll('"', '""')}"`;
  return text;
};

const downloadFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const statusBadge = (row: ClientErrorLogRow) => {
  if (row.is_archived) return <Badge variant="outline">Diarsipkan</Badge>;
  if (row.is_resolved) return <Badge className="bg-emerald-600 hover:bg-emerald-600">Selesai</Badge>;
  if (row.is_non_critical) return <Badge variant="secondary">Non-Kritis</Badge>;
  return <Badge variant="destructive">Kritis</Badge>;
};

export default function AdminHRErrorLogs() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<ClientErrorLogRow[]>([]);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantFilter, setTenantFilter] = useState(() => searchParams.get("tenant") || "all");
  const [activeTab, setActiveTab] = useState<ErrorTab>("critical");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [contextFilter, setContextFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tenantRes, logsRes] = await Promise.all([
        supabase
          .from("tenants")
          .select("id, name, code")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(500),
        supabase.from("client_error_logs").select("*").order("occurred_at", { ascending: false }).limit(1500),
      ]);

      if (tenantRes.error) throw tenantRes.error;
      if (logsRes.error) throw logsRes.error;

      setTenantOptions((tenantRes.data || []) as TenantOption[]);
      setRows(((logsRes.data || []) as ClientErrorLogRow[]).filter(isHrError));
      setLastUpdatedAt(new Date());
    } catch (error) {
      const ref = reportError(error, "admin.hr.error_logs.load");
      toast.error(appendErrorReference("Gagal memuat log error HR lintas tenant", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, tenantFilter, activeTab, timeRange, contextFilter]);

  const tenantNameMap = useMemo(
    () => new Map(tenantOptions.map((tenant) => [tenant.id, `${tenant.name} (${tenant.code})`])),
    [tenantOptions],
  );

  const contextOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.context).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const now = Date.now();
    const timeWindowMs =
      timeRange === "24h" ? 24 * 60 * 60 * 1000 : timeRange === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

    return rows.filter((row) => {
      if (tenantFilter !== "all" && row.tenant_id !== tenantFilter) return false;
      if (contextFilter !== "all" && row.context !== contextFilter) return false;

      const occurredAtMs = new Date(row.occurred_at).getTime();
      if (!Number.isNaN(occurredAtMs) && now - occurredAtMs > timeWindowMs) return false;

      if (activeTab === "critical" && (row.is_non_critical || row.is_resolved || row.is_archived)) return false;
      if (activeTab === "non_critical" && (!row.is_non_critical || row.is_resolved || row.is_archived)) return false;
      if (activeTab === "resolved" && !row.is_resolved) return false;
      if (activeTab === "archived" && !row.is_archived) return false;

      if (!keyword) return true;
      const haystack = [
        row.error_ref,
        row.context,
        row.message,
        row.route || "",
        row.tenant_id || "",
        row.source || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [rows, searchTerm, tenantFilter, activeTab, timeRange, contextFilter]);

  const summary = useMemo(() => ({
    total: rows.length,
    critical: rows.filter((row) => !row.is_non_critical && !row.is_resolved && !row.is_archived).length,
    nonCritical: rows.filter((row) => row.is_non_critical && !row.is_resolved && !row.is_archived).length,
    resolved: rows.filter((row) => row.is_resolved).length,
    archived: rows.filter((row) => row.is_archived).length,
  }), [rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = useMemo(() => {
    const from = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(from, from + ITEMS_PER_PAGE);
  }, [filteredRows, safePage]);

  const handleExportCsv = () => {
    const csv = [
      ["ref_error", "waktu", "tenant", "konteks", "pesan", "rute", "sumber", "status"],
      ...filteredRows.map((row) => [
        row.error_ref,
        row.occurred_at,
        row.tenant_id ? tenantNameMap.get(row.tenant_id) || row.tenant_id : "Tanpa tenant",
        row.context,
        row.message,
        row.route || "",
        row.source || "",
        row.is_archived ? "diarsipkan" : row.is_resolved ? "selesai" : row.is_non_critical ? "non_kritis" : "kritis",
      ]),
    ]
      .map((line) => line.map((value) => toCsvSafe(value)).join(","))
      .join("\n");

    downloadFile(`admin-hr-error-logs-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8;");
    toast.success("Ekspor CSV log error HR berhasil.");
  };

  const handleExportJson = () => {
    downloadFile(
      `admin-hr-error-logs-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(filteredRows, null, 2),
      "application/json;charset=utf-8;",
    );
    toast.success("Ekspor JSON log error HR berhasil.");
  };

  const copyReference = async (refValue: string) => {
    try {
      await navigator.clipboard.writeText(refValue);
      toast.success(`Referensi ${refValue} disalin.`);
    } catch (error) {
      const ref = reportError(error, "admin.hr.error_logs.copy_ref", { error_ref: refValue });
      toast.error(appendErrorReference("Gagal menyalin referensi error", ref));
    }
  };

  return (
    <AdminHRPageShell
      title="Log Error HR"
      subtitle="Pemantauan error khusus modul HR"
      description="Pantau error HR lintas tenant, filter berdasarkan tenant/konteks, dan buka rute sumber atau audit lanjutan tanpa meninggalkan area kerja HR."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Sumber data dibaca dari tabel terpusat <code>client_error_logs</code> dan difilter ke konteks/rute HR.
            </p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Memuat data..." : `Terakhir diperbarui: ${lastUpdatedAt?.toLocaleString("id-ID") ?? "-"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={isLoading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Muat Ulang
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filteredRows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJson} disabled={filteredRows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              JSON
            </Button>
            <Button size="sm" onClick={() => navigate("/admin/hr/audit")}>
              Buka Audit HR
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard title="Total Error HR" value={summary.total} note="Seluruh log HR lintas tenant." />
          <MetricCard title="Kritis Terbuka" value={summary.critical} note="Belum selesai dan belum diarsipkan." />
          <MetricCard title="Non-Kritis" value={summary.nonCritical} note="Perlu triase tanpa eskalasi tinggi." />
          <MetricCard title="Selesai / Arsip" value={summary.resolved + summary.archived} note="Sudah ditutup atau diparkir." />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter Log Error HR</CardTitle>
            <CardDescription>Gunakan filter ini untuk mengerucutkan triase lintas tenant dan konteks operasional.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Cari ref, pesan, rute, trace id..."
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tenant</SelectItem>
                {tenantOptions.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={contextFilter} onValueChange={setContextFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Semua konteks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Konteks</SelectItem>
                {contextOptions.map((context) => (
                  <SelectItem key={context} value={context}>
                    {context}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
              <SelectTrigger>
                <SelectValue placeholder="Rentang waktu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24 Jam</SelectItem>
                <SelectItem value="7d">7 Hari</SelectItem>
                <SelectItem value="30d">30 Hari</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant={activeTab === "critical" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("critical")}>
            Kritis
          </Button>
          <Button variant={activeTab === "non_critical" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("non_critical")}>
            Non-Kritis
          </Button>
          <Button variant={activeTab === "resolved" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("resolved")}>
            Selesai
          </Button>
          <Button variant={activeTab === "archived" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("archived")}>
            Arsip
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Log Error HR</CardTitle>
            <CardDescription>
              {filteredRows.length} item cocok dengan filter saat ini. Setiap baris tetap menampilkan referensi error untuk triase cepat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Konteks</TableHead>
                    <TableHead>Pesan</TableHead>
                    <TableHead>Rute</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        Memuat log error HR...
                      </TableCell>
                    </TableRow>
                  ) : pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        Tidak ada log error HR yang cocok dengan filter ini.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-xs">{row.error_ref}</TableCell>
                        <TableCell className="text-xs">{formatDateTime(row.occurred_at)}</TableCell>
                        <TableCell className="text-xs">{row.tenant_id ? tenantNameMap.get(row.tenant_id) || row.tenant_id : "Tanpa tenant"}</TableCell>
                        <TableCell className="text-xs">{row.context}</TableCell>
                        <TableCell className="max-w-[320px] text-xs">{row.message}</TableCell>
                        <TableCell className="font-mono text-xs">{row.route || "-"}</TableCell>
                        <TableCell>{statusBadge(row)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="icon" onClick={() => void copyReference(row.error_ref)} title="Salin ref error">
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => navigate(row.route || "/admin/hr/audit")}
                              title="Buka rute sumber"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Halaman {safePage} dari {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminHRPageShell>
  );
}

function MetricCard({ title, value, note }: { title: string; value: number; note: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
