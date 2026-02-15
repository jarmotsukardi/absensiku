import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, UserCheck, EyeOff, ChevronLeft, ChevronRight, Filter, RotateCcw, KeyRound, UserPlus, Copy, Check, Smartphone, MapPinOff, Shield } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";

type Employee = Tables<"employees">;
type OPD = Tables<"opd">;
type Office = Tables<"offices">;
type WorkUnit = Tables<"work_units">;
type Position = Tables<"positions">;
type EmployeeWithRelations = Employee & {
  opd?: OPD | null;
  office?: Office | null;
  work_unit?: WorkUnit | null;
  position_rel?: Position | null;
};

const GENDER_OPTIONS = [
  { value: "laki-laki", label: "Laki-Laki" },
  { value: "perempuan", label: "Perempuan" },
];

const EMPLOYEE_CATEGORIES = [
  { value: "ASN", label: "ASN" },
  { value: "P3K", label: "P3K" },
];

const GOLONGAN_OPTIONS = [
  { value: "I/a", label: "I/a" },
  { value: "I/b", label: "I/b" },
  { value: "I/c", label: "I/c" },
  { value: "I/d", label: "I/d" },
  { value: "II/a", label: "II/a" },
  { value: "II/b", label: "II/b" },
  { value: "II/c", label: "II/c" },
  { value: "II/d", label: "II/d" },
  { value: "III/a", label: "III/a" },
  { value: "III/b", label: "III/b" },
  { value: "III/c", label: "III/c" },
  { value: "III/d", label: "III/d" },
  { value: "IV/a", label: "IV/a" },
  { value: "IV/b", label: "IV/b" },
  { value: "IV/c", label: "IV/c" },
  { value: "IV/d", label: "IV/d" },
  { value: "IV/e", label: "IV/e" },
];

const ITEMS_PER_PAGE = 10;

export default function OrgActiveEmployees() {
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [opds, setOpds] = useState<OPD[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterOpd, setFilterOpd] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterWorkUnit, setFilterWorkUnit] = useState<string>("all");
  const [filterAccountStatus, setFilterAccountStatus] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    id: "",
    nip: "",
    gelar_depan: "",
    name: "",
    gelar_belakang: "",
    email: "",
    phone: "",
    address: "",
    gender: "",
    opd_id: "",
    work_unit_id: "",
    office_id: "",
    position_id: "",
    golongan: "",
    employee_category: "",
    allow_flexible_attendance: false,
    flexible_attendance_limit: null as number | null,
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterOpd, filterCategory, filterWorkUnit, filterAccountStatus]);

  const fetchData = async () => {
    try {
      const [employeesRes, opdsRes, officesRes, workUnitsRes, positionsRes] = await Promise.all([
        supabase.from("employees").select("*, opd(*), offices:office_id(*), work_unit:work_unit_id(*), position_rel:position_id(*)").eq("is_active", true).order("name"),
        supabase.from("opd").select("*").eq("is_active", true).order("name"),
        supabase.from("offices").select("*").eq("is_active", true).order("name"),
        supabase.from("work_units").select("*").eq("is_active", true).order("name"),
        supabase.from("positions").select("*").eq("is_active", true).order("name"),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      setEmployees(employeesRes.data || []);
      setOpds(opdsRes.data || []);
      setOffices(officesRes.data || []);
      setWorkUnits(workUnitsRes.data || []);
      setPositions(positionsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Gagal memuat data");
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered dropdown options based on cascade selection
  const filteredWorkUnits = useMemo(() => {
    if (!formData.opd_id) return workUnits;
    return workUnits.filter(wu => wu.opd_id === formData.opd_id);
  }, [workUnits, formData.opd_id]);

  const filteredPositions = useMemo(() => {
    if (!formData.work_unit_id) return positions;
    return positions.filter(pos => pos.work_unit_id === formData.work_unit_id);
  }, [positions, formData.work_unit_id]);

  const filteredOffices = useMemo(() => {
    if (!formData.opd_id) return offices;
    return offices.filter(off => off.opd_id === formData.opd_id);
  }, [offices, formData.opd_id]);

  // Convert to searchable options
  const opdOptions: SearchableSelectOption[] = useMemo(() => 
    opds.map(opd => ({ value: opd.id, label: `${opd.code} - ${opd.name}` })), 
    [opds]
  );

  const workUnitOptions: SearchableSelectOption[] = useMemo(() => 
    filteredWorkUnits.map(wu => ({ value: wu.id, label: wu.name })), 
    [filteredWorkUnits]
  );

  const positionOptions: SearchableSelectOption[] = useMemo(() => 
    filteredPositions.map(pos => ({ value: pos.id, label: pos.name })), 
    [filteredPositions]
  );

  const officeOptions: SearchableSelectOption[] = useMemo(() => 
    filteredOffices.map(off => ({ value: off.id, label: off.name })), 
    [filteredOffices]
  );

  const golonganOptions: SearchableSelectOption[] = useMemo(() => 
    GOLONGAN_OPTIONS.map(gol => ({ value: gol.value, label: gol.label })), 
    []
  );

  // Handle OPD change - reset dependent fields
  const handleOpdChange = (opdId: string) => {
    setFormData({
      ...formData,
      opd_id: opdId,
      work_unit_id: "",
      position_id: "",
      office_id: "",
    });
  };

  // Handle Work Unit change - reset position
  const handleWorkUnitChange = (workUnitId: string) => {
    setFormData({
      ...formData,
      work_unit_id: workUnitId,
      position_id: "",
    });
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.nip) {
      toast.error("NIP, Nama, dan Email harus diisi");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();

      if (!roleData?.tenant_id) {
        toast.error("Tenant tidak ditemukan");
        return;
      }

      const payload = {
        name: formData.name,
        email: formData.email,
        nik: formData.nip,
        nip: formData.nip,
        gelar_depan: formData.gelar_depan || null,
        gelar_belakang: formData.gelar_belakang || null,
        phone: formData.phone || null,
        whatsapp: formData.phone || null,
        address: formData.address || null,
        gender: formData.gender || null,
        opd_id: formData.opd_id || null,
        work_unit_id: formData.work_unit_id || null,
        office_id: formData.office_id || null,
        position_id: formData.position_id || null,
        golongan: formData.golongan || null,
        employee_category: formData.employee_category || null,
        tenant_id: roleData.tenant_id,
        is_active: true,
        allow_flexible_attendance: formData.allow_flexible_attendance,
        flexible_attendance_limit: formData.flexible_attendance_limit,
      };

      if (isEditing) {
        const { error } = await supabase.from("employees").update(payload).eq("id", formData.id);
        if (error) throw error;
        toast.success("Pegawai berhasil diperbarui");
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
        toast.success("Pegawai berhasil ditambahkan");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: unknown) {
      console.error("Error saving employee:", error);
      const errorMessage = error instanceof Error ? error.message : "Gagal menyimpan pegawai";
      toast.error(errorMessage);
    }
  };

  const resetForm = () => {
    setFormData({
      id: "", nip: "", gelar_depan: "", name: "", gelar_belakang: "", email: "",
      phone: "", address: "", gender: "", opd_id: "", work_unit_id: "",
      office_id: "", position_id: "", golongan: "", employee_category: "",
      allow_flexible_attendance: false, flexible_attendance_limit: null,
    });
    setIsEditing(false);
  };

  const handleEdit = (emp: EmployeeWithRelations) => {
    setFormData({
      id: emp.id,
      nip: emp.nip || "",
      gelar_depan: emp.gelar_depan || "",
      name: emp.name,
      gelar_belakang: emp.gelar_belakang || "",
      email: emp.email,
      phone: emp.phone || "",
      address: emp.address || "",
      gender: emp.gender || "",
      opd_id: emp.opd_id || "",
      work_unit_id: emp.work_unit_id || "",
      office_id: emp.office_id || "",
      position_id: emp.position_id || "",
      golongan: emp.golongan || "",
      employee_category: emp.employee_category || "",
      allow_flexible_attendance: emp.allow_flexible_attendance || false,
      flexible_attendance_limit: emp.flexible_attendance_limit || null,
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Yakin ingin menonaktifkan pegawai ini?")) return;
    try {
      const { error } = await supabase.from("employees").update({ is_active: false }).eq("id", id);
      if (error) throw error;
      toast.success("Pegawai berhasil dinonaktifkan");
      fetchData();
    } catch (error) {
      toast.error("Gagal menonaktifkan pegawai");
    }
  };

  const handleResetPassword = async (email: string, name: string) => {
    if (!confirm(`Kirim link reset password ke ${email}?`)) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/employee/reset-password`,
      });
      if (error) throw error;
      toast.success(`Link reset password telah dikirim ke ${email}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Gagal mengirim link reset password";
      toast.error(errorMessage);
    }
  };

  // State for activation
  const [activationDialog, setActivationDialog] = useState<{ open: boolean; employee: EmployeeWithRelations | null; inviteCode: string | null }>({
    open: false,
    employee: null,
    inviteCode: null,
  });
  const [isActivating, setIsActivating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleActivateAccount = async (emp: EmployeeWithRelations) => {
    setIsActivating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data: employeeData } = await supabase
        .from("employees")
        .select("id, tenant_id")
        .eq("user_id", user.id)
        .single();

      if (!employeeData?.tenant_id) throw new Error("Tenant not found");

      // Coba link langsung jika user sudah registrasi (panggil RPC)
      const { data: linkedUserId, error: linkError } = await supabase.rpc(
        "admin_link_employee_user",
        { p_employee_id: emp.id, p_user_email: emp.email }
      );

      if (!linkError && linkedUserId) {
        // Berhasil di-link langsung
        toast.success(`Akun ${emp.name} berhasil diaktifkan!`);
        fetchData();
        setIsActivating(false);
        return;
      }

      // Jika gagal (user belum registrasi), buat undangan seperti sebelumnya
      const inviteCode = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const { error } = await supabase.from("employee_invitations").insert({
        tenant_id: employeeData.tenant_id,
        email: emp.email,
        name: emp.name,
        nik: emp.nik || emp.nip || `NIK-${Date.now()}`,
        invitation_code: inviteCode,
        office_id: emp.office_id,
        opd_id: emp.opd_id,
        invited_by: employeeData.id,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if (error) throw error;

      setActivationDialog({ open: true, employee: emp, inviteCode });
      toast.success("Kode undangan berhasil dibuat");
    } catch (error: unknown) {
      console.error("Error creating invitation:", error);
      const errorMessage = error instanceof Error ? error.message : "Gagal membuat kode undangan";
      toast.error(errorMessage);
    } finally {
      setIsActivating(false);
    }
  };

  const copyInviteLink = () => {
    if (activationDialog.inviteCode) {
      const link = `${window.location.origin}/employee/login?invite=${activationDialog.inviteCode}`;
      navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link undangan disalin!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleResetDeviceId = async (emp: Employee) => {
    if (!confirm(`Reset Device ID untuk ${emp.name}? Pegawai akan mendapat 1 kesempatan reset dan harus absen ulang untuk mendaftarkan perangkat baru.`)) return;
    
    try {
      // Reset device dan berikan 1 kesempatan reset ke pegawai
      const { error } = await supabase
        .from("employees")
        .update({ 
          android_id: null,
          device_id_reset_count: 0, // Reset counter agar pegawai dapat 1 kesempatan baru
          device_id_last_reset: new Date().toISOString()
        })
        .eq("id", emp.id);

      if (error) throw error;
      toast.success(`Device ID untuk ${emp.name} berhasil direset. Pegawai mendapat 1 kesempatan reset baru.`);
    } catch (error: unknown) {
      console.error("Error resetting device:", error);
      const errorMessage = error instanceof Error ? error.message : "Gagal reset device ID";
      toast.error(errorMessage);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setFilterOpd("all");
    setFilterCategory("all");
    setFilterWorkUnit("all");
    setFilterAccountStatus("all");
    setCurrentPage(1);
  };

  const filteredEmployees = employees.filter(emp => {
    const matchSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (emp.nip && emp.nip.includes(searchTerm));
    const matchOpd = filterOpd === "all" || emp.opd_id === filterOpd;
    const matchCategory = filterCategory === "all" || emp.employee_category === filterCategory;
    const matchWorkUnit = filterWorkUnit === "all" || emp.work_unit_id === filterWorkUnit;
    const matchAccountStatus = filterAccountStatus === "all" || 
                               (filterAccountStatus === "active" && emp.user_id) ||
                               (filterAccountStatus === "inactive" && !emp.user_id);
    return matchSearch && matchOpd && matchCategory && matchWorkUnit && matchAccountStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE);
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getFullName = (emp: EmployeeWithRelations) => {
    const parts = [emp.gelar_depan, emp.name, emp.gelar_belakang].filter(Boolean);
    return parts.join(" ");
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UserCheck className="h-6 w-6" />
              Pegawai Aktif
            </h1>
            <p className="text-muted-foreground">Kelola data pegawai aktif</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Pegawai
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Pegawai" : "Tambah Pegawai"}</DialogTitle>
                <DialogDescription>
                  {isEditing ? "Perbarui data pegawai" : "Tambahkan pegawai baru"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* NIP */}
                <div className="grid gap-2">
                  <Label>NIP *</Label>
                  <Input
                    value={formData.nip}
                    onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
                    placeholder="Nomor Induk Pegawai"
                  />
                </div>

                {/* Nama dengan gelar */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="grid gap-2">
                    <Label>Gelar Depan</Label>
                    <Input
                      value={formData.gelar_depan}
                      onChange={(e) => setFormData({ ...formData, gelar_depan: e.target.value })}
                      placeholder="Dr., Ir."
                    />
                  </div>
                  <div className="col-span-2 grid gap-2">
                    <Label>Nama Lengkap *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nama lengkap tanpa gelar"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Gelar Belakang</Label>
                    <Input
                      value={formData.gelar_belakang}
                      onChange={(e) => setFormData({ ...formData, gelar_belakang: e.target.value })}
                      placeholder="S.E., M.M."
                    />
                  </div>
                </div>

                {/* Telepon dan Email */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>No. Telp/WhatsApp</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="08xxxxxxxxxx"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@domain.com"
                    />
                  </div>
                </div>

                {/* Alamat */}
                <div className="grid gap-2">
                  <Label>Alamat Rumah</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Alamat lengkap"
                  />
                </div>

                {/* Jenis Kelamin */}
                <div className="grid gap-2">
                  <Label>Jenis Kelamin</Label>
                  <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis kelamin" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* OPD dengan searchable */}
                <div className="grid gap-2">
                  <Label>OPD</Label>
                  <SearchableSelect
                    options={opdOptions}
                    value={formData.opd_id}
                    onValueChange={handleOpdChange}
                    placeholder="Pilih OPD"
                    searchPlaceholder="Cari OPD..."
                    emptyMessage="OPD tidak ditemukan"
                  />
                </div>

                {/* Unit Kerja dan Lokasi Kerja */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Unit Kerja (Satuan Kerja)</Label>
                    <SearchableSelect
                      options={workUnitOptions}
                      value={formData.work_unit_id}
                      onValueChange={handleWorkUnitChange}
                      placeholder="Pilih Unit Kerja"
                      searchPlaceholder="Cari Unit Kerja..."
                      emptyMessage={formData.opd_id ? "Unit Kerja tidak ditemukan" : "Pilih OPD terlebih dahulu"}
                      disabled={!formData.opd_id}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Lokasi Kerja</Label>
                    <SearchableSelect
                      options={officeOptions}
                      value={formData.office_id}
                      onValueChange={(v) => setFormData({ ...formData, office_id: v })}
                      placeholder="Pilih Lokasi Kerja"
                      searchPlaceholder="Cari Lokasi Kerja..."
                      emptyMessage={formData.opd_id ? "Lokasi tidak ditemukan" : "Pilih OPD terlebih dahulu"}
                      disabled={!formData.opd_id}
                    />
                  </div>
                </div>

                {/* Jabatan */}
                <div className="grid gap-2">
                  <Label>Jabatan</Label>
                  <SearchableSelect
                    options={positionOptions}
                    value={formData.position_id}
                    onValueChange={(v) => setFormData({ ...formData, position_id: v })}
                    placeholder="Pilih Jabatan"
                    searchPlaceholder="Cari Jabatan..."
                    emptyMessage={formData.work_unit_id ? "Jabatan tidak ditemukan" : "Pilih Unit Kerja terlebih dahulu"}
                    disabled={!formData.work_unit_id}
                  />
                </div>

                {/* Golongan dan Kategori */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Golongan</Label>
                    <SearchableSelect
                      options={golonganOptions}
                      value={formData.golongan}
                      onValueChange={(v) => setFormData({ ...formData, golongan: v })}
                      placeholder="Pilih Golongan"
                      searchPlaceholder="Cari Golongan..."
                      emptyMessage="Golongan tidak ditemukan"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Kategori Pegawai</Label>
                    <Select value={formData.employee_category} onValueChange={(v) => setFormData({ ...formData, employee_category: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih Kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYEE_CATEGORIES.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Absensi Khusus Section */}
                <div className="border rounded-lg p-4 mt-4 space-y-4 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Shield className="h-4 w-4 text-primary" />
                    <span>Pengaturan Absensi Khusus</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Izinkan pegawai melakukan absensi dari lokasi manapun (tanpa pembatasan geofence) untuk tugas luar, rapat eksternal, atau kunjungan lapangan.
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPinOff className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="allow_flexible">Izinkan Absensi Khusus</Label>
                    </div>
                    <Switch
                      id="allow_flexible"
                      checked={formData.allow_flexible_attendance}
                      onCheckedChange={(checked) => setFormData({ 
                        ...formData, 
                        allow_flexible_attendance: checked,
                        flexible_attendance_limit: checked ? formData.flexible_attendance_limit : null 
                      })}
                    />
                  </div>
                  {formData.allow_flexible_attendance && (
                    <div className="grid gap-2">
                      <Label>Batas Penggunaan per Bulan (Opsional)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.flexible_attendance_limit || ""}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          flexible_attendance_limit: e.target.value ? parseInt(e.target.value) : null 
                        })}
                        placeholder="Kosongkan untuk tanpa batas"
                      />
                      <p className="text-xs text-muted-foreground">
                        Batasi berapa kali pegawai dapat menggunakan absensi khusus per bulan. Kosongkan untuk tanpa batas.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                <Button onClick={handleSubmit}>{isEditing ? "Simpan" : "Tambah"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Pegawai Aktif</CardTitle>
            <CardDescription>
              Menampilkan {paginatedEmployees.length} dari {filteredEmployees.length} pegawai
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filter Section */}
            <div className="flex flex-col gap-4 mb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama, email, NIP..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={filterOpd} onValueChange={setFilterOpd}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter OPD" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua OPD</SelectItem>
                      {opds.map(opd => (
                        <SelectItem key={opd.id} value={opd.id}>{opd.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterWorkUnit} onValueChange={setFilterWorkUnit}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter Unit Kerja" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Unit Kerja</SelectItem>
                      {workUnits.map(wu => (
                        <SelectItem key={wu.id} value={wu.id}>{wu.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua</SelectItem>
                      {EMPLOYEE_CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterAccountStatus} onValueChange={setFilterAccountStatus}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Status Akun" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      <SelectItem value="active">Sudah Aktif</SelectItem>
                      <SelectItem value="inactive">Belum Aktif</SelectItem>
                    </SelectContent>
                  </Select>
                  {(searchTerm || filterOpd !== "all" || filterCategory !== "all" || filterWorkUnit !== "all" || filterAccountStatus !== "all") && (
                    <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead>Nama Lengkap</TableHead>
                  <TableHead>OPD</TableHead>
                  <TableHead>Unit Kerja</TableHead>
                  <TableHead>Lokasi Kerja</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>Golongan</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Status Akun</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : paginatedEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      {filteredEmployees.length === 0 && (searchTerm || filterOpd !== "all" || filterCategory !== "all" || filterWorkUnit !== "all")
                        ? "Tidak ada data yang sesuai filter"
                        : "Belum ada data pegawai"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedEmployees.map((emp, index) => (
                    <TableRow key={emp.id}>
                      <TableCell>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{emp.nip}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getFullName(emp)}
                          {emp.allow_flexible_attendance && (
                            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-300">
                              <MapPinOff className="h-3 w-3 mr-1" />
                              Absensi Khusus
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(emp.opd as OPD)?.code ? (
                          <Badge variant="outline">{(emp.opd as OPD).code}</Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-sm">{(emp.work_unit as WorkUnit)?.name || "-"}</TableCell>
                      <TableCell className="text-sm">{(emp.office as Office)?.name || "-"}</TableCell>
                      <TableCell className="text-sm">{(emp.position_rel as Position)?.name || "-"}</TableCell>
                      <TableCell>
                        {emp.golongan ? (
                          <Badge variant="secondary">{emp.golongan}</Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        {emp.employee_category ? (
                          <Badge variant={emp.employee_category === "ASN" ? "default" : "outline"}>
                            {emp.employee_category}
                          </Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        {emp.user_id ? (
                          <Badge className="bg-success text-success-foreground">Aktif</Badge>
                        ) : (
                          <Badge variant="destructive">Belum Aktif</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {!emp.user_id && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleActivateAccount(emp)}
                            title="Aktifkan Akun"
                            disabled={isActivating}
                          >
                            <UserPlus className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        {emp.user_id && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleResetPassword(emp.email, emp.name)}
                              title="Reset Password"
                            >
                              <KeyRound className="h-4 w-4 text-warning" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleResetDeviceId(emp)}
                              title="Reset Device ID"
                            >
                              <Smartphone className="h-4 w-4 text-info" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(emp)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeactivate(emp.id)} title="Nonaktifkan">
                          <EyeOff className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

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
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Selanjutnya
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activation Dialog */}
        <Dialog open={activationDialog.open} onOpenChange={(open) => !open && setActivationDialog({ open: false, employee: null, inviteCode: null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Kode Aktivasi Akun</DialogTitle>
              <DialogDescription>
                Bagikan kode undangan ini kepada {activationDialog.employee?.name} untuk mengaktifkan akun mereka.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-2">Kode Undangan:</p>
                <p className="font-mono text-lg font-bold">{activationDialog.inviteCode}</p>
              </div>
              
              <div className="space-y-2">
                <Label>Link Registrasi:</Label>
                <div className="flex gap-2">
                  <Input 
                    readOnly 
                    value={activationDialog.inviteCode ? `${window.location.origin}/employee/login?invite=${activationDialog.inviteCode}` : ""} 
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={copyInviteLink}>
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Undangan berlaku selama 7 hari. Pegawai dapat mendaftar menggunakan kode ini di halaman login pegawai.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setActivationDialog({ open: false, employee: null, inviteCode: null })}>
                Tutup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </OrganizationLayout>
  );
}
