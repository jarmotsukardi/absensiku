import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadonlyAttendanceNotice } from "@/components/dashboard/ReadonlyAttendanceNotice";

interface AttendanceItem {
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string | null;
}

interface HomeNews {
  id: string;
  title: string;
  created_at: string;
  source: "news" | "article";
}

interface ReadonlyHomeTabProps {
  todayAttendance: AttendanceItem | null;
  pendingRequests: number;
  unreadCount: number;
  newsItems: HomeNews[];
  panelClass: string;
  compactStatCardClass: string;
  onOpenRequests: () => void;
  onOpenNotifications: () => void;
}

export function ReadonlyHomeTab({
  todayAttendance,
  pendingRequests,
  unreadCount,
  newsItems,
  panelClass,
  compactStatCardClass,
  onOpenRequests,
  onOpenNotifications,
}: ReadonlyHomeTabProps) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={compactStatCardClass}>
          <CardHeader className="pb-2">
            <CardDescription>Status Hari Ini</CardDescription>
            <CardTitle className="text-base">{todayAttendance?.status || "Belum ada data"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            <p>Masuk: {todayAttendance?.check_in_time || "-"}</p>
            <p>Pulang: {todayAttendance?.check_out_time || "-"}</p>
          </CardContent>
        </Card>
        <Card className={compactStatCardClass}>
          <CardHeader className="pb-2">
            <CardDescription>Pengajuan Pending</CardDescription>
            <CardTitle className="text-2xl">{pendingRequests}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" className="hover:border-blue-300 hover:bg-blue-50" onClick={onOpenRequests}>
              Lihat Pengajuan
            </Button>
          </CardContent>
        </Card>
        <Card className={compactStatCardClass}>
          <CardHeader className="pb-2">
            <CardDescription>Notifikasi Belum Dibaca</CardDescription>
            <CardTitle className="text-2xl">{unreadCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" className="hover:border-blue-300 hover:bg-blue-50" onClick={onOpenNotifications}>
              Buka Notifikasi
            </Button>
          </CardContent>
        </Card>
        <Card className={compactStatCardClass}>
          <CardHeader className="pb-2">
            <CardDescription>Akses Absensi</CardDescription>
            <CardTitle className="text-base">Aplikasi Mobile</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            <ReadonlyAttendanceNotice compact />
          </CardContent>
        </Card>
      </div>

      <Card className={panelClass}>
        <CardHeader>
          <CardTitle className="text-lg">Update Terbaru</CardTitle>
          <CardDescription>Berita, artikel, dan pengumuman terbaru</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {newsItems.length === 0 ? (
            <p className="text-sm text-slate-600">Belum ada update terbaru.</p>
          ) : (
            newsItems.map((n) => (
              <div key={`${n.source}-${n.id}`} className="flex items-start justify-between rounded-2xl border border-slate-200/90 bg-white/90 p-3 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50">
                <div>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-xs text-slate-500">{format(new Date(n.created_at), "dd MMM yyyy HH:mm", { locale: localeId })}</p>
                </div>
                <Badge variant="outline">{n.source === "news" ? "Berita" : "Artikel"}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
