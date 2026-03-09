import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type IncomeRow = Database["public"]["Tables"]["payroll_income_components"]["Row"];
type IncomeInsert = Database["public"]["Tables"]["payroll_income_components"]["Insert"];
type IncomeUpdate = Database["public"]["Tables"]["payroll_income_components"]["Update"];
type DeductionRow = Database["public"]["Tables"]["payroll_deduction_components"]["Row"];
type DeductionInsert = Database["public"]["Tables"]["payroll_deduction_components"]["Insert"];
type DeductionUpdate = Database["public"]["Tables"]["payroll_deduction_components"]["Update"];

type PayrollComponent = IncomeRow | DeductionRow;

type ComponentFormState = {
  code: string;
  name: string;
  component_type: string;
  calculation_mode: string;
  default_amount: string;
  is_taxable: boolean;
  is_mandatory: boolean;
  is_active: boolean;
  sort_order: string;
  notes: string;
};

type ComponentSortKey = "code" | "name" | "component_type" | "sort_order" | "status";

type PayrollComponentsBaseProps = {
  title: string;
  description: string;
  tableName: "payroll_income_components" | "payroll_deduction_components";
  createTitle: string;
  editTitle: string;
  exportFilenamePrefix: string;
  searchPlaceholder: string;
  componentTypeOptions: Array<{ value: string; label: string }>;
  backPath: string;
  routeErrorScope: string;
};

const CALCULATION_OPTIONS = [
  { value: "fixed_amount", label: "Nominal Tetap" },
  { value: "percentage", label: "Persentase" },
  { value: "formula", label: "Formula" },
];

const ITEMS_PER_PAGE = 10;

const initialFormState: ComponentFormState = {
  code: "",
  name: "",
  component_type: "fixed",
  calculation_mode: "fixed_amount",
  default_amount: "0",
  is_taxable: true,
  is_mandatory: false,
  is_active: true,
  sort_order: "0",
  notes: "",
};

const toCsvSafe = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

export function OrgPayrollComponentsBase({
  title,
  description,
  tableName,
  createTitle,
  editTitle,
  exportFilenamePrefix,
  searchPlaceholder,
  componentTypeOptions,
  backPath,
  routeErrorScope,
}: PayrollComponentsBaseProps) {
  const navigate = useNavigate();
  const confirmDialog = useConfirmDialog();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rows, setRows] = useState<PayrollComponent[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ComponentFormState>({
    ...initialFormState,
    component_type: componentTypeOptions[0]?.value || "fixed",
    is_taxable: tableName === "payroll_income_components",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [componentTypeFilter, setComponentTypeFilter] = useState<"all" | string>("all");
  const [sortBy, setSortBy] = useState<ComponentSortKey>("sort_order");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchRows = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      let query = supabase
        .from(tableName)
        .select("*", { count: "exact" })
        .eq("tenant_id", resolvedTenantId);

      if (statusFilter !== "all") query = query.eq("is_active", statusFilter === "active");
      if (componentTypeFilter !== "all") query = query.eq("component_type", componentTypeFilter);

      const keyword = sanitizeOrKeyword(searchTerm);
      if (keyword.length > 0) {
        const orClause = buildPostgrestOrClause({
          keyword,
          ilikeFields: ["code", "name", "notes", "component_type", "calculation_mode"],
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

      setRows((data || []) as PayrollComponent[]);
      setTotalRows(count || 0);

      const { count: activeRows, error: activeError } = await supabase
        .from(tableName)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", resolvedTenantId)
        .eq("is_active", true);
      if (activeError) throw activeError;
      setActiveCount(activeRows || 0);
    } catch (error) {
      const ref = reportError(error, `${routeErrorScope}.fetch`);
      const message = appendErrorReference(`Gagal memuat ${title.toLowerCase()}`, ref);
      setLoadError(message);
      toast.error(message);
      setRows([]);
      setTotalRows(0);
      setActiveCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, tableName, statusFilter, componentTypeFilter, searchTerm, currentPage, sortBy, sortDir, title, routeErrorScope]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, componentTypeFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));

  const resetForm = () => {
    setFormState({
      ...initialFormState,
      component_type: componentTypeOptions[0]?.value || "fixed",
      is_taxable: tableName === "payroll_income_components",
    });
    setEditingId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (row: PayrollComponent) => {
    setEditingId(row.id);
    setFormState({
      code: row.code,
      name: row.name,
      component_type: row.component_type,
      calculation_mode: row.calculation_mode,
      default_amount: String(row.default_amount),
      is_taxable: row.is_taxable,
      is_mandatory: row.is_mandatory,
      is_active: row.is_active,
      sort_order: String(row.sort_order),
      notes: row.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const defaultAmount = Number(formState.default_amount || "0");
      const sortOrder = Number(formState.sort_order || "0");
      if (!Number.isFinite(defaultAmount) || defaultAmount < 0) {
        toast.error("Nominal default harus >= 0");
        return;
      }
      if (!Number.isInteger(sortOrder) || sortOrder < 0) {
        toast.error("Urutan tampil harus bilangan bulat >= 0");
        return;
      }
      if (!formState.code.trim() || !formState.name.trim()) {
        toast.error("Kode dan nama komponen wajib diisi");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        tenant_id: resolvedTenantId,
        code: formState.code.trim().toUpperCase(),
        name: formState.name.trim(),
        component_type: formState.component_type,
        calculation_mode: formState.calculation_mode,
        default_amount: defaultAmount,
        is_taxable: formState.is_taxable,
        is_mandatory: formState.is_mandatory,
        is_active: formState.is_active,
        sort_order: sortOrder,
        notes: formState.notes.trim() || null,
        updated_by: user?.id || null,
      };

      if (tableName === "payroll_income_components") {
        if (editingId) {
          const updatePayload: IncomeUpdate = payload;
          const { error } = await supabase
            .from("payroll_income_components")
            .update(updatePayload)
            .eq("id", editingId)
            .eq("tenant_id", resolvedTenantId);
          if (error) throw error;
        } else {
          const insertPayload: IncomeInsert = {
            ...payload,
            tenant_id: resolvedTenantId,
            created_by: user?.id || null,
          };
          const { error } = await supabase.from("payroll_income_components").insert(insertPayload);
          if (error) throw error;
        }
      } else {
        if (editingId) {
          const updatePayload: DeductionUpdate = payload;
          const { error } = await supabase
            .from("payroll_deduction_components")
            .update(updatePayload)
            .eq("id", editingId)
            .eq("tenant_id", resolvedTenantId);
          if (error) throw error;
        } else {
          const insertPayload: DeductionInsert = {
            ...payload,
            tenant_id: resolvedTenantId,
            created_by: user?.id || null,
          };
          const { error } = await supabase.from("payroll_deduction_components").insert(insertPayload);
          if (error) throw error;
        }
      }

      toast.success(`${title} berhasil ${editingId ? "diperbarui" : "ditambahkan"}`);
      setIsDialogOpen(false);
      resetForm();
      await fetchRows();
    } catch (error) {
      const ref = reportError(error, `${routeErrorScope}.save`);
      toast.error(appendErrorReference(`Gagal menyimpan ${title.toLowerCase()}`, ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (row: PayrollComponent) => {
    if (!(await confirmDialog({
      title: `Hapus ${title}`,
      description: `Yakin ingin menghapus komponen ${row.name} (${row.code})?`,
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
        .from(tableName)
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;

      toast.success(`${title} berhasil dihapus`);
      await fetchRows();
    } catch (error) {
      const ref = reportError(error, `${routeErrorScope}.delete`);
      toast.error(appendErrorReference(`Gagal menghapus ${title.toLowerCase()}`, ref));
    }
  };

  const exportCsv = () => {
    const header = [
      "code",
      "name",
      "component_type",
      "calculation_mode",
      "default_amount",
      "is_taxable",
      "is_mandatory",
      "is_active",
      "sort_order",
      "notes",
    ];

    const csv = [
      header,
      ...rows.map((row) => [
        row.code,
        row.name,
        row.component_type,
        row.calculation_mode,
        row.default_amount,
        row.is_taxable,
        row.is_mandatory,
        row.is_active,
        row.sort_order,
        row.notes || "",
      ]),
    ]
      .map((line) => line.map((item) => toCsvSafe(item)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${exportFilenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Export CSV berhasil");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Payroll</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Komponen</CardDescription>
              <CardTitle className="text-2xl">{totalRows}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Komponen Aktif</CardDescription>
              <CardTitle className="text-2xl">{activeCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Halaman</CardDescription>
              <CardTitle className="text-2xl">{currentPage}/{totalPages}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filter & Pencarian</CardTitle>
            <CardDescription>Gunakan filter untuk mempercepat manajemen komponen payroll.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <Label htmlFor="search">Pencarian</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-9"
                  placeholder={searchPlaceholder}
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipe Komponen</Label>
              <Select value={componentTypeFilter} onValueChange={setComponentTypeFilter}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {componentTypeOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Urutkan</Label>
              <Select value={`${sortBy}:${sortDir}`} onValueChange={(value) => {
                const [nextSortBy, nextSortDir] = value.split(":");
                setSortBy(nextSortBy as ComponentSortKey);
                setSortDir(nextSortDir as "asc" | "desc");
              }}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sort_order:asc">Urutan ASC</SelectItem>
                  <SelectItem value="sort_order:desc">Urutan DESC</SelectItem>
                  <SelectItem value="code:asc">Kode ASC</SelectItem>
                  <SelectItem value="name:asc">Nama ASC</SelectItem>
                  <SelectItem value="status:desc">Status Aktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Komponen</CardTitle>
            <CardDescription>Kelola komponen dan urutan kalkulasi payroll.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate(backPath)}>
                <ArrowLeft className="mr-2 h-4 w-4" />Kembali
              </Button>
              <Button onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" />Tambah Komponen</Button>
              <Button variant="secondary" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            </div>

            {loadError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {loadError}
              </div>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Nominal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Memuat data...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Belum ada komponen.</TableCell></TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.code}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.component_type}</TableCell>
                      <TableCell>{row.calculation_mode}</TableCell>
                      <TableCell>{formatCurrency(Number(row.default_amount || 0))}</TableCell>
                      <TableCell>
                        <Badge variant={row.is_active ? "default" : "secondary"}>{row.is_active ? "Aktif" : "Nonaktif"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="outline" size="icon" onClick={() => openEditDialog(row)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="destructive" size="icon" onClick={() => handleDelete(row)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total {totalRows} komponen</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  Sebelumnya
                </Button>
                <span>{currentPage}/{totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? editTitle : createTitle}</DialogTitle>
              <DialogDescription>Lengkapi data komponen payroll sesuai kebijakan organisasi.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="code">Kode Komponen</Label>
                <Input id="code" value={formState.code} onChange={(event) => setFormState((prev) => ({ ...prev, code: event.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="name">Nama Komponen</Label>
                <Input id="name" value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Tipe Komponen</Label>
                  <Select value={formState.component_type} onValueChange={(value) => setFormState((prev) => ({ ...prev, component_type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {componentTypeOptions.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Mode Kalkulasi</Label>
                  <Select value={formState.calculation_mode} onValueChange={(value) => setFormState((prev) => ({ ...prev, calculation_mode: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CALCULATION_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="default_amount">Nominal Default</Label>
                  <Input
                    id="default_amount"
                    type="number"
                    min={0}
                    value={formState.default_amount}
                    onChange={(event) => setFormState((prev) => ({ ...prev, default_amount: event.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sort_order">Urutan</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    min={0}
                    value={formState.sort_order}
                    onChange={(event) => setFormState((prev) => ({ ...prev, sort_order: event.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <Label htmlFor="is_taxable">Kena Pajak</Label>
                  <Switch id="is_taxable" checked={formState.is_taxable} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, is_taxable: checked }))} />
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <Label htmlFor="is_mandatory">Mandatory</Label>
                  <Switch id="is_mandatory" checked={formState.is_mandatory} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, is_mandatory: checked }))} />
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <Label htmlFor="is_active">Aktif</Label>
                  <Switch id="is_active" checked={formState.is_active} onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, is_active: checked }))} />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="notes">Catatan</Label>
                <Textarea id="notes" rows={3} value={formState.notes} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
              <Button onClick={handleSave} disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}
