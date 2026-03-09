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
  | "/org/hr/document-templates"
  | "/org/hr/warning-letters"
  | "/org/hr/contract-templates"
  | "/org/hr/digital-signature"
  | "/org/hr/users"
  | "/org/hr/roles"
  | "/org/hr/permissions"
  | "/org/hr/approval-hierarchy"
  | "/org/hr/general-settings"
  | "/org/hr/branding"
  | "/org/hr/import-export"
  | "/org/hr/backup";

type RouteConfig = {
  badge: string;
  title: string;
  description: string;
};

const ROUTE_CONFIG: Record<WorkspaceRoute, RouteConfig> = {
  "/org/hr/document-templates": {
    badge: "Dokumen & Legal",
    title: "Template Dokumen",
    description: "Ringkasan dokumen kerja HR yang digunakan tenant.",
  },
  "/org/hr/warning-letters": {
    badge: "Dokumen & Legal",
    title: "Surat Peringatan",
    description: "Kontrol administratif surat peringatan pegawai.",
  },
  "/org/hr/contract-templates": {
    badge: "Dokumen & Legal",
    title: "Kontrak Template",
    description: "Baseline kontrak dan referensi status kontrak pegawai.",
  },
  "/org/hr/digital-signature": {
    badge: "Dokumen & Legal",
    title: "Digital Signature",
    description: "Kesiapan tanda tangan digital dalam alur dokumen HR.",
  },
  "/org/hr/users": {
    badge: "User & Access",
    title: "Manajemen Pengguna",
    description: "Daftar pengguna HR berdasarkan data pegawai tenant.",
  },
  "/org/hr/roles": {
    badge: "User & Access",
    title: "Manajemen Peran",
    description: "Distribusi role pengguna pada tenant HR.",
  },
  "/org/hr/permissions": {
    badge: "User & Access",
    title: "Pengaturan Izin",
    description: "Ringkasan role sebagai basis permission HR.",
  },
  "/org/hr/approval-hierarchy": {
    badge: "User & Access",
    title: "Hierarki Persetujuan",
    description: "Relasi atasan-bawahan untuk alur persetujuan.",
  },
  "/org/hr/general-settings": {
    badge: "Pengaturan Sistem",
    title: "Pengaturan Umum",
    description: "Parameter organisasi yang memengaruhi operasi HR.",
  },
  "/org/hr/branding": {
    badge: "Pengaturan Sistem",
    title: "Branding",
    description: "Identitas tenant yang ditampilkan pada modul HR.",
  },
  "/org/hr/import-export": {
    badge: "Pengaturan Sistem",
    title: "Impor dan Ekspor Data",
    description: "Audit aktivitas impor/ekspor data HR.",
  },
  "/org/hr/backup": {
    badge: "Pengaturan Sistem",
    title: "Backup",
    description: "Ringkasan aktivitas backup operasional organisasi.",
  },
};

type RoleCount = { role: string; total: number };
type UserRow = { name: string; email: string; status: string; userId: string };
type ActivityLite = { action: string; tableName: string; createdAt: string };

export default function OrgHRGovernanceWorkspace() {
  const location = useLocation();
  const route = (location.pathname as WorkspaceRoute) in ROUTE_CONFIG ? (location.pathname as WorkspaceRoute) : null;
  const config = route ? ROUTE_CONFIG[route] : null;

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleCount[]>([]);
  const [approvalLinkedEmployees, setApprovalLinkedEmployees] = useState(0);
  const [organizationSettingCount, setOrganizationSettingCount] = useState(0);
  const [systemSettingCount, setSystemSettingCount] = useState(0);
  const [brandingReady, setBrandingReady] = useState(false);
  const [contractCount, setContractCount] = useState(0);
  const [warningRuleCount, setWarningRuleCount] = useState(0);
  const [auditActivities, setAuditActivities] = useState<ActivityLite[]>([]);

  useEffect(() => {
    if (!route) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const tenantId = await resolveOrgTenantId();
        if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

        const [
          employeeRes,
          roleRes,
          approvalRes,
          orgSettingRes,
          systemSettingRes,
          tenantRes,
          contractRes,
          warningRes,
          auditRes,
        ] = await Promise.all([
          supabase
            .from("employees")
            .select("name, email, is_active, user_id")
            .eq("tenant_id", tenantId)
            .order("name", { ascending: true })
            .limit(200),
          supabase.from("user_roles").select("role").eq("tenant_id", tenantId),
          supabase.from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).not("supervisor_id", "is", null),
          supabase.from("organization_settings").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase.from("system_settings").select("id", { count: "exact", head: true }),
          supabase.from("tenants").select("name, logo_url").eq("id", tenantId).maybeSingle(),
          supabase.from("hr_contracts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase.from("absence_limits").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase
            .from("audit_logs")
            .select("action_type, table_name, created_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);

        if (employeeRes.error) throw employeeRes.error;
        if (roleRes.error) throw roleRes.error;
        if (approvalRes.error) throw approvalRes.error;
        if (orgSettingRes.error) throw orgSettingRes.error;
        if (systemSettingRes.error) throw systemSettingRes.error;
        if (tenantRes.error) throw tenantRes.error;
        if (contractRes.error) throw contractRes.error;
        if (warningRes.error) throw warningRes.error;
        if (auditRes.error) throw auditRes.error;

        const roleMap = new Map<string, number>();
        (roleRes.data || []).forEach((item) => {
          const role = String(item.role || "-");
          roleMap.set(role, (roleMap.get(role) || 0) + 1);
        });

        if (!cancelled) {
          setUsers(
            (employeeRes.data || []).map((item) => ({
              name: item.name || "Tanpa Nama",
              email: item.email || "-",
              status: item.is_active === false ? "Nonaktif" : "Aktif",
              userId: item.user_id || "-",
            })),
          );
          setRoles([...roleMap.entries()].map(([role, total]) => ({ role, total })).sort((a, b) => b.total - a.total));
          setApprovalLinkedEmployees(approvalRes.count || 0);
          setOrganizationSettingCount(orgSettingRes.count || 0);
          setSystemSettingCount(systemSettingRes.count || 0);
          setBrandingReady(Boolean(tenantRes.data?.logo_url));
          setContractCount(contractRes.count || 0);
          setWarningRuleCount(warningRes.count || 0);
          setAuditActivities(
            (auditRes.data || []).map((item) => ({
              action: item.action_type || "-",
              tableName: item.table_name || "-",
              createdAt: item.created_at || "-",
            })),
          );
        }
      } catch (error) {
        const ref = reportError(error, "org.hr.governance_workspace.fetch", { pathname: location.pathname });
        toast.error(appendErrorReference("Gagal memuat data governance HR", ref));
        if (!cancelled) {
          setUsers([]);
          setRoles([]);
          setApprovalLinkedEmployees(0);
          setOrganizationSettingCount(0);
          setSystemSettingCount(0);
          setBrandingReady(false);
          setContractCount(0);
          setWarningRuleCount(0);
          setAuditActivities([]);
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
    if (route === "/org/hr/users") return { a: users.length, b: users.filter((item) => item.status === "Aktif").length, aLabel: "Total Pengguna", bLabel: "Pengguna Aktif" };
    if (route === "/org/hr/roles" || route === "/org/hr/permissions") return { a: roles.length, b: roles.reduce((acc, item) => acc + item.total, 0), aLabel: "Jenis Role", bLabel: "Total Assignment Role" };
    if (route === "/org/hr/approval-hierarchy") return { a: approvalLinkedEmployees, b: users.length, aLabel: "Pegawai Punya Atasan", bLabel: "Total Pegawai" };
    if (route === "/org/hr/general-settings") return { a: organizationSettingCount, b: systemSettingCount, aLabel: "Organization Settings", bLabel: "System Settings" };
    if (route === "/org/hr/branding") return { a: brandingReady ? 1 : 0, b: organizationSettingCount, aLabel: "Logo Tersedia", bLabel: "Konfigurasi Organisasi" };
    if (route === "/org/hr/document-templates" || route === "/org/hr/contract-templates") {
      return { a: contractCount, b: organizationSettingCount, aLabel: "Kontrak Tercatat", bLabel: "Konfigurasi Dokumen" };
    }
    if (route === "/org/hr/warning-letters") return { a: warningRuleCount, b: users.length, aLabel: "Rule Peringatan", bLabel: "Pegawai Tercatat" };
    if (route === "/org/hr/digital-signature") return { a: brandingReady ? 1 : 0, b: contractCount, aLabel: "Kesiapan Branding", bLabel: "Kontrak Tercatat" };
    if (route === "/org/hr/import-export") return { a: auditActivities.filter((item) => item.action.toLowerCase().includes("import")).length, b: auditActivities.filter((item) => item.action.toLowerCase().includes("export")).length, aLabel: "Aktivitas Import", bLabel: "Aktivitas Export" };
    return { a: auditActivities.filter((item) => item.action.toLowerCase().includes("backup")).length, b: auditActivities.length, aLabel: "Aktivitas Backup", bLabel: "Total Aktivitas Audit" };
  }, [approvalLinkedEmployees, auditActivities, brandingReady, contractCount, organizationSettingCount, roles, route, systemSettingCount, users, warningRuleCount]);

  if (!config) {
    return (
      <OrganizationLayout>
        <div className="space-y-2">
          <Badge variant="outline">HR</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Halaman Governance Tidak Ditemukan</h1>
          <p className="text-sm text-muted-foreground">Route governance HR belum terdaftar.</p>
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
              <CardDescription>{summary.aLabel}</CardDescription>
              <CardTitle className="text-2xl">{loading ? "..." : summary.a}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{summary.bLabel}</CardDescription>
              <CardTitle className="text-2xl">{loading ? "..." : summary.b}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        {route === "/org/hr/users" ? (
          <TableCard
            loading={loading}
            emptyText="Belum ada data pengguna."
            headers={["Nama", "Email", "Status", "User ID"]}
            rows={users.map((item) => [item.name, item.email, item.status, item.userId])}
          />
        ) : null}

        {route === "/org/hr/roles" || route === "/org/hr/permissions" ? (
          <TableCard
            loading={loading}
            emptyText="Belum ada assignment role."
            headers={["Role", "Jumlah Pengguna"]}
            rows={roles.map((item) => [item.role, String(item.total)])}
          />
        ) : null}

        {route === "/org/hr/import-export" || route === "/org/hr/backup" || route === "/org/hr/activity-log" ? (
          <TableCard
            loading={loading}
            emptyText="Belum ada aktivitas audit."
            headers={["Aksi", "Tabel", "Waktu"]}
            rows={auditActivities.map((item) => [item.action, item.tableName, item.createdAt])}
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
