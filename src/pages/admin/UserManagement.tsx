import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Users, 
  Search, 
  MoreHorizontal,
  Shield,
  UserX,
  Crown,
  Building2,
  Loader2,
  Key,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "sonner";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  tenant_id: string;
  tenant_name: string;
  organization_type: string;
  role: string;
  created_at: string;
  is_active: boolean;
}

const ITEMS_PER_PAGE = 15;
const USER_MANAGEMENT_QUERY_TIMEOUT_MS = 12000;
const USER_MANAGEMENT_QUERY_RETRY_MAX = 2;

const roleLabels: Record<string, { label: string; color: string }> = {
  super_admin: { label: "Super Admin", color: "bg-purple-500" },
  admin_instansi: { label: "Admin Instansi", color: "bg-blue-500" },
};

const orgTypeLabels: Record<string, string> = {
  pemerintah_daerah: "Pemerintah Daerah",
  instansi_pemerintah: "Instansi Pemerintah",
  perusahaan: "Perusahaan",
  sekolah: "Sekolah",
};

export default function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [orgTypeFilter, setOrgTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  
  // Dialog states
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Terjadi kesalahan";

  const fetchAdminUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      setIsRetrying(false);

      // Fetch all admin_instansi and super_admin roles with tenant info
      const { data: rolesData, error: rolesError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("user_roles")
              .select(`
                id,
                user_id,
                role,
                tenant_id,
                created_at
              `)
              .in("role", ["admin_instansi", "super_admin"]),
            USER_MANAGEMENT_QUERY_TIMEOUT_MS,
            "admin.user-management.fetch.roles timeout"
          ),
        {
          maxRetries: USER_MANAGEMENT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (rolesError) throw rolesError;

      // Get unique user IDs
      const userIds = [...new Set(rolesData?.map((r) => r.user_id) || [])];
      
      // Fetch tenant info
      const tenantIds = [
        ...new Set(
          rolesData
            ?.filter((r) => Boolean(r.tenant_id))
            .map((r) => r.tenant_id as string) || []
        ),
      ];

      let tenantsData: Array<{ id: string; name: string; organization_type: string | null; is_active: boolean | null }> = [];
      if (tenantIds.length) {
        const { data, error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("tenants")
                .select("id, name, organization_type, is_active")
                .in("id", tenantIds),
              USER_MANAGEMENT_QUERY_TIMEOUT_MS,
              "admin.user-management.fetch.tenants timeout"
            ),
          {
            maxRetries: USER_MANAGEMENT_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        if (error) throw error;
        tenantsData = data ?? [];
      }

      const tenantMap = new Map(tenantsData?.map(t => [t.id, t]) || []);

      // Fetch user emails from auth (we'll use employees table as fallback)
      let employeesData: Array<{ user_id: string | null; email: string | null; is_active: boolean | null }> = [];
      if (userIds.length) {
        const { data, error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("employees")
                .select("user_id, email, is_active")
                .in("user_id", userIds),
              USER_MANAGEMENT_QUERY_TIMEOUT_MS,
              "admin.user-management.fetch.employees timeout"
            ),
          {
            maxRetries: USER_MANAGEMENT_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        if (error) throw error;
        employeesData = data ?? [];
      }

      const employeeMap = new Map(employeesData?.map(e => [e.user_id, e]) || []);

      // Combine data
      const adminUsers: AdminUser[] = (rolesData || []).map(role => {
        const tenant = role.tenant_id ? tenantMap.get(role.tenant_id) : null;
        const employee = employeeMap.get(role.user_id);
        
        return {
          id: role.id,
          user_id: role.user_id,
          email: employee?.email || "-",
          tenant_id: role.tenant_id || "",
          tenant_name: tenant?.name || "-",
          organization_type: tenant?.organization_type || "-",
          role: role.role,
          created_at: role.created_at,
          is_active: employee?.is_active ?? true,
        };
      });

      // Remove duplicates (same user_id)
      const uniqueUsers = adminUsers.reduce((acc, user) => {
        const existing = acc.find(u => u.user_id === user.user_id);
        if (!existing) {
          acc.push(user);
        }
        return acc;
      }, [] as AdminUser[]);

      setUsers(uniqueUsers);
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.user-management.fetch");
      const message = appendErrorReference("Gagal memuat data user admin", errorRef);
      setLoadError(message);
      setUsers([]);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminUsers();
  }, [fetchAdminUsers]);

  const filterUsers = useCallback(() => {
    let filtered = [...users];

    if (orgTypeFilter !== "all") {
      filtered = filtered.filter(user => user.organization_type === orgTypeFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(user =>
        user.email.toLowerCase().includes(query) ||
        user.tenant_name.toLowerCase().includes(query)
      );
    }

    setFilteredUsers(filtered);
    setCurrentPage(1);
  }, [users, orgTypeFilter, searchQuery]);

  useEffect(() => {
    filterUsers();
  }, [filterUsers]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
  );
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword) {
      toast.error("Password tidak boleh kosong");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }

    setIsSaving(true);
    try {
      // Note: Resetting password requires admin privileges
      // This would typically call an edge function with service role key
      toast.info("Fitur reset password memerlukan konfigurasi edge function dengan service role");
      setPasswordDialogOpen(false);
      setNewPassword("");
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.user-management.password-reset");
      toast.error(appendErrorReference(getErrorMessage(error), errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    try {
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("employees")
              .update({ is_active: !user.is_active })
              .eq("user_id", user.user_id),
            USER_MANAGEMENT_QUERY_TIMEOUT_MS,
            "admin.user-management.toggle-active timeout"
          ),
        {
          maxRetries: USER_MANAGEMENT_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      
      toast.success(user.is_active ? "User dinonaktifkan" : "User diaktifkan");
      await fetchAdminUsers();
    } catch (error: unknown) {
      const errorRef = reportError(error, "admin.user-management.toggle-active", {
        user_id: user.user_id,
        is_active: user.is_active,
      });
      toast.error(appendErrorReference(getErrorMessage(error), errorRef));
    }
  };

  return (
    <SuperAdminLayout title="User Admin Organisasi" subtitle="Kelola semua admin organisasi">
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari email atau organisasi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={orgTypeFilter} onValueChange={setOrgTypeFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Jenis Organisasi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Jenis</SelectItem>
                  <SelectItem value="pemerintah_daerah">Pemerintah Daerah</SelectItem>
                  <SelectItem value="instansi_pemerintah">Instansi Pemerintah</SelectItem>
                  <SelectItem value="perusahaan">Perusahaan</SelectItem>
                  <SelectItem value="sekolah">Sekolah</SelectItem>
                </SelectContent>
              </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span>{loadError}</span>
            <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => void fetchAdminUsers()}>
              Coba Lagi
            </Button>
          </div>
        )}
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sedang mencoba ulang memuat data user admin...
          </div>
        )}

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Daftar Admin Organisasi ({filteredUsers.length})
            </CardTitle>
            <CardDescription>
              User dengan role admin_instansi dan super_admin
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Tidak ada user admin ditemukan</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Organisasi</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Bergabung</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {user.role === "super_admin" ? <Crown className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{user.email}</p>
                            <p className="text-xs text-muted-foreground font-mono">{user.user_id.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{user.tenant_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{orgTypeLabels[user.organization_type] || user.organization_type}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={roleLabels[user.role]?.color || "bg-gray-500"}>
                          {roleLabels[user.role]?.label || user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.is_active ? "default" : "secondary"}>
                          {user.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(user.created_at), "d MMM yyyy", { locale: id })}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedUser(user);
                                setPasswordDialogOpen(true);
                              }}
                            >
                              <Key className="h-4 w-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                              <UserX className="h-4 w-4 mr-2" />
                              {user.is_active ? "Nonaktifkan" : "Aktifkan"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pagination */}
            {!isLoading && filteredUsers.length > 0 && totalPages > 1 && (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </p>
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          if (currentPage > 1) {
                            setCurrentPage((page) => page - 1);
                          }
                        }}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {pageNumbers.map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          href="#"
                          isActive={page === currentPage}
                          onClick={(event) => {
                            event.preventDefault();
                            setCurrentPage(page);
                          }}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          if (currentPage < totalPages) {
                            setCurrentPage((page) => page + 1);
                          }
                        }}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Password Reset Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Masukkan password baru untuk {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Password Baru</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
              />
            </div>
          </div>
          <DialogFooter className={dialogActionBarClassName}>
            <DialogActionHint>Password baru akan langsung aktif untuk akun pengguna terpilih.</DialogActionHint>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
              <Button variant="outline" className="w-full sm:w-auto bg-white" onClick={() => setPasswordDialogOpen(false)}>Batal</Button>
              <Button className="w-full sm:w-auto" onClick={handleResetPassword} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reset Password
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
}
