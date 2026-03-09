import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type HRContract = Database["public"]["Tables"]["hr_contracts"]["Row"];
type HRContractInsert = Database["public"]["Tables"]["hr_contracts"]["Insert"];
type HRContractUpdate = Database["public"]["Tables"]["hr_contracts"]["Update"];
type ContractType = "PKWT" | "PKWTT" | "MAGANG" | "KONTRAK_LAIN";
type ContractStatus = "draft" | "active" | "ended" | "terminated";
type ContractSortKey = "contract_number" | "contract_type" | "start_date" | "status";

type EmployeeOption = {
  id: string;
  name: string;
  email: string | null;
};

type ContractFormState = {
  employee_id: string;
  contract_number: string;
  contract_type: ContractType;
  start_date: string;
  end_date: string;
  status: ContractStatus;
  notes: string;
};

const initialFormState: ContractFormState = {
  employee_id: "",
  contract_number: "",
  contract_type: "PKWT",
  start_date: "",
  end_date: "",
  status: "active",
  notes: "",
};

const CONTRACT_TYPE_OPTIONS: Array<{ value: ContractType; label: string }> = [
  { value: "PKWT", label: "PKWT" },
  { value: "PKWTT", label: "PKWTT" },
  { value: "MAGANG", label: "Magang" },
  { value: "KONTRAK_LAIN", label: "Kontrak Lain" },
];

const STATUS_OPTIONS: Array<{ value: ContractStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Aktif" },
  { value: "ended", label: "Berakhir" },
  { value: "terminated", label: "Terminasi" },
];
const ITEMS_PER_PAGE = 10;

const toContractType = (value: string): ContractType =>
  value === "PKWT" || value === "PKWTT" || value === "MAGANG" || value === "KONTRAK_LAIN" ? value : "PKWT";

const toContractStatus = (value: string): ContractStatus =>
  value === "draft" || value === "active" || value === "ended" || value === "terminated" ? value : "draft";

const NORMALIZED_MAX_DATE = "9999-12-31";

const hasDateOverlap = (startA: string, endA: string | null, startB: string, endB: string | null) => {
  const normalizedEndA = endA || NORMALIZED_MAX_DATE;
  const normalizedEndB = endB || NORMALIZED_MAX_DATE;
  return startA <= normalizedEndB && startB <= normalizedEndA;
};

export default function OrgHRContracts() {
  const navigate = useNavigate();
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [contracts, setContracts] = useState<HRContract[]>([]);
  const [totalContracts, setTotalContracts] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ContractFormState>(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ContractStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<ContractSortKey>("start_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  const employeeMap = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees]);

  const resolveSearchEmployeeIds = useCallback(
    async (resolvedTenantId: string, searchKeyword: string): Promise<string[]> => {
      const keyword = sanitizeOrKeyword(searchKeyword);
      if (!keyword) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("id")
        .eq("tenant_id", resolvedTenantId)
        .eq("is_active", true)
        .or(`name.ilike.%${keyword}%,email.ilike.%${keyword}%`)
        .limit(1000);
      if (error) throw error;
      return (data || []).map((row) => row.id);
    },
    [],
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const { data: employeeRows, error: employeeError } = await supabase
        .from("employees")
        .select("id, name, email")
        .eq("tenant_id", resolvedTenantId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (employeeError) throw employeeError;
      const employeeList = (employeeRows || []) as EmployeeOption[];
      setEmployees(employeeList);

      let query = supabase
        .from("hr_contracts")
        .select("*", { count: "exact" })
        .eq("tenant_id", resolvedTenantId);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (dateFrom) query = query.gte("start_date", dateFrom);
      if (dateTo) query = query.lte("start_date", dateTo);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const matchedEmployeeIds = await resolveSearchEmployeeIds(resolvedTenantId, keyword);
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["contract_number", "contract_type", "notes"],
          inFilters: [{ field: "employee_id", values: matchedEmployeeIds }],
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

      setContracts(data || []);
      setTotalContracts(count || 0);
    } catch (error) {
      const ref = reportError(error, "org.hr.contracts.fetch");
      const message = appendErrorReference("Gagal memuat data kontrak kerja", ref);
      setLoadError(message);
      toast.error(message);
      setEmployees([]);
      setContracts([]);
      setTotalContracts(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, statusFilter, dateFrom, dateTo, searchTerm, sortBy, sortDir, currentPage, resolveSearchEmployeeIds]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, dateFrom, dateTo, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalContracts / ITEMS_PER_PAGE));

  const resetForm = () => {
    setFormState(initialFormState);
    setEditingContractId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: HRContract) => {
    setEditingContractId(item.id);
    setFormState({
      employee_id: item.employee_id,
      contract_number: item.contract_number || "",
      contract_type: toContractType(item.contract_type),
      start_date: item.start_date,
      end_date: item.end_date || "",
      status: toContractStatus(item.status),
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

      if (!formState.employee_id) {
        toast.error("Pegawai wajib dipilih");
        return;
      }
      if (!formState.start_date) {
        toast.error("Tanggal mulai kontrak wajib diisi");
        return;
      }
      if (formState.end_date && formState.end_date < formState.start_date) {
        toast.error("Tanggal berakhir tidak boleh sebelum tanggal mulai");
        return;
      }
      const normalizedStart = formState.start_date;
      const normalizedEnd = formState.end_date || null;
      const { data: employeeContracts, error: employeeContractsError } = await supabase
        .from("hr_contracts")
        .select("id, start_date, end_date, status")
        .eq("tenant_id", resolvedTenantId)
        .eq("employee_id", formState.employee_id);
      if (employeeContractsError) throw employeeContractsError;

      const hasOverlapWithOtherContract = (employeeContracts || []).some((item) => {
        if (editingContractId && item.id === editingContractId) return false;
        if (item.status === "terminated") return false;
        return hasDateOverlap(normalizedStart, normalizedEnd, item.start_date, item.end_date);
      });
      if (hasOverlapWithOtherContract) {
        toast.error("Rentang kontrak bentrok dengan kontrak lain untuk pegawai yang sama.");
        return;
      }
      if (formState.contract_number.trim().length > 0) {
        let duplicateQuery = supabase
          .from("hr_contracts")
          .select("id")
          .eq("tenant_id", resolvedTenantId)
          .eq("contract_number", formState.contract_number.trim())
          .limit(1);
        if (editingContractId) {
          duplicateQuery = duplicateQuery.neq("id", editingContractId);
        }
        const { data: duplicateRows, error: duplicateError } = await duplicateQuery;
        if (duplicateError) throw duplicateError;
        if ((duplicateRows || []).length > 0) {
          toast.error("Nomor kontrak sudah digunakan. Gunakan nomor lain.");
          return;
        }
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: HRContractInsert = {
        tenant_id: resolvedTenantId,
        employee_id: formState.employee_id,
        contract_number: formState.contract_number.trim() || null,
        contract_type: formState.contract_type,
        start_date: formState.start_date,
        end_date: formState.end_date || null,
        status: formState.status,
        notes: formState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      };

      if (editingContractId) {
        const updatePayload: HRContractUpdate = {
          ...payload,
          created_by: undefined,
          updated_by: user?.id || null,
        };
        const { error } = await supabase
          .from("hr_contracts")
          .update(updatePayload)
          .eq("id", editingContractId)
          .eq("tenant_id", resolvedTenantId);
        if (error) throw error;
        toast.success("Kontrak kerja berhasil diperbarui");
      } else {
        const { error } = await supabase.from("hr_contracts").insert(payload);
        if (error) throw error;
        toast.success("Kontrak kerja berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.contracts.save");
      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";
      if (errorCode === "23505") {
        toast.error(appendErrorReference("Nomor kontrak sudah terdaftar. Gunakan nomor unik.", ref));
        return;
      }
      if (errorCode === "23P01") {
        toast.error(appendErrorReference("Rentang kontrak bentrok dengan kontrak lain untuk pegawai yang sama.", ref));
        return;
      }
      toast.error(appendErrorReference("Gagal menyimpan kontrak kerja", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: HRContract) => {
    if (!(await confirmDialog({
      title: "Hapus Kontrak Kerja",
      description: `Yakin ingin menghapus kontrak ${item.contract_number || item.id}?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    }))) {
      return;
    }

    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const { error } = await supabase
        .from("hr_contracts")
        .delete()
        .eq("id", item.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;

      toast.success("Kontrak kerja berhasil dihapus");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.contracts.delete");
      toast.error(appendErrorReference("Gagal menghapus kontrak kerja", ref));
    }
  };

  const handleExportCsv = async () => {
    if (totalContracts === 0) {
      toast.error("Tidak ada data kontrak untuk diekspor.");
      return;
    }
    if (!tenantId) {
      toast.error("Tenant tidak ditemukan.");
      return;
    }

    let query = supabase.from("hr_contracts").select("*").eq("tenant_id", tenantId);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (dateFrom) query = query.gte("start_date", dateFrom);
    if (dateTo) query = query.lte("start_date", dateTo);

    const keyword = sanitizeOrKeyword(searchTerm);
    if (keyword.length > 0) {
      const matchedEmployeeIds = await resolveSearchEmployeeIds(tenantId, keyword);
      const orClause = buildPostgrestOrClause({
        keyword,
        ilikeFields: ["contract_number", "contract_type", "notes"],
        inFilters: [{ field: "employee_id", values: matchedEmployeeIds }],
      });
      if (orClause) query = query.or(orClause);
    }

    const { data, error } = await query
      .order(sortBy, { ascending: sortDir === "asc" })
      .order("created_at", { ascending: false });
    if (error) {
      const ref = reportError(error, "org.hr.contracts.export");
      toast.error(appendErrorReference("Gagal export CSV kontrak kerja", ref));
      return;
    }

    const lines = [
      ["employee_name", "employee_email", "contract_number", "contract_type", "start_date", "end_date", "status", "notes"].join(","),
      ...(data || []).map((item) => {
        const employee = employeeMap.get(item.employee_id);
        return [
          `"${(employee?.name || "").replaceAll("\"", "\"\"")}"`,
          employee?.email || "",
          item.contract_number || "",
          item.contract_type,
          item.start_date,
          item.end_date || "",
          item.status,
          `"${(item.notes || "").replaceAll("\"", "\"\"")}"`,
        ].join(",");
      }),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hr-contracts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("Export CSV kontrak kerja berhasil.");
  };

  const getTimelineRisk = useCallback((item: HRContract) => {
    if (item.status !== "active" || !item.end_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(`${item.end_date}T00:00:00`);
    if (Number.isNaN(endDate.getTime())) return null;
    if (endDate < today) return "overdue";
    const inThirtyDays = new Date(today);
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);
    if (endDate <= inThirtyDays) return "expiring";
    return null;
  }, []);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Badge variant="outline">HR Core</Badge>
            <h1 className="text-2xl font-semibold tracking-tight">Kontrak Kerja</h1>
            <p className="text-sm text-muted-foreground">Kelola kontrak pegawai aktif per tenant (PKWT/PKWTT/magang).</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/org/hr")}> 
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Button>
            <Button variant="outline" onClick={() => void handleExportCsv()}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Tambah Kontrak
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Daftar Kontrak
            </CardTitle>
            <CardDescription>Total {totalContracts} kontrak tercatat.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Cari nama pegawai, email, nomor kontrak..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | ContractStatus)}>
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
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as ContractSortKey)}>
                <SelectTrigger>
                  <SelectValue placeholder="Urutkan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start_date">Sort: Tanggal Mulai</SelectItem>
                  <SelectItem value="contract_number">Sort: Nomor Kontrak</SelectItem>
                  <SelectItem value="contract_type">Sort: Tipe</SelectItem>
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
              <p className="text-sm text-muted-foreground">Memuat kontrak kerja...</p>
            ) : contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada kontrak kerja.</p>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pegawai</TableHead>
                      <TableHead>Nomor Kontrak</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Masa Berlaku</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((item) => {
                      const employee = employeeMap.get(item.employee_id);
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{employee?.name || "Pegawai tidak ditemukan"}</div>
                            <div className="text-xs text-muted-foreground">{employee?.email || "-"}</div>
                          </TableCell>
                          <TableCell>{item.contract_number || "-"}</TableCell>
                          <TableCell>{item.contract_type}</TableCell>
                          <TableCell>{item.start_date} {item.end_date ? `s/d ${item.end_date}` : "(tanpa akhir)"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary">{item.status}</Badge>
                              {getTimelineRisk(item) === "overdue" ? (
                                <Badge variant="destructive">Overdue</Badge>
                              ) : null}
                              {getTimelineRisk(item) === "expiring" ? (
                                <Badge className="bg-amber-600 hover:bg-amber-600">{"<=30 Hari"}</Badge>
                              ) : null}
                            </div>
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
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Menampilkan {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, totalContracts)} - {Math.min(currentPage * ITEMS_PER_PAGE, totalContracts)} dari {totalContracts}
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
              <DialogTitle>{editingContractId ? "Edit Kontrak Kerja" : "Tambah Kontrak Kerja"}</DialogTitle>
              <DialogDescription>Pastikan data kontrak sesuai data legal organisasi.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Pegawai</Label>
                <Select value={formState.employee_id} onValueChange={(value) => setFormState((prev) => ({ ...prev, employee_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih pegawai" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name} {item.email ? `(${item.email})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contract_number">Nomor Kontrak</Label>
                <Input id="contract_number" value={formState.contract_number} onChange={(event) => setFormState((prev) => ({ ...prev, contract_number: event.target.value }))} placeholder="Opsional" />
              </div>
              <div className="space-y-2">
                <Label>Tipe Kontrak</Label>
                <Select value={formState.contract_type} onValueChange={(value) => setFormState((prev) => ({ ...prev, contract_type: value as ContractType }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPE_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_date">Tanggal Mulai</Label>
                <Input id="start_date" type="date" value={formState.start_date} onChange={(event) => setFormState((prev) => ({ ...prev, start_date: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">Tanggal Berakhir</Label>
                <Input id="end_date" type="date" value={formState.end_date} onChange={(event) => setFormState((prev) => ({ ...prev, end_date: event.target.value }))} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Status</Label>
                <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value as ContractStatus }))}>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Catatan</Label>
              <Textarea id="notes" value={formState.notes} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Catatan kontrak (opsional)" rows={3} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Batal</Button>
              <Button onClick={() => void handleSave()} disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}
