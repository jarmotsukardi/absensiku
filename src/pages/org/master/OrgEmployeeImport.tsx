import { useState, useEffect } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  BookOpen,
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
  gender: string;
  status: "valid" | "error" | "warning";
  errors: string[];
}

export default function OrgEmployeeImport() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState<ImportRow[]>([]);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  useEffect(() => {
    fetchUserTenant();
  }, []);

  const fetchUserTenant = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: employee } = await supabase
        .from("employees")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();
      
      if (employee) {
        setTenantId(employee.tenant_id);
      }
    }
  };

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
    setPreviewData([]);
    setImportResult(null);

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
        const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        
        const row: ImportRow = {
          rowNum: i + 2,
          nik: values[0] || "",
          nip: values[1] || "",
          name: values[2] || "",
          email: values[5] || "",
          phone: values[6] || "",
          position: values[9] || "",
          opd_code: values[11] || "",
          gender: values[8] || "",
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
      console.error("Error parsing CSV:", error);
      toast.error("Gagal membaca file CSV");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!tenantId) {
      toast.error("Tenant tidak ditemukan");
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
        .eq("tenant_id", tenantId);

      const opdMap = new Map(opds?.map(o => [o.code.toUpperCase(), o.id]) || []);

      // Re-read CSV for all fields
      const text = await file!.text();
      const lines = text.split("\n").filter(line => line.trim());
      const dataLines = lines.slice(1);

      for (let i = 0; i < validRows.length; i++) {
        try {
          const rowIndex = validRows[i].rowNum - 2;
          const line = dataLines[rowIndex];
          const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
          
          const opdId = values[11] ? opdMap.get(values[11].toUpperCase()) : null;

          const { error } = await supabase.from("employees").insert({
            tenant_id: tenantId,
            nik: values[0],
            nip: values[1] || null,
            name: values[2],
            gelar_depan: values[3] || null,
            gelar_belakang: values[4] || null,
            email: values[5],
            phone: values[6] || null,
            whatsapp: values[7] || null,
            gender: values[8]?.toUpperCase() === "L" ? "L" : values[8]?.toUpperCase() === "P" ? "P" : null,
            position: values[9] || null,
            golongan: values[10] || null,
            opd_id: opdId,
            address: values[12] || null,
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
      console.error("Error during import:", error);
      toast.error("Terjadi kesalahan saat import");
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = previewData.filter(r => r.status === "valid").length;
  const errorCount = previewData.filter(r => r.status === "error").length;

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Import Pegawai</h1>
          <p className="text-sm text-muted-foreground">Import data pegawai dari file CSV</p>
        </div>

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
                    {previewData.slice(0, 20).map((row) => (
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

              {previewData.length > 20 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Menampilkan 20 dari {previewData.length} baris
                </p>
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
                  disabled={validCount === 0 || isImporting}
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
    </OrganizationLayout>
  );
}
