import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  User as UserIcon,
  Mail,
  Phone,
  MapPin,
  Building2,
  Briefcase,
  Lock,
  Eye,
  EyeOff,
  Save,
  Loader2,
} from "lucide-react";
import {
  DEFAULT_ORG_MASTER_DATA_MODULES,
  fetchTenantOrgMasterDataModules,
} from "@/lib/orgMasterDataModules";

interface EmployeeData {
  id: string;
  tenant_id?: string;
  name: string;
  email: string;
  nik: string;
  nip?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  position?: string;
  gender?: string;
  golongan?: string;
  employee_category?: string;
  opd?: { name: string };
  work_unit?: { name: string };
  offices?: { name: string; address?: string };
}

export default function EmployeeProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [masterDataModules, setMasterDataModules] = useState(DEFAULT_ORG_MASTER_DATA_MODULES);
  
  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/employee/login");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/employee/login");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchEmployeeData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*, opd(*), work_unit:work_unit_id(*), offices:office_id(*)")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error) throw error;
      const employeeData = (data as EmployeeData | null) ?? null;
      setEmployee(employeeData);

      if (!employeeData?.tenant_id) {
        setMasterDataModules(DEFAULT_ORG_MASTER_DATA_MODULES);
        return;
      }

      try {
        const moduleSetting = await fetchTenantOrgMasterDataModules(employeeData.tenant_id);
        setMasterDataModules(moduleSetting.modules);
      } catch (moduleError) {
        console.error("Error fetching employee module settings:", moduleError);
        setMasterDataModules(DEFAULT_ORG_MASTER_DATA_MODULES);
      }
    } catch (error) {
      console.error("Error fetching employee:", error);
      setMasterDataModules(DEFAULT_ORG_MASTER_DATA_MODULES);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      void fetchEmployeeData();
    }
  }, [fetchEmployeeData, user]);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Password baru tidak cocok");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }

    setIsChangingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success("Password berhasil diubah");
      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      toast.error("Gagal mengubah password", {
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const showPositionField = masterDataModules.positions;
  const showGolonganField = masterDataModules.employee_golongan;
  const showCategoryField = masterDataModules.employee_categories;

  const primaryIdentity = employee?.nip
    ? { label: "NIP", value: employee.nip }
    : { label: "NIK", value: employee?.nik };

  const InfoRow = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: string | null }) => (
    <div className="flex items-start gap-3 py-3">
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium truncate">{value || "-"}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center gap-4 px-4 h-16">
          <Button variant="ghost" size="icon" onClick={() => navigate("/employee/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-semibold">Profil Saya</h1>
            <p className="text-xs text-muted-foreground">Informasi akun</p>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto p-4 space-y-6">
        {/* Profile Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-3xl font-bold text-primary">
                  {employee?.name?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{employee?.name || "Pengguna"}</h2>
                <p className="text-muted-foreground">
                  {showPositionField ? (employee?.position || employee?.opd?.name || "Pegawai") : (employee?.opd?.name || "Pegawai")}
                </p>
                {showCategoryField && employee?.employee_category && (
                  <Badge variant="secondary" className="mt-2">
                    {employee.employee_category === "pns" ? "PNS" : 
                     employee.employee_category === "pppk" ? "PPPK" : 
                     employee.employee_category === "honorer" ? "Honorer" : 
                     employee.employee_category}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informasi Pribadi</CardTitle>
            <CardDescription>Data diri yang terdaftar di sistem</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow icon={UserIcon} label={primaryIdentity.label} value={primaryIdentity.value} />
            <Separator />
            <InfoRow icon={Mail} label="Email" value={employee?.email} />
            <Separator />
            <InfoRow icon={Phone} label="No. Telepon" value={employee?.phone} />
            <Separator />
            <InfoRow icon={Phone} label="WhatsApp" value={employee?.whatsapp} />
            <Separator />
            <InfoRow icon={MapPin} label="Alamat" value={employee?.address} />
          </CardContent>
        </Card>

        {/* Work Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informasi Kepegawaian</CardTitle>
            <CardDescription>Data pekerjaan dan penempatan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { icon: Building2, label: "OPD / Instansi", value: employee?.opd?.name },
              { icon: Building2, label: "Unit Kerja", value: employee?.work_unit?.name },
              ...(showPositionField ? [{ icon: Briefcase, label: "Jabatan", value: employee?.position }] : []),
              ...(showGolonganField ? [{ icon: Briefcase, label: "Golongan", value: employee?.golongan }] : []),
              ...(showCategoryField
                ? [{ icon: Briefcase, label: "Kategori Pegawai", value: employee?.employee_category }]
                : []),
              { icon: MapPin, label: "Lokasi Kerja", value: employee?.offices?.name },
            ].map((row, index, rows) => (
              <div key={row.label}>
                <InfoRow icon={row.icon} label={row.label} value={row.value} />
                {index < rows.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Keamanan</CardTitle>
            <CardDescription>Pengaturan keamanan akun</CardDescription>
          </CardHeader>
          <CardContent>
            {!showPasswordForm ? (
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => setShowPasswordForm(true)}
              >
                <Lock className="w-4 h-4 mr-2" />
                Ubah Password
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Password Baru</Label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Masukkan password baru"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Konfirmasi Password Baru</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi password baru"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    disabled={isChangingPassword}
                  >
                    Batal
                  </Button>
                  <Button
                    onClick={handleChangePassword}
                    disabled={isChangingPassword || !newPassword || !confirmPassword}
                  >
                    {isChangingPassword ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Simpan
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              Untuk mengubah data pribadi atau kepegawaian, silakan hubungi admin organisasi Anda.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
