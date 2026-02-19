import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SingleOTPInput, { SingleOTPInputRef } from "@/components/common/SingleOTPInput";
import { useToast } from "@/hooks/use-toast";
import { Shield, Mail, Lock, ArrowLeft, Loader2, MapPin, RefreshCw, KeyRound, Key, Eye, EyeOff } from "lucide-react";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().email("Email tidak valid").max(255, "Email terlalu panjang"),
  password: z.string().min(6, "Password minimal 6 karakter").max(128, "Password terlalu panjang"),
});

// Captcha generator
const generateCaptcha = () => {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const operators = ["+", "-", "×"];
  const operatorIndex = Math.floor(Math.random() * 3);
  const operator = operators[operatorIndex];

  let answer: number;
  switch (operatorIndex) {
    case 0:
      answer = num1 + num2;
      break;
    case 1:
      answer = Math.max(num1, num2) - Math.min(num1, num2);
      break;
    case 2:
      answer = num1 * num2;
      break;
    default:
      answer = num1 + num2;
  }

  const question =
    operatorIndex === 1
      ? `${Math.max(num1, num2)} ${operator} ${Math.min(num1, num2)}`
      : `${num1} ${operator} ${num2}`;

  return { question, answer };
};

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Captcha state
  const [captcha, setCaptcha] = useState(generateCaptcha());
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  // 2FA state
  const [show2FA, setShow2FA] = useState(false);
  const [otpValid, setOtpValid] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  
  // Ref untuk OTP input (uncontrolled)
  const otpInputRef = useRef<SingleOTPInputRef>(null);
  const nonSuperAdminSessionNotifiedRef = useRef(false);

  // Stable callback untuk OTP change
  const handleOtpChange = useCallback((value: string) => {
    setOtpValid(value.length === 6);
  }, []);

  const refreshCaptcha = () => {
    setCaptcha(generateCaptcha());
    setCaptchaAnswer("");
  };

  useEffect(() => {
    // Check if already logged in as super admin
    const checkExistingSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
          _user_id: session.user.id,
        });

        if (isSuperAdmin) {
          navigate("/admin");
        }
      }
    };

    checkExistingSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && !show2FA) {
        // Check super admin role after login
        setTimeout(async () => {
          const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
            _user_id: session.user.id,
          });

          if (isSuperAdmin) {
            navigate("/admin", { replace: true });
          } else {
            if (!nonSuperAdminSessionNotifiedRef.current) {
              nonSuperAdminSessionNotifiedRef.current = true;
              toast({
                variant: "destructive",
                title: "Akses Ditolak",
                description:
                  "Akun ini bukan Super Admin. Gunakan halaman login sesuai role Anda.",
              });
            }
            return;
          }
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, toast, show2FA]);

  const handleSendOtp = async (userEmail: string) => {
    setIsSendingOtp(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: userEmail, purpose: "2fa_login" }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Gagal mengirim OTP");
      }

      toast({
        title: "Kode OTP Terkirim",
        description: "Silakan periksa email Anda untuk kode 2FA.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tidak dapat mengirim kode 2FA.";
      console.error("Error sending 2FA OTP:", error);
      toast({
        variant: "destructive",
        title: "Gagal Mengirim OTP",
        description: message,
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate captcha first
    if (parseInt(captchaAnswer) !== captcha.answer) {
      toast({
        variant: "destructive",
        title: "Captcha Salah",
        description: "Jawaban captcha tidak benar. Silakan coba lagi.",
      });
      refreshCaptcha();
      return;
    }

    // Validate input
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: validation.data.email,
        password: validation.data.password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast({
            variant: "destructive",
            title: "Login Gagal",
            description: "Email atau password salah. Silakan coba lagi.",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Login Gagal",
            description: error.message,
          });
        }
        refreshCaptcha();
        return;
      }

      // Check if user is super admin
      if (authData.user) {
        const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
          _user_id: authData.user.id,
        });

        if (!isSuperAdmin) {
          await supabase.auth.signOut();
          nonSuperAdminSessionNotifiedRef.current = true;
          toast({
            variant: "destructive",
            title: "Akses Ditolak",
            description:
              "Akun ini bukan Super Admin. Gunakan login organisasi/pegawai.",
          });
          refreshCaptcha();
          return;
        }

        // Check if 2FA is enabled in system settings
        // Prioritas key baru: super_admin_2fa_enabled, fallback legacy: admin_2fa_enabled
        const { data: settingsRows } = await supabase
          .from("system_settings")
          .select("key, value")
          .in("key", ["super_admin_2fa_enabled", "admin_2fa_enabled"]);

        const raw2FAValue =
          settingsRows?.find((row) => row.key === "super_admin_2fa_enabled")?.value ??
          settingsRows?.find((row) => row.key === "admin_2fa_enabled")?.value;
        const is2FAEnabled =
          raw2FAValue === true ||
          raw2FAValue === "true" ||
          raw2FAValue === 1 ||
          raw2FAValue === "1";

        if (is2FAEnabled) {
          // Sign out temporarily while waiting for 2FA
          await supabase.auth.signOut();
          setPendingUserId(authData.user.id);
          setShow2FA(true);
          await handleSendOtp(validation.data.email);
        }
        // If 2FA not enabled, auth state change will handle redirect
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Terjadi Kesalahan",
        description: "Tidak dapat menghubungi server. Silakan coba lagi.",
      });
      refreshCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    const otpCode = otpInputRef.current?.getValue() || "";
    if (otpCode.length !== 6) {
      toast({
        variant: "destructive",
        title: "Kode OTP Tidak Lengkap",
        description: "Masukkan 6 digit kode OTP.",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Verify OTP via edge function (secure hash comparison)
      const { data, error: verifyError } = await supabase.functions.invoke("verify-device-otp", {
        body: {
          email: email,
          otp: otpCode,
        },
      });

      if (verifyError || !data?.success) {
        toast({
          variant: "destructive",
          title: "Kode OTP Tidak Valid",
          description: data?.error || "Kode OTP salah atau sudah kedaluwarsa.",
        });
        setIsLoading(false);
        return;
      }

      // Re-login
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        throw loginError;
      }

      toast({
        title: "Verifikasi Berhasil",
        description: "Anda akan dialihkan ke dashboard.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat verifikasi.";
      toast({
        variant: "destructive",
        title: "Verifikasi Gagal",
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    await handleSendOtp(email);
  };

  if (show2FA) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500 rounded-full blur-3xl" />
        </div>

        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:50px_50px]" />

        <div className="w-full max-w-md relative z-10">
          <Card className="border-slate-700 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
            <CardHeader className="text-center pb-2">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/25">
                  <KeyRound className="w-6 h-6 text-white" />
                </div>
              </div>
              <CardTitle className="text-2xl text-white">Verifikasi 2FA</CardTitle>
              <CardDescription className="text-slate-400">
                Masukkan kode OTP yang dikirim ke email Anda
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
              <SingleOTPInput
                ref={otpInputRef}
                onChange={handleOtpChange}
                className="bg-slate-800 border-slate-600 text-white"
                autoFocus
              />

              <Button
                onClick={handleVerify2FA}
                className="w-full bg-gradient-to-r from-primary to-blue-600"
                disabled={isLoading || !otpValid}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Memverifikasi...
                  </>
                ) : (
                  "Verifikasi"
                )}
              </Button>

              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResendOtp}
                  disabled={isSendingOtp}
                  className="text-slate-400 hover:text-white"
                >
                  {isSendingOtp ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Kirim Ulang OTP
                </Button>
              </div>

              <Button
                variant="ghost"
                onClick={() => {
                  setShow2FA(false);
                  otpInputRef.current?.clear();
                  setOtpValid(false);
                  refreshCaptcha();
                }}
                className="w-full text-slate-400"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali ke Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500 rounded-full blur-3xl" />
      </div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:50px_50px]" />

      <div className="w-full max-w-md relative z-10">
        {/* Back Link */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </Link>

        <Card className="border-slate-700 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/25">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl text-white">Super Admin</CardTitle>
            <CardDescription className="text-slate-400">
              Panel Administrasi AbsensiKu
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@absensiku.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary/20"
                    disabled={isLoading}
                    maxLength={255}
                  />
                </div>
                {errors.email && <p className="text-sm text-red-400">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary/20"
                    disabled={isLoading}
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-red-400">{errors.password}</p>}
              </div>

              {/* Captcha */}
              <div className="space-y-2">
                <Label className="text-slate-300">
                  Captcha: Berapa hasil dari {captcha.question} ?
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Jawaban"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    className="flex-1 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                    disabled={isLoading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={refreshCaptcha}
                    className="border-slate-700 bg-slate-800/50 text-slate-300 hover:text-white"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white shadow-lg shadow-primary/25"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Masuk ke Panel Admin
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-primary hover:text-primary/80 inline-flex items-center gap-1"
              >
                <Key className="w-3 h-3" />
                Lupa / Ganti Password?
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800">
              <p className="text-center text-sm text-slate-500">
                Bukan Super Admin?{" "}
                <Link to="/auth" className="text-primary hover:text-primary/80 font-medium">
                  Login sebagai Pengguna
                </Link>
              </p>
            </div>

            {/* Forgot Password Dialog */}
            <ForgotPasswordDialog
              open={showForgotPassword}
              onOpenChange={setShowForgotPassword}
              loginType="admin"
            />
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 mt-6">
          © 2026 AbsensiKu. All rights reserved.
        </p>
      </div>
    </div>
  );
}
