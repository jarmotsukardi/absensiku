import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, RotateCcw, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { DeviceResetDialog } from "./DeviceResetDialog";

interface EmployeeDeviceInfoProps {
  employeeId: string;
  employeeEmail: string;
  isEnabled: boolean;
  isLoading: boolean;
  currentAndroidId: string | null;
  employeeAndroidId: string | null;
  resetCount: number;
  maxResetCount: number;
  requirePasswordChange: boolean;
  isDeviceValid: boolean;
  isFirstTime: boolean;
  onRefresh: () => void;
}

export function EmployeeDeviceInfo({
  employeeId,
  employeeEmail,
  isEnabled,
  isLoading,
  currentAndroidId,
  employeeAndroidId,
  resetCount,
  maxResetCount,
  requirePasswordChange,
  isDeviceValid,
  isFirstTime,
  onRefresh,
}: EmployeeDeviceInfoProps) {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  if (!isEnabled) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Memuat info perangkat...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const remainingResets = maxResetCount - resetCount;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Perangkat Terdaftar
          </CardTitle>
          <CardDescription>
            Device binding untuk keamanan absensi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Device Status */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              {isFirstTime ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <div>
                    <p className="font-medium text-sm">Belum Terdaftar</p>
                    <p className="text-xs text-muted-foreground">Perangkat akan terdaftar saat absen pertama</p>
                  </div>
                </>
              ) : isDeviceValid ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-sm">Perangkat Terdaftar</p>
                    <p className="text-xs text-muted-foreground font-mono">{employeeAndroidId?.substring(0, 20)}...</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <div>
                    <p className="font-medium text-sm text-destructive">Perangkat Tidak Dikenali</p>
                    <p className="text-xs text-muted-foreground">Reset device untuk mendaftarkan HP baru</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Reset Info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Sisa kesempatan reset:</span>
            <Badge variant={remainingResets <= 1 ? "destructive" : "secondary"}>
              {remainingResets} dari {maxResetCount}
            </Badge>
          </div>

          {/* Reset Button */}
          {!isFirstTime && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setIsResetDialogOpen(true)}
              disabled={remainingResets <= 0}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Device ID
            </Button>
          )}

          {remainingResets <= 0 && (
            <p className="text-xs text-center text-muted-foreground">
              Hubungi admin untuk reset device ID
            </p>
          )}
        </CardContent>
      </Card>

      <DeviceResetDialog
        open={isResetDialogOpen}
        onOpenChange={setIsResetDialogOpen}
        employeeId={employeeId}
        employeeEmail={employeeEmail}
        currentResetCount={resetCount}
        maxResetCount={maxResetCount}
        requirePasswordChange={requirePasswordChange}
        onSuccess={onRefresh}
      />
    </>
  );
}