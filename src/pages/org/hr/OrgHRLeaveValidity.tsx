import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { CalendarClock, AlertTriangle, CalendarCheck2 } from "lucide-react";
import { toast } from "sonner";

type LeaveQuotaValidityRow = {
  id: string;
  employee_name: string;
  employee_nip: string | null;
  leave_type_name: string;
  quota_year: number;
  remaining_days: number;
  valid_from: string | null;
  valid_until: string | null;
  expired_days: number;
};

type LeaveQuotaValidityDbRow = {
  id: string;
  quota_year: number;
  remaining_days: number;
  valid_from: string | null;
  valid_until: string | null;
  expired_days: number;
  employee?: {
    name: string | null;
    nip: string | null;
  } | null;
  leave_type?: {
    leave_name: string | null;
  } | null;
};

const WARNING_WINDOW_DAYS = 30;

export default function OrgHRLeaveValidity() {
  const [rows, setRows] = useState<LeaveQuotaValidityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/leave-validity");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { data, error } = await supabase
        .from("leave_quotas")
        .select(`
          id,
          quota_year,
          remaining_days,
          valid_from,
          valid_until,
          expired_days,
          employee:employee_id (name, nip),
          leave_type:leave_type_id (leave_name)
        `)
        .eq("tenant_id", tenantId)
        .order("valid_until", { ascending: true });

      if (error) throw error;

      const formatted = ((data || []) as LeaveQuotaValidityDbRow[]).map((item) => ({
        id: item.id,
        employee_name: item.employee?.name || "Unknown",
        employee_nip: item.employee?.nip || null,
        leave_type_name: item.leave_type?.leave_name || "Unknown",
        quota_year: item.quota_year,
        remaining_days: item.remaining_days,
        valid_from: item.valid_from,
        valid_until: item.valid_until,
        expired_days: item.expired_days,
      }));

      setRows(formatted);
    } catch (error) {
      const ref = reportError(error, "org.hr.leave-validity.fetch");
      toast.error(appendErrorReference("Gagal memuat masa berlaku cuti", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const summary = useMemo(() => {
    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + WARNING_WINDOW_DAYS);

    const expired = rows.filter((item) => item.valid_until && new Date(item.valid_until) < today).length;
    const expiringSoon = rows.filter((item) => {
      if (!item.valid_until) return false;
      const validUntil = new Date(item.valid_until);
      return validUntil >= today && validUntil <= warningDate;
    }).length;
    const active = rows.length - expired;

    return {
      total: rows.length,
      active,
      expired,
      expiringSoon,
    };
  }, [rows]);

  const decoratedRows = useMemo(() => {
    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + WARNING_WINDOW_DAYS);

    return rows.map((item) => {
      if (!item.valid_until) return { ...item, validityTone: "unknown" as const, validityLabel: "Belum diatur" };
      const validUntil = new Date(item.valid_until);
      if (validUntil < today) return { ...item, validityTone: "expired" as const, validityLabel: "Kedaluwarsa" };
      if (validUntil <= warningDate) return { ...item, validityTone: "warning" as const, validityLabel: "Segera berakhir" };
      return { ...item, validityTone: "active" as const, validityLabel: "Aktif" };
    });
  }, [rows]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Kebijakan HR</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Masa Berlaku Cuti</h1>
          <p className="text-sm text-muted-foreground">
            Pantau kuota cuti yang masih aktif, segera berakhir, atau sudah kedaluwarsa untuk mencegah saldo menggantung.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "monitoring hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Total Kuota" value={summary.total} icon={CalendarClock} description="Semua data masa berlaku cuti" />
          <StatCard title="Masih Aktif" value={summary.active} icon={CalendarCheck2} description="Masih bisa dipakai" />
          <StatCard title="Segera Berakhir" value={summary.expiringSoon} icon={AlertTriangle} description={`Berakhir <= ${WARNING_WINDOW_DAYS} hari`} />
          <StatCard title="Kedaluwarsa" value={summary.expired} icon={AlertTriangle} description="Butuh tindak lanjut kebijakan" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Masa Berlaku Kuota Cuti</CardTitle>
            <CardDescription>Fokus pada validitas kuota dan sisa hari yang masih bisa dipakai pegawai.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : decoratedRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada kuota cuti yang bisa dievaluasi masa berlakunya.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Jenis Cuti</TableHead>
                    <TableHead>Tahun</TableHead>
                    <TableHead>Sisa Hari</TableHead>
                    <TableHead>Valid Sampai</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decoratedRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{item.employee_name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{item.employee_nip || "-"}</div>
                        </div>
                      </TableCell>
                      <TableCell>{item.leave_type_name}</TableCell>
                      <TableCell>{item.quota_year}</TableCell>
                      <TableCell>{item.remaining_days} hari</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.valid_until ? new Date(item.valid_until).toLocaleDateString("id-ID") : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.validityTone === "expired"
                              ? "destructive"
                              : item.validityTone === "warning"
                                ? "secondary"
                                : "default"
                          }
                        >
                          {item.validityLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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
          <Icon className="h-4 w-4 text-amber-600" />
        </div>
      </CardContent>
    </Card>
  );
}
