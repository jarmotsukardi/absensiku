import { useState, useEffect } from "react";
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
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [employeesRes, officesRes] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("offices").select("*").order("name"),
    ]);

    if (!employeesRes.error) setEmployees(employeesRes.data || []);
    if (!officesRes.error) setOffices(officesRes.data || []);
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
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
        const { error } = await supabase
          .from("employees")
          .update(employeeData)
          .eq("id", editingEmployee.id);
        if (error) throw error;
        toast({ title: "Berhasil", description: "Pegawai berhasil diperbarui" });
      } else {
        const { error } = await supabase.from("employees").insert(employeeData);
        if (error) throw error;
        toast({ title: "Berhasil", description: "Pegawai berhasil ditambahkan" });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast({ variant: "destructive", title: "Gagal", description: "Terjadi kesalahan" });
    } finally {
      setIsSubmitting(false);
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
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari pegawai..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
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
