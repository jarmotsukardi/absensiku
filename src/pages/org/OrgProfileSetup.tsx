import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, User, Phone, MapPin, FileText, Upload, Loader2, CheckCircle2 } from "lucide-react";
import { LogoUploader } from "@/components/common/LogoUploader";
import { autoSeedOrganizationData } from "@/hooks/useAutoSeedOrganization";
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";

export default function OrgProfileSetup() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    pic_name: "",
    pic_whatsapp: "",
    logo_url: "",
    address: "",
    npwp: "",
  });

  const checkAndLoadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/org/login");
        return;
      }

      // Get user's tenant
      const { data: employee } = await supabase
        .from("employees")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();

      if (!employee?.tenant_id) {
        toast.error("Organisasi tidak ditemukan");
        navigate("/org/login");
        return;
      }

      setTenantId(employee.tenant_id);

      // Load existing tenant data
      const { data: tenant } = await supabase
        .from("tenants")
        .select("pic_name, pic_whatsapp, logo_url, address, npwp")
        .eq("id", employee.tenant_id)
        .single();

      if (tenant) {
        // Check if profile is already complete
        if (tenant.pic_name && tenant.pic_whatsapp && tenant.address) {
          navigate("/org");
          return;
        }

        setFormData({
          pic_name: tenant.pic_name || "",
          pic_whatsapp: tenant.pic_whatsapp || "",
          logo_url: tenant.logo_url || "",
          address: tenant.address || "",
          npwp: tenant.npwp || "",
        });
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void checkAndLoadProfile();
  }, [checkAndLoadProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.pic_name || !formData.pic_whatsapp || !formData.address) {
      toast.error("Nama Penanggung Jawab, WhatsApp, dan Alamat wajib diisi");
      return;
    }

    if (!tenantId) {
      toast.error("Organisasi tidak ditemukan");
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          pic_name: formData.pic_name,
          pic_whatsapp: formData.pic_whatsapp,
          logo_url: formData.logo_url || null,
          address: formData.address,
          npwp: formData.npwp || null,
        })
        .eq("id", tenantId);

      if (error) throw error;

      // Auto-seed sample data (OPD, Satuan Kerja, Lokasi Kerja)
      await autoSeedOrganizationData(tenantId, formData.pic_name);

      toast.success("Profil organisasi berhasil disimpan!");
      navigate("/org/onboarding");
    } catch (error: unknown) {
      console.error("Error saving profile:", error);
      const errorMessage = error instanceof Error ? error.message : "Gagal menyimpan profil";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoChange = (url: string) => {
    setFormData({ ...formData, logo_url: url });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-large">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Lengkapi Profil Organisasi</CardTitle>
          <CardDescription>
            Mohon lengkapi informasi berikut untuk melanjutkan ke dashboard
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Logo Organisasi
              </Label>
              <LogoUploader
                currentLogoUrl={formData.logo_url}
                tenantId={tenantId || "temp"}
                onUploadComplete={handleLogoChange}
                bucket="organization-logos"
              />
            </div>

            {/* Nama Penanggung Jawab */}
            <div className="space-y-2">
              <Label htmlFor="pic_name" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Nama Penanggung Jawab <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pic_name"
                value={formData.pic_name}
                onChange={(e) => setFormData({ ...formData, pic_name: e.target.value })}
                placeholder="Nama lengkap penanggung jawab organisasi"
                required
              />
            </div>

            {/* WhatsApp */}
            <div className="space-y-2">
              <Label htmlFor="pic_whatsapp" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                No. WhatsApp Penanggung Jawab <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pic_whatsapp"
                value={formData.pic_whatsapp}
                onChange={(e) => setFormData({ ...formData, pic_whatsapp: e.target.value })}
                placeholder="08xxxxxxxxxx"
                required
              />
            </div>

            {/* Alamat */}
            <div className="space-y-2">
              <Label htmlFor="address" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Alamat Organisasi <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Alamat lengkap organisasi"
                rows={3}
                required
              />
            </div>

            {/* NPWP */}
            <div className="space-y-2">
              <Label htmlFor="npwp" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Nomor NPWP
              </Label>
              <Input
                id="npwp"
                value={formData.npwp}
                onChange={(e) => setFormData({ ...formData, npwp: e.target.value })}
                placeholder="00.000.000.0-000.000"
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Simpan & Lanjutkan
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="w-full max-w-2xl mt-4">
        <PageGlossarySection preset="org_profile_setup" />
      </div>
    </div>
  );
}
