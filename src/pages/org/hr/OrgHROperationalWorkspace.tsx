import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

type WorkspaceRoute =
  | "/org/hr/dashboard-notifications"
  | "/org/hr/dashboard-activity"
  | "/org/hr/notifications"
  | "/org/hr/activity-log"
  | "/org/hr/national-holidays"
  | "/org/hr/attendance-recap"
  | "/org/hr/leave-recap";

type RouteConfig = {
  badge: string;
  title: string;
  description: string;
};

type AttendanceRecapRow = {
  employeeName: string;
  hadir: number;
  terlambat: number;
  tidakHadir: number;
  cuti: number;
};

type LeaveRecapRow = {
  employeeName: string;
  pending: number;
  approved: number;
  rejected: number;
};

type NotificationRow = {
  id: string;
  title: string;
  createdAt: string;
  isRead: boolean;
};

type ActivityRow = {
  id: string;
  actionType: string;
  tableName: string;
  actionBy: string;
  createdAt: string;
};

type NationalHolidayRow = {
  id: string;
  name: string;
  date: string;
  year: number;
};

const ROUTE_CONFIG: Record<WorkspaceRoute, RouteConfig> = {
  "/org/hr/dashboard-notifications": {
    badge: "Dashboard HR",
    title: "Notifikasi Sistem",
    description: "Ringkasan notifikasi terbaru untuk operasional HR.",
  },
  "/org/hr/dashboard-activity": {
    badge: "Dashboard HR",
    title: "Aktivitas Terbaru",
    description: "Ringkasan aktivitas penting yang terjadi di modul HR.",
  },
  "/org/hr/notifications": {
    badge: "Pengaturan Sistem",
    title: "Notifikasi HR",
    description: "Pantau notifikasi internal HR agar tindak lanjut lebih cepat.",
  },
  "/org/hr/activity-log": {
    badge: "User & Access",
    title: "Log Aktivitas HR",
    description: "Audit perubahan data yang berkaitan dengan proses HR.",
  },
  "/org/hr/national-holidays": {
    badge: "Kehadiran",
    title: "Hari Libur Nasional",
    description: "Daftar hari libur nasional yang menjadi acuan kalender HR.",
  },
  "/org/hr/attendance-recap": {
    badge: "Kehadiran",
    title: "Rekap Absensi",
    description: "Rekap ringkas status kehadiran pegawai pada tenant aktif.",
  },
  "/org/hr/leave-recap": {
    badge: "Cuti & Izin",
    title: "Rekap Cuti",
    description: "Rekap status permohonan cuti pegawai pada tenant aktif.",
  },
};

function toDateTimeLabel(value: string): string {
  try {
    return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

function toDateLabel(value: string): string {
  try {
    return new Date(value).toLocaleDateString("id-ID", { dateStyle: "medium" });
  } catch {
    return value;
  }
}

export default function OrgHROperationalWorkspace() {
  const location = useLocation();
  const route = (location.pathname as WorkspaceRoute) in ROUTE_CONFIG ? (location.pathname as WorkspaceRoute) : null;
  const config = route ? ROUTE_CONFIG[route] : null;

  const [loading, setLoading] = useState(true);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRecapRow[]>([]);
  const [leaveRows, setLeaveRows] = useState<LeaveRecapRow[]>([]);
  const [notificationRows, setNotificationRows] = useState<NotificationRow[]>([]);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [holidayRows, setHolidayRows] = useState<NationalHolidayRow[]>([]);

  useEffect(() => {
    if (!route) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const tenantId = await resolveOrgTenantId();
        if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

        if (route === "/org/hr/attendance-recap") {
          const { data, error } = await supabase
            .from("v_attendance_records")
            .select("employee_name, status")
            .eq("tenant_id", tenantId)
            .order("date", { ascending: false })
            .limit(500);
          if (error) throw error;

          const map = new Map<string, AttendanceRecapRow>();
          (data || []).forEach((item) => {
            const employeeName = item.employee_name || "Tanpa Nama";
            const row = map.get(employeeName) || {
              employeeName,
              hadir: 0,
              terlambat: 0,
              tidakHadir: 0,
              cuti: 0,
            };
            const normalized = (item.status || "").toLowerCase();
            if (normalized.includes("hadir")) row.hadir += 1;
            else if (normalized.includes("terlambat")) row.terlambat += 1;
            else if (normalized.includes("cuti")) row.cuti += 1;
            else if (normalized.includes("tidak_hadir") || normalized.includes("alpha")) row.tidakHadir += 1;
            map.set(employeeName, row);
          });

          if (!cancelled) {
            setAttendanceRows([...map.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName)).slice(0, 100));
          }
          return;
        }

        if (route === "/org/hr/leave-recap") {
          const { data, error } = await supabase
            .from("leave_requests")
            .select("status, employees(name)")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(500);
          if (error) throw error;

          const map = new Map<string, LeaveRecapRow>();
          (data || []).forEach((item) => {
            const employeeName = (item.employees as { name?: string | null } | null)?.name || "Tanpa Nama";
            const row = map.get(employeeName) || {
              employeeName,
              pending: 0,
              approved: 0,
              rejected: 0,
            };
            const normalized = (item.status || "").toLowerCase();
            if (normalized === "pending") row.pending += 1;
            else if (normalized === "approved") row.approved += 1;
            else if (normalized === "rejected") row.rejected += 1;
            map.set(employeeName, row);
          });

          if (!cancelled) {
            setLeaveRows([...map.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName)).slice(0, 100));
          }
          return;
        }

        if (route === "/org/hr/national-holidays") {
          const currentYear = new Date().getFullYear();
          const { data, error } = await supabase
            .from("national_holidays")
            .select("id, name, date, year")
            .eq("year", currentYear)
            .eq("is_active", true)
            .order("date", { ascending: true });
          if (error) throw error;
          if (!cancelled) {
            setHolidayRows((data || []) as NationalHolidayRow[]);
          }
          return;
        }

        if (route === "/org/hr/notifications" || route === "/org/hr/dashboard-notifications") {
          const { data, error } = await supabase
            .from("notifications")
            .select("id, title, created_at, is_read")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(100);
          if (error) throw error;
          if (!cancelled) {
            setNotificationRows(
              (data || []).map((item) => ({
                id: item.id,
                title: item.title || "(Tanpa Judul)",
                createdAt: item.created_at || "",
                isRead: item.is_read === true,
              })),
            );
          }
          return;
        }

        const { data, error } = await supabase
          .from("audit_logs")
          .select("id, action_type, table_name, created_at, employee_id")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        if (!cancelled) {
          setActivityRows(
            (data || []).map((item) => ({
              id: item.id,
              actionType: item.action_type || "-",
              tableName: item.table_name || "-",
              actionBy: item.employee_id || "-",
              createdAt: item.created_at || "",
            })),
          );
        }
      } catch (error) {
        const ref = reportError(error, "org.hr.operational_workspace.fetch", { pathname: location.pathname });
        toast.error(appendErrorReference("Gagal memuat data operasional HR", ref));
        if (!cancelled) {
          setAttendanceRows([]);
          setLeaveRows([]);
          setNotificationRows([]);
          setActivityRows([]);
          setHolidayRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, route]);

  const summary = useMemo(() => {
    if (route === "/org/hr/attendance-recap") return { one: attendanceRows.length, two: 0, oneLabel: "Pegawai Tercatat", twoLabel: "-" };
    if (route === "/org/hr/leave-recap") return { one: leaveRows.length, two: 0, oneLabel: "Pegawai Tercatat", twoLabel: "-" };
    if (route === "/org/hr/national-holidays") return { one: holidayRows.length, two: 0, oneLabel: "Total Libur Tahun Ini", twoLabel: "-" };
    if (route === "/org/hr/notifications" || route === "/org/hr/dashboard-notifications") {
      return {
        one: notificationRows.length,
        two: notificationRows.filter((item) => !item.isRead).length,
        oneLabel: "Total Notifikasi",
        twoLabel: "Belum Dibaca",
      };
    }
    return {
      one: activityRows.length,
      two: activityRows.filter((item) => item.tableName.startsWith("hr_")).length,
      oneLabel: "Aktivitas Tercatat",
      twoLabel: "Aktivitas Tabel HR",
    };
  }, [activityRows, attendanceRows.length, holidayRows.length, leaveRows.length, notificationRows, route]);

  if (!config) {
    return (
      <OrganizationLayout>
        <div className="space-y-2">
          <Badge variant="outline">HR</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Halaman Operasional Tidak Ditemukan</h1>
          <p className="text-sm text-muted-foreground">Route operasional HR belum terdaftar.</p>
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">{config.badge}</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">{config.title}</h1>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>

        <section className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{summary.oneLabel}</CardDescription>
              <CardTitle className="text-2xl">{loading ? "..." : summary.one}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{summary.twoLabel}</CardDescription>
              <CardTitle className="text-2xl">{loading ? "..." : summary.two}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        {route === "/org/hr/attendance-recap" ? (
          <TableCard
            loading={loading}
            emptyText="Belum ada data rekap absensi."
            headers={["Pegawai", "Hadir", "Terlambat", "Tidak Hadir", "Cuti"]}
            rows={attendanceRows.map((item) => [
              item.employeeName,
              String(item.hadir),
              String(item.terlambat),
              String(item.tidakHadir),
              String(item.cuti),
            ])}
          />
        ) : null}

        {route === "/org/hr/leave-recap" ? (
          <TableCard
            loading={loading}
            emptyText="Belum ada data rekap cuti."
            headers={["Pegawai", "Pending", "Disetujui", "Ditolak"]}
            rows={leaveRows.map((item) => [
              item.employeeName,
              String(item.pending),
              String(item.approved),
              String(item.rejected),
            ])}
          />
        ) : null}

        {route === "/org/hr/national-holidays" ? (
          <TableCard
            loading={loading}
            emptyText="Belum ada data hari libur nasional."
            headers={["Nama Libur", "Tanggal", "Tahun"]}
            rows={holidayRows.map((item) => [item.name, toDateLabel(item.date), String(item.year)])}
          />
        ) : null}

        {route === "/org/hr/notifications" || route === "/org/hr/dashboard-notifications" ? (
          <TableCard
            loading={loading}
            emptyText="Belum ada notifikasi."
            headers={["Judul", "Waktu", "Status"]}
            rows={notificationRows.map((item) => [
              item.title,
              toDateTimeLabel(item.createdAt),
              item.isRead ? "Sudah Dibaca" : "Belum Dibaca",
            ])}
          />
        ) : null}

        {route === "/org/hr/activity-log" || route === "/org/hr/dashboard-activity" ? (
          <TableCard
            loading={loading}
            emptyText="Belum ada log aktivitas."
            headers={["Aksi", "Tabel", "Pelaku", "Waktu"]}
            rows={activityRows.map((item) => [item.actionType, item.tableName, item.actionBy, toDateTimeLabel(item.createdAt)])}
          />
        ) : null}
      </div>
    </OrganizationLayout>
  );
}

function TableCard({
  loading,
  emptyText,
  headers,
  rows,
}: {
  loading: boolean;
  emptyText: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Memuat data...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((head) => (
                  <TableHead key={head}>{head}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={`${row[0]}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={`${rowIndex}-${cellIndex}`}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
