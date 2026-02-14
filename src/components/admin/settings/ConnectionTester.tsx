import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plug,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Database,
  Shield,
  Server,
  AlertTriangle
} from "lucide-react";

interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    version?: string;
    tables?: number;
    hasAuth?: boolean;
    hasStorage?: boolean;
  };
}

export function ConnectionTester() {
  const [targetUrl, setTargetUrl] = useState("");
  const [targetAnonKey, setTargetAnonKey] = useState("");
  const [targetServiceKey, setTargetServiceKey] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const testConnection = async () => {
    if (!targetUrl || !targetAnonKey) {
      toast.error("URL dan Anon Key harus diisi");
      return;
    }

    // Validate URL format
    if (!targetUrl.startsWith("https://") || !targetUrl.includes(".supabase.co")) {
      toast.error("Format URL tidak valid. Contoh: https://xxxxx.supabase.co");
      return;
    }

    setIsLoading(true);
    setTestResult(null);

    try {
      // Test REST API connection
      const response = await fetch(`${targetUrl}/rest/v1/`, {
        headers: {
          "apikey": targetAnonKey,
          "Authorization": `Bearer ${targetAnonKey}`,
        },
      });

      if (response.ok) {
        // Try to get more info about the project
        let details: ConnectionTestResult["details"] = {};

        // Test if we can access tables (this will fail without proper RLS but connection works)
        try {
          const tablesResponse = await fetch(`${targetUrl}/rest/v1/`, {
            method: "OPTIONS",
            headers: {
              "apikey": targetAnonKey,
            },
          });
          if (tablesResponse.ok) {
            details.hasAuth = true;
          }
        } catch {
          // Ignore errors here
        }

        // Test storage
        try {
          const storageResponse = await fetch(`${targetUrl}/storage/v1/bucket`, {
            headers: {
              "apikey": targetAnonKey,
              "Authorization": `Bearer ${targetAnonKey}`,
            },
          });
          details.hasStorage = storageResponse.ok;
        } catch {
          details.hasStorage = false;
        }

        setTestResult({
          success: true,
          message: "Koneksi berhasil! Database target dapat diakses.",
          details
        });
        toast.success("Koneksi ke database target berhasil!");
      } else if (response.status === 401) {
        setTestResult({
          success: false,
          message: "API Key tidak valid atau sudah expired"
        });
        toast.error("API Key tidak valid");
      } else {
        setTestResult({
          success: false,
          message: `Gagal terhubung: HTTP ${response.status}`
        });
        toast.error("Gagal terhubung ke database target");
      }
    } catch (error) {
      console.error("Connection test error:", error);
      setTestResult({
        success: false,
        message: "Tidak dapat terhubung ke server. Periksa URL dan koneksi internet."
      });
      toast.error("Gagal menguji koneksi");
    } finally {
      setIsLoading(false);
    }
  };

  const clearForm = () => {
    setTargetUrl("");
    setTargetAnonKey("");
    setTargetServiceKey("");
    setTestResult(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" />
          Connection Tester
        </CardTitle>
        <CardDescription>
          Test koneksi ke project Supabase target sebelum migrasi
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <Server className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800 dark:text-blue-200">Informasi</AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            Masukkan kredensial project Supabase target untuk menguji koneksi.
            Kredensial dapat ditemukan di Project Settings → API.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target-url">Supabase URL *</Label>
            <Input
              id="target-url"
              placeholder="https://xxxxx.supabase.co"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-anon-key">Anon Key (Publishable) *</Label>
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
            <Label htmlFor="target-service-key">Service Role Key (Optional)</Label>
            <Input
              id="target-service-key"
              type={showKeys ? "text" : "password"}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={targetServiceKey}
              onChange={(e) => setTargetServiceKey(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Service Role Key diperlukan untuk mengakses data dengan bypass RLS
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={testConnection} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            {isLoading ? "Menguji..." : "Test Koneksi"}
          </Button>
          <Button variant="outline" onClick={clearForm}>
            Reset
          </Button>
        </div>

        {/* Test Result */}
        {testResult && (
          <>
            <Separator />
            <Alert
              className={
                testResult.success
                  ? "border-green-500 bg-green-50 dark:bg-green-950"
                  : "border-red-500 bg-red-50 dark:bg-red-950"
              }
            >
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertTitle
                className={
                  testResult.success
                    ? "text-green-800 dark:text-green-200"
                    : "text-red-800 dark:text-red-200"
                }
              >
                {testResult.success ? "Koneksi Berhasil" : "Koneksi Gagal"}
              </AlertTitle>
              <AlertDescription
                className={
                  testResult.success
                    ? "text-green-700 dark:text-green-300"
                    : "text-red-700 dark:text-red-300"
                }
              >
                {testResult.message}
              </AlertDescription>
            </Alert>

            {testResult.success && testResult.details && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <Database className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">REST API</span>
                  <Badge className="ml-auto bg-green-500">Aktif</Badge>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <Shield className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">Auth</span>
                  <Badge className="ml-auto" variant={testResult.details.hasAuth ? "default" : "secondary"}>
                    {testResult.details.hasAuth ? "Aktif" : "N/A"}
                  </Badge>
                </div>
              </div>
            )}
          </>
        )}

        {/* Next Steps */}
        {testResult?.success && (
          <div className="text-sm text-muted-foreground space-y-2 p-3 rounded-lg bg-muted/30">
            <p className="font-medium flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" /> Langkah Selanjutnya:
            </p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Export Schema SQL dari tab Schema</li>
              <li>Jalankan Schema SQL di project target</li>
              <li>Export RLS Policies dan jalankan di project target</li>
              <li>Backup data dan import ke project target</li>
              <li>Update environment variables di Lovable</li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
