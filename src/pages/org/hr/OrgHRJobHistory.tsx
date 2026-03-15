import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePaginationFooter } from "@/components/common/TablePaginationFooter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, TrendingUp, Calendar, Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";
import { toast } from "sonner";

type MutationHistory = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_nip: string | null;
  old_position_id: string | null;
  old_position_name: string | null;
  old_opd_id: string | null;
  old_opd_name: string | null;
  new_position_id: string | null;
  new_position_name: string | null;
  new_opd_id: string | null;
  new_opd_name: string | null;
  mutation_type: string;
  effective_date: string;
  decision_number: string | null;
  notes: string | null;
  created_at: string;
};

type MutationRequestRow = Pick<
  Database["public"]["Tables"]["mutation_requests"]["Row"],
  | "id"
  | "employee_id"
  | "mutation_type"
  | "requested_changes"
  | "original_data"
  | "reason"
  | "created_at"
  | "approved_at"
>;

const toJsonRecord = (value: Json): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

type MutationTypeFilter = "all" | "promosi" | "mutasi" | "demosi";

const MUTATION_TYPE_OPTIONS: Array<{ value: MutationTypeFilter; label: string }> = [
  { value: "all", label: "Semua Jenis" },
  { value: "promosi", label: "Promosi" },
  { value: "mutasi", label: "Mutasi" },
  { value: "demosi", label: "Demosi" },
];

const PAGE_SIZE = 10;

export default function OrgHRJobHistory() {
  const [rows, setRows] = useState<MutationHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MutationTypeFilter>("all");
  const [opdFilter, setOpdFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/job-history");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { data, error } = await supabase
        .from("mutation_requests")
        .select("id, employee_id, mutation_type, requested_changes, original_data, reason, status, created_at, approved_at")
        .eq("tenant_id", tenantId)
        .in("status", ["approved", "disetujui"])
        .in("mutation_type", ["promosi", "mutasi", "demosi", "transfer", "profile_change"])
        .order("approved_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mutationRows = (data || []) as MutationRequestRow[];
      const employeeIds = Array.from(new Set(mutationRows.map((item) => item.employee_id).filter(Boolean)));
      const { data: employeesData, error: employeesError } = employeeIds.length
        ? await supabase.from("employees").select("id, name, nip").in("id", employeeIds)
        : { data: [], error: null };

      if (employeesError) throw employeesError;

      const employeeMap = new Map(
        ((employeesData || []) as Array<{ id: string; name: string; nip: string | null }>).map((item) => [item.id, item]),
      );

      const formattedData = mutationRows.map((item) => {
        const requestedChanges = toJsonRecord(item.requested_changes);
        const originalData = toJsonRecord(item.original_data);
        const employee = employeeMap.get(item.employee_id);
        const effectiveDate = typeof requestedChanges.effective_date === "string"
          ? requestedChanges.effective_date
          : item.approved_at || item.created_at;

        return {
          id: item.id,
          employee_id: item.employee_id,
          employee_name: employee?.name || "Unknown",
          employee_nip: employee?.nip || null,
          old_position_id: typeof originalData.position_id === "string" ? originalData.position_id : null,
          old_position_name: typeof originalData.position_name === "string"
            ? originalData.position_name
            : typeof originalData.position === "string"
              ? originalData.position
              : null,
          old_opd_id: typeof originalData.opd_id === "string" ? originalData.opd_id : null,
          old_opd_name: typeof originalData.opd_name === "string" ? originalData.opd_name : null,
          new_position_id: typeof requestedChanges.position_id === "string" ? requestedChanges.position_id : null,
          new_position_name: typeof requestedChanges.position_name === "string"
            ? requestedChanges.position_name
            : typeof requestedChanges.position === "string"
              ? requestedChanges.position
              : null,
          new_opd_id: typeof requestedChanges.opd_id === "string" ? requestedChanges.opd_id : null,
          new_opd_name: typeof requestedChanges.opd_name === "string" ? requestedChanges.opd_name : null,
          mutation_type: item.mutation_type,
          effective_date: effectiveDate,
          decision_number: typeof requestedChanges.decision_number === "string" ? requestedChanges.decision_number : null,
          notes: item.reason,
          created_at: item.created_at,
        };
      });

      setRows(formattedData);
    } catch (error) {
      const ref = reportError(error, "org.hr.job-history.fetch");
      toast.error(appendErrorReference("Gagal memuat riwayat jabatan", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const keyword = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    let result = rows;

    // Filter by type
    if (typeFilter !== "all") {
      result = result.filter((item) => item.mutation_type === typeFilter);
    }

    // Filter by OPD
    if (opdFilter !== "all") {
      result = result.filter((item) => item.new_opd_id === opdFilter);
    }

    // Filter by search
    if (keyword) {
      result = result.filter((item) =>
        [
          item.employee_name,
          item.employee_nip || "",
          item.old_position_name || "",
          item.old_opd_name || "",
          item.new_position_name || "",
          item.new_opd_name || "",
          item.decision_number || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword),
      );
    }

    return result;
  }, [rows, keyword, typeFilter, opdFilter]);

  const stats = useMemo(() => {
    const typeCount = new Map<string, number>();
    const opdCount = new Map<string, number>();

    rows.forEach((item) => {
      typeCount.set(item.mutation_type, (typeCount.get(item.mutation_type) || 0) + 1);

      if (item.new_opd_name) {
        opdCount.set(item.new_opd_name, (opdCount.get(item.new_opd_name) || 0) + 1);
      }
    });

    return {
      total: rows.length,
      promosi: typeCount.get("promosi") || 0,
      mutasi: typeCount.get("mutasi") || 0,
      demosi: typeCount.get("demosi") || 0,
      uniqueOpd: Array.from(opdCount.entries()).map(([name, count]) => ({ name, count })),
    };
  }, [rows]);

  const uniqueOpds = useMemo(() => {
    const opdSet = new Set<string>();
    rows.forEach((item) => {
      if (item.old_opd_name) opdSet.add(item.old_opd_name);
      if (item.new_opd_name) opdSet.add(item.new_opd_name);
    });
    return Array.from(opdSet).sort();
  }, [rows]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(from, from + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter, opdFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleExport = () => {
    const headers = [
      "No",
      "Nama Pegawai",
      "NIP",
      "Jenis Mutasi",
      "Jabatan Lama",
      "Unit Lama",
      "Jabatan Baru",
      "Unit Baru",
      "Tanggal Efektif",
      "No. SK",
      "Catatan",
    ];
    const csvData = [headers.join(",")];

    filtered.forEach((item, index) => {
      const row = [
        index + 1,
        `"${item.employee_name}"`,
        `"${item.employee_nip || ""}"`,
        item.mutation_type,
        `"${item.old_position_name || "-"}"`,
        `"${item.old_opd_name || "-"}"`,
        `"${item.new_position_name || "-"}"`,
        `"${item.new_opd_name || "-"}"`,
        `"${new Date(item.effective_date).toLocaleDateString("id-ID")}"`,
        `"${item.decision_number || ""}"`,
        `"${item.notes || ""}"`,
      ];
      csvData.push(row.join(","));
    });

    const blob = new Blob([csvData.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riwayat-jabatan-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Data berhasil diekspor ke CSV.");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Pegawai</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Riwayat Jabatan</h1>
          <p className="text-sm text-muted-foreground">
            Lacak riwayat mutasi, promosi, dan demosi pegawai.
          </p>
          <p className="text-xs text-muted-foreground">
            Capability halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "monitoring hanya-baca"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Total Mutasi"
            value={stats.total}
            icon={Briefcase}
            description="Semua riwayat mutasi"
            color="blue"
          />
          <StatCard
            title="Promosi"
            value={stats.promosi}
            icon={TrendingUp}
            description="Kenaikan jabatan"
            color="green"
          />
          <StatCard
            title="Mutasi"
            value={stats.mutasi}
            icon={Briefcase}
            description="Perpindahan unit"
            color="orange"
          />
          <StatCard
            title="Demosi"
            value={stats.demosi}
            icon={TrendingUp}
            description="Penurunan jabatan"
            color="red"
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Daftar Riwayat Jabatan</CardTitle>
                <CardDescription>Timeline mutasi jabatan pegawai berdasarkan tanggal efektif.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Ekspor CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, NIP, jabatan, unit kerja, no. SK..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as MutationTypeFilter)}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUTATION_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={opdFilter} onValueChange={(value) => setOpdFilter(value)}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Semua Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Unit</SelectItem>
                  {uniqueOpds.map((opd) => (
                    <SelectItem key={opd} value={opd}>
                      {opd}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">Memuat data...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Belum ada riwayat mutasi yang tercatat.
              </div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Jabatan Lama</TableHead>
                    <TableHead>Unit Lama</TableHead>
                    <TableHead>Jabatan Baru</TableHead>
                    <TableHead>Unit Baru</TableHead>
                    <TableHead>Tanggal Efektif</TableHead>
                    <TableHead>No. SK</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((mutation, index) => (
                    <TableRow key={mutation.id}>
                      <TableCell>{(safePage - 1) * PAGE_SIZE + index + 1}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{mutation.employee_name}</div>
                          {mutation.employee_nip && (
                            <div className="text-xs text-muted-foreground font-mono">{mutation.employee_nip}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <MutationTypeBadge type={mutation.mutation_type} />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">{mutation.old_position_name || "-"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">{mutation.old_opd_name || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-sm">{mutation.new_position_name || "-"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">{mutation.new_opd_name || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {new Date(mutation.effective_date).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {mutation.decision_number || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePaginationFooter
                currentPage={safePage}
                totalPages={totalPages}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                itemLabel="riwayat"
                onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
                onNext={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              />
              </>
            )}
          </CardContent>
        </Card>

        {stats.uniqueOpd.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Statistik Mutasi per Unit</CardTitle>
              <CardDescription>Distribusi mutasi berdasarkan unit kerja tujuan.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {stats.uniqueOpd.map((opd, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-1">
                      <div className="font-medium text-sm">{opd.name}</div>
                      <div className="text-xs text-muted-foreground">{opd.count} mutasi</div>
                    </div>
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </OrganizationLayout>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  color = "blue",
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description: string;
  color?: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "text-blue-600",
    green: "text-emerald-600",
    orange: "text-orange-600",
    red: "text-red-600",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          <Icon className={`h-4 w-4 ${colorClasses[color]}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function MutationTypeBadge({ type }: { type: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    promosi: "default",
    mutasi: "outline",
    demosi: "secondary",
  };

  const labels: Record<string, string> = {
    promosi: "Promosi",
    mutasi: "Mutasi",
    demosi: "Demosi",
  };

  return (
    <Badge variant={variants[type] || "outline"}>
      {labels[type] || type}
    </Badge>
  );
}
