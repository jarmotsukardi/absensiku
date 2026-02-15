import { useCallback, useEffect, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Bell, Plus, Send, Trash2, Users, Search, Mail, AlertCircle, CheckCircle, Info, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  employee_name?: string;
}

interface Employee {
  id: string;
  user_id: string;
  name: string;
  position: string | null;
}

export default function OrgNotificationManagement() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  
  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<string>("info");
  const [targetType, setTargetType] = useState<string>("all");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);

  const fetchNotifications = useCallback(async (tid: string) => {
    try {
    // Get all employee user_ids for this tenant
    const { data: empData, error: empError } = await supabase
      .from("employees")
      .select("user_id, name")
      .eq("tenant_id", tid);
    if (empError) throw empError;

    if (!empData || empData.length === 0) {
      setNotifications([]);
      return;
    }

    const userIds = empData.map(e => e.user_id).filter(Boolean);
    if (userIds.length === 0) {
      setNotifications([]);
      return;
    }
    const userNameMap = new Map(empData.map(e => [e.user_id, e.name]));

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .limit(200);

    if (!error && data) {
      const enriched = data.map(n => ({
        ...n,
        employee_name: userNameMap.get(n.user_id) || "Unknown"
      }));
      setNotifications(enriched);
      return;
    }

      if (error) throw error;
    } catch (error) {
      const errorRef = reportError(error, "org.notifications.fetch_notifications", { tenant_id: tid });
      toast.error(appendErrorReference("Gagal memuat notifikasi organisasi", errorRef));
      setNotifications([]);
    }
  }, []);

  const fetchEmployees = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from("employees")
      .select("id, user_id, name, position")
      .eq("tenant_id", tid)
      .eq("is_active", true)
      .order("name");
    if (error) {
      const errorRef = reportError(error, "org.notifications.fetch_employees", { tenant_id: tid });
      toast.error(appendErrorReference("Gagal memuat data pegawai", errorRef));
      setEmployees([]);
      return;
    }

    if (data) {
      setEmployees(data as Employee[]);
    } else {
      setEmployees([]);
    }
  }, []);

  const fetchTenantAndData = useCallback(async () => {
    try {
      const resolvedTenantId = await resolveOrgTenantId();
      if (resolvedTenantId) {
        setTenantId(resolvedTenantId);
        await Promise.all([
          fetchNotifications(resolvedTenantId),
          fetchEmployees(resolvedTenantId),
        ]);
      } else {
        setTenantId(null);
        setEmployees([]);
        setNotifications([]);
        toast.info("Tenant organisasi tidak ditemukan.");
      }
    } catch (error) {
      const errorRef = reportError(error, "org.notifications.fetch_tenant_and_data");
      toast.error(appendErrorReference("Gagal memuat halaman notifikasi", errorRef));
      setEmployees([]);
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchEmployees, fetchNotifications]);

  useEffect(() => {
    void fetchTenantAndData();
  }, [fetchTenantAndData]);

  const sendNotification = async () => {
    if (!title || !message) {
      toast.error("Judul dan pesan wajib diisi");
      return;
    }

    if (!tenantId) {
      toast.error("Tenant tidak ditemukan");
      return;
    }

    setIsSending(true);
    
    try {
      let targetUserIds: string[] = [];

      if (targetType === "all") {
        targetUserIds = employees.map(e => e.user_id).filter(Boolean) as string[];
      } else if (targetType === "selected") {
        if (selectedEmployees.length === 0) {
          toast.error("Pilih minimal satu pegawai");
          setIsSending(false);
          return;
        }
        targetUserIds = employees
          .filter(e => selectedEmployees.includes(e.id))
          .map(e => e.user_id)
          .filter(Boolean) as string[];
      }

      if (targetUserIds.length === 0) {
        toast.error("Tidak ada pegawai yang ditemukan");
        setIsSending(false);
        return;
      }

      const notificationsToInsert = targetUserIds.map(userId => ({
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

      toast.success(`Notifikasi berhasil dikirim ke ${targetUserIds.length} pegawai`);
      setIsDialogOpen(false);
      resetForm();
      if (tenantId) void fetchNotifications(tenantId);
    } catch (error) {
      const errorRef = reportError(error, "org.notifications.send", {
        tenant_id: tenantId,
        target_type: targetType,
        recipients_count: targetType === "all" ? employees.length : selectedEmployees.length,
      });
      toast.error(appendErrorReference("Gagal mengirim notifikasi", errorRef));
    } finally {
      setIsSending(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setType("info");
    setTargetType("all");
    setSelectedEmployees([]);
  };

  const deleteNotification = async (id: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;

      toast.success("Notifikasi berhasil dihapus");
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (error) {
      const errorRef = reportError(error, "org.notifications.delete", { notification_id: id, tenant_id: tenantId });
      toast.error(appendErrorReference("Gagal menghapus notifikasi", errorRef));
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
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

  const filteredNotifications = notifications.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         n.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         n.employee_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || n.type === filterType;
    return matchesSearch && matchesType;
  });

  const stats = {
    total: notifications.length,
    read: notifications.filter(n => n.is_read).length,
    unread: notifications.filter(n => !n.is_read).length,
  };

  if (isLoading) {
    return (
      <OrganizationLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manajemen Notifikasi</h1>
            <p className="text-muted-foreground">Kirim notifikasi ke pegawai organisasi Anda</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Kirim Notifikasi
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Kirim Notifikasi
                </DialogTitle>
                <DialogDescription>
                  Kirim notifikasi ke semua atau pegawai tertentu
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
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Semua Pegawai ({employees.length})
                        </div>
                      </SelectItem>
                      <SelectItem value="selected">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Pilih Pegawai
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {targetType === "selected" && (
                  <div className="space-y-2">
                    <Label>Pilih Pegawai</Label>
                    <ScrollArea className="h-[150px] rounded-md border p-2">
                      <div className="space-y-2">
                        {employees.map((emp) => (
                          <label 
                            key={emp.id} 
                            className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedEmployees.includes(emp.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEmployees([...selectedEmployees, emp.id]);
                                } else {
                                  setSelectedEmployees(selectedEmployees.filter(id => id !== emp.id));
                                }
                              }}
                              className="rounded"
                            />
                            <div>
                              <p className="text-sm font-medium">{emp.name}</p>
                              {emp.position && (
                                <p className="text-xs text-muted-foreground">{emp.position}</p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground">
                      {selectedEmployees.length} pegawai dipilih
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Tipe Notifikasi</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih tipe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 text-blue-500" />
                          Info
                        </div>
                      </SelectItem>
                      <SelectItem value="success">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          Sukses
                        </div>
                      </SelectItem>
                      <SelectItem value="warning">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          Peringatan
                        </div>
                      </SelectItem>
                      <SelectItem value="error">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          Error
                        </div>
                      </SelectItem>
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
                <Button onClick={sendNotification} disabled={isSending} className="gap-2">
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isSending ? "Mengirim..." : "Kirim"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total Notifikasi</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.read}</p>
                  <p className="text-sm text-muted-foreground">Sudah Dibaca</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.unread}</p>
                  <p className="text-sm text-muted-foreground">Belum Dibaca</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari notifikasi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[150px]">
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
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => tenantId && fetchNotifications(tenantId)}
              >
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
              Daftar notifikasi yang telah dikirim ke pegawai
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Penerima</TableHead>
                    <TableHead>Notifikasi</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead className="w-[60px]">Aksi</TableHead>
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
                  ) : filteredNotifications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        Belum ada notifikasi
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredNotifications.map((notification) => (
                      <TableRow key={notification.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{notification.employee_name}</p>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-sm">{notification.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {notification.message}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{getTypeBadge(notification.type)}</TableCell>
                        <TableCell>
                          {notification.is_read ? (
                            <Badge variant="outline" className="text-green-600 border-green-500/30">
                              Dibaca
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-500/30">
                              Belum
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
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
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
