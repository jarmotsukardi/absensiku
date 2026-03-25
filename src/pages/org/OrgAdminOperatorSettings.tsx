import { useCallback, useEffect, useMemo, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, ShieldCheck, UserCog, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

type RoleType = "admin_instansi" | "atasan";

interface RoleMember {
  id: string;
  user_id: string;
  role: RoleType;
  created_at: string | null;
  name: string;
  email: string;
  nik: string;
  is_active: boolean;
}

interface RoleChangeIntent {
  member: RoleMember;
  targetRole: RoleType;
}

const isAccessRestrictedError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; status?: number; details?: string };
  const text = `${candidate.message || ""} ${candidate.details || ""}`.toLowerCase();
  return (
    candidate.code === "P0001" ||
    candidate.code === "42501" ||
    candidate.status === 401 ||
    candidate.status === 403 ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("permission denied")
  );
};

export default function OrgAdminOperatorSettings() {
  const ORG_ROLE_SETTINGS_QUERY_TIMEOUT_MS = 15000;
  const ORG_ROLE_SETTINGS_QUERY_RETRY_MAX = 1;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<RoleMember[]>([]);
  const [pendingRoleChange, setPendingRoleChange] = useState<RoleChangeIntent | null>(null);

  const fetchRoleMembers = useCallback(async () => {
    setIsLoading(true);
    try {
      setIsRetrying(false);
      setLoadError(null);
      const {
        data: { user },
      } = await withTimeout(
        Promise.resolve(supabase.auth.getUser()),
        ORG_ROLE_SETTINGS_QUERY_TIMEOUT_MS,
        "org.settings.admin_operator.resolve_user timeout",
      );
      if (!user) {
        setMembers([]);
        return;
      }

      const { data: allowedRoles, error: allowedRolesError } = await withTimeout(
        Promise.resolve(
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .in("role", ["admin_instansi", "super_admin"])
            .limit(1),
        ),
        ORG_ROLE_SETTINGS_QUERY_TIMEOUT_MS,
        "org.settings.admin_operator.resolve_access timeout",
      );
      if (allowedRolesError) throw allowedRolesError;
      if (!allowedRoles || allowedRoles.length === 0) {
        setMembers([]);
        return;
      }

      const resolvedTenantId = await withExponentialBackoff(
        () =>
          withTimeout(
            resolveOrgTenantId(),
            ORG_ROLE_SETTINGS_QUERY_TIMEOUT_MS,
            "org.settings.admin_operator.resolve_tenant timeout",
          ),
        {
          maxRetries: ORG_ROLE_SETTINGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );
      if (!resolvedTenantId) {
        setMembers([]);
        return;
      }

      const { data: roleRows, error: roleError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.rpc("org_list_admin_operator_members"),
            ORG_ROLE_SETTINGS_QUERY_TIMEOUT_MS,
            "org.settings.admin_operator.fetch_members timeout",
          ),
        {
          maxRetries: ORG_ROLE_SETTINGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (roleError) throw roleError;

      const mappedMembers: RoleMember[] = (roleRows || []).map((row) => {
        return {
          id: row.role_id,
          user_id: row.user_id,
          role: row.role as RoleType,
          created_at: row.created_at,
          name: row.employee_name || `User ${row.user_id.slice(0, 8)}`,
          email: row.employee_email || "-",
          nik: row.employee_nik || "-",
          is_active: row.employee_is_active ?? true,
        };
      });

      setMembers(mappedMembers);
    } catch (error) {
      if (isAccessRestrictedError(error)) {
        setMembers([]);
        setLoadError(null);
        return;
      }
      const errorRef = reportError(error, "org.settings.admin_operator.fetch");
      const message = appendErrorReference("Gagal memuat data Admin & Operator", errorRef);
      setLoadError(message);
      toast.error(message);
      setMembers([]);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, []);

  useEffect(() => {
    void fetchRoleMembers();
  }, [fetchRoleMembers]);

  const adminMembers = useMemo(
    () => members.filter((member) => member.role === "admin_instansi"),
    [members],
  );
  const operatorMembers = useMemo(
    () => members.filter((member) => member.role === "atasan"),
    [members],
  );
  const duplicateEmails = useMemo(() => {
    const countByEmail = new Map<string, number>();
    for (const member of members) {
      const normalizedEmail = member.email.trim().toLowerCase();
      if (!normalizedEmail || normalizedEmail === "-") continue;
      countByEmail.set(normalizedEmail, (countByEmail.get(normalizedEmail) || 0) + 1);
    }
    return new Set(
      Array.from(countByEmail.entries())
        .filter(([, count]) => count > 1)
        .map(([email]) => email),
    );
  }, [members]);
  const isDuplicateEmail = (email: string) => duplicateEmails.has(email.trim().toLowerCase());

  const applyRoleChange = async (member: RoleMember, targetRole: RoleType) => {
    if (member.role === targetRole) return;

    if (member.role === "admin_instansi" && targetRole === "atasan" && adminMembers.length <= 1) {
      toast.error("Minimal harus ada 1 Admin Organisasi aktif.");
      return;
    }

    setIsSaving(member.id);
    try {
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.rpc("org_update_admin_operator_role", {
              _role_id: member.id,
              _target_role: targetRole,
            }),
            ORG_ROLE_SETTINGS_QUERY_TIMEOUT_MS,
            "org.settings.admin_operator.change_role timeout",
          ),
        {
          maxRetries: ORG_ROLE_SETTINGS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        },
      );

      if (error) throw error;

      toast.success(
        targetRole === "admin_instansi"
          ? `${member.name} dipromosikan menjadi Admin Organisasi.`
          : `${member.name} dipindahkan menjadi Operator.`,
      );
      await fetchRoleMembers();
    } catch (error) {
      const errorRef = reportError(error, "org.settings.admin_operator.change_role", {
        user_id: member.user_id,
        from_role: member.role,
        to_role: targetRole,
      });
      toast.error(appendErrorReference("Gagal mengubah role pengguna", errorRef));
    } finally {
      setIsSaving(null);
      setIsRetrying(false);
    }
  };

  const queueRoleChange = (member: RoleMember, targetRole: RoleType) => {
    if (member.role === targetRole) return;
    if (member.role === "admin_instansi" && targetRole === "atasan" && adminMembers.length <= 1) {
      toast.error("Minimal harus ada 1 Admin Organisasi aktif.");
      return;
    }
    setPendingRoleChange({ member, targetRole });
  };

  const confirmRoleChange = async () => {
    if (!pendingRoleChange) return;
    const intent = pendingRoleChange;
    setPendingRoleChange(null);
    await applyRoleChange(intent.member, intent.targetRole);
  };

  const roleLabel = (role: RoleType) => (role === "admin_instansi" ? "Admin Organisasi" : "Operator");

  const renderRoleTable = (rows: RoleMember[], mode: RoleType) => (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>NIK</TableHead>
              <TableHead>Status Pegawai</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Belum ada data.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{member.email}</span>
                      {isDuplicateEmail(member.email) ? (
                        <Badge variant="outline" className="text-[11px]">
                          Email Duplikat
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{member.nik}</TableCell>
                  <TableCell>
                    <Badge variant={member.is_active ? "default" : "secondary"}>
                      {member.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {mode === "admin_instansi" ? (
                      <Button
                        variant="outline"
                        data-testid="admin-operator-action"
                        onClick={() => queueRoleChange(member, "atasan")}
                        disabled={isSaving === member.id || adminMembers.length <= 1}
                      >
                        {isSaving === member.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Jadikan Operator
                      </Button>
                    ) : (
                      <Button
                        data-testid="admin-operator-action"
                        onClick={() => queueRoleChange(member, "admin_instansi")}
                        disabled={isSaving === member.id}
                      >
                        {isSaving === member.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Jadikan Admin
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Belum ada data.
          </div>
        ) : (
          rows.map((member) => (
            <div key={member.id} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-tight">{member.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground break-all">{member.email}</p>
                    {isDuplicateEmail(member.email) ? (
                      <Badge variant="outline" className="text-[11px]">
                        Email Duplikat
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <Badge variant={member.is_active ? "default" : "secondary"}>
                  {member.is_active ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">NIK</p>
                  <p className="font-medium">{member.nik}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Role Saat Ini</p>
                  <p className="font-medium">{roleLabel(member.role)}</p>
                </div>
              </div>

              {mode === "admin_instansi" ? (
                <Button
                  variant="outline"
                  className="w-full"
                  data-testid="admin-operator-action"
                  onClick={() => queueRoleChange(member, "atasan")}
                  disabled={isSaving === member.id || adminMembers.length <= 1}
                >
                  {isSaving === member.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Jadikan Operator
                </Button>
              ) : (
                <Button
                  className="w-full"
                  data-testid="admin-operator-action"
                  onClick={() => queueRoleChange(member, "admin_instansi")}
                  disabled={isSaving === member.id}
                >
                  {isSaving === member.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Jadikan Admin
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );

  if (isLoading) {
    return (
      <OrganizationLayout>
        <div className="flex items-center justify-center h-72">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="h-6 w-6" />
            Admin & Operator
          </h1>
          <p className="text-muted-foreground">
            Kelola role admin organisasi dan operator (role sistem: atasan).
          </p>
        </div>
        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void fetchRoleMembers()}>
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {isRetrying && (
          <Card className="border-amber-300/60 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm text-amber-800">Sedang mencoba ulang koneksi data Admin & Operator...</p>
            </CardContent>
          </Card>
        )}

        <Card className="border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
              <AlertTriangle className="h-5 w-5" />
              Batasan Permission
            </CardTitle>
            <CardDescription className="text-amber-800 dark:text-amber-200">
              Admin Organisasi memiliki akses konfigurasi penuh. Operator difokuskan ke proses operasional harian.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-900 dark:text-amber-100">
            <p>1. Admin Organisasi: dapat kelola master data, jadwal, pengaturan, konten, laporan, dan role operator.</p>
            <p>2. Operator: dapat menangani proses operasional (permohonan dan monitoring data kerja), tanpa akses manajemen role.</p>
            <p>3. Sistem mencegah penurunan role jika tersisa 1 Admin Organisasi.</p>
          </CardContent>
        </Card>
        {duplicateEmails.size > 0 ? (
          <Card className="border-orange-300/70 bg-orange-50/80 dark:border-orange-800 dark:bg-orange-950/30">
            <CardContent className="pt-4">
              <p className="text-sm text-orange-900 dark:text-orange-100">
                Terdeteksi email yang sama pada lebih dari satu entri pegawai.
                Periksa kembali data pegawai agar role tidak membingungkan saat dikelola.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Tabs defaultValue="admin">
          <div className="overflow-x-auto pb-1">
            <TabsList className="min-w-max h-auto gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
              <TabsTrigger value="admin" className="gap-2 whitespace-nowrap">
                <ShieldCheck className="h-4 w-4" />
                Admin Organisasi ({adminMembers.length})
              </TabsTrigger>
              <TabsTrigger value="operator" className="gap-2 whitespace-nowrap">
                <UserCog className="h-4 w-4" />
                Operator ({operatorMembers.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="admin">
            <Card>
              <CardHeader>
                <CardTitle>Daftar Admin Organisasi</CardTitle>
                <CardDescription>
                  Admin mengelola konfigurasi organisasi dan hak akses operator.
                </CardDescription>
              </CardHeader>
              <CardContent>{renderRoleTable(adminMembers, "admin_instansi")}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operator">
            <Card>
              <CardHeader>
                <CardTitle>Daftar Operator</CardTitle>
                <CardDescription>
                  Operator dipetakan ke role sistem <code>atasan</code>.
                </CardDescription>
              </CardHeader>
              <CardContent>{renderRoleTable(operatorMembers, "atasan")}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <AlertDialog
        open={Boolean(pendingRoleChange)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRoleChange(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Perubahan Role</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRoleChange
                ? `Anda akan mengubah role ${pendingRoleChange.member.name} dari ${roleLabel(pendingRoleChange.member.role)} menjadi ${roleLabel(pendingRoleChange.targetRole)}. Lanjutkan?`
                : "Perubahan role akan langsung disimpan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(isSaving)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmRoleChange();
              }}
              disabled={Boolean(isSaving)}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                "Ya, Ubah Role"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </OrganizationLayout>
  );
}
