import { useState, useEffect, useCallback } from "react";
import { SuperAdminLayout } from "@/components/admin/superadmin/SuperAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, UserCheck, Filter, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables } from "@/integrations/supabase/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type Employee = Tables<"employees">;
type OPD = Tables<"opd">;
type Office = Tables<"offices">;

const GENDER_OPTIONS = [
  { value: "L", label: "Laki-laki" },
  { value: "P", label: "Perempuan" },
];

const EMPLOYEE_CATEGORIES = [
  { value: "asn", label: "ASN" },
  { value: "p3k", label: "P3K" },
  { value: "honorer", label: "Honorer" },
];

const GOLONGAN_OPTIONS = [
  "I/a", "I/b", "I/c", "I/d",
  "II/a", "II/b", "II/c", "II/d",
  "III/a", "III/b", "III/c", "III/d",
  "IV/a", "IV/b", "IV/c", "IV/d", "IV/e",
];
const ITEMS_PER_PAGE = 15;

export default function ActiveEmployees() {
  const [employees, setEmployees] = useState<(Employee & { opd?: OPD; office?: Office })[]>([]);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [officeList, setOfficeList] = useState<Office[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterOpd, setFilterOpd] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState({
    nip: "",
    gelar_depan: "",
    name: "",
    gelar_belakang: "",
    whatsapp: "",
    email: "",
    alamat: "",
    jenis_kelamin: "",
    opd_id: "",
    office_id: "",
    position: "",
    golongan: "",
    kategori_pegawai: "",
    nik: "",
  });

  const fetchMasterData = async () => {
    try {
      const [opdResult, officeResult] = await Promise.all([
        supabase.from("opd").select("*").order("name"),
        supabase.from("offices").select("*").order("name"),
      ]);

      if (opdResult.error) throw opdResult.error;
      if (officeResult.error) throw officeResult.error;

      setOpdList(opdResult.data || []);
      setOfficeList(officeResult.data || []);
    } catch (error) {
      const errorRef = reportError(error, "admin.active_employees.fetch_master_data");
      const message = appendErrorReference("Gagal memuat data referensi pegawai", errorRef);
      toast.error(message);
      setLoadError(message);
    }
  };

  const fetchEmployees = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const page = Math.max(1, currentPage);
      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from("employees")
        .select("*, opd:opd_id(*), office:office_id(*)", { count: "exact" })
        .eq("is_active", true);

      if (filterOpd !== "all") {
        query = query.eq("opd_id", filterOpd);
      }
      if (searchTerm.trim()) {
        const escaped = searchTerm.trim().replace(/[%_]/g, "\\$&");
        query = query.or(`name.ilike.%${escaped}%,nip.ilike.%${escaped}%,email.ilike.%${escaped}%`);
      }

      const { data, error, count } = await query
        .order("name")
        .range(from, to);

      if (error) throw error;
      setEmployees(data || []);
      setTotalEmployees(count || 0);
    } catch (error) {
      const errorRef = reportError(error, "admin.active_employees.fetch_employees");
      const message = appendErrorReference("Gagal memuat data pegawai aktif", errorRef);
      toast.error(message);
      setLoadError(message);
      setEmployees([]);
      setTotalEmployees(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, filterOpd, searchTerm]);

  useEffect(() => {
    void fetchMasterData();
  }, []);

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoadError(null);
      const employeeData = {
        nip: formData.nip || null,
        name: `${formData.gelar_depan} ${formData.name} ${formData.gelar_belakang}`.trim(),
        whatsapp: formData.whatsapp || null,
        email: formData.email,
        position: formData.position || null,
        opd_id: formData.opd_id || null,
        office_id: formData.office_id || null,
        nik: formData.nik,
      };

      if (editingEmployee) {
        const { error } = await supabase
          .from("employees")
          .update(employeeData)
          .eq("id", editingEmployee.id);

        if (error) throw error;
        toast.success("Pegawai berhasil diperbarui");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const { data: currentEmployee } = await supabase
          .from("employees")
          .select("tenant_id")
          .eq("user_id", user.id)
          .single();

        if (!currentEmployee?.tenant_id) throw new Error("Tenant not found");

        const { error } = await supabase
          .from("employees")
          .insert({ ...employeeData, tenant_id: currentEmployee.tenant_id, is_active: true });

        if (error) throw error;
        toast.success("Pegawai berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      setEditingEmployee(null);
      resetForm();
      void fetchEmployees();
    } catch (error) {
      const errorRef = reportError(error, "admin.active_employees.save_employee", {
        employee_id: editingEmployee?.id || null,
      });
      const message = appendErrorReference("Gagal menyimpan pegawai", errorRef);
      toast.error(message);
      setLoadError(message);
    }
  };

  const resetForm = () => {
    setFormData({
      nip: "",
      gelar_depan: "",
      name: "",
      gelar_belakang: "",
      whatsapp: "",
      email: "",
      alamat: "",
      jenis_kelamin: "",
      opd_id: "",
      office_id: "",
      position: "",
      golongan: "",
      kategori_pegawai: "",
      nik: "",
    });
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      nip: employee.nip || "",
      gelar_depan: "",
      name: employee.name,
      gelar_belakang: "",
      whatsapp: employee.whatsapp || "",
      email: employee.email,
      alamat: "",
      jenis_kelamin: "",
      opd_id: employee.opd_id || "",
      office_id: employee.office_id || "",
      position: employee.position || "",
      golongan: "",
      kategori_pegawai: "",
      nik: employee.nik,
    });
    setIsDialogOpen(true);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Yakin ingin menonaktifkan pegawai ini?")) return;

    try {
      setLoadError(null);
      const { error } = await supabase
        .from("employees")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
      toast.success("Pegawai berhasil dinonaktifkan");
      void fetchEmployees();
    } catch (error) {
      const errorRef = reportError(error, "admin.active_employees.deactivate", { employee_id: id });
      const message = appendErrorReference("Gagal menonaktifkan pegawai", errorRef);
      toast.error(message);
      setLoadError(message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalEmployees / ITEMS_PER_PAGE));
  const pageStart = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  const visiblePages = Array.from({ length: Math.min(3, totalPages) }, (_, idx) => pageStart + idx).filter(
    (page) => page <= totalPages
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterOpd]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalEmployees / ITEMS_PER_PAGE));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, totalEmployees]);

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pegawai Aktif</h1>
            <p className="text-muted-foreground">
              Kelola data pegawai yang aktif
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingEmployee(null); resetForm(); }}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah Pegawai
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>{editingEmployee ? "Edit Pegawai" : "Tambah Pegawai"}</DialogTitle>
                <DialogDescription>
                  {editingEmployee ? "Perbarui data pegawai" : "Masukkan data pegawai baru"}
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4">
                <form onSubmit={handleSubmit}>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="nip">NIP</Label>
                        <Input
                          id="nip"
                          value={formData.nip}
                          onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                          placeholder="Nomor Induk Pegawai"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nik">NIK</Label>
                        <Input
                          id="nik"
                          value={formData.nik}
                          onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                          placeholder="Nomor Induk Kependudukan"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="gelar_depan">Gelar Depan</Label>
                        <Input
                          id="gelar_depan"
                          value={formData.gelar_depan}
                          onChange={(e) => setFormData({ ...formData, gelar_depan: e.target.value })}
                          placeholder="Dr."
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="name">Nama Lengkap</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Nama lengkap tanpa gelar"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gelar_belakang">Gelar Belakang</Label>
                        <Input
                          id="gelar_belakang"
                          value={formData.gelar_belakang}
                          onChange={(e) => setFormData({ ...formData, gelar_belakang: e.target.value })}
                          placeholder="S.Kom"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="whatsapp">No. WhatsApp</Label>
                        <Input
                          id="whatsapp"
                          value={formData.whatsapp}
                          onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                          placeholder="08xxxxxxxxxx"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="email@domain.com"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="alamat">Alamat Rumah</Label>
                      <Input
                        id="alamat"
                        value={formData.alamat}
                        onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                        placeholder="Alamat lengkap"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="jenis_kelamin">Jenis Kelamin</Label>
                        <Select
                          value={formData.jenis_kelamin}
                          onValueChange={(value) => setFormData({ ...formData, jenis_kelamin: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih Jenis Kelamin" />
                          </SelectTrigger>
                          <SelectContent>
                            {GENDER_OPTIONS.map((g) => (
                              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="kategori_pegawai">Kategori Pegawai</Label>
                        <Select
                          value={formData.kategori_pegawai}
                          onValueChange={(value) => setFormData({ ...formData, kategori_pegawai: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih Kategori" />
                          </SelectTrigger>
                          <SelectContent>
                            {EMPLOYEE_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="opd_id">OPD</Label>
                        <Select
                          value={formData.opd_id}
                          onValueChange={(value) => setFormData({ ...formData, opd_id: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih OPD" />
                          </SelectTrigger>
                          <SelectContent>
                            {opdList.map((opd) => (
                              <SelectItem key={opd.id} value={opd.id}>
                                {opd.code} - {opd.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="office_id">Lokasi Kerja</Label>
                        <Select
                          value={formData.office_id}
                          onValueChange={(value) => setFormData({ ...formData, office_id: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih Lokasi" />
                          </SelectTrigger>
                          <SelectContent>
                            {officeList.map((office) => (
                              <SelectItem key={office.id} value={office.id}>
                                {office.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="position">Jabatan</Label>
                        <Input
                          id="position"
                          value={formData.position}
                          onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                          placeholder="Nama jabatan"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="golongan">Golongan</Label>
                        <Select
                          value={formData.golongan}
                          onValueChange={(value) => setFormData({ ...formData, golongan: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih Golongan" />
                          </SelectTrigger>
                          <SelectContent>
                            {GOLONGAN_OPTIONS.map((g) => (
                              <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Batal
                    </Button>
                    <Button type="submit">Simpan</Button>
                  </DialogFooter>
                </form>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Daftar Pegawai Aktif
            </CardTitle>
            <CardDescription>
              Total {totalEmployees} pegawai aktif
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, NIP, atau email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterOpd} onValueChange={setFilterOpd}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter OPD" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua OPD</SelectItem>
                  {opdList.map((opd) => (
                    <SelectItem key={opd.id} value={opd.id}>
                      {opd.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>NIP</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Jabatan</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="w-32 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Memuat data...
                      </TableCell>
                    </TableRow>
                  ) : employees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Tidak ada data pegawai
                      </TableCell>
                    </TableRow>
                  ) : (
                    employees.map((emp, index) => (
                      <TableRow key={emp.id}>
                        <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                        <TableCell className="font-mono text-sm">{emp.nip || "-"}</TableCell>
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell>{emp.opd?.code || "-"}</TableCell>
                        <TableCell>{emp.position || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{emp.email}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(emp)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeactivate(emp.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {!isLoading && totalEmployees > 0 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {visiblePages.map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          isActive={page === currentPage}
                          onClick={() => setCurrentPage(page)}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
