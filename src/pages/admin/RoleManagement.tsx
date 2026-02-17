import { useCallback, useEffect, useMemo, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Crown, Edit, Loader2, Plus, Search, Shield, Trash2, UserCog, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { toast } from "sonner";


type AppRole = "super_admin" | "admin_instansi" | "atasan" | "pegawai";

interface UserRoleRow {
  id: string;
  user_id: string;
  role: AppRole;
  tenant_id: string | null;
  created_at: string | null;
}

interface TenantOption {
  id: string;
  name: string;
}

interface EmployeeRef {
  user_id: string | null;
  email: string;
  name: string;
}

interface RoleDef {
  id: AppRole;
  name: string;
  description: string;
  icon: typeof Crown;
  color: string;
  permissions: string[];
}

interface RoleGlossaryItem {
  term: string;
  description: string;
  reference?: string;
}

const ROLE_DEFS: RoleDef[] = [
  {
    id: "super_admin",
    name: "Super Admin",
    description: "Akses penuh ke semua fitur dan data platform",
    icon: Crown,
    color: "bg-purple-500",
    permissions: ["Kelola organisasi", "Kelola billing", "Kelola role", "Audit log", "Pengaturan sistem"],
  },
  {
    id: "admin_instansi",
    name: "Admin Instansi",
    description: "Mengelola organisasi dan pegawai pada tenant",
    icon: Shield,
    color: "bg-blue-500",
    permissions: ["Kelola pegawai", "Kelola master data", "Approval", "Laporan", "Pengaturan tenant"],
  },
  {
    id: "atasan",
    name: "Atasan",
    description: "Akses supervisi tim dan approval pengajuan",
    icon: UserCog,
    color: "bg-green-500",
    permissions: ["Lihat tim", "Approval pengajuan", "Lihat absensi tim"],
  },
  {
    id: "pegawai",
    name: "Pegawai",
    description: "Akses absensi, pengajuan, profil, riwayat",
    icon: Users,
    color: "bg-slate-500",
    permissions: ["Absensi", "Pengajuan", "Riwayat", "Profil"],
  },
];

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin_instansi: "Admin Instansi",
  atasan: "Atasan",
  pegawai: "Pegawai",
};

const PAGE_SIZE = 15;
const GLOSSARY_PAGE_SIZE = 6;

const ROLE_GLOSSARY: RoleGlossaryItem[] = [
  {
    term: "Role Assignment",
    description:
      "Pemetaan antara user dan role tertentu yang menentukan halaman/fungsi apa saja yang bisa diakses.",
    reference: "Tabel: user_roles",
  },
  {
    term: "Super Admin",
    description:
      "Role tertinggi platform dengan akses lintas tenant, termasuk pengaturan global, billing, role, dan audit.",
    reference: "Role ID: super_admin",
  },
  {
    term: "Admin Instansi",
    description:
      "Role pengelola tenant/organisasi. Dapat mengelola pegawai, master data, pengajuan, laporan, dan pengaturan tenant.",
    reference: "Role ID: admin_instansi",
  },
  {
    term: "Atasan",
    description:
      "Role supervisi untuk approval dan pemantauan tim pada tenant terkait, dengan akses terbatas sesuai kebijakan.",
    reference: "Role ID: atasan",
  },
  {
    term: "Pegawai",
    description:
      "Role pengguna akhir untuk absensi, pengajuan, riwayat, profil, dan notifikasi milik akun tersebut.",
    reference: "Role ID: pegawai",
  },
  {
    term: "Tenant Scope",
    description:
      "Batas data per organisasi. Untuk role non-super-admin, tenant_id wajib diisi agar akses tidak lintas tenant.",
    reference: "Kolom: user_roles.tenant_id",
  },
  {
    term: "Tanpa Tenant",
    description:
      "Kondisi assignment tanpa tenant. Umumnya hanya valid untuk Super Admin.",
    reference: "UI: opsi \"Tanpa Tenant\"",
  },
  {
    term: "Lookup Email",
    description:
      "Fitur pencarian user_id dari tabel employees berdasarkan email agar assignment role lebih cepat dan akurat.",
    reference: "Aksi: Cari email -> isi User ID",
  },
  {
    term: "RLS (Row Level Security)",
    description:
      "Kebijakan database yang memastikan data yang ditampilkan/diubah tetap sesuai role dan tenant pengguna.",
    reference: "Supabase RLS Policies",
  },
  {
    term: "Permission Matrix",
    description:
      "Ringkasan kemampuan per role (lihat, tambah, ubah, hapus, approval, konfigurasi) sebagai panduan otorisasi.",
    reference: "Kartu role pada halaman ini",
  },
];

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export default function RoleManagement() {
  const [rows, setRows] = useState<UserRoleRow[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [employeeRefs, setEmployeeRefs] = useState<EmployeeRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<UserRoleRow | null>(null);
  const [deleting, setDeleting] = useState<UserRoleRow | null>(null);

  const [emailLookup, setEmailLookup] = useState("");
  const [formUserId, setFormUserId] = useState("");
  const [formRole, setFormRole] = useState<AppRole>("pegawai");
  const [formTenantId, setFormTenantId] = useState<string>("none");
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [glossaryPage, setGlossaryPage] = useState(1);

  const tenantNameMap = useMemo(() => {
    return new Map(tenants.map((t) => [t.id, t.name]));
  }, [tenants]);

  const employeeByUserId = useMemo(() => {
    return new Map(
      employeeRefs
        .filter((r) => r.user_id)
        .map((r) => [r.user_id as string, r])
    );
  }, [employeeRefs]);

  const resetForm = () => {
    setEditing(null);
    setEmailLookup("");
    setFormUserId("");
    setFormRole("pegawai");
    setFormTenantId("none");
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [roleRes, tenantRes] = await Promise.all([
        supabase
          .from("user_roles")
          .select("id,user_id,role,tenant_id,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("tenants")
          .select("id,name")
          .order("name", { ascending: true }),
      ]);

      if (roleRes.error) throw roleRes.error;
      if (tenantRes.error) throw tenantRes.error;

      const roleRows = (roleRes.data || []) as UserRoleRow[];
      const userIds = Array.from(new Set(roleRows.map((r) => r.user_id).filter(Boolean)));

      let refs: EmployeeRef[] = [];
      if (userIds.length > 0) {
        const { data: employeeRows, error: employeeError } = await supabase
          .from("employees")
          .select("user_id,email,name")
          .in("user_id", userIds)
          .order("updated_at", { ascending: false });
        if (employeeError) throw employeeError;

        const seen = new Set<string>();
        refs = (employeeRows || []).filter((row) => {
          const key = String(row.user_id || "");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        }) as EmployeeRef[];
      }

      setRows(roleRows);
      setTenants((tenantRes.data || []) as TenantOption[]);
      setEmployeeRefs(refs);
    } catch (error) {
      const errorRef = reportError(error, "admin.roles.load");
      const message = appendErrorReference("Gagal memuat data role", errorRef);
      toast.error(message);
      setLoadError(message);
      setRows([]);
      setTenants([]);
      setEmployeeRefs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, roleFilter, tenantFilter]);

  const roleCounts = useMemo(() => {
    const initial: Record<AppRole, number> = {
      super_admin: 0,
      admin_instansi: 0,
      atasan: 0,
      pegawai: 0,
    };
    rows.forEach((row) => {
      initial[row.role] += 1;
    });
    return initial;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (tenantFilter !== "all" && (row.tenant_id || "none") !== tenantFilter) return false;

      if (!q) return true;
      const tenantName = row.tenant_id ? (tenantNameMap.get(row.tenant_id) || "") : "";
      const employee = employeeByUserId.get(row.user_id);
      const haystack = [
        row.user_id,
        ROLE_LABEL[row.role],
        tenantName,
        employee?.email || "",
        employee?.name || "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, roleFilter, tenantFilter, query, tenantNameMap, employeeByUserId]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paginatedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visiblePages = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) {
      return [1, 2, 3, 4, 5];
    }
    if (currentPage >= totalPages - 2) {
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
  }, [currentPage, totalPages]);

  const filteredGlossary = useMemo(() => {
    const q = glossaryQuery.trim().toLowerCase();
    if (!q) return ROLE_GLOSSARY;
    return ROLE_GLOSSARY.filter((item) =>
      [item.term, item.description, item.reference || ""].join(" ").toLowerCase().includes(q)
    );
  }, [glossaryQuery]);

  const glossaryTotalPages = Math.max(1, Math.ceil(filteredGlossary.length / GLOSSARY_PAGE_SIZE));
  const paginatedGlossary = filteredGlossary.slice(
    (glossaryPage - 1) * GLOSSARY_PAGE_SIZE,
    glossaryPage * GLOSSARY_PAGE_SIZE
  );

  useEffect(() => {
    setGlossaryPage(1);
  }, [glossaryQuery]);

  useEffect(() => {
    if (glossaryPage > glossaryTotalPages) {
      setGlossaryPage(glossaryTotalPages);
    }
  }, [glossaryPage, glossaryTotalPages]);

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (row: UserRoleRow) => {
    setEditing(row);
    setEmailLookup(employeeByUserId.get(row.user_id)?.email || "");
    setFormUserId(row.user_id);
    setFormRole(row.role);
    setFormTenantId(row.tenant_id || "none");
    setDialogOpen(true);
  };

  const resolveUserByEmail = async () => {
    const email = emailLookup.trim().toLowerCase();
    if (!email) {
      toast.error("Isi email terlebih dahulu");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("employees")
        .select("user_id,email,name")
        .ilike("email", email)
        .not("user_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) throw error;

      const found = data?.[0];
      if (!found?.user_id) {
        toast.error("User ID tidak ditemukan dari email di tabel employees");
        return;
      }
      setFormUserId(found.user_id);
      toast.success(`User ditemukan: ${found.name || found.email}`);
    } catch (error) {
      const errorRef = reportError(error, "admin.roles.resolve_user", { email });
      toast.error(appendErrorReference("Gagal mencari user dari email", errorRef));
    }
  };

  const handleSave = async () => {
    const trimmedUserId = formUserId.trim();
    if (!trimmedUserId) {
      toast.error("User ID wajib diisi");
      return;
    }

    const tenantId = formTenantId === "none" ? null : formTenantId;
    if (formRole !== "super_admin" && !tenantId) {
      toast.error("Role selain Super Admin wajib punya tenant");
      return;
    }

    setIsSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("user_roles")
          .update({
            user_id: trimmedUserId,
            role: formRole,
            tenant_id: formRole === "super_admin" ? null : tenantId,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Role assignment berhasil diperbarui");
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({
            user_id: trimmedUserId,
            role: formRole,
            tenant_id: formRole === "super_admin" ? null : tenantId,
          });
        if (error) throw error;
        toast.success("Role assignment berhasil ditambahkan");
      }

      setDialogOpen(false);
      resetForm();
      await loadData();
    } catch (error) {
      const errorRef = reportError(error, "admin.roles.save", {
        mode: editing ? "update" : "insert",
        user_id: trimmedUserId,
        role: formRole,
        tenant_id: tenantId,
      });
      toast.error(appendErrorReference("Gagal menyimpan role assignment", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from("user_roles").delete().eq("id", deleting.id);
      if (error) throw error;

      toast.success("Role assignment berhasil dihapus");
      setDeleteOpen(false);
      setDeleting(null);
      await loadData();
    } catch (error) {
      const errorRef = reportError(error, "admin.roles.delete", {
        role_assignment_id: deleting.id,
        user_id: deleting.user_id,
      });
      toast.error(appendErrorReference("Gagal menghapus role assignment", errorRef));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SuperAdminLayout title="Role & Permission" subtitle="Manajemen assignment role pengguna sistem">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ROLE_DEFS.map((def) => {
            const Icon = def.icon;
            return (
              <Card key={def.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className={`rounded-lg p-2 ${def.color}`}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <CardTitle className="text-base">{def.name}</CardTitle>
                    </div>
                    <Badge variant="secondary">{roleCounts[def.id]} user</Badge>
                  </div>
                  <CardDescription>{def.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground line-clamp-2">{def.permissions.join(" • ")}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Daftar Role Assignment</CardTitle>
                <CardDescription>CRUD assignment role per user berdasarkan tabel `user_roles`.</CardDescription>
              </div>
              <Button onClick={openAddDialog}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Assignment
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {loadError}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Cari user/email/tenant..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as "all" | AppRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Role</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin_instansi">Admin Instansi</SelectItem>
                  <SelectItem value="atasan">Atasan</SelectItem>
                  <SelectItem value="pegawai">Pegawai</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Tenant</SelectItem>
                  <SelectItem value="none">Tanpa Tenant</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Dibuat</TableHead>
                    <TableHead className="w-[140px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Memuat data role...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : paginatedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        Tidak ada data role assignment.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRows.map((row) => {
                      const employee = employeeByUserId.get(row.user_id);
                      const tenantName = row.tenant_id ? (tenantNameMap.get(row.tenant_id) || row.tenant_id) : "-";
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium leading-none">{employee?.name || "(Tanpa nama)"}</p>
                              <p className="text-xs text-muted-foreground">{employee?.email || "email tidak ditemukan"}</p>
                              <p className="text-xs text-muted-foreground font-mono">{row.user_id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{ROLE_LABEL[row.role]}</Badge>
                          </TableCell>
                          <TableCell>{tenantName}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(row)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setDeleting(row);
                                  setDeleteOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Menampilkan {paginatedRows.length} dari {filteredRows.length} data
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => {
                        if (currentPage > 1) setCurrentPage((p) => p - 1);
                      }}
                      className={currentPage <= 1 ? "pointer-events-none opacity-50 cursor-pointer" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {visiblePages.map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={currentPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => {
                        if (currentPage < totalPages) setCurrentPage((p) => p + 1);
                      }}
                      className={currentPage >= totalPages ? "pointer-events-none opacity-50 cursor-pointer" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Glosarium Role & Permission</CardTitle>
            <CardDescription>
              Penjelasan istilah penting untuk memastikan konfigurasi akses dilakukan secara konsisten.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari istilah glosarium..."
                value={glossaryQuery}
                onChange={(e) => setGlossaryQuery(e.target.value)}
              />
            </div>

            <div className="rounded-md border divide-y">
              {paginatedGlossary.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                  Tidak ada istilah yang cocok.
                </div>
              ) : (
                paginatedGlossary.map((item) => (
                  <div key={item.term} className="px-4 py-3">
                    <p className="font-medium">{item.term}</p>
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    {item.reference ? (
                      <p className="text-xs text-muted-foreground mt-1">{item.reference}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Menampilkan {paginatedGlossary.length} dari {filteredGlossary.length} istilah
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => {
                        if (glossaryPage > 1) setGlossaryPage((p) => p - 1);
                      }}
                      className={glossaryPage <= 1 ? "pointer-events-none opacity-50 cursor-pointer" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: glossaryTotalPages }, (_, i) => i + 1).slice(
                    Math.max(0, glossaryPage - 3),
                    Math.max(0, glossaryPage - 3) + 5
                  ).map((page) => (
                    <PaginationItem key={`glossary-page-${page}`}>
                      <PaginationLink
                        onClick={() => setGlossaryPage(page)}
                        isActive={glossaryPage === page}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => {
                        if (glossaryPage < glossaryTotalPages) setGlossaryPage((p) => p + 1);
                      }}
                      className={glossaryPage >= glossaryTotalPages ? "pointer-events-none opacity-50 cursor-pointer" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Role Assignment" : "Tambah Role Assignment"}</DialogTitle>
            <DialogDescription>
              Tetapkan role pengguna ke tenant tertentu. Role `super_admin` tidak memerlukan tenant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email_lookup">Cari lewat email (opsional)</Label>
              <div className="flex gap-2">
                <Input
                  id="email_lookup"
                  placeholder="nama@instansi.go.id"
                  value={emailLookup}
                  onChange={(e) => setEmailLookup(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={resolveUserByEmail}>Cari</Button>
              </div>
              <p className="text-xs text-muted-foreground">Lookup email membaca tabel employees dan mengisi User ID otomatis jika ditemukan.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user_id">User ID</Label>
              <Input
                id="user_id"
                placeholder="UUID user"
                value={formUserId}
                onChange={(e) => setFormUserId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formRole} onValueChange={(value) => setFormRole(value as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin_instansi">Admin Instansi</SelectItem>
                  <SelectItem value="atasan">Atasan</SelectItem>
                  <SelectItem value="pegawai">Pegawai</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tenant</Label>
              <Select value={formTenantId} onValueChange={setFormTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa Tenant</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus assignment role?</AlertDialogTitle>
            <AlertDialogDescription>
              Role `{deleting ? ROLE_LABEL[deleting.role] : "-"}` untuk user `{deleting?.user_id || "-"}` akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleting(null)}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminLayout>
  );
}
