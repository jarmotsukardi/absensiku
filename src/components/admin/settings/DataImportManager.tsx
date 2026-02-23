import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { supabase } from "@/integrations/supabase/client";
import { debugLog } from "@/lib/debugLog";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { withTimeout } from "@/lib/attendanceResilience";
import { toast } from "sonner";
import {
  Upload,
  FileJson,
  FolderOpen,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  Trash2,
  Info,
  Database,
  Download,
  Shield,
  FileCode,
  Zap,
  HardDrive,
  Calendar
} from "lucide-react";

interface ImportData {
  [tableName: string]: unknown[];
}

interface FullBackupFormat {
  data: ImportData;
  schema?: string;
  rls?: string;
  metadata?: {
    created_at: string;
    project_id: string;
    tables_count: number;
    total_records: number;
    edge_functions?: Array<{ name: string; description: string }>;
    storage_buckets?: Array<{ name: string; isPublic: boolean; description: string }>;
  };
}

interface ImportResult {
  table: string;
  success: number;
  failed: number;
  errors: string[];
}

// Define order of import (respecting foreign keys)
const IMPORT_ORDER = [
  "tenants",
  "subscriptions", 
  "opd",
  "offices",
  "work_units",
  "positions",
  "employees",
  "user_roles",
  "work_hours",
  "work_holidays",
  "absence_limits",
  "work_shifts",
  "leave_requests",
  "wfh_requests",
  "wfh_schedules",
  "mutation_requests",
  "flexible_attendance_requests",
  "organization_settings",
  "faqs",
  "system_settings"
];

type ImportableTable = 
  | "tenants" 
  | "subscriptions" 
  | "opd" 
  | "offices" 
  | "work_units" 
  | "positions" 
  | "employees" 
  | "user_roles" 
  | "work_hours" 
  | "work_holidays" 
  | "absence_limits" 
  | "work_shifts" 
  | "leave_requests"
  | "wfh_requests"
  | "wfh_schedules"
  | "mutation_requests"
  | "flexible_attendance_requests"
  | "organization_settings"
  | "faqs"
  | "system_settings";

export function DataImportManager() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [backupMetadata, setBackupMetadata] = useState<FullBackupFormat['metadata'] | null>(null);
  const [schemaSql, setSchemaSql] = useState<string | null>(null);
  const [rlsSql, setRlsSql] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [currentTable, setCurrentTable] = useState("");

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Show loading toast for large files
    const loadingToast = file.size > 1000000 ? toast.loading(`Memproses file ${file.name}...`) : null;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) {
          toast.error("File kosong atau tidak dapat dibaca");
          if (loadingToast) toast.dismiss(loadingToast);
          return;
        }

        const json = JSON.parse(content);
        debugLog("Parsed JSON keys:", Object.keys(json));
        debugLog("Has data:", !!json.data);
        debugLog("Has schema:", !!json.schema);
        debugLog("Has rls:", !!json.rls);
        debugLog("Has metadata:", !!json.metadata);
        
        // Check if it's a full backup format (has 'data' property with table data)
        const isFullBackup = json.data && typeof json.data === 'object' && !Array.isArray(json.data);
        
        if (isFullBackup) {
          // Full backup format
          const dataObj = json.data as ImportData;
          setImportData(dataObj);
          setBackupMetadata(json.metadata || null);
          setSchemaSql(typeof json.schema === 'string' ? json.schema : null);
          setRlsSql(typeof json.rls === 'string' ? json.rls : null);
          
          const tablesWithData = Object.keys(dataObj).filter(
            key => Array.isArray(dataObj[key]) && dataObj[key].length > 0
          );
          setSelectedTables(new Set(tablesWithData));
          
          const totalRecords = Object.values(dataObj).reduce((acc, val) => {
            return acc + (Array.isArray(val) ? val.length : 0);
          }, 0);
          
          debugLog("Full backup detected:", {
            tables: tablesWithData.length,
            records: totalRecords,
            hasSchema: !!json.schema,
            hasRls: !!json.rls,
            hasMetadata: !!json.metadata
          });
          
          if (loadingToast) toast.dismiss(loadingToast);
          toast.success(`Backup lengkap ${file.name} berhasil dimuat (${tablesWithData.length} tabel, ${totalRecords.toLocaleString()} records)`);
        } else {
          // Simple format (direct table data) - check if any key has array value
          const hasTableData = Object.keys(json).some(key => Array.isArray(json[key]));
          
          if (!hasTableData) {
            toast.error("Format file tidak valid - tidak ditemukan data tabel");
            if (loadingToast) toast.dismiss(loadingToast);
            return;
          }
          
          setImportData(json as ImportData);
          setBackupMetadata(null);
          setSchemaSql(null);
          setRlsSql(null);
          
          const tablesWithData = Object.keys(json).filter(
            key => Array.isArray(json[key]) && json[key].length > 0
          );
          setSelectedTables(new Set(tablesWithData));
          
          if (loadingToast) toast.dismiss(loadingToast);
          toast.success(`File ${file.name} berhasil dimuat (${tablesWithData.length} tabel)`);
        }
        
        setImportFileName(file.name);
        setImportResults([]);
      } catch (error) {
        const errorRef = reportError(error, "admin.settings.data_import.parse_json", {
          file_name: file.name,
          file_size: file.size,
        });
        if (loadingToast) toast.dismiss(loadingToast);
        toast.error(appendErrorReference("File JSON tidak valid atau rusak", errorRef));
      }
    };
    
    reader.onerror = () => {
      const errorRef = reportError(reader.error ?? new Error("FileReader gagal membaca file"), "admin.settings.data_import.read_file", {
        file_name: file.name,
        file_size: file.size,
      });
      if (loadingToast) toast.dismiss(loadingToast);
      toast.error(appendErrorReference("Gagal membaca file", errorRef));
    };
    
    reader.readAsText(file);
  };

  const clearImportData = () => {
    setImportData(null);
    setBackupMetadata(null);
    setSchemaSql(null);
    setRlsSql(null);
    setImportFileName("");
    setSelectedTables(new Set());
    setImportResults([]);
    setImportProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const downloadSchemaSql = () => {
    if (!schemaSql) return;
    const blob = new Blob([schemaSql], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extracted_schema_${new Date().toISOString().split("T")[0]}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Schema SQL berhasil diekstrak");
  };

  const downloadRlsSql = () => {
    if (!rlsSql) return;
    const blob = new Blob([rlsSql], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extracted_rls_policies_${new Date().toISOString().split("T")[0]}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("RLS Policies SQL berhasil diekstrak");
  };

  const toggleTable = (tableName: string) => {
    setSelectedTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tableName)) {
        newSet.delete(tableName);
      } else {
        newSet.add(tableName);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (!importData) return;
    const allTables = Object.keys(importData).filter(
      key => Array.isArray(importData[key]) && importData[key].length > 0
    );
    setSelectedTables(new Set(allTables));
  };

  const deselectAll = () => {
    setSelectedTables(new Set());
  };

  const importSingleTable = async (tableName: string, data: unknown[]): Promise<ImportResult> => {
    const result: ImportResult = {
      table: tableName,
      success: 0,
      failed: 0,
      errors: []
    };

    if (!data || data.length === 0) {
      return result;
    }

    // Validate table name
    if (!IMPORT_ORDER.includes(tableName)) {
      result.errors.push(`Tabel "${tableName}" tidak didukung untuk import`);
      result.failed = data.length;
      return result;
    }

    try {
      // Import in batches of 50
      const batchSize = 50;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        // Clean data - remove created_at/updated_at if they're invalid
        const cleanedBatch = batch.map(item => {
          const cleaned = { ...item as Record<string, unknown> };
          // Let database generate new timestamps
          delete cleaned.created_at;
          delete cleaned.updated_at;
          return cleaned;
        });

        const { error } = await withTimeout(
          () =>
            supabase.from(tableName as ImportableTable).upsert(cleanedBatch, {
              onConflict: "id",
              ignoreDuplicates: false,
            }),
          15000,
          `Import tabel ${tableName} timeout`
        );

        if (error) {
          result.failed += batch.length;
          result.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
        } else {
          result.success += batch.length;
        }
      }
    } catch (error) {
      result.failed = data.length;
      result.errors.push(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  };

  const runImport = async () => {
    if (!importData || selectedTables.size === 0) {
      toast.error("Pilih tabel yang akan diimport");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setImportResults([]);

    try {
      const results: ImportResult[] = [];
      const tablesToImport = IMPORT_ORDER.filter(t => selectedTables.has(t));
      
      for (let i = 0; i < tablesToImport.length; i++) {
        const tableName = tablesToImport[i];
        const tableData = importData[tableName];
        
        setCurrentTable(tableName);
        setImportProgress(Math.round(((i + 0.5) / tablesToImport.length) * 100));

        if (Array.isArray(tableData) && tableData.length > 0) {
          const result = await importSingleTable(tableName, tableData);
          results.push(result);
        }

        setImportProgress(Math.round(((i + 1) / tablesToImport.length) * 100));
      }

      setImportResults(results);

      const totalSuccess = results.reduce((acc, r) => acc + r.success, 0);
      const totalFailed = results.reduce((acc, r) => acc + r.failed, 0);

      if (totalFailed === 0) {
        toast.success(`Import selesai: ${totalSuccess} records berhasil diimport`);
      } else {
        toast.warning(`Import selesai: ${totalSuccess} berhasil, ${totalFailed} gagal`);
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.data_import.run_import", {
        selected_table_count: selectedTables.size,
      });
      toast.error(appendErrorReference("Import gagal dijalankan", errorRef));
    } finally {
      setCurrentTable("");
      setIsImporting(false);
    }
  };

  const getTotalRecords = () => {
    if (!importData) return 0;
    return Array.from(selectedTables).reduce((acc, table) => {
      const data = importData[table];
      return acc + (Array.isArray(data) ? data.length : 0);
    }, 0);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          Import Data JSON
        </CardTitle>
        <CardDescription>
          Import data dari file JSON backup ke database
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">Perhatian</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
              <li>Import akan menggunakan mode UPSERT (update jika ada, insert jika baru)</li>
              <li>Pastikan schema database sudah sesuai sebelum import</li>
              <li>Import dilakukan sesuai urutan foreign key dependencies</li>
              <li>Backup data yang ada sebelum melakukan import</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* File Upload */}
        <div className="space-y-4">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json"
            onChange={handleFileUpload}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <FolderOpen className="h-4 w-4" />
              Pilih File JSON
            </Button>
            {importData && (
              <Button variant="ghost" onClick={clearImportData} className="gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Hapus
              </Button>
            )}
          </div>

          {importFileName && (
            <div className="flex items-center gap-2 text-sm">
              <FileJson className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">File:</span>
              <span className="font-medium">{importFileName}</span>
            </div>
          )}
        </div>

        {/* Data Preview & Selection */}
        {importData && (
          <>
            <Separator />

            {/* Backup Metadata (if full backup format) */}
            {backupMetadata && (
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Informasi Backup
                </h4>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Calendar className="h-3 w-3" />
                      Dibuat
                    </div>
                    <p className="text-sm font-medium">
                      {new Date(backupMetadata.created_at).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Database className="h-3 w-3" />
                      Tabel
                    </div>
                    <p className="text-sm font-medium">{backupMetadata.tables_count} tabel</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <FileJson className="h-3 w-3" />
                      Records
                    </div>
                    <p className="text-sm font-medium">{backupMetadata.total_records.toLocaleString()} records</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Zap className="h-3 w-3" />
                      Edge Functions
                    </div>
                    <p className="text-sm font-medium">{backupMetadata.edge_functions?.length || 0} functions</p>
                  </div>
                </div>

                {/* Extract SQL buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={downloadSchemaSql} 
                    disabled={!schemaSql}
                    className="gap-2"
                  >
                    <FileCode className="h-4 w-4" />
                    Ekstrak Schema SQL
                    {schemaSql ? (
                      <Badge variant="secondary" className="ml-1 text-xs">Ada</Badge>
                    ) : (
                      <Badge variant="outline" className="ml-1 text-xs">Tidak ada</Badge>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={downloadRlsSql} 
                    disabled={!rlsSql}
                    className="gap-2"
                  >
                    <Shield className="h-4 w-4" />
                    Ekstrak RLS Policies SQL
                    {rlsSql ? (
                      <Badge variant="secondary" className="ml-1 text-xs">Ada</Badge>
                    ) : (
                      <Badge variant="outline" className="ml-1 text-xs">Tidak ada</Badge>
                    )}
                  </Button>
                </div>

                {/* Storage Buckets Info */}
                {backupMetadata.storage_buckets && backupMetadata.storage_buckets.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium flex items-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      Storage Buckets yang Diperlukan
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {backupMetadata.storage_buckets.map(bucket => (
                        <Badge key={bucket.name} variant="secondary">
                          {bucket.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />
              </div>
            )}
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Pilih Tabel untuk Import
                </h4>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    Pilih Semua
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    Hapus Semua
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {IMPORT_ORDER.map(tableName => {
                    const tableData = importData[tableName];
                    const recordCount = Array.isArray(tableData) ? tableData.length : 0;
                    const hasData = recordCount > 0;
                    
                    if (!importData[tableName] && !hasData) return null;

                    return (
                      <div 
                        key={tableName} 
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          selectedTables.has(tableName) ? 'border-primary bg-primary/5' : 'bg-muted/30'
                        } ${!hasData ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id={`import-${tableName}`}
                            checked={selectedTables.has(tableName)}
                            onCheckedChange={() => toggleTable(tableName)}
                            disabled={!hasData}
                          />
                          <label 
                            htmlFor={`import-${tableName}`}
                            className="font-medium cursor-pointer"
                          >
                            {tableName}
                          </label>
                        </div>
                        <Badge variant={hasData ? "default" : "secondary"}>
                          {recordCount} records
                        </Badge>
                      </div>
                    );
                  })}
                  
                  {/* Show tables not in IMPORT_ORDER */}
                  {Object.keys(importData)
                    .filter(t => !IMPORT_ORDER.includes(t))
                    .map(tableName => {
                      const tableData = importData[tableName];
                      const recordCount = Array.isArray(tableData) ? tableData.length : 0;
                      
                      return (
                        <div 
                          key={tableName} 
                          className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 opacity-50"
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox disabled checked={false} />
                            <span className="font-medium">{tableName}</span>
                            <Badge variant="outline" className="text-xs">Tidak didukung</Badge>
                          </div>
                          <Badge variant="secondary">
                            {recordCount} records
                          </Badge>
                        </div>
                      );
                    })}
                </div>
              </ScrollArea>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">{selectedTables.size}</span> tabel dipilih, 
                  <span className="font-medium ml-1">{getTotalRecords()}</span> records
                </div>
                <Button 
                  onClick={runImport} 
                  disabled={isImporting || selectedTables.size === 0}
                  className="gap-2"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Mulai Import
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Import Progress */}
        {isImporting && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Importing: <span className="font-medium">{currentTable}</span></span>
              <span>{importProgress}%</span>
            </div>
            <Progress value={importProgress} className="h-2" />
          </div>
        )}

        {/* Import Results */}
        {importResults.length > 0 && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <Info className="h-4 w-4" />
                Hasil Import
              </h4>
              <ScrollArea className="h-[200px] pr-4">
                <div className="space-y-2">
                  {importResults.map((result, i) => (
                    <div 
                      key={i}
                      className={`p-3 rounded-lg border ${
                        result.failed > 0 ? 'border-destructive/30 bg-destructive/5' : 'border-green-500/30 bg-green-500/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{result.table}</span>
                        <div className="flex items-center gap-2">
                          {result.success > 0 && (
                            <Badge variant="default" className="bg-green-500 gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {result.success}
                            </Badge>
                          )}
                          {result.failed > 0 && (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              {result.failed}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {result.errors.length > 0 && (
                        <div className="mt-2 text-xs text-destructive">
                          {result.errors.slice(0, 3).map((err, j) => (
                            <p key={j}>{err}</p>
                          ))}
                          {result.errors.length > 3 && (
                            <p>...dan {result.errors.length - 3} error lainnya</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}
        </CardContent>
      </Card>

      <PageGlossarySection preset="settings_data_import" />
    </div>
  );
}
