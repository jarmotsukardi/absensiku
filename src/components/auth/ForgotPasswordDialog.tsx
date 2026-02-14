import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SingleOTPInput, { SingleOTPInputRef } from "@/components/common/SingleOTPInput";
import { useToast } from "@/hooks/use-toast";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { Key, Lock, Mail, MessageCircle, Loader2, ArrowLeft, RefreshCw, Eye, EyeOff, Phone, CheckCircle2, ShieldCheck } from "lucide-react";

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loginType: "org" | "admin" | "employee";
}

type Step = "choice" | "method" | "input" | "otp" | "newPassword" | "success";
type ActionType = "forgot" | "change";
type DeliveryMethod = "email" | "whatsapp";

export function ForgotPasswordDialog({ open, onOpenChange, loginType }: ForgotPasswordDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("choice");
  const [actionType, setActionType] = useState<ActionType>("forgot");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("email");
  const [emailValue, setEmailValue] = useState("");
  const [whatsappValue, setWhatsappValue] = useState("");
  const [maskedTarget, setMaskedTarget] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [validatedName, setValidatedName] = useState("");
  const [otpValid, setOtpValid] = useState(false);
  const [verifiedOtp, setVerifiedOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const otpRef = useRef<SingleOTPInputRef>(null);

  const maskedEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    const parts = trimmed.split("@");
    if (parts.length !== 2) return trimmed;
    const [local, domain] = parts;
    if (local.length <= 2) return `${local[0] || ""}***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  };

  const createErrorDescription = (message: string, localLogId: string, backendTraceId?: string) => {
    const withBackendRef = appendErrorReference(message, backendTraceId);
    return `${withBackendRef} [Log: ${localLogId}]`;
  };

  const handleOtpChange = useCallback((value: string) => {
    setOtpValid(value.length === 6);
    setVerifiedOtp(value);
  }, []);

  const reset = () => {
    setStep("choice");
    setActionType("forgot");
    setDeliveryMethod("email");
    setEmailValue("");
    setWhatsappValue("");
    setMaskedTarget("");
    setOtpValid(false);
    setVerifiedOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setIsValidated(false);
    setValidatedName("");
    otpRef.current?.clear();
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const validateInputs = (): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^(\+?62|0)[0-9]{8,13}$/;

    if (!emailValue.trim()) {
      toast({ variant: "destructive", title: "Alamat email wajib diisi" });
      return false;
    }
    if (!emailRegex.test(emailValue.trim())) {
      toast({ variant: "destructive", title: "Format email tidak valid" });
      return false;
    }
    if (!whatsappValue.trim()) {
      toast({ variant: "destructive", title: "No. WhatsApp wajib diisi" });
      return false;
    }
    if (!phoneRegex.test(whatsappValue.trim().replace(/[\s-]/g, ""))) {
      toast({ variant: "destructive", title: "Format no. WhatsApp tidak valid", description: "Contoh: 081234567890 atau 6281234567890" });
      return false;
    }
    return true;
  };

  // Validate email + whatsapp match against DB
  const handleValidate = async () => {
    if (!validateInputs()) return;

    setIsValidating(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            email: emailValue.trim().toLowerCase(),
            whatsapp: whatsappValue.trim(),
            validate_only: true,
            login_type: loginType,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(appendErrorReference(result.error || "Data tidak valid", result.trace_id));
      }

      setIsValidated(true);
      setValidatedName(result.name || "");
      toast({
        title: "✅ Data Tervalidasi",
        description: `Email dan No. WhatsApp cocok${result.name ? ` (${result.name})` : ""}. Silakan lanjutkan.`,
      });
    } catch (err: any) {
      setIsValidated(false);
      const logId = reportError(err, "ForgotPasswordDialog.handleValidate", {
        loginType,
        actionType,
        deliveryMethod,
        email: maskedEmail(emailValue),
      });
      toast({
        variant: "destructive",
        title: "Validasi Gagal",
        description: createErrorDescription(err.message || "Data tidak valid", logId),
      });
    } finally {
      setIsValidating(false);
    }
  };

  // For "Lupa Password" - send new password directly
  const handleSendNewPassword = async () => {
    if (!validateInputs()) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            email: emailValue.trim().toLowerCase(),
            whatsapp: whatsappValue.trim(),
            method: deliveryMethod,
            login_type: loginType,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(appendErrorReference(result.error || "Gagal mengirim password baru", result.trace_id));
      }

      setStep("success");
      toast({
        title: "Password Baru Terkirim!",
        description: deliveryMethod === "whatsapp"
          ? "Periksa pesan WhatsApp Anda untuk password baru"
          : "Periksa email Anda untuk password baru",
      });
    } catch (err: any) {
      const logId = reportError(err, "ForgotPasswordDialog.handleSendNewPassword", {
        loginType,
        actionType,
        deliveryMethod,
        email: maskedEmail(emailValue),
      });
      toast({
        variant: "destructive",
        title: "Gagal",
        description: createErrorDescription(err.message || "Gagal mengirim password baru", logId),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // For "Ganti Password" - send OTP then change
  const handleSendOTP = async () => {
    if (!validateInputs()) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            email: emailValue.trim().toLowerCase(),
            whatsapp: whatsappValue.trim(),
            method: deliveryMethod,
            purpose: "password_change",
            login_type: loginType,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(appendErrorReference(result.error || "Gagal mengirim OTP", result.trace_id));
      }

      setMaskedTarget(deliveryMethod === "email" ? (result.email || emailValue) : (result.whatsapp || whatsappValue));
      setVerifiedOtp("");
      setOtpValid(false);
      setStep("otp");
      toast({
        title: "Kode OTP Terkirim",
        description: deliveryMethod === "whatsapp"
          ? "Periksa pesan WhatsApp Anda"
          : "Periksa email Anda (berlaku 10 menit)",
      });
    } catch (err: any) {
      const logId = reportError(err, "ForgotPasswordDialog.handleSendOTP", {
        loginType,
        actionType,
        deliveryMethod,
        email: maskedEmail(emailValue),
      });
      toast({
        variant: "destructive",
        title: "Gagal",
        description: createErrorDescription(err.message || "Gagal mengirim OTP", logId),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueToNewPassword = () => {
    const otpValue = otpRef.current?.getValue() || verifiedOtp;
    if (otpValue.length !== 6) {
      toast({ variant: "destructive", title: "Kode OTP tidak lengkap" });
      return;
    }
    setVerifiedOtp(otpValue);
    setStep("newPassword");
  };

  const handleVerifyAndReset = async () => {
    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "Password tidak cocok" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ variant: "destructive", title: "Password minimal 6 karakter" });
      return;
    }

    const otpValue = verifiedOtp;
    if (otpValue.length !== 6) {
      toast({ variant: "destructive", title: "Kode OTP tidak lengkap" });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-password-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            email: emailValue.trim().toLowerCase(),
            whatsapp: whatsappValue.trim(),
            otp: otpValue,
            newPassword,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        if (result.code === "INVALID_OTP") {
          toast({ variant: "destructive", title: "Kode OTP tidak valid" });
          setStep("otp");
          otpRef.current?.clear();
          setOtpValid(false);
          setVerifiedOtp("");
          return;
        }
        throw new Error(appendErrorReference(result.error || "Gagal reset password", result.trace_id));
      }

      setStep("success");
      toast({ title: "Password berhasil diubah!" });
    } catch (err: any) {
      const logId = reportError(err, "ForgotPasswordDialog.handleVerifyAndReset", {
        loginType,
        actionType,
        deliveryMethod,
        email: maskedEmail(emailValue),
      });
      toast({
        variant: "destructive",
        title: "Gagal",
        description: createErrorDescription(err.message || "Gagal reset password", logId),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            {step === "choice" ? "Pilih Aksi" :
             step === "method" ? "Metode Pengiriman" :
             step === "input" ? (actionType === "forgot" ? "Lupa Password" : "Ganti Password") :
             step === "otp" ? "Verifikasi OTP" :
             step === "newPassword" ? "Password Baru" :
             "Berhasil!"}
          </DialogTitle>
          <DialogDescription>
            {step === "choice" && "Pilih tindakan yang ingin Anda lakukan"}
            {step === "method" && "Pilih metode pengiriman"}
            {step === "input" && actionType === "forgot" && `Masukkan email dan no. WhatsApp terdaftar. Password baru akan dikirim via ${deliveryMethod === "email" ? "email" : "WhatsApp"}.`}
            {step === "input" && actionType === "change" && `Masukkan email dan no. WhatsApp terdaftar. Kode OTP akan dikirim via ${deliveryMethod === "email" ? "email" : "WhatsApp"}.`}
            {step === "otp" && `Kode OTP telah dikirim via ${deliveryMethod === "whatsapp" ? "WhatsApp" : "Email"}`}
            {step === "newPassword" && "Masukkan password baru Anda"}
            {step === "success" && (actionType === "forgot" ? "Password baru telah dikirim!" : "Password berhasil diperbarui")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step 1: Choice */}
          {step === "choice" && (
            <div className="space-y-3">
              <button
                className="w-full p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent transition-all text-left"
                onClick={() => { setActionType("forgot"); setStep("method"); }}
              >
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold text-sm">Lupa Password</p>
                    <p className="text-xs text-muted-foreground">Password baru akan langsung dikirim ke email/WhatsApp Anda</p>
                  </div>
                </div>
              </button>
              <button
                className="w-full p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent transition-all text-left"
                onClick={() => { setActionType("change"); setStep("method"); }}
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold text-sm">Ganti Password</p>
                    <p className="text-xs text-muted-foreground">Ubah password via verifikasi OTP</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Step 2: Method */}
          {step === "method" && (
            <div className="space-y-3">
              <button
                className="w-full p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent transition-all text-left"
                onClick={() => { setDeliveryMethod("email"); setStep("input"); }}
              >
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="font-semibold text-sm">Via Email</p>
                    <p className="text-xs text-muted-foreground">
                      {actionType === "forgot" ? "Password baru dikirim ke email" : "Kode OTP dikirim ke email"}
                    </p>
                  </div>
                </div>
              </button>
              <button
                className="w-full p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-accent transition-all text-left"
                onClick={() => { setDeliveryMethod("whatsapp"); setStep("input"); }}
              >
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-semibold text-sm">Via WhatsApp</p>
                    <p className="text-xs text-muted-foreground">
                      {actionType === "forgot" ? "Password baru dikirim ke WhatsApp" : "Kode OTP dikirim ke WhatsApp"}
                    </p>
                  </div>
                </div>
              </button>
              <Button variant="ghost" size="sm" onClick={() => setStep("choice")} className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
              </Button>
            </div>
          )}

          {/* Step 3: Input - BOTH email AND whatsapp fields */}
          {step === "input" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Alamat Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="email@organisasi.go.id"
                    value={emailValue}
                    onChange={(e) => { setEmailValue(e.target.value); setIsValidated(false); }}
                    className="pl-10"
                    disabled={isValidating}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>No. WhatsApp</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="6281234567890"
                    value={whatsappValue}
                    onChange={(e) => { setWhatsappValue(e.target.value); setIsValidated(false); }}
                    className="pl-10"
                    disabled={isValidating}
                  />
                </div>
              </div>

              {/* Validation result */}
              {isValidated && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-green-700 dark:text-green-300">Data Tervalidasi</p>
                    {validatedName && <p className="text-green-600 dark:text-green-400 text-xs">Nama: {validatedName}</p>}
                  </div>
                </div>
              )}

              <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
                {deliveryMethod === "email" 
                  ? `${actionType === "forgot" ? "Password baru" : "Kode OTP"} akan dikirim ke alamat email di atas.`
                  : `${actionType === "forgot" ? "Password baru" : "Kode OTP"} akan dikirim ke no. WhatsApp di atas.`}
              </div>

              {/* Step 1: Validate first */}
              {!isValidated ? (
                <Button
                  onClick={handleValidate}
                  disabled={isValidating}
                  variant="outline"
                  className="w-full"
                >
                  {isValidating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  Validasi Data
                </Button>
              ) : (
                <Button
                  onClick={actionType === "forgot" ? handleSendNewPassword : handleSendOTP}
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {actionType === "forgot" ? "Kirim Password Baru" : "Kirim Kode OTP"}
                </Button>
              )}

              <Button variant="ghost" size="sm" onClick={() => { setStep("method"); setIsValidated(false); }} className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
              </Button>
            </div>
          )}

          {/* Step 4: OTP (only for "change" action) */}
          {step === "otp" && (
            <div className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Kode dikirim ke <span className="font-medium text-foreground">{maskedTarget}</span>
              </p>
              <SingleOTPInput ref={otpRef} onChange={handleOtpChange} autoFocus />
              <Button onClick={handleContinueToNewPassword} disabled={!otpValid} className="w-full">
                Verifikasi
              </Button>
              <div className="flex items-center justify-center">
                <Button variant="ghost" size="sm" onClick={handleSendOTP} disabled={isLoading}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Kirim Ulang
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: New Password (only for "change" action) */}
          {step === "newPassword" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Password Baru</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 pr-10"
                    placeholder="Minimal 6 karakter"
                  />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Konfirmasi Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10"
                    placeholder="Ulangi password baru"
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button onClick={handleVerifyAndReset} disabled={isLoading} className="w-full">
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Simpan Password Baru
              </Button>
            </div>
          )}

          {/* Step 6: Success */}
          {step === "success" && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <Key className="w-8 h-8 text-green-600" />
              </div>
              <p className="font-semibold">
                {actionType === "forgot" ? "Password Baru Telah Dikirim!" : "Password Berhasil Diubah!"}
              </p>
              <p className="text-sm text-muted-foreground">
                {actionType === "forgot"
                  ? `Periksa ${deliveryMethod === "whatsapp" ? "WhatsApp" : "email"} Anda untuk password baru. Silakan login dengan password tersebut.`
                  : "Silakan login dengan password baru Anda."}
              </p>
              <Button onClick={() => handleClose(false)} className="w-full">Tutup</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
