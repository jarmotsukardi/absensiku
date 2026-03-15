import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, LogOut, ShieldOff } from "lucide-react";

type InactiveEmployeeRecord = {
  id: string;
  name: string;
  tenantName: string | null;
  employeeCategory?: string | null;
};

interface EmployeeInactiveAccessStateProps {
  records: InactiveEmployeeRecord[];
  onLogout: () => Promise<void> | void;
}

export function EmployeeInactiveAccessState({
  records,
  onLogout,
}: EmployeeInactiveAccessStateProps) {
  const primaryRecord = records[0] ?? null;
  const tenantLabel = primaryRecord?.tenantName || "organisasi Anda";

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-2xl space-y-4 pt-8">
        <Card className="border-amber-200 bg-amber-50/70 shadow-none dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <ShieldOff className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl">Akses Pegawai Sedang Nonaktif</CardTitle>
            <CardDescription className="text-base">
              Workspace pegawai untuk {tenantLabel} sedang dibatasi karena status kepegawaian Anda sudah dinonaktifkan
              atau proses offboarding sedang berjalan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-background/80 p-4 dark:border-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-300" />
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Yang terjadi sekarang</p>
                  <p>
                    Akun tetap berhasil login, tetapi akses ke dashboard pegawai, pengajuan, dan layanan ESS dihentikan
                    sampai status pegawai diaktifkan kembali oleh admin organisasi atau HR.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Status yang terdeteksi</p>
              <div className="space-y-2">
                {records.map((record) => (
                  <div
                    key={record.id}
                    className="flex flex-col gap-2 rounded-lg border bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{record.name}</p>
                      <p className="text-muted-foreground">
                        {record.tenantName || "Tanpa organisasi"}
                        {record.employeeCategory ? ` • ${record.employeeCategory}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">Nonaktif</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              Jika status ini tidak sesuai, hubungi admin organisasi atau HR untuk aktivasi ulang akses pegawai.
            </div>

            <Button className="w-full" variant="outline" onClick={() => void onLogout()}>
              <LogOut className="mr-2 h-4 w-4" />
              Keluar dari akun
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
