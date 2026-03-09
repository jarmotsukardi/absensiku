import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, CalendarDays, FolderTree, LayoutDashboard, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

type WorkspaceRoute = "/org/hr/company" | "/org/hr/departments" | "/org/hr/divisions" | "/org/hr/work-locations" | "/org/hr/work-calendar";

type Config = {
  badge: string;
  title: string;
  description: string;
};

type CompanyProfile = {
  name: string;
  code: string;
  organizationType: string;
  email: string;
  phone: string;
  address: string;
};

type NamedRow = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type DivisionRow = NamedRow & { opdName: string | null };

type CalendarSnapshot = {
  workHours: number;
  localHolidays: number;
  nationalHolidays: number;
  nearestNationalHoliday: string | null;
};

const ROUTE_CONFIG: Record<WorkspaceRoute, Config> = {
  "/org/hr/company": {
    badge: "Manajemen Organisasi",
    title: "Data Perusahaan",
    description: "Profil perusahaan/organisasi untuk konteks HR tenant aktif.",
  },
  "/org/hr/departments": {
    badge: "Manajemen Organisasi",
    title: "Departemen",
    description: "Daftar departemen (OPD) yang menjadi struktur utama organisasi.",
  },
  "/org/hr/divisions": {
    badge: "Manajemen Organisasi",
    title: "Divisi",
    description: "Satuan kerja/divisi yang terhubung ke departemen.",
  },
  "/org/hr/work-locations": {
    badge: "Manajemen Organisasi",
    title: "Lokasi Kerja",
    description: "Master kantor/lokasi kerja untuk proses HR dan absensi.",
  },
  "/org/hr/work-calendar": {
    badge: "Manajemen Organisasi",
    title: "Kalender Kerja",
    description: "Snapshot jam kerja dan hari libur untuk operasional HR.",
  },
};

function toOrgTypeLabel(value: string | null): string {
  if (!value) return "-";
  const map: Record<string, string> = {
    pemerintah_daerah: "Pemerintah Daerah",
    instansi_pemerintah: "Instansi Pemerintah",
    perusahaan: "Perusahaan",
    sekolah: "Sekolah/Pendidikan",
  };
  return map[value] || value;
}

function toDateLabel(value: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export default function OrgHROrganizationWorkspace() {
  const location = useLocation();
  const route = (location.pathname as WorkspaceRoute) in ROUTE_CONFIG ? (location.pathname as WorkspaceRoute) : null;
  const config = route ? ROUTE_CONFIG[route] : null;

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [departments, setDepartments] = useState<NamedRow[]>([]);
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [offices, setOffices] = useState<NamedRow[]>([]);
  const [calendar, setCalendar] = useState<CalendarSnapshot>({
    workHours: 0,
    localHolidays: 0,
    nationalHolidays: 0,
    nearestNationalHoliday: null,
  });

  useEffect(() => {
    if (!route) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const tenantId = await resolveOrgTenantId();
        if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

        if (route === "/org/hr/company") {
          const { data, error } = await supabase
            .from("tenants")
            .select("name, code, organization_type, email, phone, address")
            .eq("id", tenantId)
            .maybeSingle();
          if (error) throw error;
          if (cancelled) return;
          setCompany({
            name: data?.name || "-",
            code: data?.code || "-",
            organizationType: toOrgTypeLabel(data?.organization_type || null),
            email: data?.email || "-",
            phone: data?.phone || "-",
            address: data?.address || "-",
          });
          return;
        }

        if (route === "/org/hr/departments") {
          const { data, error } = await supabase
            .from("opd")
            .select("id, name, code, is_active")
            .eq("tenant_id", tenantId)
            .order("name", { ascending: true })
            .limit(200);
          if (error) throw error;
          if (cancelled) return;
          setDepartments((data || []).map((item) => ({
            id: item.id,
            name: item.name,
            code: item.code,
            isActive: item.is_active !== false,
          })));
          return;
        }

        if (route === "/org/hr/divisions") {
          const { data, error } = await supabase
            .from("work_units")
            .select("id, name, code, is_active, opd(name)")
            .eq("tenant_id", tenantId)
            .order("name", { ascending: true })
            .limit(200);
          if (error) throw error;
          if (cancelled) return;
          setDivisions(
            (data || []).map((item) => {
              const opdRelation = item.opd as unknown;
              const opdName =
                opdRelation && typeof opdRelation === "object" && "name" in opdRelation
                  ? String((opdRelation as { name?: string | null }).name || "")
                  : null;
              return {
                id: item.id,
                name: item.name,
                code: item.code,
                isActive: item.is_active !== false,
                opdName: opdName || null,
              };
            }),
          );
          return;
        }

        if (route === "/org/hr/work-locations") {
          const { data, error } = await supabase
            .from("offices")
            .select("id, name, code, is_active")
            .eq("tenant_id", tenantId)
            .order("name", { ascending: true })
            .limit(200);
          if (error) throw error;
          if (cancelled) return;
          setOffices((data || []).map((item) => ({
            id: item.id,
            name: item.name,
            code: item.code,
            isActive: item.is_active !== false,
          })));
          return;
        }

        const year = new Date().getFullYear();
        const [workHoursRes, workHolidaysRes, nationalRes] = await Promise.all([
          supabase.from("work_hours").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase.from("work_holidays").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
          supabase
            .from("national_holidays")
            .select("date")
            .eq("year", year)
            .eq("is_active", true)
            .order("date", { ascending: true }),
        ]);
        if (workHoursRes.error) throw workHoursRes.error;
        if (workHolidaysRes.error) throw workHolidaysRes.error;
        if (nationalRes.error) throw nationalRes.error;

        const todayIso = new Date().toISOString().slice(0, 10);
        const nearest = (nationalRes.data || []).find((item) => item.date >= todayIso)?.date || null;

        if (cancelled) return;
        setCalendar({
          workHours: workHoursRes.count || 0,
          localHolidays: workHolidaysRes.count || 0,
          nationalHolidays: nationalRes.data?.length || 0,
          nearestNationalHoliday: nearest,
        });
      } catch (error) {
        const ref = reportError(error, "org.hr.organization_workspace.fetch", { pathname: location.pathname });
        toast.error(appendErrorReference("Gagal memuat data manajemen organisasi HR", ref));
        if (!cancelled) {
          setCompany(null);
          setDepartments([]);
          setDivisions([]);
          setOffices([]);
          setCalendar({ workHours: 0, localHolidays: 0, nationalHolidays: 0, nearestNationalHoliday: null });
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
    if (route === "/org/hr/departments") {
      return [{ label: "Total Departemen", value: departments.length, icon: FolderTree }];
    }
    if (route === "/org/hr/divisions") {
      return [
        { label: "Total Divisi", value: divisions.length, icon: LayoutDashboard },
        { label: "Divisi Aktif", value: divisions.filter((item) => item.isActive).length, icon: FolderTree },
      ];
    }
    if (route === "/org/hr/work-locations") {
      return [
        { label: "Total Lokasi", value: offices.length, icon: MapPin },
        { label: "Lokasi Aktif", value: offices.filter((item) => item.isActive).length, icon: Building2 },
      ];
    }
    if (route === "/org/hr/work-calendar") {
      return [
        { label: "Template Jam Kerja", value: calendar.workHours, icon: CalendarDays },
        { label: "Kalender Libur Lokal", value: calendar.localHolidays, icon: CalendarDays },
        { label: "Libur Nasional", value: calendar.nationalHolidays, icon: CalendarDays },
      ];
    }
    return [{ label: "Tenant Aktif", value: company?.name ? 1 : 0, icon: Building2 }];
  }, [calendar.localHolidays, calendar.nationalHolidays, calendar.workHours, company?.name, departments.length, divisions, offices, route]);

  if (!config) {
    return (
      <OrganizationLayout>
        <div className="space-y-2">
          <Badge variant="outline">HR</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Halaman Organisasi Tidak Ditemukan</h1>
          <p className="text-sm text-muted-foreground">Route organisasi HR belum terdaftar.</p>
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

        <section className="grid gap-3 md:grid-cols-3">
          {summary.map((item) => (
            <Card key={item.label}>
              <CardHeader className="pb-2">
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className="text-2xl">{loading ? "..." : item.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <item.icon className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </section>

        {route === "/org/hr/company" ? (
          <Card>
            <CardHeader>
              <CardTitle>Profil Perusahaan</CardTitle>
              <CardDescription>Data profil organisasi yang dipakai sebagai acuan HR tenant.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Field label="Nama Perusahaan" value={company?.name || "-"} />
              <Field label="Kode" value={company?.code || "-"} />
              <Field label="Jenis Organisasi" value={company?.organizationType || "-"} />
              <Field label="Email" value={company?.email || "-"} />
              <Field label="Telepon" value={company?.phone || "-"} />
              <Field label="Alamat" value={company?.address || "-"} className="md:col-span-2" />
            </CardContent>
          </Card>
        ) : null}

        {route === "/org/hr/departments" ? (
          <DataTable
            loading={loading}
            emptyText="Belum ada departemen (OPD) terdaftar."
            headers={["Departemen", "Kode", "Status"]}
            rows={departments.map((item) => [item.name, item.code || "-", item.isActive ? "Aktif" : "Nonaktif"])}
          />
        ) : null}

        {route === "/org/hr/divisions" ? (
          <DataTable
            loading={loading}
            emptyText="Belum ada divisi/satuan kerja terdaftar."
            headers={["Divisi", "Departemen", "Kode", "Status"]}
            rows={divisions.map((item) => [item.name, item.opdName || "-", item.code || "-", item.isActive ? "Aktif" : "Nonaktif"])}
          />
        ) : null}

        {route === "/org/hr/work-locations" ? (
          <DataTable
            loading={loading}
            emptyText="Belum ada lokasi kerja terdaftar."
            headers={["Lokasi", "Kode", "Status"]}
            rows={offices.map((item) => [item.name, item.code || "-", item.isActive ? "Aktif" : "Nonaktif"])}
          />
        ) : null}

        {route === "/org/hr/work-calendar" ? (
          <Card>
            <CardHeader>
              <CardTitle>Ringkasan Kalender Kerja</CardTitle>
              <CardDescription>Snapshot konfigurasi kalender kerja tenant aktif.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Field label="Template Jam Kerja" value={String(calendar.workHours)} />
              <Field label="Template Libur Lokal" value={String(calendar.localHolidays)} />
              <Field label="Libur Nasional Tahun Ini" value={String(calendar.nationalHolidays)} />
              <Field label="Libur Nasional Terdekat" value={toDateLabel(calendar.nearestNationalHoliday)} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </OrganizationLayout>
  );
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-md border p-3 ${className || ""}`.trim()}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function DataTable({ loading, emptyText, headers, rows }: { loading: boolean; emptyText: string; headers: string[]; rows: string[][] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daftar Data</CardTitle>
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
              {rows.map((row, index) => (
                <TableRow key={`${row[0]}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={`${index}-${cellIndex}`}>{cell}</TableCell>
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
