import { useEffect, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Users, 
  Search, 
  MoreHorizontal,
  Eye,
  Edit,
  Shield,
  UserX,
  Crown,
  Building2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Key,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { toast } from "sonner";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [orgTypeFilter, setOrgTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  
  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchAdminUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchQuery, orgTypeFilter]);

  const fetchAdminUsers = async () => {
    try {
      // Fetch all admin_instansi and super_admin roles with tenant info
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select(`
          id,
          user_id,
          role,
          tenant_id,
          created_at
        `)
        .in("role", ["admin_instansi", "super_admin"]);

      if (rolesError) throw rolesError;

      // Get unique user IDs
      const userIds = [...new Set(rolesData?.map(r => r.user_id) || [])];
      
      // Fetch tenant info
      const tenantIds = [...new Set(rolesData?.filter(r => r.tenant_id).map(r => r.tenant_id) || [])];
      
      const { data: tenantsData } = await supabase
        .from("tenants")
        .select("id, name, organization_type, is_active")
        .in("id", tenantIds);

      const tenantMap = new Map(tenantsData?.map(t => [t.id, t]) || []);

      // Fetch user emails from auth (we'll use employees table as fallback)
      const { data: employeesData } = await supabase
        .from("employees")
        .select("user_id, email, is_active")
        .in("user_id", userIds);

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
    } catch (error) {
      console.error("Error fetching admin users:", error);
      toast.error("Gagal memuat data user admin");
    } finally {
      setIsLoading(false);
    }
  };

  const filterUsers = () => {
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
  };

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
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
    } catch (error: any) {
      toast.error(error.message || "Gagal reset password");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    try {
      const { error } = await supabase
        .from("employees")
        .update({ is_active: !user.is_active })
        .eq("user_id", user.user_id);

      if (error) throw error;
      
      toast.success(user.is_active ? "User dinonaktifkan" : "User diaktifkan");
      fetchAdminUsers();
    } catch (error: any) {
      toast.error(error.message || "Gagal mengubah status");
    }
  };

  return (
    <SuperAdminLayout title="User Admin Organisasi" subtitle="Kelola semua admin organisasi">
      <div className="space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
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
          </CardContent>
        </Card>

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
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Batal</Button>
            <Button onClick={handleResetPassword} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  );
}
