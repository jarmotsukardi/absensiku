import { useCallback, useEffect, useState } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Bell, Plus, Send, Trash2, Search, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface TenantOption {
  id: string;
  name: string;
}

export default function NotificationManagement() {
  const PAGE_SIZE = 20;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [readCount, setReadCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<string>("info");
  const [targetType, setTargetType] = useState<string>("all_admin");
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  const requiresTenantTarget = targetType === "org_admin" || targetType === "org_employee";
  const selectedTenantName = tenants.find((tenant) => tenant.id === selectedTenantId)?.name || "";

  const applyNotificationFilters = useCallback(
    <T,>(query: T) => {
      let nextQuery = query as T & {
        eq: (column: string, value: unknown) => typeof query;
        or: (filters: string) => typeof query;
      };

      if (filterType !== "all") {
        nextQuery = nextQuery.eq("type", filterType) as typeof nextQuery;
      }

      if (searchQuery.trim()) {
        const escaped = searchQuery.trim().replace(/[%_]/g, "\\$&");
        nextQuery = nextQuery.or(`title.ilike.%${escaped}%,message.ilike.%${escaped}%`) as typeof nextQuery;
      }

      return nextQuery;
    },
    [filterType, searchQuery]
  );

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const pagedQuery = applyNotificationFilters(
        supabase
          .from("notifications")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1)
      );

      const readCountQuery = applyNotificationFilters(
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("is_read", true)
      );

      const unreadCountQuery = applyNotificationFilters(
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("is_read", false)
      );

      const [{ data, error, count }, readRes, unreadRes] = await Promise.all([
        pagedQuery,
        readCountQuery,
        unreadCountQuery,
      ]);
      if (error) throw error;
      if (readRes.error) throw readRes.error;
      if (unreadRes.error) throw unreadRes.error;

      setNotifications((data || []) as Notification[]);
      setTotalCount(count || 0);
      setReadCount(readRes.count || 0);
      setUnreadCount(unreadRes.count || 0);
    } catch (error) {
      const errorRef = reportError(error, "admin.notifications.fetch", {
        filter_type: filterType,
        page: currentPage,
      });
      toast.error(appendErrorReference("Gagal memuat notifikasi", errorRef));
      setNotifications([]);
      setTotalCount(0);
      setReadCount(0);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [applyNotificationFilters, currentPage, filterType]);

  const fetchTenants = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setTenants((data || []) as TenantOption[]);
    } catch (error) {
      const errorRef = reportError(error, "admin.notifications.fetch_tenants");
      toast.error(appendErrorReference("Gagal memuat daftar organisasi", errorRef));
      setTenants([]);
    }
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    void fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    if (!requiresTenantTarget) {
      setSelectedTenantId("");
    }
  }, [requiresTenantTarget]);

  const sendBroadcastNotification = async () => {
    if (!title || !message) {
      toast.error("Judul dan pesan wajib diisi");
      return;
    }

    if (requiresTenantTarget && !selectedTenantId) {
      toast.error("Pilih organisasi terlebih dahulu");
      return;
    }

    setIsSending(true);
    
    try {
      // Get all users based on target
      let uniqueUserIds: string[] = [];

      if (targetType === "all_admin") {
        const { data: users, error: usersError } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["super_admin", "admin_instansi"]);
        if (usersError) throw usersError;
        uniqueUserIds = Array.from(new Set((users || []).map((u) => u.user_id).filter(Boolean))) as string[];
      } else if (targetType === "org_admin") {
        const { data: users, error: usersError } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("tenant_id", selectedTenantId)
          .eq("role", "admin_instansi");
        if (usersError) throw usersError;
        uniqueUserIds = Array.from(new Set((users || []).map((u) => u.user_id).filter(Boolean))) as string[];
      } else if (targetType === "org_employee") {
        const { data: employeeRows, error: employeeError } = await supabase
          .from("employees")
          .select("user_id")
          .eq("tenant_id", selectedTenantId)
          .eq("is_active", true)
          .not("user_id", "is", null);
        if (employeeError) throw employeeError;
        uniqueUserIds = Array.from(new Set((employeeRows || []).map((e) => e.user_id).filter(Boolean))) as string[];
      }

      if (uniqueUserIds.length === 0) {
        toast.error("Tidak ada user yang ditemukan");
        return;
      }

      // Create notifications for all users
      const notificationsToInsert = uniqueUserIds.map(userId => ({
        user_id: userId,
        title,
        message,
        type,
        is_read: false,
      }));

      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notificationsToInsert);

      if (insertError) throw insertError;

      const targetLabel =
        targetType === "all_admin"
          ? "seluruh admin"
          : targetType === "org_admin"
            ? `admin organisasi ${selectedTenantName || "terpilih"}`
            : `pegawai organisasi ${selectedTenantName || "terpilih"}`;
      toast.success(`Notifikasi berhasil dikirim ke ${uniqueUserIds.length} user (${targetLabel})`);
      setIsDialogOpen(false);
      setTitle("");
      setMessage("");
      setType("info");
      setTargetType("all_admin");
      setSelectedTenantId("");
      await fetchNotifications();
    } catch (error) {
      const errorRef = reportError(error, "admin.notifications.send", {
        target_type: targetType,
        tenant_id: selectedTenantId || null,
      });
      toast.error(appendErrorReference("Gagal mengirim notifikasi", errorRef));
    } finally {
      setIsSending(false);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      const deletedNotification = notifications.find((notification) => notification.id === id) || null;
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Notifikasi berhasil dihapus");
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotalCount((prev) => Math.max(0, prev - 1));
      if (deletedNotification) {
        if (deletedNotification.is_read) {
          setReadCount((prev) => Math.max(0, prev - 1));
        } else {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      }
      if (notifications.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      }
    } catch (error) {
      const errorRef = reportError(error, "admin.notifications.delete", { notification_id: id });
      toast.error(appendErrorReference("Gagal menghapus notifikasi", errorRef));
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'success':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Sukses</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Peringatan</Badge>;
      case 'error':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Error</Badge>;
      default:
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Info</Badge>;
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <SuperAdminLayout
      title="Manajemen Notifikasi"
      subtitle="Kelola dan kirim notifikasi ke pengguna"
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalCount}</p>
                  <p className="text-sm text-muted-foreground">Total Notifikasi</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {readCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Sudah Dibaca</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {unreadCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Belum Dibaca</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-center h-full">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Kirim Notifikasi
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Kirim Notifikasi Broadcast</DialogTitle>
                    <DialogDescription>
                      Kirim notifikasi ke semua pengguna atau grup tertentu
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Target Penerima</Label>
                      <Select value={targetType} onValueChange={setTargetType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih target" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all_admin">Seluruh Admin</SelectItem>
                          <SelectItem value="org_admin">Admin Organisasi (pilih organisasi)</SelectItem>
                          <SelectItem value="org_employee">Pegawai Suatu Organisasi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {requiresTenantTarget && (
                      <div className="space-y-2">
                        <Label>Nama Organisasi</Label>
                        <SearchableSelect
                          value={selectedTenantId}
                          onValueChange={setSelectedTenantId}
                          options={tenants.map((tenant) => ({
                            value: tenant.id,
                            label: tenant.name,
                          }))}
                          placeholder="Pilih nama organisasi"
                          searchPlaceholder="Cari nama organisasi..."
                          emptyMessage="Organisasi tidak ditemukan."
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Tipe Notifikasi</Label>
                      <Select value={type} onValueChange={setType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih tipe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">Info</SelectItem>
                          <SelectItem value="success">Sukses</SelectItem>
                          <SelectItem value="warning">Peringatan</SelectItem>
                          <SelectItem value="error">Error</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Judul</Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Judul notifikasi"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pesan</Label>
                      <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Isi pesan notifikasi"
                        rows={4}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button onClick={sendBroadcastNotification} disabled={isSending || (requiresTenantTarget && !selectedTenantId)}>
                      <Send className="h-4 w-4 mr-2" />
                      {isSending ? "Mengirim..." : "Kirim"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cari judul/pesan notifikasi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Filter tipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Sukses</SelectItem>
                  <SelectItem value="warning">Peringatan</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => void fetchNotifications()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Riwayat Notifikasi
            </CardTitle>
            <CardDescription>
              Daftar semua notifikasi yang telah dikirim
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Judul</TableHead>
                  <TableHead>Pesan</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead className="w-[80px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        Memuat...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : notifications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Belum ada notifikasi
                    </TableCell>
                  </TableRow>
                ) : (
                  notifications.map((notification) => (
                    <TableRow key={notification.id}>
                      <TableCell className="font-medium">{notification.title}</TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {notification.message}
                      </TableCell>
                      <TableCell>{getTypeBadge(notification.type)}</TableCell>
                      <TableCell>
                        {notification.is_read ? (
                          <Badge variant="outline" className="text-green-600">Dibaca</Badge>
                        ) : (
                          <Badge variant="outline" className="text-yellow-600">Belum</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                          locale: localeId,
                        })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteNotification(notification.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1) setCurrentPage((prev) => prev - 1);
                        }}
                        className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                      .map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(page);
                            }}
                            isActive={currentPage === page}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
                        }}
                        className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SuperAdminLayout>
  );
}
