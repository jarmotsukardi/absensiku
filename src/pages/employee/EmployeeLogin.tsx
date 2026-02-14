import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import SingleOTPInput, { SingleOTPInputRef } from "@/components/common/SingleOTPInput";
import { useToast } from "@/hooks/use-toast";
import { useSecurityCheck } from "@/hooks/useSecurityCheck";
import { useLoginRateLimit } from "@/hooks/useLoginRateLimit";
import { useSessionManagement } from "@/hooks/useSessionManagement";
import { DesktopBlockedMessage } from "@/components/employee/DesktopBlockedMessage";
import { SessionLoadingScreen } from "@/components/employee/SessionLoadingScreen";
import { MapPin, Mail, Lock, Loader2, RefreshCw, UserPlus, ArrowLeft, CheckCircle2, Eye, EyeOff, AlertTriangle, Phone, MapPinIcon, User, Building2, Key } from "lucide-react";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";

// Konstanta untuk optimasi performa
const DEBOUNCE_MS = 1000;
const MIN_REQUEST_INTERVAL_MS = 2000;

// Generate simple math captcha
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
  
  const question = operatorIndex === 1 
    ? `${Math.max(num1, num2)} ${operator} ${Math.min(num1, num2)}` 
    : `${num1} ${operator} ${num2}`;
  
  return { question, answer };
};

export default function EmployeeLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite");

  // Session management dengan sliding expiration 7 hari
  const sessionManagement = useSessionManagement();
  
  // State untuk loading screen transisi
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [sessionCheckComplete, setSessionCheckComplete] = useState(false);

  // Security check untuk block desktop browser
  const securityCheck = useSecurityCheck();
  
  // Rate limiting untuk mencegah brute force
  const { 
    isEnabled,
    isLocked, 
    lockoutDurationMinutes,
    remainingAttempts, 
    recordFailedAttempt, 
    resetAttempts, 
    formatRemainingTime,
  } = useLoginRateLimit("employee_login_rate_limit");

  // Refs untuk mencegah double-submit
  const isSubmittingRef = useRef(false);
  const lastRequestTimeRef = useRef(0);

  const [activeTab, setActiveTab] = useState<"login" | "register">(
    inviteCode ? "register" : "login"
  );
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Show password toggle
  const [showPassword, setShowPassword] = useState(false);

  // Captcha for forgot password
  const [forgotCaptcha, setForgotCaptcha] = useState(generateCaptcha());
  const [forgotCaptchaAnswer, setForgotCaptchaAnswer] = useState("");

  // Forgot password - OTP flow
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotWhatsapp, setForgotWhatsapp] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "otp" | "newPassword" | "success">("email");
  const [otpValid, setOtpValid] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Ref untuk OTP input (uncontrolled)
  const otpInputRef = useRef<SingleOTPInputRef>(null);
  
  // Stable callback untuk OTP change (mencegah re-render berlebih)
  const handleOtpValueChange = useCallback((value: string) => {
    setOtpValid(value.length === 6);
  }, []);
  
  // Register with invite
  const [invitationCode, setInvitationCode] = useState(inviteCode || "");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [invitationData, setInvitationData] = useState<any>(null);
  
  // Additional fields for invite registration (if not provided in invitation)
  const [inviteRegName, setInviteRegName] = useState("");
  const [inviteRegEmail, setInviteRegEmail] = useState("");
  const [inviteRegWhatsapp, setInviteRegWhatsapp] = useState("");
  const [inviteRegAddress, setInviteRegAddress] = useState("");
  const [showInviteRegPassword, setShowInviteRegPassword] = useState(false);
  const [showInviteRegConfirmPassword, setShowInviteRegConfirmPassword] = useState(false);
  
  // Register mode: "invite" (kode undangan) atau "self" (email OTP)
  const [registerMode, setRegisterMode] = useState<"invite" | "self">(inviteCode ? "invite" : "self");
  
  // Self registration states
  const [selfRegEmail, setSelfRegEmail] = useState("");
  const [selfRegStep, setSelfRegStep] = useState<"email" | "otp" | "profile" | "success">("email");
  const [selfRegOtpValid, setSelfRegOtpValid] = useState(false);
  const [selfRegMaskedEmail, setSelfRegMaskedEmail] = useState("");
  const [selfRegName, setSelfRegName] = useState("");
  const [selfRegWhatsapp, setSelfRegWhatsapp] = useState("");
  const [selfRegAddress, setSelfRegAddress] = useState("");
  const [selfRegPassword, setSelfRegPassword] = useState("");
  const [selfRegConfirmPassword, setSelfRegConfirmPassword] = useState("");
  const [showSelfRegPassword, setShowSelfRegPassword] = useState(false);
  const [showSelfRegConfirmPassword, setShowSelfRegConfirmPassword] = useState(false);
  
  // Ref untuk self registration OTP
  const selfRegOtpRef = useRef<SingleOTPInputRef>(null);
  
  // Captcha for register
  const [registerCaptcha, setRegisterCaptcha] = useState(generateCaptcha());
  const [registerCaptchaAnswer, setRegisterCaptchaAnswer] = useState("");
  
  // Captcha for self registration
  const [selfRegCaptcha, setSelfRegCaptcha] = useState(generateCaptcha());
  const [selfRegCaptchaAnswer, setSelfRegCaptchaAnswer] = useState("");
  
  // Dialog untuk registrasi organisasi
  const [showOrgRegisterDialog, setShowOrgRegisterDialog] = useState(false);
  
  // Dialog overlay penjelasan tab daftar
  const [showRegisterInfoDialog, setShowRegisterInfoDialog] = useState<"email" | "invite" | null>(null);

  // Handler ketika loading screen selesai
  const handleLoadingComplete = useCallback(() => {
    setSessionCheckComplete(true);
  }, []);

  // Effect untuk cek sesi dan redirect jika valid
  useEffect(() => {
    if (sessionCheckComplete && !sessionManagement.isChecking) {
      if (sessionManagement.isValid && sessionManagement.session) {
        navigate("/employee/dashboard", { replace: true });
      } else {
        setShowLoadingScreen(false);
      }
    }
  }, [sessionCheckComplete, sessionManagement.isChecking, sessionManagement.isValid, sessionManagement.session, navigate]);

  // Listen untuk auth state changes (untuk handle login sukses)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        sessionManagement.onLoginSuccess(session);
        navigate("/employee/dashboard", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, sessionManagement]);

  // Fetch invitation data if code exists
  useEffect(() => {
    if (invitationCode && activeTab === "register" && registerMode === "invite") {
      fetchInvitation();
    }
  }, [invitationCode, activeTab, registerMode]);

  const fetchInvitation = async () => {
    if (!invitationCode) return;
    
    try {
      const { data, error } = await supabase
        .from("employee_invitations")
        .select("*, tenants:tenant_id(name, code, logo_url)")
        .eq("invitation_code", invitationCode)
        .eq("status", "pending")
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setInvitationData(data);
        // Pre-fill fields from invitation data if available
        setInviteRegName(data.name || "");
        setInviteRegEmail(data.email || "");
        setInviteRegWhatsapp(data.phone || "");
      } else {
        toast({
          variant: "destructive",
          title: "Kode Undangan Tidak Valid",
          description: "Kode undangan tidak ditemukan atau sudah digunakan.",
        });
      }
    } catch (error) {
      console.error("Error fetching invitation:", error);
    }
  };

  const refreshForgotCaptcha = () => {
    setForgotCaptcha(generateCaptcha());
    setForgotCaptchaAnswer("");
  };

  const refreshRegisterCaptcha = () => {
    setRegisterCaptcha(generateCaptcha());
    setRegisterCaptchaAnswer("");
  };
  
  const refreshSelfRegCaptcha = () => {
    setSelfRegCaptcha(generateCaptcha());
    setSelfRegCaptchaAnswer("");
  };

  // Fungsi untuk mendapatkan device ID
  const getDeviceId = (): string => {
    const storedId = localStorage.getItem("web_device_id");
    if (storedId) return storedId;

    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      navigator.hardwareConcurrency || 0,
      navigator.maxTouchPoints || 0,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join("|");

    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const deviceId = `WEB-${Math.abs(hash).toString(16).toUpperCase().padStart(16, "0")}`;
    localStorage.setItem("web_device_id", deviceId);
    
    return deviceId;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmittingRef.current) return;

    if (isEnabled && isLocked) {
      toast({
        variant: "destructive",
        title: "Akses Dikunci",
        description: `Terlalu banyak percobaan. Coba lagi dalam ${formatRemainingTime()}.`,
      });
      return;
    }

    const now = Date.now();
    if (now - lastRequestTimeRef.current < MIN_REQUEST_INTERVAL_MS) {
      toast({
        variant: "destructive",
        title: "Tunggu Sebentar",
        description: "Jangan terlalu cepat menekan tombol login.",
      });
      return;
    }

    if (!email?.trim() || !password) {
      toast({
        variant: "destructive",
        title: "Form Tidak Lengkap",
        description: "Email dan password harus diisi.",
      });
      return;
    }

    isSubmittingRef.current = true;
    lastRequestTimeRef.current = now;
    setIsLoading(true);

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        if (isEnabled) {
          const nowLocked = recordFailedAttempt();
          
          if (nowLocked) {
            toast({
              variant: "destructive",
              title: "Akses Dikunci",
              description: `Terlalu banyak percobaan gagal. Akses dikunci selama ${lockoutDurationMinutes} menit.`,
            });
          } else {
            toast({
              variant: "destructive",
              title: "Login Gagal",
              description: error.message.includes("Invalid login credentials")
                ? `Email atau password salah. Sisa percobaan: ${remainingAttempts - 1}`
                : error.message,
            });
          }
        } else {
          toast({
            variant: "destructive",
            title: "Login Gagal",
            description: error.message.includes("Invalid login credentials")
              ? "Email atau password salah."
              : error.message,
          });
        }
        return;
      }

      resetAttempts();

      if (authData.user) {
        const currentDeviceId = getDeviceId();
        
        (async () => {
          try {
            const { data: employeeData } = await supabase
              .from("employees")
              .select("id, last_login_device_id")
              .eq("user_id", authData.user!.id)
              .maybeSingle();

            if (employeeData) {
              if (employeeData.last_login_device_id && 
                  employeeData.last_login_device_id !== currentDeviceId) {
                toast({
                  title: "Sesi Baru",
                  description: "Perangkat lama akan otomatis logout.",
                });
              }

              await supabase
                .from("employees")
                .update({
                  last_login_device_id: currentDeviceId,
                  last_login_at: new Date().toISOString(),
                })
                .eq("id", employeeData.id);
            }
          } catch (err) {
            console.error("Background device update error:", err);
          }
        })();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Terjadi Kesalahan",
        description: "Tidak dapat menghubungi server.",
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        isSubmittingRef.current = false;
      }, DEBOUNCE_MS);
    }
  };

  // ============ FORGOT PASSWORD HANDLERS ============
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!forgotEmail.trim()) {
      toast({ variant: "destructive", title: "Email Diperlukan", description: "Masukkan email yang terdaftar." });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail.trim())) {
      toast({ variant: "destructive", title: "Format email tidak valid" });
      return;
    }
    if (!forgotWhatsapp.trim()) {
      toast({ variant: "destructive", title: "No. WhatsApp Diperlukan", description: "Masukkan no. WhatsApp yang terdaftar." });
      return;
    }
    const phoneRegex = /^(\+?62|0)[0-9]{8,13}$/;
    if (!phoneRegex.test(forgotWhatsapp.trim().replace(/[\s-]/g, ""))) {
      toast({ variant: "destructive", title: "Format no. WhatsApp tidak valid", description: "Contoh: 081234567890" });
      return;
    }

    if (parseInt(forgotCaptchaAnswer) !== forgotCaptcha.answer) {
      toast({
        variant: "destructive",
        title: "Captcha Salah",
        description: "Jawaban captcha tidak benar.",
      });
      refreshForgotCaptcha();
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: forgotEmail.trim(), whatsapp: forgotWhatsapp.trim() }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (result.code === "EMAIL_NOT_FOUND") {
          toast({ variant: "destructive", title: "Email Tidak Terdaftar" });
        } else if (result.code === "NOT_ACTIVATED") {
          toast({ variant: "destructive", title: "Akun Belum Aktif", description: result.error });
        } else {
          throw new Error(result.error || "Gagal mengirim OTP");
        }
        refreshForgotCaptcha();
        setIsLoading(false);
        return;
      }

      setMaskedEmail(result.email || forgotEmail);
      setOtpStep("otp");
      toast({ title: "Kode OTP Terkirim", description: "Periksa email Anda (berlaku 10 menit)." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Mengirim OTP", description: error.message });
      refreshForgotCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = () => {
    const otpValue = otpInputRef.current?.getValue() || "";
    if (otpValue.length !== 6) {
      toast({ variant: "destructive", title: "Kode OTP Tidak Lengkap" });
      return;
    }
    setOtpStep("newPassword");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmNewPassword) {
      toast({ variant: "destructive", title: "Password Tidak Cocok" });
      return;
    }

    if (newPassword.length < 6) {
      toast({ variant: "destructive", title: "Password Terlalu Pendek" });
      return;
    }

    setIsLoading(true);

    try {
      const otpValue = otpInputRef.current?.getValue() || "";
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-password-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ 
            email: forgotEmail.trim(),
            whatsapp: forgotWhatsapp.trim(),
            otp: otpValue,
            newPassword: newPassword
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (result.code === "INVALID_OTP") {
          toast({ variant: "destructive", title: "Kode OTP Tidak Valid" });
          setOtpStep("otp");
          otpInputRef.current?.clear();
          setOtpValid(false);
        } else {
          throw new Error(result.error || "Gagal reset password");
        }
        setIsLoading(false);
        return;
      }

      setOtpStep("success");
      toast({ title: "Password Berhasil Diubah" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Reset Password", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: forgotEmail.trim(), whatsapp: forgotWhatsapp.trim() }),
        }
      );

      const result = await response.json();

      if (!response.ok) throw new Error(result.error);

      otpInputRef.current?.clear();
      setOtpValid(false);
      toast({ title: "Kode OTP Terkirim Ulang" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Mengirim Ulang", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForgotPasswordState = () => {
    setOtpStep("email");
    setForgotEmail("");
    setForgotWhatsapp("");
    otpInputRef.current?.clear();
    setOtpValid(false);
    setNewPassword("");
    setConfirmNewPassword("");
    setMaskedEmail("");
    refreshForgotCaptcha();
  };

  // ============ SELF REGISTRATION HANDLERS ============
  const handleSendSelfRegOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selfRegEmail) {
      toast({ variant: "destructive", title: "Email Diperlukan" });
      return;
    }

    if (parseInt(selfRegCaptchaAnswer) !== selfRegCaptcha.answer) {
      toast({ variant: "destructive", title: "Captcha Salah" });
      refreshSelfRegCaptcha();
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-registration-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: selfRegEmail.trim() }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (result.code === "EMAIL_EXISTS") {
          toast({ variant: "destructive", title: "Email Sudah Terdaftar", description: "Silakan login atau gunakan lupa password." });
        } else if (result.code === "RATE_LIMIT") {
          toast({ variant: "destructive", title: "Terlalu Banyak Permintaan", description: result.error });
        } else {
          throw new Error(result.error);
        }
        refreshSelfRegCaptcha();
        setIsLoading(false);
        return;
      }

      setSelfRegMaskedEmail(result.email);
      setSelfRegStep("otp");
      toast({ title: "Kode OTP Terkirim", description: "Periksa email Anda (berlaku 10 menit)." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Mengirim OTP", description: error.message });
      refreshSelfRegCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySelfRegOTP = () => {
    const otpValue = selfRegOtpRef.current?.getValue() || "";
    if (otpValue.length !== 6) {
      toast({ variant: "destructive", title: "Kode OTP Tidak Lengkap" });
      return;
    }
    setSelfRegStep("profile");
  };

  const handleCompleteSelfReg = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const missingFields: string[] = [];
    if (!selfRegName.trim()) missingFields.push("Nama Lengkap");
    if (!selfRegPassword) missingFields.push("Password");
    if (!selfRegConfirmPassword) missingFields.push("Konfirmasi Password");

    if (missingFields.length > 0) {
      toast({
        variant: "destructive",
        title: "Registrasi Tidak Lengkap",
        description: `Field berikut belum diisi: ${missingFields.join(", ")}`,
      });
      return;
    }

    if (selfRegPassword.length < 6) {
      toast({ variant: "destructive", title: "Password Minimal 6 Karakter" });
      return;
    }

    if (selfRegPassword !== selfRegConfirmPassword) {
      toast({ variant: "destructive", title: "Password Tidak Cocok" });
      return;
    }

    setIsLoading(true);

    try {
      const otpValue = selfRegOtpRef.current?.getValue() || "";
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-registration-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            email: selfRegEmail.trim(),
            otp: otpValue,
            name: selfRegName.trim(),
            whatsapp: selfRegWhatsapp.trim(),
            address: selfRegAddress.trim(),
            password: selfRegPassword,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (result.code === "INVALID_OTP") {
          toast({ variant: "destructive", title: "Kode OTP Tidak Valid" });
          setSelfRegStep("otp");
          selfRegOtpRef.current?.clear();
          setSelfRegOtpValid(false);
        } else {
          throw new Error(result.error);
        }
        setIsLoading(false);
        return;
      }

      setSelfRegStep("success");
      toast({ title: "Registrasi Berhasil!", description: "Silakan login dengan akun Anda." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Registrasi Gagal", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendSelfRegOTP = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-registration-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: selfRegEmail.trim() }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      selfRegOtpRef.current?.clear();
      setSelfRegOtpValid(false);
      toast({ title: "Kode OTP Terkirim Ulang" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Mengirim Ulang", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const resetSelfRegState = () => {
    setSelfRegStep("email");
    setSelfRegEmail("");
    selfRegOtpRef.current?.clear();
    setSelfRegOtpValid(false);
    setSelfRegName("");
    setSelfRegWhatsapp("");
    setSelfRegAddress("");
    setSelfRegPassword("");
    setSelfRegConfirmPassword("");
    setSelfRegMaskedEmail("");
    refreshSelfRegCaptcha();
  };

  // ============ INVITE REGISTRATION HANDLERS ============
  const getDeviceIdForRegister = (): string => {
    const storedId = localStorage.getItem("web_device_id");
    if (storedId) return storedId;

    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      screen.colorDepth,
      navigator.hardwareConcurrency || 0,
      navigator.maxTouchPoints || 0,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join("|");

    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const deviceId = `WEB-${Math.abs(hash).toString(16).toUpperCase().padStart(16, "0")}`;
    localStorage.setItem("web_device_id", deviceId);
    
    return deviceId;
  };

  const handleRegisterWithInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invitationData) {
      toast({ variant: "destructive", title: "Kode Undangan Tidak Valid" });
      return;
    }

    // Validate required fields
    const finalName = inviteRegName.trim() || invitationData.name;
    const finalEmail = inviteRegEmail.trim() || invitationData.email;
    
    if (!finalName) {
      toast({ variant: "destructive", title: "Nama Lengkap Diperlukan" });
      return;
    }
    
    if (!finalEmail) {
      toast({ variant: "destructive", title: "Email Diperlukan" });
      return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(finalEmail)) {
      toast({ variant: "destructive", title: "Format Email Tidak Valid" });
      return;
    }

    if (parseInt(registerCaptchaAnswer) !== registerCaptcha.answer) {
      toast({ variant: "destructive", title: "Captcha Salah" });
      refreshRegisterCaptcha();
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      toast({ variant: "destructive", title: "Password Tidak Cocok" });
      return;
    }

    if (registerPassword.length < 6) {
      toast({ variant: "destructive", title: "Password Minimal 6 Karakter" });
      return;
    }

    setIsLoading(true);

    try {
      const currentDeviceId = getDeviceIdForRegister();

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: finalEmail,
        password: registerPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/employee/dashboard`,
          data: { name: finalName },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        // Update invitation with new data if provided
        await supabase
          .from("employee_invitations")
          .update({ 
            status: "verified", 
            verified_at: new Date().toISOString(),
            name: finalName,
            email: finalEmail,
            phone: inviteRegWhatsapp || invitationData.phone,
          })
          .eq("id", invitationData.id);

        const { error: empError } = await supabase.from("employees").insert({
          user_id: authData.user.id,
          tenant_id: invitationData.tenant_id,
          name: finalName,
          email: finalEmail,
          nik: invitationData.nik,
          phone: inviteRegWhatsapp || invitationData.phone,
          address: inviteRegAddress || null,
          opd_id: invitationData.opd_id,
          office_id: invitationData.office_id,
          android_id: currentDeviceId,
          is_active: true,
        });

        if (empError) {
          console.error("Error creating employee:", empError);
        }

        await supabase.from("user_roles").insert({
          user_id: authData.user.id,
          tenant_id: invitationData.tenant_id,
          role: "pegawai",
        });

        toast({ title: "Registrasi Berhasil!", description: "Silakan login." });

        setActiveTab("login");
        setEmail(finalEmail);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Registrasi Gagal", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  // Tampilkan loading screen
  if (showLoadingScreen) {
    const dynamicDuration = sessionManagement.isChecking ? 4000 : 1500;
    
    return (
      <SessionLoadingScreen 
        onComplete={handleLoadingComplete} 
        duration={dynamicDuration}
        message={sessionManagement.isChecking ? "Memverifikasi sesi..." : "Menyiapkan halaman..."}
      />
    );
  }

  // Blokir browser desktop
  if (securityCheck.securityResult.isBlocked) {
    return <DesktopBlockedMessage />;
  }

  return (
    <div className="min-h-screen hero-gradient flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-foreground rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <Card className="shadow-large border-border/50 animate-scale-in">
          <CardHeader className="text-center pb-2">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center shadow-lg">
                <MapPin className="w-7 h-7 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">AbsensiKu</CardTitle>
            <CardDescription>Sistem Absensi Digital Berbasis GPS</CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => {
              setActiveTab(v as "login" | "register");
              if (v === "register") resetSelfRegState();
            }} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login" className="text-xs sm:text-sm">Masuk</TabsTrigger>
                <TabsTrigger value="register" className="text-xs sm:text-sm">Daftar</TabsTrigger>
              </TabsList>

              {/* Login Tab */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
                  {isEnabled && isLocked && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>Akses dikunci. Coba lagi dalam <strong>{formatRemainingTime()}</strong></span>
                    </div>
                  )}

                  {isEnabled && !isLocked && remainingAttempts <= 2 && remainingAttempts > 0 && (
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-2 text-sm text-warning">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>Sisa percobaan: {remainingAttempts}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="email@instansi.go.id"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        disabled={isLoading || (isEnabled && isLocked)}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        disabled={isLoading || (isEnabled && isLocked)}
                        autoComplete="current-password"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={isLoading || (isEnabled && isLocked)}>
                    {isLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</>
                    ) : (isEnabled && isLocked) ? (
                      <><Lock className="w-4 h-4" /> Dikunci ({formatRemainingTime()})</>
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

                <ForgotPasswordDialog
                  open={showForgotPassword}
                  onOpenChange={setShowForgotPassword}
                  loginType="employee"
                />
              </TabsContent>

              {/* Forgot Password Tab removed - now using ForgotPasswordDialog */}

              {/* Register Tab */}
              <TabsContent value="register">
                {/* Mode selector - responsive dengan flex-wrap */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Button
                    type="button"
                    variant={registerMode === "self" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 min-w-[100px]"
                    onClick={() => { setShowRegisterInfoDialog("email"); }}
                  >
                    <Mail className="w-4 h-4 mr-1" /> Email
                  </Button>
                  <Button
                    type="button"
                    variant={registerMode === "invite" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 min-w-[100px]"
                    onClick={() => { setShowRegisterInfoDialog("invite"); }}
                  >
                    <UserPlus className="w-4 h-4 mr-1" /> Undangan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[120px] sm:min-w-[100px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOrgRegisterDialog(true);
                    }}
                  >
                    <Building2 className="w-4 h-4 mr-1" /> Organisasi
                  </Button>
                </div>

                {/* Self Registration Mode */}
                {registerMode === "self" && (
                  <>
                    {selfRegStep === "email" && (
                      <form onSubmit={handleSendSelfRegOTP} className="space-y-4">
                        <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                          Daftar dengan email, lalu masukkan kode undangan nanti di dashboard.
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="self-reg-email">Email Aktif</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="self-reg-email"
                              type="email"
                              placeholder="email@example.com"
                              value={selfRegEmail}
                              onChange={(e) => setSelfRegEmail(e.target.value)}
                              className="pl-10"
                              disabled={isLoading}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Captcha: Berapa hasil dari {selfRegCaptcha.question} ?</Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder="Jawaban"
                              value={selfRegCaptchaAnswer}
                              onChange={(e) => setSelfRegCaptchaAnswer(e.target.value)}
                              disabled={isLoading}
                              className="flex-1"
                            />
                            <Button type="button" variant="outline" size="icon" onClick={refreshSelfRegCaptcha}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengirim OTP...</> : "Kirim Kode OTP"}
                        </Button>
                      </form>
                    )}

                    {selfRegStep === "otp" && (
                      <div className="space-y-4">
                        <button type="button" onClick={() => setSelfRegStep("email")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                          <ArrowLeft className="w-4 h-4" /> Kembali
                        </button>

                        <div className="text-center space-y-2">
                          <h3 className="font-semibold">Masukkan Kode OTP</h3>
                          <p className="text-sm text-muted-foreground">Kode OTP telah dikirim ke <strong>{selfRegMaskedEmail}</strong></p>
                        </div>

                        <SingleOTPInput ref={selfRegOtpRef} onChange={(v) => setSelfRegOtpValid(v.length === 6)} autoFocus />

                        <Button onClick={handleVerifySelfRegOTP} className="w-full" size="lg" disabled={!selfRegOtpValid}>
                          Verifikasi OTP
                        </Button>

                        <div className="text-center">
                          <Button variant="link" onClick={handleResendSelfRegOTP} disabled={isLoading} className="p-0 h-auto">
                            {isLoading ? "Mengirim..." : "Kirim Ulang OTP"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {selfRegStep === "profile" && (
                      <form onSubmit={handleCompleteSelfReg} className="space-y-4">
                        <button type="button" onClick={() => setSelfRegStep("otp")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                          <ArrowLeft className="w-4 h-4" /> Kembali
                        </button>

                        <div className="text-center space-y-2">
                          <h3 className="font-semibold">Lengkapi Profil</h3>
                          <p className="text-sm text-muted-foreground">Email: {selfRegEmail}</p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="self-reg-name">Nama Lengkap *</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="self-reg-name"
                              type="text"
                              placeholder="Nama lengkap Anda"
                              value={selfRegName}
                              onChange={(e) => setSelfRegName(e.target.value)}
                              className="pl-10"
                              disabled={isLoading}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="self-reg-whatsapp">No. WhatsApp</Label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="self-reg-whatsapp"
                              type="tel"
                              placeholder="08xxxxxxxxxx"
                              value={selfRegWhatsapp}
                              onChange={(e) => setSelfRegWhatsapp(e.target.value)}
                              className="pl-10"
                              disabled={isLoading}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="self-reg-address">Alamat</Label>
                          <div className="relative">
                            <MapPinIcon className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="self-reg-address"
                              type="text"
                              placeholder="Alamat tempat tinggal"
                              value={selfRegAddress}
                              onChange={(e) => setSelfRegAddress(e.target.value)}
                              className="pl-10"
                              disabled={isLoading}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="self-reg-password">Password *</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="self-reg-password"
                              type={showSelfRegPassword ? "text" : "password"}
                              placeholder="Minimal 6 karakter"
                              value={selfRegPassword}
                              onChange={(e) => setSelfRegPassword(e.target.value)}
                              className="pl-10 pr-10"
                              disabled={isLoading}
                            />
                            <button type="button" onClick={() => setShowSelfRegPassword(!showSelfRegPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                              {showSelfRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="self-reg-confirm-password">Konfirmasi Password *</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="self-reg-confirm-password"
                              type={showSelfRegConfirmPassword ? "text" : "password"}
                              placeholder="Ulangi password"
                              value={selfRegConfirmPassword}
                              onChange={(e) => setSelfRegConfirmPassword(e.target.value)}
                              className="pl-10 pr-10"
                              disabled={isLoading}
                            />
                            <button type="button" onClick={() => setShowSelfRegConfirmPassword(!showSelfRegConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                              {showSelfRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Mendaftar...</> : "Daftar Sekarang"}
                        </Button>
                      </form>
                    )}

                    {selfRegStep === "success" && (
                      <div className="text-center py-6 space-y-4">
                        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                          <CheckCircle2 className="w-8 h-8 text-success" />
                        </div>
                        <h3 className="font-semibold text-lg">Registrasi Berhasil!</h3>
                        <div className="p-3 bg-muted/50 rounded-lg text-sm text-left space-y-2">
                          <p className="font-medium">Langkah Selanjutnya:</p>
                          <p className="text-muted-foreground">
                            Akun Anda belum terhubung ke organisasi manapun. Agar dapat melakukan absensi, Anda perlu bergabung ke organisasi dengan cara:
                          </p>
                          <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                            <li>Login ke dashboard dengan akun yang baru dibuat</li>
                            <li>Masukkan <strong>kode undangan</strong> yang diberikan oleh admin organisasi Anda</li>
                            <li>Lengkapi profil yang diminta setelah bergabung</li>
                          </ol>
                          <p className="text-xs text-muted-foreground italic">
                            Hubungi admin organisasi Anda jika belum memiliki kode undangan.
                          </p>
                        </div>
                        <Button onClick={() => { resetSelfRegState(); setActiveTab("login"); setEmail(selfRegEmail); }} className="w-full">
                          Login Sekarang
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* Invite Registration Mode */}
                {registerMode === "invite" && (
                  <form onSubmit={handleRegisterWithInvite} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-code">Kode Undangan</Label>
                      <div className="relative">
                        <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="invite-code"
                          type="text"
                          placeholder="Masukkan kode undangan"
                          value={invitationCode}
                          onChange={(e) => setInvitationCode(e.target.value)}
                          className="pl-10"
                          disabled={isLoading}
                        />
                      </div>
                      {!invitationData && invitationCode && (
                        <Button type="button" variant="outline" size="sm" onClick={fetchInvitation}>
                          Verifikasi Kode
                        </Button>
                      )}
                    </div>

                    {invitationData && (
                      <>
                        <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                          <p className="text-sm font-medium text-success">Undangan Valid!</p>
                          <p className="text-sm text-muted-foreground">
                            Organisasi: {invitationData.tenants?.name}
                          </p>
                        </div>

                        {/* Nama Lengkap */}
                        <div className="space-y-2">
                          <Label htmlFor="invite-reg-name">Nama Lengkap *</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="invite-reg-name"
                              type="text"
                              placeholder="Nama lengkap Anda"
                              value={inviteRegName}
                              onChange={(e) => setInviteRegName(e.target.value)}
                              className="pl-10"
                              disabled={isLoading}
                            />
                          </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                          <Label htmlFor="invite-reg-email">Email Aktif *</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="invite-reg-email"
                              type="email"
                              placeholder="email@example.com"
                              value={inviteRegEmail}
                              onChange={(e) => setInviteRegEmail(e.target.value)}
                              className="pl-10"
                              disabled={isLoading}
                            />
                          </div>
                        </div>

                        {/* WhatsApp */}
                        <div className="space-y-2">
                          <Label htmlFor="invite-reg-whatsapp">No. WhatsApp</Label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="invite-reg-whatsapp"
                              type="tel"
                              placeholder="08xxxxxxxxxx"
                              value={inviteRegWhatsapp}
                              onChange={(e) => setInviteRegWhatsapp(e.target.value)}
                              className="pl-10"
                              disabled={isLoading}
                            />
                          </div>
                        </div>

                        {/* Alamat */}
                        <div className="space-y-2">
                          <Label htmlFor="invite-reg-address">Alamat</Label>
                          <div className="relative">
                            <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="invite-reg-address"
                              type="text"
                              placeholder="Alamat tempat tinggal"
                              value={inviteRegAddress}
                              onChange={(e) => setInviteRegAddress(e.target.value)}
                              className="pl-10"
                              disabled={isLoading}
                            />
                          </div>
                        </div>

                        {/* Password */}
                        <div className="space-y-2">
                          <Label htmlFor="reg-password">Password Baru *</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="reg-password"
                              type={showInviteRegPassword ? "text" : "password"}
                              placeholder="Minimal 6 karakter"
                              value={registerPassword}
                              onChange={(e) => setRegisterPassword(e.target.value)}
                              className="pl-10 pr-10"
                              disabled={isLoading}
                            />
                            <button 
                              type="button" 
                              onClick={() => setShowInviteRegPassword(!showInviteRegPassword)} 
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showInviteRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Konfirmasi Password */}
                        <div className="space-y-2">
                          <Label htmlFor="reg-confirm">Konfirmasi Password *</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="reg-confirm"
                              type={showInviteRegConfirmPassword ? "text" : "password"}
                              placeholder="Ulangi password"
                              value={registerConfirmPassword}
                              onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                              className="pl-10 pr-10"
                              disabled={isLoading}
                            />
                            <button 
                              type="button" 
                              onClick={() => setShowInviteRegConfirmPassword(!showInviteRegConfirmPassword)} 
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showInviteRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Captcha */}
                        <div className="space-y-2">
                          <Label>Captcha: Berapa hasil dari {registerCaptcha.question} ?</Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder="Jawaban"
                              value={registerCaptchaAnswer}
                              onChange={(e) => setRegisterCaptchaAnswer(e.target.value)}
                              disabled={isLoading}
                              className="flex-1"
                            />
                            <Button type="button" variant="outline" size="icon" onClick={refreshRegisterCaptcha}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Mendaftar...</> : "Daftar Sekarang"}
                        </Button>
                      </>
                    )}

                    <div className="text-center text-sm text-muted-foreground">
                      <p>Belum punya kode undangan?</p>
                      <p>Hubungi admin organisasi Anda.</p>
                    </div>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-primary-foreground/50 mt-6">
          © 2026 AbsensiKu. All rights reserved.
        </p>
      </div>

      {/* Dialog Overlay penjelasan tab Daftar */}
      <Dialog open={!!showRegisterInfoDialog} onOpenChange={(open) => { if (!open) setShowRegisterInfoDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {showRegisterInfoDialog === "email" ? <Mail className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
              {showRegisterInfoDialog === "email" ? "Daftar via Email" : "Daftar via Undangan"}
            </DialogTitle>
            <DialogDescription>
              Pendaftaran ini ditujukan untuk <strong>pegawai/karyawan</strong> yang akan menggunakan sistem absensi.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {showRegisterInfoDialog === "email" ? (
              <div className="p-3 bg-muted rounded-lg text-sm space-y-2">
                <p className="font-medium">📋 Pendaftaran Mandiri via Email</p>
                <p className="text-muted-foreground">
                  Gunakan metode ini jika Anda ingin mendaftar terlebih dahulu menggunakan email pribadi. Setelah registrasi berhasil:
                </p>
                <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                  <li>Anda akan menerima <strong>kode OTP</strong> di email untuk verifikasi</li>
                  <li>Setelah login, Anda perlu memasukkan <strong>kode undangan</strong> dari admin organisasi Anda di dashboard</li>
                  <li>Setelah bergabung ke organisasi, Anda dapat mulai melakukan absensi</li>
                </ol>
                <p className="text-xs text-muted-foreground italic mt-2">
                  ⚠️ Tanpa bergabung ke organisasi, Anda hanya bisa melihat dashboard kosong.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-muted rounded-lg text-sm space-y-2">
                <p className="font-medium">🎫 Pendaftaran via Kode Undangan</p>
                <p className="text-muted-foreground">
                  Gunakan metode ini jika admin organisasi Anda sudah memberikan <strong>kode undangan</strong>. Dengan metode ini:
                </p>
                <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                  <li>Masukkan kode undangan yang diberikan admin</li>
                  <li>Data Anda (nama, email, WhatsApp) akan terisi otomatis dari undangan</li>
                  <li>Akun Anda langsung terhubung ke organisasi setelah registrasi</li>
                  <li>Anda bisa langsung mulai melakukan absensi</li>
                </ol>
                <p className="text-xs text-muted-foreground italic mt-2">
                  ✅ Metode tercepat karena Anda langsung tergabung ke organisasi.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowRegisterInfoDialog(null)} className="w-full sm:w-auto">
              Batal
            </Button>
            <Button
              onClick={() => {
                const mode = showRegisterInfoDialog;
                setShowRegisterInfoDialog(null);
                if (mode === "email") {
                  setRegisterMode("self");
                  resetSelfRegState();
                } else {
                  setRegisterMode("invite");
                  setInvitationData(null);
                }
              }}
              className="w-full sm:w-auto"
            >
              Lanjutkan Daftar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Overlay untuk Registrasi Organisasi */}
      <Dialog open={showOrgRegisterDialog} onOpenChange={setShowOrgRegisterDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Daftar Organisasi
            </DialogTitle>
            <DialogDescription>
              Anda akan dialihkan ke halaman pendaftaran organisasi baru. Pastikan Anda adalah perwakilan resmi dari organisasi yang akan didaftarkan.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-3 bg-muted rounded-lg text-sm space-y-2">
              <p className="font-medium">Dengan mendaftar, Anda dapat:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Mengelola absensi seluruh pegawai</li>
                <li>Membuat struktur organisasi dan OPD</li>
                <li>Mengundang dan mengelola pegawai</li>
                <li>Melihat laporan kehadiran lengkap</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowOrgRegisterDialog(false)}
              className="w-full sm:w-auto"
            >
              Batal
            </Button>
            <Button
              onClick={() => {
                setShowOrgRegisterDialog(false);
                navigate("/org/login?mode=register");
              }}
              className="w-full sm:w-auto"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Lanjutkan Daftar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
