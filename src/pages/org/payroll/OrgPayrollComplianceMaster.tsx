import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { buildOrgPayrollOverlayHref } from "@/lib/orgPayrollOverlay";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

type TerRateRow = {
  id: string;
  tenant_id: string;
  category: "A" | "B" | "C";
  income_from: number;
  income_to: number | null;
  rate_percent: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
};

type BpjsRateRow = {
  id: string;
  tenant_id: string;
  program: "kesehatan" | "jht" | "jkk" | "jkm" | "jp" | "jkp";
  risk_level: string | null;
  employer_rate_percent: number;
  employee_rate_percent: number;
  wage_cap: number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
};

type MinimumWageRow = {
  id: string;
  tenant_id: string;
  region_level: "UMP" | "UMK";
  region_code: string;
  region_name: string;
  amount: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
};

type TerFormState = {
  category: "A" | "B" | "C";
  income_from: string;
  income_to: string;
  rate_percent: string;
  effective_from: string;
  effective_to: string;
  is_active: boolean;
  notes: string;
};

type BpjsFormState = {
  program: BpjsRateRow["program"];
  risk_level: string;
  employer_rate_percent: string;
  employee_rate_percent: string;
  wage_cap: string;
  effective_from: string;
  effective_to: string;
  is_active: boolean;
  notes: string;
};

type WageFormState = {
  region_level: MinimumWageRow["region_level"];
  region_code: string;
  region_name: string;
  amount: string;
  effective_from: string;
  effective_to: string;
  is_active: boolean;
  notes: string;
};

const formatNumber = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Number(value ?? 0));

const formatPercent = (value: number | string | null | undefined) =>
  `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(Number(value ?? 0))}%`;

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const initialTerFormState = (): TerFormState => ({
  category: "A",
  income_from: "0",
  income_to: "",
  rate_percent: "0",
  effective_from: todayIso(),
  effective_to: "",
  is_active: true,
  notes: "",
});

const initialBpjsFormState = (): BpjsFormState => ({
  program: "kesehatan",
  risk_level: "",
  employer_rate_percent: "0",
  employee_rate_percent: "0",
  wage_cap: "",
  effective_from: todayIso(),
  effective_to: "",
  is_active: true,
  notes: "",
});

const initialWageFormState = (): WageFormState => ({
  region_level: "UMP",
  region_code: "",
  region_name: "",
  amount: "0",
  effective_from: todayIso(),
  effective_to: "",
  is_active: true,
  notes: "",
});

export default function OrgPayrollComplianceMaster() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigateWithOverlay = (target: string) =>
    navigate(buildOrgPayrollOverlayHref(location.pathname, location.search, target));
  const confirmDialog = useConfirmDialog();

  const [tenantId, setTenantId] = useState<string | null>(null);

  const [terRates, setTerRates] = useState<TerRateRow[]>([]);
  const [terLoading, setTerLoading] = useState(true);
  const [terError, setTerError] = useState<string | null>(null);
  const [terDialogOpen, setTerDialogOpen] = useState(false);
  const [editingTerId, setEditingTerId] = useState<string | null>(null);
  const [terFormState, setTerFormState] = useState<TerFormState>(initialTerFormState());

  const [bpjsRates, setBpjsRates] = useState<BpjsRateRow[]>([]);
  const [bpjsLoading, setBpjsLoading] = useState(true);
  const [bpjsError, setBpjsError] = useState<string | null>(null);
  const [bpjsDialogOpen, setBpjsDialogOpen] = useState(false);
  const [editingBpjsId, setEditingBpjsId] = useState<string | null>(null);
  const [bpjsFormState, setBpjsFormState] = useState<BpjsFormState>(initialBpjsFormState());

  const [wageRows, setWageRows] = useState<MinimumWageRow[]>([]);
  const [wageLoading, setWageLoading] = useState(true);
  const [wageError, setWageError] = useState<string | null>(null);
  const [wageDialogOpen, setWageDialogOpen] = useState(false);
  const [editingWageId, setEditingWageId] = useState<string | null>(null);
  const [wageFormState, setWageFormState] = useState<WageFormState>(initialWageFormState());

  const resolveTenant = useCallback(async () => {
    const resolved = tenantId || (await resolveOrgTenantId());
    if (!resolved) throw new Error("Tenant organisasi tidak ditemukan.");
    if (!tenantId) setTenantId(resolved);
    return resolved;
  }, [tenantId]);

  const fetchTerRates = useCallback(async (resolvedTenantId: string) => {
    setTerLoading(true);
    setTerError(null);
    try {
      const { data, error } = await supabase
        .from("payroll_tax_ter_rates")
        .select("*")
        .eq("tenant_id", resolvedTenantId)
        .order("effective_from", { ascending: false })
        .order("income_from", { ascending: true });
      if (error) throw error;
      setTerRates((data || []) as TerRateRow[]);
    } catch (error) {
      const ref = reportError(error, "org.payroll.compliance_master.fetch_ter");
      setTerError(appendErrorReference("Gagal memuat tarif TER", ref));
    } finally {
      setTerLoading(false);
    }
  }, []);

  const fetchBpjsRates = useCallback(async (resolvedTenantId: string) => {
    setBpjsLoading(true);
    setBpjsError(null);
    try {
      const { data, error } = await supabase
        .from("payroll_bpjs_rates")
        .select("*")
        .eq("tenant_id", resolvedTenantId)
        .order("effective_from", { ascending: false })
        .order("program", { ascending: true })
        .order("risk_level", { ascending: true });
      if (error) throw error;
      setBpjsRates((data || []) as BpjsRateRow[]);
    } catch (error) {
      const ref = reportError(error, "org.payroll.compliance_master.fetch_bpjs");
      setBpjsError(appendErrorReference("Gagal memuat tarif BPJS", ref));
    } finally {
      setBpjsLoading(false);
    }
  }, []);

  const fetchWageRows = useCallback(async (resolvedTenantId: string) => {
    setWageLoading(true);
    setWageError(null);
    try {
      const { data, error } = await supabase
        .from("payroll_minimum_wages")
        .select("*")
        .eq("tenant_id", resolvedTenantId)
        .order("effective_from", { ascending: false })
        .order("region_level", { ascending: true })
        .order("region_code", { ascending: true });
      if (error) throw error;
      setWageRows((data || []) as MinimumWageRow[]);
    } catch (error) {
      const ref = reportError(error, "org.payroll.compliance_master.fetch_min_wage");
      setWageError(appendErrorReference("Gagal memuat data UMP/UMK", ref));
    } finally {
      setWageLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const resolved = await resolveTenant();
        await Promise.all([
          fetchTerRates(resolved),
          fetchBpjsRates(resolved),
          fetchWageRows(resolved),
        ]);
      } catch (error) {
        const ref = reportError(error, "org.payroll.compliance_master.resolve_tenant");
        toast.error(appendErrorReference("Gagal menyiapkan master kepatuhan", ref));
      }
    })();
  }, [fetchBpjsRates, fetchTerRates, fetchWageRows, resolveTenant]);

  const openTerDialog = (row?: TerRateRow) => {
    if (row) {
      setEditingTerId(row.id);
      setTerFormState({
        category: row.category,
        income_from: String(row.income_from ?? 0),
        income_to: row.income_to ? String(row.income_to) : "",
        rate_percent: String(row.rate_percent ?? 0),
        effective_from: row.effective_from,
        effective_to: row.effective_to || "",
        is_active: row.is_active,
        notes: row.notes || "",
      });
    } else {
      setEditingTerId(null);
      setTerFormState(initialTerFormState());
    }
    setTerDialogOpen(true);
  };

  const openBpjsDialog = (row?: BpjsRateRow) => {
    if (row) {
      setEditingBpjsId(row.id);
      setBpjsFormState({
        program: row.program,
        risk_level: row.risk_level || "",
        employer_rate_percent: String(row.employer_rate_percent ?? 0),
        employee_rate_percent: String(row.employee_rate_percent ?? 0),
        wage_cap: row.wage_cap ? String(row.wage_cap) : "",
        effective_from: row.effective_from,
        effective_to: row.effective_to || "",
        is_active: row.is_active,
        notes: row.notes || "",
      });
    } else {
      setEditingBpjsId(null);
      setBpjsFormState(initialBpjsFormState());
    }
    setBpjsDialogOpen(true);
  };

  const openWageDialog = (row?: MinimumWageRow) => {
    if (row) {
      setEditingWageId(row.id);
      setWageFormState({
        region_level: row.region_level,
        region_code: row.region_code,
        region_name: row.region_name,
        amount: String(row.amount ?? 0),
        effective_from: row.effective_from,
        effective_to: row.effective_to || "",
        is_active: row.is_active,
        notes: row.notes || "",
      });
    } else {
      setEditingWageId(null);
      setWageFormState(initialWageFormState());
    }
    setWageDialogOpen(true);
  };

  const validateDateRange = (from: string, to: string, label: string) => {
    if (to && from && new Date(to) < new Date(from)) {
      toast.error(`${label} akhir harus setelah tanggal mulai.`);
      return false;
    }
    return true;
  };

  const handleSaveTer = async () => {
    try {
      const resolvedTenantId = await resolveTenant();
      const incomeFrom = toNumber(terFormState.income_from);
      const incomeTo = terFormState.income_to ? toNumber(terFormState.income_to) : null;
      const ratePercent = toNumber(terFormState.rate_percent);

      if (!Number.isFinite(incomeFrom) || incomeFrom < 0) {
        toast.error("Income from wajib angka >= 0");
        return;
      }
      if (incomeTo !== null && (!Number.isFinite(incomeTo) || incomeTo < incomeFrom)) {
        toast.error("Income to harus lebih besar atau sama dengan income from.");
        return;
      }
      if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
        toast.error("Rate % harus di antara 0 - 100.");
        return;
      }
      if (!validateDateRange(terFormState.effective_from, terFormState.effective_to, "Tanggal efektif")) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        tenant_id: resolvedTenantId,
        category: terFormState.category,
        income_from: incomeFrom,
        income_to: incomeTo,
        rate_percent: ratePercent,
        effective_from: terFormState.effective_from,
        effective_to: terFormState.effective_to || null,
        is_active: terFormState.is_active,
        notes: terFormState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      };

      if (editingTerId) {
        const { error } = await supabase
          .from("payroll_tax_ter_rates")
          .update({ ...payload, created_by: undefined })
          .eq("id", editingTerId)
          .eq("tenant_id", resolvedTenantId);
        if (error) throw error;
        toast.success("Tarif TER berhasil diperbarui");
      } else {
        const { error } = await supabase.from("payroll_tax_ter_rates").insert(payload);
        if (error) throw error;
        toast.success("Tarif TER berhasil ditambahkan");
      }

      setTerDialogOpen(false);
      setEditingTerId(null);
      setTerFormState(initialTerFormState());
      await fetchTerRates(resolvedTenantId);
    } catch (error) {
      const ref = reportError(error, "org.payroll.compliance_master.save_ter");
      toast.error(appendErrorReference("Gagal menyimpan tarif TER", ref));
    }
  };

  const handleDeleteTer = async (row: TerRateRow) => {
    if (!(await confirmDialog({
      title: "Hapus Tarif TER",
      description: `Yakin ingin menghapus kategori ${row.category} (${row.income_from} - ${row.income_to ?? "∞"})?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    }))) return;

    try {
      const resolvedTenantId = await resolveTenant();
      const { error } = await supabase
        .from("payroll_tax_ter_rates")
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;
      toast.success("Tarif TER berhasil dihapus");
      await fetchTerRates(resolvedTenantId);
    } catch (error) {
      const ref = reportError(error, "org.payroll.compliance_master.delete_ter");
      toast.error(appendErrorReference("Gagal menghapus tarif TER", ref));
    }
  };

  const handleSaveBpjs = async () => {
    try {
      const resolvedTenantId = await resolveTenant();
      const employerRate = toNumber(bpjsFormState.employer_rate_percent);
      const employeeRate = toNumber(bpjsFormState.employee_rate_percent);
      const wageCap = bpjsFormState.wage_cap ? toNumber(bpjsFormState.wage_cap) : null;

      if (!Number.isFinite(employerRate) || employerRate < 0 || employerRate > 100) {
        toast.error("Rate perusahaan harus di antara 0 - 100.");
        return;
      }
      if (!Number.isFinite(employeeRate) || employeeRate < 0 || employeeRate > 100) {
        toast.error("Rate pegawai harus di antara 0 - 100.");
        return;
      }
      if (bpjsFormState.program === "jkk" && !bpjsFormState.risk_level.trim()) {
        toast.error("Risk level wajib diisi untuk program JKK.");
        return;
      }
      if (!validateDateRange(bpjsFormState.effective_from, bpjsFormState.effective_to, "Tanggal efektif")) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        tenant_id: resolvedTenantId,
        program: bpjsFormState.program,
        risk_level: bpjsFormState.risk_level.trim() || null,
        employer_rate_percent: employerRate,
        employee_rate_percent: employeeRate,
        wage_cap: wageCap,
        effective_from: bpjsFormState.effective_from,
        effective_to: bpjsFormState.effective_to || null,
        is_active: bpjsFormState.is_active,
        notes: bpjsFormState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      };

      if (editingBpjsId) {
        const { error } = await supabase
          .from("payroll_bpjs_rates")
          .update({ ...payload, created_by: undefined })
          .eq("id", editingBpjsId)
          .eq("tenant_id", resolvedTenantId);
        if (error) throw error;
        toast.success("Tarif BPJS berhasil diperbarui");
      } else {
        const { error } = await supabase.from("payroll_bpjs_rates").insert(payload);
        if (error) throw error;
        toast.success("Tarif BPJS berhasil ditambahkan");
      }

      setBpjsDialogOpen(false);
      setEditingBpjsId(null);
      setBpjsFormState(initialBpjsFormState());
      await fetchBpjsRates(resolvedTenantId);
    } catch (error) {
      const ref = reportError(error, "org.payroll.compliance_master.save_bpjs");
      toast.error(appendErrorReference("Gagal menyimpan tarif BPJS", ref));
    }
  };

  const handleDeleteBpjs = async (row: BpjsRateRow) => {
    if (!(await confirmDialog({
      title: "Hapus Tarif BPJS",
      description: `Yakin ingin menghapus ${row.program.toUpperCase()} ${row.risk_level ? `(${row.risk_level})` : ""}?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    }))) return;

    try {
      const resolvedTenantId = await resolveTenant();
      const { error } = await supabase
        .from("payroll_bpjs_rates")
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;
      toast.success("Tarif BPJS berhasil dihapus");
      await fetchBpjsRates(resolvedTenantId);
    } catch (error) {
      const ref = reportError(error, "org.payroll.compliance_master.delete_bpjs");
      toast.error(appendErrorReference("Gagal menghapus tarif BPJS", ref));
    }
  };

  const handleSaveWage = async () => {
    try {
      const resolvedTenantId = await resolveTenant();
      const amount = toNumber(wageFormState.amount);
      if (!wageFormState.region_code.trim()) {
        toast.error("Kode wilayah wajib diisi.");
        return;
      }
      if (!wageFormState.region_name.trim()) {
        toast.error("Nama wilayah wajib diisi.");
        return;
      }
      if (!Number.isFinite(amount) || amount < 0) {
        toast.error("Nominal upah minimum harus >= 0.");
        return;
      }
      if (!validateDateRange(wageFormState.effective_from, wageFormState.effective_to, "Tanggal efektif")) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        tenant_id: resolvedTenantId,
        region_level: wageFormState.region_level,
        region_code: wageFormState.region_code.trim(),
        region_name: wageFormState.region_name.trim(),
        amount,
        effective_from: wageFormState.effective_from,
        effective_to: wageFormState.effective_to || null,
        is_active: wageFormState.is_active,
        notes: wageFormState.notes.trim() || null,
        created_by: user?.id || null,
        updated_by: user?.id || null,
      };

      if (editingWageId) {
        const { error } = await supabase
          .from("payroll_minimum_wages")
          .update({ ...payload, created_by: undefined })
          .eq("id", editingWageId)
          .eq("tenant_id", resolvedTenantId);
        if (error) throw error;
        toast.success("Data UMP/UMK berhasil diperbarui");
      } else {
        const { error } = await supabase.from("payroll_minimum_wages").insert(payload);
        if (error) throw error;
        toast.success("Data UMP/UMK berhasil ditambahkan");
      }

      setWageDialogOpen(false);
      setEditingWageId(null);
      setWageFormState(initialWageFormState());
      await fetchWageRows(resolvedTenantId);
    } catch (error) {
      const ref = reportError(error, "org.payroll.compliance_master.save_wage");
      toast.error(appendErrorReference("Gagal menyimpan data UMP/UMK", ref));
    }
  };

  const handleDeleteWage = async (row: MinimumWageRow) => {
    if (!(await confirmDialog({
      title: "Hapus Data UMP/UMK",
      description: `Yakin ingin menghapus ${row.region_level} ${row.region_code}?`,
      confirmText: "Ya, hapus",
      variant: "destructive",
    }))) return;

    try {
      const resolvedTenantId = await resolveTenant();
      const { error } = await supabase
        .from("payroll_minimum_wages")
        .delete()
        .eq("id", row.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;
      toast.success("Data UMP/UMK berhasil dihapus");
      await fetchWageRows(resolvedTenantId);
    } catch (error) {
      const ref = reportError(error, "org.payroll.compliance_master.delete_wage");
      toast.error(appendErrorReference("Gagal menghapus data UMP/UMK", ref));
    }
  };

  const summaryBadge = useMemo(() => {
    const missing = [
      { label: "TER", count: terRates.length },
      { label: "BPJS", count: bpjsRates.length },
      { label: "UMP/UMK", count: wageRows.length },
    ].filter((item) => item.count === 0);
    if (missing.length === 0) {
      return <Badge variant="default">Master kepatuhan siap</Badge>;
    }
    return <Badge variant="secondary">{`Perlu isi ${missing.map((item) => item.label).join(", ")}`}</Badge>;
  }, [terRates.length, bpjsRates.length, wageRows.length]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Master Kepatuhan Payroll</h1>
            <p className="text-sm text-muted-foreground">
              Kelola tarif TER, BPJS, dan UMP/UMK sebagai fondasi perhitungan payroll swasta umum.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {summaryBadge}
            <Button variant="outline" onClick={() => navigateWithOverlay("/org/payroll")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Beranda
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tarif dan Standar</CardTitle>
            <CardDescription>Pastikan data tarif diperbarui sebelum menjalankan payroll.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="ter" className="w-full">
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="ter">PPh 21 TER</TabsTrigger>
                <TabsTrigger value="bpjs">BPJS</TabsTrigger>
                <TabsTrigger value="wage">UMP/UMK</TabsTrigger>
              </TabsList>

              <TabsContent value="ter" className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Tabel Tarif Efektif (TER)</p>
                    <p className="text-xs text-muted-foreground">Isi kategori A/B/C sesuai ketentuan pajak terbaru.</p>
                  </div>
                  <Button size="sm" onClick={() => openTerDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Tambah Tarif TER
                  </Button>
                </div>
                {terError ? <p className="text-sm text-destructive">{terError}</p> : null}
                {terLoading ? (
                  <p className="text-sm text-muted-foreground">Memuat tarif TER...</p>
                ) : terRates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada tarif TER.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Rentang Penghasilan</TableHead>
                        <TableHead>Rate %</TableHead>
                        <TableHead>Efektif</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {terRates.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.category}</TableCell>
                          <TableCell>
                            {formatNumber(row.income_from)} - {row.income_to ? formatNumber(row.income_to) : "∞"}
                          </TableCell>
                          <TableCell>{formatPercent(row.rate_percent)}</TableCell>
                          <TableCell>
                            {row.effective_from} {row.effective_to ? `→ ${row.effective_to}` : ""}
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.is_active ? "default" : "secondary"}>{row.is_active ? "Aktif" : "Nonaktif"}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => openTerDialog(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => void handleDeleteTer(row)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="bpjs" className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Tarif BPJS</p>
                    <p className="text-xs text-muted-foreground">Isi program BPJS sesuai ketentuan aktif organisasi.</p>
                  </div>
                  <Button size="sm" onClick={() => openBpjsDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Tambah Tarif BPJS
                  </Button>
                </div>
                {bpjsError ? <p className="text-sm text-destructive">{bpjsError}</p> : null}
                {bpjsLoading ? (
                  <p className="text-sm text-muted-foreground">Memuat tarif BPJS...</p>
                ) : bpjsRates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada tarif BPJS.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Program</TableHead>
                        <TableHead>Risk Level</TableHead>
                        <TableHead>Rate Perusahaan</TableHead>
                        <TableHead>Rate Pegawai</TableHead>
                        <TableHead>Batas Upah</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bpjsRates.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.program.toUpperCase()}</TableCell>
                          <TableCell>{row.risk_level || "-"}</TableCell>
                          <TableCell>{formatPercent(row.employer_rate_percent)}</TableCell>
                          <TableCell>{formatPercent(row.employee_rate_percent)}</TableCell>
                          <TableCell>{row.wage_cap ? formatNumber(row.wage_cap) : "-"}</TableCell>
                          <TableCell>
                            <Badge variant={row.is_active ? "default" : "secondary"}>{row.is_active ? "Aktif" : "Nonaktif"}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => openBpjsDialog(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => void handleDeleteBpjs(row)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="wage" className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">UMP/UMK</p>
                    <p className="text-xs text-muted-foreground">Isi standar upah minimum per wilayah kerja.</p>
                  </div>
                  <Button size="sm" onClick={() => openWageDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Tambah UMP/UMK
                  </Button>
                </div>
                {wageError ? <p className="text-sm text-destructive">{wageError}</p> : null}
                {wageLoading ? (
                  <p className="text-sm text-muted-foreground">Memuat UMP/UMK...</p>
                ) : wageRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada data UMP/UMK.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Level</TableHead>
                        <TableHead>Kode</TableHead>
                        <TableHead>Wilayah</TableHead>
                        <TableHead>Nominal</TableHead>
                        <TableHead>Efektif</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wageRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.region_level}</TableCell>
                          <TableCell>{row.region_code}</TableCell>
                          <TableCell>{row.region_name}</TableCell>
                          <TableCell>{formatNumber(row.amount)}</TableCell>
                          <TableCell>
                            {row.effective_from} {row.effective_to ? `→ ${row.effective_to}` : ""}
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.is_active ? "default" : "secondary"}>{row.is_active ? "Aktif" : "Nonaktif"}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => openWageDialog(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => void handleDeleteWage(row)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <OrgPayrollPageGuide pathname="/org/payroll/compliance-master" />
      </div>

      <Dialog open={terDialogOpen} onOpenChange={setTerDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingTerId ? "Ubah Tarif TER" : "Tambah Tarif TER"}</DialogTitle>
            <DialogDescription>Isi rentang penghasilan dan rate TER.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={terFormState.category} onValueChange={(value) => setTerFormState((prev) => ({ ...prev, category: value as TerFormState["category"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rate (%)</Label>
              <Input
                type="number"
                min={0}
                step="0.0001"
                value={terFormState.rate_percent}
                onChange={(event) => setTerFormState((prev) => ({ ...prev, rate_percent: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Income From</Label>
              <Input
                type="number"
                min={0}
                step="1"
                value={terFormState.income_from}
                onChange={(event) => setTerFormState((prev) => ({ ...prev, income_from: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Income To (opsional)</Label>
              <Input
                type="number"
                min={0}
                step="1"
                value={terFormState.income_to}
                onChange={(event) => setTerFormState((prev) => ({ ...prev, income_to: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Efektif</Label>
              <Input
                type="date"
                value={terFormState.effective_from}
                onChange={(event) => setTerFormState((prev) => ({ ...prev, effective_from: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Berakhir (opsional)</Label>
              <Input
                type="date"
                value={terFormState.effective_to}
                onChange={(event) => setTerFormState((prev) => ({ ...prev, effective_to: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Aktif</Label>
              <Switch checked={terFormState.is_active} onCheckedChange={(checked) => setTerFormState((prev) => ({ ...prev, is_active: checked }))} />
            </div>
            <Textarea
              rows={3}
              placeholder="Catatan (opsional)"
              value={terFormState.notes}
              onChange={(event) => setTerFormState((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerDialogOpen(false)}>Batal</Button>
            <Button onClick={() => void handleSaveTer()}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bpjsDialogOpen} onOpenChange={setBpjsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingBpjsId ? "Ubah Tarif BPJS" : "Tambah Tarif BPJS"}</DialogTitle>
            <DialogDescription>Isi program BPJS dan persentase iuran.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Program</Label>
              <Select value={bpjsFormState.program} onValueChange={(value) => setBpjsFormState((prev) => ({ ...prev, program: value as BpjsRateRow["program"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih program" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kesehatan">Kesehatan</SelectItem>
                  <SelectItem value="jht">JHT</SelectItem>
                  <SelectItem value="jkk">JKK</SelectItem>
                  <SelectItem value="jkm">JKM</SelectItem>
                  <SelectItem value="jp">JP</SelectItem>
                  <SelectItem value="jkp">JKP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Risk Level (JKK)</Label>
              <Input
                placeholder="Contoh: rendah, sedang, tinggi"
                value={bpjsFormState.risk_level}
                onChange={(event) => setBpjsFormState((prev) => ({ ...prev, risk_level: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Rate Perusahaan (%)</Label>
              <Input
                type="number"
                min={0}
                step="0.0001"
                value={bpjsFormState.employer_rate_percent}
                onChange={(event) => setBpjsFormState((prev) => ({ ...prev, employer_rate_percent: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Rate Pegawai (%)</Label>
              <Input
                type="number"
                min={0}
                step="0.0001"
                value={bpjsFormState.employee_rate_percent}
                onChange={(event) => setBpjsFormState((prev) => ({ ...prev, employee_rate_percent: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Batas Upah (opsional)</Label>
              <Input
                type="number"
                min={0}
                step="1"
                value={bpjsFormState.wage_cap}
                onChange={(event) => setBpjsFormState((prev) => ({ ...prev, wage_cap: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Efektif</Label>
              <Input
                type="date"
                value={bpjsFormState.effective_from}
                onChange={(event) => setBpjsFormState((prev) => ({ ...prev, effective_from: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Berakhir (opsional)</Label>
              <Input
                type="date"
                value={bpjsFormState.effective_to}
                onChange={(event) => setBpjsFormState((prev) => ({ ...prev, effective_to: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Aktif</Label>
              <Switch checked={bpjsFormState.is_active} onCheckedChange={(checked) => setBpjsFormState((prev) => ({ ...prev, is_active: checked }))} />
            </div>
            <Textarea
              rows={3}
              placeholder="Catatan (opsional)"
              value={bpjsFormState.notes}
              onChange={(event) => setBpjsFormState((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBpjsDialogOpen(false)}>Batal</Button>
            <Button onClick={() => void handleSaveBpjs()}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wageDialogOpen} onOpenChange={setWageDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingWageId ? "Ubah UMP/UMK" : "Tambah UMP/UMK"}</DialogTitle>
            <DialogDescription>Isi standar upah minimum sesuai wilayah kerja.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Level</Label>
              <Select value={wageFormState.region_level} onValueChange={(value) => setWageFormState((prev) => ({ ...prev, region_level: value as MinimumWageRow["region_level"] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UMP">UMP</SelectItem>
                  <SelectItem value="UMK">UMK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Kode Wilayah</Label>
              <Input
                value={wageFormState.region_code}
                onChange={(event) => setWageFormState((prev) => ({ ...prev, region_code: event.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Nama Wilayah</Label>
              <Input
                value={wageFormState.region_name}
                onChange={(event) => setWageFormState((prev) => ({ ...prev, region_name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Nominal</Label>
              <Input
                type="number"
                min={0}
                step="1"
                value={wageFormState.amount}
                onChange={(event) => setWageFormState((prev) => ({ ...prev, amount: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Efektif</Label>
              <Input
                type="date"
                value={wageFormState.effective_from}
                onChange={(event) => setWageFormState((prev) => ({ ...prev, effective_from: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tanggal Berakhir (opsional)</Label>
              <Input
                type="date"
                value={wageFormState.effective_to}
                onChange={(event) => setWageFormState((prev) => ({ ...prev, effective_to: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Aktif</Label>
              <Switch checked={wageFormState.is_active} onCheckedChange={(checked) => setWageFormState((prev) => ({ ...prev, is_active: checked }))} />
            </div>
            <Textarea
              rows={3}
              placeholder="Catatan (opsional)"
              value={wageFormState.notes}
              onChange={(event) => setWageFormState((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWageDialogOpen(false)}>Batal</Button>
            <Button onClick={() => void handleSaveWage()}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrganizationLayout>
  );
}
