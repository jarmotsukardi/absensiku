import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { PageGlossarySection } from "@/components/admin/common/PageGlossarySection";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";

interface EmployeeProfileRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
}
const ORG_PROFILE_QUERY_TIMEOUT_MS = 12000;
const ORG_PROFILE_QUERY_RETRY_MAX = 2;

export default function OrgProfile() {
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoadError(null);
    setIsRetrying(false);
    setIsLoading(true);
      try {
        const { data: sessionData } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase.auth.getSession(),
              ORG_PROFILE_QUERY_TIMEOUT_MS,
              "org.profile.load.session timeout"
            ),
          {
            maxRetries: ORG_PROFILE_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        const sessionUser = sessionData.session?.user;
        if (!sessionUser) {
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

        const { data: roleRow } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("user_roles")
                .select("tenant_id")
                .eq("user_id", sessionUser.id)
                .eq("role", "admin_instansi")
                .maybeSingle(),
              ORG_PROFILE_QUERY_TIMEOUT_MS,
              "org.profile.load.role timeout"
            ),
          {
            maxRetries: ORG_PROFILE_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        const resolvedTenantId = roleRow?.tenant_id || null;
        setTenantId(resolvedTenantId);

        const { data: byUserRows, error: byUserError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("employees")
                .select("id, name, email, phone, whatsapp, user_id")
                .eq("user_id", sessionUser.id)
                .order("updated_at", { ascending: false })
                .limit(1),
              ORG_PROFILE_QUERY_TIMEOUT_MS,
              "org.profile.load.employee_by_user timeout"
            ),
          {
            maxRetries: ORG_PROFILE_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        if (byUserError) throw byUserError;

        let employee = (byUserRows?.[0] || null) as (EmployeeProfileRow & { user_id?: string | null }) | null;

        if (!employee && resolvedTenantId && sessionUser.email) {
          const { data: byEmailRows, error: byEmailError } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase
                  .from("employees")
                  .select("id, name, email, phone, whatsapp, user_id")
                  .eq("tenant_id", resolvedTenantId)
                  .ilike("email", sessionUser.email)
                  .order("updated_at", { ascending: false })
                  .limit(1),
                ORG_PROFILE_QUERY_TIMEOUT_MS,
                "org.profile.load.employee_by_email timeout"
              ),
            {
              maxRetries: ORG_PROFILE_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            }
          );
          if (byEmailError) throw byEmailError;
          employee = (byEmailRows?.[0] || null) as (EmployeeProfileRow & { user_id?: string | null }) | null;

          // Auto-link akun auth ke baris employee jika sebelumnya belum terhubung.
          if (employee && !employee.user_id) {
            await withExponentialBackoff(
              () =>
                withTimeout(
                  supabase
                    .from("employees")
                    .update({ user_id: sessionUser.id })
                    .eq("id", employee.id),
                  ORG_PROFILE_QUERY_TIMEOUT_MS,
                  "org.profile.link_employee_user timeout"
                ),
              {
                maxRetries: ORG_PROFILE_QUERY_RETRY_MAX,
                shouldRetry: isRetryableError,
                onRetry: () => setIsRetrying(true),
              }
            );
          }
        }

        let tenantPhone: string | null = null;
        if (!employee && resolvedTenantId) {
          const { data: tenantRow } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase
                  .from("tenants")
                  .select("whatsapp, pic_whatsapp")
                  .eq("id", resolvedTenantId)
                  .maybeSingle(),
                ORG_PROFILE_QUERY_TIMEOUT_MS,
                "org.profile.load_tenant_contact timeout"
              ),
            {
              maxRetries: ORG_PROFILE_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            }
          );
          tenantPhone = tenantRow?.whatsapp || tenantRow?.pic_whatsapp || null;
        }

        setEmployeeId(employee?.id || null);
        setDisplayName(employee?.name || metadataName || "Admin Organisasi");
        setPhoneNumber(employee?.phone || employee?.whatsapp || tenantPhone || metadataPhone || "");
      } catch (error: unknown) {
        const errorRef = reportError(error, "org.profile.load");
        const message = appendErrorReference("Gagal memuat profil", errorRef);
        setLoadError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (isLoading) return;
    const section = searchParams.get("section");
    if (!section) return;

    let targetId = "org-profile-detail";
    if (section === "contact") targetId = "org-profile-contact";
    if (section === "security" || section === "password") targetId = "org-profile-security";

    if (section === "password") {
      setShowPasswordForm(true);
    }

    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [isLoading, searchParams]);

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
      setIsRetrying(false);
      const { error } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.updateUser({ password: newPassword }),
            ORG_PROFILE_QUERY_TIMEOUT_MS,
            "org.profile.change_password timeout"
          ),
        {
          maxRetries: ORG_PROFILE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (error) throw error;

      setShowPasswordForm(false);
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password admin organisasi berhasil diubah");
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.profile.change_password");
      toast.error(appendErrorReference("Gagal mengubah password", errorRef));
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
      setIsRetrying(false);
      const { error: authError } = await withExponentialBackoff(
        () =>
          withTimeout(
            supabase.auth.updateUser({
              data: {
                phone: normalizedPhone,
                whatsapp: normalizedPhone,
              },
            }),
            ORG_PROFILE_QUERY_TIMEOUT_MS,
            "org.profile.save_phone.auth timeout"
          ),
        {
          maxRetries: ORG_PROFILE_QUERY_RETRY_MAX,
          shouldRetry: isRetryableError,
          onRetry: () => setIsRetrying(true),
        }
      );
      if (authError) throw authError;

      if (userId) {
        const { data: byUserData, error: employeeUpdateError } = await withExponentialBackoff(
          () =>
            withTimeout(
              supabase
                .from("employees")
                .update({ phone: normalizedPhone, whatsapp: normalizedPhone })
                .eq("user_id", userId)
                .select("id"),
              ORG_PROFILE_QUERY_TIMEOUT_MS,
              "org.profile.save_phone.employee_by_user timeout"
            ),
          {
            maxRetries: ORG_PROFILE_QUERY_RETRY_MAX,
            shouldRetry: isRetryableError,
            onRetry: () => setIsRetrying(true),
          }
        );
        if (employeeUpdateError) throw employeeUpdateError;

        // Fallback relasi jika belum ada baris employees yang ter-link user_id.
        if ((!byUserData || byUserData.length === 0) && tenantId && email) {
          const { data: byEmailData, error: byEmailUpdateError } = await withExponentialBackoff(
            () =>
              withTimeout(
                supabase
                  .from("employees")
                  .update({
                    phone: normalizedPhone,
                    whatsapp: normalizedPhone,
                    user_id: userId,
                  })
                  .eq("tenant_id", tenantId)
                  .ilike("email", email)
                  .select("id")
                  .limit(1),
                ORG_PROFILE_QUERY_TIMEOUT_MS,
                "org.profile.save_phone.employee_by_email timeout"
              ),
            {
              maxRetries: ORG_PROFILE_QUERY_RETRY_MAX,
              shouldRetry: isRetryableError,
              onRetry: () => setIsRetrying(true),
            }
          );
          if (byEmailUpdateError) throw byEmailUpdateError;
          if (byEmailData && byEmailData.length > 0) {
            setEmployeeId(byEmailData[0].id);
          }
        }
      }

      toast.success("No HP berhasil disimpan");
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.profile.save_phone");
      toast.error(appendErrorReference("Gagal menyimpan No HP", errorRef));
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
        {isRetrying && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sedang mencoba ulang memuat data profil...
          </div>
        )}
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <span>{loadError}</span>
            <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => void loadProfile()}>
              Coba Lagi
            </Button>
          </div>
        )}
        <Card id="org-profile-detail">
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

        <Card id="org-profile-security">
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

        <Card id="org-profile-contact">
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

        <PageGlossarySection preset="org_profile" />
      </div>
    </OrganizationLayout>
  );
}
