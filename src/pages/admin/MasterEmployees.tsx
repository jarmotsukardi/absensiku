import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tables } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import {
  Users,
  Plus,
  Search,
  Edit,
  Loader2,
  Mail,
  Phone,
} from "lucide-react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";

type Employee = Tables<"employees">;
type Office = Tables<"offices">;

export default function MasterEmployees() {
  const ADMIN_MASTER_EMPLOYEES_QUERY_TIMEOUT_MS = 15000;
  const ADMIN_MASTER_EMPLOYEES_QUERY_RETRY_MAX = 1;
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    nik: "",
    nip: "",
    phone: "",
    whatsapp: "",
    position: "",
    office_id: "",
    is_active: true,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setIsRetrying(false);
    setLoadError(null);
    try {
      const [employeesRes, officesRes] = await Promise.all([
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("employees").select("*").order("name"),
              ADMIN_MASTER_EMPLOYEES_QUERY_TIMEOUT_MS,
              "admin.master_employees.fetch.employees timeout",
            ),
          {
            maxRetries: ADMIN_MASTER_EMPLOYEES_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        ),
        withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("offices").select("*").order("name"),
              ADMIN_MASTER_EMPLOYEES_QUERY_TIMEOUT_MS,
              "admin.master_employees.fetch.offices timeout",
            ),
          {
            maxRetries: ADMIN_MASTER_EMPLOYEES_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        ),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (officesRes.error) throw officesRes.error;
      setEmployees(employeesRes.data || []);
      setOffices(officesRes.data || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.master_employees.fetch");
      const message = appendErrorReference("Gagal memuat data pegawai", errorRef);
      setLoadError(message);
      setEmployees([]);
      toast({ variant: "destructive", title: "Gagal", description: message });
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      setIsRetrying(false);
      setLoadError(null);
      const employeeData = {
        name: formData.name,
        email: formData.email,
        nik: formData.nik,
        nip: formData.nip || null,
        phone: formData.phone || null,
        whatsapp: formData.whatsapp || null,
        position: formData.position || null,
        office_id: formData.office_id || null,
        is_active: formData.is_active,
        tenant_id: editingEmployee?.tenant_id || crypto.randomUUID(),
      };

      if (editingEmployee) {
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("employees")
                .update(employeeData)
                .eq("id", editingEmployee.id),
              ADMIN_MASTER_EMPLOYEES_QUERY_TIMEOUT_MS,
              "admin.master_employees.submit.update timeout",
            ),
          {
            maxRetries: ADMIN_MASTER_EMPLOYEES_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (error) throw error;
        toast({ title: "Berhasil", description: "Pegawai berhasil diperbarui" });
      } else {
        const { error } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.from("employees").insert(employeeData),
              ADMIN_MASTER_EMPLOYEES_QUERY_TIMEOUT_MS,
              "admin.master_employees.submit.insert timeout",
            ),
          {
            maxRetries: ADMIN_MASTER_EMPLOYEES_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          },
        );
        if (error) throw error;
        toast({ title: "Berhasil", description: "Pegawai berhasil ditambahkan" });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      const errorRef = reportError(error, "admin.master_employees.submit", {
        is_edit: Boolean(editingEmployee),
        employee_id: editingEmployee?.id || null,
      });
      const message = appendErrorReference("Terjadi kesalahan saat menyimpan data pegawai", errorRef);
      setLoadError(message);
      toast({ variant: "destructive", title: "Gagal", description: message });
    } finally {
      setIsSubmitting(false);
      setIsRetrying(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      nik: "",
      nip: "",
      phone: "",
      whatsapp: "",
      position: "",
      office_id: "",
      is_active: true,
    });
    setEditingEmployee(null);
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      email: employee.email,
      nik: employee.nik,
      nip: employee.nip || "",
      phone: employee.phone || "",
      whatsapp: employee.whatsapp || "",
      position: employee.position || "",
      office_id: employee.office_id || "",
      is_active: employee.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const filteredEmployees = employees.filter((emp) =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.nik.includes(searchQuery)
  );

  return (
    <SuperAdminLayout
      title="Master Pegawai"
      subtitle="Kelola data pegawai semua organisasi"
    >
      <div className="space-y-6">
        {isRetrying && (
          <Card className="border-amber-300/60 bg-amber-50">
            <CardContent className="pt-4">
              <p className="text-sm text-amber-800">Sedang mencoba ulang koneksi data pegawai...</p>
            </CardContent>
          </Card>
        )}
        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void fetchData()}>
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {/* Header Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm sm:flex-1">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari pegawai..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah Pegawai
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingEmployee ? "Edit Pegawai" : "Tambah Pegawai Baru"}</DialogTitle>
                <DialogDescription>Isi data pegawai</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nama Lengkap *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Budi Santoso"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="budi@example.com"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>NIK *</Label>
                    <Input
                      value={formData.nik}
                      onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                      placeholder="1234567890123456"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>NIP</Label>
                    <Input
                      value={formData.nip}
                      onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                      placeholder="198001012010011001"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>No. Telepon</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="08123456789"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>WhatsApp</Label>
                    <Input
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      placeholder="08123456789"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Jabatan</Label>
                  <Input
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder="Staff IT"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Kantor</Label>
                  <Select
                    value={formData.office_id}
                    onValueChange={(value) => setFormData({ ...formData, office_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kantor" />
                    </SelectTrigger>
                    <SelectContent>
                      {offices.map((office) => (
                        <SelectItem key={office.id} value={office.id}>
                          {office.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label>Status Aktif</Label>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                    Batal
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="flex-1">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Employee List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEmployees.map((employee) => (
              <Card key={employee.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-lg font-semibold text-primary">
                          {employee.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{employee.name}</h3>
                          {!employee.is_active && (
                            <Badge variant="secondary" className="text-xs">Nonaktif</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{employee.position || "No position"}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {employee.email}
                          </span>
                          {employee.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {employee.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(employee)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filteredEmployees.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Belum ada data pegawai</p>
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}
