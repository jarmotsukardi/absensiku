import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Database,
  Shield,
  Server,
  Upload,
  Download,
  Zap,
  HardDrive,
  Users,
  FolderOpen,
  Rocket,
  AlertTriangle,
  Copy,
  ExternalLink,
  RefreshCw
} from "lucide-react";

interface MigrationStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "error";
}

const MIGRATION_STEPS: MigrationStep[] = [
  { id: "prepare", title: "Persiapan", description: "Backup data dan siapkan kredensial", status: "pending" },
  { id: "connect", title: "Koneksi Target", description: "Test koneksi ke project baru", status: "pending" },
  { id: "schema", title: "Migrasi Schema", description: "Jalankan SQL schema & RLS", status: "pending" },
  { id: "data", title: "Migrasi Data", description: "Import semua data", status: "pending" },
  { id: "storage", title: "Storage & Functions", description: "Setup buckets & edge functions", status: "pending" },
  { id: "verify", title: "Verifikasi", description: "Testing dan cutover", status: "pending" }
];

// Helper function to generate partition SQL
const generatePartitionSQL = (): string => {
  const partitions = [];
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  
  // Generate partitions for last 6 months and next 6 months
  for (let i = -6; i <= 6; i++) {
    const date = new Date(currentYear, currentMonth - 1 + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const nextDate = new Date(year, date.getMonth() + 1, 1);
    const nextYear = nextDate.getFullYear();
    const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
    
    const partitionName = `attendance_records_p${year}_${month}`;
    const startDate = `${year}-${month}-01`;
    const endDate = `${nextYear}-${nextMonth}-01`;
    
    partitions.push(`-- Partisi ${year}-${month}
CREATE TABLE IF NOT EXISTS public.${partitionName} PARTITION OF public.attendance_records_partitioned
  FOR VALUES FROM ('${startDate}') TO ('${endDate}');

CREATE INDEX IF NOT EXISTS idx_${partitionName}_emp_date ON public.${partitionName} (employee_id, date);`);
  }
  
  return `-- =============================================
-- SQL PARTISI ATTENDANCE RECORDS
-- Jalankan di SQL Editor project target Supabase
-- =============================================

-- Pastikan tabel parent attendance_records_partitioned sudah ada
-- dari Schema SQL sebelumnya

${partitions.join('\n\n')}

-- Default partition untuk data di luar range
CREATE TABLE IF NOT EXISTS public.attendance_records_default PARTITION OF public.attendance_records_partitioned DEFAULT;
`;
};

// Helper function to generate storage bucket SQL
const generateStorageBucketSQL = (): string => {
  return `-- =============================================
-- SQL STORAGE BUCKETS
-- Jalankan di SQL Editor project target Supabase
-- =============================================

-- Buat bucket organization-logos (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('organization-logos', 'organization-logos', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Buat bucket apk-files (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('apk-files', 'apk-files', true, 104857600, ARRAY['application/vnd.android.package-archive'])
ON CONFLICT (id) DO NOTHING;

-- Buat bucket news-images (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('news-images', 'news-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Policy untuk public read access organization-logos
CREATE POLICY "Public can view organization logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'organization-logos');

-- Policy untuk authenticated upload organization-logos
CREATE POLICY "Authenticated users can upload organization logos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'organization-logos' AND auth.role() = 'authenticated');

-- Policy untuk public read access apk-files
CREATE POLICY "Public can view apk files" ON storage.objects
  FOR SELECT USING (bucket_id = 'apk-files');

-- Policy untuk super admin upload apk-files
CREATE POLICY "Super admin can upload apk files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'apk-files' AND auth.role() = 'authenticated');

-- Policy untuk public read access news-images
CREATE POLICY "Public can view news images" ON storage.objects
  FOR SELECT USING (bucket_id = 'news-images');

-- Policy untuk authenticated upload news-images
CREATE POLICY "Authenticated users can upload news images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'news-images' AND auth.role() = 'authenticated');
`;
};

export function MigrationWizard() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<MigrationStep[]>(MIGRATION_STEPS);
  
  // Credentials
  const [sourceUrl, setSourceUrl] = useState(import.meta.env.VITE_SUPABASE_URL || "");
  const [sourceKey, setSourceKey] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [targetAnonKey, setTargetAnonKey] = useState("");
  const [targetServiceKey, setTargetServiceKey] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  
  // Connection test state
  const [sourceConnected, setSourceConnected] = useState<boolean | null>(null);
  const [targetConnected, setTargetConnected] = useState<boolean | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  
  // Checklist state
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const testConnection = async (type: "source" | "target") => {
    const url = type === "source" ? sourceUrl : targetUrl;
    const key = type === "source" ? sourceKey : targetAnonKey;
    
    if (!url || !key) {
      toast.error(`Masukkan URL dan API Key untuk ${type === "source" ? "sumber" : "target"}`);
      return;
    }
    
    setIsTesting(true);
    try {
      const response = await fetch(`${url}/rest/v1/`, {
        headers: {
          "apikey": key,
          "Authorization": `Bearer ${key}`,
        },
      });
      
      if (response.ok || response.status === 200) {
        if (type === "source") {
          setSourceConnected(true);
        } else {
          setTargetConnected(true);
        }
        toast.success(`Koneksi ke ${type === "source" ? "sumber" : "target"} berhasil!`);
      } else {
        if (type === "source") {
          setSourceConnected(false);
        } else {
          setTargetConnected(false);
        }
        toast.error(`Koneksi gagal: HTTP ${response.status}`);
      }
    } catch (error) {
      if (type === "source") {
        setSourceConnected(false);
      } else {
        setTargetConnected(false);
      }
      toast.error("Tidak dapat terhubung ke server");
    } finally {
      setIsTesting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} disalin ke clipboard`);
  };

  const updateStepStatus = (stepId: string, status: MigrationStep["status"]) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s));
  };

  const toggleChecklist = (item: string) => {
    setChecklist(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      updateStepStatus(steps[currentStep].id, "completed");
      setCurrentStep(prev => prev + 1);
      updateStepStatus(steps[currentStep + 1].id, "in-progress");
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const resetWizard = () => {
    setCurrentStep(0);
    setSteps(MIGRATION_STEPS);
    setSourceConnected(null);
    setTargetConnected(null);
    setChecklist({});
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Persiapan
        return (
          <div className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
              <AlertTriangle className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800 dark:text-blue-200">Sebelum Memulai</AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                Pastikan Anda sudah memiliki akses ke project Supabase baru dan telah melakukan Full Backup.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-3">
              <h4 className="font-medium">Checklist Persiapan:</h4>
              {[
                { id: "backup-done", label: "Full Backup sudah dijalankan dan file JSON tersimpan" },
                { id: "new-project", label: "Project Supabase baru sudah dibuat" },
                { id: "credentials", label: "Kredensial project baru sudah dicatat (URL, Anon Key, Service Key)" }
              ].map(item => (
                <div key={item.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={item.id} 
                    checked={checklist[item.id] || false}
                    onCheckedChange={() => toggleChecklist(item.id)}
                  />
                  <label htmlFor={item.id} className="text-sm cursor-pointer">
                    {item.label}
                  </label>
                </div>
              ))}
            </div>

            <Separator />
            
            <div className="space-y-3">
              <h4 className="font-medium">Kredensial Sumber (Current):</h4>
              <div className="p-3 rounded-lg bg-muted/50 font-mono text-xs break-all">
                <p><strong>URL:</strong> {sourceUrl || "Tidak tersedia"}</p>
              </div>
            </div>
          </div>
        );
        
      case 1: // Koneksi Target
        return (
          <div className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="target-url">Supabase URL (Target) *</Label>
                <Input
                  id="target-url"
                  placeholder="https://xxxxx.supabase.co"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-anon-key">Anon Key (Target) *</Label>
                <div className="flex gap-2">
                  <Input
                    id="target-anon-key"
                    type={showKeys ? "text" : "password"}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={targetAnonKey}
                    onChange={(e) => setTargetAnonKey(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowKeys(!showKeys)}
                  >
                    {showKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-service-key">Service Role Key (Target)</Label>
                <Input
                  id="target-service-key"
                  type={showKeys ? "text" : "password"}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={targetServiceKey}
                  onChange={(e) => setTargetServiceKey(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Service Role Key diperlukan untuk bypass RLS saat import data
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={() => testConnection("target")} 
                disabled={isTesting}
                variant={targetConnected === true ? "default" : "outline"}
                className="gap-2"
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : targetConnected === true ? (
                  <CheckCircle className="h-4 w-4" />
                ) : targetConnected === false ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <Server className="h-4 w-4" />
                )}
                Test Koneksi Target
              </Button>
            </div>

            {targetConnected === true && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-200">Koneksi Berhasil</AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  Database target dapat diakses. Lanjutkan ke langkah berikutnya.
                </AlertDescription>
              </Alert>
            )}
          </div>
        );
        
      case 2: { // Migrasi Schema
        const partitionSQL = generatePartitionSQL();
        const storageBucketSQL = generateStorageBucketSQL();
        
        return (
          <div className="space-y-4">
            <Alert>
              <Database className="h-4 w-4" />
              <AlertTitle>Langkah Migrasi Schema</AlertTitle>
              <AlertDescription>
                Jalankan SQL berikut di SQL Editor project target Supabase.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <h4 className="font-medium">Urutan Eksekusi:</h4>
              {[
                { id: "schema-1", label: "1. Jalankan Schema SQL (dari tab Schema)", desc: "Membuat tabel, enum, dan fungsi helper" },
                { id: "schema-2", label: "2. Jalankan RLS Policies SQL (dari tab RLS)", desc: "Mengaktifkan Row Level Security" },
                { id: "schema-3", label: "3. Buat partisi attendance_records", desc: "Klik tombol di bawah untuk copy SQL partisi" },
                { id: "schema-4", label: "4. Verifikasi semua tabel di Table Editor", desc: "Pastikan tidak ada error" }
              ].map(item => (
                <div key={item.id} className="flex items-start space-x-2 p-2 rounded-lg hover:bg-muted/50">
                  <Checkbox 
                    id={item.id}
                    checked={checklist[item.id] || false}
                    onCheckedChange={() => toggleChecklist(item.id)}
                    className="mt-1"
                  />
                  <div>
                    <label htmlFor={item.id} className="text-sm font-medium cursor-pointer">
                      {item.label}
                    </label>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            {/* SQL Partition Export */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                SQL Partisi attendance_records
              </h4>
              <p className="text-sm text-muted-foreground">
                Salin SQL berikut dan jalankan di SQL Editor project target untuk membuat partisi tabel attendance_records.
              </p>
              <ScrollArea className="h-48 rounded-md border bg-muted/30 p-3">
                <pre className="text-xs font-mono whitespace-pre-wrap">{partitionSQL}</pre>
              </ScrollArea>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => copyToClipboard(partitionSQL, "SQL Partisi")}
              >
                <Copy className="h-4 w-4" />
                Salin SQL Partisi
              </Button>
            </div>

            <Separator />

            {/* Storage Bucket SQL */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                SQL Storage Buckets
              </h4>
              <p className="text-sm text-muted-foreground">
                Salin SQL berikut untuk membuat storage buckets di project target.
              </p>
              <ScrollArea className="h-32 rounded-md border bg-muted/30 p-3">
                <pre className="text-xs font-mono whitespace-pre-wrap">{storageBucketSQL}</pre>
              </ScrollArea>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => copyToClipboard(storageBucketSQL, "SQL Storage Buckets")}
              >
                <Copy className="h-4 w-4" />
                Salin SQL Storage Buckets
              </Button>
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Buka Supabase Dashboard
                </a>
              </Button>
            </div>
          </div>
        );
      }
        
      case 3: // Migrasi Data
        return (
          <div className="space-y-4">
            <Alert>
              <Upload className="h-4 w-4" />
              <AlertTitle>Import Data</AlertTitle>
              <AlertDescription>
                Gunakan fitur Import di tab "Import" untuk mengunggah file backup JSON.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <h4 className="font-medium">Urutan Import (PENTING!):</h4>
              <p className="text-sm text-muted-foreground">
                Data harus diimport sesuai urutan foreign key dependency.
              </p>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  "1. tenants",
                  "2. subscriptions", 
                  "3. opd",
                  "4. offices",
                  "5. work_units",
                  "6. positions",
                  "7. employees",
                  "8. user_roles",
                  "9. work_hours",
                  "10. work_holidays",
                  "11. work_shifts",
                  "12. attendance_records",
                  "13. leave_requests",
                  "14. Lainnya..."
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-1">
                    <Badge variant="outline" className="text-xs">{item}</Badge>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2">
                {[
                  { id: "data-1", label: "Upload file backup JSON" },
                  { id: "data-2", label: "Pilih tabel yang akan diimport" },
                  { id: "data-3", label: "Jalankan import dan tunggu selesai" },
                  { id: "data-4", label: "Verifikasi jumlah record di database target" }
                ].map(item => (
                  <div key={item.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={item.id}
                      checked={checklist[item.id] || false}
                      onCheckedChange={() => toggleChecklist(item.id)}
                    />
                    <label htmlFor={item.id} className="text-sm cursor-pointer">
                      {item.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
        
      case 4: // Storage & Functions
        return (
          <div className="space-y-4">
            <div className="grid gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    Storage Buckets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { name: "organization-logos", public: true },
                      { name: "apk-files", public: true },
                      { name: "news-images", public: true }
                    ].map(bucket => (
                      <div key={bucket.name} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-sm font-mono">{bucket.name}</span>
                        <Badge variant={bucket.public ? "default" : "secondary"}>
                          {bucket.public ? "Public" : "Private"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Edge Functions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      "send-registration-otp",
                      "verify-registration-otp",
                      "send-password-otp",
                      "verify-password-otp",
                      "send-org-type-otp",
                      "verify-org-type-otp",
                      "send-reset-password",
                      "send-test-email",
                      "send-test-whatsapp",
                      "verify-device-otp",
                      "join-organization",
                      "cleanup-location-data",
                      "partition-maintenance"
                    ].map(fn => (
                      <Badge key={fn} variant="outline" className="justify-start text-xs">
                        {fn}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Edge functions akan otomatis ter-deploy saat project di-push ke Lovable.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-2">
              {[
                { id: "storage-1", label: "Buat semua storage buckets di project target" },
                { id: "storage-2", label: "Set bucket policies (public read untuk logos & images)" },
                { id: "storage-3", label: "Upload ulang file jika ada" }
              ].map(item => (
                <div key={item.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={item.id}
                    checked={checklist[item.id] || false}
                    onCheckedChange={() => toggleChecklist(item.id)}
                  />
                  <label htmlFor={item.id} className="text-sm cursor-pointer">
                    {item.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        );
        
      case 5: // Verifikasi
        return (
          <div className="space-y-4">
            <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
              <Rocket className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800 dark:text-green-200">Hampir Selesai!</AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-300">
                Lakukan testing menyeluruh sebelum cutover ke production.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <h4 className="font-medium">Checklist Verifikasi:</h4>
              {[
                { id: "verify-1", label: "Test login untuk setiap role (super_admin, admin_instansi, pegawai)" },
                { id: "verify-2", label: "Test fitur absensi (check-in, check-out)" },
                { id: "verify-3", label: "Test pengajuan izin/cuti" },
                { id: "verify-4", label: "Test laporan dan export data" },
                { id: "verify-5", label: "Verifikasi edge functions berjalan (OTP, notifikasi)" },
                { id: "verify-6", label: "Update environment variables di Lovable (.env)" },
                { id: "verify-7", label: "Deploy ulang aplikasi dengan kredensial baru" }
              ].map(item => (
                <div key={item.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={item.id}
                    checked={checklist[item.id] || false}
                    onCheckedChange={() => toggleChecklist(item.id)}
                  />
                  <label htmlFor={item.id} className="text-sm cursor-pointer">
                    {item.label}
                  </label>
                </div>
              ))}
            </div>

            <Separator />

            <div className="p-4 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">Environment Variables Baru:</h4>
              <div className="space-y-2 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">VITE_SUPABASE_URL=</span>
                  <span className="text-primary">{targetUrl || "https://xxxxx.supabase.co"}</span>
                  {targetUrl && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(`VITE_SUPABASE_URL=${targetUrl}`, "URL")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">VITE_SUPABASE_PUBLISHABLE_KEY=</span>
                  <span className="text-primary">{targetAnonKey ? "eyJ..." : "[anon_key]"}</span>
                  {targetAnonKey && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(`VITE_SUPABASE_PUBLISHABLE_KEY=${targetAnonKey}`, "Anon Key")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {Object.values(checklist).filter(Boolean).length >= 5 && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-200">Migrasi Selesai! 🎉</AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  Selamat! Migrasi database berhasil diselesaikan. Pastikan untuk membackup project baru secara berkala.
                </AlertDescription>
              </Alert>
            )}
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button size="lg" className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
            <Rocket className="h-5 w-5" />
            Mulai Migrasi Project
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Migration Wizard
            </DialogTitle>
            <DialogDescription>
              Panduan langkah demi langkah untuk migrasi dari satu Supabase project ke project lainnya
            </DialogDescription>
          </DialogHeader>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Langkah {currentStep + 1} dari {steps.length}</span>
              <span className="font-medium">{steps[currentStep].title}</span>
            </div>
            <Progress value={progress} className="h-2" />
            
            {/* Step indicators */}
            <div className="flex justify-between">
              {steps.map((step, i) => (
                <div 
                  key={step.id}
                  className={`flex items-center gap-1 text-xs ${
                    i === currentStep ? "text-primary font-medium" : 
                    i < currentStep ? "text-green-600" : "text-muted-foreground"
                  }`}
                >
                  {i < currentStep ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : i === currentStep ? (
                    <div className="h-3 w-3 rounded-full bg-primary" />
                  ) : (
                    <div className="h-3 w-3 rounded-full border border-muted-foreground" />
                  )}
                  <span className="hidden sm:inline">{step.title}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Step Content */}
          <ScrollArea className="flex-1 pr-4">
            <div className="py-4">
              {renderStepContent()}
            </div>
          </ScrollArea>

          <Separator />

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetWizard} className="gap-1">
                <RefreshCw className="h-4 w-4" />
                Reset
              </Button>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={prevStep} 
                disabled={currentStep === 0}
                className="gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Sebelumnya
              </Button>
              <Button 
                onClick={nextStep} 
                disabled={currentStep === steps.length - 1}
                className="gap-1"
              >
                Selanjutnya
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PageGlossarySection preset="settings_migration_wizard" />
    </div>
  );
}
