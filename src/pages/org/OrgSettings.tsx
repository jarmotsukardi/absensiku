import React, { useState, useEffect, useCallback, useRef } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Building2, Clock, Globe, Loader2, Image, ExternalLink, Eye, AlertTriangle, Shield, MessageSquare, Trash2, Wallet, Key, Zap } from "lucide-react";
import { toast } from "sonner";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { INDONESIA_TIMEZONES, formatToTimezone } from "@/lib/timezone";
import { LogoUploader } from "@/components/common/LogoUploader";
import { Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SingleOTPInput, { SingleOTPInputRef } from "@/components/common/SingleOTPInput";
import { supabase } from "@/integrations/supabase/client";
import { OrgFloatingWhatsappSettings } from "@/components/org/settings/OrgFloatingWhatsappSettings";
import { AccountDeletionDialog } from "@/components/org/AccountDeletionDialog";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { OrgActivationTab } from "@/components/org/OrgActivationTab";

const ORGANIZATION_TYPES = [
  { value: "pemerintah_daerah", label: "Pemerintah Daerah" },
  { value: "instansi_pemerintah", label: "Instansi Pemerintah" },
  { value: "perusahaan", label: "Perusahaan" },
  { value: "sekolah", label: "Sekolah" },
];

export default function OrgSettings() {
  const { organization, isLoading, updateOrganization, updateTimezone } = useOrganizationSettings();
  const [activeTab, setActiveTab] = useState("general");
  const [isSaving, setIsSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  
  // Billing mode OTP states
  const [showBillingOtpDialog, setShowBillingOtpDialog] = useState(false);
  const [pendingBillingMode, setPendingBillingMode] = useState<string>("");
  const [billingOtpSent, setBillingOtpSent] = useState(false);
  const [billingOtpValid, setBillingOtpValid] = useState(false);
  const [isSendingBillingOtp, setIsSendingBillingOtp] = useState(false);
  const [isVerifyingBillingOtp, setIsVerifyingBillingOtp] = useState(false);
  const billingOtpRef = useRef<SingleOTPInputRef>(null);

  // B2B threshold
  const [b2bThreshold, setB2bThreshold] = useState(2000);
  const [showB2bOverlay, setShowB2bOverlay] = useState(false);
  const [activeEmployeeCount, setActiveEmployeeCount] = useState(0);

  useEffect(() => {
    // Fetch B2B threshold from system settings
    const fetchB2bThreshold = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "b2b_negotiation_threshold")
        .maybeSingle();
      if (data?.value) {
        setB2bThreshold(parseInt(String(data.value)) || 2000);
      }
    };
    fetchB2bThreshold();
  }, []);

  useEffect(() => {
    if (organization?.id) {
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", organization.id)
        .eq("is_active", true)
        .then(({ count }) => setActiveEmployeeCount(count || 0));
    }
  }, [organization?.id]);
  
  const handleBillingOtpChange = useCallback((value: string) => {
    setBillingOtpValid(value.length === 6);
  }, []);

  // OTP states for organization type change
  const [showOtpDialog, setShowOtpDialog] = useState(false);
  const [pendingOrgType, setPendingOrgType] = useState<string>("");
  const [otpValid, setOtpValid] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  
  // Ref untuk OTP input (uncontrolled)
  const otpInputRef = useRef<SingleOTPInputRef>(null);
  
  // Stable callback untuk OTP change (mencegah re-render berlebih)
  const handleOtpChange = useCallback((value: string) => {
    setOtpValid(value.length === 6);
  }, []);
  
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    email: "",
    phone: "",
    address: "",
    description: "",
    organization_type: "",
    timezone: "",
    logo_url: "",
    landing_hero_image: "",
    whatsapp: "",
    pic_name: "",
    pic_whatsapp: "",
  });

  // Separate effect to initialize form data ONLY once when organization first loads
  const initializedRef = React.useRef(false);
  useEffect(() => {
    if (organization && !initializedRef.current) {
      initializedRef.current = true;
      setFormData({
        name: organization.name || "",
        code: organization.code || "",
        email: organization.email || "",
        phone: organization.phone || "",
        address: organization.address || "",
        description: organization.description || "",
        organization_type: organization.organization_type || "",
        timezone: organization.timezone || "Asia/Jakarta",
        logo_url: organization.logo_url || "",
        landing_hero_image: organization.landing_hero_image || "",
        whatsapp: organization.whatsapp || "",
        pic_name: (organization as any).pic_name || "",
        pic_whatsapp: (organization as any).pic_whatsapp || "",
      });
    }
  }, [organization]);

  useEffect(() => {
    const updateTime = () => {
      if (formData.timezone) {
        const now = new Date();
        setCurrentTime(formatToTimezone(now, formData.timezone, "EEEE, dd MMMM yyyy HH:mm:ss"));
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [formData.timezone]);

  const handleOrgTypeChange = (newType: string) => {
    if (newType !== formData.organization_type) {
      setPendingOrgType(newType);
      setShowOtpDialog(true);
      otpInputRef.current?.clear();
      setOtpValid(false);
      setOtpSent(false);
    }
  };

  const handleSendOtp = async () => {
    if (!formData.whatsapp) {
      toast.error("Nomor WhatsApp belum diatur. Silakan update nomor WhatsApp terlebih dahulu.");
      return;
    }

    setIsSendingOtp(true);
    try {
      // Use edge function to securely generate and send OTP
      const { data, error } = await supabase.functions.invoke("send-org-type-otp", {
        body: {
          email: organization?.email || formData.email,
          whatsapp: formData.whatsapp,
        },
      });

      if (error) throw error;

      if (data.demo_otp) {
        // Demo mode - show OTP if WhatsApp gateway not configured
        toast.info(`[DEMO] Kode OTP: ${data.demo_otp}`);
      } else {
        toast.success("Kode OTP telah dikirim ke WhatsApp Anda");
      }

      setOtpSent(true);
    } catch (error: any) {
      console.error("Error sending OTP:", error);
      toast.error("Gagal mengirim OTP. Coba lagi.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otpCode = otpInputRef.current?.getValue() || "";
    if (otpCode.length !== 6) {
      toast.error("Masukkan 6 digit kode OTP");
      return;
    }

    setIsVerifyingOtp(true);
    try {
      // Verify OTP via edge function (secure hash comparison)
      const { data, error } = await supabase.functions.invoke("verify-org-type-otp", {
        body: {
          email: organization?.email || formData.email,
          otp: otpCode,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error || "Kode OTP tidak valid atau sudah kedaluwarsa");
        return;
      }

      // Update organization type
      await updateOrganization({
        organization_type: pendingOrgType as any,
      });

      setFormData({ ...formData, organization_type: pendingOrgType });
      setShowOtpDialog(false);
      toast.success("Jenis organisasi berhasil diubah");
    } catch (error: any) {
      console.error("Error verifying OTP:", error);
      toast.error("Gagal verifikasi OTP");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSaveGeneral = async () => {
    setIsSaving(true);
    try {
      await updateOrganization({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        description: formData.description,
        whatsapp: formData.whatsapp,
        pic_name: formData.pic_name,
        pic_whatsapp: formData.pic_whatsapp,
      } as any);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTimezone = async () => {
    setIsSaving(true);
    try {
      await updateTimezone(formData.timezone);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <OrganizationLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Pengaturan Organisasi
          </h1>
          <p className="text-muted-foreground">Konfigurasi organisasi Anda</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 w-full lg:w-[900px] p-1">
            <TabsTrigger value="general" className="flex items-center gap-2 flex-1 min-w-[80px]">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Umum</span>
            </TabsTrigger>
            <TabsTrigger value="branding" className="flex items-center gap-2 flex-1 min-w-[80px]">
              <Image className="h-4 w-4" />
              <span className="hidden sm:inline">Branding</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2 flex-1 min-w-[80px]">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Pembiayaan</span>
            </TabsTrigger>
            <TabsTrigger value="timezone" className="flex items-center gap-2 flex-1 min-w-[80px]">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Zona Waktu</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-2 flex-1 min-w-[80px]">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2 flex-1 min-w-[80px]">
              <Key className="h-4 w-4" />
              <span className="hidden sm:inline">Keamanan</span>
            </TabsTrigger>
            <TabsTrigger value="danger" className="flex items-center gap-2 flex-1 min-w-[80px] text-destructive data-[state=active]:text-destructive">
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Hapus Akun</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Informasi Organisasi</CardTitle>
                <CardDescription>Pengaturan dasar organisasi Anda</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nama Organisasi</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nama organisasi"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Kode Organisasi</Label>
                    <Input
                      value={formData.code}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">Kode tidak dapat diubah</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Jenis Organisasi
                    <Shield className="h-4 w-4 text-muted-foreground" />
                  </Label>
                  <Select
                    value={formData.organization_type}
                    onValueChange={handleOrgTypeChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jenis organisasi" />
                    </SelectTrigger>
                    <SelectContent>
                      {ORGANIZATION_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Mengubah jenis organisasi memerlukan verifikasi OTP WhatsApp</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@organisasi.go.id"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nomor Telepon</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="021-xxxxxxx"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Nomor WhatsApp (untuk OTP)</Label>
                  <Input
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    placeholder="6281234567890"
                  />
                  <p className="text-xs text-muted-foreground">Format: 62xxx (tanpa + atau 0 di depan)</p>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h4 className="font-medium mb-4">Penanggung Jawab (PIC)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nama PIC</Label>
                      <Input
                        value={formData.pic_name}
                        onChange={(e) => setFormData({ ...formData, pic_name: e.target.value })}
                        placeholder="Nama penanggung jawab"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>WhatsApp PIC</Label>
                      <Input
                        value={formData.pic_whatsapp}
                        onChange={(e) => setFormData({ ...formData, pic_whatsapp: e.target.value })}
                        placeholder="6281234567890"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Alamat</Label>
                  <Textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Alamat lengkap organisasi"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Deskripsi</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Deskripsi singkat tentang organisasi"
                    rows={2}
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveGeneral} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan Perubahan
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Branding Organisasi
                </CardTitle>
                <CardDescription>
                  Upload logo dan gambar hero untuk dashboard pegawai dan halaman landing publik.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {organization?.id && (
                  <>
                    <LogoUploader
                      currentLogoUrl={formData.logo_url}
                      tenantId={organization.id}
                      onUploadComplete={async (url) => {
                        setFormData({ ...formData, logo_url: url });
                        await updateOrganization({ logo_url: url });
                      }}
                      label="Logo Organisasi"
                      bucket="organization-logos"
                    />

                    <div className="border-t pt-6">
                      <LogoUploader
                        currentLogoUrl={formData.landing_hero_image}
                        tenantId={organization.id}
                        onUploadComplete={async (url) => {
                          setFormData({ ...formData, landing_hero_image: url });
                          await updateOrganization({ landing_hero_image: url });
                        }}
                        label="Hero Image Landing Page"
                        bucket="organization-logos"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Gambar ini akan ditampilkan sebagai banner utama di halaman landing organisasi.
                        Disarankan menggunakan gambar dengan rasio 16:9 dan resolusi minimal 1920x1080.
                      </p>
                    </div>

                    <div className="border-t pt-6">
                      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                        <div>
                          <h4 className="font-medium">Preview Landing Page</h4>
                          <p className="text-sm text-muted-foreground">
                            Lihat tampilan halaman landing organisasi Anda
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            onClick={() => window.open(`/landing/${organization.code}?preview=true`, "_blank")}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                          </Button>
                          <Button 
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/landing/${organization.code}`);
                              toast.success("Link landing page disalin!");
                            }}
                            title="Salin link"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-2">
                  <h4 className="font-medium text-amber-900 dark:text-amber-100">Tips Upload:</h4>
                  <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1 list-disc list-inside">
                    <li><strong>Logo:</strong> PNG dengan latar transparan, minimal 200x200 pixel</li>
                    <li><strong>Hero Image:</strong> JPG/PNG, rasio 16:9, minimal 1920x1080 pixel</li>
                    <li>Logo akan ditampilkan di header dashboard pegawai</li>
                    <li>Hero image akan menjadi banner di halaman landing organisasi</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing/Pembiayaan Tab */}
          <TabsContent value="billing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Kebijakan Pembiayaan
                </CardTitle>
                <CardDescription>
                  Tentukan bagaimana biaya langganan sistem absensi akan ditanggung. Perubahan mode memerlukan verifikasi OTP.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Apa itu kebijakan pembiayaan?</strong><br />
                    Kebijakan ini menentukan siapa yang bertanggung jawab atas biaya langganan.
                    Perubahan mode dilindungi verifikasi OTP untuk keamanan.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    className={`p-5 rounded-xl border-2 text-left transition-all relative ${
                      (organization as any)?.billing_mode !== "individual"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => {
                      if ((organization as any)?.billing_mode === "individual") {
                        setPendingBillingMode("centralized");
                        setShowBillingOtpDialog(true);
                        setBillingOtpSent(false);
                        setBillingOtpValid(false);
                        billingOtpRef.current?.clear();
                      } else if (activeEmployeeCount >= b2bThreshold) {
                        setShowB2bOverlay(true);
                      }
                    }}
                    onMouseEnter={() => {
                      if ((organization as any)?.billing_mode !== "individual" && activeEmployeeCount >= b2bThreshold) {
                        setShowB2bOverlay(true);
                      }
                    }}
                    onMouseLeave={() => setShowB2bOverlay(false)}
                  >
                    {showB2bOverlay && (
                      <div className="absolute inset-0 z-10 rounded-xl bg-primary/95 text-primary-foreground p-5 flex flex-col justify-center animate-in fade-in duration-200">
                        <p className="font-semibold text-sm mb-1">🤝 Negosiasi B2B Tersedia</p>
                        <p className="text-xs opacity-90">
                          Dengan <strong>{activeEmployeeCount.toLocaleString()}</strong> pegawai aktif (≥ {b2bThreshold.toLocaleString()}),
                          Anda dapat melakukan negosiasi harga khusus korporasi. Hubungi tim sales kami.
                        </p>
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        (organization as any)?.billing_mode !== "individual" ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Billing Terpusat</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Organisasi membayar lisensi untuk <strong>semua anggota</strong>.
                        </p>
                        <ul className="text-xs text-muted-foreground mt-2 space-y-0.5 list-disc list-inside">
                          <li>Pembayaran dilakukan admin organisasi</li>
                          <li>Pegawai tidak perlu membayar apapun</li>
                          <li>Invoice tunggal untuk seluruh organisasi</li>
                        </ul>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`p-5 rounded-xl border-2 text-left transition-all ${
                      (organization as any)?.billing_mode === "individual"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => {
                      if ((organization as any)?.billing_mode !== "individual") {
                        setPendingBillingMode("individual");
                        setShowBillingOtpDialog(true);
                        setBillingOtpSent(false);
                        setBillingOtpValid(false);
                        billingOtpRef.current?.clear();
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        (organization as any)?.billing_mode === "individual" ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Billing Mandiri</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Setiap pegawai membayar lisensi <strong>secara individu</strong>.
                        </p>
                        <ul className="text-xs text-muted-foreground mt-2 space-y-0.5 list-disc list-inside">
                          <li>Tiap pegawai bayar sendiri</li>
                          <li>Admin tidak menanggung biaya</li>
                          <li>Invoice per individu</li>
                        </ul>
                      </div>
                    </div>
                  </button>
                </div>

                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    <strong>⚠️ Perhatian:</strong> Mengubah kebijakan pembiayaan akan memengaruhi alur pembayaran seluruh anggota.
                    Setiap perubahan memerlukan verifikasi OTP melalui WhatsApp.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="timezone" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Pengaturan Zona Waktu
                </CardTitle>
                <CardDescription>
                  Atur zona waktu untuk validasi absensi dan tampilan waktu di organisasi Anda.
                  Data absensi akan disimpan dalam format UTC dan ditampilkan sesuai zona waktu yang dipilih.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border bg-muted/50 p-4">
                  <div className="text-sm text-muted-foreground mb-1">Waktu saat ini di zona waktu terpilih:</div>
                  <div className="text-2xl font-mono font-bold">{currentTime}</div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Zona Waktu Indonesia</Label>
                    <Select
                      value={formData.timezone}
                      onValueChange={(v) => setFormData({ ...formData, timezone: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih zona waktu" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDONESIA_TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Zona waktu umum Indonesia: WIB (Jakarta), WITA (Makassar), WIT (Jayapura)
                    </p>
                  </div>

                  <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4 space-y-2">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100">Informasi Penting:</h4>
                    <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                      <li>Semua data absensi disimpan dalam format UTC (waktu universal)</li>
                      <li>Tampilan waktu akan otomatis dikonversi ke zona waktu yang dipilih</li>
                      <li>Validasi jam masuk/pulang menggunakan zona waktu organisasi</li>
                      <li>Perubahan zona waktu tidak memengaruhi data historis</li>
                      <li>Sistem aman dari manipulasi waktu perangkat pengguna</li>
                    </ul>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveTimezone} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan Zona Waktu
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* WhatsApp Tab */}
          <TabsContent value="whatsapp" className="space-y-4">
            {organization?.id && (
              <OrgFloatingWhatsappSettings tenantId={organization.id} />
            )}
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Lupa / Ganti Password
                </CardTitle>
                <CardDescription>
                  Kelola password akun admin organisasi Anda
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Gunakan fitur ini untuk mendapatkan password baru atau mengubah password akun admin organisasi Anda.
                    Sistem akan memverifikasi email dan no. WhatsApp yang terdaftar sebelum melakukan perubahan.
                  </p>
                  <Button onClick={() => setShowForgotPassword(true)}>
                    <Key className="w-4 h-4 mr-2" />
                    Lupa / Ganti Password
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Danger Zone Tab */}
          <TabsContent value="danger" className="space-y-4">
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Zona Berbahaya
                </CardTitle>
                <CardDescription>
                  Tindakan di bawah ini bersifat permanen dan tidak dapat dibatalkan tanpa bantuan Super Admin.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-destructive/30 p-4">
                  <div>
                    <p className="font-medium">Hapus Akun Organisasi</p>
                    <p className="text-sm text-muted-foreground">Menonaktifkan akun dan seluruh akses organisasi Anda.</p>
                  </div>
                  <AccountDeletionDialog />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* OTP Dialog for Organization Type Change */}
      <Dialog open={showOtpDialog} onOpenChange={setShowOtpDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Verifikasi Perubahan
            </DialogTitle>
            <DialogDescription>
              Untuk keamanan, perubahan jenis organisasi memerlukan verifikasi OTP WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm">
                <span className="text-muted-foreground">Jenis organisasi akan diubah menjadi:</span>
                <br />
                <span className="font-medium">
                  {ORGANIZATION_TYPES.find(t => t.value === pendingOrgType)?.label}
                </span>
              </p>
            </div>

            {!formData.whatsapp && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">
                  Nomor WhatsApp belum diatur. Silakan simpan nomor WhatsApp terlebih dahulu di tab Umum.
                </p>
              </div>
            )}

            {formData.whatsapp && !otpSent && (
              <Button
                onClick={handleSendOtp}
                disabled={isSendingOtp}
                className="w-full"
              >
                {isSendingOtp ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Mengirim OTP...
                  </>
                ) : (
                  "Kirim Kode OTP ke WhatsApp"
                )}
              </Button>
            )}

            {otpSent && (
              <div className="space-y-4">
                <p className="text-sm text-center text-muted-foreground">
                  Masukkan 6 digit kode OTP yang dikirim ke WhatsApp
                </p>
                <SingleOTPInput
                  ref={otpInputRef}
                  onChange={handleOtpChange}
                  autoFocus
                />
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleSendOtp}
                  disabled={isSendingOtp}
                  className="w-full"
                >
                  Kirim ulang kode
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOtpDialog(false)}>
              Batal
            </Button>
            {otpSent && (
              <Button
                onClick={handleVerifyOtp}
                disabled={isVerifyingOtp || !otpValid}
              >
                {isVerifyingOtp ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Memverifikasi...
                  </>
                ) : (
                  "Verifikasi & Ubah"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing Mode OTP Dialog */}
      <Dialog open={showBillingOtpDialog} onOpenChange={setShowBillingOtpDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Verifikasi Perubahan Mode Billing
            </DialogTitle>
            <DialogDescription>
              Untuk keamanan, perubahan mode billing memerlukan verifikasi OTP WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm">
                <span className="text-muted-foreground">Mode billing akan diubah menjadi:</span>
                <br />
                <span className="font-medium">
                  {pendingBillingMode === "individual" ? "Billing Mandiri" : "Billing Terpusat"}
                </span>
              </p>
            </div>

            {!formData.whatsapp && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">
                  Nomor WhatsApp belum diatur. Silakan simpan nomor WhatsApp terlebih dahulu di tab Umum.
                </p>
              </div>
            )}

            {formData.whatsapp && !billingOtpSent && (
              <Button
                onClick={async () => {
                  setIsSendingBillingOtp(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("send-billing-mode-otp", {
                      body: {
                        email: organization?.email || formData.email,
                        whatsapp: formData.whatsapp,
                        tenant_id: organization?.id,
                        new_mode: pendingBillingMode,
                      },
                    });
                    if (error) throw error;
                    if (data.demo_otp) {
                      toast.info(`[DEMO] Kode OTP: ${data.demo_otp}`);
                    } else {
                      toast.success("Kode OTP telah dikirim ke WhatsApp Anda");
                    }
                    setBillingOtpSent(true);
                  } catch (err: any) {
                    toast.error("Gagal mengirim OTP: " + (err.message || "Coba lagi"));
                  } finally {
                    setIsSendingBillingOtp(false);
                  }
                }}
                disabled={isSendingBillingOtp}
                className="w-full"
              >
                {isSendingBillingOtp ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Mengirim OTP...</>
                ) : (
                  "Kirim Kode OTP ke WhatsApp"
                )}
              </Button>
            )}

            {billingOtpSent && (
              <div className="space-y-4">
                <p className="text-sm text-center text-muted-foreground">
                  Masukkan 6 digit kode OTP yang dikirim ke WhatsApp
                </p>
                <SingleOTPInput ref={billingOtpRef} onChange={handleBillingOtpChange} autoFocus />
                <Button
                  variant="link"
                  size="sm"
                  onClick={async () => {
                    setIsSendingBillingOtp(true);
                    try {
                      const { data, error } = await supabase.functions.invoke("send-billing-mode-otp", {
                        body: {
                          email: organization?.email || formData.email,
                          whatsapp: formData.whatsapp,
                          tenant_id: organization?.id,
                          new_mode: pendingBillingMode,
                        },
                      });
                      if (error) throw error;
                      if (data.demo_otp) toast.info(`[DEMO] Kode OTP: ${data.demo_otp}`);
                      else toast.success("Kode OTP dikirim ulang");
                    } catch (err: any) {
                      toast.error("Gagal mengirim OTP");
                    } finally {
                      setIsSendingBillingOtp(false);
                    }
                  }}
                  disabled={isSendingBillingOtp}
                  className="w-full"
                >
                  Kirim ulang kode
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBillingOtpDialog(false)}>Batal</Button>
            {billingOtpSent && (
              <Button
                onClick={async () => {
                  const otpCode = billingOtpRef.current?.getValue() || "";
                  if (otpCode.length !== 6) {
                    toast.error("Masukkan 6 digit kode OTP");
                    return;
                  }
                  setIsVerifyingBillingOtp(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("verify-billing-mode-otp", {
                      body: {
                        email: organization?.email || formData.email,
                        otp: otpCode,
                        tenant_id: organization?.id,
                        new_mode: pendingBillingMode,
                      },
                    });
                    if (error || !data?.success) {
                      toast.error(data?.error || "Kode OTP tidak valid atau sudah kedaluwarsa");
                      return;
                    }
                    setShowBillingOtpDialog(false);
                    toast.success(`Mode billing berhasil diubah ke ${pendingBillingMode === "individual" ? "Billing Mandiri" : "Billing Terpusat"}`);
                    // Refresh org data
                    window.location.reload();
                  } catch (err: any) {
                    toast.error("Gagal verifikasi: " + (err.message || "Coba lagi"));
                  } finally {
                    setIsVerifyingBillingOtp(false);
                  }
                }}
                disabled={isVerifyingBillingOtp || !billingOtpValid}
              >
                {isVerifyingBillingOtp ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Memverifikasi...</>
                ) : (
                  "Verifikasi & Ubah"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ForgotPasswordDialog
        open={showForgotPassword}
        onOpenChange={setShowForgotPassword}
        loginType="org"
      />
    </OrganizationLayout>
  );
}