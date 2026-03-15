import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Files, Plus, Search, ShieldCheck, Stamp, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { fetchSupabaseRest } from "@/lib/supabaseRestClient";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { useOrgHrContextNavigate } from "@/hooks/useOrgHrContextNavigate";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";

type ContractRow = Database["public"]["Tables"]["hr_contracts"]["Row"];
type EmployeeLite = { id: string; name: string; email: string };
type MutationRequestDocumentRow = Pick<
  Database["public"]["Tables"]["mutation_requests"]["Row"],
  | "id"
  | "employee_id"
  | "status"
  | "reason"
  | "document_reference_number"
  | "document_reference_date"
  | "document_reference_issuer"
  | "document_reference_notes"
  | "created_at"
>;
type LeaveRequestDocumentRow = Pick<
  Database["public"]["Tables"]["leave_requests"]["Row"],
  | "id"
  | "employee_id"
  | "status"
  | "reason"
  | "document_reference_number"
  | "document_reference_date"
  | "document_reference_issuer"
  | "document_reference_notes"
  | "created_at"
>;
type TemplateRow = Pick<
  Database["public"]["Tables"]["hr_document_templates"]["Row"],
  "id" | "template_name" | "template_type" | "description" | "is_active" | "version" | "updated_at"
>;

type AdminDocumentRow = {
  id: string;
  employee_id: string | null;
  source: "mutation_request" | "leave_request";
  status: string | null;
  reason: string | null;
  document_reference_number: string | null;
  document_reference_date: string | null;
  document_reference_issuer: string | null;
  document_reference_notes: string | null;
  created_at: string;
};

type EmployeeDocumentCoverageRow = {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  contract_count: number;
  active_contract_count: number;
  admin_reference_count: number;
  latest_document_at: string | null;
  coverage_status: "lengkap" | "sebagian" | "belum";
  follow_up: string;
};

type EmployeeDocumentRow = {
  id: string;
  tenant_id: string;
  employee_id: string;
  document_title: string;
  document_category: string;
  document_number: string | null;
  document_date: string | null;
  issuer: string | null;
  notes: string | null;
  archive_reference: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

type EmployeeDocumentFormState = {
  id: string | null;
  employee_id: string;
  document_title: string;
  document_category: string;
  document_number: string;
  document_date: string;
  issuer: string;
  notes: string;
  archive_reference: string;
  is_archived: boolean;
};

const PAGE_SIZE = 10;
const DOCUMENT_CATEGORY_OPTIONS = [
  "Kontrak",
  "Identitas",
  "Administrasi",
  "Perpajakan",
  "Evaluasi",
  "Pelatihan",
  "Lainnya",
];

const DOCUMENT_CATEGORY_CODE: Record<string, string> = {
  Kontrak: "KON",
  Identitas: "IDN",
  Administrasi: "ADM",
  Perpajakan: "TAX",
  Evaluasi: "EVL",
  Pelatihan: "TRN",
  Lainnya: "DOC",
};

const INITIAL_DOCUMENT_FORM: EmployeeDocumentFormState = {
  id: null,
  employee_id: "",
  document_title: "",
  document_category: "Administrasi",
  document_number: "",
  document_date: "",
  issuer: "",
  notes: "",
  archive_reference: "",
  is_archived: false,
};

const toEmployeeDocumentAuditPayload = (document: {
  tenant_id?: string;
  employee_id: string;
  document_title: string;
  document_category: string;
  document_number: string | null;
  document_date: string | null;
  issuer: string | null;
  notes: string | null;
  archive_reference: string | null;
  is_archived: boolean;
}) => ({
  tenant_id: document.tenant_id,
  employee_id: document.employee_id,
  document_title: document.document_title,
  document_category: document.document_category,
  document_number: document.document_number,
  document_date: document.document_date,
  issuer: document.issuer,
  notes: document.notes,
  archive_reference: document.archive_reference,
  is_archived: document.is_archived,
});

const normalizeText = (value: string | null | undefined) => (value || "").trim().toLowerCase();

const toArchiveToken = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);

const normalizeDocumentNumber = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9/_-]/g, "");

const formatDateLabel = (dateValue: string | null) => {
  if (!dateValue) return "-";
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const formatDateTimeLabel = (dateValue: string | null) => {
  if (!dateValue) return "-";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
};

export default function OrgHRDocuments() {
  const navigate = useOrgHrContextNavigate();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [adminDocuments, setAdminDocuments] = useState<AdminDocumentRow[]>([]);
  const [employeeDocuments, setEmployeeDocuments] = useState<EmployeeDocumentRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false);
  const [documentForm, setDocumentForm] = useState<EmployeeDocumentFormState>(INITIAL_DOCUMENT_FORM);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft" | "ended" | "terminated">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/documents");
  const confirmDialog = useConfirmDialog();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const [contractRes, employeeRes, mutationRes, leaveRes, templateRes, employeeDocumentRows] = await Promise.all([
        supabase.from("hr_contracts").select("*").eq("tenant_id", tenantId).order("start_date", { ascending: false }).limit(200),
        supabase.from("employees").select("id, name, email").eq("tenant_id", tenantId).order("name", { ascending: true }).limit(2000),
        supabase
          .from("mutation_requests")
          .select("id, employee_id, status, reason, document_reference_number, document_reference_date, document_reference_issuer, document_reference_notes, created_at")
          .eq("tenant_id", tenantId)
          .not("document_reference_number", "is", null)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("leave_requests")
          .select("id, employee_id, status, reason, document_reference_number, document_reference_date, document_reference_issuer, document_reference_notes, created_at")
          .eq("tenant_id", tenantId)
          .not("document_reference_number", "is", null)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("hr_document_templates")
          .select("id, template_name, template_type, description, is_active, version, updated_at")
          .eq("tenant_id", tenantId)
          .order("template_name", { ascending: true }),
        fetchSupabaseRest<EmployeeDocumentRow[]>("hr_employee_documents", {
          params: {
            select: "id,tenant_id,employee_id,document_title,document_category,document_number,document_date,issuer,notes,archive_reference,is_archived,created_at,updated_at",
            tenant_id: `eq.${tenantId}`,
            order: "updated_at.desc",
            limit: "500",
          },
        }),
      ]);
      if (contractRes.error) throw contractRes.error;
      if (employeeRes.error) throw employeeRes.error;
      if (mutationRes.error) throw mutationRes.error;
      if (leaveRes.error) throw leaveRes.error;
      if (templateRes.error) throw templateRes.error;

      setContracts(contractRes.data || []);
      setEmployees((employeeRes.data || []) as EmployeeLite[]);
      setAdminDocuments([
        ...((mutationRes.data || []) as MutationRequestDocumentRow[]).map((item) => ({
          ...item,
          source: "mutation_request" as const,
        })),
        ...((leaveRes.data || []) as LeaveRequestDocumentRow[]).map((item) => ({
          ...item,
          source: "leave_request" as const,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setEmployeeDocuments(employeeDocumentRows || []);
      setTemplates((templateRes.data || []) as TemplateRow[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.documents.fetch");
      const message = appendErrorReference("Gagal memuat dokumen HR", ref);
      toast.error(message);
      setLoadError(message);
      setContracts([]);
      setEmployees([]);
      setAdminDocuments([]);
      setEmployeeDocuments([]);
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const employeeMap = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees]);
  const keyword = search.trim().toLowerCase();
  const selectedEmployee = useMemo(
    () => (documentForm.employee_id ? employeeMap.get(documentForm.employee_id) || null : null),
    [documentForm.employee_id, employeeMap],
  );
  const documentYear = documentForm.document_date ? documentForm.document_date.slice(0, 4) : new Date().getFullYear().toString();
  const categoryCode = DOCUMENT_CATEGORY_CODE[documentForm.document_category] || "DOC";
  const employeeToken = selectedEmployee ? toArchiveToken(selectedEmployee.name).slice(0, 6) || "PEG" : "PEG";
  const suggestedDocumentNumber = `${categoryCode}/${documentYear}/${employeeToken}/001`;
  const suggestedArchiveReference = `LEMARI-HR/Rak-${documentYear}/${categoryCode}/${employeeToken}`;

  const filteredContracts = useMemo(() => {
    return contracts.filter((item) => {
      const status = normalizeText(item.status);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!keyword) return true;
      const employee = employeeMap.get(item.employee_id);
      return [
        item.contract_number || "",
        item.contract_type,
        item.status,
        item.notes || "",
        employee?.name || "",
        employee?.email || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [contracts, employeeMap, keyword, statusFilter]);

  const filteredAdminDocuments = useMemo(() => {
    return adminDocuments.filter((item) => {
      if (!keyword) return true;
      const employee = item.employee_id ? employeeMap.get(item.employee_id) : null;
      return [
        item.source === "mutation_request" ? "mutasi" : "cuti",
        item.document_reference_number || "",
        item.document_reference_issuer || "",
        item.document_reference_notes || "",
        item.reason || "",
        item.status || "",
        employee?.name || "",
        employee?.email || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [adminDocuments, employeeMap, keyword]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((item) => {
      if (!keyword) return true;
      return [item.template_name, item.template_type, item.description || "", item.is_active ? "aktif" : "nonaktif"]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [templates, keyword]);

  const filteredEmployeeDocuments = useMemo(() => {
    return employeeDocuments.filter((item) => {
      const employee = employeeMap.get(item.employee_id);
      if (!keyword) return true;
      return [
        item.document_title,
        item.document_category,
        item.document_number || "",
        item.issuer || "",
        item.notes || "",
        item.archive_reference || "",
        item.is_archived ? "arsip" : "aktif",
        employee?.name || "",
        employee?.email || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [employeeDocuments, employeeMap, keyword]);

  const employeeCoverageRows = useMemo(() => {
    return employees
      .map((employee) => {
        const employeeContracts = contracts.filter((item) => item.employee_id === employee.id);
        const employeeAdminDocuments = adminDocuments.filter((item) => item.employee_id === employee.id);
        const latestDates = [
          ...employeeContracts.flatMap((item) => [item.start_date, item.updated_at, item.created_at]),
          ...employeeAdminDocuments.map((item) => item.created_at),
        ].filter(Boolean) as string[];
        const latestDocumentAt =
          latestDates.length > 0
            ? latestDates.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0]
            : null;

        const contractCount = employeeContracts.length;
        const activeContractCount = employeeContracts.filter((item) => normalizeText(item.status) === "active").length;
        const adminReferenceCount = employeeAdminDocuments.length;
        const sourceCount = contractCount + adminReferenceCount;
        const coverageStatus =
          sourceCount === 0 ? "belum" : contractCount > 0 && adminReferenceCount > 0 ? "lengkap" : "sebagian";
        const followUp =
          sourceCount === 0
            ? "Tambahkan kontrak atau referensi administrasi"
            : contractCount === 0
              ? "Lengkapi arsip kontrak pegawai"
              : adminReferenceCount === 0
                ? "Lengkapi referensi administrasi pegawai"
                : "Cakupan dasar sudah ada";

        return {
          employee_id: employee.id,
          employee_name: employee.name,
          employee_email: employee.email,
          contract_count: contractCount,
          active_contract_count: activeContractCount,
          admin_reference_count: adminReferenceCount,
          latest_document_at: latestDocumentAt,
          coverage_status: coverageStatus,
          follow_up: followUp,
        } satisfies EmployeeDocumentCoverageRow;
      })
      .filter((item) => {
        if (!keyword) return true;
        return [
          item.employee_name,
          item.employee_email,
          item.follow_up,
          item.coverage_status,
          String(item.contract_count),
          String(item.admin_reference_count),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort((left, right) => {
        const weight = { belum: 0, sebagian: 1, lengkap: 2 } as const;
        if (weight[left.coverage_status] !== weight[right.coverage_status]) {
          return weight[left.coverage_status] - weight[right.coverage_status];
        }
        return left.employee_name.localeCompare(right.employee_name, "id-ID");
      });
  }, [adminDocuments, contracts, employees, keyword]);

  const totalPages = Math.max(1, Math.ceil(filteredContracts.length / PAGE_SIZE));
  const adminTotalPages = Math.max(1, Math.ceil(filteredAdminDocuments.length / PAGE_SIZE));
  const templateTotalPages = Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE));
  const employeeDocumentsTotalPages = Math.max(1, Math.ceil(filteredEmployeeDocuments.length / PAGE_SIZE));
  const employeeCoverageTotalPages = Math.max(1, Math.ceil(employeeCoverageRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const safeAdminPage = Math.min(currentPage, adminTotalPages);
  const safeTemplatePage = Math.min(currentPage, templateTotalPages);
  const safeEmployeeDocumentsPage = Math.min(currentPage, employeeDocumentsTotalPages);
  const safeEmployeeCoveragePage = Math.min(currentPage, employeeCoverageTotalPages);

  const pagedContracts = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return filteredContracts.slice(from, from + PAGE_SIZE);
  }, [filteredContracts, safePage]);

  const pagedAdminDocuments = useMemo(() => {
    const from = (safeAdminPage - 1) * PAGE_SIZE;
    return filteredAdminDocuments.slice(from, from + PAGE_SIZE);
  }, [filteredAdminDocuments, safeAdminPage]);

  const pagedTemplates = useMemo(() => {
    const from = (safeTemplatePage - 1) * PAGE_SIZE;
    return filteredTemplates.slice(from, from + PAGE_SIZE);
  }, [filteredTemplates, safeTemplatePage]);

  const pagedEmployeeDocuments = useMemo(() => {
    const from = (safeEmployeeDocumentsPage - 1) * PAGE_SIZE;
    return filteredEmployeeDocuments.slice(from, from + PAGE_SIZE);
  }, [filteredEmployeeDocuments, safeEmployeeDocumentsPage]);

  const pagedEmployeeCoverage = useMemo(() => {
    const from = (safeEmployeeCoveragePage - 1) * PAGE_SIZE;
    return employeeCoverageRows.slice(from, from + PAGE_SIZE);
  }, [employeeCoverageRows, safeEmployeeCoveragePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    setCurrentPage((page) =>
      Math.min(page, Math.max(totalPages, adminTotalPages, templateTotalPages, employeeCoverageTotalPages)),
    );
  }, [totalPages, adminTotalPages, templateTotalPages, employeeCoverageTotalPages, employeeDocumentsTotalPages]);

  const documentSummary = useMemo(
    () => ({
      contracts: contracts.length,
      adminReferences: adminDocuments.length,
      activeTemplates: templates.filter((item) => item.is_active).length,
      employeeRepositoryDocuments: employeeDocuments.length,
      employeesWithDocuments: employeeCoverageRows.filter((item) => item.coverage_status !== "belum").length,
      employeesMissingDocuments: employeeCoverageRows.filter((item) => item.coverage_status === "belum").length,
    }),
    [contracts, adminDocuments, templates, employeeCoverageRows, employeeDocuments],
  );

  const openDocumentDialog = (document?: EmployeeDocumentRow) => {
    if (!access.canConfigure) {
      toast.error("Aksi kelola dokumen pegawai hanya tersedia untuk admin organisasi.");
      return;
    }
    if (document) {
      setDocumentForm({
        id: document.id,
        employee_id: document.employee_id,
        document_title: document.document_title,
        document_category: document.document_category,
        document_number: document.document_number || "",
        document_date: document.document_date || "",
        issuer: document.issuer || "",
        notes: document.notes || "",
        archive_reference: document.archive_reference || "",
        is_archived: document.is_archived,
      });
    } else {
      setDocumentForm(INITIAL_DOCUMENT_FORM);
    }
    setIsDocumentDialogOpen(true);
  };

  const handleSaveEmployeeDocument = async () => {
    if (!access.canConfigure) {
      toast.error("Aksi simpan dokumen pegawai hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!documentForm.employee_id) {
      toast.error("Pilih pegawai terlebih dahulu.");
      return;
    }
    if (!documentForm.document_title.trim()) {
      toast.error("Judul dokumen wajib diisi.");
      return;
    }
    const normalizedDocumentNumber = normalizeDocumentNumber(documentForm.document_number);
    if (!normalizedDocumentNumber) {
      toast.error("Nomor dokumen wajib diisi agar arsip fisik dapat ditelusuri.");
      return;
    }
    if (!documentForm.archive_reference.trim()) {
      toast.error("Referensi arsip fisik wajib diisi.");
      return;
    }

    setIsSavingDocument(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        tenant_id: tenantId,
        employee_id: documentForm.employee_id,
        document_title: documentForm.document_title.trim(),
        document_category: documentForm.document_category.trim() || "Administrasi",
        document_number: normalizedDocumentNumber,
        document_date: documentForm.document_date || null,
        issuer: documentForm.issuer.trim() || null,
        notes: documentForm.notes.trim() || null,
        archive_reference: documentForm.archive_reference.trim() || null,
        is_archived: documentForm.is_archived,
      };

      if (documentForm.id) {
        const previousDocument = employeeDocuments.find((item) => item.id === documentForm.id) || null;
        await fetchSupabaseRest<null>("hr_employee_documents", {
          method: "PATCH",
          params: {
            id: `eq.${documentForm.id}`,
            tenant_id: `eq.${tenantId}`,
          },
          body: payload,
          prefer: "return=minimal",
        });
        await fetchSupabaseRest<null>("audit_logs", {
          method: "POST",
          body: {
            tenant_id: tenantId,
            employee_id: documentForm.employee_id,
            user_id: user?.id || null,
            table_name: "hr_employee_documents",
            action: "employee_document_update",
            record_id: documentForm.id,
            old_values: previousDocument ? toEmployeeDocumentAuditPayload(previousDocument) : null,
            new_values: toEmployeeDocumentAuditPayload(payload),
          },
          prefer: "return=minimal",
        });
      } else {
        const insertedRows = await fetchSupabaseRest<Array<Pick<EmployeeDocumentRow, "id">>>("hr_employee_documents", {
          method: "POST",
          prefer: "return=representation",
          body: payload,
        });
        await fetchSupabaseRest<null>("audit_logs", {
          method: "POST",
          body: {
            tenant_id: tenantId,
            employee_id: documentForm.employee_id,
            user_id: user?.id || null,
            table_name: "hr_employee_documents",
            action: "employee_document_create",
            record_id: insertedRows?.[0]?.id || null,
            old_values: null,
            new_values: toEmployeeDocumentAuditPayload(payload),
          },
          prefer: "return=minimal",
        });
      }

      toast.success(`Dokumen pegawai berhasil ${documentForm.id ? "diperbarui" : "ditambahkan"}.`);
      setIsDocumentDialogOpen(false);
      setDocumentForm(INITIAL_DOCUMENT_FORM);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.documents.employee_document.save", {
        document_id: documentForm.id,
        employee_id: documentForm.employee_id,
      });
      toast.error(appendErrorReference("Gagal menyimpan dokumen pegawai", ref));
    } finally {
      setIsSavingDocument(false);
    }
  };

  const handleDeleteEmployeeDocument = async (document: EmployeeDocumentRow) => {
    if (!access.canConfigure) {
      toast.error("Aksi hapus dokumen pegawai hanya tersedia untuk admin organisasi.");
      return;
    }
    const employee = employeeMap.get(document.employee_id);
    const confirmed = await confirmDialog({
      title: "Hapus Dokumen Pegawai",
      description: `Dokumen "${document.document_title}" untuk ${employee?.name || "pegawai"} akan dihapus.`,
      confirmText: "Ya, hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await fetchSupabaseRest<null>("hr_employee_documents", {
        method: "DELETE",
        params: {
          id: `eq.${document.id}`,
          tenant_id: `eq.${tenantId}`,
        },
        prefer: "return=minimal",
      });

      await fetchSupabaseRest<null>("audit_logs", {
        method: "POST",
        body: {
          tenant_id: tenantId,
          employee_id: document.employee_id,
          user_id: user?.id || null,
          table_name: "hr_employee_documents",
          action: "employee_document_delete",
          record_id: document.id,
          old_values: toEmployeeDocumentAuditPayload(document),
          new_values: null,
        },
        prefer: "return=minimal",
      });

      toast.success("Dokumen pegawai berhasil dihapus.");
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.documents.employee_document.delete", {
        document_id: document.id,
        employee_id: document.employee_id,
      });
      toast.error(appendErrorReference("Gagal menghapus dokumen pegawai", ref));
    }
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Dokumen</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Dokumen HR</h1>
          <p className="text-sm text-muted-foreground">
            Repository awal dokumen HR untuk kontrak, referensi administrasi, dan template tenant.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canConfigure ? "arsip internal + konfigurasi template" : "mode arsip baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-6">
          <MetricCard title="Arsip Kontrak" value={documentSummary.contracts} icon={FileText} description="Dokumen kontrak pegawai" />
          <MetricCard title="Referensi Administrasi" value={documentSummary.adminReferences} icon={Stamp} description="Mutasi dan cuti yang punya referensi" />
          <MetricCard title="Templat Aktif" value={documentSummary.activeTemplates} icon={Files} description="Templat tenant aktif" />
          <MetricCard title="Repository Pegawai" value={documentSummary.employeeRepositoryDocuments} icon={Files} description="Metadata dokumen pegawai" />
          <MetricCard title="Pegawai Terdokumentasi" value={documentSummary.employeesWithDocuments} icon={ShieldCheck} description="Minimal punya 1 sumber arsip" />
          <MetricCard title="Pegawai Belum Ada Arsip" value={documentSummary.employeesMissingDocuments} icon={FileText} description="Perlu tindak lanjut dokumen" />
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {access.canConfigure ? (
                <Button size="sm" onClick={() => openDocumentDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Dokumen Pegawai
                </Button>
              ) : null}
              <Button size="sm" onClick={() => navigate("/org/hr/contracts")}>Kelola Kontrak Kerja</Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/org/hr/document-templates")}>
                <Files className="mr-2 h-4 w-4" />
                Buka Templat Dokumen
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/org/hr/settings")}
                disabled={isLoadingAccess || !access.canConfigure}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Buka Pengaturan
              </Button>
            </div>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari kontrak, pegawai, tipe, status..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: "Semua" },
                { key: "active", label: "Aktif" },
                { key: "draft", label: "Draf" },
                { key: "ended", label: "Berakhir" },
                { key: "terminated", label: "Terminasi" },
              ].map((item) => (
                <Button
                  key={item.key}
                  type="button"
                  size="sm"
                  variant={statusFilter === item.key ? "default" : "outline"}
                  onClick={() => setStatusFilter(item.key as typeof statusFilter)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="kontrak">
              <TabsList>
                <TabsTrigger value="repository">Dokumen Pegawai ({filteredEmployeeDocuments.length})</TabsTrigger>
                <TabsTrigger value="pegawai">Cakupan Pegawai ({employeeCoverageRows.length})</TabsTrigger>
                <TabsTrigger value="kontrak">Arsip Kontrak ({filteredContracts.length})</TabsTrigger>
                <TabsTrigger value="administrasi">Referensi Administrasi ({filteredAdminDocuments.length})</TabsTrigger>
                <TabsTrigger value="template">Templat ({filteredTemplates.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="repository">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Memuat repository dokumen pegawai...</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pegawai</TableHead>
                          <TableHead>Dokumen</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead>Nomor / Tanggal</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedEmployeeDocuments.map((item) => {
                          const employee = employeeMap.get(item.employee_id);
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="font-medium">{employee?.name || "-"}</div>
                                <div className="text-xs text-muted-foreground">{employee?.email || "-"}</div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{item.document_title}</div>
                                <div className="text-xs text-muted-foreground">{item.issuer || item.notes || "-"}</div>
                              </TableCell>
                              <TableCell>{item.document_category}</TableCell>
                              <TableCell>
                                <div>{item.document_number || "-"}</div>
                                <div className="text-xs text-muted-foreground">{formatDateLabel(item.document_date)}</div>
                              </TableCell>
                              <TableCell>{item.is_archived ? "Arsip" : "Aktif"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  {access.canConfigure ? (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => openDocumentDialog(item)}>
                                        Edit
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => void handleDeleteEmployeeDocument(item)}>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Hapus
                                      </Button>
                                    </>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredEmployeeDocuments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                              {employeeDocuments.length === 0 ? "Belum ada metadata dokumen pegawai." : "Tidak ada dokumen pegawai yang cocok dengan filter."}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                    <TablePaginationFooter
                      currentPage={safeEmployeeDocumentsPage}
                      totalPages={employeeDocumentsTotalPages}
                      totalItems={filteredEmployeeDocuments.length}
                      pageSize={PAGE_SIZE}
                      itemLabel="dokumen pegawai"
                      onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      onNext={() => setCurrentPage((page) => Math.min(employeeDocumentsTotalPages, page + 1))}
                    />
                  </>
                )}
              </TabsContent>

              <TabsContent value="pegawai">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Memuat cakupan dokumen pegawai...</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pegawai</TableHead>
                          <TableHead>Cakupan</TableHead>
                          <TableHead className="text-center">Kontrak</TableHead>
                          <TableHead className="text-center">Referensi</TableHead>
                          <TableHead>Aktivitas Terakhir</TableHead>
                          <TableHead>Tindak Lanjut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedEmployeeCoverage.map((item) => (
                          <TableRow key={item.employee_id}>
                            <TableCell>
                              <div className="font-medium">{item.employee_name}</div>
                              <div className="text-xs text-muted-foreground">{item.employee_email || "-"}</div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={
                                  item.coverage_status === "lengkap"
                                    ? "text-emerald-700"
                                    : item.coverage_status === "sebagian"
                                      ? "text-amber-700"
                                      : "text-destructive"
                                }
                              >
                                {item.coverage_status === "lengkap"
                                  ? "Lengkap dasar"
                                  : item.coverage_status === "sebagian"
                                    ? "Sebagian"
                                    : "Belum ada arsip"}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {item.contract_count}
                              {item.active_contract_count > 0 ? (
                                <div className="text-xs text-muted-foreground">{item.active_contract_count} aktif</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-center">{item.admin_reference_count}</TableCell>
                            <TableCell>{formatDateTimeLabel(item.latest_document_at)}</TableCell>
                            <TableCell>
                              <div className="max-w-[240px] text-sm text-muted-foreground">{item.follow_up}</div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {employeeCoverageRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                              {employees.length === 0 ? "Belum ada pegawai untuk dibaca sebagai owner dokumen." : "Tidak ada pegawai yang cocok dengan filter."}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                    <TablePaginationFooter
                      currentPage={safeEmployeeCoveragePage}
                      totalPages={employeeCoverageTotalPages}
                      totalItems={employeeCoverageRows.length}
                      pageSize={PAGE_SIZE}
                      itemLabel="cakupan dokumen pegawai"
                      onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      onNext={() => setCurrentPage((page) => Math.min(employeeCoverageTotalPages, page + 1))}
                    />
                  </>
                )}
              </TabsContent>

              <TabsContent value="kontrak">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Memuat arsip kontrak...</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pegawai</TableHead>
                          <TableHead>No. Kontrak</TableHead>
                          <TableHead>Tipe</TableHead>
                          <TableHead>Masa Berlaku</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedContracts.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{employeeMap.get(item.employee_id)?.name || "-"}</TableCell>
                            <TableCell>{item.contract_number || "-"}</TableCell>
                            <TableCell>{item.contract_type}</TableCell>
                            <TableCell>
                              {formatDateLabel(item.start_date)}
                              {item.end_date ? ` s/d ${formatDateLabel(item.end_date)}` : " (tanpa akhir)"}
                            </TableCell>
                            <TableCell>{item.status}</TableCell>
                          </TableRow>
                        ))}
                        {filteredContracts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                              {contracts.length === 0 ? "Belum ada dokumen kontrak." : "Tidak ada dokumen yang cocok dengan filter."}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                    <TablePaginationFooter
                      currentPage={safePage}
                      totalPages={totalPages}
                      totalItems={filteredContracts.length}
                      pageSize={PAGE_SIZE}
                      itemLabel="dokumen kontrak"
                      onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    />
                  </>
                )}
                {loadError ? <p className="mt-3 text-xs text-destructive">{loadError}</p> : null}
              </TabsContent>

              <TabsContent value="administrasi">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Memuat referensi administrasi...</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sumber</TableHead>
                          <TableHead>Pegawai</TableHead>
                          <TableHead>No. Referensi</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Penerbit</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedAdminDocuments.map((item) => {
                          const employee = item.employee_id ? employeeMap.get(item.employee_id) : null;
                          return (
                            <TableRow key={`${item.source}-${item.id}`}>
                              <TableCell>{item.source === "mutation_request" ? "Mutasi" : "Cuti"}</TableCell>
                              <TableCell>
                                <div className="font-medium">{employee?.name || "-"}</div>
                                <div className="text-xs text-muted-foreground">{employee?.email || "-"}</div>
                              </TableCell>
                              <TableCell>{item.document_reference_number || "-"}</TableCell>
                              <TableCell>{formatDateLabel(item.document_reference_date)}</TableCell>
                              <TableCell>{item.document_reference_issuer || "-"}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <div>{item.status || "-"}</div>
                                  <div className="max-w-[240px] truncate text-xs text-muted-foreground">
                                    {item.document_reference_notes || item.reason || "-"}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredAdminDocuments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                              {adminDocuments.length === 0 ? "Belum ada referensi administrasi yang tercatat." : "Tidak ada referensi yang cocok dengan filter."}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                    <TablePaginationFooter
                      currentPage={safeAdminPage}
                      totalPages={adminTotalPages}
                      totalItems={filteredAdminDocuments.length}
                      pageSize={PAGE_SIZE}
                      itemLabel="referensi administrasi"
                      onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      onNext={() => setCurrentPage((page) => Math.min(adminTotalPages, page + 1))}
                    />
                  </>
                )}
              </TabsContent>

              <TabsContent value="template">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Memuat template dokumen...</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nama Templat</TableHead>
                          <TableHead>Jenis</TableHead>
                          <TableHead>Versi</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Diperbarui</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedTemplates.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-medium">{item.template_name}</div>
                              <div className="text-xs text-muted-foreground">{item.description || "-"}</div>
                            </TableCell>
                            <TableCell>{item.template_type}</TableCell>
                            <TableCell>v{item.version}</TableCell>
                            <TableCell>{item.is_active ? "Aktif" : "Nonaktif"}</TableCell>
                            <TableCell>{formatDateTimeLabel(item.updated_at)}</TableCell>
                          </TableRow>
                        ))}
                        {filteredTemplates.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                              {templates.length === 0 ? "Belum ada template dokumen." : "Tidak ada template yang cocok dengan filter."}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                    <TablePaginationFooter
                      currentPage={safeTemplatePage}
                      totalPages={templateTotalPages}
                      totalItems={filteredTemplates.length}
                      pageSize={PAGE_SIZE}
                      itemLabel="template dokumen"
                      onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      onNext={() => setCurrentPage((page) => Math.min(templateTotalPages, page + 1))}
                    />
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Dialog open={isDocumentDialogOpen} onOpenChange={setIsDocumentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{documentForm.id ? "Edit Dokumen Pegawai" : "Tambah Dokumen Pegawai"}</DialogTitle>
              <DialogDescription>
                Simpan metadata dokumen pegawai agar repository HR tidak hanya bergantung pada kontrak dan referensi administrasi.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="employee_id">Pegawai</Label>
                <select
                  id="employee_id"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={documentForm.employee_id}
                  onChange={(event) => setDocumentForm((prev) => ({ ...prev, employee_id: event.target.value }))}
                >
                  <option value="">Pilih pegawai</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="document_title">Judul Dokumen</Label>
                  <Input
                    id="document_title"
                    value={documentForm.document_title}
                    onChange={(event) => setDocumentForm((prev) => ({ ...prev, document_title: event.target.value }))}
                    placeholder="Contoh: KTP Pegawai / NPWP / SK Pengangkatan"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="document_category">Kategori</Label>
                  <select
                    id="document_category"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={documentForm.document_category}
                    onChange={(event) => setDocumentForm((prev) => ({ ...prev, document_category: event.target.value }))}
                  >
                    {DOCUMENT_CATEGORY_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="document_number">Nomor Dokumen</Label>
                  <Input
                    id="document_number"
                    value={documentForm.document_number}
                    onChange={(event) =>
                      setDocumentForm((prev) => ({
                        ...prev,
                        document_number: normalizeDocumentNumber(event.target.value),
                      }))
                    }
                    placeholder={suggestedDocumentNumber}
                  />
                  <p className="text-xs text-muted-foreground">
                    Gunakan format konsisten seperti <span className="font-mono">{suggestedDocumentNumber}</span>.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="document_date">Tanggal Dokumen</Label>
                  <Input
                    id="document_date"
                    type="date"
                    value={documentForm.document_date}
                    onChange={(event) => setDocumentForm((prev) => ({ ...prev, document_date: event.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="issuer">Penerbit</Label>
                  <Input
                    id="issuer"
                    value={documentForm.issuer}
                    onChange={(event) => setDocumentForm((prev) => ({ ...prev, issuer: event.target.value }))}
                    placeholder="Contoh: BKPSDM / Dukcapil / Kantor Pajak"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="archive_reference">Referensi Arsip Fisik</Label>
                  <Input
                    id="archive_reference"
                    value={documentForm.archive_reference}
                    onChange={(event) => setDocumentForm((prev) => ({ ...prev, archive_reference: event.target.value }))}
                    placeholder={suggestedArchiveReference}
                  />
                  <p className="text-xs text-muted-foreground">
                    Format lokasi yang disarankan: <span className="font-mono">{suggestedArchiveReference}</span>.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                Dokumen pegawai disarankan disimpan sebagai arsip fisik. Gunakan `Nomor Dokumen` dan `Referensi Arsip Fisik`
                agar berkas dapat ditemukan kembali tanpa membebani storage aplikasi.
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Catatan</Label>
                <Textarea
                  id="notes"
                  value={documentForm.notes}
                  onChange={(event) => setDocumentForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Catatan audit, masa berlaku, atau follow-up dokumen"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={documentForm.is_archived}
                  onChange={(event) => setDocumentForm((prev) => ({ ...prev, is_archived: event.target.checked }))}
                />
                Arsipkan dokumen ini
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDocumentDialogOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleSaveEmployeeDocument} disabled={isSavingDocument || !access.canConfigure}>
                Simpan Dokumen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-muted-foreground">{description}</CardContent>
    </Card>
  );
}
