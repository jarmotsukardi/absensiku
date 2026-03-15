import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2,
  Info
} from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRealOfficeCoordinate } from "@/lib/officeCoordinates";
import {
  isRetryableError,
  withExponentialBackoff,
  withTimeout,
} from "@/lib/attendanceResilience";

interface ImportRow {
  rowNum: number;
  nik: string;
  nip: string;
  name: string;
  email: string;
  phone: string;
  position: string;
  opd_code: string;
  status: "valid" | "error" | "warning";
  errors: string[];
}

interface Tenant {
  id: string;
  name: string;
  code: string;
}

interface OfficeOption {
  id: string;
  name: string;
}
const ADMIN_EMPLOYEE_IMPORT_READ_TIMEOUT_MS = 12000;
const ADMIN_EMPLOYEE_IMPORT_WRITE_TIMEOUT_MS = 15000;
const ADMIN_EMPLOYEE_IMPORT_MAX_RETRIES = 2;

export default function EmployeeImport() {
  const PREVIEW_PAGE_SIZE = 20;
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [offices, setOffices] = useState<OfficeOption[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>("");
  const [isLoadingOffices, setIsLoadingOffices] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [previewData, setPreviewData] = useState<ImportRow[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  // Fetch tenants on component mount
  useEffect(() => {
    void fetchTenants();
  }, [fetchTenants]);

  const fetchValidOffices = useCallback(async (tenantId: string) => {
    setIsLoadingOffices(true);
    try {
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("offices")
              .select("id, name, latitude, longitude")
              .eq("tenant_id", tenantId)
              .eq("is_active", true)
              .order("name"),
            ADMIN_EMPLOYEE_IMPORT_READ_TIMEOUT_MS,
            "Permintaan daftar kantor tenant timeout."
          ),
        {
          maxRetries: ADMIN_EMPLOYEE_IMPORT_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;

      const validOffices = (data || [])
        .filter((office) => isRealOfficeCoordinate(office.latitude, office.longitude))
        .map((office) => ({ id: office.id, name: office.name }));

      setOffices(validOffices);
      if (validOffices.length === 0) {
        toast.error("Tenant ini belum punya kantor dengan koordinat real. Lengkapi dulu di Master Kantor.");
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.master.employee_import.offices.fetch", {
        tenant_id: tenantId,
      });
      const message = appendErrorReference("Gagal memuat daftar kantor tenant", errorRef);
      setLoadError((prev) => prev ?? message);
      setOffices([]);
      toast.error(message);
    } finally {
      setIsRetrying(false);
      setIsLoadingOffices(false);
    }
  }, []);

  useEffect(() => {
    setSelectedOfficeId("");
    setOffices([]);
    setFile(null);
    setPreviewData([]);
    setImportResult(null);
    setPreviewPage(1);
    if (!selectedTenant) return;
    void fetchValidOffices(selectedTenant);
  }, [fetchValidOffices, selectedTenant]);

  const fetchTenants = useCallback(async () => {
    try {
      setIsRetrying(false);
      setLoadError(null);
      const { data, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("tenants")
              .select("id, name, code")
              .eq("is_active", true)
              .order("name"),
            ADMIN_EMPLOYEE_IMPORT_READ_TIMEOUT_MS,
            "Permintaan daftar organisasi timeout."
          ),
        {
          maxRetries: ADMIN_EMPLOYEE_IMPORT_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setTenants(data || []);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.master.employee_import.tenants.fetch");
      const message = appendErrorReference("Gagal memuat daftar organisasi", errorRef);
      setLoadError(message);
      setTenants([]);
      toast.error(message);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const downloadTemplate = () => {
    // Create CSV template
    const headers = [
      "NIK",
      "NIP",
      "Nama Lengkap",
      "Email",
      "No. Telepon",
      "Jabatan",
      "Kode OPD"
    ];
    
    const exampleRow = [
      "1234567890123456",
      "199001012020011001",
      "Budi Santoso",
      "budi@example.com",
      "081234567890",
      "Staf",
      "DISKOMINFO"
    ];

    const csvContent = [
      headers.join(","),
      exampleRow.join(","),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "template_import_pegawai.csv";
    link.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedTenant) {
      toast.error("Pilih organisasi terlebih dahulu agar validasi import sesuai tenant.");
      return;
    }

    if (!selectedFile.name.endsWith(".csv")) {
      toast.error("Hanya file CSV yang diperbolehkan");
      return;
    }

    setFile(selectedFile);
    await parseCSV(selectedFile);
  };

  const parseCSV = async (file: File) => {
    if (!selectedTenant) {
      toast.error("Pilih organisasi terlebih dahulu");
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setPreviewData([]);
    setImportResult(null);
    setPreviewPage(1);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error("File CSV kosong atau hanya berisi header");
        return;
      }

      // Skip header
      const dataLines = lines.slice(1);
      const parsedRows: ImportRow[] = [];

      // Get existing NIKs and emails for validation
      const { data: existingEmployees } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .select("nik, email")
              .eq("tenant_id", selectedTenant),
            ADMIN_EMPLOYEE_IMPORT_READ_TIMEOUT_MS,
            "Permintaan data pegawai tenant timeout."
          ),
        {
          maxRetries: ADMIN_EMPLOYEE_IMPORT_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      const existingNiks = new Set(existingEmployees?.map(e => e.nik) || []);
      const existingEmails = new Set(existingEmployees?.map(e => e.email?.toLowerCase()) || []);

      // Get OPDs for validation
      const { data: opds } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("opd")
              .select("code, name")
              .eq("tenant_id", selectedTenant),
            ADMIN_EMPLOYEE_IMPORT_READ_TIMEOUT_MS,
            "Permintaan data OPD tenant timeout."
          ),
        {
          maxRetries: ADMIN_EMPLOYEE_IMPORT_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      const opdCodes = new Set(opds?.map(o => o.code.toUpperCase()) || []);

      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        
        const row: ImportRow = {
          rowNum: i + 2, // +2 because 1-indexed and skipped header
          nik: values[0] || "",
          nip: values[1] || "",
          name: values[2] || "",
          email: values[3] || "",
          phone: values[4] || "",
          position: values[5] || "",
          opd_code: values[6] || "",
          status: "valid",
          errors: [],
        };

        // Validation
        if (!row.nik) {
          row.errors.push("NIK wajib diisi");
        } else if (row.nik.length !== 16) {
          row.errors.push("NIK harus 16 digit");
        } else if (existingNiks.has(row.nik)) {
          row.errors.push("NIK sudah terdaftar");
        }

        if (!row.name) {
          row.errors.push("Nama wajib diisi");
        }

        if (!row.email) {
          row.errors.push("Email wajib diisi");
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
          row.errors.push("Format email tidak valid");
        } else if (existingEmails.has(row.email.toLowerCase())) {
          row.errors.push("Email sudah terdaftar");
        }

        if (row.opd_code && !opdCodes.has(row.opd_code.toUpperCase())) {
          row.errors.push(`Kode OPD "${row.opd_code}" tidak ditemukan`);
        }

        row.status = row.errors.length > 0 ? "error" : "valid";
        parsedRows.push(row);
      }

      setPreviewData(parsedRows);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.master.employee_import.parse_csv", { file_name: file.name });
      const message = appendErrorReference("Gagal membaca file CSV", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedTenant) {
      toast.error("Pilih organisasi terlebih dahulu");
      return;
    }
    if (!selectedOfficeId) {
      toast.error("Pilih lokasi kerja valid untuk mapping pegawai hasil import.");
      return;
    }

    const validRows = previewData.filter(row => row.status === "valid");
    if (validRows.length === 0) {
      toast.error("Tidak ada data valid untuk diimport");
      return;
    }

    setIsImporting(true);
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
              .eq("tenant_id", selectedTenant),
            ADMIN_EMPLOYEE_IMPORT_READ_TIMEOUT_MS,
            "Permintaan data OPD import timeout."
          ),
        {
          maxRetries: ADMIN_EMPLOYEE_IMPORT_MAX_RETRIES,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      const opdMap = new Map(opds?.map(o => [o.code.toUpperCase(), o.id]) || []);

      for (const row of validRows) {
        try {
          const opdId = row.opd_code ? opdMap.get(row.opd_code.toUpperCase()) : null;

          const { error } = await withTimeout(
            supabase.from("employees").insert({
              tenant_id: selectedTenant,
              nik: row.nik,
              nip: row.nip || null,
              name: row.name,
              email: row.email,
              phone: row.phone || null,
              position: row.position || null,
              opd_id: opdId,
              office_id: selectedOfficeId,
              is_active: true,
            }),
            ADMIN_EMPLOYEE_IMPORT_WRITE_TIMEOUT_MS,
            "Impor satu baris pegawai timeout."
          );

          if (error) throw error;
          success++;
        } catch (error) {
          reportError(error, "admin.master.employee_import.import.row_failed", {
            row_num: row.rowNum,
            nik: row.nik,
            tenant_id: selectedTenant,
          });
          failed++;
        }
      }

      setImportResult({ success, failed });
      toast.success(`Impor selesai: ${success} berhasil, ${failed} gagal`);
      
      // Reset form after successful import
      if (failed === 0) {
        setFile(null);
        setPreviewData([]);
      }
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.master.employee_import.import", {
        tenant_id: selectedTenant,
        total_valid_rows: validRows.length,
      });
      const message = appendErrorReference("Terjadi kesalahan saat import", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
      setIsImporting(false);
    }
  };

  const validCount = previewData.filter(r => r.status === "valid").length;
  const errorCount = previewData.filter(r => r.status === "error").length;
  const previewTotalPages = Math.max(1, Math.ceil(previewData.length / PREVIEW_PAGE_SIZE));
  const previewPageNumbers = Array.from({ length: previewTotalPages }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === previewTotalPages || Math.abs(page - previewPage) <= 1
  );
  const paginatedPreviewRows = previewData.slice(
    (previewPage - 1) * PREVIEW_PAGE_SIZE,
    previewPage * PREVIEW_PAGE_SIZE
  );

  return (
    <SuperAdminLayout title="Impor Pegawai" subtitle="Impor data pegawai dari file CSV">
      <div className="space-y-6">
        {isRetrying && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            Sedang mencoba ulang memuat data impor pegawai...
          </div>
        )}
        {loadError && (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedTenant) {
                  void fetchValidOffices(selectedTenant);
                } else {
                  void fetchTenants();
                }
              }}
            >
              Coba Lagi
            </Button>
          </div>
        )}
        {/* Instructions */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Panduan Impor</AlertTitle>
          <AlertDescription>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
              <li>Unduh templat CSV dan isi dengan data pegawai</li>
              <li>Pilih organisasi tujuan impor</li>
              <li>Pilih lokasi kerja valid (koordinat real) untuk mapping pegawai</li>
              <li>Upload file CSV yang sudah diisi</li>
              <li>Periksa pratinjau data dan pastikan tidak ada error</li>
              <li>Klik tombol Impor untuk memproses data</li>
            </ol>
          </AlertDescription>
        </Alert>

        {/* Unduh Templat */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Templat Impor
            </CardTitle>
            <CardDescription>
              Unduh templat dan isi dengan data pegawai yang akan diimpor
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={downloadTemplate} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Unduh Templat CSV
            </Button>
          </CardContent>
        </Card>

        {/* Bagian Unggah */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Unggah File
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Organisasi Tujuan</Label>
                <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Pilih organisasi" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.code})
                    </SelectItem>
                  ))}
                </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Lokasi Kerja Mapping (Wajib)</Label>
                <Select
                  value={selectedOfficeId}
                  onValueChange={setSelectedOfficeId}
                  disabled={!selectedTenant || isLoadingOffices}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue
                      placeholder={
                        !selectedTenant
                          ? "Pilih organisasi dulu"
                          : isLoadingOffices
                            ? "Memuat lokasi kerja..."
                            : "Pilih lokasi kerja valid"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {offices.map((office) => (
                      <SelectItem key={office.id} value={office.id}>
                        {office.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTenant && !isLoadingOffices && offices.length === 0 && (
                  <p className="text-xs text-destructive">
                    Belum ada kantor dengan koordinat real pada tenant ini.
                  </p>
                )}
              </div>

            <div className="space-y-2">
              <Label>File CSV</Label>
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="max-w-md"
              />
              {file && (
                <p className="text-sm text-muted-foreground">
                  File: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bagian Pratinjau */}
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
              <CardTitle>Pratinjau Data</CardTitle>
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
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          if (previewPage > 1) {
                            setPreviewPage((page) => page - 1);
                          }
                        }}
                        className={previewPage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {previewPageNumbers.map((page) => (
                      <PaginationItem key={`import-preview-${page}`}>
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
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          if (previewPage < previewTotalPages) {
                            setPreviewPage((page) => page + 1);
                          }
                        }}
                        className={previewPage === previewTotalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>

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
                  disabled={validCount === 0 || isImporting || !selectedTenant || !selectedOfficeId}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Mengimpor...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Impor {validCount} Data Valid
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Hasil Impor */}
        {importResult && (
          <Alert variant={importResult.failed > 0 ? "destructive" : "default"}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Hasil Impor</AlertTitle>
            <AlertDescription>
              <p>Berhasil: {importResult.success} pegawai</p>
              {importResult.failed > 0 && <p>Gagal: {importResult.failed} pegawai</p>}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </SuperAdminLayout>
  );
}
