import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface ReadonlyNotificationsTabProps {
  panelClass: string;
  notificationItems: NotificationItem[];
  onMarkRead: (id: string) => void;
}

export function ReadonlyNotificationsTab({
  panelClass,
  notificationItems,
  onMarkRead,
}: ReadonlyNotificationsTabProps) {
  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Notifikasi</CardTitle>
        <CardDescription>Daftar notifikasi akun Anda</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {notificationItems.length === 0 ? (
          <p className="text-sm text-slate-600">Belum ada notifikasi.</p>
        ) : (
          notificationItems.map((n) => (
            <div key={n.id} className={`rounded-2xl border p-3 transition ${n.is_read ? "border-slate-200/90 bg-white/90" : "border-blue-300 bg-blue-50/70 shadow-sm"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-slate-700">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-500">{format(new Date(n.created_at), "dd MMM yyyy HH:mm", { locale: localeId })}</p>
                </div>
                {!n.is_read ? <Button size="sm" variant="outline" onClick={() => onMarkRead(n.id)}>Tandai</Button> : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
