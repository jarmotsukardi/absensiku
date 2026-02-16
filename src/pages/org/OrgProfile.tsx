import { useEffect, useState } from "react";
import { OrganizationLayout } from "@/components/admin/organization/OrganizationLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, User as UserIcon, Lock, Eye, EyeOff, Save, ShieldCheck, Phone } from "lucide-react";
import { toast } from "sonner";

interface EmployeeProfileRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
}

export default function OrgProfile() {
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData.session?.user;
        if (!sessionUser) {
          setIsLoading(false);
          return;
        }

        setUserId(sessionUser.id);
        setEmail(sessionUser.email || "");

        const metadataName =
          typeof sessionUser.user_metadata?.name === "string" ? sessionUser.user_metadata.name : "";
        const metadataPhone =
          typeof sessionUser.user_metadata?.phone === "string"
            ? sessionUser.user_metadata.phone
            : typeof sessionUser.user_metadata?.whatsapp === "string"
              ? sessionUser.user_metadata.whatsapp
              : "";

        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("tenant_id")
          .eq("user_id", sessionUser.id)
          .eq("role", "admin_instansi")
          .maybeSingle();
        const resolvedTenantId = roleRow?.tenant_id || null;
        setTenantId(resolvedTenantId);

        const { data: byUserRows, error: byUserError } = await supabase
          .from("employees")
          .select("id, name, email, phone, whatsapp, user_id")
          .eq("user_id", sessionUser.id)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (byUserError) throw byUserError;

        let employee = (byUserRows?.[0] || null) as (EmployeeProfileRow & { user_id?: string | null }) | null;

        if (!employee && resolvedTenantId && sessionUser.email) {
          const { data: byEmailRows, error: byEmailError } = await supabase
            .from("employees")
            .select("id, name, email, phone, whatsapp, user_id")
            .eq("tenant_id", resolvedTenantId)
            .ilike("email", sessionUser.email)
            .order("updated_at", { ascending: false })
            .limit(1);
          if (byEmailError) throw byEmailError;
          employee = (byEmailRows?.[0] || null) as (EmployeeProfileRow & { user_id?: string | null }) | null;

          // Auto-link akun auth ke baris employee jika sebelumnya belum terhubung.
          if (employee && !employee.user_id) {
            await supabase
              .from("employees")
              .update({ user_id: sessionUser.id })
              .eq("id", employee.id);
          }
        }

        let tenantPhone: string | null = null;
        if (!employee && resolvedTenantId) {
          const { data: tenantRow } = await supabase
            .from("tenants")
            .select("whatsapp, pic_whatsapp")
            .eq("id", resolvedTenantId)
            .maybeSingle();
          tenantPhone = tenantRow?.whatsapp || tenantRow?.pic_whatsapp || null;
        }

        setEmployeeId(employee?.id || null);
        setDisplayName(employee?.name || metadataName || "Admin Organisasi");
        setPhoneNumber(employee?.phone || employee?.whatsapp || tenantPhone || metadataPhone || "");
      } catch (error: unknown) {
        toast.error("Gagal memuat profil", {
          description: error instanceof Error ? error.message : "Terjadi kesalahan",
        });
      } finally {
        setIsLoading(false);
      }
    };

    void loadProfile();
  }, []);

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
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setShowPasswordForm(false);
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password admin organisasi berhasil diubah");
    } catch (error: unknown) {
      toast.error("Gagal mengubah password", {
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSavePhoneNumber = async () => {
    const normalizedPhone = phoneNumber.trim().replace(/[\s-]/g, "");
    const phoneRegex = /^(\+?62|0)[0-9]{8,13}$/;

    if (!normalizedPhone) {
      toast.error("No HP wajib diisi");
      return;
    }
    if (!phoneRegex.test(normalizedPhone)) {
      toast.error("Format No HP tidak valid", {
        description: "Contoh: 081234567890 atau 6281234567890",
      });
      return;
    }

    setIsSavingPhone(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          phone: normalizedPhone,
          whatsapp: normalizedPhone,
        },
      });
      if (authError) throw authError;

      if (userId) {
        const { data: byUserData, error: employeeUpdateError } = await supabase
          .from("employees")
          .update({ phone: normalizedPhone, whatsapp: normalizedPhone })
          .eq("user_id", userId)
          .select("id");
        if (employeeUpdateError) throw employeeUpdateError;

        // Fallback relasi jika belum ada baris employees yang ter-link user_id.
        if ((!byUserData || byUserData.length === 0) && tenantId && email) {
          const { data: byEmailData, error: byEmailUpdateError } = await supabase
            .from("employees")
            .update({
              phone: normalizedPhone,
              whatsapp: normalizedPhone,
              user_id: userId,
            })
            .eq("tenant_id", tenantId)
            .ilike("email", email)
            .select("id")
            .limit(1);
          if (byEmailUpdateError) throw byEmailUpdateError;
          if (byEmailData && byEmailData.length > 0) {
            setEmployeeId(byEmailData[0].id);
          }
        }
      }

      toast.success("No HP berhasil disimpan");
    } catch (error: unknown) {
      toast.error("Gagal menyimpan No HP", {
        description: error instanceof Error ? error.message : "Terjadi kesalahan",
      });
    } finally {
      setIsSavingPhone(false);
    }
  };

  if (isLoading) {
    return (
      <OrganizationLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </OrganizationLayout>
    );
  }

  return (
    <OrganizationLayout>
      <div className="max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">{displayName || "Admin Organisasi"}</CardTitle>
                <CardDescription className="text-xs">Profil akun admin organisasi</CardDescription>
                <Badge className="mt-1">Admin Organisasi</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Separator />
            <div className="space-y-3 pt-1">
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs font-medium">Alamat Email</p>
                  <p className="text-xs text-muted-foreground">{email || "-"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <UserIcon className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs font-medium">ID Pegawai</p>
                  <p className="text-xs text-muted-foreground font-mono">{employeeId || "-"}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Keamanan</CardTitle>
            <CardDescription className="text-xs">Perbarui password akun admin organisasi</CardDescription>
          </CardHeader>
          <CardContent>
            {!showPasswordForm ? (
              <Button variant="outline" onClick={() => setShowPasswordForm(true)}>
                <Lock className="w-4 h-4 mr-2" />
                Ubah Password
              </Button>
            ) : (
              <div className="space-y-3 max-w-sm">
                <div className="space-y-2">
                  <Label>Password Baru</Label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Minimal 6 karakter"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowNewPassword((value) => !value)}
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
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Ulangi password baru"
                  />
                </div>

                <div className="flex gap-2 pt-2">
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
                    Simpan Password
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kontak Pemulihan</CardTitle>
            <CardDescription className="text-xs">
              Nomor ini dipakai untuk validasi lupa password admin organisasi
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-w-sm">
            <div className="space-y-2">
              <Label htmlFor="org-admin-phone">No HP / WhatsApp</Label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="org-admin-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="Masukkan no HP aktif (contoh: 08xxxxxxxxxx)"
                  className="pl-9"
                />
              </div>
            </div>
            <Button onClick={handleSavePhoneNumber} disabled={isSavingPhone || !phoneNumber.trim()}>
              {isSavingPhone ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Simpan No HP
            </Button>
          </CardContent>
        </Card>
      </div>
    </OrganizationLayout>
  );
}
