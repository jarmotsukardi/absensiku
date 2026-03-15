import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, UserCheck, UserX, Search, Pencil, Download, RefreshCw, Plus } from "lucide-react";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import {
  applyEmployeeOpdChange,
  EMPLOYEE_CATEGORY_OPTIONS,
  filterEmployeesByKeyword,
  getEmployeePayrollValidationErrors,
  getPayrollGapFieldId,
  getPayrollImpactGaps,
  sortEmployeesByPayrollGapSeverity,
  type EmployeeFormState,
  type EmployeeRow,
  type MasterReference,
  PAYROLL_GAP_LABELS,
} from "@/lib/hrEmployees";
import { fetchSupabaseRest, fetchSupabaseRpc } from "@/lib/supabaseRestClient";
import { toast } from "sonner";

const PAGE_SIZE = 10;
const initialFormState: EmployeeFormState = {
  id: "",
  name: "",
  email: "",
  nik: "",
  nip: "",
  employee_category: "",
  golongan: "",
  position: "",
  position_id: "",
  opd_id: "",
  work_unit_id: "",
  office_id: "",
  is_active: true,
};

type HrEmployeeSaveRpcResult = {
  employee_id: string;
  audit_id: string;
  action: string;
};

const mapRowToFormState = (row: EmployeeRow): EmployeeFormState => ({
  id: row.id,
  name: row.name,
  email: row.email,
  nik: row.nik || "",
  nip: row.nip || "",
  employee_category: row.employee_category || "",
  golongan: row.golongan || "",
  position: row.position || "",
  position_id: row.position_id || "",
  opd_id: row.opd_id || "",
  work_unit_id: row.work_unit_id || "",
  office_id: row.office_id || "",
  is_active: row.is_active !== false,
});

const mapFormStateToRow = (
  state: EmployeeFormState,
  options: {
    employeeId: string;
    tenantId: string;
    userId?: string | null;
  },
): EmployeeRow => ({
  id: options.employeeId,
  name: state.name.trim(),
  email: state.email.trim(),
  nik: state.nik.trim(),
  nip: state.nip.trim() || null,
  employee_category: state.employee_category.trim() || null,
  golongan: state.golongan.trim() || null,
  position: state.position.trim() || null,
  position_id: state.position_id || null,
  opd_id: state.opd_id || null,
  work_unit_id: state.work_unit_id || null,
  office_id: state.office_id || null,
  is_active: state.is_active,
  tenant_id: options.tenantId,
  user_id: options.userId ?? null,
});

const sortEmployeeRows = (items: EmployeeRow[]) =>
  [...items].sort((left, right) => left.name.localeCompare(right.name, "id"));

export default function OrgHREmployees() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [opds, setOpds] = useState<MasterReference[]>([]);
  const [workUnits, setWorkUnits] = useState<MasterReference[]>([]);
  const [offices, setOffices] = useState<MasterReference[]>([]);
  const [positions, setPositions] = useState<MasterReference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [pendingBulkCategory, setPendingBulkCategory] = useState<string | null>(null);
  const [selectedBulkEmployeeIds, setSelectedBulkEmployeeIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("aktif");
  const [selectedPayrollGap, setSelectedPayrollGap] = useState<(typeof PAYROLL_GAP_LABELS)[number] | "semua">("semua");
  const [activePage, setActivePage] = useState(1);
  const [inactivePage, setInactivePage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formState, setFormState] = useState<EmployeeFormState>(initialFormState);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/employees");
  const dialogPayrollGaps = useMemo(
    () =>
      getPayrollImpactGaps({
        id: formState.id,
        name: formState.name,
        email: formState.email,
        nik: formState.nik,
        nip: formState.nip || null,
        employee_category: formState.employee_category || null,
        golongan: formState.golongan || null,
        position: formState.position || null,
        position_id: formState.position_id || null,
        opd_id: formState.opd_id || null,
        work_unit_id: formState.work_unit_id || null,
        office_id: formState.office_id || null,
        is_active: formState.is_active,
        tenant_id: "",
        user_id: null,
      } as EmployeeRow),
    [formState],
  );

  const fetchData = useCallback(async (tenantOverride?: string | null) => {
    setIsLoading(true);
    try {
      const resolvedTenantId = tenantOverride || tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const [employeeRows, opdRows, workUnitRows, officeRows, positionRows] = await Promise.all([
        fetchSupabaseRest<EmployeeRow[]>("employees", {
          params: {
          select: "id,name,email,nik,nip,employee_category,golongan,position,position_id,opd_id,work_unit_id,office_id,is_active,tenant_id,user_id",
          tenant_id: `eq.${resolvedTenantId}`,
          order: "name.asc",
          },
        }),
        fetchSupabaseRest<MasterReference[]>("opd", {
          params: {
          select: "id,name",
          tenant_id: `eq.${resolvedTenantId}`,
          is_active: "eq.true",
          order: "name.asc",
          },
        }),
        fetchSupabaseRest<MasterReference[]>("work_units", {
          params: {
          select: "id,name,opd_id",
          tenant_id: `eq.${resolvedTenantId}`,
          is_active: "eq.true",
          order: "name.asc",
          },
        }),
        fetchSupabaseRest<MasterReference[]>("offices", {
          params: {
          select: "id,name,opd_id",
          tenant_id: `eq.${resolvedTenantId}`,
          is_active: "eq.true",
          order: "name.asc",
          },
        }),
        fetchSupabaseRest<MasterReference[]>("positions", {
          params: {
          select: "id,name,opd_id",
          tenant_id: `eq.${resolvedTenantId}`,
          is_active: "eq.true",
          order: "name.asc",
          },
        }),
      ]);
      setRows(employeeRows || []);
      setTenantId(resolvedTenantId);
      setOpds(opdRows || []);
      setWorkUnits(workUnitRows || []);
      setOffices(officeRows || []);
      setPositions(positionRows || []);
    } catch (error) {
      const ref = reportError(error, "org.hr.employees.fetch");
      toast.error(appendErrorReference("Gagal memuat data pegawai", ref));
      setTenantId(null);
      setRows([]);
      setOpds([]);
      setWorkUnits([]);
      setOffices([]);
      setPositions([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const keyword = search.trim().toLowerCase();
  const filtered = useMemo(() => filterEmployeesByKeyword(rows, keyword), [rows, keyword]);

  const activeEmployees = filtered.filter((item) => item.is_active !== false);
  const inactiveEmployees = filtered.filter((item) => item.is_active === false);
  const incompleteEmployees = useMemo(
    () => sortEmployeesByPayrollGapSeverity(filtered.filter((item) => getPayrollImpactGaps(item).length > 0)),
    [filtered],
  );
  const reviewedIncompleteEmployees = useMemo(
    () =>
      selectedPayrollGap === "semua"
        ? incompleteEmployees
        : incompleteEmployees.filter((item) => getPayrollImpactGaps(item).includes(selectedPayrollGap)),
    [incompleteEmployees, selectedPayrollGap],
  );
  const bulkCategoryTargets = useMemo(
    () => reviewedIncompleteEmployees.filter((item) => getPayrollImpactGaps(item).includes("Kategori")),
    [reviewedIncompleteEmployees],
  );
  const selectedBulkCategoryTargets = useMemo(
    () => bulkCategoryTargets.filter((item) => selectedBulkEmployeeIds.includes(item.id)),
    [bulkCategoryTargets, selectedBulkEmployeeIds],
  );
  const effectiveBulkCategoryTargets = selectedBulkCategoryTargets.length > 0 ? selectedBulkCategoryTargets : bulkCategoryTargets;
  const reviewScopeEmployees = useMemo(
    () =>
      selectedPayrollGap === "Kategori" && selectedBulkCategoryTargets.length > 0
        ? selectedBulkCategoryTargets
        : reviewedIncompleteEmployees,
    [reviewedIncompleteEmployees, selectedBulkCategoryTargets, selectedPayrollGap],
  );
  const categoryCount = new Set(rows.map((item) => item.employee_category).filter(Boolean)).size;
  const golonganCount = new Set(rows.map((item) => item.golongan).filter(Boolean)).size;
  const payrollReadyCount = rows.filter((item) => item.is_active !== false && getPayrollImpactGaps(item).length === 0).length;
  const payrollGapCounts = useMemo(
    () =>
      PAYROLL_GAP_LABELS.map((label) => ({
        label,
        count: rows.filter((item) => item.is_active !== false && getPayrollImpactGaps(item).includes(label)).length,
      })),
    [rows],
  );
  const cleanupPriorityCards = useMemo(
    () => [
      {
        label: "Kategori Kosong",
        count: rows.filter((item) => item.is_active !== false && !item.employee_category?.trim()).length,
        gap: "Kategori" as const,
        description: "Pegawai aktif tanpa kategori utama.",
      },
      {
        label: "Relasi Organisasi Bolong",
        count: rows.filter((item) => item.is_active !== false && ["Jabatan", "OPD", "Unit", "Lokasi"].some((gap) => getPayrollImpactGaps(item).includes(gap))).length,
        gap: "OPD" as const,
        description: "Jabatan, OPD, unit, atau lokasi masih belum lengkap.",
      },
      {
        label: "Gap Berat (3+)",
        count: rows.filter((item) => item.is_active !== false && getPayrollImpactGaps(item).length >= 3).length,
        gap: "semua" as const,
        description: "Prioritas tertinggi untuk cleanup tenant nyata.",
      },
      {
        label: "Belum Punya Akun",
        count: rows.filter((item) => item.is_active !== false && !item.user_id).length,
        gap: "semua" as const,
        description: "Penting untuk kesiapan ESS dan onboarding akhir.",
      },
    ],
    [rows],
  );
  const opdMap = useMemo(() => new Map(opds.map((item) => [item.id, item.name])), [opds]);
  const workUnitMap = useMemo(() => new Map(workUnits.map((item) => [item.id, item.name])), [workUnits]);
  const officeMap = useMemo(() => new Map(offices.map((item) => [item.id, item.name])), [offices]);
  const positionMap = useMemo(() => new Map(positions.map((item) => [item.id, item.name])), [positions]);
  const availableWorkUnits = useMemo(
    () => (formState.opd_id ? workUnits.filter((item) => item.opd_id === formState.opd_id) : workUnits),
    [formState.opd_id, workUnits],
  );
  const availableOffices = useMemo(
    () => (formState.opd_id ? offices.filter((item) => item.opd_id === formState.opd_id) : offices),
    [formState.opd_id, offices],
  );
  const availablePositions = useMemo(
    () => (formState.opd_id ? positions.filter((item) => !item.opd_id || item.opd_id === formState.opd_id) : positions),
    [formState.opd_id, positions],
  );
  const reviewQueueIndex = reviewScopeEmployees.findIndex((item) => item.id === formState.id);
  const previousReviewEmployee = reviewQueueIndex > 0 ? reviewScopeEmployees[reviewQueueIndex - 1] : null;
  const nextReviewEmployee =
    reviewQueueIndex >= 0 && reviewQueueIndex < reviewScopeEmployees.length - 1
      ? reviewScopeEmployees[reviewQueueIndex + 1]
      : null;
  const activeTotalPages = Math.max(1, Math.ceil(activeEmployees.length / PAGE_SIZE));
  const inactiveTotalPages = Math.max(1, Math.ceil(inactiveEmployees.length / PAGE_SIZE));
  const safeActivePage = Math.min(activePage, activeTotalPages);
  const safeInactivePage = Math.min(inactivePage, inactiveTotalPages);
  const pagedActiveEmployees = useMemo(() => {
    const from = (safeActivePage - 1) * PAGE_SIZE;
    return activeEmployees.slice(from, from + PAGE_SIZE);
  }, [activeEmployees, safeActivePage]);
  const pagedInactiveEmployees = useMemo(() => {
    const from = (safeInactivePage - 1) * PAGE_SIZE;
    return inactiveEmployees.slice(from, from + PAGE_SIZE);
  }, [inactiveEmployees, safeInactivePage]);

  const openEditDialog = (row: EmployeeRow) => {
    if (!access.canEdit) {
      toast.error("Aksi edit pegawai hanya tersedia untuk admin organisasi.");
      return;
    }
    setFormState(mapRowToFormState(row));
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    if (!access.canCreate) {
      toast.error("Aksi tambah pegawai hanya tersedia untuk admin organisasi.");
      return;
    }
    setFormState(initialFormState);
    setIsDialogOpen(true);
  };

  const focusPayrollGapField = (gap: string) => {
    const fieldId = getPayrollGapFieldId(gap);
    if (!fieldId) return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(fieldId) as HTMLInputElement | HTMLSelectElement | null;
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus();
    });
  };

  const handleSave = async (afterSave: "close" | "next" = "close") => {
    const isCreateMode = !formState.id;
    if (isCreateMode && !access.canCreate) {
      toast.error("Aksi tambah pegawai hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!isCreateMode && !access.canEdit) {
      toast.error("Aksi edit pegawai hanya tersedia untuk admin organisasi.");
      return;
    }
    const validationErrors = getEmployeePayrollValidationErrors(formState);
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0].message);
      return;
    }

    try {
      setIsSubmitting(true);
      const nextQueueEmployee = afterSave === "next" ? nextReviewEmployee : null;
      const targetRow = rows.find((item) => item.id === formState.id);
      const resolvedTenantId = targetRow?.tenant_id || tenantId;
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const normalizedEmail = formState.email.trim().toLowerCase();
      const normalizedNik = formState.nik.trim();
      const normalizedNip = formState.nip.trim();
      const duplicateRow = rows.find((item) => {
        if (item.id === formState.id) return false;
        const sameEmail = (item.email || "").trim().toLowerCase() === normalizedEmail;
        const sameNik = (item.nik || "").trim() === normalizedNik;
        const sameNip = normalizedNip.length > 0 && (item.nip || "").trim() === normalizedNip;
        return sameEmail || sameNik || sameNip;
      });
      if (duplicateRow) {
        if ((duplicateRow.email || "").trim().toLowerCase() === normalizedEmail) {
          toast.error("Email pegawai sudah digunakan. Gunakan email lain.");
          return;
        }
        if ((duplicateRow.nik || "").trim() === normalizedNik) {
          toast.error("NIK pegawai sudah digunakan. Gunakan NIK lain.");
          return;
        }
        toast.error("NIP pegawai sudah digunakan. Gunakan NIP lain.");
        return;
      }
      const data = await fetchSupabaseRpc<HrEmployeeSaveRpcResult[]>("save_org_hr_employee", {
        p_tenant_id: resolvedTenantId,
        p_employee_id: formState.id || null,
        p_payload: {
          name: formState.name.trim(),
          email: formState.email.trim(),
          nik: formState.nik.trim(),
          nip: formState.nip.trim() || null,
          employee_category: formState.employee_category.trim() || null,
          golongan: formState.golongan.trim() || null,
          position: (positionMap.get(formState.position_id) || formState.position).trim() || null,
          position_id: formState.position_id || null,
          opd_id: formState.opd_id || null,
          work_unit_id: formState.work_unit_id || null,
          office_id: formState.office_id || null,
          is_active: formState.is_active,
        },
      });
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Penyimpanan pegawai tidak mengembalikan hasil.");
      }

      const savedRow = mapFormStateToRow(formState, {
        employeeId: data[0].employee_id || formState.id,
        tenantId: resolvedTenantId,
        userId: targetRow?.user_id || null,
      });
      setRows((current) =>
        sortEmployeeRows(
          formState.id
            ? current.map((item) => (item.id === savedRow.id ? { ...item, ...savedRow } : item))
            : [...current.filter((item) => item.id !== savedRow.id), savedRow],
        ),
      );

      toast.success(isCreateMode ? "Pegawai baru berhasil ditambahkan." : "Data pegawai berhasil diperbarui.");
      if (nextQueueEmployee) {
        setFormState(mapRowToFormState(nextQueueEmployee));
        setIsDialogOpen(true);
        toast.success(`Lanjut ke pegawai berikutnya: ${nextQueueEmployee.name}`);
      } else {
        setIsDialogOpen(false);
        setFormState(initialFormState);
      }
      void fetchData(resolvedTenantId);
    } catch (error) {
      const ref = reportError(error, "org.hr.employees.save", { employee_id: formState.id });
      toast.error(appendErrorReference("Gagal menyimpan perubahan pegawai", ref));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = () => {
    if (!access.canExport) {
      toast.error("Aksi ekspor pegawai hanya tersedia untuk admin organisasi.");
      return;
    }
    const sourceRows =
      activeTab === "nonaktif"
        ? inactiveEmployees
        : activeTab === "aktif"
          ? activeEmployees
          : activeTab === "butuh-review"
            ? reviewedIncompleteEmployees
            : filtered;
    if (sourceRows.length === 0) {
      toast.error("Tidak ada data pegawai untuk diekspor.");
      return;
    }

    const header = [
      "Nama",
      "Email",
      "NIK",
      "NIP",
      "Kategori",
      "Golongan",
      "Jabatan",
      "OPD",
      "Unit Kerja",
      "Lokasi Kerja",
      "Gap Payroll",
      "Status Akun",
      "Status",
    ];
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const content = [
      header.join(","),
      ...sourceRows.map((item) =>
        [
          item.name,
          item.email,
          item.nik,
          item.nip || "",
          item.employee_category || "",
          item.golongan || "",
          item.position || "",
          item.opd_id ? opdMap.get(item.opd_id) || "" : "",
          item.work_unit_id ? workUnitMap.get(item.work_unit_id) || "" : "",
          item.office_id ? officeMap.get(item.office_id) || "" : "",
          getPayrollImpactGaps(item).join("; "),
          item.user_id ? "Sudah Terhubung" : "Belum Terhubung",
          item.is_active === false ? "Nonaktif" : "Aktif",
        ]
          .map(escapeCsv)
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const gapSuffix = activeTab === "butuh-review" && selectedPayrollGap !== "semua" ? `-${selectedPayrollGap.toLowerCase()}` : "";
    anchor.download = `hr-employees-${activeTab}${gapSuffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("Ekspor data pegawai dimulai.");
  };

  const requestBulkFillCategory = (category: string) => {
    if (!access.canEdit) {
      toast.error("Aksi bulk hanya tersedia untuk admin organisasi.");
      return;
    }
    if (selectedPayrollGap !== "Kategori") {
      toast.error("Bulk kategori hanya tersedia saat filter gap Kategori aktif.");
      return;
    }

    const targetRows = bulkCategoryTargets;
    if (targetRows.length === 0) {
      toast.error("Tidak ada pegawai pada filter ini yang perlu diisi kategori.");
      return;
    }

    setPendingBulkCategory(category);
  };

  const handleBulkFillCategory = async () => {
    if (!pendingBulkCategory) {
      toast.error("Kategori bulk belum dipilih.");
      return;
    }
    const category = pendingBulkCategory;
    const targetRows = effectiveBulkCategoryTargets;
    if (targetRows.length === 0) {
      toast.error("Tidak ada pegawai pada filter ini yang perlu diisi kategori.");
      setPendingBulkCategory(null);
      return;
    }

    try {
      setIsBulkSaving(true);
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const data = await fetchSupabaseRpc<HrEmployeeSaveRpcResult[]>("bulk_fill_org_hr_employee_category", {
        p_tenant_id: tenantId,
        p_employee_ids: targetRows.map((row) => row.id),
        p_category: category,
      });
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Bulk kategori tidak mengembalikan hasil.");
      }

      const targetIds = new Set(targetRows.map((row) => row.id));
      setRows((current) =>
        current.map((item) =>
          targetIds.has(item.id)
            ? {
                ...item,
                employee_category: category,
              }
            : item,
        ),
      );
      toast.success(`${targetRows.length} pegawai berhasil diisi kategori ${category}.`);
      setPendingBulkCategory(null);
      setSelectedBulkEmployeeIds([]);
      void fetchData(tenantId);
    } catch (error) {
      const ref = reportError(error, "org.hr.employees.bulk_category_fill", {
        gap: selectedPayrollGap,
        target_count: reviewedIncompleteEmployees.length,
      });
      toast.error(appendErrorReference("Gagal melakukan bulk isi kategori pegawai", ref));
    } finally {
      setIsBulkSaving(false);
    }
  };

  useEffect(() => {
    setActivePage(1);
    setInactivePage(1);
  }, [search]);

  useEffect(() => {
    if (activeTab !== "butuh-review") {
      setSelectedPayrollGap("semua");
    }
  }, [activeTab]);

  useEffect(() => {
    setSelectedBulkEmployeeIds((current) => current.filter((id) => reviewedIncompleteEmployees.some((item) => item.id === id)));
  }, [reviewedIncompleteEmployees]);

  useEffect(() => {
    setActivePage((page) => Math.min(page, activeTotalPages));
  }, [activeTotalPages]);

  useEffect(() => {
    setInactivePage((page) => Math.min(page, inactiveTotalPages));
  }, [inactiveTotalPages]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Pegawai</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Data Pegawai</h1>
          <p className="text-sm text-muted-foreground">
            Kelola data kepegawaian sebagai sumber utama proses HR.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola master" : "monitoring hanya-baca"}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Pegawai</CardDescription>
              <CardTitle className="text-2xl">{rows.length}</CardTitle>
            </CardHeader>
            <CardContent><Users className="h-4 w-4 text-muted-foreground" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pegawai Aktif</CardDescription>
              <CardTitle className="text-2xl">{rows.filter((item) => item.is_active !== false).length}</CardTitle>
            </CardHeader>
            <CardContent><UserCheck className="h-4 w-4 text-emerald-600" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pegawai Nonaktif</CardDescription>
              <CardTitle className="text-2xl">{rows.filter((item) => item.is_active === false).length}</CardTitle>
            </CardHeader>
            <CardContent><UserX className="h-4 w-4 text-amber-600" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Kategori / Golongan</CardDescription>
              <CardTitle className="text-2xl">{categoryCount} / {golonganCount}</CardTitle>
            </CardHeader>
            <CardContent><Badge variant="secondary">Master HR</Badge></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Akun Pegawai Siap</CardDescription>
              <CardTitle className="text-2xl">{rows.filter((item) => Boolean(item.user_id)).length}</CardTitle>
            </CardHeader>
            <CardContent><Badge variant="outline">Self-service</Badge></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Payroll-Ready Aktif</CardDescription>
              <CardTitle className="text-2xl">{payrollReadyCount}</CardTitle>
            </CardHeader>
            <CardContent><Badge variant="secondary">{incompleteEmployees.length} perlu dilengkapi</Badge></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={openCreateDialog} disabled={isLoadingAccess || !access.canCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah Pegawai
              </Button>
              <Button asChild size="sm" variant="outline" disabled={isLoadingAccess || !access.canCreate}>
                <OrgHRContextLink to="/org/employees/import">Import Pegawai</OrgHRContextLink>
              </Button>
              <Button asChild size="sm" variant="outline" disabled={isLoadingAccess || !access.canView}>
                <OrgHRContextLink to="/org/employees/active">Buka Master Pegawai Organisasi</OrgHRContextLink>
              </Button>
              <Button size="sm" variant="outline" onClick={() => void fetchData()} disabled={isLoading || isSubmitting}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Muat Ulang
              </Button>
              <Button size="sm" variant="outline" onClick={handleExport} disabled={isLoadingAccess || !access.canExport}>
                <Download className="mr-2 h-4 w-4" />
                Ekspor CSV
              </Button>
            </div>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, email, NIP, kategori, golongan..."
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="aktif">Aktif ({activeEmployees.length})</TabsTrigger>
                <TabsTrigger value="nonaktif">Nonaktif ({inactiveEmployees.length})</TabsTrigger>
                <TabsTrigger value="butuh-review">Butuh Review ({incompleteEmployees.length})</TabsTrigger>
                <TabsTrigger value="ringkas">Ringkasan</TabsTrigger>
              </TabsList>
              <TabsContent value="aktif">
                <EmployeeTable
                  rows={pagedActiveEmployees}
                  isLoading={isLoading}
                  canEdit={access.canEdit}
                  onEdit={openEditDialog}
                  opdMap={opdMap}
                  workUnitMap={workUnitMap}
                  officeMap={officeMap}
                  positionMap={positionMap}
                />
                {!isLoading ? (
                  <TablePaginationFooter
                    currentPage={safeActivePage}
                    totalPages={activeTotalPages}
                    totalItems={activeEmployees.length}
                    pageSize={PAGE_SIZE}
                    itemLabel="pegawai aktif"
                    onPrevious={() => setActivePage((page) => Math.max(1, page - 1))}
                    onNext={() => setActivePage((page) => Math.min(activeTotalPages, page + 1))}
                  />
                ) : null}
              </TabsContent>
              <TabsContent value="nonaktif">
                <EmployeeTable
                  rows={pagedInactiveEmployees}
                  isLoading={isLoading}
                  canEdit={access.canEdit}
                  onEdit={openEditDialog}
                  opdMap={opdMap}
                  workUnitMap={workUnitMap}
                  officeMap={officeMap}
                  positionMap={positionMap}
                />
                {!isLoading ? (
                  <TablePaginationFooter
                    currentPage={safeInactivePage}
                    totalPages={inactiveTotalPages}
                    totalItems={inactiveEmployees.length}
                    pageSize={PAGE_SIZE}
                    itemLabel="pegawai nonaktif"
                    onPrevious={() => setInactivePage((page) => Math.max(1, page - 1))}
                    onNext={() => setInactivePage((page) => Math.min(inactiveTotalPages, page + 1))}
                  />
                ) : null}
              </TabsContent>
              <TabsContent value="butuh-review">
                <div className="mb-4 grid gap-3 md:grid-cols-4">
                  {cleanupPriorityCards.map((item) => (
                    <Card key={item.label}>
                      <CardHeader className="pb-2">
                        <CardDescription>{item.label}</CardDescription>
                        <CardTitle className="text-2xl">{item.count}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                        {item.count > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveTab("butuh-review");
                              setSelectedPayrollGap(item.gap);
                            }}
                          >
                            Fokuskan
                          </Button>
                        ) : (
                          <Badge variant="default">Aman</Badge>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={selectedPayrollGap === "semua" ? "default" : "outline"}
                    onClick={() => setSelectedPayrollGap("semua")}
                  >
                    Semua Gap ({incompleteEmployees.length})
                  </Button>
                  {payrollGapCounts.map((item) => (
                    <Button
                      key={item.label}
                      size="sm"
                      variant={selectedPayrollGap === item.label ? "default" : "outline"}
                      onClick={() => setSelectedPayrollGap(item.label)}
                    >
                      {item.label} ({item.count})
                    </Button>
                  ))}
                </div>
                {selectedPayrollGap === "Kategori" ? (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={bulkCategoryTargets.length === 0}
                        onClick={() => setSelectedBulkEmployeeIds(bulkCategoryTargets.map((item) => item.id))}
                      >
                        Pilih Semua ({bulkCategoryTargets.length})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={selectedBulkEmployeeIds.length === 0}
                        onClick={() => setSelectedBulkEmployeeIds([])}
                      >
                        Hapus Pilihan
                      </Button>
                    </div>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {EMPLOYEE_CATEGORY_OPTIONS.map((option) => (
                        <Button
                          key={`bulk-category-${option}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isBulkSaving || effectiveBulkCategoryTargets.length === 0}
                          onClick={() => requestBulkFillCategory(option)}
                        >
                          {selectedBulkCategoryTargets.length > 0 ? "Isi Terpilih" : "Isi Semua"}: {option}
                        </Button>
                      ))}
                    </div>
                  </>
                ) : null}
                <p className="mb-4 text-sm text-muted-foreground">
                  Menampilkan <strong>{reviewedIncompleteEmployees.length}</strong> pegawai dengan gap{" "}
                  <strong>{selectedPayrollGap === "semua" ? "apa pun" : selectedPayrollGap}</strong>.
                </p>
                {selectedPayrollGap === "Kategori" ? (
                  <p className="mb-4 text-sm text-muted-foreground">
                    {selectedBulkCategoryTargets.length > 0 ? (
                      <>
                        Bulk kategori akan memakai <strong>{selectedBulkCategoryTargets.length}</strong> pegawai terpilih.
                      </>
                    ) : (
                      <>
                        Belum ada seleksi khusus. Bulk kategori akan memakai seluruh hasil filter <strong>Kategori</strong>.
                      </>
                    )}
                  </p>
                ) : null}
                <EmployeeTable
                  rows={reviewedIncompleteEmployees}
                  isLoading={isLoading}
                  canEdit={access.canEdit}
                  onEdit={openEditDialog}
                  opdMap={opdMap}
                  workUnitMap={workUnitMap}
                  officeMap={officeMap}
                  positionMap={positionMap}
                  selectableRows={selectedPayrollGap === "Kategori" ? bulkCategoryTargets.map((item) => item.id) : []}
                  selectedRowIds={selectedBulkEmployeeIds}
                  onToggleRow={(rowId, checked) =>
                    setSelectedBulkEmployeeIds((current) =>
                      checked ? Array.from(new Set([...current, rowId])) : current.filter((item) => item !== rowId),
                    )
                  }
                />
              </TabsContent>
              <TabsContent value="ringkas">
                <div className="grid gap-3 md:grid-cols-3">
                  <Card><CardContent className="pt-6 text-sm">Kategori terpakai: <strong>{categoryCount}</strong></CardContent></Card>
                  <Card><CardContent className="pt-6 text-sm">Golongan terpakai: <strong>{golonganCount}</strong></CardContent></Card>
                  <Card><CardContent className="pt-6 text-sm">Pegawai aktif yang belum payroll-ready: <strong>{rows.filter((item) => item.is_active !== false && getPayrollImpactGaps(item).length > 0).length}</strong></CardContent></Card>
                </div>
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle className="text-base">Prioritas Cleanup Tenant</CardTitle>
                    <CardDescription>
                      Gunakan daftar ini untuk membereskan data aktif yang paling menghambat readiness operasional.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-4">
                      {cleanupPriorityCards.map((item) => (
                        <Card key={`summary-${item.label}`}>
                          <CardHeader className="pb-2">
                            <CardDescription>{item.label}</CardDescription>
                            <CardTitle className="text-2xl">{item.count}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                            {item.count > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveTab("butuh-review");
                                  setSelectedPayrollGap(item.gap);
                                }}
                              >
                                Fokuskan
                              </Button>
                            ) : (
                              <Badge variant="default">Aman</Badge>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle className="text-base">Checklist Payroll-Impact</CardTitle>
                    <CardDescription>
                      Gunakan ringkasan ini untuk melihat field mana yang paling sering belum lengkap pada pegawai aktif.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-3">
                      {payrollGapCounts.map((item) => (
                        <Card key={item.label}>
                          <CardHeader className="pb-2">
                            <CardDescription>{item.label}</CardDescription>
                            <CardTitle className="text-2xl">{item.count}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={item.count > 0 ? "secondary" : "default"}>
                                {item.count > 0 ? "Perlu dirapikan" : "Sudah aman"}
                              </Badge>
                              {item.count > 0 ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setActiveTab("butuh-review");
                                    setSelectedPayrollGap(item.label);
                                  }}
                                >
                                  Fokuskan
                                </Button>
                              ) : null}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{formState.id ? "Edit Data Pegawai" : "Tambah Pegawai"}</DialogTitle>
              <DialogDescription>
                {formState.id
                  ? "Perbarui field inti pegawai agar readiness HR menuju payroll lebih konsisten."
                  : "Tambahkan pegawai baru langsung dari workspace HR untuk menutup gap master payroll-ready."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              {formState.id && dialogPayrollGaps.length > 0 ? (
                <Card className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Field Prioritas Payroll</CardTitle>
                    <CardDescription>
                      Lengkapi field berikut agar pegawai ini keluar dari daftar `Butuh Review`.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {dialogPayrollGaps.map((gap) => (
                      <Button
                        key={`dialog-gap-${gap}`}
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => focusPayrollGapField(gap)}
                      >
                        {gap}
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
              {formState.id && activeTab === "butuh-review" && reviewQueueIndex >= 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Progres Tinjau</CardTitle>
                    <CardDescription>
                      Sedang meninjau <strong>{reviewQueueIndex + 1}</strong> dari{" "}
                      <strong>{reviewScopeEmployees.length}</strong> pegawai untuk gap{" "}
                      <strong>{selectedPayrollGap === "semua" ? "apa pun" : selectedPayrollGap}</strong>.
                      {selectedPayrollGap === "Kategori" && selectedBulkCategoryTargets.length > 0 ? " Cakupan tinjau mengikuti pegawai terpilih." : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${((reviewQueueIndex + 1) / Math.max(reviewScopeEmployees.length, 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="employee-name">Nama</Label>
                <Input
                  id="employee-name"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employee-email">Email</Label>
                <Input
                  id="employee-email"
                  type="email"
                  value={formState.email}
                  onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employee-nik">NIK</Label>
                <Input
                  id="employee-nik"
                  value={formState.nik}
                  onChange={(event) => setFormState((prev) => ({ ...prev, nik: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employee-nip">NIP</Label>
                <Input
                  id="employee-nip"
                  value={formState.nip}
                  onChange={(event) => setFormState((prev) => ({ ...prev, nip: event.target.value }))}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="employee-category">Kategori Pegawai</Label>
                  <Input
                    id="employee-category"
                    list="employee-category-options"
                    value={formState.employee_category}
                    onChange={(event) => setFormState((prev) => ({ ...prev, employee_category: event.target.value }))}
                  />
                  <datalist id="employee-category-options">
                    {EMPLOYEE_CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  <div className="flex flex-wrap gap-2">
                    {EMPLOYEE_CATEGORY_OPTIONS.map((option) => (
                      <Button
                        key={`category-option-${option}`}
                        type="button"
                        size="sm"
                        variant={formState.employee_category === option ? "default" : "outline"}
                        onClick={() => setFormState((prev) => ({ ...prev, employee_category: option }))}
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="employee-golongan">Golongan</Label>
                  <Input
                    id="employee-golongan"
                    value={formState.golongan}
                    onChange={(event) => setFormState((prev) => ({ ...prev, golongan: event.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employee-position">Jabatan</Label>
                <Input
                  id="employee-position"
                  value={formState.position}
                  onChange={(event) => setFormState((prev) => ({ ...prev, position: event.target.value }))}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="employee-opd">OPD</Label>
                  <select
                    id="employee-opd"
                    value={formState.opd_id}
                    onChange={(event) => setFormState((prev) => applyEmployeeOpdChange(prev, event.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Pilih OPD...</option>
                    {opds.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="employee-work-unit">Unit Kerja</Label>
                  <select
                    id="employee-work-unit"
                    value={formState.work_unit_id}
                    onChange={(event) => setFormState((prev) => ({ ...prev, work_unit_id: event.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Pilih Unit Kerja...</option>
                    {availableWorkUnits.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="employee-office">Lokasi Kerja</Label>
                  <select
                    id="employee-office"
                    value={formState.office_id}
                    onChange={(event) => setFormState((prev) => ({ ...prev, office_id: event.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Pilih Lokasi Kerja...</option>
                    {availableOffices.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="employee-position-id">Jabatan Master</Label>
                  <select
                    id="employee-position-id"
                    value={formState.position_id}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        position_id: event.target.value,
                        position: positionMap.get(event.target.value) || prev.position,
                      }))
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Pilih Jabatan Master...</option>
                    {availablePositions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employee-status">Status</Label>
                <Button
                  id="employee-status"
                  type="button"
                  variant={formState.is_active ? "default" : "secondary"}
                  className="justify-start"
                  onClick={() => setFormState((prev) => ({ ...prev, is_active: !prev.is_active }))}
                >
                  {formState.is_active ? "Aktif" : "Nonaktif"}
                </Button>
              </div>
            </div>
            <DialogFooter>
              {formState.id && activeTab === "butuh-review" ? (
                <div className="mr-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => previousReviewEmployee && openEditDialog(previousReviewEmployee)}
                    disabled={isSubmitting || !previousReviewEmployee}
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => nextReviewEmployee && openEditDialog(nextReviewEmployee)}
                    disabled={isSubmitting || !nextReviewEmployee}
                  >
                    Berikutnya
                  </Button>
                </div>
              ) : null}
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Batal
              </Button>
              {formState.id && activeTab === "butuh-review" ? (
                <Button type="button" variant="outline" onClick={() => void handleSave("next")} disabled={isSubmitting}>
                  Simpan & Lanjut
                </Button>
              ) : null}
              <Button onClick={() => void handleSave()} disabled={isSubmitting}>
                {formState.id ? "Simpan Perubahan" : "Tambah Pegawai"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={Boolean(pendingBulkCategory)} onOpenChange={(open) => !open && setPendingBulkCategory(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Konfirmasi Bulk Kategori</AlertDialogTitle>
              <AlertDialogDescription>
                Bulk action ini akan mengisi <strong>{effectiveBulkCategoryTargets.length}</strong>{" "}
                pegawai {selectedBulkCategoryTargets.length > 0 ? "terpilih" : "pada filter"} <strong>Kategori</strong> dengan nilai{" "}
                <strong>{pendingBulkCategory || "-"}</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Gunakan aksi ini hanya jika asumsi kategorinya memang seragam untuk seluruh hasil filter saat ini.
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Pratinjau pegawai terdampak</p>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
                {effectiveBulkCategoryTargets.slice(0, 8).map((item) => (
                  <div key={`bulk-preview-${item.id}`} className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.email}</div>
                    </div>
                    <Badge variant="secondary">{item.employee_category || "Kategori kosong"}</Badge>
                  </div>
                ))}
                {effectiveBulkCategoryTargets.length > 8 ? (
                  <div className="text-xs text-muted-foreground">
                    +{effectiveBulkCategoryTargets.length - 8} pegawai lain akan ikut diperbarui.
                  </div>
                ) : null}
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isBulkSaving}>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleBulkFillCategory()} disabled={isBulkSaving}>
                {isBulkSaving ? "Memproses..." : "Ya, Isi Massal"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </OrganizationLayout>
  );
}

function EmployeeTable({
  rows,
  isLoading,
  canEdit,
  onEdit,
  opdMap,
  workUnitMap,
  officeMap,
  positionMap,
  selectableRows = [],
  selectedRowIds = [],
  onToggleRow,
}: {
  rows: EmployeeRow[];
  isLoading: boolean;
  canEdit: boolean;
  onEdit: (row: EmployeeRow) => void;
  opdMap: Map<string, string>;
  workUnitMap: Map<string, string>;
  officeMap: Map<string, string>;
  positionMap: Map<string, string>;
  selectableRows?: string[];
  selectedRowIds?: string[];
  onToggleRow?: (rowId: string, checked: boolean) => void;
}) {
  const selectableRowSet = new Set(selectableRows);
  const selectedRowSet = new Set(selectedRowIds);
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Memuat data pegawai...</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada data pegawai untuk tab ini.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selectableRows.length > 0 ? <TableHead className="w-12">Pilih</TableHead> : null}
          <TableHead>Nama</TableHead>
          <TableHead>Relasi Organisasi</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>NIK</TableHead>
          <TableHead>NIP</TableHead>
          <TableHead>Kategori</TableHead>
          <TableHead>Golongan</TableHead>
          <TableHead>Jabatan</TableHead>
          <TableHead>Gap Payroll</TableHead>
          <TableHead>Akun</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            {selectableRows.length > 0 ? (
              <TableCell>
                {selectableRowSet.has(item.id) ? (
                  <input
                    type="checkbox"
                    aria-label={`Pilih ${item.name}`}
                    checked={selectedRowSet.has(item.id)}
                    onChange={(event) => onToggleRow?.(item.id, event.target.checked)}
                    className="h-4 w-4"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
            ) : null}
            <TableCell className="font-medium">{item.name}</TableCell>
            <TableCell>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div>OPD: {item.opd_id ? opdMap.get(item.opd_id) || "-" : "-"}</div>
                <div>Unit: {item.work_unit_id ? workUnitMap.get(item.work_unit_id) || "-" : "-"}</div>
                <div>Lokasi: {item.office_id ? officeMap.get(item.office_id) || "-" : "-"}</div>
              </div>
            </TableCell>
            <TableCell>{item.email}</TableCell>
            <TableCell>{item.nik}</TableCell>
            <TableCell>{item.nip || "-"}</TableCell>
            <TableCell>{item.employee_category || "-"}</TableCell>
            <TableCell>{item.golongan || "-"}</TableCell>
            <TableCell>{item.position_id ? positionMap.get(item.position_id) || item.position || "-" : item.position || "-"}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {getPayrollImpactGaps(item).length === 0 ? (
                  <Badge variant="default">Siap</Badge>
                ) : (
                  getPayrollImpactGaps(item).map((gap) => (
                    <Badge key={`${item.id}-${gap}`} variant="secondary">
                      {gap}
                    </Badge>
                  ))
                )}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={item.user_id ? "default" : "secondary"}>
                {item.user_id ? "Siap" : "Belum"}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={item.is_active === false ? "secondary" : "default"}>
                {item.is_active === false ? "Nonaktif" : "Aktif"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="outline" onClick={() => onEdit(item)} disabled={!canEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Ubah
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
