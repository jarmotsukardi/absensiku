import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText, CheckCircle, XCircle, Clock, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { fetchSupabaseRpc } from "@/lib/supabaseRestClient";
import { useHrPageAccess } from "@/hooks/useHrPageAccess";

type OffboardingRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_nip: string | null;
  last_position: string | null;
  last_opd: string | null;
  offboarding_type: string;
  offboarding_date: string;
  last_attendance_date: string | null;
  status: string;
  notes: string | null;
  document_reference_number: string | null;
  document_reference_date: string | null;
  document_reference_issuer: string | null;
  created_at: string;
};

type OffboardingQueryRow = {
  id: string;
  employee_id: string;
  mutation_type: string;
  requested_changes: Record<string, unknown> | null;
  original_data: Record<string, unknown> | null;
  reason: string | null;
  status: string | null;
  created_at: string;
  approved_at: string | null;
  document_reference_number: string | null;
  document_reference_date: string | null;
  document_reference_issuer: string | null;
};

type OffboardingFormState = {
  employee_id: string;
  offboarding_type: string;
  offboarding_date: string;
  notes: string;
  document_reference_number: string;
  document_reference_date: string;
  document_reference_issuer: string;
};

const OFFBOARDING_TYPES = [
  { value: "resign", label: "Pengunduran Diri" },
  { value: "termination", label: "PHK/Terminasi" },
  { value: "end_of_contract", label: "Akhir Kontrak" },
  { value: "retirement", label: "Pensiun" },
  { value: "other", label: "Lainnya" },
];

const initialFormState: OffboardingFormState = {
  employee_id: "",
  offboarding_type: "resign",
  offboarding_date: new Date().toISOString().split("T")[0],
  notes: "",
  document_reference_number: "",
  document_reference_date: "",
  document_reference_issuer: "",
};

const isOffboardingRequest = (row: OffboardingQueryRow) => {
  const requestedChanges = (row.requested_changes || {}) as Record<string, unknown>;
  return (
    row.mutation_type === "profile_change" &&
    typeof requestedChanges.offboarding_type === "string" &&
    typeof requestedChanges.offboarding_date === "string" &&
    requestedChanges.employee_active === false
  );
};

export default function OrgHROffboarding() {
  const [rows, setRows] = useState<OffboardingRow[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; nip: string | null }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formState, setFormState] = useState<OffboardingFormState>(initialFormState);
  const { access, isLoading: isLoadingAccess } = useHrPageAccess("/org/hr/offboarding");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const [employeesRes, offboardingRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, name, nip")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("mutation_requests")
          .select("id, employee_id, mutation_type, requested_changes, original_data, reason, status, created_at, approved_at, document_reference_number, document_reference_date, document_reference_issuer")
          .eq("tenant_id", tenantId)
          .eq("mutation_type", "profile_change")
          .order("approved_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (offboardingRes.error) throw offboardingRes.error;

      setEmployees((employeesRes.data || []) as Array<{ id: string; name: string; nip: string | null }>);
      
      const employeeMap = new Map(
        ((employeesRes.data || []) as Array<{ id: string; name: string; nip: string | null }>).map((item) => [item.id, item]),
      );

      const formattedOffboarding = ((offboardingRes.data || []) as OffboardingQueryRow[])
        .filter(isOffboardingRequest)
        .map((item) => {
        const requestedChanges = (item.requested_changes || {}) as Record<string, unknown>;
        const originalData = (item.original_data || {}) as Record<string, unknown>;
        const employee = employeeMap.get(item.employee_id);

        return {
        id: item.id,
        employee_id: item.employee_id,
        employee_name:
          employee?.name ||
          (typeof originalData.employee_name === "string" ? originalData.employee_name : "Unknown"),
        employee_nip:
          employee?.nip ||
          (typeof originalData.employee_nip === "string" ? originalData.employee_nip : null),
        last_position: typeof originalData.position === "string" ? originalData.position : null,
        last_opd: typeof originalData.opd_name === "string" ? originalData.opd_name : null,
        offboarding_type: typeof requestedChanges.offboarding_type === "string" ? requestedChanges.offboarding_type : item.mutation_type,
        offboarding_date:
          typeof requestedChanges.offboarding_date === "string"
            ? requestedChanges.offboarding_date
            : item.approved_at || item.created_at,
        last_attendance_date: null, // Will be fetched separately
        status: item.status || "completed",
        notes: item.reason,
        document_reference_number: item.document_reference_number || null,
        document_reference_date: item.document_reference_date || null,
        document_reference_issuer: item.document_reference_issuer || null,
        created_at: item.created_at,
      };
      }) as OffboardingRow[];

      setRows(formattedOffboarding);
    } catch (error) {
      const ref = reportError(error, "org.hr.offboarding.fetch");
      toast.error(appendErrorReference("Gagal memuat data proses keluar pegawai", ref));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleOpenDialog = () => {
    if (!access.canEdit) {
      toast.error("Aksi tambah proses keluar pegawai hanya tersedia untuk admin organisasi.");
      return;
    }
    setFormState(initialFormState);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!access.canEdit) {
      toast.error("Aksi simpan proses keluar pegawai hanya tersedia untuk admin organisasi.");
      return;
    }
    if (!formState.employee_id) {
      toast.error("Pilih pegawai terlebih dahulu.");
      return;
    }

    setIsLoading(true);
    try {
      const tenantId = await resolveOrgTenantId();
      if (!tenantId) throw new Error("Tenant tidak ditemukan.");
      const payload = {
        employee_id: formState.employee_id,
        offboarding_type: formState.offboarding_type,
        offboarding_date: formState.offboarding_date,
        notes: formState.notes.trim() || null,
        document_reference_number: formState.document_reference_number.trim() || null,
        document_reference_date: formState.document_reference_date || null,
        document_reference_issuer: formState.document_reference_issuer.trim() || null,
      };

      await fetchSupabaseRpc("create_org_hr_offboarding", {
        p_tenant_id: tenantId,
        p_payload: payload,
      });

      toast.success("Proses keluar pegawai berhasil ditambahkan.");
      setIsDialogOpen(false);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.hr.offboarding.save");
      toast.error(appendErrorReference("Gagal menyimpan proses keluar pegawai", ref));
    } finally {
      setIsLoading(false);
    }
  };

  const stats = useMemo(() => {
    const thisMonth = rows.filter((r) => {
      const date = new Date(r.offboarding_date);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;

    return {
      total: rows.length,
      thisMonth,
      byType: OFFBOARDING_TYPES.map((type) => ({
        type: type.label,
        count: rows.filter((r) => r.offboarding_type === type.value).length,
      })),
    };
  }, [rows]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <Badge variant="outline">Pegawai</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Proses Keluar Pegawai</h1>
          <p className="text-sm text-muted-foreground">
            Kelola proses keluar pegawai untuk memastikan penonaktifan yang tertib.
          </p>
          <p className="text-xs text-muted-foreground">
            Kemampuan halaman: {isLoadingAccess ? "memverifikasi..." : access.canEdit ? "mode kelola" : "mode baca saja"}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Total Proses Keluar"
            value={stats.total}
            icon={UserX}
            description="Semua proses keluar"
            color="red"
          />
          <StatCard
            title="Bulan Ini"
            value={stats.thisMonth}
            icon={Clock}
            description="Proses keluar bulan ini"
            color="orange"
          />
          <StatCard
            title="Pegawai Nonaktif"
            value={employees.length}
            icon={UserX}
            description="Pegawai aktif siap diproses"
            color="red"
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Daftar Proses Keluar Pegawai</CardTitle>
                <CardDescription>Riwayat proses keluar pegawai berdasarkan tanggal efektif.</CardDescription>
              </div>
              {access.canEdit && (
                <Button onClick={handleOpenDialog} size="sm" disabled={isLoadingAccess || !access.canEdit}>
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Proses Keluar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-8">Memuat data...</div>
            ) : rows.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Belum ada proses keluar pegawai yang tercatat.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">No</TableHead>
                    <TableHead>Pegawai</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Jabatan Terakhir</TableHead>
                    <TableHead>Unit Terakhir</TableHead>
                    <TableHead>Tanggal Proses Keluar</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((offboarding, index) => (
                    <TableRow key={offboarding.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{offboarding.employee_name}</div>
                          {offboarding.employee_nip && (
                            <div className="text-xs text-muted-foreground font-mono">{offboarding.employee_nip}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">
                          {OFFBOARDING_TYPES.find((t) => t.value === offboarding.offboarding_type)?.label || offboarding.offboarding_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{offboarding.last_position || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">{offboarding.last_opd || "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(offboarding.offboarding_date).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground max-w-xs truncate">
                          {offboarding.notes || "-"}
                          {offboarding.document_reference_number ? (
                            <div className="text-xs text-muted-foreground">
                              Ref: {offboarding.document_reference_number}
                              {offboarding.document_reference_issuer ? ` • ${offboarding.document_reference_issuer}` : ""}
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dialog Tambah Proses Keluar Pegawai */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Tambah Proses Keluar Pegawai</DialogTitle>
              <DialogDescription>
                Catat proses keluar pegawai untuk memastikan penonaktifan yang tertib.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="employee_id">Pegawai Aktif</Label>
                <select
                  id="employee_id"
                  value={formState.employee_id}
                  onChange={(e) => setFormState((prev) => ({ ...prev, employee_id: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={isLoading}
                >
                  <option value="">Pilih pegawai...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.nip && `(${emp.nip})`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="offboarding_type">Jenis Proses Keluar</Label>
                <select
                  id="offboarding_type"
                  value={formState.offboarding_type}
                  onChange={(e) => setFormState((prev) => ({ ...prev, offboarding_type: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={isLoading}
                >
                  {OFFBOARDING_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="offboarding_date">Tanggal Efektif</Label>
                <Input
                  id="offboarding_date"
                  type="date"
                  value={formState.offboarding_date}
                  onChange={(e) => setFormState((prev) => ({ ...prev, offboarding_date: e.target.value }))}
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="notes">Catatan</Label>
                <Textarea
                  id="notes"
                  value={formState.notes}
                  onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Catatan proses keluar (alasan, serah terima, dll)"
                  disabled={isLoading}
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="document_reference_number">Nomor Dokumen Rujukan</Label>
                <Input
                  id="document_reference_number"
                  value={formState.document_reference_number}
                  onChange={(e) => setFormState((prev) => ({ ...prev, document_reference_number: e.target.value }))}
                  placeholder="Contoh: 800/123/SDM/2026"
                  disabled={isLoading}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Tanpa unggah file. Catat nomor surat atau nota proses keluar jika tersedia.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="document_reference_date">Tanggal Dokumen</Label>
                  <Input
                    id="document_reference_date"
                    type="date"
                    value={formState.document_reference_date}
                    onChange={(e) => setFormState((prev) => ({ ...prev, document_reference_date: e.target.value }))}
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="document_reference_issuer">Penerbit Dokumen</Label>
                  <Input
                    id="document_reference_issuer"
                    value={formState.document_reference_issuer}
                    onChange={(e) => setFormState((prev) => ({ ...prev, document_reference_issuer: e.target.value }))}
                    placeholder="Contoh: Sekretariat Daerah"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isLoading}>
                Batal
              </Button>
              <Button onClick={handleSave} disabled={isLoading || !access.canEdit}>
                {isLoading ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
