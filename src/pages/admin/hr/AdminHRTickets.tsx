import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";

type TicketStatus = "open" | "in_progress" | "resolved";

type TicketRow = {
  id: string;
  tenant_id: string | null;
  reporter_name: string | null;
  status: string;
  message: string;
  created_at: string;
};

type TenantOption = {
  id: string;
  name: string;
  code: string;
};

type TenantSummary = {
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  latestAt: string | null;
};

const PAGE_SIZE = 20;
const TENANT_SUMMARY_SOURCE_LIMIT = 2000;

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const escapeLikeKeyword = (keyword: string) => keyword.replace(/[%,_]/g, "").trim();

const statusBadge = (status: string) => {
  if (status === "resolved") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Selesai</Badge>;
  if (status === "in_progress") return <Badge className="bg-blue-600 hover:bg-blue-600">Sedang Diproses</Badge>;
  return <Badge variant="secondary">Terbuka</Badge>;
};

export default function AdminHRTickets() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [summarySourceTickets, setSummarySourceTickets] = useState<TicketRow[]>([]);
  const [tenantFilter, setTenantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, open: 0, inProgress: 0, resolved: 0 });

  const sanitizedSearch = useMemo(() => escapeLikeKeyword(searchTerm), [searchTerm]);

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const { data, error } = await supabase
          .from("tenants")
          .select("id, name, code")
          .order("name", { ascending: true })
          .limit(500);
        if (error) throw error;
        setTenantOptions((data || []) as TenantOption[]);
      } catch (error) {
        const ref = reportError(error, "admin.hr.tickets.tenants");
        toast.error(appendErrorReference("Gagal memuat daftar tenant tiket HR", ref));
      }
    };

    void loadTenants();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [tenantFilter, statusFilter, sanitizedSearch]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let pagedQuery = supabase
        .from("feedback_reports")
        .select("id, tenant_id, reporter_name, status, message, created_at", { count: "exact" })
        .eq("feedback_type", "ticket")
        .eq("reporter_role", "admin_organisasi")
        .order("created_at", { ascending: false })
        .range(from, to);
      let summaryQuery = supabase
        .from("feedback_reports")
        .select("id, tenant_id, reporter_name, status, message, created_at")
        .eq("feedback_type", "ticket")
        .eq("reporter_role", "admin_organisasi")
        .order("created_at", { ascending: false })
        .limit(TENANT_SUMMARY_SOURCE_LIMIT);
      let totalQuery = supabase
        .from("feedback_reports")
        .select("id", { count: "exact", head: true })
        .eq("feedback_type", "ticket")
        .eq("reporter_role", "admin_organisasi");

      if (tenantFilter !== "all") {
        pagedQuery = pagedQuery.eq("tenant_id", tenantFilter);
        summaryQuery = summaryQuery.eq("tenant_id", tenantFilter);
        totalQuery = totalQuery.eq("tenant_id", tenantFilter);
      }
      if (statusFilter !== "all") {
        pagedQuery = pagedQuery.eq("status", statusFilter);
        summaryQuery = summaryQuery.eq("status", statusFilter);
        totalQuery = totalQuery.eq("status", statusFilter);
      }
      if (sanitizedSearch) {
        const clause = `message.ilike.%${sanitizedSearch}%,reporter_name.ilike.%${sanitizedSearch}%`;
        pagedQuery = pagedQuery.or(clause);
        summaryQuery = summaryQuery.or(clause);
        totalQuery = totalQuery.or(clause);
      }

      const buildStatusCountQuery = (status: TicketStatus) => {
        let query = supabase
          .from("feedback_reports")
          .select("id", { count: "exact", head: true })
          .eq("feedback_type", "ticket")
          .eq("reporter_role", "admin_organisasi")
          .eq("status", status);
        if (tenantFilter !== "all") {
          query = query.eq("tenant_id", tenantFilter);
        }
        if (sanitizedSearch) {
          query = query.or(`message.ilike.%${sanitizedSearch}%,reporter_name.ilike.%${sanitizedSearch}%`);
        }
        return query;
      };

      const openQuery = statusFilter === "all" || statusFilter === "open" ? buildStatusCountQuery("open") : null;
      const inProgressQuery = statusFilter === "all" || statusFilter === "in_progress"
        ? buildStatusCountQuery("in_progress")
        : null;
      const resolvedQuery = statusFilter === "all" || statusFilter === "resolved"
        ? buildStatusCountQuery("resolved")
        : null;

      const [pagedRes, summaryRes, totalRes, openRes, inProgressRes, resolvedRes] = await Promise.all([
        pagedQuery,
        summaryQuery,
        totalQuery,
        openQuery ?? Promise.resolve({ count: 0, error: null }),
        inProgressQuery ?? Promise.resolve({ count: 0, error: null }),
        resolvedQuery ?? Promise.resolve({ count: 0, error: null }),
      ]);

      const error = pagedRes.error || summaryRes.error || totalRes.error || openRes.error || inProgressRes.error || resolvedRes.error;
      if (error) throw error;

      setTickets((pagedRes.data || []) as TicketRow[]);
      setSummarySourceTickets((summaryRes.data || []) as TicketRow[]);
      setTotalCount(totalRes.count ?? 0);
      setStats({
        total: totalRes.count ?? 0,
        open: openRes.count ?? 0,
        inProgress: inProgressRes.count ?? 0,
        resolved: resolvedRes.count ?? 0,
      });
      setLastUpdatedAt(new Date());
    } catch (error) {
      const ref = reportError(error, "admin.hr.tickets.load");
      toast.error(appendErrorReference("Gagal memuat data tiket HR", ref));
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, sanitizedSearch, statusFilter, tenantFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const tenantSummaryRows = useMemo<TenantSummary[]>(() => {
    const tenantMap = new Map(tenantOptions.map((tenant) => [tenant.id, tenant]));
    const grouped = new Map<string, TenantSummary>();

    summarySourceTickets.forEach((ticket) => {
      const tenantId = ticket.tenant_id || "unknown";
      const tenant = ticket.tenant_id ? tenantMap.get(ticket.tenant_id) : null;
      const existing = grouped.get(tenantId) || {
        tenantId,
        tenantName: tenant?.name || "Tenant Tidak Diketahui",
        tenantCode: tenant?.code || "-",
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        latestAt: null,
      };
      existing.total += 1;
      if (ticket.status === "open") existing.open += 1;
      if (ticket.status === "in_progress") existing.inProgress += 1;
      if (ticket.status === "resolved") existing.resolved += 1;
      if (!existing.latestAt || new Date(ticket.created_at).getTime() > new Date(existing.latestAt).getTime()) {
        existing.latestAt = ticket.created_at;
      }
      grouped.set(tenantId, existing);
    });

    return Array.from(grouped.values()).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [summarySourceTickets, tenantOptions]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <AdminHRPageShell
      title="Tiket HR Lintas Tenant"
      subtitle="Manajemen tiket bantuan HR"
      description="Pantau tiket HR lintas tenant, lakukan triase, lalu lanjutkan investigasi rinci di manajemen tiket global."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Panel ini tanpa muat ulang otomatis.</p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Memuat..." : `Terakhir diperbarui: ${lastUpdatedAt?.toLocaleString("id-ID") ?? "-"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={isLoading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Muat Ulang
            </Button>
            <Button size="sm" onClick={() => navigate("/admin/hr/help/support")}>
              Buka Dukungan Global HR
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Total</CardTitle>
              <CardDescription>Tiket hasil filter saat ini.</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{isLoading ? "..." : stats.total}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Terbuka</CardTitle>
              <CardDescription>Butuh triase awal.</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{isLoading ? "..." : stats.open}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sedang Diproses</CardTitle>
              <CardDescription>Sedang ditangani.</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{isLoading ? "..." : stats.inProgress}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Selesai</CardTitle>
              <CardDescription>Sudah selesai.</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{isLoading ? "..." : stats.resolved}</CardContent>
          </Card>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cari tiket..."
            className="md:col-span-2"
          />
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | TicketStatus)}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="open">Terbuka</SelectItem>
              <SelectItem value="in_progress">Sedang Diproses</SelectItem>
              <SelectItem value="resolved">Selesai</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tenantFilter} onValueChange={setTenantFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tenant" />
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ringkasan per Tenant</CardTitle>
            <CardDescription>Top 20 tenant berdasarkan jumlah tiket pada filter aktif.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Terbuka</TableHead>
                  <TableHead>Sedang Diproses</TableHead>
                  <TableHead>Selesai</TableHead>
                  <TableHead>Aktivitas Terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantSummaryRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Tidak ada data tenant untuk filter saat ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  tenantSummaryRows.map((row) => (
                    <TableRow key={row.tenantId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.tenantName}</p>
                          <p className="text-xs text-muted-foreground">{row.tenantCode}</p>
                        </div>
                      </TableCell>
                      <TableCell>{row.total}</TableCell>
                      <TableCell>{row.open}</TableCell>
                      <TableCell>{row.inProgress}</TableCell>
                      <TableCell>{row.resolved}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.latestAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tiket Terbaru</CardTitle>
            <CardDescription>{`Halaman ${currentPage} dari ${totalPages} (${totalCount} tiket)`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pelapor</TableHead>
                  <TableHead>Pesan</TableHead>
                  <TableHead>Dibuat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Tidak ada tiket untuk filter saat ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  tickets.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.id.slice(0, 8)}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell>{row.reporter_name || "-"}</TableCell>
                      <TableCell className="max-w-[480px] truncate">{row.message}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between px-4 pb-4">
              <p className="text-xs text-muted-foreground">Menampilkan {tickets.length} tiket per halaman.</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1 || isLoading}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages || isLoading}
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
