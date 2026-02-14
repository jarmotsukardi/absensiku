import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  UserPlus, 
  Search, 
  Copy, 
  Check, 
  X, 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  Link as LinkIcon,
  Mail,
  MessageSquare,
  Building2,
  MapPin,
  User,
  CalendarClock,
} from "lucide-react";
import { addDays, format } from "date-fns";

interface Invitation {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  nik: string;
  status: string;
  invitation_code: string;
  invitation_type: string;
  expires_at: string | null;
  created_at: string;
  verified_at: string | null;
  opd_id: string | null;
  opd?: { id: string; name: string } | null;
  office?: { id: string; name: string } | null;
}

interface OPD {
  id: string;
  name: string;
}

interface Office {
  id: string;
  name: string;
}

const ITEMS_PER_PAGE = 15;

export default function OrgEmployeeInvitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterOpdId, setFilterOpdId] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [invitationType, setInvitationType] = useState<"individual" | "opd" | "office">("individual");
  const [expiryDays, setExpiryDays] = useState("7");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    nik: "",
    opd_id: "",
    office_id: "",
  });
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [opdList, setOpdList] = useState<OPD[]>([]);
  const [officeList, setOfficeList] = useState<Office[]>([]);

  useEffect(() => {
    fetchTenantAndData();
  }, []);

  const fetchTenantAndData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!roleData?.tenant_id) return;
      setTenantId(roleData.tenant_id);

      // Fetch invitations with OPD and Office data
      const { data: invData, error: invError } = await supabase
        .from("employee_invitations")
        .select(`
          *,
          opd:opd_id(id, name),
          office:office_id(id, name)
        `)
        .eq("tenant_id", roleData.tenant_id)
        .order("created_at", { ascending: false });

      if (invError) throw invError;
      setInvitations((invData || []) as Invitation[]);

      // Fetch OPD list
      const { data: opdData } = await supabase
        .from("opd")
        .select("id, name")
        .eq("tenant_id", roleData.tenant_id)
        .eq("is_active", true)
        .order("name");
      setOpdList(opdData || []);

      // Fetch Office list
      const { data: officeData } = await supabase
        .from("offices")
        .select("id, name")
        .eq("tenant_id", roleData.tenant_id)
        .eq("is_active", true)
        .order("name");
      setOfficeList(officeData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Gagal memuat data");
    } finally {
      setIsLoading(false);
    }
  };

  const generateInvitationCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateInvitation = async () => {
    if (invitationType === "individual") {
      if (!formData.name || !formData.email || !formData.nik) {
        toast.error("Nama, Email, dan NIK harus diisi");
        return;
      }
    } else if (invitationType === "opd" && !formData.opd_id) {
      toast.error("Pilih OPD terlebih dahulu");
      return;
    } else if (invitationType === "office" && !formData.office_id) {
      toast.error("Pilih Lokasi Kerja terlebih dahulu");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !tenantId) return;

      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const code = generateInvitationCode();
      const expiresAt = addDays(new Date(), parseInt(expiryDays));

      const insertData: any = {
        tenant_id: tenantId,
        invitation_code: code,
        invitation_type: invitationType,
        expires_at: expiresAt.toISOString(),
        invited_by: empData?.id || null,
      };

      if (invitationType === "individual") {
        insertData.name = formData.name;
        insertData.email = formData.email;
        insertData.phone = formData.phone || null;
        insertData.nik = formData.nik;
      } else if (invitationType === "opd") {
        insertData.opd_id = formData.opd_id;
        insertData.name = opdList.find(o => o.id === formData.opd_id)?.name || "Undangan OPD";
        insertData.email = "bulk@invitation.local";
        insertData.nik = "0000000000000000";
      } else if (invitationType === "office") {
        insertData.office_id = formData.office_id;
        insertData.name = officeList.find(o => o.id === formData.office_id)?.name || "Undangan Lokasi";
        insertData.email = "bulk@invitation.local";
        insertData.nik = "0000000000000000";
      }

      const { error } = await supabase.from("employee_invitations").insert(insertData);
      if (error) throw error;

      setGeneratedCode(code);
      toast.success("Undangan berhasil dibuat!");
      fetchTenantAndData();
    } catch (error: any) {
      console.error("Error creating invitation:", error);
      toast.error(error.message || "Gagal membuat undangan");
    }
  };

  const handleVerify = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const { error } = await supabase
        .from("employee_invitations")
        .update({ 
          status: "verified", 
          verified_at: new Date().toISOString(),
          verified_by: empData?.id || null,
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Undangan diverifikasi!");
      fetchTenantAndData();
    } catch (error) {
      toast.error("Gagal memverifikasi");
    }
  };

  const handleReject = async (id: string) => {
    try {
      const { error } = await supabase
        .from("employee_invitations")
        .update({ status: "rejected", rejection_reason: "Ditolak oleh admin" })
        .eq("id", id);

      if (error) throw error;
      toast.success("Undangan ditolak");
      fetchTenantAndData();
    } catch (error) {
      toast.error("Gagal menolak");
    }
  };

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/employee/login?invite=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("Link undangan disalin!");
  };

  const sendViaWhatsApp = (phone: string, code: string, name: string) => {
    const link = `${window.location.origin}/employee/login?invite=${code}`;
    const message = `Halo ${name},\n\nAnda diundang untuk bergabung dengan sistem absensi.\n\nKode Undangan: ${code}\nLink Daftar: ${link}\n\nSilakan klik link di atas untuk mendaftar.`;
    const waUrl = `https://wa.me/${phone.replace(/^0/, "62").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
  };

  const filteredInvitations = invitations.filter(inv => {
    const matchesSearch = inv.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          inv.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          inv.invitation_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || inv.status === filterStatus;
    const matchesOpd = filterOpdId === "all" || (inv.opd as any)?.id === filterOpdId || (!inv.opd && filterOpdId === "none");
    return matchesSearch && matchesStatus && matchesOpd;
  });

  const totalPages = Math.ceil(filteredInvitations.length / ITEMS_PER_PAGE);
  const paginatedInvitations = filteredInvitations.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-500"><Check className="w-3 h-3 mr-1" />Terverifikasi</Badge>;
      case "rejected":
        return <Badge className="bg-red-500"><X className="w-3 h-3 mr-1" />Ditolak</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Menunggu</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "opd":
        return <Badge variant="outline"><Building2 className="w-3 h-3 mr-1" />OPD</Badge>;
      case "office":
        return <Badge variant="outline"><MapPin className="w-3 h-3 mr-1" />Lokasi</Badge>;
      default:
        return <Badge variant="outline"><User className="w-3 h-3 mr-1" />Individual</Badge>;
    }
  };

  const resetForm = () => {
    setFormData({ name: "", email: "", phone: "", nik: "", opd_id: "", office_id: "" });
    setGeneratedCode(null);
    setInvitationType("individual");
    setExpiryDays("7");
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UserPlus className="h-6 w-6" />
              Undangan Pegawai
            </h1>
            <p className="text-muted-foreground">Kelola undangan dan verifikasi calon pegawai</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><UserPlus className="mr-2 h-4 w-4" /> Buat Undangan</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Buat Undangan Pegawai</DialogTitle>
                <DialogDescription>
                  Pilih jenis undangan dan tentukan masa berlaku
                </DialogDescription>
              </DialogHeader>
              
              {!generatedCode ? (
                <div className="space-y-4 py-4">
                  {/* Invitation Type */}
                  <div className="space-y-2">
                    <Label>Jenis Undangan</Label>
                    <Tabs value={invitationType} onValueChange={(v) => setInvitationType(v as any)}>
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="individual" className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span className="hidden sm:inline">Individual</span>
                        </TabsTrigger>
                        <TabsTrigger value="opd" className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          <span className="hidden sm:inline">Per OPD</span>
                        </TabsTrigger>
                        <TabsTrigger value="office" className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span className="hidden sm:inline">Per Lokasi</span>
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Expiry */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4" />
                      Masa Berlaku
                    </Label>
                    <Select value={expiryDays} onValueChange={setExpiryDays}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Hari</SelectItem>
                        <SelectItem value="3">3 Hari</SelectItem>
                        <SelectItem value="7">7 Hari</SelectItem>
                        <SelectItem value="14">14 Hari</SelectItem>
                        <SelectItem value="30">30 Hari</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {invitationType === "individual" && (
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        <Label>Nama Lengkap *</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Nama pegawai"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="email@instansi.go.id"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>No. WhatsApp</Label>
                        <Input
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="08xxxxxxxxxx"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>NIK *</Label>
                        <Input
                          value={formData.nik}
                          onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                          placeholder="16 digit NIK"
                          maxLength={16}
                        />
                      </div>
                    </div>
                  )}

                  {invitationType === "opd" && (
                    <div className="space-y-2">
                      <Label>Pilih OPD *</Label>
                      <Select value={formData.opd_id} onValueChange={(v) => setFormData({ ...formData, opd_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih OPD" />
                        </SelectTrigger>
                        <SelectContent>
                          {opdList.map((opd) => (
                            <SelectItem key={opd.id} value={opd.id}>{opd.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Kode undangan ini dapat digunakan oleh semua pegawai di OPD terpilih
                      </p>
                    </div>
                  )}

                  {invitationType === "office" && (
                    <div className="space-y-2">
                      <Label>Pilih Lokasi Kerja *</Label>
                      <Select value={formData.office_id} onValueChange={(v) => setFormData({ ...formData, office_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Lokasi" />
                        </SelectTrigger>
                        <SelectContent>
                          {officeList.map((office) => (
                            <SelectItem key={office.id} value={office.id}>{office.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Kode undangan ini dapat digunakan oleh semua pegawai di lokasi terpilih
                      </p>
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                    <Button onClick={handleCreateInvitation}>Buat Undangan</Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="py-4 space-y-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                    <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="font-medium text-green-600">Undangan Berhasil Dibuat!</p>
                  </div>
                  
                  <div className="p-4 bg-muted rounded-lg">
                    <Label className="text-xs text-muted-foreground">Kode Undangan</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-2xl font-bold tracking-widest flex-1">{generatedCode}</code>
                      <Button variant="outline" size="icon" onClick={() => copyInviteLink(generatedCode)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Berlaku hingga: {format(addDays(new Date(), parseInt(expiryDays)), "d MMMM yyyy")}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {formData.phone && invitationType === "individual" && (
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => sendViaWhatsApp(formData.phone, generatedCode, formData.name)}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Kirim via WA
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => copyInviteLink(generatedCode)}
                    >
                      <LinkIcon className="w-4 h-4 mr-2" />
                      Salin Link
                    </Button>
                  </div>

                  <DialogFooter>
                    <Button onClick={() => { setIsDialogOpen(false); resetForm(); }}>Selesai</Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Undangan</CardTitle>
            <CardDescription>{filteredInvitations.length} undangan</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, email, atau kode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Tabs value={filterStatus} onValueChange={setFilterStatus}>
                  <TabsList>
                    <TabsTrigger value="all">Semua</TabsTrigger>
                    <TabsTrigger value="pending">Menunggu</TabsTrigger>
                    <TabsTrigger value="verified">Terverifikasi</TabsTrigger>
                    <TabsTrigger value="rejected">Ditolak</TabsTrigger>
                  </TabsList>
                </Tabs>
                {opdList.length > 0 && (
                  <Select value={filterOpdId} onValueChange={setFilterOpdId}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter OPD" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua OPD</SelectItem>
                      <SelectItem value="none">Tanpa OPD</SelectItem>
                      {opdList.map((opd) => (
                        <SelectItem key={opd.id} value={opd.id}>{opd.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama/Target</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Berlaku</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    </TableCell>
                  </TableRow>
                ) : paginatedInvitations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Belum ada undangan
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedInvitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{inv.name}</p>
                          {inv.invitation_type === "individual" && (
                            <p className="text-xs text-muted-foreground">{inv.email}</p>
                          )}
                          {inv.opd && <p className="text-xs text-muted-foreground">{inv.opd.name}</p>}
                          {inv.office && <p className="text-xs text-muted-foreground">{inv.office.name}</p>}
                        </div>
                      </TableCell>
                      <TableCell>{getTypeBadge(inv.invitation_type || "individual")}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{inv.invitation_code}</code>
                      </TableCell>
                      <TableCell>
                        {isExpired(inv.expires_at) && inv.status === "pending" ? (
                          <Badge variant="destructive">Kedaluwarsa</Badge>
                        ) : (
                          getStatusBadge(inv.status)
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.expires_at ? format(new Date(inv.expires_at), "d MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => copyInviteLink(inv.invitation_code)}>
                            <LinkIcon className="h-4 w-4" />
                          </Button>
                          {inv.status === "pending" && !isExpired(inv.expires_at) && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => handleVerify(inv.id)}>
                                <Check className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleReject(inv.id)}>
                                <X className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

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
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
