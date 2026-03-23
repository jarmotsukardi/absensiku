import { useState, useEffect, useCallback, memo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";
import { toast } from "sonner";
import { Loader2, Smartphone, Lock, AlertTriangle, Mail, RotateCcw, Eye, EyeOff } from "lucide-react";
import SingleOTPInput, { SingleOTPInputRef } from "@/components/common/SingleOTPInput";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

// Custom Password Input component - FULLY UNCONTROLLED untuk mencegah flicker
const PasswordInput = memo(function PasswordInput({
  id,
  placeholder,
  disabled,
  inputRef,
}: {
  id: string;
  placeholder?: string;
  disabled?: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const [showPassword, setShowPassword] = useState(false);

  const toggleVisibility = useCallback(() => {
    setShowPassword(prev => !prev);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [inputRef]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full h-10 px-3 pr-10 border border-input rounded-md 
                   focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
                   disabled:opacity-50 disabled:cursor-not-allowed
                   bg-background text-foreground placeholder:text-muted-foreground"
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={toggleVisibility}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
      >
        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

interface DeviceResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeEmail: string;
  currentResetCount: number;
  maxResetCount: number;
  requirePasswordChange: boolean;
  onSuccess: () => void;
}

export function DeviceResetDialog({
  open,
  onOpenChange,
  employeeId,
  employeeEmail,
  currentResetCount,
  maxResetCount,
  requirePasswordChange,
  onSuccess,
}: DeviceResetDialogProps) {
  const withTrace = (message: string, traceId?: string) =>
    traceId ? `${message} (Ref: ${traceId})` : message;
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
  };
  const parseHttpError = async (
    response: Response
  ): Promise<{ message: string; traceId?: string; code?: string; retryAfterSeconds?: number }> => {
    try {
      const body = await response.clone().json();
      const message = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      const traceId = typeof body?.trace_id === "string" ? body.trace_id : undefined;
      const code = typeof body?.code === "string" ? body.code : undefined;
      const retryAfterSeconds = typeof body?.retry_after_seconds === "number" ? body.retry_after_seconds : undefined;
      return { message, traceId, code, retryAfterSeconds };
    } catch {
      const message = (await response.clone().text()) || `HTTP ${response.status}`;
      return { message };
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"otp" | "password">("otp");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpValid, setOtpValid] = useState(false);
  const [lastBackendTrace, setLastBackendTrace] = useState<string | null>(null);
  const [lastBackendErrorCode, setLastBackendErrorCode] = useState<string | null>(null);
  const [lastBackendRetryAfter, setLastBackendRetryAfter] = useState<number | null>(null);
  
  // Simpan OTP value yang sudah diverifikasi agar bisa digunakan di step password
  const [verifiedOtp, setVerifiedOtp] = useState<string>("");
  
  // Refs untuk uncontrolled inputs - TIDAK ADA useState untuk nilai input
  const otpInputRef = useRef<SingleOTPInputRef>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const [effectiveResetCount, setEffectiveResetCount] = useState(currentResetCount);
  const [employeeRecoveryPhone, setEmployeeRecoveryPhone] = useState<string | null>(null);

  const normalizePhone = (value: string) => {
    const digits = (value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("62")) return digits;
    if (digits.startsWith("0")) return `62${digits.slice(1)}`;
    return digits;
  };

  const checkMonthlyReset = useCallback(async () => {
    try {
      const { data: empData } = await supabase
        .from("employees")
        .select("device_id_last_reset, device_id_reset_count, phone, whatsapp")
        .eq("id", employeeId)
        .maybeSingle();

      const recoveryPhone = normalizePhone(
        String(empData?.phone || empData?.whatsapp || "")
      );
      setEmployeeRecoveryPhone(recoveryPhone || null);

      if (empData?.device_id_last_reset) {
        const lastReset = new Date(empData.device_id_last_reset);
        const now = new Date();
        
        if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
          setEffectiveResetCount(0);
        } else {
          setEffectiveResetCount(empData.device_id_reset_count || 0);
        }
      } else {
        setEffectiveResetCount(currentResetCount);
      }
    } catch (error) {
      const ref = reportError(error, "employee.device_reset.check_monthly_reset", {
        employee_id: employeeId,
      });
      console.error(`[DeviceResetDialog ${ref}] Error checking monthly reset:`, error);
      setEffectiveResetCount(currentResetCount);
    }
  }, [employeeId, currentResetCount]);

  useEffect(() => {
    if (open) {
      // Reset state saat dialog dibuka
      setStep("otp");
      setOtpSent(false);
      setOtpValid(false);
      setLastBackendTrace(null);
      setLastBackendErrorCode(null);
      setLastBackendRetryAfter(null);
      setVerifiedOtp(""); // Reset verified OTP
      
      // Clear refs
      setTimeout(() => {
        otpInputRef.current?.clear();
        if (newPasswordRef.current) newPasswordRef.current.value = "";
        if (confirmPasswordRef.current) confirmPasswordRef.current.value = "";
      }, 100);
      
      void checkMonthlyReset();
    }
  }, [open, checkMonthlyReset]);

  const remainingResets = Math.max(0, maxResetCount - effectiveResetCount);
  const canReset = remainingResets > 0;

  const handleSendOtp = async () => {
    if (!employeeEmail) {
      toast.error("Email tidak ditemukan. Hubungi admin.");
      return;
    }
    if (!employeeRecoveryPhone) {
      toast.error("No. HP/WhatsApp pegawai belum terdaftar. Hubungi admin organisasi.");
      return;
    }

    setIsSendingOtp(true);
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/send-password-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabasePublishableKey,
          },
          body: JSON.stringify({
            email: employeeEmail.trim(),
            whatsapp: employeeRecoveryPhone,
            method: "email",
            login_type: "employee",
          }),
        }
      );

      if (!response.ok) {
        const parsed = await parseHttpError(response);
        setLastBackendTrace(parsed.traceId || null);
        setLastBackendErrorCode(parsed.code || null);
        setLastBackendRetryAfter(parsed.retryAfterSeconds || null);
        const baseMessage = response.status === 429
          ? `Terlalu banyak permintaan OTP. ${parsed.message}`
          : parsed.message || "Gagal mengirim OTP";
        const errMessage = withTrace(baseMessage, parsed.traceId);
        throw new Error(errMessage);
      }

      setLastBackendTrace(null);
      setLastBackendErrorCode(null);
      setLastBackendRetryAfter(null);
      setOtpSent(true);
      toast.success("Kode OTP terkirim ke email Anda");
    } catch (error: unknown) {
      const logRef = reportError(error, "employee.device_reset.send_otp", {
        employee_id: employeeId,
        employee_email: employeeEmail,
      });
      toast.error(appendErrorReference(getErrorMessage(error) || "Gagal mengirim OTP", logRef));
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Callback saat OTP lengkap 6 digit
  const handleOtpComplete = useCallback((value: string) => {
    setOtpValid(value.length === 6);
  }, []);

  // Callback saat OTP berubah
  const handleOtpChange = useCallback((value: string) => {
    setOtpValid(value.length === 6);
  }, []);

  const handleVerifyOtpAndReset = async () => {
    const otpValue = otpInputRef.current?.getValue() || "";
    
    if (otpValue.length !== 6) {
      toast.error("Masukkan 6 digit kode OTP");
      return;
    }

    if (requirePasswordChange && step === "otp") {
      // Simpan OTP value untuk digunakan di step password
      // JANGAN verifikasi dulu - verifikasi dilakukan bersamaan dengan reset di step password
      setVerifiedOtp(otpValue);
      setStep("password");
      // Focus password input
      setTimeout(() => newPasswordRef.current?.focus(), 100);
      return;
    }

    // Jika tidak perlu password change, langsung reset
    await handleResetWithOtp(otpValue);
  };

  const handleResetWithOtp = async (otpToUse: string) => {
    const newPassword = newPasswordRef.current?.value || "";
    const confirmPassword = confirmPasswordRef.current?.value || "";
    const normalizedEmail = (employeeEmail || "").trim().toLowerCase();
    const normalizedOtp = (otpToUse || "").replace(/\D/g, "").slice(0, 6);

    if (requirePasswordChange) {
      if (!newPassword || !confirmPassword) {
        toast.error("Password baru dan konfirmasi wajib diisi");
        return;
      }
      if (newPassword.length < 6) {
        toast.error("Password minimal 6 karakter");
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error("Password baru dan konfirmasi tidak cocok");
        return;
      }
    }

    setIsLoading(true);
    try {
      // Generate device ID if not exists
      const currentDeviceId = localStorage.getItem("web_device_id") || (() => {
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
        const newId = `WEB-${Math.abs(hash).toString(16).toUpperCase().padStart(16, "0")}`;
        localStorage.setItem("web_device_id", newId);
        return newId;
      })();

      // Verify OTP dan update device/password dalam SATU panggilan.
      // Beberapa sesi mobile/webview bisa kedaluwarsa; lakukan retry dengan refresh session.
      const invokeVerifyDeviceOtp = async (accessToken?: string | null) => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "apikey": supabasePublishableKey,
        };
        if (accessToken) {
          headers["Authorization"] = `Bearer ${accessToken}`;
        }
        return fetch(
          `${supabaseUrl}/functions/v1/verify-device-otp`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              email: normalizedEmail,
              otp: normalizedOtp,
              newPassword: requirePasswordChange ? newPassword : undefined,
              employeeId: employeeId,
              newAndroidId: currentDeviceId,
            }),
          }
        );
      };

      const { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData?.session?.access_token || null;
      let response = await invokeVerifyDeviceOtp(accessToken);

      if (response.status === 401) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed?.session?.access_token) {
          accessToken = refreshed.session.access_token;
          response = await invokeVerifyDeviceOtp(accessToken);
        } else {
          // Fallback tanpa bearer untuk deployment yang verify_jwt=false
          response = await invokeVerifyDeviceOtp(null);
        }
      }

      if (!response.ok) {
        const parsed = await parseHttpError(response);
        setLastBackendTrace(parsed.traceId || null);
        setLastBackendErrorCode(parsed.code || null);
        setLastBackendRetryAfter(parsed.retryAfterSeconds || null);
        const rawMessage = parsed.message || "Gagal verifikasi OTP atau reset device";
        const normalizedMessage =
          response.status === 401 || /invalid jwt|unauthorized|not authenticated/i.test(rawMessage)
            ? "Sesi login kadaluarsa. Silakan login ulang."
            : rawMessage;
        throw new Error(withTrace(normalizedMessage, parsed.traceId));
      }

      const data = await response.json();
      if (!data?.success) {
        const traceId = typeof data?.trace_id === "string" ? data.trace_id : undefined;
        const code = typeof data?.code === "string" ? data.code : undefined;
        const retryAfter = typeof data?.retry_after_seconds === "number" ? data.retry_after_seconds : undefined;
        setLastBackendTrace(traceId || null);
        setLastBackendErrorCode(code || null);
        setLastBackendRetryAfter(retryAfter || null);
        throw new Error(withTrace(data?.error || "Gagal verifikasi OTP atau reset device", traceId));
      }

      setLastBackendTrace(null);
      setLastBackendErrorCode(null);
      setLastBackendRetryAfter(null);
      // NOTE: Jangan paksa update password via client di sini.
      // Saat reset device biasanya user belum punya session valid (atau session lama sudah invalid),
      // sehingga supabase.auth.updateUser() bisa gagal dengan "Session not found" dan membuat UX terlihat gagal,
      // padahal password sudah berhasil diubah via backend (admin API).

      toast.success("Device berhasil direset dan didaftarkan ke perangkat ini.");
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      const logRef = reportError(error, "employee.device_reset.verify_and_reset", {
        employee_id: employeeId,
        employee_email: employeeEmail,
      });
      toast.error(appendErrorReference(getErrorMessage(error) || "Gagal reset device ID", logRef));
    } finally {
      setIsLoading(false);
    }
  };

  // Fungsi handleReset untuk step password - gunakan verifiedOtp yang sudah disimpan
  const handleReset = async () => {
    // Gunakan verifiedOtp yang sudah disimpan dari step OTP
    await handleResetWithOtp(verifiedOtp);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Reset Device ID
          </DialogTitle>
          <DialogDescription>
            {step === "otp" ? "Verifikasi OTP dari email untuk reset perangkat" : "Buat password baru"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info Box */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sisa kesempatan reset bulan ini:</span>
              <span className={remainingResets <= 1 ? "text-destructive font-semibold" : "font-semibold"}>
                {remainingResets} dari {maxResetCount}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sudah dipakai bulan ini:</span>
              <span className="font-semibold">
                {effectiveResetCount} dari {maxResetCount}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Kuota reset bulanan akan di-refresh setiap tanggal 1.
            </p>
          </div>

          {lastBackendTrace && (
            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50/60 text-xs space-y-1">
              <p className="font-semibold text-amber-900">Debug Reset Device</p>
              <p className="text-amber-900">trace_id: {lastBackendTrace}</p>
              {lastBackendErrorCode && (
                <p className="text-amber-900">code: {lastBackendErrorCode}</p>
              )}
              {typeof lastBackendRetryAfter === "number" && lastBackendRetryAfter > 0 && (
                <p className="text-amber-900">
                  retry_after: {Math.ceil(lastBackendRetryAfter / 60)} menit
                </p>
              )}
            </div>
          )}

          {!canReset && (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Kuota Reset Habis</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Anda sudah mencapai batas maksimal reset bulan ini. Hubungi admin OPD atau Superadmin untuk mendapatkan tambahan 1 kesempatan reset.
                </p>
              </div>
            </div>
          )}

          {canReset && step === "otp" && (
            <>
              {!otpSent ? (
                <div className="p-4 bg-info/10 border border-info/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-4 w-4 text-info" />
                    <p className="text-sm font-medium">Verifikasi Email</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Kode OTP akan dikirim ke: <strong>{employeeEmail}</strong>
                  </p>
                  <Button 
                    onClick={handleSendOtp} 
                    disabled={isSendingOtp}
                    className="w-full"
                  >
                    {isSendingOtp ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Mengirim...
                      </>
                    ) : (
                      "Kirim Kode OTP"
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
                    <p className="text-sm text-success font-medium">
                      Kode OTP telah dikirim ke email Anda
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Masukkan Kode OTP</Label>
                    <SingleOTPInput
                      ref={otpInputRef}
                      onChange={handleOtpChange}
                      onComplete={handleOtpComplete}
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>

                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleSendOtp}
                    disabled={isSendingOtp}
                    className="w-full"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Kirim Ulang OTP
                  </Button>
                </div>
              )}
            </>
          )}

          {canReset && step === "password" && requirePasswordChange && (
            <>
              <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg flex items-start gap-3">
                <Lock className="h-5 w-5 text-warning mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning">Wajib Ganti Password</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Untuk keamanan, Anda harus mengganti password saat reset device.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Password Baru</Label>
                  <PasswordInput
                    id="new-password"
                    inputRef={newPasswordRef}
                    placeholder="Minimal 6 karakter"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Konfirmasi Password</Label>
                  <PasswordInput
                    id="confirm-password"
                    inputRef={confirmPasswordRef}
                    placeholder="Ulangi password baru"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          {canReset && step === "otp" && otpSent && (
            <Button
              onClick={handleVerifyOtpAndReset}
              disabled={isLoading || !otpValid}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Memproses...
                </>
              ) : requirePasswordChange ? (
                "Lanjut"
              ) : (
                "Reset Device"
              )}
            </Button>
          )}
          {canReset && step === "password" && (
            <Button
              onClick={handleReset}
              disabled={isLoading}
              variant="destructive"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Memproses...
                </>
              ) : (
                "Reset Device"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
