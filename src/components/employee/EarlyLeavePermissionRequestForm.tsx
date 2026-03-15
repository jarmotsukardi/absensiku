import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, LogOut, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  buildEarlyLeavePermissionReason,
  EARLY_LEAVE_PERMISSION_REASON_PREFIX,
  readEarlyLeavePermissionQueue,
  writeEarlyLeavePermissionQueue,
  type EarlyLeavePermissionQueueItem,
} from "@/lib/latePermissionRequest";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface EarlyLeavePermissionRequestFormProps {
  employeeId: string;
  onSuccess?: () => void;
}

const isLikelyOfflineError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lowered = message.toLowerCase();
  return (
    lowered.includes("failed to fetch") ||
    lowered.includes("network") ||
    lowered.includes("offline") ||
    lowered.includes("networkerror") ||
    lowered.includes("load failed")
  );
};

const isDuplicateEarlyLeavePermissionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lowered = message.toLowerCase();
  return lowered.includes("sudah pernah diajukan") || lowered.includes("izin pulang cepat aktif untuk tanggal ini sudah ada");
};

const isTimeFormatValid = (value: string): boolean => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

export function EarlyLeavePermissionRequestForm({ employeeId, onSuccess }: EarlyLeavePermissionRequestFormProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [plannedLeaveTime, setPlannedLeaveTime] = useState("");
  const [reason, setReason] = useState("");
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const resetForm = () => {
    setPlannedLeaveTime("");
    setReason("");
  };

  const submitToServer = useCallback(
    async (payload: Omit<EarlyLeavePermissionQueueItem, "queuedAt">) => {
      const { data: existing, error: checkError } = await supabase
        .from("leave_requests")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("leave_type", "izin")
        .eq("start_date", payload.requestDate)
        .eq("end_date", payload.requestDate)
        .ilike("reason", `${EARLY_LEAVE_PERMISSION_REASON_PREFIX}%`)
        .neq("status", "ditolak")
        .limit(1);

      if (checkError) throw checkError;
      if (existing && existing.length > 0) {
        throw new Error("Permohonan izin pulang cepat untuk tanggal ini sudah pernah diajukan.");
      }

      const { error } = await supabase.from("leave_requests").insert({
        employee_id: employeeId,
        leave_type: "izin",
        start_date: payload.requestDate,
        end_date: payload.requestDate,
        reason: buildEarlyLeavePermissionReason(payload.plannedLeaveTime, payload.reason),
        is_half_day: false,
        status: "menunggu",
      });

      if (error) throw error;
    },
    [employeeId],
  );

  const syncQueuedRequests = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!navigator.onLine) return;

    const queue = readEarlyLeavePermissionQueue(employeeId);
    if (queue.length === 0) return;

    setIsSyncingQueue(true);
    let syncedCount = 0;
    const remaining: EarlyLeavePermissionQueueItem[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      try {
        await submitToServer({
          requestDate: item.requestDate,
          plannedLeaveTime: item.plannedLeaveTime,
          reason: item.reason,
        });
        syncedCount += 1;
      } catch (error: unknown) {
        if (isLikelyOfflineError(error)) {
          remaining.push(item, ...queue.slice(index + 1));
          break;
        }

        if (!isDuplicateEarlyLeavePermissionError(error)) {
          const errorRef = reportError(error, "employee.early_leave_permission.sync_queue_failed", {
            employee_id: employeeId,
            request_date: item.requestDate,
          });
          toast.error(appendErrorReference("Sinkronisasi izin pulang cepat gagal", errorRef));
        }
      }
    }

    writeEarlyLeavePermissionQueue(employeeId, remaining);
    if (syncedCount > 0) {
      toast.success(`${syncedCount} permohonan izin pulang cepat tersinkron ke server`);
      onSuccess?.();
    }
    setIsSyncingQueue(false);
  }, [employeeId, onSuccess, submitToServer]);

  useEffect(() => {
    void syncQueuedRequests();
  }, [syncQueuedRequests]);

  useEffect(() => {
    const handleOnline = () => {
      void syncQueuedRequests();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [syncQueuedRequests]);

  const handleSubmit = async () => {
    const trimmedReason = reason.trim();

    if (!isTimeFormatValid(plannedLeaveTime)) {
      toast.error("Rencana jam pulang wajib format HH:mm");
      return;
    }
    if (trimmedReason.length < 10) {
      toast.error("Alasan minimal 10 karakter");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitToServer({
        requestDate: today,
        plannedLeaveTime,
        reason: trimmedReason,
      });
      toast.success("Permohonan izin pulang cepat berhasil diajukan");
      setOpen(false);
      resetForm();
      onSuccess?.();
    } catch (error: unknown) {
      if (isDuplicateEarlyLeavePermissionError(error)) {
        toast.warning("Permohonan izin pulang cepat untuk tanggal ini sudah ada.");
        return;
      }
      if (!navigator.onLine || isLikelyOfflineError(error)) {
        const queue = readEarlyLeavePermissionQueue(employeeId);
        queue.push({
          requestDate: today,
          plannedLeaveTime,
          reason: trimmedReason,
          queuedAt: new Date().toISOString(),
        });
        writeEarlyLeavePermissionQueue(employeeId, queue);
        toast.info("Jaringan sibuk. Permohonan disimpan di HP dan akan disinkronkan otomatis.");
        setOpen(false);
        resetForm();
        return;
      }

      const errorRef = reportError(error, "employee.early_leave_permission.submit", {
        employee_id: employeeId,
        request_date: today,
      });
      toast.error(appendErrorReference("Gagal mengajukan izin pulang cepat", errorRef));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <LogOut className="h-4 w-4" />
          Ajukan Izin Pulang Cepat
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-primary" />
            Permohonan Izin Pulang Cepat
          </DialogTitle>
          <DialogDescription>
            Ajukan izin pulang sebelum jam kerja selesai. Jika jaringan sibuk, data disimpan dulu di HP lalu dikirim otomatis saat online.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tanggal Pengajuan</Label>
            <Input value={today} readOnly />
            <p className="text-xs text-muted-foreground">Pengajuan izin pulang cepat berlaku untuk hari ini.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="planned-leave-time">Rencana Jam Pulang (HH:mm)</Label>
            <Input
              id="planned-leave-time"
              type="time"
              value={plannedLeaveTime}
              onChange={(event) => setPlannedLeaveTime(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="early-leave-reason">Alasan Pulang Cepat</Label>
            <Textarea
              id="early-leave-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Contoh: Perlu mendampingi keluarga untuk pemeriksaan kesehatan."
              rows={4}
              maxLength={500}
            />
            <div className="text-right text-xs text-muted-foreground">{reason.length}/500</div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
            }}
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mengirim...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Kirim Permohonan
              </>
            )}
          </Button>
        </DialogFooter>

        {isSyncingQueue && (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
            Menyinkronkan data izin pulang cepat yang tersimpan lokal...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
