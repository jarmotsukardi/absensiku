import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildOrgPayrollOverlayHref } from "@/lib/orgPayrollOverlay";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { OrgPayrollPageGuide } from "@/components/org/payroll/OrgPayrollPageGuide";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isPayrollRoleAssignmentStorageMissing } from "@/lib/payrollAssignmentStorage";
import {
  PAYROLL_ROLE_LABELS,
  PAYROLL_ROLE_PERMISSION_MAP,
  type PayrollRole,
  resolvePayrollPermissionsFromRoles,
} from "@/lib/payrollAccess";
import {
  DEFAULT_PAYROLL_ACCESS_MODE,
  fetchTenantPayrollAccessMode,
  saveTenantPayrollAccessMode,
  type PayrollAccessMode,
} from "@/lib/payrollAccessMode";

type PayrollRoleAssignment = Database["public"]["Tables"]["payroll_role_assignments"]["Row"];
type Employee = Pick<
  Database["public"]["Tables"]["employees"]["Row"],
  "id" | "name" | "email" | "nik" | "user_id" | "tenant_id" | "is_active"
>;

const ROLE_OPTIONS = Object.entries(PAYROLL_ROLE_LABELS).map(([value, label]) => ({ value: value as PayrollRole, label }));

export default function OrgPayrollRoles() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigateWithOverlay = (target: string) =>
    navigate(buildOrgPayrollOverlayHref(location.pathname, location.search, target));
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<PayrollRoleAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState<PayrollRole>("payroll_officer");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("none");
  const [accessMode, setAccessMode] = useState<PayrollAccessMode>(DEFAULT_PAYROLL_ACCESS_MODE);
  const [isSavingAccessMode, setIsSavingAccessMode] = useState(false);
  const [assignmentStorageReady, setAssignmentStorageReady] = useState(true);
  const [assignmentStorageRef, setAssignmentStorageRef] = useState<string | null>(null);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, PayrollRoleAssignment[]>();
    for (const item of assignments) {
      const bucket = map.get(item.user_id) || [];
      bucket.push(item);
      map.set(item.user_id, bucket);
    }
    return map;
  }, [assignments]);

  const filteredEmployees = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return employees;
    return employees.filter((employee) =>
      `${employee.name || ""} ${employee.email || ""} ${employee.nik || ""}`.toLowerCase().includes(keyword),
    );
  }, [employees, searchTerm]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");
      if (!tenantId) setTenantId(resolvedTenantId);

      const [employeeRes, assignmentRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, name, email, nik, user_id, tenant_id, is_active")
          .eq("tenant_id", resolvedTenantId)
          .eq("is_active", true)
          .not("user_id", "is", null)
          .order("name", { ascending: true }),
        supabase
          .from("payroll_role_assignments")
          .select("*")
          .eq("tenant_id", resolvedTenantId)
          .order("created_at", { ascending: false }),
      ]);

      const mode = await fetchTenantPayrollAccessMode(resolvedTenantId);
      setAccessMode(mode);

      if (employeeRes.error) {
        reportError(employeeRes.error, "org.payroll.roles.fetch_employees", { tenant_id: resolvedTenantId });
        setEmployees([]);
      } else {
        setEmployees((employeeRes.data || []) as Employee[]);
      }

      if (assignmentRes.error) {
        if (!isPayrollRoleAssignmentStorageMissing(assignmentRes.error)) {
          throw assignmentRes.error;
        }
        const ref = reportError(assignmentRes.error, "org.payroll.roles.fetch_assignments_missing", {
          tenant_id: resolvedTenantId,
        });
        setAssignmentStorageReady(false);
        setAssignmentStorageRef(ref || null);
        setAssignments([]);
      } else {
        setAssignmentStorageReady(true);
        setAssignmentStorageRef(null);
        setAssignments((assignmentRes.data || []) as PayrollRoleAssignment[]);
      }
    } catch (error) {
      const ref = reportError(error, "org.payroll.roles.fetch");
      toast.error(appendErrorReference("Gagal memuat role payroll", ref));
      setAssignmentStorageReady(true);
      setAssignmentStorageRef(null);
      setEmployees([]);
      setAssignments([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  const setStrictMode = async (strictEnabled: boolean) => {
    try {
      setIsSavingAccessMode(true);
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      if (strictEnabled) {
        const { data: adminRoleRows, error: adminRoleError } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("tenant_id", resolvedTenantId)
          .eq("role", "admin_instansi");
        if (adminRoleError) throw adminRoleError;

        const adminUserIds = Array.from(
          new Set((adminRoleRows || []).map((row) => row.user_id).filter((value): value is string => Boolean(value))),
        );

        if (adminUserIds.length > 0) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const { error: seedError } = await supabase.from("payroll_role_assignments").upsert(
            adminUserIds.map((userId) => ({
              tenant_id: resolvedTenantId,
              user_id: userId,
              payroll_role: "payroll_admin",
              is_active: true,
              assigned_by: user?.id || null,
              notes: "Auto-seed saat Strict Mode Payroll diaktifkan",
            })),
            { onConflict: "tenant_id,user_id,payroll_role" },
          );
          if (seedError) throw seedError;
        }
      }

      const mode = await saveTenantPayrollAccessMode(
        resolvedTenantId,
        strictEnabled ? "strict" : "fallback",
      );
      setAccessMode(mode);
      toast.success(
        mode === "strict"
          ? "Strict mode payroll aktif. Admin instansi di-seed payroll_admin otomatis."
          : "Strict mode payroll nonaktif. Fallback admin tetap diizinkan.",
      );
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.roles.access_mode.save");
      toast.error(appendErrorReference("Gagal menyimpan mode akses payroll", ref));
    } finally {
      setIsSavingAccessMode(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const assignRole = async () => {
    try {
      if (!assignmentStorageReady) {
        toast.error(appendErrorReference("Storage assignment payroll belum tersedia pada schema tenant", assignmentStorageRef));
        return;
      }
      if (selectedEmployeeId === "none") {
        toast.error("Pilih pegawai terlebih dahulu");
        return;
      }
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const employee = employees.find((item) => item.id === selectedEmployeeId);
      if (!employee?.user_id) {
        toast.error("Pegawai belum terhubung ke user aktif");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("payroll_role_assignments").upsert(
        {
          tenant_id: resolvedTenantId,
          user_id: employee.user_id,
          payroll_role: selectedRole,
          is_active: true,
          assigned_by: user?.id || null,
        },
        { onConflict: "tenant_id,user_id,payroll_role" },
      );
      if (error) throw error;

      toast.success(`Role ${PAYROLL_ROLE_LABELS[selectedRole]} berhasil di-assign`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.roles.assign");
      toast.error(appendErrorReference("Gagal assign role payroll", ref));
    }
  };

  const toggleAssignment = async (assignment: PayrollRoleAssignment, nextActive: boolean) => {
    try {
      if (!assignmentStorageReady) {
        toast.error(appendErrorReference("Storage assignment payroll belum tersedia pada schema tenant", assignmentStorageRef));
        return;
      }
      const resolvedTenantId = tenantId || (await resolveOrgTenantId());
      if (!resolvedTenantId) throw new Error("Tenant organisasi tidak ditemukan.");

      const { error } = await supabase
        .from("payroll_role_assignments")
        .update({ is_active: nextActive })
        .eq("id", assignment.id)
        .eq("tenant_id", resolvedTenantId);
      if (error) throw error;

      toast.success(`Assignment ${nextActive ? "diaktifkan" : "dinonaktifkan"}`);
      await fetchData();
    } catch (error) {
      const ref = reportError(error, "org.payroll.roles.toggle");
      toast.error(appendErrorReference("Gagal memperbarui assignment role", ref));
    }
  };

  const summary = useMemo(() => ({
    totalUsersWithRole: new Set(assignments.filter((item) => item.is_active).map((item) => item.user_id)).size,
    activeAssignments: assignments.filter((item) => item.is_active).length,
    inactiveAssignments: assignments.filter((item) => !item.is_active).length,
  }), [assignments]);

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Hak Akses Payroll</h1>
          <p className="text-sm text-muted-foreground">Kelola peran payroll per pengguna. Route payroll menggunakan assignment ini untuk guard akses menu.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="User Dengan Role Aktif" value={summary.totalUsersWithRole} />
          <StatCard title="Assignment Aktif" value={summary.activeAssignments} />
          <StatCard title="Assignment Nonaktif" value={summary.inactiveAssignments} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tetapkan Peran Payroll</CardTitle>
            <CardDescription>Pilih pegawai dan peran untuk memberi akses payroll secara terkontrol.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Pegawai</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pilih Pegawai</SelectItem>
                  {employees.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name || item.email || item.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role Payroll</Label>
              <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as PayrollRole)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={assignRole} className="w-full" disabled={!assignmentStorageReady}>Tetapkan Peran</Button>
            </div>
            {!assignmentStorageReady ? (
              <p className="md:col-span-3 text-xs text-amber-700">
                Storage assignment payroll belum tersedia pada schema tenant. Gunakan mode `Fallback` untuk recovery sementara.
                {assignmentStorageRef ? ` Ref: ${assignmentStorageRef}` : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mode Akses Payroll</CardTitle>
            <CardDescription>
              `Strict` adalah mode default yang disarankan. `Fallback` hanya untuk recovery sementara saat assignment role payroll belum siap.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="strict-mode-payroll">Strict Mode Payroll</Label>
              <p className="text-xs text-muted-foreground">
                Status saat ini: <strong>{accessMode === "strict" ? "STRICT" : "FALLBACK"}</strong>
              </p>
              {!assignmentStorageReady ? (
                <p className="text-xs text-muted-foreground">
                  Assignment per-user belum siap, tetapi mode akses tetap bisa dipakai untuk recovery tenant.
                </p>
              ) : null}
            </div>
            <Switch
              id="strict-mode-payroll"
              aria-label="Strict Mode Payroll"
              checked={accessMode === "strict"}
              onCheckedChange={(checked) => void setStrictMode(checked)}
              disabled={isSavingAccessMode}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Matrix Permission</CardTitle>
            <CardDescription>Ringkasan hak akses per role payroll.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ROLE_OPTIONS.map((role) => (
              <div key={role.value} className="rounded border p-3">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <ShieldCheck className="h-4 w-4" />{role.label}
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                  {PAYROLL_ROLE_PERMISSION_MAP[role.value].map((permission) => (
                    <div key={permission}>- {permission}</div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Assignment Role</CardTitle>
            <CardDescription>Aktif/nonaktif assignment per user untuk kontrol akses menu payroll.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigateWithOverlay("/org/payroll/tax-compliance")}><ArrowLeft className="mr-2 h-4 w-4" />Kembali</Button>
            </div>

            <div>
              <Label htmlFor="search">Cari Pegawai</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="search" className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Cari nama/email/nik..." />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role Aktif</TableHead>
                  <TableHead>Permission Ringkas</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Memuat assignment...</TableCell></TableRow>
                ) : !assignmentStorageReady ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      Storage assignment payroll belum tersedia. Role per-user belum dapat dimuat.
                      {assignmentStorageRef ? ` Ref: ${assignmentStorageRef}` : ""}
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Tidak ada data pegawai</TableCell></TableRow>
                ) : filteredEmployees.map((employee) => {
                  const userId = employee.user_id || "";
                  const userAssignments = assignmentMap.get(userId) || [];
                  const activeRoles = userAssignments.filter((item) => item.is_active).map((item) => item.payroll_role as PayrollRole);
                  const permissions = resolvePayrollPermissionsFromRoles(activeRoles);
                  return (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="font-medium">{employee.name || "Tanpa Nama"}</div>
                        <div className="text-xs text-muted-foreground">{employee.email || "-"}</div>
                      </TableCell>
                      <TableCell>
                        {activeRoles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {accessMode === "fallback" ? "Admin fallback aktif" : "Belum ada assignment"}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {activeRoles.map((role) => (
                              <Badge key={role} variant="outline">{PAYROLL_ROLE_LABELS[role]}</Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{permissions.length} permission</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {userAssignments.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Belum ada assignment</span>
                          ) : userAssignments.map((assignment) => (
                            <div key={assignment.id} className="flex items-center gap-2 rounded border px-2 py-1">
                              <span className="text-xs">{PAYROLL_ROLE_LABELS[assignment.payroll_role as PayrollRole]}</span>
                              <Switch
                                checked={assignment.is_active}
                                onCheckedChange={(checked) => void toggleAssignment(assignment, checked)}
                              />
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <OrgPayrollPageGuide pathname="/org/payroll/roles" />
      </div>
    </OrganizationLayout>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{title}</CardDescription></CardHeader>
      <CardContent><CardTitle className="text-2xl">{value}</CardTitle></CardContent>
    </Card>
  );
}
