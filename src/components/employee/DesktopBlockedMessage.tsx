import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APK_DOWNLOAD_PAGE_PATH } from "@/lib/apkDownload";

interface DesktopBlockedMessageProps {
  organizationName?: string;
  downloadPagePath?: string | null;
  reason?: string | null;
}

export function DesktopBlockedMessage({
  organizationName,
  downloadPagePath = APK_DOWNLOAD_PAGE_PATH,
  reason,
}: DesktopBlockedMessageProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted/50 to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">Akses Ditolak</CardTitle>
          <CardDescription className="text-base">
            {reason || "Lakukan absensi melalui aplikasi mobile internal"}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <Smartphone className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-sm">Gunakan Aplikasi Android</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Absensi hanya dapat dilakukan melalui WebView aplikasi internal. Jika diizinkan organisasi, Safari iPhone dapat digunakan.
                </p>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-center">Langkah-langkah:</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Unduh aplikasi melalui tautan resmi organisasi</li>
              <li>Lakukan instalasi aplikasi pada perangkat Android sesuai SOP instansi</li>
              <li>Login menggunakan akun yang sama</li>
              <li>Lakukan absensi melalui aplikasi</li>
            </ol>
          </div>

          {downloadPagePath && (
            <Button 
              className="w-full" 
              onClick={() => window.open(downloadPagePath, "_blank")}
            >
              <Download className="h-4 w-4 mr-2" />
              Buka Halaman Download
            </Button>
          )}

          <p className="text-xs text-center text-muted-foreground">
            {organizationName || "Sistem Absensi"} - Keamanan adalah prioritas kami
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
