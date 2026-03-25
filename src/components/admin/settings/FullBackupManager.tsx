import { useState } from "react";

import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  AlertTriangle,
  CheckCircle,
  Database,
  Download,
  HardDrive,
  Info,
  Loader2,
  Package,
  Shield,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface BackupStats {
  filename: string;
  size: string;
  generatedAt: string;
  source: string;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

function getFilenameFromDisposition(header: string | null) {
  if (!header) return "";
  const match = header.match(/filename="([^"]+)"/i);
  return match?.[1] || "";
}

async function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function FullBackupManager() {
  const [isExporting, setIsExporting] = useState(false);
  const [lastBackup, setLastBackup] = useState<BackupStats | null>(null);

  const exportFullBackup = async () => {
    setIsExporting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;
      if (!accessToken) {
        toast.error("Sesi login super admin tidak tersedia. Login ulang lalu coba lagi.");
        return;
      }

      const response = await fetch("/api/admin/full-backup", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        let message = "Gagal membuat backup database penuh";
        try {
          const payload = await response.json();
          message = String(payload.error || message);
        } catch {
          // ignore malformed error payload
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const filename =
        getFilenameFromDisposition(response.headers.get("content-disposition")) ||
        `absensiku_full_database_${new Date().toISOString().split("T")[0]}.sql`;

      await downloadBlob(filename, blob);

      setLastBackup({
        filename,
        size: formatBytes(blob.size),
        generatedAt:
          response.headers.get("x-backup-generated-at") || new Date().toISOString(),
        source: response.headers.get("x-backup-source") || "unknown",
      });

      toast.success("Backup database penuh berhasil diunduh");
    } catch (error) {
      const errorRef = reportError(error, "admin.settings.full_backup.export_server_side");
      toast.error(appendErrorReference("Gagal mengunduh backup database penuh", errorRef));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Backup Database Penuh
          </CardTitle>
          <CardDescription>
            Jalankan dump database penuh dari jalur server-side dan unduh satu file SQL gabungan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800 dark:text-blue-200">Isi Backup</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              File SQL ini mencakup:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li><strong>schema</strong>: struktur database live termasuk schema `auth`, `public`, `storage`, function, trigger, dan policy</li>
                <li><strong>data</strong>: seluruh data database live termasuk `auth.users` dan metadata storage</li>
                <li><strong>restore-ready</strong>: satu file SQL logical dump yang bisa di-apply ulang via `psql`</li>
              </ul>
            </AlertDescription>
          </Alert>

          <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">Batas Cakupan</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              Tombol ini mem-backup <strong>database</strong> secara penuh. Objek file di Storage dan source Edge Functions tetap perlu backup terpisah.
            </AlertDescription>
          </Alert>

          <Button onClick={exportFullBackup} disabled={isExporting} size="lg" className="w-full gap-2">
            {isExporting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Membuat dump database penuh...
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download Backup Database Penuh
              </>
            )}
          </Button>

          {lastBackup && (
            <div className="flex items-start gap-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
              <CheckCircle className="mt-0.5 h-5 w-5 text-green-600" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-green-800 dark:text-green-200">
                  Backup terakhir berhasil diunduh
                </p>
                <p className="text-green-700 dark:text-green-300">
                  {lastBackup.filename} • {lastBackup.size}
                </p>
                <p className="text-green-700 dark:text-green-300">
                  Generated: {lastBackup.generatedAt} • Source: {lastBackup.source}
                </p>
              </div>
            </div>
          )}

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h4 className="mb-3 flex items-center gap-2 font-medium">
                <Database className="h-4 w-4" />
                Prasyarat Runtime
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• hanya bisa dijalankan oleh user dengan role <code>super_admin</code></li>
                <li>• runtime harus punya binary <code>pg_dump</code></li>
                <li>• jalur stabil: sediakan <code>SUPABASE_DB_URL</code>, <code>SUPABASE_DB_DIRECT_URL</code>, atau minimal <code>SUPABASE_DB_PASSWORD</code> jika project ref sudah ada</li>
                <li>• tanpa kredensial DB langsung, backup memakai project linked Supabase CLI dan butuh akses internet ke API Supabase</li>
                <li>• Vercel serverless standar biasanya tidak menyediakan binary dump; jalankan dari localhost atau worker Node khusus backup</li>
              </ul>
            </div>

            <div className="rounded-lg border p-4">
              <h4 className="mb-3 flex items-center gap-2 font-medium">
                <Shield className="h-4 w-4" />
                Restore Utama
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• restore dengan <code>psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f backup.sql</code></li>
                <li>• lakukan uji restore berkala di project terpisah</li>
                <li>• simpan file hasil backup di lokasi terenkripsi</li>
              </ul>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <Database className="h-4 w-4" />
                Cakupan DB
              </div>
              <p className="text-sm text-muted-foreground">
                Schema, data, auth tables, storage metadata, RLS policies, DB function, dan trigger live.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <HardDrive className="h-4 w-4" />
                Storage Objects
              </div>
              <p className="text-sm text-muted-foreground">
                Tidak ikut dalam file SQL ini. File bucket harus dibackup terpisah.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <Zap className="h-4 w-4" />
                Edge Functions
              </div>
              <p className="text-sm text-muted-foreground">
                Source dan secret Edge Functions tetap perlu export/arsip terpisah.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <PageGlossarySection preset="settings_full_backup" />
    </div>
  );
}
