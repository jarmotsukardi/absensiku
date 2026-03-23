import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { getTenantEmployeeIds, resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { fetchTenantHrEssPolicySettings } from "@/lib/hrEssPolicySettings";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { ClipboardList, Clock3, Home, House, ReceiptText, Timer } from "lucide-react";
import { toast } from "sonner";

type EssRecentRequest = {
  id: string;
  employee_name: string;
  type: string;
  status: string;
  submitted_at: string;
};

type NamedEmployeeRelation = {
  employees?: {
    name: string | null;
  } | null;
  employee?: {
    name: string | null;
  } | null;
};

type LeaveRequestRow = {
  id: string;
  created_at: string;
  status: string | null;
} & NamedEmployeeRelation;

type WfhRequestRow = {
  id: string;
  created_at: string;
  status: string | null;
} & NamedEmployeeRelation;

type OvertimeRequestRow = {
  id: string;
  created_at: string;
  status: string | null;
} & NamedEmployeeRelation;

export default function OrgHRESSRequests() {
  const [isLoading, setIsLoading] = useState(true);
  const [recentRequests, setRecentRequests] = useState<EssRecentRequest[]>([]);
  const [counts, setCounts] = useState({ leavePending: 0, wfhPending: 0, overtimePending: 0, totalPending: 0 });
  const [isDisabledByPolicy, setIsDisabledByPolicy] = useState(false);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/ess/requests");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setIsDisabledByPolicy(false);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      const essPolicy = await fetchTenantHrEssPolicySettings(tenantId);

      if (!essPolicy.enableRequestsOverview) {
        setIsDisabledByPolicy(true);
        setRecentRequests([]);
        setCounts({ leavePending: 0, wfhPending: 0, overtimePending: 0, totalPending: 0 });
        return;
      }

      const employeeIds = await getTenantEmployeeIds(tenantId);
      if (employeeIds.length === 0) {
        setRecentRequests([]);
        setCounts({ leavePending: 0, wfhPending: 0, overtimePending: 0, totalPending: 0 });
        return;
      }

      const [leaveCountRes, wfhCountRes, overtimeCountRes, leaveRecentRes, wfhRecentRes, overtimeRecentRes] = await Promise.all([
        supabase.from("leave_requests").select("id", { count: "exact", head: true }).in("employee_id", employeeIds).eq("status", "menunggu"),
        supabase.from("wfh_requests").select("id", { count: "exact", head: true }).in("employee_id", employeeIds).eq("status", "menunggu"),
        supabase.from("overtime_requests").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "pending"),
        supabase
          .from("leave_requests")
          .select("id, created_at, status, employees!leave_requests_employee_id_fkey(name)")
          .in("employee_id", employeeIds)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("wfh_requests")
          .select("id, created_at, status, employees!wfh_requests_employee_id_fkey(name)")
          .in("employee_id", employeeIds)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("overtime_requests")
          .select("id, created_at, status, employee:employees!overtime_requests_employee_id_fkey(name)")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(4),
      ]);

      if (leaveCountRes.error) throw leaveCountRes.error;
      if (wfhCountRes.error) throw wfhCountRes.error;
      if (overtimeCountRes.error) throw overtimeCountRes.error;
      if (leaveRecentRes.error) throw leaveRecentRes.error;
      if (wfhRecentRes.error) throw wfhRecentRes.error;
      if (overtimeRecentRes.error) throw overtimeRecentRes.error;

      const mergedRows: EssRecentRequest[] = [
        ...((leaveRecentRes.data || []) as LeaveRequestRow[]).map((item) => ({
          id: item.id,
          employee_name: item.employees?.name || "Unknown",
          type: "Cuti/Izin",
          status: item.status || "-",
          submitted_at: item.created_at,
        })),
        ...((wfhRecentRes.data || []) as WfhRequestRow[]).map((item) => ({
          id: item.id,
          employee_name: item.employees?.name || "Unknown",
          type: "WFH/Fleksibel",
          status: item.status || "-",
          submitted_at: item.created_at,
        })),
        ...((overtimeRecentRes.data || []) as OvertimeRequestRow[]).map((item) => ({
          id: item.id,
          employee_name: item.employee?.name || "Unknown",
          type: "Lembur",
          status: item.status || "-",
          submitted_at: item.created_at,
        })),
      ]
        .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
        .slice(0, 8);

      const leavePending = leaveCountRes.count || 0;
      const wfhPending = wfhCountRes.count || 0;
      const overtimePending = overtimeCountRes.count || 0;

      setCounts({
        leavePending,
        wfhPending,
        overtimePending,
        totalPending: leavePending + wfhPending + overtimePending,
      });
      setRecentRequests(mergedRows);
    } catch (error) {
      const ref = reportError(error, "org.hr.ess.requests.fetch");
      toast.error(appendErrorReference("Gagal memuat ringkasan ESS", ref));
      setRecentRequests([]);
      setCounts({ leavePending: 0, wfhPending: 0, overtimePending: 0, totalPending: 0 });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const cards = useMemo(
    () => [
      { title: "Menunggu ESS", value: counts.totalPending, icon: ClipboardList, description: "Seluruh pengajuan mandiri yang belum selesai" },
      { title: "Cuti & Izin", value: counts.leavePending, icon: ReceiptText, description: "Pengajuan cuti/izin menunggu" },
      { title: "WFH/Fleksibel", value: counts.wfhPending, icon: House, description: "Pengajuan WFH menunggu" },
      { title: "Lembur", value: counts.overtimePending, icon: Clock3, description: "Pengajuan lembur menunggu" },
    ],
    [counts],
  );

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">ESS</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Pengajuan ESS</h1>
          <p className="text-sm text-muted-foreground">
            Pantau volume dan status pengajuan self-service pegawai tanpa keluar dari workspace HR.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "monitoring hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {cards.map((item) => (
            <StatCard key={item.title} title={item.title} value={item.value} icon={item.icon} description={item.description} />
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Rute Operasional ESS</CardTitle>
                <CardDescription>
                  ESS di workspace HR dipakai untuk monitoring admin. Eksekusi detail pengajuan tetap terjadi di modul cuti, WFH, dan lembur.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <OrgHRContextLink to="/org/hr/ess/leave-requests">Buka Cuti & Izin ESS</OrgHRContextLink>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <OrgHRContextLink to="/org/hr/ess/wfh-requests">Buka Persetujuan WFH</OrgHRContextLink>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <OrgHRContextLink to="/org/hr/ess/flexible-attendance">Buka Absensi Khusus</OrgHRContextLink>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <OrgHRContextLink to="/org/hr/ess/overtime-requests">Buka Persetujuan Lembur</OrgHRContextLink>
                </Button>
                <Button asChild size="sm">
                  <OrgHRContextLink to="/org/hr/mutation-approval">Buka Persetujuan Mutasi</OrgHRContextLink>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <OperationalHint title="Cuti & Izin" note="Gunakan untuk persetujuan cuti/izin dan monitoring SLA pengajuan personal." />
            <OperationalHint title="WFH/Fleksibel" note="Gunakan modul WFH/fleksibel bila perlu menindaklanjuti pengajuan kehadiran non-standar." />
            <OperationalHint title="Lembur" note="Gunakan modul lembur untuk persetujuan dan pemeriksaan alasan lembur pegawai." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pengajuan Terbaru</CardTitle>
            <CardDescription>Gabungan pengajuan terbaru dari cuti/izin, WFH/fleksibel, dan lembur.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : isDisabledByPolicy ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
                Ringkasan pengajuan ESS sedang dinonaktifkan pada baseline tenant ini. Hubungi admin HR bila akses perlu dibuka kembali.
              </div>
            ) : recentRequests.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada pengajuan ESS yang tercatat.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Diajukan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRequests.map((item) => (
                    <TableRow key={`${item.type}-${item.id}`}>
                      <TableCell>{item.employee_name}</TableCell>
                      <TableCell>{item.type}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(item.submitted_at).toLocaleString("id-ID")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
          <CardTitle>Persetujuan HR Lintas Kanal</CardTitle>
          <CardDescription>
              Gunakan rute berikut untuk menyelesaikan persetujuan pengajuan pegawai dari kanal yang sama, tetapi tetap dari konteks workspace HR.
          </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ApprovalSurfaceCard
              title="WFH Pegawai"
              note="Masuk ke antrian WFH organisasi lewat pintu HR yang sama."
              path="/org/hr/ess/wfh-requests"
              icon={Home}
            />
            <ApprovalSurfaceCard
              title="Absensi Khusus"
              note="Tindaklanjuti permohonan absensi fleksibel tanpa keluar dari workspace HR."
              path="/org/hr/ess/flexible-attendance"
              icon={House}
            />
            <ApprovalSurfaceCard
              title="Lembur Pegawai"
              note="Tinjau dan putuskan pengajuan lembur dari jalur HR."
              path="/org/hr/ess/overtime-requests"
              icon={Timer}
            />
            <ApprovalSurfaceCard
              title="Persetujuan Mutasi"
              note="Lanjutkan persetujuan mutasi atau perubahan data pegawai dari HR."
              path="/org/hr/mutation-approval"
              icon={ClipboardList}
            />
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          <Icon className="h-4 w-4 text-sky-600" />
        </div>
      </CardContent>
    </Card>
  );
}

function OperationalHint({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

function ApprovalSurfaceCard({
  title,
  note,
  path,
  icon: Icon,
}: {
  title: string;
  note: string;
  path: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" />
        <span>{title}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
      <Button asChild variant="ghost" size="sm" className="mt-3 px-0">
        <OrgHRContextLink to={path}>Buka route</OrgHRContextLink>
      </Button>
    </div>
  );
}
