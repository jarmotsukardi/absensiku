import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarClock, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { buildPostgrestOrClause, sanitizeOrKeyword } from "@/lib/postgrestSearch";
import { fetchSupabaseRest } from "@/lib/supabaseRestClient";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type PayrollPeriod = Database["public"]["Tables"]["payroll_periods"]["Row"];
type PayrollPeriodInsert = Database["public"]["Tables"]["payroll_periods"]["Insert"];
type PayrollPeriodUpdate = Database["public"]["Tables"]["payroll_periods"]["Update"];

type PeriodStatus = "draft" | "review" | "approved" | "paid" | "archived";
type PeriodSortKey = "period_key" | "period_start" | "period_end" | "status";

type PeriodFormState = {
  period_key: string;
  period_start: string;
  period_end: string;
  cutoff_date: string;
  status: PeriodStatus;
  notes: string;
};

const initialFormState: PeriodFormState = {
  period_key: "",
  period_start: "",
  period_end: "",
  cutoff_date: "",
  status: "draft",
  notes: "",
};

const STATUS_OPTIONS: Array<{ value: PeriodStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Tinjau" },
  { value: "approved", label: "Disetujui" },
  { value: "paid", label: "Dibayar" },
  { value: "archived", label: "Arsip" },
];

const buildDefaultPeriodKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const ITEMS_PER_PAGE = 10;

const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  draft: "Draft",
  review: "Tinjau",
  approved: "Disetujui",
  paid: "Dibayar",
  archived: "Arsip",
};

export default function OrgPayrollPeriods() {
  const navigate = useNavigate();
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [totalPeriods, setTotalPeriods] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<PeriodStatus, number>>({
    draft: 0,
    review: 0,
    approved: 0,
    paid: 0,
    archived: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [formState, setFormState] = useState<PeriodFormState>({
    ...initialFormState,
    period_key: buildDefaultPeriodKey(),
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PeriodStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<PeriodSortKey>("period_start");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchPeriods = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      let query = supabase
        .from("payroll_periods")
        .select("*", { count: "exact" })
        .eq("tenant_id", resolvedTenantId);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (dateFrom) query = query.gte("period_start", dateFrom);
      if (dateTo) query = query.lte("period_end", dateTo);
      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["period_key", "notes"],
        });
        if (orClause) query = query.or(orClause);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, error, count } = await query
        .order(sortBy, { ascending: sortDir === "asc" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      setPeriods(data || []);
      setTotalPeriods(count || 0);

      const [draftRes, reviewRes, approvedRes, paidRes, archivedRes] = await Promise.all([
        supabase.from("payroll_periods").select("id", { head: true, count: "exact" }).eq("tenant_id", resolvedTenantId).eq("status", "draft"),
        supabase.from("payroll_periods").select("id", { head: true, count: "exact" }).eq("tenant_id", resolvedTenantId).eq("status", "review"),
        supabase.from("payroll_periods").select("id", { head: true, count: "exact" }).eq("tenant_id", resolvedTenantId).eq("status", "approved"),
        supabase.from("payroll_periods").select("id", { head: true, count: "exact" }).eq("tenant_id", resolvedTenantId).eq("status", "paid"),
        supabase.from("payroll_periods").select("id", { head: true, count: "exact" }).eq("tenant_id", resolvedTenantId).eq("status", "archived"),
      ]);

      if (draftRes.error || reviewRes.error || approvedRes.error || paidRes.error || archivedRes.error) {
        throw draftRes.error || reviewRes.error || approvedRes.error || paidRes.error || archivedRes.error;
      }
      setStatusCounts({
        draft: draftRes.count || 0,
        review: reviewRes.count || 0,
        approved: approvedRes.count || 0,
        paid: paidRes.count || 0,
        archived: archivedRes.count || 0,
      });
    } catch (error) {
      const ref = reportError(error, "org.payroll.periods.fetch");
      const message = appendErrorReference("Gagal memuat periode payroll", ref);
      setLoadError(message);
      toast.error(message);
      setPeriods([]);
      setTotalPeriods(0);
      setStatusCounts({ draft: 0, review: 0, approved: 0, paid: 0, archived: 0 });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, statusFilter, dateFrom, dateTo, searchTerm, sortBy, sortDir, currentPage]);

  useEffect(() => {
    void fetchPeriods();
  }, [fetchPeriods]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, dateFrom, dateTo, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalPeriods / ITEMS_PER_PAGE));

  const resetForm = () => {
    setFormState({
      ...initialFormState,
      period_key: buildDefaultPeriodKey(),
    });
    setEditingPeriodId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: PayrollPeriod) => {
    setEditingPeriodId(item.id);
    setFormState({
      period_key: item.period_key,
      period_start: item.period_start,
      period_end: item.period_end,
      cutoff_date: item.cutoff_date || "",
      status: item.status as PeriodStatus,
      notes: item.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const periodKey = formState.period_key.trim();
      if (!periodKey) {
        toast.error("Kode periode wajib diisi.");
        return;
      }
      if (!formState.period_start || !formState.period_end) {
        toast.error("Tanggal awal dan akhir periode wajib diisi");
        return;
      }
      if (new Date(formState.period_end) < new Date(formState.period_start)) {
        toast.error("Tanggal akhir tidak boleh sebelum tanggal awal");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollPeriodInsert = {
        tenant_id: resolvedTenantId,
        period_key: periodKey,
        period_start: formState.period_start,
        period_end: formState.period_end,
        cutoff_date: formState.cutoff_date || null,
        status: formState.status,
        notes: formState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      };

      if (editingPeriodId) {
        const updatePayload: PayrollPeriodUpdate = {
          ...payload,
          created_by: undefined,
          updated_by: user?.id || null,
        };
        await fetchSupabaseRest<null>("payroll_periods", {
          method: "PATCH",
          params: {
            id: `eq.${editingPeriodId}`,
            tenant_id: `eq.${resolvedTenantId}`,
          },
          body: updatePayload,
        });
        toast.success("Periode payroll berhasil diperbarui");
      } else {
        await fetchSupabaseRest<null>("payroll_periods", {
          method: "POST",
          body: payload,
        });
        toast.success("Periode payroll berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      await fetchPeriods();
    } catch (error) {
      const ref = reportError(error, "org.payroll.periods.save");
      toast.error(appendErrorReference("Gagal menyimpan periode payroll", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: PayrollPeriod) => {
    if (!(await confirmDialog({
      title: "Hapus Periode Payroll",
      description: `Yakin ingin menghapus periode ${item.period_key}?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    }))) {
      return;
    }

    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      await fetchSupabaseRest<null>("payroll_periods", {
        method: "DELETE",
        params: {
          id: `eq.${item.id}`,
          tenant_id: `eq.${resolvedTenantId}`,
        },
      });

      toast.success("Periode payroll berhasil dihapus");
      await fetchPeriods();
    } catch (error) {
      const ref = reportError(error, "org.payroll.periods.delete");
      toast.error(appendErrorReference("Gagal menghapus periode payroll", ref));
    }
  };

  const handleExportCsv = async () => {
    if (totalPeriods === 0) {
      toast.error("Tidak ada data periode untuk diekspor.");
      return;
    }
    if (!tenantId) {
      toast.error("Tenant tidak ditemukan.");
      return;
    }

    const keyword = sanitizeOrKeyword(searchTerm);
    let query = supabase.from("payroll_periods").select("*").eq("tenant_id", tenantId);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (dateFrom) query = query.gte("period_start", dateFrom);
    if (dateTo) query = query.lte("period_end", dateTo);
    if (keyword.length > 0) {
      const orClause = buildPostgrestOrClause({
        keyword,
        ilikeFields: ["period_key", "notes"],
      });
      if (orClause) query = query.or(orClause);
    }

    const { data, error } = await query
      .order(sortBy, { ascending: sortDir === "asc" })
      .order("created_at", { ascending: false });
    if (error) {
      const ref = reportError(error, "org.payroll.periods.export");
      toast.error(appendErrorReference("Gagal export CSV periode payroll", ref));
      return;
    }

    const lines = [
      ["period_key", "period_start", "period_end", "cutoff_date", "status", "notes"].join(","),
      ...(data || []).map((item) =>
        [
          item.period_key,
          item.period_start,
          item.period_end,
          item.cutoff_date || "",
          item.status,
          `"${(item.notes || "").replaceAll("\"", "\"\"")}"`,
        ].join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payroll-periods-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("Export CSV periode payroll berhasil.");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Periode Payroll</h1>
            <p className="text-sm text-muted-foreground">
              Kelola siklus payroll bulanan setelah kebijakan payroll siap dipakai.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/org/payroll")}> 
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Beranda
            </Button>
            <Button variant="outline" onClick={() => void handleExportCsv()}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Tambah Periode
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Periode aktif kerja</CardDescription>
              <CardTitle className="text-2xl">{totalPeriods}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Pantau periode yang sedang dibuka, ditinjau, atau sudah disetujui.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fokus tahap ini</CardDescription>
              <CardTitle className="text-lg">Siklus bulanan</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Pastikan setiap periode punya tanggal mulai, tanggal selesai, cutoff, dan status yang jelas.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Langkah berikutnya</CardDescription>
              <CardTitle className="text-lg">Input Variabel</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => navigate("/org/payroll/variable-input")}>
                Buka Input Variabel
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Daftar Periode
            </CardTitle>
            <CardDescription>
              Draft: {statusCounts.draft} • Tinjau: {statusCounts.review} • Disetujui: {statusCounts.approved} • Dibayar: {statusCounts.paid} • Arsip: {statusCounts.archived}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Cari period key, tanggal, atau catatan..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | PeriodStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  {STATUS_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as PeriodSortKey)}>
                <SelectTrigger>
                  <SelectValue placeholder="Urutkan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="period_start">Urutkan: Tanggal Mulai</SelectItem>
                  <SelectItem value="period_end">Urutkan: Tanggal Akhir</SelectItem>
                  <SelectItem value="period_key">Urutkan: Kode Periode</SelectItem>
                  <SelectItem value="status">Urutkan: Status</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortDir} onValueChange={(value) => setSortDir(value as "asc" | "desc")}>
                <SelectTrigger>
                  <SelectValue placeholder="Arah Urut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Naik (ASC)</SelectItem>
                  <SelectItem value="desc">Turun (DESC)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Memuat periode payroll...</p>
            ) : periods.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada periode payroll.</p>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Cutoff</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periods.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.period_key}</TableCell>
                        <TableCell>{item.period_start} s/d {item.period_end}</TableCell>
                        <TableCell>{item.cutoff_date || "-"}</TableCell>
                        <TableCell><Badge variant="secondary">{PERIOD_STATUS_LABELS[item.status as PeriodStatus]}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEditDialog(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => void handleDelete(item)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Menampilkan {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, totalPeriods)} - {Math.min(currentPage * ITEMS_PER_PAGE, totalPeriods)} dari {totalPeriods}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1}>
                      Sebelumnya
                    </Button>
                    <span className="text-sm text-muted-foreground">Halaman {currentPage} / {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage >= totalPages}>
                      Berikutnya
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingPeriodId ? "Edit Periode Payroll" : "Tambah Periode Payroll"}</DialogTitle>
              <DialogDescription>
                Setiap periode sebaiknya unik per tenant agar proses payroll tetap rapi dan deterministik.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="period_key">Kode Periode</Label>
                <Input id="period_key" value={formState.period_key} onChange={(event) => setFormState((prev) => ({ ...prev, period_key: event.target.value }))} placeholder="Contoh: 2026-02" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value as PeriodStatus }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="period_start">Tanggal Mulai</Label>
                <Input id="period_start" type="date" value={formState.period_start} onChange={(event) => setFormState((prev) => ({ ...prev, period_start: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period_end">Tanggal Selesai</Label>
                <Input id="period_end" type="date" value={formState.period_end} onChange={(event) => setFormState((prev) => ({ ...prev, period_end: event.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cutoff_date">Tanggal Cutoff (Opsional)</Label>
              <Input id="cutoff_date" type="date" value={formState.cutoff_date} onChange={(event) => setFormState((prev) => ({ ...prev, cutoff_date: event.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea id="notes" value={formState.notes} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Catatan periode payroll (opsional)" rows={3} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Batal</Button>
              <Button onClick={() => void handleSave()} disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <OrgPayrollPageGuide pathname="/org/payroll/periods" />
      </div>
    </OrganizationLayout>
  );
}
