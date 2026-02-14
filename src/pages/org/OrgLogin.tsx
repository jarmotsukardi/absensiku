import { useState, useEffect } from "react";
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
import { useLoginRateLimit } from "@/hooks/useLoginRateLimit";
import { OrgRegistrationForm } from "@/components/org/OrgRegistrationForm";
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

export default function OrgLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("mode") === "register" ? "register" : "login";

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginCaptchaValid, setLoginCaptchaValid] = useState(false);

  // Register form state moved to OrgRegistrationForm component

  const [errors, setErrors] = useState<Record<string, string>>();

  // Rate limiting
  const rateLimit = useLoginRateLimit("org_login_rate_limit");

  // Check auth state - hanya cek session awal, tidak react ke setiap auth change
  // PENTING: Hanya redirect ke /org jika user adalah admin_instansi
  // Super admin tetap di halaman login /org/login karena mereka bisa memilih masuk sebagai org admin
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  useEffect(() => {
    let isMounted = true;
    
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        if (session?.user) {
          // Hanya cek role admin_instansi saja, TIDAK termasuk super_admin
          // Ini mencegah redirect otomatis ke /admin saat super_admin mengakses /org/login
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("role", "admin_instansi")
            .maybeSingle();

          if (roleData && isMounted) {
            navigate("/org", { replace: true });
            return;
          }
        }
      } catch (error) {
        console.error("Session check error:", error);
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
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Check lockout
    if (rateLimit.isLocked) {
      toast({
        variant: "destructive",
        title: "Akses Diblokir",
        description: `Terlalu banyak percobaan gagal. Coba lagi dalam ${rateLimit.formatRemainingTime()}`,
      });
      return;
    }

    // Validate captcha
    if (!loginCaptchaValid) {
      const wasLocked = rateLimit.recordFailedAttempt();
      toast({
        variant: "destructive",
        title: "Captcha Diperlukan",
        description: wasLocked
          ? "Akses diblokir selama 15 menit karena terlalu banyak percobaan gagal"
          : `Silakan masukkan kode captcha dengan benar. Sisa percobaan: ${rateLimit.remainingAttempts - 1}`,
      });
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
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const wasLocked = rateLimit.recordFailedAttempt();
        toast({
          variant: "destructive",
          title: "Login Gagal",
          description: wasLocked
            ? "Akses diblokir selama 15 menit karena terlalu banyak percobaan gagal"
            : error.message.includes("Invalid login credentials")
              ? `Email atau password salah. Sisa percobaan: ${rateLimit.remainingAttempts - 1}`
              : error.message,
        });
        return;
      }

      // Verify if user is admin
      if (authData.user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", authData.user.id);

        const isSuperAdmin = roles?.some((r) => r.role === "super_admin");
        const isAdminInstansi = roles?.some((r) => r.role === "admin_instansi");
        const isPegawai = roles?.some((r) => r.role === "pegawai");

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
        } else if (isPegawai) {
          // Pegawai - redirect ke dashboard pegawai tanpa logout
          toast({
            title: "Dialihkan",
            description: "Anda dialihkan ke dashboard pegawai.",
          });
          navigate("/dashboard", { replace: true });
          return;
        } else {
          // User tanpa role - mungkin baru daftar, redirect ke dashboard
          toast({
            title: "Dialihkan",
            description: "Akun belum memiliki role, silakan hubungi admin.",
          });
          navigate("/dashboard", { replace: true });
          return;
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Terjadi Kesalahan",
        description: "Tidak dapat menghubungi server.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Registration logic moved to OrgRegistrationForm component

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
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
        {rateLimit.isLocked && (
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
              <TabsList className="flex flex-col sm:flex-row h-auto gap-1 w-full mb-6 p-1">
                <TabsTrigger value="login" className="flex items-center justify-center gap-2 w-full sm:flex-1 text-sm py-2.5">
                  <User className="w-4 h-4 flex-shrink-0" />
                  <span>Masuk</span>
                </TabsTrigger>
                <TabsTrigger value="register" className="flex items-center justify-center gap-2 w-full sm:flex-1 text-sm py-2.5">
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
                        disabled={rateLimit.isLocked}
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
                        disabled={rateLimit.isLocked}
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
                    disabled={isLoading || !loginCaptchaValid || rateLimit.isLocked}
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
