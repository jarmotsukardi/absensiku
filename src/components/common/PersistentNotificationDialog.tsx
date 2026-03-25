import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface Notification {
  id: string;
  user_id?: string | null;
  title: string;
  message: string;
  type: string;
  is_read?: boolean;
  created_at: string;
  link?: string;
}

const REALTIME_WARNING_STORAGE_KEY_PREFIX = "employee:persistent_notifications:realtime_warning";
const REALTIME_WARNING_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const showRealtimeWarningWithCooldown = (userId: string | null, cb: () => void) => {
  const key = `${REALTIME_WARNING_STORAGE_KEY_PREFIX}:${userId || "anonymous"}`;
  try {
    const now = Date.now();
    const lastShownRaw = localStorage.getItem(key);
    const lastShownAt = lastShownRaw ? Number(lastShownRaw) : 0;
    if (Number.isFinite(lastShownAt) && now - lastShownAt < REALTIME_WARNING_COOLDOWN_MS) return;

    cb();
    localStorage.setItem(key, String(now));
  } catch {
    cb();
  }
};

const isNetworkFetchFailure = (error: unknown): boolean => {
  const message =
    error instanceof Error
      ? `${error.name || ""} ${error.message || ""}`.toLowerCase()
      : String(error || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed")
  );
};

export function PersistentNotificationDialog() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isRealtimeEnabled, setIsRealtimeEnabled] = useState(
    typeof document === "undefined"
      ? true
      : document.visibilityState === "visible" && (typeof navigator === "undefined" ? true : navigator.onLine)
  );

  const fetchUnreadNotifications = useCallback(async (userId?: string) => {
    let resolvedUserId = userId ?? null;
    try {
      if (!resolvedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        resolvedUserId = user.id;
      }

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", resolvedUserId)
        .eq("is_read", false)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (data && data.length > 0) {
        setNotifications(data);
        setIsOpen(true);
      }
    } catch (error) {
      if (isNetworkFetchFailure(error)) {
        // Skip toast spam for transient network hiccups on background notification polling.
        return;
      }
      const errorRef = reportError(error, "employee.persistent_notifications.fetch_unread", {
        user_id: resolvedUserId,
      });
      toast.error(appendErrorReference("Gagal memuat notifikasi", errorRef));
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const syncRealtimeState = () => {
      setIsRealtimeEnabled(document.visibilityState === "visible" && navigator.onLine);
    };
    syncRealtimeState();
    document.addEventListener("visibilitychange", syncRealtimeState);
    window.addEventListener("online", syncRealtimeState);
    window.addEventListener("offline", syncRealtimeState);
    return () => {
      document.removeEventListener("visibilitychange", syncRealtimeState);
      window.removeEventListener("online", syncRealtimeState);
      window.removeEventListener("offline", syncRealtimeState);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let activeUserId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMounted || !user) return;

      activeUserId = user.id;
      await fetchUnreadNotifications(activeUserId);

      if (!isRealtimeEnabled) return;

      // Setup realtime subscription for new notifications only when tab is visible/online.
      // Keep channel broad and validate recipient in callback for reliability.
      let realtimeErrorCount = 0;
      channel = supabase
        .channel('persistent-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
          },
          (payload) => {
            const next = payload.new as Notification | null;
            if (!next || !activeUserId || next.user_id !== activeUserId || next.is_read) return;

            setNotifications(prev => {
              if (prev.some(item => item.id === next.id)) return prev;
              return [...prev, next];
            });
            setIsOpen(true);
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            realtimeErrorCount = 0;
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (typeof navigator !== "undefined" && !navigator.onLine) return;
            realtimeErrorCount += 1;
            if (realtimeErrorCount < 2) return;

            showRealtimeWarningWithCooldown(activeUserId, () => {
              toast.warning("Realtime notifikasi sedang bermasalah. Notifikasi baru mungkin terlambat muncul.");
            });
          }
        });
    };

    void init();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchUnreadNotifications, isRealtimeEnabled]);

  const handleAcknowledge = async () => {
    const currentNotification = notifications[currentIndex];
    if (!currentNotification) return;

    try {
      // Mark as read
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", currentNotification.id);
      if (error) throw error;

      // Move to next notification or close
      if (currentIndex < notifications.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setIsOpen(false);
        setNotifications([]);
        setCurrentIndex(0);
      }
    } catch (error) {
      const errorRef = reportError(error, "employee.persistent_notifications.acknowledge", {
        notification_id: currentNotification.id,
      });
      toast.error(appendErrorReference("Gagal menandai notifikasi", errorRef));
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="h-6 w-6 text-success" />;
      case "warning":
        return <AlertTriangle className="h-6 w-6 text-warning" />;
      case "error":
        return <AlertCircle className="h-6 w-6 text-destructive" />;
      default:
        return <Info className="h-6 w-6 text-info" />;
    }
  };

  const getTypeBgClass = (type: string) => {
    switch (type) {
      case "success":
        return "bg-success/10 border-success/20";
      case "warning":
        return "bg-warning/10 border-warning/20";
      case "error":
        return "bg-destructive/10 border-destructive/20";
      default:
        return "bg-info/10 border-info/20";
    }
  };

  const currentNotification = notifications[currentIndex];

  if (!currentNotification) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-full ${getTypeBgClass(currentNotification.type)}`}>
              {getTypeIcon(currentNotification.type)}
            </div>
            <div>
              <DialogTitle className="text-lg">{currentNotification.title}</DialogTitle>
              <DialogDescription className="text-xs">
                {format(new Date(currentNotification.created_at), "dd MMMM yyyy, HH:mm", { locale: idLocale })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className={`p-4 rounded-lg border ${getTypeBgClass(currentNotification.type)}`}>
          <p className="text-sm whitespace-pre-wrap">{currentNotification.message}</p>
        </div>

        {notifications.length > 1 && (
          <p className="text-xs text-muted-foreground text-center">
            Notifikasi {currentIndex + 1} dari {notifications.length}
          </p>
        )}

        <DialogFooter>
          <Button onClick={handleAcknowledge} className="w-full">
            <Bell className="h-4 w-4 mr-2" />
            OK, Saya Mengerti
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
