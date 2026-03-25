import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Mail, Lock, Loader2, Eye, EyeOff, Building2, User, Phone, AlertTriangle, ArrowLeft, Key } from "lucide-react";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { SimpleCaptcha } from "@/components/common/SimpleCaptcha";
import { SmartAppBanner } from "@/components/common/SmartAppBanner";
import { useLoginRateLimit } from "@/hooks/useLoginRateLimit";
import { OrgRegistrationForm } from "@/components/org/OrgRegistrationForm";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { isRetryableError, withExponentialBackoff, withTimeout } from "@/lib/attendanceResilience";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

const registerSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter").max(100, "Nama maksimal 100 karakter"),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
  organizationName: z.string().min(3, "Nama organisasi minimal 3 karakter").max(100, "Nama maksimal 100 karakter"),
  organizationType: z.enum(["pemerintah_daerah", "instansi_pemerintah", "perusahaan", "sekolah"]),
  whatsapp: z.string().min(10, "No WhatsApp minimal 10 digit"),
});

const ORG_LOGIN_RETRY_MAX = 1;
const ORG_LOGIN_TIMEOUT_MS = 12000;
const ORG_ROLE_CHECK_TIMEOUT_MS = 6000;
const ORG_ROLE_CHECK_RETRY_MAX = 0;

export default function OrgLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("mode") === "register" ? "register" : "login";

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginCaptchaValid, setLoginCaptchaValid] = useState(false);

  // Register form state moved to OrgRegistrationForm component

  const [errors, setErrors] = useState<Record<string, string>>();

  // Rate limiting
  const rateLimit = useLoginRateLimit("org_login_rate_limit");
  const isCaptchaBypassEnabled =
    import.meta.env.DEV && import.meta.env.VITE_E2E_BYPASS_CAPTCHA === "true";

  // Check auth state - hanya cek session awal, tidak react ke setiap auth change
  // Redirect /org berlaku untuk admin_instansi dan atasan (operator).
  // Super admin tetap di halaman login /org/login karena mereka bisa memilih masuk sebagai org admin.
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const fetchUserRoles = useCallback(async (userId: string): Promise<string[]> => {
    const { data: roleRows, error: roleError } = await withExponentialBackoff(
      () =>
        withTimeout(
          () => supabase.from("user_roles").select("role").eq("user_id", userId),
          ORG_ROLE_CHECK_TIMEOUT_MS,
        ),
      {
        maxRetries: ORG_ROLE_CHECK_RETRY_MAX,
        shouldRetry: isRetryableError,
      },
    );

    if (roleError) throw roleError;
    return (roleRows || []).map((row) => row.role);
  }, []);
  
  useEffect(() => {
    let isMounted = true;
    
    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await withExponentialBackoff(
          () => withTimeout(() => supabase.auth.getSession(), ORG_LOGIN_TIMEOUT_MS),
          {
            maxRetries: ORG_LOGIN_RETRY_MAX,
            shouldRetry: isRetryableError,
          },
        );
        
        if (!isMounted) return;
        
        if (session?.user) {
          const roles = await fetchUserRoles(session.user.id);
          const hasOrgAccessRole = roles.includes("admin_instansi") || roles.includes("atasan");

          if (hasOrgAccessRole && isMounted) {
            const hasOperatorRole = roles.includes("atasan");
            navigate(hasOperatorRole ? "/org/leave/requests" : "/org", { replace: true });
            return;
          }
        }
      } catch (error) {
        reportError(error, "org.login.check_session");
      } finally {
        if (isMounted) {
          setIsCheckingAuth(false);
        }
      }
    };
    
    checkSession();
    
    return () => {
      isMounted = false;
    };
  }, [fetchUserRoles, navigate]);

  useEffect(() => {
    let isMounted = true;

    const fetchApkUrl = async () => {
      try {
        const [apkSettingsRes, globalApkRes, appDownloadRes] = await Promise.all([
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "apk_settings")
            .maybeSingle(),
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "global_apk")
            .maybeSingle(),
          supabase
            .from("system_settings")
            .select("value")
            .eq("key", "app_download_settings")
            .maybeSingle(),
        ]);

        let resolvedUrl: string | null = null;

        if (apkSettingsRes.data?.value && typeof apkSettingsRes.data.value === "object" && !Array.isArray(apkSettingsRes.data.value)) {
          const apkSettings = apkSettingsRes.data.value as Record<string, unknown>;
          if (typeof apkSettings.url === "string" && apkSettings.url.trim().length > 0) {
            resolvedUrl = apkSettings.url.trim();
          }
        }

        if (!resolvedUrl && globalApkRes.data?.value && typeof globalApkRes.data.value === "object" && !Array.isArray(globalApkRes.data.value)) {
          const globalApk = globalApkRes.data.value as Record<string, unknown>;
          if (typeof globalApk.url === "string" && globalApk.url.trim().length > 0) {
            resolvedUrl = globalApk.url.trim();
          }
        }

        if (!resolvedUrl && appDownloadRes.data?.value && typeof appDownloadRes.data.value === "object" && !Array.isArray(appDownloadRes.data.value)) {
          const appDownload = appDownloadRes.data.value as Record<string, unknown>;
          if (typeof appDownload.apk_url === "string" && appDownload.apk_url.trim().length > 0) {
            resolvedUrl = appDownload.apk_url.trim();
          }
        }

        if (isMounted) {
          setApkUrl(resolvedUrl);
        }
      } catch {
        if (isMounted) {
          setApkUrl(null);
        }
      }
    };

    void fetchApkUrl();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Check lockout
    if (!isCaptchaBypassEnabled && rateLimit.isEnabled && rateLimit.isLocked) {
      toast({
        variant: "destructive",
        title: "Akses Diblokir",
        description: `Terlalu banyak percobaan gagal. Coba lagi dalam ${rateLimit.formatRemainingTime()}`,
      });
      return;
    }

    // Validate captcha
    if (!isCaptchaBypassEnabled && !loginCaptchaValid) {
      if (rateLimit.isEnabled) {
        const wasLocked = rateLimit.recordFailedAttempt();
        toast({
          variant: "destructive",
          title: "Captcha Diperlukan",
          description: wasLocked
            ? `Akses diblokir selama ${rateLimit.lockoutDurationMinutes} menit karena terlalu banyak percobaan gagal`
            : `Silakan masukkan kode captcha dengan benar. Sisa percobaan: ${rateLimit.remainingAttempts - 1}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Captcha Diperlukan",
          description: "Silakan masukkan kode captcha dengan benar.",
        });
      }
      return;
    }

    try {
      loginSchema.parse({ email, password });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
        return;
      }
    }

    setIsLoading(true);

    try {
      const { data: authData, error } = await withExponentialBackoff(
        () =>
          withTimeout(
            () =>
              supabase.auth.signInWithPassword({
                email,
                password,
              }),
            ORG_LOGIN_TIMEOUT_MS,
          ),
        {
          maxRetries: ORG_LOGIN_RETRY_MAX,
          shouldRetry: isRetryableError,
        },
      );

      if (error) {
        const wasLocked = rateLimit.isEnabled ? rateLimit.recordFailedAttempt() : false;
        toast({
          variant: "destructive",
          title: "Login Gagal",
          description: !rateLimit.isEnabled
            ? (error.message.includes("Invalid login credentials")
              ? "Email atau password salah."
              : error.message)
            : wasLocked
              ? `Akses diblokir selama ${rateLimit.lockoutDurationMinutes} menit karena terlalu banyak percobaan gagal`
              : error.message.includes("Invalid login credentials")
                ? `Email atau password salah. Sisa percobaan: ${rateLimit.remainingAttempts - 1}`
                : error.message,
        });
        return;
      }

      // Verify if user is admin
      if (authData.user) {
        const roles = await fetchUserRoles(authData.user.id);
        const isSuperAdmin = roles.includes("super_admin");
        const isAdminInstansi = roles.includes("admin_instansi");
        const isOperator = roles.includes("atasan");
        const isPegawai = roles.includes("pegawai");

        if (isSuperAdmin) {
          // Super admin bisa akses org juga, tapi redirect ke admin panel
          rateLimit.resetAttempts();
          toast({
            title: "Login Berhasil",
            description: "Anda dialihkan ke panel Super Admin.",
          });
          navigate("/admin", { replace: true });
          return;
        } else if (isAdminInstansi) {
          rateLimit.resetAttempts();
          toast({
            title: "Login Berhasil",
            description: "Selamat datang, Admin!",
          });
          navigate("/org", { replace: true });
          return;
        } else if (isOperator) {
          rateLimit.resetAttempts();
          toast({
            title: "Login Berhasil",
            description: "Selamat datang, Operator!",
          });
          navigate("/org/leave/requests", { replace: true });
          return;
        } else if (isPegawai) {
          // Pegawai - redirect ke dashboard pegawai tanpa logout
          toast({
            title: "Dialihkan",
            description: "Anda dialihkan ke dashboard pegawai.",
          });
          navigate("/employee/dashboard", { replace: true });
          return;
        } else {
          // User tanpa role - mungkin baru daftar, redirect ke dashboard
          toast({
            title: "Dialihkan",
            description: "Akun belum memiliki role, silakan hubungi admin.",
          });
          navigate("/employee/dashboard", { replace: true });
          return;
        }
      }
    } catch (error) {
      const errorRef = reportError(error, "org.login.handle_login", { email });
      toast({
        variant: "destructive",
        title: "Terjadi Kesalahan",
        description: appendErrorReference("Tidak dapat menghubungi server.", errorRef),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Registration logic moved to OrgRegistrationForm component

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <SmartAppBanner
        apkUrl={apkUrl}
        appName="AbsensiKu Admin"
        dismissKey="smart_app_banner_org_login_dismissed"
      />
      <div className="w-full max-w-md">
        {/* Back to Home */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </Link>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Admin Organisasi</h1>
          <p className="text-muted-foreground mt-1">Kelola organisasi dan pegawai Anda</p>
        </div>

        {/* Lockout Warning */}
        {rateLimit.isEnabled && rateLimit.isLocked && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Akses Diblokir</p>
                <p className="text-sm text-muted-foreground">
                  Terlalu banyak percobaan gagal. Coba lagi dalam{" "}
                  <span className="font-mono font-bold">{rateLimit.formatRemainingTime()}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        <Card className="border-border/50 shadow-xl">
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-6 h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70">
                <TabsTrigger value="login" className="flex items-center justify-center gap-2 whitespace-nowrap text-sm py-2.5">
                  <User className="w-4 h-4 flex-shrink-0" />
                  <span>Masuk</span>
                </TabsTrigger>
                <TabsTrigger value="register" className="flex items-center justify-center gap-2 whitespace-nowrap text-sm py-2.5">
                  <Building2 className="w-4 h-4 flex-shrink-0" />
                  <span>Daftar Organisasi</span>
                </TabsTrigger>
              </TabsList>

              {/* Login Tab */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="admin@organisasi.go.id"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        autoComplete="email"
                        disabled={rateLimit.isEnabled && rateLimit.isLocked}
                      />
                    </div>
                    {errors?.email && <p className="text-sm text-destructive">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        autoComplete="current-password"
                        disabled={rateLimit.isEnabled && rateLimit.isLocked}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors?.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>Verifikasi Captcha</Label>
                    <SimpleCaptcha onVerify={setLoginCaptchaValid} />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={
                      isLoading ||
                      (!isCaptchaBypassEnabled && !loginCaptchaValid) ||
                      (!isCaptchaBypassEnabled && rateLimit.isEnabled && rateLimit.isLocked)
                    }
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Memproses...
                      </>
                    ) : (
                      "Masuk"
                    )}
                  </Button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Key className="w-3 h-3" />
                    Lupa / Ganti Password?
                  </button>
                </div>

                <div className="mt-4 text-center text-sm text-muted-foreground">
                  <p>
                    Bukan admin?{" "}
                    <Link to="/auth" className="text-primary hover:underline">
                      Login sebagai Pegawai
                    </Link>
                  </p>
                </div>

                {/* Forgot Password Dialog */}
                <ForgotPasswordDialog
                  open={showForgotPassword}
                  onOpenChange={setShowForgotPassword}
                  loginType="org"
                />
              </TabsContent>

              {/* Register Tab */}
              <TabsContent value="register">
                <OrgRegistrationForm rateLimit={{
                  ...rateLimit,
                  isLocked: false,
                  recordFailedAttempt: () => false,
                  remainingAttempts: 999,
                }} />

                <div className="mt-6 text-center text-sm text-muted-foreground">
                  <p>
                    Sudah punya akun?{" "}
                    <button 
                      onClick={() => setActiveTab("login")} 
                      className="text-primary hover:underline"
                    >
                      Login di sini
                    </button>
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-muted-foreground">
          <p>© 2026 AbsensiKu. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
