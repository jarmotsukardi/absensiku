import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Mail, Lock, ArrowLeft, Loader2, Info, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { SimpleCaptcha } from "@/components/common/SimpleCaptcha";
import { useLoginRateLimit } from "@/hooks/useLoginRateLimit";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";

const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Rate limiting
  const rateLimit = useLoginRateLimit("auth_rate_limit");

  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginCaptchaValid, setLoginCaptchaValid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setTimeout(() => {
          checkUserRoleAndRedirect(session.user.id);
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        checkUserRoleAndRedirect(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkUserRoleAndRedirect = async (userId: string) => {
    try {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);

      if (roles && roles.length > 0) {
        const isSuperAdmin = roles.some((r) => r.role === "super_admin");
        const isAdminInstansi = roles.some((r) => r.role === "admin_instansi");

        // Superadmin - redirect ke halaman admin tanpa logout
        // Session tetap valid, hanya redirect ke interface yang benar
        if (isSuperAdmin) {
          toast({
            title: "Dialihkan",
            description: "Anda dialihkan ke panel Super Admin",
          });
          navigate("/admin", { replace: true });
          return;
        } else if (isAdminInstansi) {
          // Admin organisasi - redirect ke halaman org tanpa logout
          toast({
            title: "Dialihkan", 
            description: "Anda dialihkan ke panel Admin Organisasi",
          });
          navigate("/org", { replace: true });
          return;
        } else {
          // Pegawai - redirect ke dashboard
          navigate("/employee/dashboard", { replace: true });
        }
      } else {
        // User tanpa role khusus - kemungkinan pegawai biasa
        navigate("/employee/dashboard", { replace: true });
      }
    } catch (error) {
      navigate("/employee/dashboard", { replace: true });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Check lockout
    if (rateLimit.isEnabled && rateLimit.isLocked) {
      toast({
        variant: "destructive",
        title: "Akses Diblokir",
        description: `Terlalu banyak percobaan gagal. Coba lagi dalam ${rateLimit.formatRemainingTime()}`,
      });
      return;
    }

    // Validate captcha
    if (!loginCaptchaValid) {
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
      loginSchema.parse({ email: loginEmail, password: loginPassword });
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
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        const wasLocked = rateLimit.isEnabled ? rateLimit.recordFailedAttempt() : false;
        if (error.message.includes("Invalid login credentials")) {
          toast({
            variant: "destructive",
            title: "Login Gagal",
            description: !rateLimit.isEnabled
              ? "Email atau password salah."
              : wasLocked
                ? `Akses diblokir selama ${rateLimit.lockoutDurationMinutes} menit karena terlalu banyak percobaan gagal`
                : `Email atau password salah. Sisa percobaan: ${rateLimit.remainingAttempts - 1}`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Login Gagal",
            description: error.message,
          });
        }
      } else {
        // Success - reset rate limit
        rateLimit.resetAttempts();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Terjadi Kesalahan",
        description: "Tidak dapat menghubungi server. Silakan coba lagi.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Back to Home */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-primary-foreground/70 hover:text-primary-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </Link>

        <Card className="shadow-large border-border/50 animate-scale-in">
          <CardHeader className="text-center pb-2">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                <MapPin className="w-6 h-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Login Pegawai</CardTitle>
            <CardDescription>Masuk kehalaman Pegawai</CardDescription>
          </CardHeader>

          <CardContent>
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

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="nama@instansi.go.id"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="pl-10"
                    disabled={isLoading || (rateLimit.isEnabled && rateLimit.isLocked)}
                  />
                </div>
                {errors?.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>

                <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="pl-10 pr-10"
                    disabled={isLoading || (rateLimit.isEnabled && rateLimit.isLocked)}
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

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-primary hover:underline"
                >
                  Lupa password?
                </button>
              </div>

              <div className="space-y-2">
                <Label>Verifikasi Captcha</Label>
                <SimpleCaptcha onVerify={setLoginCaptchaValid} />
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isLoading || !loginCaptchaValid || (rateLimit.isEnabled && rateLimit.isLocked)}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  "Masuk"
                )}
              </Button>
            </form>

            {/* Info Box */}
            <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Info Penting</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>Halaman ini khusus untuk pegawai</li>
                    <li>
                      Admin Organisasi silakan login di{" "}
                      <Link to="/org/login" className="text-primary hover:underline">
                        halaman admin
                      </Link>
                    </li>
                    <li>Akun pegawai dibuat oleh administrator</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 text-center text-primary-foreground/60 text-sm">
          <p>© 2026 AbsensiKu. All rights reserved.</p>
        </div>

        <ForgotPasswordDialog
          open={showForgotPassword}
          onOpenChange={setShowForgotPassword}
          loginType="employee"
        />
      </div>
    </div>
  );
};

export default Auth;
