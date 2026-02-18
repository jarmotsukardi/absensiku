import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ArrowRight, Edit3, Building2, MapPin, User, Send } from "lucide-react";

// Konstanta daftar Golongan (sama dengan halaman admin)
const GOLONGAN_OPTIONS = [
  "I/a", "I/b", "I/c", "I/d",
  "II/a", "II/b", "II/c", "II/d",
  "III/a", "III/b", "III/c", "III/d",
  "IV/a", "IV/b", "IV/c", "IV/d", "IV/e",
];

interface EmployeeData {
  id: string;
  name: string;
  nik: string;
  nip?: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  gender?: string;
  golongan?: string;
  employee_category?: string;
  position?: string;
  gelar_depan?: string;
  gelar_belakang?: string;
  tenant_id?: string;
  opd_id?: string;
  work_unit_id?: string;
  office_id?: string;
  opd?: { id?: string; name: string; code?: string };
  work_unit?: { id?: string; name: string };
  offices?: { id?: string; name: string };
}

interface MutationRequestFormProps {
  employee: EmployeeData;
  onSuccess?: () => void;
}

interface OPD {
  id: string;
  name: string;
  code: string;
}

interface WorkUnit {
  id: string;
  name: string;
  opd_id: string | null;
}

interface Office {
  id: string;
  name: string;
  opd_id?: string | null;
}

interface Position {
  id: string;
  name: string;
}

type MutationType = "profile_change" | "transfer";

export function MutationRequestForm({ employee, onSuccess }: MutationRequestFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mutationType, setMutationType] = useState<MutationType>("profile_change");
  
  // Master data
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [workUnits, setWorkUnits] = useState<WorkUnit[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  
  // Form state - Profile changes (phone/whatsapp gabung jadi satu field)
  const [formData, setFormData] = useState({
    email: employee.email || "",
    phone: employee.phone || employee.whatsapp || "",
    address: employee.address || "",
    gender: employee.gender || "",
    golongan: employee.golongan || "",
    employee_category: employee.employee_category || "",
    position_id: "", // Akan diisi dari dropdown jabatan
    gelar_depan: employee.gelar_depan || "",
    gelar_belakang: employee.gelar_belakang || "",
    nik: employee.nik || "",
    opd_id: employee.opd_id || "",
    work_unit_id: employee.work_unit_id || "",
    office_id: employee.office_id || "",
  });
  
  // Form state - Transfer
  const [transferData, setTransferData] = useState({
    opd_id: employee.opd_id || "",
    work_unit_id: employee.work_unit_id || "",
    office_id: employee.office_id || "",
  });
  
  const [reason, setReason] = useState("");

  // Fetch master data
  useEffect(() => {
    if (isOpen && employee.tenant_id) {
      fetchMasterData();
    }
  }, [isOpen, employee.tenant_id]);

  const fetchMasterData = async () => {
    try {
      const [opdRes, workUnitRes, officeRes, positionRes] = await Promise.all([
        supabase.from("opd").select("id, name, code").eq("tenant_id", employee.tenant_id).eq("is_active", true),
        supabase.from("work_units").select("id, name, opd_id").eq("tenant_id", employee.tenant_id).eq("is_active", true),
        supabase.from("offices").select("id, name, opd_id").eq("tenant_id", employee.tenant_id).eq("is_active", true),
        supabase.from("positions").select("id, name").eq("tenant_id", employee.tenant_id).eq("is_active", true),
      ]);

      if (opdRes.data) setOpdList(opdRes.data);
      if (workUnitRes.data) setWorkUnits(workUnitRes.data);
      if (officeRes.data) setOffices(officeRes.data as Office[]);
      if (positionRes.data) setPositions(positionRes.data);
    } catch (error) {
      console.error("Error fetching master data:", error);
    }
  };

  // Filter work units by selected OPD
  const filteredWorkUnits = transferData.opd_id
    ? workUnits.filter((wu) => wu.opd_id === transferData.opd_id)
    : workUnits;

  // Filter offices by selected OPD (offices are linked to OPD, not work_unit)
  const filteredOffices = transferData.opd_id
    ? offices.filter((o) => o.opd_id === transferData.opd_id)
    : offices;

  // Filter work units & offices by selected OPD untuk form profile change
  const profileFilteredWorkUnits = formData.opd_id
    ? workUnits.filter((wu) => wu.opd_id === formData.opd_id)
    : workUnits;

  const profileFilteredOffices = formData.opd_id
    ? offices.filter((o) => o.opd_id === formData.opd_id)
    : offices;

  const getChangedFields = () => {
    const changes: Record<string, any> = {};
    const original: Record<string, any> = {};

    if (mutationType === "transfer") {
      if (transferData.opd_id && transferData.opd_id !== employee.opd_id) {
        changes.opd_id = transferData.opd_id;
        original.opd_id = employee.opd_id;
        original.opd_name = employee.opd?.name;
        const newOpd = opdList.find((o) => o.id === transferData.opd_id);
        changes.opd_name = newOpd?.name;
      }

      if (transferData.work_unit_id && transferData.work_unit_id !== employee.work_unit_id) {
        changes.work_unit_id = transferData.work_unit_id;
        original.work_unit_id = employee.work_unit_id;
        original.work_unit_name = employee.work_unit?.name;
        const newWu = workUnits.find((wu) => wu.id === transferData.work_unit_id);
        changes.work_unit_name = newWu?.name;
      }

      if (transferData.office_id && transferData.office_id !== employee.office_id) {
        changes.office_id = transferData.office_id;
        original.office_id = employee.office_id;
        original.office_name = employee.offices?.name;
        const newOffice = offices.find((o) => o.id === transferData.office_id);
        changes.office_name = newOffice?.name;
      }

      return { changes, original };
    }

    // Semua perubahan dilakukan di satu form (tidak dipisah lagi)
    // Profile fields (kecuali nama & NIP)
    const profileFields = [
      "email", "address", "gender", 
      "golongan", "employee_category",
      "gelar_depan", "gelar_belakang", "nik"
    ];

    profileFields.forEach((field) => {
      const currentValue = (employee as any)[field] || "";
      const newValue = (formData as any)[field] || "";
      if (currentValue !== newValue && newValue !== "") {
        changes[field] = newValue;
        original[field] = currentValue;
      }
    });

    // Phone - disimpan ke phone dan whatsapp
    const currentPhone = employee.phone || employee.whatsapp || "";
    if (formData.phone && formData.phone !== currentPhone) {
      changes.phone = formData.phone;
      changes.whatsapp = formData.phone;
      original.phone = employee.phone || "";
      original.whatsapp = employee.whatsapp || "";
    }

    // Position dari dropdown
    if (formData.position_id) {
      const selectedPosition = positions.find(p => p.id === formData.position_id);
      if (selectedPosition && selectedPosition.name !== employee.position) {
        changes.position = selectedPosition.name;
        changes.position_id = formData.position_id;
        original.position = employee.position || "";
      }
    }

    // OPD/Satuan Kerja/Lokasi Kerja
    if (formData.opd_id && formData.opd_id !== employee.opd_id) {
      changes.opd_id = formData.opd_id;
      original.opd_id = employee.opd_id;
      original.opd_name = employee.opd?.name;
      const newOpd = opdList.find((o) => o.id === formData.opd_id);
      changes.opd_name = newOpd?.name;
    }
    if (formData.work_unit_id && formData.work_unit_id !== employee.work_unit_id) {
      changes.work_unit_id = formData.work_unit_id;
      original.work_unit_id = employee.work_unit_id;
      original.work_unit_name = employee.work_unit?.name;
      const newWu = workUnits.find((wu) => wu.id === formData.work_unit_id);
      changes.work_unit_name = newWu?.name;
    }
    if (formData.office_id && formData.office_id !== employee.office_id) {
      changes.office_id = formData.office_id;
      original.office_id = employee.office_id;
      original.office_name = employee.offices?.name;
      const newOffice = offices.find((o) => o.id === formData.office_id);
      changes.office_name = newOffice?.name;
    }

    return { changes, original };
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error("Alasan pengajuan wajib diisi");
      return;
    }

    const { changes, original } = getChangedFields();

    if (Object.keys(changes).length === 0) {
      toast.error("Tidak ada perubahan yang diajukan");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.from("mutation_requests").insert({
        tenant_id: employee.tenant_id,
        employee_id: employee.id,
        mutation_type: mutationType,
        requested_changes: changes,
        original_data: original,
        reason: reason.trim(),
      });

      if (error) throw error;

      toast.success("Pengajuan mutasi berhasil dikirim");
      setIsOpen(false);
      resetForm();
      onSuccess?.();
    } catch (error: any) {
      console.error("Error submitting mutation request:", error);
      toast.error("Gagal mengajukan mutasi", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setMutationType("profile_change");
    setFormData({
      email: employee.email || "",
      phone: employee.phone || employee.whatsapp || "",
      address: employee.address || "",
      gender: employee.gender || "",
      golongan: employee.golongan || "",
      employee_category: employee.employee_category || "",
      position_id: "",
      gelar_depan: employee.gelar_depan || "",
      gelar_belakang: employee.gelar_belakang || "",
      nik: employee.nik || "",
      opd_id: employee.opd_id || "",
      work_unit_id: employee.work_unit_id || "",
      office_id: employee.office_id || "",
    });
    setTransferData({
      opd_id: employee.opd_id || "",
      work_unit_id: employee.work_unit_id || "",
      office_id: employee.office_id || "",
    });
    setReason("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2">
          <Edit3 className="w-4 h-4" />
          Ajukan Mutasi / Perubahan Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-primary" />
            Pengajuan Mutasi
          </DialogTitle>
          <DialogDescription>
            Ajukan perubahan data profil atau mutasi ke unit kerja lain.
            Data Nama dan NIP tidak dapat diubah.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Mutation Type Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Jenis Pengajuan</Label>
            <div className="grid grid-cols-2 gap-3">
              <Card 
                className={`cursor-pointer transition-all ${
                  mutationType === "profile_change" 
                    ? "ring-2 ring-primary bg-primary/5" 
                    : "hover:bg-muted/50"
                }`}
                onClick={() => setMutationType("profile_change")}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Perubahan Profil</p>
                    <p className="text-xs text-muted-foreground">Data personal</p>
                  </div>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all ${
                  mutationType === "transfer" 
                    ? "ring-2 ring-primary bg-primary/5" 
                    : "hover:bg-muted/50"
                }`}
                onClick={() => setMutationType("transfer")}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Mutasi/Pindah</p>
                    <p className="text-xs text-muted-foreground">OPD/Unit Kerja</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator />

          {/* Current Data Info */}
          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Data Saat Ini
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Nama:</span>{" "}
                <span className="font-medium">{employee.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">NIP:</span>{" "}
                <span className="font-medium">{employee.nip || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">OPD:</span>{" "}
                <span className="font-medium">{employee.opd?.name || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Satuan Kerja:</span>{" "}
                <span className="font-medium">{employee.work_unit?.name || "-"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Profile Change Form - Semua perubahan di satu form */}
          {mutationType === "profile_change" && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Data yang Ingin Diubah</Label>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nik">NIK</Label>
                  <Input
                    id="nik"
                    value={formData.nik}
                    onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    placeholder="NIK"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Email"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="phone">No. Telepon / WhatsApp</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="No. Telepon / WhatsApp"
                  />
                  <p className="text-xs text-muted-foreground">Nomor ini akan digunakan untuk WhatsApp juga</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Jenis Kelamin</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(v) => setFormData({ ...formData, gender: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis kelamin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="laki-laki">Laki-laki</SelectItem>
                      <SelectItem value="perempuan">Perempuan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="golongan">Golongan</Label>
                  <Select
                    value={formData.golongan}
                    onValueChange={(v) => setFormData({ ...formData, golongan: v })}
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

                <div className="space-y-2">
                  <Label htmlFor="gelar_depan">Gelar Depan</Label>
                  <Input
                    id="gelar_depan"
                    value={formData.gelar_depan}
                    onChange={(e) => setFormData({ ...formData, gelar_depan: e.target.value })}
                    placeholder="Contoh: Dr., Ir."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gelar_belakang">Gelar Belakang</Label>
                  <Input
                    id="gelar_belakang"
                    value={formData.gelar_belakang}
                    onChange={(e) => setFormData({ ...formData, gelar_belakang: e.target.value })}
                    placeholder="Contoh: S.Kom, M.T."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="employee_category">Kategori Pegawai</Label>
                  <Select
                    value={formData.employee_category}
                    onValueChange={(v) => setFormData({ ...formData, employee_category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ASN">ASN</SelectItem>
                      <SelectItem value="P3K">P3K</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position">Jabatan</Label>
                  <Select
                    value={formData.position_id}
                    onValueChange={(v) => setFormData({ ...formData, position_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jabatan" />
                    </SelectTrigger>
                    <SelectContent>
                      {positions.map((pos) => (
                        <SelectItem key={pos.id} value={pos.id}>
                          {pos.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Alamat</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Alamat lengkap"
                  rows={2}
                />
              </div>

              <Separator />

              {/* OPD / Satuan Kerja / Lokasi Kerja - dalam satu form */}
              <Label className="text-base font-semibold">Perubahan Unit Kerja (Opsional)</Label>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="opd_profile">OPD</Label>
                  <Select
                    value={formData.opd_id}
                    onValueChange={(v) => setFormData({ 
                      ...formData,
                      opd_id: v, 
                      work_unit_id: "", 
                      office_id: "" 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih OPD" />
                    </SelectTrigger>
                    <SelectContent>
                      {opdList.map((opd) => (
                        <SelectItem key={opd.id} value={opd.id}>
                          {opd.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {employee.opd?.name && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Saat ini: <Badge variant="secondary" className="text-xs">{employee.opd.name}</Badge>
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="work_unit_profile">Satuan Kerja</Label>
                  <Select
                    value={formData.work_unit_id}
                    onValueChange={(v) => setFormData({ ...formData, work_unit_id: v })}
                    disabled={!formData.opd_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.opd_id ? "Pilih Satuan Kerja" : "Pilih OPD terlebih dahulu"} />
                    </SelectTrigger>
                    <SelectContent>
                      {profileFilteredWorkUnits.map((wu) => (
                        <SelectItem key={wu.id} value={wu.id}>
                          {wu.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {employee.work_unit?.name && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Saat ini: <Badge variant="secondary" className="text-xs">{employee.work_unit.name}</Badge>
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="office_profile">Lokasi Kerja</Label>
                  <Select
                    value={formData.office_id}
                    onValueChange={(v) => setFormData({ ...formData, office_id: v })}
                    disabled={!formData.opd_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.opd_id ? "Pilih Lokasi Kerja" : "Pilih OPD terlebih dahulu"} />
                    </SelectTrigger>
                    <SelectContent>
                      {profileFilteredOffices.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {employee.offices?.name && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Saat ini: <Badge variant="secondary" className="text-xs">{employee.offices.name}</Badge>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Transfer Form */}
          {mutationType === "transfer" && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Tujuan Mutasi</Label>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="opd">OPD Baru</Label>
                  <Select
                    value={transferData.opd_id}
                    onValueChange={(v) => setTransferData({ 
                      opd_id: v, 
                      work_unit_id: "", 
                      office_id: "" 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih OPD tujuan" />
                    </SelectTrigger>
                    <SelectContent>
                      {opdList.map((opd) => (
                        <SelectItem key={opd.id} value={opd.id}>
                          {opd.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {employee.opd?.name && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Saat ini: <Badge variant="secondary" className="text-xs">{employee.opd.name}</Badge>
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="work_unit">Satuan Kerja Baru</Label>
                  <Select
                    value={transferData.work_unit_id}
                    onValueChange={(v) => setTransferData({ 
                      ...transferData, 
                      work_unit_id: v, 
                      office_id: "" 
                    })}
                    disabled={!transferData.opd_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={transferData.opd_id ? "Pilih Satuan Kerja" : "Pilih OPD terlebih dahulu"} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredWorkUnits.map((wu) => (
                        <SelectItem key={wu.id} value={wu.id}>
                          {wu.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {employee.work_unit?.name && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Saat ini: <Badge variant="secondary" className="text-xs">{employee.work_unit.name}</Badge>
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="office">Lokasi Kerja Baru</Label>
                  <Select
                    value={transferData.office_id}
                    onValueChange={(v) => setTransferData({ ...transferData, office_id: v })}
                    disabled={!transferData.opd_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={transferData.opd_id ? "Pilih Lokasi Kerja" : "Pilih OPD terlebih dahulu"} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredOffices.map((office) => (
                        <SelectItem key={office.id} value={office.id}>
                          {office.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {employee.offices?.name && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Saat ini: <Badge variant="secondary" className="text-xs">{employee.offices.name}</Badge>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-base font-semibold">
              Alasan Pengajuan <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Jelaskan alasan pengajuan mutasi atau perubahan data..."
              rows={3}
            />
          </div>

          {/* Preview Changes */}
          {(() => {
            const { changes } = getChangedFields();
            const hasChanges = Object.keys(changes).length > 0;
            
            if (!hasChanges) return null;

            return (
              <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Perubahan yang Akan Diajukan
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  {Object.entries(changes).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-muted-foreground capitalize">
                        {key.replace(/_/g, " ").replace("id", "").replace("name", "")}:
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{String(value)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          {/* Submit Button */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setIsOpen(false);
                resetForm();
              }}
              disabled={isLoading}
            >
              Batal
            </Button>
            <Button 
              className="flex-1 gap-2" 
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Ajukan Mutasi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
