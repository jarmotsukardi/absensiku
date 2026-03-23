import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  Bell,
  Clock,
  CheckCircle,
  AlertTriangle,
  Download,
  Calendar,
  Settings
} from "lucide-react";

const BACKUP_STORAGE_KEY = "absensiku_last_backup";
const BACKUP_INTERVAL_DAYS = 7;

interface BackupHistory {
  date: string;
  type: "full" | "partial";
  tables?: string[];
}

export function BackupReminderCard({ onBackupClick }: { onBackupClick: () => void }) {
  const [lastBackupDate, setLastBackupDate] = useState<Date | null>(null);
  const [daysSinceBackup, setDaysSinceBackup] = useState<number | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistory[]>([]);

  useEffect(() => {
    loadBackupInfo();
  }, []);

  const loadBackupInfo = () => {
    try {
      const stored = localStorage.getItem(BACKUP_STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.lastBackup) {
          const lastDate = new Date(data.lastBackup);
          setLastBackupDate(lastDate);
          const days = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          setDaysSinceBackup(days);
        }
        if (data.history) {
          setBackupHistory(data.history.slice(0, 5));
        }
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.backup_reminder.load_backup_info");
      toast.error(appendErrorReference("Gagal memuat informasi backup lokal", errorRef));
    }
  };

  const recordBackup = (type: "full" | "partial", tables?: string[]) => {
    const now = new Date();
    const newHistory: BackupHistory = {
      date: now.toISOString(),
      type,
      tables
    };

    try {
      const stored = localStorage.getItem(BACKUP_STORAGE_KEY);
      const data = stored ? JSON.parse(stored) : { history: [] };
      
      data.lastBackup = now.toISOString();
      data.history = [newHistory, ...(data.history || [])].slice(0, 10);
      
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(data));
      
      setLastBackupDate(now);
      setDaysSinceBackup(0);
      setBackupHistory(data.history.slice(0, 5));
      
      toast.success("Backup tercatat!");
    } catch (error) {
      const errorRef = reportError(error, "admin.backup_reminder.record_backup", { type });
      toast.error(appendErrorReference("Gagal mencatat histori backup lokal", errorRef));
    }
  };

  const handleBackupClick = () => {
    onBackupClick();
    recordBackup("full");
  };

  const getStatusColor = () => {
    if (daysSinceBackup === null) return "bg-gray-500";
    if (daysSinceBackup <= 3) return "bg-green-500";
    if (daysSinceBackup <= 7) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getStatusText = () => {
    if (daysSinceBackup === null) return "Belum pernah backup";
    if (daysSinceBackup === 0) return "Backup hari ini";
    if (daysSinceBackup === 1) return "Backup kemarin";
    return `${daysSinceBackup} hari lalu`;
  };

  const needsBackup = daysSinceBackup === null || daysSinceBackup >= BACKUP_INTERVAL_DAYS;

  return (
    <Card className={needsBackup ? "border-yellow-500" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Backup Reminder
        </CardTitle>
        <CardDescription>
          Jadwal dan riwayat backup database
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Alert */}
        {needsBackup && (
          <Alert variant="destructive" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-800 dark:text-yellow-200">Backup Diperlukan</AlertTitle>
            <AlertDescription className="text-yellow-700 dark:text-yellow-300">
              {daysSinceBackup === null 
                ? "Anda belum pernah membuat backup. Segera buat backup untuk keamanan data."
                : `Sudah ${daysSinceBackup} hari sejak backup terakhir. Disarankan backup setiap ${BACKUP_INTERVAL_DAYS} hari.`}
            </AlertDescription>
          </Alert>
        )}

        {/* Status Card */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${getStatusColor()}`} />
            <div>
              <p className="font-medium">Status Backup</p>
              <p className="text-sm text-muted-foreground">{getStatusText()}</p>
            </div>
          </div>
          <Badge variant={needsBackup ? "destructive" : "default"}>
            {needsBackup ? "Perlu Backup" : "Aman"}
          </Badge>
        </div>

        {/* Progress to next recommended backup */}
        {daysSinceBackup !== null && daysSinceBackup < BACKUP_INTERVAL_DAYS && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Waktu hingga backup berikutnya</span>
              <span className="font-medium">{BACKUP_INTERVAL_DAYS - daysSinceBackup} hari</span>
            </div>
            <Progress value={(daysSinceBackup / BACKUP_INTERVAL_DAYS) * 100} className="h-2" />
          </div>
        )}

        {/* Action Button */}
        <Button onClick={handleBackupClick} className="w-full gap-2" size="lg">
          <Download className="h-5 w-5" />
          Buat Backup Sekarang
        </Button>

        <Separator />

        {/* Backup History */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Riwayat Backup
          </h4>
          
          {backupHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada riwayat backup</p>
          ) : (
            <div className="space-y-2">
              {backupHistory.map((backup, index) => (
                <div key={index} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>{new Date(backup.date).toLocaleDateString("id-ID", { 
                      day: "numeric", 
                      month: "short", 
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {backup.type === "full" ? "Full Backup" : "Partial"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="text-xs text-muted-foreground space-y-1 p-3 rounded-lg bg-muted/30">
          <p className="font-medium flex items-center gap-1">
            <Settings className="h-3 w-3" /> Tips Backup:
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Backup minimal sekali seminggu</li>
            <li>Simpan backup di lokasi berbeda (cloud storage)</li>
            <li>Test restore backup secara berkala</li>
            <li>Backup sebelum migrasi atau update besar</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
