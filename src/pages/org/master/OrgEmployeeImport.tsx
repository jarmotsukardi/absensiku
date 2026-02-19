import { useCallback, useEffect, useState } from "react";
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
  opd_code: string;
  address: string;
  gender: string;
  status: "valid" | "error" | "warning";
  errors: string[];
}

interface OfficeOption {
  id: string;
  name: string;
}

export default function OrgEmployeeImport() {
  const PREVIEW_PAGE_SIZE = 20;
  const MAX_IMPORT_ROWS = 100;
  const CSV_HEADERS = [
    "NIK",
    "NIP",
    "Nama Lengkap",
    "Gelar Depan",
    "Gelar Belakang",
    "Email",
    "No. Telepon",
    "WhatsApp",
    "Jenis Kelamin (L/P)",
    "Jabatan",
    "Golongan",
    "Kode OPD",
    "Alamat",
  ];
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState<ImportRow[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offices, setOffices] = useState<OfficeOption[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [isLoadingOffices, setIsLoadingOffices] = useState(false);

  const normalizeHeader = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

  const parseCsvLine = (line: string): string[] => {
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

      if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
        continue;
      }

      current += char;
    }

    values.push(current.trim());
    return values.map((value) => value.replace(/\r/g, ""));
  };

  useEffect(() => {
    void fetchUserTenant();
  }, []);

  const fetchUserTenant = async () => {
    setLoadError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: employee, error } = await supabase
          .from("employees")
          .select("tenant_id")
          .eq("user_id", user.id)
          .single();
        if (error) throw error;

        if (employee) {
          setTenantId(employee.tenant_id);
        }
      }
    } catch (error) {
      const errorRef = reportError(error, "org.employee_import.fetch_user_tenant");
      const message = appendErrorReference("Gagal menentukan tenant import", errorRef);
      setLoadError(message);
      toast.error(message);
    }
  };

  const fetchValidOffices = useCallback(async (currentTenantId: string) => {
    setIsLoadingOffices(true);
    try {
      const { data, error } = await supabase
        .from("offices")
        .select("id, name, latitude, longitude")
        .eq("tenant_id", currentTenantId)
        .eq("is_active", true)
        .order("name");

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
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    void fetchValidOffices(tenantId);
  }, [fetchValidOffices, tenantId]);

  const downloadTemplate = () => {
    // Create CSV template with comprehensive headers
    const headers = [
      "NIK",
      "NIP",
      "Nama Lengkap",
      "Gelar Depan",
      "Gelar Belakang",
      "Email",
      "No. Telepon",
      "WhatsApp",
      "Jenis Kelamin (L/P)",
      "Jabatan",
      "Golongan",
      "Kode OPD",
      "Alamat"
    ];
    
    const exampleRow1 = [
      "1234567890123456",
      "199001012020011001",
      "Ahmad Surya",
      "Dr.",
      "M.Si.",
      "ahmad.surya@example.com",
      "081234567890",
      "081234567890",
      "L",
      "Kepala Seksi",
      "III/c",
      "DISKOMINFO",
      "Jl. Merdeka No. 1"
    ];

    const exampleRow2 = [
      "9876543210123456",
      "199505152021012001",
      "Siti Nurhaliza",
      "",
      "S.Kom.",
      "siti.nurhaliza@example.com",
      "089876543210",
      "089876543210",
      "P",
      "Analis Data",
      "III/a",
      "BAPPEDA",
      "Jl. Pembangunan No. 5"
    ];

    const csvContent = [
      headers.join(","),
      exampleRow1.join(","),
      exampleRow2.join(","),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
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
    if (!tenantId) {
      toast.error("Tenant tidak ditemukan");
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setPreviewData([]);
    setImportResult(null);
    setPreviewPage(1);

    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter((line) => line.trim());
      
      if (lines.length < 2) {
        toast.error("File CSV kosong atau hanya berisi header");
        return;
      }

      const headerColumns = parseCsvLine(lines[0]);
      const expectedHeader = CSV_HEADERS.map(normalizeHeader);
      const uploadedHeader = headerColumns.map(normalizeHeader);
      const headerValid =
        uploadedHeader.length === expectedHeader.length &&
        expectedHeader.every((header, index) => uploadedHeader[index] === header);

      if (!headerValid) {
        const message = "Header CSV tidak sesuai template. Gunakan file hasil Download Template CSV.";
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

      // Get existing NIKs and emails for validation
      const { data: existingEmployees } = await supabase
        .from("employees")
        .select("nik, email")
        .eq("tenant_id", tenantId);

      const existingNiks = new Set(existingEmployees?.map(e => e.nik) || []);
      const existingEmails = new Set(existingEmployees?.map(e => e.email?.toLowerCase()) || []);

      // Get OPDs for validation
      const { data: opds } = await supabase
        .from("opd")
        .select("code, name")
        .eq("tenant_id", tenantId);

      const opdCodes = new Set(opds?.map(o => o.code.toUpperCase()) || []);

      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        const values = parseCsvLine(line);
        
        const row: ImportRow = {
          rowNum: i + 2,
          nik: values[0] || "",
          nip: values[1] || "",
          name: values[2] || "",
          gelar_depan: values[3] || "",
          gelar_belakang: values[4] || "",
          email: values[5] || "",
          phone: values[6] || "",
          whatsapp: values[7] || "",
          position: values[9] || "",
          golongan: values[10] || "",
          opd_code: values[11] || "",
          address: values[12] || "",
          gender: values[8] || "",
          status: "valid",
          errors: [],
        };

        // Validation
        if (values.length !== CSV_HEADERS.length) {
          row.errors.push(`Jumlah kolom tidak sesuai template (${values.length}/${CSV_HEADERS.length})`);
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

        row.status = row.errors.length > 0 ? "error" : "valid";
        parsedRows.push(row);
      }

      setPreviewData(parsedRows);
    } catch (error) {
      const errorRef = reportError(error, "org.employee_import.parse_csv");
      const message = appendErrorReference("Gagal membaca file CSV", errorRef);
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!tenantId) {
      toast.error("Tenant tidak ditemukan");
      return;
    }
    if (!selectedOfficeId) {
      toast.error("Pilih lokasi kerja valid untuk mapping pegawai import.");
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

    setIsImporting(true);
    setLoadError(null);
    let success = 0;
    let failed = 0;

    try {
      // Get OPDs for this tenant
      const { data: opds } = await supabase
        .from("opd")
        .select("id, code")
        .eq("tenant_id", tenantId);

      const opdMap = new Map(opds?.map(o => [o.code.toUpperCase(), o.id]) || []);

      for (let i = 0; i < validRows.length; i++) {
        try {
          const row = validRows[i];
          const opdId = row.opd_code ? opdMap.get(row.opd_code.toUpperCase()) : null;

          const { error } = await supabase.from("employees").insert({
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
            position: row.position || null,
            golongan: row.golongan || null,
            opd_id: opdId,
            office_id: selectedOfficeId,
            address: row.address || null,
            is_active: true,
          });

          if (error) throw error;
          success++;
        } catch (error) {
          console.error("Error importing row:", error);
          failed++;
        }
      }

      setImportResult({ success, failed });
      toast.success(`Import selesai: ${success} berhasil, ${failed} gagal`);
      
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
    }
  };

  const validCount = previewData.filter(r => r.status === "valid").length;
  const errorCount = previewData.filter(r => r.status === "error").length;
  const importDisabled = validCount === 0 || errorCount > 0 || isImporting || !selectedOfficeId;
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
          <p className="text-sm text-muted-foreground">Import data pegawai dari file CSV</p>
        </div>

        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{loadError}</p>
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
                    <li><strong>Download Template:</strong> Klik tombol "Download Template CSV" untuk mendapatkan format yang benar</li>
                    <li><strong>Isi Data:</strong> Buka file dengan Excel/Google Sheets dan isi data pegawai sesuai kolom</li>
                    <li><strong>Simpan sebagai CSV:</strong> Simpan file dengan format CSV (Comma Separated Values)</li>
                    <li><strong>Pilih Lokasi Kerja:</strong> Wajib pilih lokasi kerja dengan koordinat real</li>
                    <li><strong>Upload File:</strong> Pilih file CSV yang sudah diisi</li>
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
                        <span className="font-medium">Kode OPD</span>
                        <span className="text-muted-foreground">Sesuai dengan kode OPD yang sudah dibuat</span>
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
                    <li>Gunakan format file CSV (bukan Excel .xlsx)</li>
                    <li>Jika menggunakan Excel, Save As dengan tipe "CSV UTF-8"</li>
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
              <Label>Lokasi Kerja Mapping (Wajib)</Label>
              <Select
                value={selectedOfficeId}
                onValueChange={setSelectedOfficeId}
                disabled={isLoadingOffices || offices.length === 0}
              >
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder={isLoadingOffices ? "Memuat lokasi kerja..." : "Pilih lokasi kerja valid"} />
                </SelectTrigger>
                <SelectContent>
                  {offices.map((office) => (
                    <SelectItem key={office.id} value={office.id}>
                      {office.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isLoadingOffices && offices.length === 0 && (
                <p className="text-xs text-destructive">
                  Belum ada kantor koordinat real, import pegawai belum bisa dijalankan.
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
