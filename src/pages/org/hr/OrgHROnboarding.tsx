import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgHRContextLink } from "@/components/org/hr/OrgHRContextLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { MailPlus, UserCheck, Users, Clock3 } from "lucide-react";
import { toast } from "sonner";

type InvitationRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  invitation_type: string;
  expires_at: string | null;
  created_at: string;
};

type EmployeeRow = {
  id: string;
  name: string;
  nip: string | null;
  joined_date: string | null;
  employee_category: string | null;
  user_id: string | null;
  is_active: boolean | null;
};

const RECENT_JOIN_DAYS = 30;

function getInvitationStatusLabel(status: string): string {
  if (status === "pending") return "Menunggu";
  if (status === "accepted") return "Diterima";
  if (status === "expired") return "Kedaluwarsa";
  if (status === "cancelled") return "Dibatalkan";
  return status;
}

function getInvitationTypeLabel(type: string): string {
  if (type === "employee") return "Pegawai";
  if (type === "admin") return "Admin";
  if (type === "operator") return "Operator";
  return type;
}

export default function OrgHROnboarding() {
  const [isLoading, setIsLoading] = useState(true);
  const [pendingInvitations, setPendingInvitations] = useState<InvitationRow[]>([]);
  const [recentJoiners, setRecentJoiners] = useState<EmployeeRow[]>([]);
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [readyEmployeeWorkspace, setReadyEmployeeWorkspace] = useState(0);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/onboarding");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const recentJoinCutoff = new Date();
      recentJoinCutoff.setDate(recentJoinCutoff.getDate() - RECENT_JOIN_DAYS);

      const [pendingInvitationRes, employeeSummaryRes, readyWorkspaceRes, recentJoinersRes] = await Promise.all([
        supabase
          .from("employee_invitations")
          .select("id, name, email, status, invitation_type, expires_at, created_at")
          .eq("tenant_id", tenantId)
          .is("archived_at", null)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("is_active", true),
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .not("user_id", "is", null),
        supabase
          .from("employees")
          .select("id, name, nip, joined_date:created_at, employee_category, user_id, is_active")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .gte("created_at", recentJoinCutoff.toISOString())
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      if (pendingInvitationRes.error) throw pendingInvitationRes.error;
      if (employeeSummaryRes.error) throw employeeSummaryRes.error;
      if (readyWorkspaceRes.error) throw readyWorkspaceRes.error;
      if (recentJoinersRes.error) throw recentJoinersRes.error;

      setPendingInvitations((pendingInvitationRes.data || []) as InvitationRow[]);
      setActiveEmployees(employeeSummaryRes.count || 0);
      setReadyEmployeeWorkspace(readyWorkspaceRes.count || 0);
      setRecentJoiners((recentJoinersRes.data || []) as EmployeeRow[]);
    } catch (error) {
      const ref = reportError(error, "org.hr.onboarding.fetch");
      toast.error(appendErrorReference("Gagal memuat data proses masuk pegawai", ref));
      setPendingInvitations([]);
      setRecentJoiners([]);
      setActiveEmployees(0);
      setReadyEmployeeWorkspace(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const summary = useMemo(() => {
    const expiredPending = pendingInvitations.filter((item) => item.expires_at && new Date(item.expires_at) < new Date()).length;
    return {
      pendingInvitations: pendingInvitations.length,
      recentJoiners: recentJoiners.length,
      activeEmployees,
      readyEmployeeWorkspace,
      expiredPending,
    };
  }, [activeEmployees, pendingInvitations, recentJoiners, readyEmployeeWorkspace]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Pegawai</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Proses Masuk Pegawai</h1>
          <p className="text-sm text-muted-foreground">
            Pantau undangan proses masuk dan hasil aktivasi pegawai baru tanpa keluar dari area kerja HR.
          </p>
          <p className="text-xs text-muted-foreground">
            Kemampuan halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Undangan Menunggu" value={summary.pendingInvitations} icon={MailPlus} description="Perlu tindak lanjut proses masuk" />
          <StatCard title="Masuk 30 Hari" value={summary.recentJoiners} icon={UserCheck} description="Pegawai baru yang sudah aktif" />
          <StatCard title="Pegawai Aktif" value={summary.activeEmployees} icon={Users} description="Populasi HR aktif saat ini" />
          <StatCard
            title="Akses Pegawai Siap"
            value={summary.readyEmployeeWorkspace}
            icon={UserCheck}
            description="Pegawai aktif yang sudah terhubung ke akun masuk"
          />
          <StatCard title="Undangan Kedaluwarsa" value={summary.expiredPending} icon={Clock3} description="Perlu diterbitkan ulang" />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Rute Operasional Proses Masuk</CardTitle>
                <CardDescription>
                  Gunakan halaman ini sebagai ringkasan HR. Eksekusi detail tetap berjalan dari undangan pegawai dan data pegawai.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <OrgHRContextLink to="/org/invitations">Buka Undangan Pegawai</OrgHRContextLink>
                </Button>
                <Button asChild size="sm">
                  <OrgHRContextLink to="/org/hr/employees">Buka Data Pegawai</OrgHRContextLink>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <OperationalHint
              title="Undangan Pegawai"
              note="Tempat utama untuk membuat, mengirim ulang, dan menutup undangan proses masuk."
            />
            <OperationalHint
              title="Data Pegawai"
              note="Gunakan untuk verifikasi hasil akhir aktivasi dan memastikan pegawai baru sudah aktif serta siap memakai area kerja pegawai."
            />
            <OperationalHint
              title="Tiket HR"
              note="Gunakan saat proses masuk terganjal dokumen, akses, atau koordinasi lintas unit."
            />
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Undangan Menunggu</CardTitle>
              <CardDescription>Prioritas proses masuk yang belum selesai ditindaklanjuti.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
              ) : pendingInvitations.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Tidak ada undangan menunggu saat ini.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Kedaluwarsa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvitations.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{item.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getInvitationTypeLabel(item.invitation_type)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {getInvitationStatusLabel(item.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.expires_at ? new Date(item.expires_at).toLocaleDateString("id-ID") : "-"}
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
              <CardTitle>Pegawai Baru Aktif</CardTitle>
              <CardDescription>Hasil aktivasi proses masuk dalam 30 hari terakhir.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
              ) : recentJoiners.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Belum ada pegawai baru aktif dalam 30 hari terakhir.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pegawai</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Akses Pegawai</TableHead>
                      <TableHead>Tanggal Masuk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentJoiners.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{item.nip || "-"}</div>
                          </div>
                        </TableCell>
                        <TableCell>{item.employee_category || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={item.user_id ? "default" : "secondary"}>
                            {item.user_id ? "Siap dipakai" : "Belum ditautkan"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.joined_date ? new Date(item.joined_date).toLocaleDateString("id-ID") : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
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
