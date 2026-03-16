import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calculator, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

type PayrollPolicy = Database["public"]["Tables"]["payroll_policies"]["Row"];
type PayrollPolicyInsert = Database["public"]["Tables"]["payroll_policies"]["Insert"];
type PayrollPolicyUpdate = Database["public"]["Tables"]["payroll_policies"]["Update"];

type PolicyFormState = {
  cutoff_day: string;
  prorate_enabled: boolean;
  rounding_mode: string;
  overtime_source: string;
  late_penalty_enabled: boolean;
  late_penalty_per_minute: string;
  effective_date: string;
  is_active: boolean;
  notes: string;
};
type PolicySortKey = "effective_date" | "cutoff_day" | "rounding_mode" | "status";

const initialFormState: PolicyFormState = {
  cutoff_day: "25",
  prorate_enabled: true,
  rounding_mode: "nearest_100",
  overtime_source: "attendance",
  late_penalty_enabled: false,
  late_penalty_per_minute: "0",
  effective_date: new Date().toISOString().slice(0, 10),
  is_active: true,
  notes: "",
};

const ROUNDING_OPTIONS = [
  { value: "none", label: "Tanpa Pembulatan" },
  { value: "up", label: "Selalu ke Atas" },
  { value: "down", label: "Selalu ke Bawah" },
  { value: "nearest_1", label: "Terdekat 1" },
  { value: "nearest_10", label: "Terdekat 10" },
  { value: "nearest_100", label: "Terdekat 100" },
  { value: "nearest_1000", label: "Terdekat 1000" },
];

const OVERTIME_OPTIONS = [
  { value: "attendance", label: "Absensi" },
  { value: "manual", label: "Input Manual" },
  { value: "hybrid", label: "Hybrid" },
];
const ITEMS_PER_PAGE = 10;

const ROUNDING_LABELS: Record<string, string> = Object.fromEntries(
  ROUNDING_OPTIONS.map((item) => [item.value, item.label]),
);

const OVERTIME_LABELS: Record<string, string> = Object.fromEntries(
  OVERTIME_OPTIONS.map((item) => [item.value, item.label]),
);

export default function OrgPayrollPolicies() {
  const navigate = useNavigate();
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<PayrollPolicy[]>([]);
  const [totalPolicies, setTotalPolicies] = useState(0);
  const [activePolicies, setActivePolicies] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [formState, setFormState] = useState<PolicyFormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<PolicySortKey>("effective_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchPolicies = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      let query = supabase
        .from("payroll_policies")
        .select("*", { count: "exact" })
        .eq("tenant_id", resolvedTenantId);

      if (statusFilter !== "all") query = query.eq("is_active", statusFilter === "active");
      if (dateFrom) query = query.gte("effective_date", dateFrom);
      if (dateTo) query = query.lte("effective_date", dateTo);
      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["rounding_mode", "overtime_source", "notes"],
        });
        if (orClause) query = query.or(orClause);
      }

      const sortField = sortBy === "status" ? "is_active" : sortBy;
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const { data, error, count } = await query
        .order(sortField, { ascending: sortDir === "asc" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;

      setPolicies(data || []);
      setTotalPolicies(count || 0);

      const { count: activeCount, error: activeError } = await supabase
        .from("payroll_policies")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", resolvedTenantId)
        .eq("is_active", true);
      if (activeError) throw activeError;
      setActivePolicies(activeCount || 0);
    } catch (error) {
      const ref = reportError(error, "org.payroll.policies.fetch");
      const message = appendErrorReference("Gagal memuat data kebijakan payroll", ref);
      setLoadError(message);
      toast.error(message);
      setPolicies([]);
      setTotalPolicies(0);
      setActivePolicies(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, statusFilter, dateFrom, dateTo, searchTerm, sortBy, sortDir, currentPage]);

  useEffect(() => {
    void fetchPolicies();
  }, [fetchPolicies]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, dateFrom, dateTo, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalPolicies / ITEMS_PER_PAGE));

  const resetForm = () => {
    setFormState(initialFormState);
    setEditingPolicyId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: PayrollPolicy) => {
    setEditingPolicyId(item.id);
    setFormState({
      cutoff_day: String(item.cutoff_day),
      prorate_enabled: item.prorate_enabled,
      rounding_mode: item.rounding_mode,
      overtime_source: item.overtime_source,
      late_penalty_enabled: item.late_penalty_enabled,
      late_penalty_per_minute: String(item.late_penalty_per_minute ?? 0),
      effective_date: item.effective_date,
      is_active: item.is_active,
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

      const cutoffDay = Number(formState.cutoff_day);
      if (!Number.isFinite(cutoffDay) || cutoffDay < 1 || cutoffDay > 31) {
        toast.error("Tanggal cutoff harus diisi antara 1 sampai 31.");
        return;
      }

      const latePenalty = Number(formState.late_penalty_per_minute || "0");
      if (!Number.isFinite(latePenalty) || latePenalty < 0) {
        toast.error("Nominal denda terlambat tidak valid");
        return;
      }

      if (!formState.effective_date) {
        toast.error("Tanggal efektif wajib diisi");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: PayrollPolicyInsert = {
        tenant_id: resolvedTenantId,
        cutoff_day: cutoffDay,
        prorate_enabled: formState.prorate_enabled,
        rounding_mode: formState.rounding_mode,
        overtime_source: formState.overtime_source,
        late_penalty_enabled: formState.late_penalty_enabled,
        late_penalty_per_minute: latePenalty,
        effective_date: formState.effective_date,
        is_active: formState.is_active,
        notes: formState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      };

      if (editingPolicyId) {
        const updatePayload: PayrollPolicyUpdate = {
          ...payload,
          created_by: undefined,
          updated_by: user?.id || null,
        };
        await fetchSupabaseRest<null>("payroll_policies", {
          method: "PATCH",
          params: {
            id: `eq.${editingPolicyId}`,
            tenant_id: `eq.${resolvedTenantId}`,
          },
          body: updatePayload,
        });
        toast.success("Kebijakan payroll berhasil diperbarui");
      } else {
        await fetchSupabaseRest<null>("payroll_policies", {
          method: "POST",
          body: payload,
        });
        toast.success("Kebijakan payroll berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      await fetchPolicies();
    } catch (error) {
      const ref = reportError(error, "org.payroll.policies.save");
      toast.error(appendErrorReference("Gagal menyimpan kebijakan payroll", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: PayrollPolicy) => {
    if (!(await confirmDialog({
      title: "Hapus Kebijakan Payroll",
      description: `Yakin ingin menghapus kebijakan efektif ${item.effective_date}?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    }))) {
      return;
    }

    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      await fetchSupabaseRest<null>("payroll_policies", {
        method: "DELETE",
        params: {
          id: `eq.${item.id}`,
          tenant_id: `eq.${resolvedTenantId}`,
        },
      });

      toast.success("Kebijakan payroll berhasil dihapus");
      await fetchPolicies();
    } catch (error) {
      const ref = reportError(error, "org.payroll.policies.delete");
      toast.error(appendErrorReference("Gagal menghapus kebijakan payroll", ref));
    }
  };

  const handleExportCsv = async () => {
    if (totalPolicies === 0) {
      toast.error("Tidak ada data kebijakan untuk diekspor.");
      return;
    }
    if (!tenantId) {
      toast.error("Tenant tidak ditemukan.");
      return;
    }

    const keyword = sanitizeOrKeyword(searchTerm);
    let query = supabase.from("payroll_policies").select("*").eq("tenant_id", tenantId);
    if (statusFilter !== "all") query = query.eq("is_active", statusFilter === "active");
    if (dateFrom) query = query.gte("effective_date", dateFrom);
    if (dateTo) query = query.lte("effective_date", dateTo);
    if (keyword.length > 0) {
      const orClause = buildPostgrestOrClause({
        keyword,
        ilikeFields: ["rounding_mode", "overtime_source", "notes"],
      });
      if (orClause) query = query.or(orClause);
    }

    const sortField = sortBy === "status" ? "is_active" : sortBy;
    const { data, error } = await query
      .order(sortField, { ascending: sortDir === "asc" })
      .order("created_at", { ascending: false });
    if (error) {
      const ref = reportError(error, "org.payroll.policies.export");
      toast.error(appendErrorReference("Gagal export CSV kebijakan payroll", ref));
      return;
    }

    const exportRows = data || [];
    const lines = [
      ["effective_date", "cutoff_day", "rounding_mode", "overtime_source", "prorate_enabled", "late_penalty_enabled", "late_penalty_per_minute", "is_active", "notes"].join(","),
      ...exportRows.map((item) =>
        [
          item.effective_date,
          item.cutoff_day,
          item.rounding_mode,
          item.overtime_source,
          item.prorate_enabled ? "true" : "false",
          item.late_penalty_enabled ? "true" : "false",
          item.late_penalty_per_minute,
          item.is_active ? "true" : "false",
          `"${(item.notes || "").replaceAll("\"", "\"\"")}"`,
        ].join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payroll-policies-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("Export CSV kebijakan payroll berhasil.");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Inti</Badge>
              <Badge variant="outline">Kebijakan Payroll</Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Kebijakan Payroll</h1>
            <p className="text-sm text-muted-foreground">
              Tetapkan aturan dasar payroll sebelum membuka periode dan menjalankan proses payroll.
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
              Tambah Kebijakan
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Kebijakan aktif</CardDescription>
              <CardTitle className="text-2xl">{activePolicies}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Gunakan satu kebijakan aktif yang benar-benar berlaku untuk periode berjalan.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fokus tahap ini</CardDescription>
              <CardTitle className="text-lg">Aturan dasar payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Selesaikan cutoff, prorata, pembulatan, dan sumber lembur sebelum masuk ke periode payroll.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Langkah berikutnya</CardDescription>
              <CardTitle className="text-lg">Periode Payroll</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => navigate("/org/payroll/periods")}>
                Buka Periode Payroll
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Daftar Kebijakan
            </CardTitle>
            <CardDescription>
              Total {totalPolicies} kebijakan, {activePolicies} aktif. Pastikan hanya kebijakan yang relevan
              untuk periode berjalan yang tetap aktif.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Cari tanggal efektif, mode pembulatan, catatan..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "active" | "inactive")}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as PolicySortKey)}>
                <SelectTrigger>
                  <SelectValue placeholder="Urutkan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="effective_date">Urutkan: Tanggal Efektif</SelectItem>
                  <SelectItem value="cutoff_day">Urutkan: Tanggal Cutoff</SelectItem>
                  <SelectItem value="rounding_mode">Sort: Pembulatan</SelectItem>
                  <SelectItem value="status">Sort: Status</SelectItem>
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
              <p className="text-sm text-muted-foreground">Memuat kebijakan payroll...</p>
            ) : policies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada kebijakan payroll.</p>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal Efektif</TableHead>
                      <TableHead>Cutoff</TableHead>
                      <TableHead>Pembulatan</TableHead>
                      <TableHead>Sumber Lembur</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.effective_date}</TableCell>
                        <TableCell>Tanggal {item.cutoff_day}</TableCell>
                        <TableCell>{ROUNDING_LABELS[item.rounding_mode] || item.rounding_mode}</TableCell>
                        <TableCell>{OVERTIME_LABELS[item.overtime_source] || item.overtime_source}</TableCell>
                        <TableCell>
                          <Badge variant={item.is_active ? "default" : "secondary"}>{item.is_active ? "Aktif" : "Nonaktif"}</Badge>
                        </TableCell>
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
                    Menampilkan {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, totalPolicies)} - {Math.min(currentPage * ITEMS_PER_PAGE, totalPolicies)} dari {totalPolicies}
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
              <DialogTitle>{editingPolicyId ? "Edit Kebijakan Payroll" : "Tambah Kebijakan Payroll"}</DialogTitle>
              <DialogDescription>
                Pastikan kebijakan ini benar-benar siap dipakai sebagai dasar periode payroll.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="effective_date">Tanggal Efektif</Label>
                <Input id="effective_date" type="date" value={formState.effective_date} onChange={(event) => setFormState((prev) => ({ ...prev, effective_date: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cutoff_day">Tanggal Cutoff (1-31)</Label>
                <Input id="cutoff_day" type="number" min={1} max={31} value={formState.cutoff_day} onChange={(event) => setFormState((prev) => ({ ...prev, cutoff_day: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Pembulatan</Label>
                <Select value={formState.rounding_mode} onValueChange={(value) => setFormState((prev) => ({ ...prev, rounding_mode: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUNDING_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sumber Lembur</Label>
                <Select value={formState.overtime_source} onValueChange={(value) => setFormState((prev) => ({ ...prev, overtime_source: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih sumber" />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERTIME_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="prorate_enabled">Prorata Aktif</Label>
                  <Switch id="prorate_enabled" checked={formState.prorate_enabled} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, prorate_enabled: checked }))} />
                </div>
                <p className="text-xs text-muted-foreground">Hitung gaji proporsional saat pegawai masuk/keluar tengah periode.</p>
              </div>
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="is_active">Kebijakan Aktif</Label>
                  <Switch id="is_active" checked={formState.is_active} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, is_active: checked }))} />
                </div>
                <p className="text-xs text-muted-foreground">Kebijakan nonaktif tetap disimpan sebagai histori.</p>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="late_penalty_enabled">Aktifkan Denda Keterlambatan</Label>
                <Switch id="late_penalty_enabled" checked={formState.late_penalty_enabled} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, late_penalty_enabled: checked }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="late_penalty_per_minute">Nominal Denda per Menit</Label>
                <Input id="late_penalty_per_minute" type="number" min={0} step="1" value={formState.late_penalty_per_minute} onChange={(event) => setFormState((prev) => ({ ...prev, late_penalty_per_minute: event.target.value }))} disabled={!formState.late_penalty_enabled} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea id="notes" value={formState.notes} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Catatan kebijakan (opsional)" rows={3} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Batal</Button>
              <Button onClick={() => void handleSave()} disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <OrgPayrollPageGuide pathname="/org/payroll/policies" />
      </div>
    </OrganizationLayout>
  );
}
