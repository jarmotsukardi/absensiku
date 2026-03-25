import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Lock, ArrowLeft, Loader2, CheckCircle2, Eye, EyeOff, AlertCircle } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { WEB_AUTH_LOGIN_PATH } from "@/lib/employeeAuthRoutes";

const passwordSchema = z.object({
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .regex(/[a-z]/, "Password harus mengandung huruf kecil")
    .regex(/[A-Z]/, "Password harus mengandung huruf besar")
    .regex(/[0-9]/, "Password harus mengandung angka")
    .regex(/[^a-zA-Z0-9]/, "Password harus mengandung karakter khusus (!@#$%^&*)"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Password tidak cocok",
  path: ["confirmPassword"],
});

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check for error in URL params (from Supabase redirect)
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    
    if (error) {
      setErrorMessage(errorDescription || "Link reset password tidak valid atau sudah kadaluarsa.");
      setIsCheckingSession(false);
      return;
    }

    // Handle hash fragment for token (Supabase uses hash-based routing)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type = hashParams.get("type");

    if (accessToken && type === "recovery") {
      // Set the session from the recovery token
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || "",
      }).then(({ data, error }) => {
        if (error) {
          setErrorMessage("Gagal memverifikasi token. Silakan minta link reset password baru.");
          setIsCheckingSession(false);
        } else if (data.session) {
          setIsValidSession(true);
          setIsCheckingSession(false);
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      });
      return;
    }

    // Check if user has a valid recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsValidSession(true);
      }
      setIsCheckingSession(false);
    });

    // Listen for auth state changes (recovery link clicked)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setIsValidSession(true);
        setIsCheckingSession(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [searchParams]);

  const getPasswordStrength = (pass: string) => {
    let strength = 0;
    if (pass.length >= 8) strength++;
    if (/[a-z]/.test(pass)) strength++;
    if (/[A-Z]/.test(pass)) strength++;
    if (/[0-9]/.test(pass)) strength++;
    if (/[^a-zA-Z0-9]/.test(pass)) strength++;
    return strength;
  };

  const passwordStrength = getPasswordStrength(password);

  const getStrengthColor = () => {
    if (passwordStrength <= 2) return "bg-destructive";
    if (passwordStrength <= 3) return "bg-warning";
    return "bg-success";
  };

  const getStrengthLabel = () => {
    if (passwordStrength <= 2) return "Lemah";
    if (passwordStrength <= 3) return "Sedang";
    return "Kuat";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      passwordSchema.parse({ password, confirmPassword });
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
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Gagal",
          description: error.message,
        });
      } else {
        setIsSuccess(true);
        toast({
          title: "Password Berhasil Diubah",
          description: "Anda akan diarahkan ke halaman login.",
        });
        
        // Sign out and redirect to login
        setTimeout(async () => {
          await supabase.auth.signOut();
          navigate(WEB_AUTH_LOGIN_PATH);
        }, 3000);
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

  if (isCheckingSession) {
    return (
      <div className="min-h-screen hero-gradient flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-foreground" />
      </div>
    );
  }

  if (errorMessage || (!isValidSession && !isSuccess)) {
    return (
      <div className="min-h-screen hero-gradient flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-md relative z-10">
          <Card className="shadow-large border-border/50">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Link Tidak Valid</CardTitle>
              <CardDescription>
                {errorMessage || "Link reset password sudah kadaluarsa atau tidak valid. Silakan minta link reset password baru."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link to={WEB_AUTH_LOGIN_PATH}>
                <Button className="w-full" variant="outline">
                  Kembali ke Login
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <Link
          to={WEB_AUTH_LOGIN_PATH}
          className="inline-flex items-center gap-2 text-primary-foreground/70 hover:text-primary-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Login
        </Link>

        <Card className="shadow-large border-border/50 animate-scale-in">
          <CardHeader className="text-center pb-2">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                <MapPin className="w-6 h-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl">Reset Password</CardTitle>
            <CardDescription>
              Masukkan password baru Anda
            </CardDescription>
          </CardHeader>

          <CardContent>
            {isSuccess ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Password Berhasil Diubah!</h3>
                <p className="text-muted-foreground mb-4">
                  Anda akan diarahkan ke halaman login dalam beberapa detik...
                </p>
                <Link to={WEB_AUTH_LOGIN_PATH}>
                  <Button className="w-full">
                    Ke Halaman Login
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password Baru</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  
                  {/* Password Strength Indicator */}
                  {password && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className={cn(
                              "h-1 flex-1 rounded-full transition-colors",
                              i <= passwordStrength ? getStrengthColor() : "bg-muted"
                            )}
                          />
                        ))}
                      </div>
                      <p className={cn(
                        "text-xs",
                        passwordStrength <= 2 ? "text-destructive" : 
                        passwordStrength <= 3 ? "text-warning" : "text-success"
                      )}>
                        Kekuatan: {getStrengthLabel()}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Konfirmasi Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 pr-10"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
                </div>

                {/* Password Requirements */}
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-xs font-medium mb-2">Password harus memenuhi:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li className={password.length >= 8 ? "text-success" : ""}>
                      ✓ Minimal 8 karakter
                    </li>
                    <li className={/[a-z]/.test(password) ? "text-success" : ""}>
                      ✓ Mengandung huruf kecil (a-z)
                    </li>
                    <li className={/[A-Z]/.test(password) ? "text-success" : ""}>
                      ✓ Mengandung huruf besar (A-Z)
                    </li>
                    <li className={/[0-9]/.test(password) ? "text-success" : ""}>
                      ✓ Mengandung angka (0-9)
                    </li>
                    <li className={/[^a-zA-Z0-9]/.test(password) ? "text-success" : ""}>
                      ✓ Mengandung karakter khusus (!@#$%^&*)
                    </li>
                  </ul>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    "Simpan Password Baru"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-primary-foreground/50 mt-6">
          © 2026 AbsensiKu. All rights reserved.
        </p>
      </div>
    </div>
  );
}
