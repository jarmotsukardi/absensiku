import { useCallback, useEffect, useState } from "react";
import { addDays, format, isAfter, isBefore, startOfDay } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Clock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  buildLatePermissionReason,
  LATE_PERMISSION_REASON_PREFIX,
  readLatePermissionQueue,
  writeLatePermissionQueue,
  type LatePermissionQueueItem,
} from "@/lib/latePermissionRequest";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface LatePermissionRequestFormProps {
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

const isDuplicateLatePermissionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lowered = message.toLowerCase();
  return lowered.includes("sudah pernah diajukan") || lowered.includes("izin terlambat aktif untuk tanggal ini sudah ada");
};

const isTimeFormatValid = (value: string): boolean => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

export function LatePermissionRequestForm({ employeeId, onSuccess }: LatePermissionRequestFormProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [requestDate, setRequestDate] = useState<Date>(startOfDay(new Date()));
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState("");
  const [reason, setReason] = useState("");

  const today = startOfDay(new Date());
  const minDate = addDays(today, -1);

  const resetForm = () => {
    setRequestDate(startOfDay(new Date()));
    setEstimatedArrivalTime("");
    setReason("");
  };

  const submitToServer = useCallback(
    async (payload: Omit<LatePermissionQueueItem, "queuedAt">) => {
      const { data: existing, error: checkError } = await supabase
        .from("leave_requests")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("leave_type", "izin")
        .eq("start_date", payload.requestDate)
        .eq("end_date", payload.requestDate)
        .ilike("reason", `${LATE_PERMISSION_REASON_PREFIX}%`)
        .neq("status", "ditolak")
        .limit(1);

      if (checkError) throw checkError;
      if (existing && existing.length > 0) {
        throw new Error("Permohonan izin terlambat untuk tanggal ini sudah pernah diajukan.");
      }

      const { error } = await supabase.from("leave_requests").insert({
        employee_id: employeeId,
        leave_type: "izin",
        start_date: payload.requestDate,
        end_date: payload.requestDate,
        reason: buildLatePermissionReason(payload.estimatedArrivalTime, payload.reason),
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

    const queue = readLatePermissionQueue(employeeId);
    if (queue.length === 0) return;

    setIsSyncingQueue(true);
    let syncedCount = 0;
    const remaining: LatePermissionQueueItem[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      try {
        await submitToServer({
          requestDate: item.requestDate,
          estimatedArrivalTime: item.estimatedArrivalTime,
          reason: item.reason,
        });
        syncedCount += 1;
      } catch (error: unknown) {
        if (isLikelyOfflineError(error)) {
          remaining.push(item, ...queue.slice(index + 1));
          break;
        }

        if (!isDuplicateLatePermissionError(error)) {
          const errorRef = reportError(error, "employee.late_permission.sync_queue_failed", {
            employee_id: employeeId,
            request_date: item.requestDate,
          });
          toast.error(appendErrorReference("Sinkronisasi izin terlambat gagal", errorRef));
        }
      }
    }

    writeLatePermissionQueue(employeeId, remaining);
    if (syncedCount > 0) {
      toast.success(`${syncedCount} permohonan izin terlambat tersinkron ke server`);
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
    const normalizedRequestDate = startOfDay(requestDate);
    const requestDateString = format(normalizedRequestDate, "yyyy-MM-dd");
    const submitToday = startOfDay(new Date());
    const submitMinDate = addDays(submitToday, -1);

    if (!isTimeFormatValid(estimatedArrivalTime)) {
      toast.error("Estimasi jam tiba wajib format HH:mm");
      return;
    }
    if (trimmedReason.length < 10) {
      toast.error("Alasan minimal 10 karakter");
      return;
    }
    if (isAfter(normalizedRequestDate, submitToday) || isBefore(normalizedRequestDate, submitMinDate)) {
      toast.error("Tanggal izin terlambat hanya boleh hari ini atau kemarin");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitToServer({
        requestDate: requestDateString,
        estimatedArrivalTime,
        reason: trimmedReason,
      });
      toast.success("Permohonan izin terlambat berhasil diajukan");
      setOpen(false);
      resetForm();
      onSuccess?.();
    } catch (error: unknown) {
      if (isDuplicateLatePermissionError(error)) {
        toast.warning("Permohonan izin terlambat untuk tanggal ini sudah ada.");
        return;
      }
      if (!navigator.onLine || isLikelyOfflineError(error)) {
        const queue = readLatePermissionQueue(employeeId);
        queue.push({
          requestDate: requestDateString,
          estimatedArrivalTime,
          reason: trimmedReason,
          queuedAt: new Date().toISOString(),
        });
        writeLatePermissionQueue(employeeId, queue);
        toast.info("Jaringan sibuk. Permohonan disimpan di HP dan akan disinkronkan otomatis.");
        setOpen(false);
        resetForm();
        return;
      }

      const errorRef = reportError(error, "employee.late_permission.submit", {
        employee_id: employeeId,
        request_date: requestDateString,
      });
      toast.error(appendErrorReference("Gagal mengajukan izin terlambat", errorRef));
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
          <Clock className="h-4 w-4" />
          Ajukan Izin Terlambat
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Permohonan Izin Terlambat
          </DialogTitle>
          <DialogDescription>
            Isi data keterlambatan. Jika jaringan sibuk, data disimpan dulu di HP lalu dikirim otomatis saat online.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tanggal Keterlambatan</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  {format(requestDate, "EEEE, dd MMM yyyy", { locale: localeId })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={requestDate}
                  onSelect={(value) => {
                    if (value) setRequestDate(startOfDay(value));
                  }}
                  disabled={(date) => isAfter(startOfDay(date), today) || isBefore(startOfDay(date), minDate)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">Batas pengajuan: hari ini atau kemarin.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimated-arrival-time">Estimasi Jam Tiba (HH:mm)</Label>
            <Input
              id="estimated-arrival-time"
              type="time"
              value={estimatedArrivalTime}
              onChange={(event) => setEstimatedArrivalTime(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="late-reason">Alasan Keterlambatan</Label>
            <Textarea
              id="late-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Contoh: Terjebak kemacetan di jalan utama karena kecelakaan."
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
            Menyinkronkan data izin terlambat yang tersimpan lokal...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
