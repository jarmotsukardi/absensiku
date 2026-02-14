import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DesktopBlockedMessageProps {
  organizationName?: string;
  apkUrl?: string | null;
}

export function DesktopBlockedMessage({ organizationName, apkUrl }: DesktopBlockedMessageProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted/50 to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">Akses Ditolak</CardTitle>
          <CardDescription className="text-base">
            Lakukan absensi di atas Aplikasi Resmi
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <Smartphone className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-sm">Gunakan Aplikasi Android</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Absensi hanya dapat dilakukan melalui aplikasi resmi yang terinstall di perangkat Android Anda.
                </p>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-center">Langkah-langkah:</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Download aplikasi resmi dari halaman organisasi</li>
              <li>Install APK di perangkat Android Anda</li>
              <li>Login menggunakan akun yang sama</li>
              <li>Lakukan absensi melalui aplikasi</li>
            </ol>
          </div>

          {apkUrl && (
            <Button 
              className="w-full" 
              onClick={() => window.open(apkUrl, "_blank")}
            >
              <Download className="h-4 w-4 mr-2" />
              Download APK Resmi
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
