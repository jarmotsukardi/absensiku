import { useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export default function EmployeeImport() {
  const PREVIEW_PAGE_SIZE = 20;
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState<ImportRow[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  // Fetch tenants on component mount
  useState(() => {
    fetchTenants();
  });

  const fetchTenants = async () => {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, code")
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setTenants(data);
    }
  };

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
      "John Doe",
      "john@example.com",
      "081234567890",
      "Staff",
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

    if (!selectedFile.name.endsWith(".csv")) {
      toast.error("Hanya file CSV yang diperbolehkan");
      return;
    }

    setFile(selectedFile);
    await parseCSV(selectedFile);
  };

  const parseCSV = async (file: File) => {
    setIsLoading(true);
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
      const { data: existingEmployees } = await supabase
        .from("employees")
        .select("nik, email");

      const existingNiks = new Set(existingEmployees?.map(e => e.nik) || []);
      const existingEmails = new Set(existingEmployees?.map(e => e.email?.toLowerCase()) || []);

      // Get OPDs for validation
      const { data: opds } = await supabase
        .from("opd")
        .select("code, name");

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
    } catch (error) {
      console.error("Error parsing CSV:", error);
      toast.error("Gagal membaca file CSV");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedTenant) {
      toast.error("Pilih organisasi terlebih dahulu");
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
      const { data: opds } = await supabase
        .from("opd")
        .select("id, code")
        .eq("tenant_id", selectedTenant);

      const opdMap = new Map(opds?.map(o => [o.code.toUpperCase(), o.id]) || []);

      for (const row of validRows) {
        try {
          const opdId = row.opd_code ? opdMap.get(row.opd_code.toUpperCase()) : null;

          const { error } = await supabase.from("employees").insert({
            tenant_id: selectedTenant,
            nik: row.nik,
            nip: row.nip || null,
            name: row.name,
            email: row.email,
            phone: row.phone || null,
            position: row.position || null,
            opd_id: opdId,
            is_active: true,
          });

          if (error) throw error;
          success++;
        } catch (error) {
          console.error("Error importing row:", row, error);
          failed++;
        }
      }

      setImportResult({ success, failed });
      toast.success(`Import selesai: ${success} berhasil, ${failed} gagal`);
      
      // Reset form after successful import
      if (failed === 0) {
        setFile(null);
        setPreviewData([]);
      }
    } catch (error) {
      console.error("Error during import:", error);
      toast.error("Terjadi kesalahan saat import");
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = previewData.filter(r => r.status === "valid").length;
  const errorCount = previewData.filter(r => r.status === "error").length;
  const previewTotalPages = Math.max(1, Math.ceil(previewData.length / PREVIEW_PAGE_SIZE));
  const paginatedPreviewRows = previewData.slice(
    (previewPage - 1) * PREVIEW_PAGE_SIZE,
    previewPage * PREVIEW_PAGE_SIZE
  );

  return (
    <SuperAdminLayout title="Import Pegawai" subtitle="Import data pegawai dari file CSV">
      <div className="space-y-6">
        {/* Instructions */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Panduan Import</AlertTitle>
          <AlertDescription>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
              <li>Download template CSV dan isi dengan data pegawai</li>
              <li>Pilih organisasi tujuan import</li>
              <li>Upload file CSV yang sudah diisi</li>
              <li>Periksa preview data dan pastikan tidak ada error</li>
              <li>Klik tombol Import untuk memproses data</li>
            </ol>
          </AlertDescription>
        </Alert>

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
            <Button onClick={downloadTemplate} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download Template CSV
            </Button>
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                    disabled={previewPage === 1}
                  >
                    Sebelumnya
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Halaman {previewPage} dari {previewTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewPage((p) => Math.min(previewTotalPages, p + 1))}
                    disabled={previewPage === previewTotalPages}
                  >
                    Berikutnya
                  </Button>
                </div>
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
                  disabled={validCount === 0 || isImporting || !selectedTenant}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Mengimport...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import {validCount} Data Valid
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
      </div>
    </SuperAdminLayout>
  );
}
