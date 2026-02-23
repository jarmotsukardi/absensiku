import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2,
  BookOpen,
} from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRealOfficeCoordinate } from "@/lib/officeCoordinates";
import { EmployeeDataTabs } from "@/components/org/employees/EmployeeDataTabs";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import {
  DEFAULT_EMPLOYEE_CATEGORY_OPTIONS,
  fetchTenantEmployeeCategories,
  getActiveEmployeeCategoryOptions,
  type EmployeeCategoryOption,
} from "@/lib/employeeCategories";
import {
  DEFAULT_EMPLOYEE_GOLONGAN_OPTIONS,
  fetchTenantEmployeeGolongan,
  getActiveEmployeeGolonganOptions,
  type EmployeeGolonganOption,
} from "@/lib/employeeGolongan";
import {
  DEFAULT_ORG_MASTER_DATA_MODULES,
  fetchTenantOrgMasterDataModules,
  type OrgMasterDataModuleKey,
} from "@/lib/orgMasterDataModules";

interface ImportRow {
  rowNum: number;
  nik: string;
  nip: string;
  name: string;
  gelar_depan: string;
  gelar_belakang: string;
  email: string;
  phone: string;
  whatsapp: string;
  position: string;
  golongan: string;
  employee_category: string;
  opd_code: string;
  office_name: string;
  address: string;
  gender: string;
  status: "valid" | "error" | "warning";
  errors: string[];
}

interface OfficeOption {
  id: string;
  name: string;
}

type ImportColumnKey =
  | "nik"
  | "nip"
  | "name"
  | "gelar_depan"
  | "gelar_belakang"
  | "email"
  | "phone"
  | "whatsapp"
  | "gender"
  | "position"
  | "golongan"
  | "employee_category"
  | "opd_code"
  | "office_name"
  | "address";

interface ImportColumnDefinition {
  key: ImportColumnKey;
  label: string;
  moduleKey?: OrgMasterDataModuleKey;
}

const IMPORT_COLUMN_DEFINITIONS: ImportColumnDefinition[] = [
  { key: "nik", label: "NIK" },
  { key: "nip", label: "NIP" },
  { key: "name", label: "Nama Lengkap" },
  { key: "gelar_depan", label: "Gelar Depan" },
  { key: "gelar_belakang", label: "Gelar Belakang" },
  { key: "email", label: "Email" },
  { key: "phone", label: "No. Telepon" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "gender", label: "Jenis Kelamin (L/P)" },
  { key: "position", label: "Jabatan", moduleKey: "positions" },
  { key: "golongan", label: "Golongan", moduleKey: "employee_golongan" },
  { key: "employee_category", label: "Kategori Pegawai", moduleKey: "employee_categories" },
  { key: "opd_code", label: "Kode OPD" },
  { key: "office_name", label: "Lokasi Kerja" },
  { key: "address", label: "Alamat" },
];

const TEMPLATE_EXAMPLE_ROWS: Array<Record<ImportColumnKey, string>> = [
  {
    nik: "1234567890123456",
    nip: "199001012020011001",
    name: "Ahmad Surya",
    gelar_depan: "Dr.",
    gelar_belakang: "M.Si.",
    email: "ahmad.surya@example.com",
    phone: "081234567890",
    whatsapp: "081234567890",
    gender: "L",
    position: "Kepala Seksi",
    golongan: "III/c",
    employee_category: "ASN",
    opd_code: "DISKOMINFO",
    office_name: "KANTOR PUSAT",
    address: "Jl. Merdeka No. 1",
  },
  {
    nik: "9876543210123456",
    nip: "199505152021012001",
    name: "Siti Nurhaliza",
    gelar_depan: "",
    gelar_belakang: "S.Kom.",
    email: "siti.nurhaliza@example.com",
    phone: "089876543210",
    whatsapp: "089876543210",
    gender: "P",
    position: "Analis Data",
    golongan: "III/a",
    employee_category: "P3K",
    opd_code: "BAPPEDA",
    office_name: "KANTOR BAPPEDA",
    address: "Jl. Pembangunan No. 5",
  },
];

export default function OrgEmployeeImport() {
  const ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS = 15000;
  const ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX = 1;
  const PREVIEW_PAGE_SIZE = 20;
  const MAX_IMPORT_ROWS = 100;
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState<ImportRow[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offices, setOffices] = useState<OfficeOption[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [isLoadingOffices, setIsLoadingOffices] = useState(false);
  const [employeeGolonganOptions, setEmployeeGolonganOptions] = useState<EmployeeGolonganOption[]>(
    DEFAULT_EMPLOYEE_GOLONGAN_OPTIONS
  );
  const [isLoadingGolongan, setIsLoadingGolongan] = useState(false);
  const [employeeCategoryOptions, setEmployeeCategoryOptions] = useState<EmployeeCategoryOption[]>(
    DEFAULT_EMPLOYEE_CATEGORY_OPTIONS
  );
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [masterDataModules, setMasterDataModules] = useState(DEFAULT_ORG_MASTER_DATA_MODULES);
  const [isLoadingModules, setIsLoadingModules] = useState(false);

  const normalizeHeader = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

  const activeColumns = useMemo(
    () =>
      IMPORT_COLUMN_DEFINITIONS.filter((column) =>
        column.moduleKey ? masterDataModules[column.moduleKey] : true
      ),
    [masterDataModules]
  );

  const expectedHeaders = useMemo(
    () => activeColumns.map((column) => column.label),
    [activeColumns]
  );

  const columnIndexByKey = useMemo(
    () =>
      new Map<ImportColumnKey, number>(
        activeColumns.map((column, index) => [column.key, index] as const)
      ),
    [activeColumns]
  );

  const isLoadingReferenceData =
    isLoadingModules ||
    isLoadingOffices ||
    (masterDataModules.employee_golongan && isLoadingGolongan) ||
    (masterDataModules.employee_categories && isLoadingCategories);

  const parseDelimitedLine = (line: string, delimiter: "," | "\t"): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === "\"") {
        if (inQuotes && line[i + 1] === "\"") {
          current += "\"";
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    values.push(current.trim());
    return values.map((value) => value.replace(/\r/g, ""));
  };

  const detectDelimiter = (line: string, fallback: "," | "\t"): "," | "\t" => {
    const commaCount = (line.match(/,/g) || []).length;
    const tabCount = (line.match(/\t/g) || []).length;
    if (tabCount > commaCount) return "\t";
    if (commaCount > 0) return ",";
    return fallback;
  };

  const buildDelimitedLine = (values: string[], delimiter: "," | "\t"): string =>
    values
      .map((value) => {
        const normalized = value ?? "";
        const needsQuotes =
          normalized.includes("\"") ||
          normalized.includes("\n") ||
          normalized.includes("\r") ||
          normalized.includes(delimiter);
        if (!needsQuotes) return normalized;
        return `"${normalized.replace(/"/g, "\"\"")}"`;
      })
      .join(delimiter);

  useEffect(() => {
    void fetchUserTenant();
  }, []);

  const fetchUserTenant = async () => {
    setLoadError(null);
    try {
      setIsRetrying(false);
      const resolvedTenantId = await withExponentialBackoff(
        () =>
          withTimeout(
            resolveOrgTenantId(),
            ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS,
            "org.employee_import.fetch_user_tenant timeout",
          ),
        {
          maxRetries: ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (!resolvedTenantId) {
        const message = "Tenant organisasi tidak ditemukan. Pastikan akun memiliki akses admin instansi.";
        setTenantId(null);
        setLoadError(message);
        toast.error(message);
        return;
      }
      setTenantId(resolvedTenantId);
    } catch (error) {
      const errorRef = reportError(error, "org.employee_import.fetch_user_tenant");
      const message = appendErrorReference("Gagal menentukan tenant import", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
    }
  };

  const fetchMasterDataModules = useCallback(async (currentTenantId: string) => {
    setIsLoadingModules(true);
    try {
      const moduleSetting = await withExponentialBackoff(
        () =>
          withTimeout(
            fetchTenantOrgMasterDataModules(currentTenantId),
            ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS,
            "org.employee_import.master_data_modules.fetch timeout"
          ),
        {
          maxRetries: ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      setMasterDataModules(moduleSetting.modules);
    } catch (error) {
      const errorRef = reportError(error, "org.employee_import.master_data_modules.fetch", {
        tenant_id: currentTenantId,
      });
      const message = appendErrorReference("Gagal memuat pengaturan modul master data", errorRef);
      setLoadError((prev) => prev ?? message);
      setMasterDataModules(DEFAULT_ORG_MASTER_DATA_MODULES);
      toast.error(message);
    } finally {
      setIsLoadingModules(false);
      setIsRetrying(false);
    }
  }, []);

  const fetchValidOffices = useCallback(async (currentTenantId: string) => {
    setIsLoadingOffices(true);
    try {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("offices")
              .select("id, name, latitude, longitude")
              .eq("tenant_id", currentTenantId)
              .eq("is_active", true)
              .order("name"),
            ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS,
            "org.employee_import.valid_offices.fetch timeout",
          ),
        {
          maxRetries: ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;

      const validOffices = (data || [])
        .filter((office) => isRealOfficeCoordinate(office.latitude, office.longitude))
        .map((office) => ({ id: office.id, name: office.name }));
      setOffices(validOffices);
      setSelectedOfficeId((prev) => (validOffices.some((office) => office.id === prev) ? prev : ""));

      if (validOffices.length === 0) {
        toast.error("Belum ada kantor dengan koordinat real. Lengkapi dulu di Data Lokasi Kerja.");
      }
    } catch (error) {
      const errorRef = reportError(error, "org.employee_import.valid_offices.fetch", {
        tenant_id: currentTenantId,
      });
      const message = appendErrorReference("Gagal memuat daftar kantor valid", errorRef);
      setLoadError((prev) => prev ?? message);
      setOffices([]);
      toast.error(message);
    } finally {
      setIsLoadingOffices(false);
      setIsRetrying(false);
    }
  }, []);

  const fetchEmployeeGolongan = useCallback(async (currentTenantId: string) => {
    setIsLoadingGolongan(true);
    try {
      const { golongan } = await withExponentialBackoff(
        () =>
          withTimeout(
            fetchTenantEmployeeGolongan(currentTenantId),
            ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS,
            "org.employee_import.employee_golongan.fetch timeout"
          ),
        {
          maxRetries: ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      const activeOptions = getActiveEmployeeGolonganOptions(golongan);
      setEmployeeGolonganOptions(
        activeOptions.length > 0 ? activeOptions : DEFAULT_EMPLOYEE_GOLONGAN_OPTIONS
      );
    } catch (error) {
      const errorRef = reportError(error, "org.employee_import.employee_golongan.fetch", {
        tenant_id: currentTenantId,
      });
      const message = appendErrorReference("Gagal memuat master golongan pegawai", errorRef);
      setLoadError((prev) => prev ?? message);
      setEmployeeGolonganOptions(DEFAULT_EMPLOYEE_GOLONGAN_OPTIONS);
      toast.error(message);
    } finally {
      setIsLoadingGolongan(false);
      setIsRetrying(false);
    }
  }, []);

  const fetchEmployeeCategories = useCallback(async (currentTenantId: string) => {
    setIsLoadingCategories(true);
    try {
      const { categories } = await withExponentialBackoff(
        () =>
          withTimeout(
            fetchTenantEmployeeCategories(currentTenantId),
            ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS,
            "org.employee_import.employee_categories.fetch timeout"
          ),
        {
          maxRetries: ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      const activeOptions = getActiveEmployeeCategoryOptions(categories);
      setEmployeeCategoryOptions(
        activeOptions.length > 0 ? activeOptions : DEFAULT_EMPLOYEE_CATEGORY_OPTIONS
      );
    } catch (error) {
      const errorRef = reportError(error, "org.employee_import.employee_categories.fetch", {
        tenant_id: currentTenantId,
      });
      const message = appendErrorReference("Gagal memuat master kategori pegawai", errorRef);
      setLoadError((prev) => prev ?? message);
      setEmployeeCategoryOptions(DEFAULT_EMPLOYEE_CATEGORY_OPTIONS);
      toast.error(message);
    } finally {
      setIsLoadingCategories(false);
      setIsRetrying(false);
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void fetchMasterDataModules(tenantId);
  }, [fetchMasterDataModules, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    void fetchValidOffices(tenantId);
  }, [fetchValidOffices, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    if (!masterDataModules.employee_golongan) {
      setEmployeeGolonganOptions(DEFAULT_EMPLOYEE_GOLONGAN_OPTIONS);
      setIsLoadingGolongan(false);
      return;
    }
    void fetchEmployeeGolongan(tenantId);
  }, [fetchEmployeeGolongan, masterDataModules.employee_golongan, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    if (!masterDataModules.employee_categories) {
      setEmployeeCategoryOptions(DEFAULT_EMPLOYEE_CATEGORY_OPTIONS);
      setIsLoadingCategories(false);
      return;
    }
    void fetchEmployeeCategories(tenantId);
  }, [fetchEmployeeCategories, masterDataModules.employee_categories, tenantId]);

  const buildTemplateRows = useCallback(
    () => [
      expectedHeaders,
      ...TEMPLATE_EXAMPLE_ROWS.map((exampleRow) =>
        activeColumns.map((column) => exampleRow[column.key] ?? "")
      ),
    ],
    [activeColumns, expectedHeaders]
  );

  const triggerDownload = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob(["\ufeff" + content], { type: mimeType });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadTemplateCsv = () => {
    const rows = buildTemplateRows();
    const csvContent = rows.map((row) => buildDelimitedLine(row, ",")).join("\n");
    triggerDownload(csvContent, "template_import_pegawai.csv", "text/csv;charset=utf-8;");
  };

  const downloadTemplateXls = () => {
    const rows = buildTemplateRows();
    const tabDelimitedContent = rows.map((row) => buildDelimitedLine(row, "\t")).join("\n");
    triggerDownload(
      tabDelimitedContent,
      "template_import_pegawai.xls",
      "application/vnd.ms-excel;charset=utf-8;"
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (isLoadingReferenceData) {
      toast.info("Master data import masih dimuat. Coba upload lagi beberapa saat.");
      return;
    }

    const normalizedName = selectedFile.name.toLowerCase();
    if (!normalizedName.endsWith(".csv") && !normalizedName.endsWith(".xls")) {
      toast.error("Hanya file CSV atau XLS template yang diperbolehkan");
      return;
    }

    setFile(selectedFile);
    await parseCSV(selectedFile);
  };

  const parseCSV = useCallback(async (selectedFile: File) => {
    if (!tenantId) {
      toast.error("Tenant tidak ditemukan");
      return;
    }

    setIsLoading(true);
    setIsRetrying(false);
    setLoadError(null);
    setPreviewData([]);
    setImportResult(null);
    setPreviewPage(1);

    try {
      const text = (await selectedFile.text()).replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter((line) => line.trim());

      if (lines.length < 2) {
        toast.error("File kosong atau hanya berisi header");
        return;
      }

      const fallbackDelimiter = selectedFile.name.toLowerCase().endsWith(".xls") ? "\t" : ",";
      const delimiter = detectDelimiter(lines[0], fallbackDelimiter);
      const headerColumns = parseDelimitedLine(lines[0], delimiter);
      const expectedHeader = expectedHeaders.map(normalizeHeader);
      const uploadedHeader = headerColumns.map(normalizeHeader);
      const headerValid =
        uploadedHeader.length === expectedHeader.length &&
        expectedHeader.every((header, index) => uploadedHeader[index] === header);

      if (!headerValid) {
        const message = "Header file tidak sesuai template aktif. Gunakan file dari Download Template CSV/XLS.";
        setLoadError(message);
        toast.error(message);
        return;
      }

      const dataLines = lines.slice(1);
      if (dataLines.length > MAX_IMPORT_ROWS) {
        const message = `Maksimal ${MAX_IMPORT_ROWS} baris per import. File ini berisi ${dataLines.length} baris.`;
        setLoadError(message);
        toast.error(message);
        return;
      }

      const parsedRows: ImportRow[] = [];
      const seenNiksInFile = new Set<string>();
      const seenEmailsInFile = new Set<string>();
      const activeGolonganSet = new Set(
        employeeGolonganOptions.map((option) => option.value.trim().toLowerCase())
      );
      const activeCategorySet = new Set(
        employeeCategoryOptions.map((option) => option.value.trim().toLowerCase())
      );
      const validOfficeNameSet = new Set(offices.map((office) => normalizeHeader(office.name)));

      const getValueByKey = (values: string[], key: ImportColumnKey): string => {
        const index = columnIndexByKey.get(key);
        if (index === undefined) return "";
        return values[index]?.trim() || "";
      };

      // Get existing NIKs and emails for validation
      const { data: existingEmployees } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("nik, email")
              .eq("tenant_id", tenantId),
            ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS,
            "org.employee_import.parse_csv.existing_employees timeout"
          ),
        {
          maxRetries: ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      const existingNiks = new Set(existingEmployees?.map((employee) => employee.nik) || []);
      const existingEmails = new Set(existingEmployees?.map((employee) => employee.email?.toLowerCase()) || []);

      // Get OPDs for validation
      const { data: opds } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("opd")
              .select("code, name")
              .eq("tenant_id", tenantId),
            ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS,
            "org.employee_import.parse_csv.opd timeout"
          ),
        {
          maxRetries: ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      const opdCodes = new Set(opds?.map((opd) => opd.code.toUpperCase()) || []);

      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        const values = parseDelimitedLine(line, delimiter);

        const row: ImportRow = {
          rowNum: i + 2,
          nik: getValueByKey(values, "nik"),
          nip: getValueByKey(values, "nip"),
          name: getValueByKey(values, "name"),
          gelar_depan: getValueByKey(values, "gelar_depan"),
          gelar_belakang: getValueByKey(values, "gelar_belakang"),
          email: getValueByKey(values, "email"),
          phone: getValueByKey(values, "phone"),
          whatsapp: getValueByKey(values, "whatsapp"),
          position: getValueByKey(values, "position"),
          golongan: getValueByKey(values, "golongan"),
          employee_category: getValueByKey(values, "employee_category"),
          opd_code: getValueByKey(values, "opd_code"),
          office_name: getValueByKey(values, "office_name"),
          address: getValueByKey(values, "address"),
          gender: getValueByKey(values, "gender"),
          status: "valid",
          errors: [],
        };

        // Validation
        if (values.length !== expectedHeaders.length) {
          row.errors.push(`Jumlah kolom tidak sesuai template (${values.length}/${expectedHeaders.length})`);
        }

        if (!row.nik) {
          row.errors.push("NIK wajib diisi");
        } else if (!/^\d{16}$/.test(row.nik)) {
          row.errors.push("NIK harus 16 digit angka");
        } else if (seenNiksInFile.has(row.nik)) {
          row.errors.push("NIK duplikat dalam file");
        } else if (existingNiks.has(row.nik)) {
          row.errors.push("NIK sudah terdaftar");
        } else {
          seenNiksInFile.add(row.nik);
        }

        if (row.nip && !/^\d{18}$/.test(row.nip)) {
          row.errors.push("NIP harus 18 digit angka");
        }

        if (!row.name) {
          row.errors.push("Nama wajib diisi");
        }

        if (!row.email) {
          row.errors.push("Email wajib diisi");
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
          row.errors.push("Format email tidak valid");
        } else if (seenEmailsInFile.has(row.email.toLowerCase())) {
          row.errors.push("Email duplikat dalam file");
        } else if (existingEmails.has(row.email.toLowerCase())) {
          row.errors.push("Email sudah terdaftar");
        } else {
          seenEmailsInFile.add(row.email.toLowerCase());
        }

        if (row.phone && !/^(?:\+62|62|0)[0-9]{8,15}$/.test(row.phone)) {
          row.errors.push("Format No. Telepon tidak valid");
        }

        if (row.whatsapp && !/^(?:\+62|62|0)[0-9]{8,15}$/.test(row.whatsapp)) {
          row.errors.push("Format WhatsApp tidak valid");
        }

        if (row.gender && !["L", "P", "l", "p"].includes(row.gender)) {
          row.errors.push("Jenis kelamin harus L atau P");
        }

        if (row.opd_code && !opdCodes.has(row.opd_code.toUpperCase())) {
          row.errors.push(`Kode OPD "${row.opd_code}" tidak ditemukan`);
        }

        if (
          masterDataModules.employee_golongan &&
          row.golongan &&
          !activeGolonganSet.has(row.golongan.trim().toLowerCase())
        ) {
          row.errors.push(`Golongan "${row.golongan}" tidak ada di master golongan aktif`);
        }

        if (
          masterDataModules.employee_categories &&
          row.employee_category &&
          !activeCategorySet.has(row.employee_category.trim().toLowerCase())
        ) {
          row.errors.push(`Kategori pegawai "${row.employee_category}" tidak ada di master kategori aktif`);
        }

        if (row.office_name && !validOfficeNameSet.has(normalizeHeader(row.office_name))) {
          row.errors.push(`Lokasi kerja "${row.office_name}" tidak ditemukan atau belum valid koordinat`);
        }

        row.status = row.errors.length > 0 ? "error" : "valid";
        parsedRows.push(row);
      }

      setPreviewData(parsedRows);
    } catch (error) {
      const errorRef = reportError(error, "org.employee_import.parse_csv");
      const message = appendErrorReference("Gagal membaca file import", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [
    ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX,
    ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS,
    columnIndexByKey,
    employeeCategoryOptions,
    employeeGolonganOptions,
    expectedHeaders,
    masterDataModules.employee_categories,
    masterDataModules.employee_golongan,
    offices,
    tenantId,
  ]);

  useEffect(() => {
    if (!file) return;
    if (isLoadingReferenceData) return;
    void parseCSV(file);
  }, [file, isLoadingReferenceData, parseCSV]);

  const handleImport = async () => {
    if (!tenantId) {
      toast.error("Tenant tidak ditemukan");
      return;
    }

    const validRows = previewData.filter(row => row.status === "valid");
    const hasErrorRows = previewData.some((row) => row.status === "error");
    if (hasErrorRows) {
      toast.error("Perbaiki semua baris error di preview sebelum import.");
      return;
    }
    if (validRows.length === 0) {
      toast.error("Tidak ada data valid untuk diimport");
      return;
    }
    const requiresOfficeMapping = validRows.some((row) => !row.office_name.trim());
    if (requiresOfficeMapping && !selectedOfficeId) {
      toast.error("Sebagian baris belum punya kolom Lokasi Kerja. Pilih Lokasi Kerja Mapping sebagai fallback.");
      return;
    }

    setIsImporting(true);
    setLoadError(null);
    setIsRetrying(false);
    let success = 0;
    let failed = 0;

    try {
      // Get OPDs for this tenant
      const { data: opds } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("opd")
              .select("id, code")
              .eq("tenant_id", tenantId),
            ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS,
            "org.employee_import.import.opd timeout",
          ),
        {
          maxRetries: ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      const opdMap = new Map(opds?.map(o => [o.code.toUpperCase(), o.id]) || []);
      const officeNameMap = new Map(
        offices.map((office) => [normalizeHeader(office.name), office.id] as const)
      );

      for (let i = 0; i < validRows.length; i++) {
        try {
          const row = validRows[i];
          const opdId = row.opd_code ? opdMap.get(row.opd_code.toUpperCase()) : null;
          const officeIdFromRow = row.office_name
            ? officeNameMap.get(normalizeHeader(row.office_name))
            : null;
          const resolvedOfficeId = officeIdFromRow || selectedOfficeId || null;

          if (!resolvedOfficeId) {
            throw new Error(`Lokasi kerja belum ditentukan pada baris ${row.rowNum}`);
          }

          const { error } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase.from("employees").insert({
                  tenant_id: tenantId,
                  nik: row.nik,
                  nip: row.nip || null,
                  name: row.name,
                  gelar_depan: row.gelar_depan || null,
                  gelar_belakang: row.gelar_belakang || null,
                  email: row.email,
                  phone: row.phone || null,
                  whatsapp: row.whatsapp || null,
                  gender: row.gender?.toUpperCase() === "L" ? "L" : row.gender?.toUpperCase() === "P" ? "P" : null,
                  position: masterDataModules.positions ? (row.position || null) : null,
                  golongan: masterDataModules.employee_golongan ? (row.golongan || null) : null,
                  employee_category: masterDataModules.employee_categories ? (row.employee_category || null) : null,
                  opd_id: opdId,
                  office_id: resolvedOfficeId,
                  address: row.address || null,
                  is_active: true,
                }),
                ORG_EMPLOYEE_IMPORT_QUERY_TIMEOUT_MS,
                "org.employee_import.import.insert_row timeout",
              ),
            {
              maxRetries: ORG_EMPLOYEE_IMPORT_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
            },
          );

          if (error) throw error;
          success++;
        } catch (error) {
          reportError(error, "org.employee_import.import.row_failed", {
            row_num: i + 1,
            nik: validRows[i]?.nik || null,
            tenant_id: tenantId,
          });
          failed++;
        }
      }

      setImportResult({ success, failed });
      toast.success(
        `Import selesai: ${success} berhasil, ${failed} gagal. Lanjutkan aktivasi akun melalui menu Undangan Pegawai/Pegawai Aktif.`
      );
      
      if (failed === 0) {
        setFile(null);
        setPreviewData([]);
      }
    } catch (error) {
      const errorRef = reportError(error, "org.employee_import.import", {
        tenant_id: tenantId,
        file_name: file?.name,
      });
      const message = appendErrorReference("Terjadi kesalahan saat import", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsImporting(false);
      setIsRetrying(false);
    }
  };

  const validCount = previewData.filter(r => r.status === "valid").length;
  const errorCount = previewData.filter(r => r.status === "error").length;
  const requiresFallbackOfficeMapping = previewData.some(
    (row) => row.status === "valid" && !row.office_name.trim()
  );
  const importDisabled =
    validCount === 0 ||
    errorCount > 0 ||
    isImporting ||
    (requiresFallbackOfficeMapping && !selectedOfficeId) ||
    isLoadingReferenceData;
  const previewTotalPages = Math.max(1, Math.ceil(previewData.length / PREVIEW_PAGE_SIZE));
  const paginatedPreviewRows = previewData.slice(
    (previewPage - 1) * PREVIEW_PAGE_SIZE,
    previewPage * PREVIEW_PAGE_SIZE
  );
  const previewPageNumbers = Array.from({ length: previewTotalPages }, (_, idx) => idx + 1).filter((page) => {
    if (previewTotalPages <= 7) return true;
    if (page <= 2 || page > previewTotalPages - 2) return true;
    return Math.abs(page - previewPage) <= 1;
  });

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Import Pegawai</h1>
          <p className="text-sm text-muted-foreground">Import data pegawai dari file CSV/XLS template</p>
        </div>
        <EmployeeDataTabs />

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void (async () => {
                      if (!tenantId) {
                        await fetchUserTenant();
                        return;
                      }
                      await fetchMasterDataModules(tenantId);
                      await fetchValidOffices(tenantId);
                      if (masterDataModules.employee_golongan) {
                        await fetchEmployeeGolongan(tenantId);
                      }
                      if (masterDataModules.employee_categories) {
                        await fetchEmployeeCategories(tenantId);
                      }
                      if (file) {
                        await parseCSV(file);
                      }
                    })();
                  }}
                >
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {isRetrying && (
          <Card className="border-amber-300/60 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm text-amber-800">Sedang mencoba ulang koneksi data import pegawai...</p>
            </CardContent>
          </Card>
        )}

        {/* Panduan Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Panduan Import Pegawai
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="langkah">
                <AccordionTrigger>Langkah-langkah Import</AccordionTrigger>
                <AccordionContent>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li><strong>Download Template:</strong> Klik tombol "Download Template CSV/XLS" agar format mengikuti modul aktif</li>
                    <li><strong>Isi Data:</strong> Buka file dengan Excel/Google Sheets dan isi data pegawai sesuai kolom</li>
                    <li><strong>Lokasi Kerja:</strong> Isi kolom "Lokasi Kerja" per baris, atau gunakan mapping fallback di bawah</li>
                    <li><strong>Upload File:</strong> Pilih file CSV/XLS template yang sudah diisi</li>
                    <li><strong>Periksa Preview:</strong> Pastikan tidak ada error pada data yang akan diimport</li>
                    <li><strong>Import:</strong> Klik tombol Import untuk memproses data</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="format">
                <AccordionTrigger>Format Kolom</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <div className="grid gap-2">
                      <div className="flex justify-between border-b pb-1">
                        <span className="font-medium">NIK</span>
                        <span className="text-muted-foreground">16 digit angka (wajib)</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="font-medium">NIP</span>
                        <span className="text-muted-foreground">18 digit untuk ASN (opsional)</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="font-medium">Nama Lengkap</span>
                        <span className="text-muted-foreground">Nama tanpa gelar (wajib)</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="font-medium">Gelar Depan/Belakang</span>
                        <span className="text-muted-foreground">Dr., Drs., M.Si., S.Kom. (opsional)</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="font-medium">Email</span>
                        <span className="text-muted-foreground">Email aktif (wajib)</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="font-medium">Jenis Kelamin</span>
                        <span className="text-muted-foreground">L = Laki-laki, P = Perempuan</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="font-medium">Golongan</span>
                        <span className="text-muted-foreground">Muncul saat modul golongan aktif</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="font-medium">Kategori Pegawai</span>
                        <span className="text-muted-foreground">Muncul saat modul kategori pegawai aktif</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="font-medium">Kode OPD</span>
                        <span className="text-muted-foreground">Sesuai dengan kode OPD yang sudah dibuat</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="font-medium">Lokasi Kerja</span>
                        <span className="text-muted-foreground">Nama lokasi kerja valid, atau gunakan mapping fallback</span>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="tips">
                <AccordionTrigger>Tips & Perhatian</AccordionTrigger>
                <AccordionContent>
                  <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Pastikan NIK dan Email belum terdaftar di sistem</li>
                    <li>Kode OPD harus sesuai dengan OPD yang sudah dibuat di menu Master OPD</li>
                    <li>Gunakan file template CSV/XLS yang diunduh dari halaman ini</li>
                    <li>Kolom template otomatis menyesuaikan modul aktif/nonaktif</li>
                    <li>Jika ada baris tanpa kolom Lokasi Kerja, pilih Lokasi Kerja Mapping fallback</li>
                    <li>Periksa preview sebelum import untuk menghindari kesalahan</li>
                    <li>Maksimal 100 pegawai per import untuk performa optimal</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Template Download */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Template Import
            </CardTitle>
            <CardDescription>
              Download template dan isi dengan data pegawai yang akan diimport
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button onClick={downloadTemplateCsv} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download Template CSV
              </Button>
              <Button onClick={downloadTemplateXls} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download Template XLS
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Kolom template aktif: {expectedHeaders.join(", ")}
            </p>
          </CardContent>
        </Card>

        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload File
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Lokasi Kerja Mapping (Fallback)</Label>
              <Select
                value={selectedOfficeId}
                onValueChange={setSelectedOfficeId}
                disabled={isLoadingOffices || offices.length === 0}
              >
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder={isLoadingOffices ? "Memuat lokasi kerja..." : "Pilih lokasi kerja fallback"} />
                </SelectTrigger>
                <SelectContent>
                  {offices.map((office) => (
                    <SelectItem key={office.id} value={office.id}>
                      {office.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Digunakan hanya untuk baris yang kolom "Lokasi Kerja"-nya kosong.
              </p>
              {!isLoadingOffices && offices.length === 0 && (
                <p className="text-xs text-destructive">
                  Belum ada kantor koordinat real. Baris tanpa kolom Lokasi Kerja tidak bisa diimport.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>File CSV/XLS</Label>
              <Input
                type="file"
                accept=".csv,.xls"
                onChange={handleFileChange}
                className="max-w-md"
                disabled={isLoadingReferenceData}
              />
              {isLoadingReferenceData ? (
                <p className="text-xs text-muted-foreground">Memuat referensi master data import...</p>
              ) : masterDataModules.employee_golongan ? (
                <p className="text-xs text-muted-foreground">
                  Golongan valid mengikuti master data aktif:{" "}
                  {employeeGolonganOptions.map((option) => option.label).join(", ")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Modul golongan nonaktif: kolom golongan otomatis dihilangkan.</p>
              )}
              {masterDataModules.employee_categories ? (
                <p className="text-xs text-muted-foreground">
                  Kategori pegawai aktif: {employeeCategoryOptions.map((option) => option.label).join(", ")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Modul kategori pegawai nonaktif: kolom kategori otomatis dihilangkan.</p>
              )}
              {file && (
                <p className="text-sm text-muted-foreground">
                  File: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preview Section */}
        {isLoading ? (
          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Memproses file...</p>
              </div>
            </CardContent>
          </Card>
        ) : previewData.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Preview Data</CardTitle>
              <CardDescription className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Valid: {validCount}
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-destructive" />
                  Error: {errorCount}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {errorCount > 0 && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  Import dikunci sampai semua error diperbaiki (saat ini masih ada {errorCount} baris error).
                </div>
              )}
              {requiresFallbackOfficeMapping && !selectedOfficeId && (
                <div className="mb-4 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Ada baris valid tanpa kolom Lokasi Kerja. Pilih Lokasi Kerja Mapping fallback agar import bisa dijalankan.
                </div>
              )}
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Baris</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>NIK</TableHead>
                      <TableHead>NIP</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Kode OPD</TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPreviewRows.map((row) => (
                      <TableRow key={row.rowNum} className={row.status === "error" ? "bg-destructive/5" : ""}>
                        <TableCell>{row.rowNum}</TableCell>
                        <TableCell>
                          {row.status === "valid" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.nik}</TableCell>
                        <TableCell className="font-mono text-sm">{row.nip || "-"}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.email}</TableCell>
                        <TableCell>{row.opd_code || "-"}</TableCell>
                        <TableCell>
                          {row.errors.length > 0 && (
                            <div className="space-y-1">
                              {row.errors.map((err, i) => (
                                <Badge key={i} variant="destructive" className="text-xs">
                                  {err}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-2">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {paginatedPreviewRows.length} dari {previewData.length} baris
                </p>
              </div>

              {previewTotalPages > 1 && (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          setPreviewPage((p) => Math.max(1, p - 1));
                        }}
                        aria-disabled={previewPage === 1}
                        className={previewPage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>

                    {previewPageNumbers.map((page, index) => {
                      const prev = previewPageNumbers[index - 1];
                      const showEllipsis = prev && page - prev > 1;
                      return (
                        <div key={`preview-page-${page}`} className="flex items-center">
                          {showEllipsis && (
                            <PaginationItem>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}
                          <PaginationItem>
                            <PaginationLink
                              href="#"
                              isActive={page === previewPage}
                              onClick={(event) => {
                                event.preventDefault();
                                setPreviewPage(page);
                              }}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        </div>
                      );
                    })}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          setPreviewPage((p) => Math.min(previewTotalPages, p + 1));
                        }}
                        aria-disabled={previewPage === previewTotalPages}
                        className={previewPage === previewTotalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}

              <div className="flex justify-end mt-4 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    setPreviewData([]);
                    setImportResult(null);
                  }}
                >
                  Reset
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importDisabled}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Mengimport...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import {validCount} Data
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Import Result */}
        {importResult && (
          <Alert variant={importResult.failed > 0 ? "destructive" : "default"}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Hasil Import</AlertTitle>
            <AlertDescription>
              <p>Berhasil: {importResult.success} pegawai</p>
              {importResult.failed > 0 && <p>Gagal: {importResult.failed} pegawai</p>}
            </AlertDescription>
          </Alert>
        )}

        <PageGlossarySection preset="org_master_data" />
      </div>
    </OrganizationLayout>
  );
}
