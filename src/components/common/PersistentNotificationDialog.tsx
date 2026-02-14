import { useState, useEffect } from "react";
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

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  link?: string;
}

export function PersistentNotificationDialog() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchUnreadNotifications();

    // Setup realtime subscription for new notifications
    const channel = supabase
      .channel('persistent-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          // Add new notification to the queue
          if (payload.new && !payload.new.is_read) {
            setNotifications(prev => [...prev, payload.new as Notification]);
            setIsOpen(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchUnreadNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_read", false)
      .order("created_at", { ascending: true });

    if (!error && data && data.length > 0) {
      setNotifications(data);
      setIsOpen(true);
    }
  };

  const handleAcknowledge = async () => {
    const currentNotification = notifications[currentIndex];
    if (!currentNotification) return;

    // Mark as read
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", currentNotification.id);

    // Move to next notification or close
    if (currentIndex < notifications.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsOpen(false);
      setNotifications([]);
      setCurrentIndex(0);
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
