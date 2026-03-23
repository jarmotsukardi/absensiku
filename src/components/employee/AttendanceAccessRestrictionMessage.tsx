import { AlertTriangle, ArrowLeft, Clock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AttendanceAccessRestrictionMessageProps {
  reason?: string | null;
  scheduleLabel?: string | null;
  reopensAtLabel?: string | null;
  onBack: () => void;
  backLabel?: string;
}

export function AttendanceAccessRestrictionMessage({
  reason,
  scheduleLabel,
  reopensAtLabel,
  onBack,
  backLabel = "Kembali ke Dashboard",
}: AttendanceAccessRestrictionMessageProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-xl border-amber-300/60 bg-amber-50/40">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-xl">Akses Non-Absensi Sementara Dibatasi</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {reason || "Halaman ini ditutup sementara untuk memprioritaskan resource absensi."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-background/80 p-4 text-sm">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-4 w-4 text-primary" />
              <div className="space-y-1">
                <p className="font-medium">Jendela prioritas absensi aktif</p>
                {scheduleLabel ? (
                  <p className="text-muted-foreground">
                    Jadwal kerja hari ini: <strong>{scheduleLabel}</strong>
                  </p>
                ) : null}
                {reopensAtLabel ? (
                  <p className="text-muted-foreground">
                    Akses non-absensi dibuka kembali: <strong>{reopensAtLabel}</strong>
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-100/60 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <p>
                Selama periode ini, gunakan halaman utama dashboard untuk check-in, check-out, dan aktivitas absensi inti.
              </p>
            </div>
          </div>

          <Button className="w-full" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
