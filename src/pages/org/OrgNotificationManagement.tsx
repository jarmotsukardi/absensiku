import { useCallback, useEffect, useMemo, useState } from "react";
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
  employee_name?: string;
}

interface Employee {
  id: string;
  user_id: string | null;
  name: string;
  position: string | null;
  opd_id: string | null;
  work_unit_id: string | null;
}

interface OPDOption {
  id: string;
  name: string;
  code: string;
  is_active: boolean | null;
}

interface WorkUnitOption {
  id: string;
  name: string;
  code: string | null;
  opd_id: string | null;
  is_active: boolean | null;
}

export default function OrgNotificationManagement() {
  const PAGE_SIZE = 20;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [notifiableEmployeeIds, setNotifiableEmployeeIds] = useState<string[]>([]);
  const [opdOptions, setOpdOptions] = useState<OPDOption[]>([]);
  const [workUnitOptions, setWorkUnitOptions] = useState<WorkUnitOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<string>("info");
  const [targetType, setTargetType] = useState<string>("all");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedOpdId, setSelectedOpdId] = useState<string>("");
  const [selectedWorkUnitId, setSelectedWorkUnitId] = useState<string>("");
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
  const notifiableIdSet = useMemo(() => new Set(notifiableEmployeeIds), [notifiableEmployeeIds]);

  const targetBaseEmployees = useMemo(() => {
    switch (targetType) {
      case "selected":
        return employees.filter((e) => selectedEmployees.includes(e.id));
      case "opd":
        if (!selectedOpdId) return [];
        return employees.filter((e) => e.opd_id === selectedOpdId);
      case "work_unit":
        if (!selectedWorkUnitId) return [];
        return employees.filter((e) => e.work_unit_id === selectedWorkUnitId);
      case "all":
      default:
        return employees;
    }
  }, [employees, selectedEmployees, selectedOpdId, selectedWorkUnitId, targetType]);

  const finalRecipients = useMemo(() => {
    const base = targetBaseEmployees;

    const seen = new Set<string>();
    return base.filter((e) => {
      if (!notifiableIdSet.has(e.id)) return false;
      if (!e.user_id) return false;
      if (seen.has(e.user_id)) return false;
      seen.add(e.user_id);
      return true;
    });
  }, [notifiableIdSet, targetBaseEmployees]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearchQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((emp) => emp.name.toLowerCase().includes(q));
  }, [employeeSearchQuery, employees]);

  const selectedWorkUnitOption = useMemo(
    () => workUnitOptions.find((unit) => unit.id === selectedWorkUnitId) || null,
    [selectedWorkUnitId, workUnitOptions]
  );

  const filteredWorkUnitOptions = useMemo(() => {
    if (!selectedOpdId) return workUnitOptions;
    return workUnitOptions.filter((unit) => unit.opd_id === selectedOpdId);
  }, [selectedOpdId, workUnitOptions]);

  const selectedOpdOption = useMemo(
    () => opdOptions.find((opd) => opd.id === selectedOpdId) || null,
    [opdOptions, selectedOpdId]
  );

  const fetchActiveEmployees = useCallback(async (tid: string): Promise<Employee[]> => {
    const { data, error } = await supabase
      .from("employees")
      .select("id, user_id, name, position, opd_id, work_unit_id")
      .eq("tenant_id", tid)
      .eq("is_active", true)
      .order("name");

    if (error) throw error;
    return (data || []) as Employee[];
  }, []);

  const fetchTargetScopes = useCallback(async (tid: string) => {
    const [opdRes, workUnitsRes] = await Promise.all([
      supabase
        .from("opd")
        .select("id, name, code, is_active")
        .eq("tenant_id", tid)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("work_units")
        .select("id, name, code, opd_id, is_active")
        .eq("tenant_id", tid)
        .eq("is_active", true)
        .order("name"),
    ]);

    if (opdRes.error) throw opdRes.error;
    if (workUnitsRes.error) throw workUnitsRes.error;

    setOpdOptions((opdRes.data || []) as OPDOption[]);
    setWorkUnitOptions((workUnitsRes.data || []) as WorkUnitOption[]);
  }, []);

  const resolveNotifiableEmployees = useCallback(async (baseEmployees: Employee[]): Promise<Employee[]> => {
    if (baseEmployees.length === 0) return [];

    const userIds = baseEmployees.map((e) => e.user_id).filter(Boolean) as string[];
    let roleRows: Array<{ user_id: string; role: string }> = [];
    if (userIds.length > 0) {
      const { data: fetchedRoles, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds)
        .in("role", ["pegawai", "atasan", "admin_instansi", "super_admin"]);
      if (roleError) throw roleError;
      roleRows = (fetchedRoles || []) as Array<{ user_id: string; role: string }>;
    }

    const roleMap = new Map<string, Set<string>>();
    roleRows.forEach((row) => {
      if (!row.user_id) return;
      if (!roleMap.has(row.user_id)) roleMap.set(row.user_id, new Set<string>());
      roleMap.get(row.user_id)!.add(row.role);
    });

    // Legacy-safe:
    // - include: pegawai / atasan / belum punya role (data lama)
    // - exclude: admin_instansi / super_admin tanpa role pegawai/atasan
    return baseEmployees.filter((e) => {
      if (!e.user_id) return false;
      const roles = e.user_id ? roleMap.get(e.user_id) : undefined;
      if (!roles || roles.size === 0) return true;
      if (roles.has("pegawai") || roles.has("atasan")) return true;
      if (roles.has("admin_instansi") || roles.has("super_admin")) return false;
      return true;
    });
  }, []);

  const fetchNotifications = useCallback(async (tid: string) => {
    try {
    const activeEmployees = await fetchActiveEmployees(tid);
    const recipients = await resolveNotifiableEmployees(activeEmployees);

    if (!recipients || recipients.length === 0) {
      setNotifications([]);
      return;
    }

    const userIds = recipients.map(e => e.user_id).filter(Boolean) as string[];
    if (userIds.length === 0) {
      setNotifications([]);
      return;
    }
    const userNameMap = new Map(recipients.map(e => [e.user_id, e.name]));

    let query = supabase
      .from('notifications')
      .select('*', { count: "exact" })
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

    if (filterType !== "all") {
      query = query.eq("type", filterType);
    }
    if (searchQuery.trim()) {
      const escaped = searchQuery.trim().replace(/[%_]/g, "\\$&");
      query = query.or(`title.ilike.%${escaped}%,message.ilike.%${escaped}%`);
    }

    const { data, error, count } = await query;

    if (!error && data) {
      const enriched = data.map(n => ({
        ...n,
        employee_name: userNameMap.get(n.user_id) || "Unknown"
      }));
      setNotifications(enriched);
      setTotalCount(count || 0);
      return;
    }

      if (error) throw error;
    } catch (error) {
      const errorRef = reportError(error, "org.notifications.fetch_notifications", { tenant_id: tid });
      toast.error(appendErrorReference("Gagal memuat notifikasi organisasi", errorRef));
      setNotifications([]);
    }
  }, [currentPage, fetchActiveEmployees, filterType, resolveNotifiableEmployees, searchQuery]);

  const fetchEmployees = useCallback(async (tid: string) => {
    try {
      const activeEmployees = await fetchActiveEmployees(tid);
      setEmployees(activeEmployees);
      const recipients = await resolveNotifiableEmployees(activeEmployees);
      setNotifiableEmployeeIds(recipients.map((emp) => emp.id));
    } catch (error) {
      const errorRef = reportError(error, "org.notifications.fetch_employees", { tenant_id: tid });
      toast.error(appendErrorReference("Gagal memuat data pegawai", errorRef));
      setEmployees([]);
      setNotifiableEmployeeIds([]);
    }
  }, [fetchActiveEmployees, resolveNotifiableEmployees]);

  const fetchTenantAndData = useCallback(async () => {
    try {
      const resolvedTenantId = await resolveOrgTenantId();
      if (resolvedTenantId) {
        setTenantId(resolvedTenantId);
        await Promise.all([fetchEmployees(resolvedTenantId), fetchTargetScopes(resolvedTenantId)]);
      } else {
        setTenantId(null);
        setEmployees([]);
        setNotifiableEmployeeIds([]);
        setOpdOptions([]);
        setWorkUnitOptions([]);
        setNotifications([]);
        toast.info("Tenant organisasi tidak ditemukan.");
      }
    } catch (error) {
      const errorRef = reportError(error, "org.notifications.fetch_tenant_and_data");
      toast.error(appendErrorReference("Gagal memuat halaman notifikasi", errorRef));
      setEmployees([]);
      setNotifiableEmployeeIds([]);
      setOpdOptions([]);
      setWorkUnitOptions([]);
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchEmployees, fetchTargetScopes]);

  useEffect(() => {
    void fetchTenantAndData();
  }, [fetchTenantAndData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType]);

  useEffect(() => {
    if (!tenantId) return;
    void fetchNotifications(tenantId);
  }, [fetchNotifications, tenantId]);

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
      if (targetType === "selected" && selectedEmployees.length === 0) {
        toast.error("Pilih minimal satu pegawai");
        setIsSending(false);
        return;
      }

      if (targetType === "opd" && !selectedOpdId) {
        toast.error("Pilih OPD target terlebih dahulu");
        setIsSending(false);
        return;
      }

      if (targetType === "work_unit" && !selectedWorkUnitId) {
        toast.error("Pilih satuan kerja target terlebih dahulu");
        setIsSending(false);
        return;
      }

      const targetBase = targetBaseEmployees;

      const targetRecipients = targetBase.filter((e) => !!e.user_id && notifiableIdSet.has(e.id));
      const targetUserIds = targetRecipients.map((e) => e.user_id).filter(Boolean) as string[];
      const targetNames = targetRecipients.map((e) => e.name);

      if (targetUserIds.length === 0) {
        toast.error("Tidak ada penerima valid (akun pegawai belum aktif atau role tidak sesuai)");
        setIsSending(false);
        return;
      }

      const uniqueUserIds = Array.from(new Set(targetUserIds));
      const uniqueTargetNames = Array.from(new Set(targetNames));

      const notificationsToInsert = uniqueUserIds.map((userId) => ({
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

      toast.success(
        targetType === "selected" || targetType === "opd" || targetType === "work_unit"
          ? `Notifikasi terkirim ke: ${uniqueTargetNames.join(", ")}`
          : `Notifikasi berhasil dikirim ke ${uniqueUserIds.length} pegawai`
      );
      setIsDialogOpen(false);
      resetForm();
      if (tenantId) void fetchNotifications(tenantId);
    } catch (error) {
      const errorRef = reportError(error, "org.notifications.send", {
        tenant_id: tenantId,
        target_type: targetType,
        recipients_count: targetBaseEmployees.length,
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
    setSelectedOpdId("");
    setSelectedWorkUnitId("");
    setEmployeeSearchQuery("");
  };

  useEffect(() => {
    if (targetType !== "selected") {
      setSelectedEmployees([]);
      setEmployeeSearchQuery("");
    }
    if (targetType !== "opd" && targetType !== "work_unit") {
      setSelectedOpdId("");
    }
    if (targetType !== "work_unit") {
      setSelectedWorkUnitId("");
    }
  }, [targetType]);

  useEffect(() => {
    if (!selectedOpdId || !selectedWorkUnitId) return;
    const workUnit = workUnitOptions.find((unit) => unit.id === selectedWorkUnitId);
    if (workUnit && workUnit.opd_id !== selectedOpdId) {
      setSelectedWorkUnitId("");
    }
  }, [selectedOpdId, selectedWorkUnitId, workUnitOptions]);

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

  const stats = {
    total: totalCount,
    read: notifications.filter(n => n.is_read).length,
    unread: notifications.filter(n => !n.is_read).length,
  };
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
	                      <SelectItem value="opd">
	                        <div className="flex items-center gap-2">
	                          <Users className="h-4 w-4" />
	                          Berdasarkan OPD
	                        </div>
	                      </SelectItem>
	                      <SelectItem value="work_unit">
	                        <div className="flex items-center gap-2">
	                          <Users className="h-4 w-4" />
	                          Berdasarkan Satuan Kerja
	                        </div>
	                      </SelectItem>
	                    </SelectContent>
	                  </Select>
	                </div>

	                {targetType === "selected" && (
	                  <div className="space-y-2">
	                    <Label>Pilih Pegawai</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={employeeSearchQuery}
                        onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                        placeholder="Cari nama pegawai..."
                        className="pl-9"
                      />
                    </div>
	                    <ScrollArea className="h-[150px] rounded-md border p-2">
	                      <div className="space-y-2">
	                        {filteredEmployees.length === 0 ? (
	                          <p className="py-4 text-center text-xs text-muted-foreground">
	                            Nama pegawai tidak ditemukan.
	                          </p>
	                        ) : filteredEmployees.map((emp) => {
                              const canReceive = !!emp.user_id && notifiableIdSet.has(emp.id);
                              return (
	                          <label 
	                            key={emp.id} 
	                            className={`flex items-center gap-3 rounded-md p-2 ${canReceive ? "cursor-pointer hover:bg-muted" : "opacity-70"}`}
	                          >
	                            <input
	                              type="checkbox"
                                  disabled={!canReceive}
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
                                  {!canReceive && (
                                    <p className="text-[11px] text-amber-600">Belum bisa menerima notifikasi (akun belum aktif/role tidak sesuai)</p>
                                  )}
	                            </div>
	                          </label>
                              );
                            })}
	                      </div>
	                    </ScrollArea>
	                    <p className="text-xs text-muted-foreground">
	                      {selectedEmployees.length} pegawai dipilih
	                    </p>
	                  </div>
	                )}

                {targetType === "opd" && (
                  <div className="space-y-2">
                    <Label>Pilih OPD</Label>
                    <Select value={selectedOpdId || undefined} onValueChange={setSelectedOpdId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih OPD target" />
                      </SelectTrigger>
                      <SelectContent>
                        {opdOptions.map((opd) => (
                          <SelectItem key={opd.id} value={opd.id}>
                            {opd.code} - {opd.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Pegawai aktif di OPD terpilih: {targetBaseEmployees.length}
                    </p>
                  </div>
                )}

                {targetType === "work_unit" && (
                  <div className="space-y-2">
                    <Label>Filter OPD (Opsional)</Label>
                    <Select
                      value={selectedOpdId || "__all__"}
                      onValueChange={(value) => setSelectedOpdId(value === "__all__" ? "" : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Semua OPD" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Semua OPD</SelectItem>
                        {opdOptions.map((opd) => (
                          <SelectItem key={opd.id} value={opd.id}>
                            {opd.code} - {opd.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Label>Pilih Satuan Kerja</Label>
                    <Select value={selectedWorkUnitId || undefined} onValueChange={setSelectedWorkUnitId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih satuan kerja target" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredWorkUnitOptions.map((unit) => {
                          const opd = opdOptions.find((o) => o.id === unit.opd_id);
                          return (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name}{opd ? ` (${opd.code})` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>

                    <p className="text-xs text-muted-foreground">
                      Pegawai aktif di satuan kerja terpilih: {targetBaseEmployees.length}
                    </p>
                  </div>
                )}

	                <div className="space-y-2 rounded-md border bg-muted/20 p-3">
	                  <div className="flex items-center justify-between">
	                    <Label className="text-sm font-medium">Preview Penerima Final</Label>
	                    <Badge variant="secondary">{finalRecipients.length} penerima</Badge>
	                  </div>
                      <p className="text-xs text-muted-foreground">
                        Pegawai aktif (scope): {targetBaseEmployees.length} | Siap menerima notifikasi: {finalRecipients.length}
                      </p>
	                  {finalRecipients.length === 0 ? (
	                    <p className="text-xs text-muted-foreground">
	                      Belum ada penerima valid. Pilih target penerima terlebih dahulu.
                    </p>
                  ) : (
                    <ScrollArea className="h-[90px] rounded border bg-background p-2">
                      <div className="space-y-1.5">
                        {finalRecipients.map((emp) => (
                          <div key={`preview-${emp.id}`} className="flex items-center justify-between text-xs">
                            <span className="font-medium">{emp.name}</span>
                            <span className="text-muted-foreground">{emp.user_id}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                  {(targetType === "opd" || targetType === "work_unit") && (
                    <p className="text-[11px] text-muted-foreground">
                      Scope: {targetType === "opd"
                        ? (selectedOpdOption ? `${selectedOpdOption.code} - ${selectedOpdOption.name}` : "Belum dipilih")
                        : (selectedWorkUnitOption ? selectedWorkUnitOption.name : "Belum dipilih")}
                    </p>
                  )}
                </div>

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
                <Button onClick={sendNotification} disabled={isSending || finalRecipients.length === 0} className="gap-2">
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
                  ) : notifications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        Belum ada notifikasi
                      </TableCell>
                    </TableRow>
                  ) : (
                    notifications.map((notification) => (
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
    </OrganizationLayout>
  );
}
