import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogActionHint, dialogActionBarClassName } from "@/components/ui/dialog-action-bar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Building2, 
  Plus, 
  Search, 
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Landmark,
  Building,
  Briefcase,
  GraduationCap,
  Users,
  Loader2,
  X,
  PanelRightOpen,
  FileStack,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { OrganizationDetailPanel } from "@/components/admin/organization/OrganizationDetailPanel";
import AdminInstitutionTypesManagement from "@/pages/admin/InstitutionTypesManagement";

const ITEMS_PER_PAGE = 15;
const ORGANIZATIONS_QUERY_TIMEOUT_MS = 12000;
const ORGANIZATIONS_QUERY_RETRY_MAX = 2;

interface Organization {
  id: string;
  name: string;
  code: string;
  organization_type: string;
  is_active: boolean;
  created_at: string;
  email: string | null;
  phone: string | null;
}

const orgTypeIcons: Record<string, typeof Building2> = {
  pemerintah_daerah: Landmark,
  instansi_pemerintah: Building,
  perusahaan: Briefcase,
  sekolah: GraduationCap,
};

const orgTypeLabels: Record<string, string> = {
  pemerintah_daerah: "Pemerintah Daerah",
  instansi_pemerintah: "Instansi Pemerintah",
  perusahaan: "Perusahaan",
  sekolah: "Sekolah",
};

export default function Organizations() {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [mainView, setMainView] = useState<"organizations" | "institution-types">("organizations");
  
  // Detail panel state
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  
  // Edit dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState<Organization | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    code: "",
    email: "",
    phone: "",
    organization_type: "",
    is_active: true,
  });

  const fetchOrganizations = useCallback(async () => {
    setLoadError(null);
    try {
      setIsLoading(true);
      setIsRetrying(false);

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      const escapedQuery = searchQuery.trim().replace(/[%_]/g, "\\$&");

      const buildQuery = () => {
        let query = supabase
          .from("tenants")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(from, to);

        if (activeTab !== "all") {
          query = query.eq("organization_type", activeTab as Organization["organization_type"]);
        }

        if (escapedQuery) {
          query = query.or(
            `name.ilike.%${escapedQuery}%,code.ilike.%${escapedQuery}%,email.ilike.%${escapedQuery}%`
          );
        }

        return query;
      };

      const { data, count, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            buildQuery(),
            ORGANIZATIONS_QUERY_TIMEOUT_MS,
            "admin.organizations.fetch timeout"
          ),
        {
          maxRetries: ORGANIZATIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      setOrganizations(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      const errorRef = reportError(error, "admin.organizations.fetch");
      const message = appendErrorReference("Gagal memuat daftar organisasi", errorRef);
      toast.error(message);
      setLoadError(message);
      setOrganizations([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, currentPage, searchQuery]);

  useEffect(() => {
    if (mainView !== "organizations") return;
    void fetchOrganizations();
  }, [fetchOrganizations, mainView]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab]);

  const openEditDialog = (org: Organization) => {
    setEditingOrg(org);
    setEditForm({
      name: org.name,
      code: org.code,
      email: org.email || "",
      phone: org.phone || "",
      organization_type: org.organization_type,
      is_active: org.is_active,
    });
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingOrg) return;
    setIsSaving(true);
    setLoadError(null);
    
    try {
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("tenants")
              .update({
                name: editForm.name,
                email: editForm.email || null,
                phone: editForm.phone || null,
                is_active: editForm.is_active,
              })
              .eq("id", editingOrg.id),
            ORGANIZATIONS_QUERY_TIMEOUT_MS,
            "admin.organizations.update timeout"
          ),
        {
          maxRetries: ORGANIZATIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;
      
      toast.success("Organisasi berhasil diperbarui");
      setIsEditOpen(false);
      void fetchOrganizations();
    } catch (error) {
      const errorRef = reportError(error, "admin.organizations.update", {
        tenant_id: editingOrg.id,
      });
      const message = appendErrorReference("Gagal memperbarui organisasi", errorRef);
      toast.error(message);
      setLoadError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteDialog = (org: Organization) => {
    setDeletingOrg(org);
    setIsDeleteOpen(true);
  };

  const handleDeleteOrganization = async () => {
    if (!deletingOrg) return;
    setIsDeleting(true);
    setLoadError(null);
    try {
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase
              .from("tenants")
              .delete()
              .eq("id", deletingOrg.id),
            ORGANIZATIONS_QUERY_TIMEOUT_MS,
            "admin.organizations.delete timeout"
          ),
        {
          maxRetries: ORGANIZATIONS_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );

      if (error) throw error;

      toast.success("Organisasi berhasil dihapus");
      setIsDeleteOpen(false);
      setDeletingOrg(null);
      if (selectedOrgId === deletingOrg.id) {
        setSelectedOrgId(null);
      }
      void fetchOrganizations();
    } catch (error) {
      const errorRef = reportError(error, "admin.organizations.delete", {
        tenant_id: deletingOrg.id,
      });
      const message = appendErrorReference("Gagal menghapus organisasi", errorRef);
      toast.error(message);
      setLoadError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs = [
    { id: "all", label: "Semua", icon: Building2 },
    { id: "pemerintah_daerah", label: "Pemda", icon: Landmark },
    { id: "instansi_pemerintah", label: "Instansi", icon: Building },
    { id: "perusahaan", label: "Perusahaan", icon: Briefcase },
    { id: "sekolah", label: "Sekolah", icon: GraduationCap },
  ];

  // Pagination
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  return (
    <SuperAdminLayout title="Organisasi" subtitle="Kelola semua organisasi terdaftar">
      <Tabs
        value={mainView}
        onValueChange={(value) => setMainView(value as "organizations" | "institution-types")}
        className="space-y-6"
      >
        <div className="overflow-x-auto pb-1">
          <TabsList className="min-w-max h-auto gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
            <TabsTrigger value="organizations" className="gap-2 whitespace-nowrap">
              <Building2 className="h-4 w-4" />
              Daftar Organisasi
            </TabsTrigger>
            <TabsTrigger value="institution-types" className="gap-2 whitespace-nowrap">
              <FileStack className="h-4 w-4" />
              Jenis Instansi
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="organizations">
      <div className="flex h-full">
        <div className={`flex-1 space-y-6 ${selectedOrgId ? 'pr-4' : ''}`}>
        {/* Header Actions */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama, kode, atau email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => navigate("/admin/organizations/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Tambah Organisasi
          </Button>
        </div>

        {/* Tabs & Table */}
        <Card>
          <CardHeader className="pb-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="overflow-x-auto pb-1">
                <TabsList className="min-w-max h-auto gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.id} value={tab.id} className="gap-2 whitespace-nowrap">
                      <tab.icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
          </CardHeader>
          <CardContent>
            {isRetrying && (
              <div className="mb-4 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Sedang mencoba ulang memuat data organisasi...
              </div>
            )}
            {loadError && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <span>{loadError}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-white"
                  onClick={() => void fetchOrganizations()}
                >
                  Coba Lagi
                </Button>
              </div>
            )}
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 animate-pulse">
                    <div className="h-10 w-10 rounded-full bg-muted"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-48"></div>
                      <div className="h-3 bg-muted rounded w-32"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : organizations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Tidak ada organisasi ditemukan</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organisasi</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Kode</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tanggal Daftar</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {organizations.map((org) => {
                      const Icon = orgTypeIcons[org.organization_type] || Building2;
                      return (
                        <TableRow key={org.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-primary/10 text-primary">
                                  <Icon className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{org.name}</p>
                                <p className="text-xs text-muted-foreground">{org.email || "-"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {orgTypeLabels[org.organization_type] || org.organization_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{org.code}</TableCell>
                          <TableCell>
                            <Badge variant={org.is_active ? "default" : "secondary"}>
                              {org.is_active ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(org.created_at), "d MMM yyyy", { locale: id })}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setSelectedOrgId(org.id)}>
                                  <PanelRightOpen className="h-4 w-4 mr-2" />
                                  Lihat Detail
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditDialog(org)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => openDeleteDialog(org)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Hapus
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Menampilkan {totalCount === 0 ? 0 : ((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(((currentPage - 1) * ITEMS_PER_PAGE) + organizations.length, totalCount)} dari {totalCount} organisasi
                    </p>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let page: number;
                          if (totalPages <= 5) {
                            page = i + 1;
                          } else if (currentPage <= 3) {
                            page = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            page = totalPages - 4 + i;
                          } else {
                            page = currentPage - 2 + i;
                          }
                          return (
                            <PaginationItem key={page}>
                              <PaginationLink
                                onClick={() => setCurrentPage(page)}
                                isActive={currentPage === page}
                                className="cursor-pointer"
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        <PaginationItem>
                          <PaginationNext 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Organisasi</DialogTitle>
              <DialogDescription>Perbarui informasi organisasi</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nama Organisasi</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Nama organisasi"
                />
              </div>
              <div className="space-y-2">
                <Label>Kode</Label>
                <Input value={editForm.code} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Kode tidak dapat diubah</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telepon</Label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tipe Organisasi</Label>
                <Input 
                  value={orgTypeLabels[editForm.organization_type] || editForm.organization_type}
                  disabled 
                  className="bg-muted" 
                />
                <p className="text-xs text-muted-foreground">Tipe organisasi hanya dapat diubah oleh admin organisasi melalui menu pengaturan organisasi</p>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label>Status Aktif</Label>
                  <p className="text-xs text-muted-foreground">Nonaktifkan untuk melarang akses</p>
                </div>
                <Switch
                  checked={editForm.is_active}
                  onCheckedChange={(c) => setEditForm({ ...editForm, is_active: c })}
                />
              </div>
            </div>
            <DialogFooter className={dialogActionBarClassName}>
              <DialogActionHint>Perubahan profil organisasi langsung terlihat pada dashboard tenant.</DialogActionHint>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                <Button variant="outline" className="w-full sm:w-auto bg-white" onClick={() => setIsEditOpen(false)}>Batal</Button>
                <Button className="w-full sm:w-auto" onClick={handleSaveEdit} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Simpan
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog
          open={isDeleteOpen}
          onOpenChange={(open) => {
            if (!isDeleting) {
              setIsDeleteOpen(open);
              if (!open) setDeletingOrg(null);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Hapus Organisasi</DialogTitle>
              <DialogDescription>
                Tindakan ini akan menghapus organisasi{deletingOrg ? ` "${deletingOrg.name}"` : ""}. Aksi ini tidak dapat dibatalkan.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className={dialogActionBarClassName}>
              <DialogActionHint>Tindakan hapus bersifat permanen dan tidak dapat dipulihkan.</DialogActionHint>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto bg-white"
                  onClick={() => {
                    setIsDeleteOpen(false);
                    setDeletingOrg(null);
                  }}
                  disabled={isDeleting}
                >
                  Batal
                </Button>
                <Button className="w-full sm:w-auto" variant="destructive" onClick={handleDeleteOrganization} disabled={isDeleting}>
                  {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Hapus
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
        
        {/* Detail Panel */}
        {selectedOrgId && (
          <OrganizationDetailPanel 
            orgId={selectedOrgId} 
            onClose={() => setSelectedOrgId(null)} 
          />
        )}
      </div>
        </TabsContent>

        <TabsContent value="institution-types">
          <AdminInstitutionTypesManagement embedded />
        </TabsContent>
      </Tabs>
    </SuperAdminLayout>
  );
}
