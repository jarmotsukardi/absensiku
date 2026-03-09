import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminHRPageShell } from "./AdminHRPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";

type TenantOption = {
  id: string;
  name: string;
  code: string;
};

type HolidayAuditRow = {
  id: string;
  name: string;
  date: string;
  tenant_id: string | null;
  is_national: boolean | null;
};

type AuditFinding = {
  id: string;
  type: "global_mismatch" | "tenant_marked_national" | "duplicate_holiday";
  severity: "critical" | "warning";
  message: string;
  date?: string;
  tenantId?: string | null;
};

export default function AdminHRAudit() {
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantFilter, setTenantFilter] = useState<string>("all");

  const [totalHolidays, setTotalHolidays] = useState(0);
  const [globalMismatchCount, setGlobalMismatchCount] = useState(0);
  const [tenantMarkedNationalCount, setTenantMarkedNationalCount] = useState(0);
  const [duplicateHolidayCount, setDuplicateHolidayCount] = useState(0);
  const [findings, setFindings] = useState<AuditFinding[]>([]);

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const { data, error } = await supabase
          .from("tenants")
          .select("id, name, code")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(500);

        if (error) throw error;
        setTenantOptions((data || []) as TenantOption[]);
      } catch (error) {
        const ref = reportError(error, "admin.hr.audit.tenants");
        toast.error(appendErrorReference("Gagal memuat tenant untuk audit HR", ref));
      }
    };

    void loadTenants();
  }, []);

  const tenantLabelMap = useMemo(() => {
    return new Map(tenantOptions.map((tenant) => [tenant.id, `${tenant.name} (${tenant.code})`]));
  }, [tenantOptions]);

  const loadAudit = useCallback(async () => {
    setIsLoading(true);
    try {
      const baseHolidayQuery = supabase.from("holidays").select("id", { count: "exact", head: true });
      const scopedHolidayCountQuery =
        tenantFilter === "all"
          ? baseHolidayQuery
          : supabase
              .from("holidays")
              .select("id", { count: "exact", head: true })
              .or(`tenant_id.eq.${tenantFilter},tenant_id.is.null`);

      const globalMismatchQuery =
        tenantFilter === "all"
          ? supabase
              .from("holidays")
              .select("id", { count: "exact", head: true })
              .is("tenant_id", null)
              .or("is_national.eq.false,is_national.is.null")
          : supabase
              .from("holidays")
              .select("id", { count: "exact", head: true })
              .is("tenant_id", null)
              .or("is_national.eq.false,is_national.is.null");

      const tenantMarkedNationalQuery =
        tenantFilter === "all"
          ? supabase
              .from("holidays")
              .select("id", { count: "exact", head: true })
              .not("tenant_id", "is", null)
              .eq("is_national", true)
          : supabase
              .from("holidays")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenantFilter)
              .eq("is_national", true);

      const scopedRowsQuery =
        tenantFilter === "all"
          ? supabase
              .from("holidays")
              .select("id, name, date, tenant_id, is_national")
              .order("date", { ascending: false })
              .limit(5000)
          : supabase
              .from("holidays")
              .select("id, name, date, tenant_id, is_national")
              .or(`tenant_id.eq.${tenantFilter},tenant_id.is.null`)
              .order("date", { ascending: false })
              .limit(5000);

      const [
        totalHolidaysResult,
        globalMismatchResult,
        tenantMarkedNationalResult,
        scopedRowsResult,
      ] = await Promise.all([
        scopedHolidayCountQuery,
        globalMismatchQuery,
        tenantMarkedNationalQuery,
        scopedRowsQuery,
      ]);

      const queryError =
        totalHolidaysResult.error ||
        globalMismatchResult.error ||
        tenantMarkedNationalResult.error ||
        scopedRowsResult.error;

      if (queryError) {
        throw queryError;
      }

      const rows = (scopedRowsResult.data || []) as HolidayAuditRow[];
      const duplicateMap = new Map<string, HolidayAuditRow[]>();

      for (const row of rows) {
        const key = `${row.date}::${row.tenant_id || "global"}::${row.name.trim().toLowerCase()}`;
        const existing = duplicateMap.get(key);
        if (existing) {
          existing.push(row);
        } else {
          duplicateMap.set(key, [row]);
        }
      }

      const duplicateGroups = [...duplicateMap.values()].filter((group) => group.length > 1);
      const duplicateRowsCount = duplicateGroups.reduce((sum, group) => sum + group.length, 0);

      const computedFindings: AuditFinding[] = [];

      for (const row of rows) {
        if (row.tenant_id === null && (row.is_national === false || row.is_national === null)) {
          computedFindings.push({
            id: `global-${row.id}`,
            type: "global_mismatch",
            severity: "warning",
            message: "Hari libur global tanpa flag nasional yang konsisten.",
            date: row.date,
            tenantId: row.tenant_id,
          });
        }
        if (row.tenant_id !== null && row.is_national === true) {
          computedFindings.push({
            id: `tenant-national-${row.id}`,
            type: "tenant_marked_national",
            severity: "warning",
            message: "Hari libur tenant ditandai nasional. Periksa klasifikasi.",
            date: row.date,
            tenantId: row.tenant_id,
          });
        }
      }

      for (const group of duplicateGroups) {
        const first = group[0];
        computedFindings.push({
          id: `dup-${first.id}`,
          type: "duplicate_holiday",
          severity: "critical",
          message: `Duplikasi ${group.length} entri hari libur dengan tanggal & nama sama.`,
          date: first.date,
          tenantId: first.tenant_id,
        });
      }

      computedFindings.sort((a, b) => {
        if (a.severity !== b.severity) {
          return a.severity === "critical" ? -1 : 1;
        }
        return (b.date || "").localeCompare(a.date || "");
      });

      setTotalHolidays(totalHolidaysResult.count ?? 0);
      setGlobalMismatchCount(globalMismatchResult.count ?? 0);
      setTenantMarkedNationalCount(tenantMarkedNationalResult.count ?? 0);
      setDuplicateHolidayCount(duplicateRowsCount);
      setFindings(computedFindings.slice(0, 40));
      setLastUpdatedAt(new Date());
    } catch (error) {
      const ref = reportError(error, "admin.hr.audit.holidays_quality");
      toast.error(appendErrorReference("Gagal memuat audit kualitas data HR", ref));
    } finally {
      setIsLoading(false);
    }
  }, [tenantFilter]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  return (
    <AdminHRPageShell
      title="Audit HR"
      subtitle="Audit trail aktivitas modul HR"
      description="Monitor perubahan data penting HR, akses admin, dan kualitas data lintas tenant."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Audit dijalankan manual untuk menjaga performa modul.</p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Memuat data audit..." : `Terakhir diperbarui: ${lastUpdatedAt?.toLocaleString("id-ID") ?? "-"}`}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="w-full sm:w-[260px]">
                <SelectValue placeholder="Filter tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tenant</SelectItem>
                {tenantOptions.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void loadAudit()} disabled={isLoading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh Audit
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/hr/error-logs">Buka Log Error HR</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Hari Libur Tercatat</CardTitle>
              <CardDescription>Total data hari libur pada cakupan audit.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : totalHolidays}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Global Tidak Konsisten</CardTitle>
              <CardDescription>`tenant_id` null namun bukan nasional/null.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : globalMismatchCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tenant Ditandai Nasional</CardTitle>
              <CardDescription>`tenant_id` terisi dengan `is_national=true`.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : tenantMarkedNationalCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Indikasi Duplikasi</CardTitle>
              <CardDescription>Nama + tanggal libur kembar dalam tenant/cakupan sama.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{isLoading ? "..." : duplicateHolidayCount}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Temuan Audit Hari Libur</CardTitle>
            <CardDescription>
              Menampilkan temuan prioritas dari audit kualitas data hari libur.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && findings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Tidak ada temuan pada cakupan audit ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  findings.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant={item.severity === "critical" ? "destructive" : "secondary"}>
                          {item.severity === "critical" ? "Kritis" : "Peringatan"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.type === "global_mismatch"
                          ? "Global Mismatch"
                          : item.type === "tenant_marked_national"
                            ? "Tenant Nasional"
                            : "Duplikasi"}
                      </TableCell>
                      <TableCell>{item.date ?? "-"}</TableCell>
                      <TableCell>
                        {item.tenantId ? tenantLabelMap.get(item.tenantId) ?? item.tenantId : "Global"}
                      </TableCell>
                      <TableCell>{item.message}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminHRPageShell>
  );
}
