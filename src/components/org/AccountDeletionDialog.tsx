import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, AlertTriangle, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import SingleOTPInput, { SingleOTPInputRef } from "@/components/common/SingleOTPInput";
import { resolveOrgTenantId } from "@/lib/orgTenantContext";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

const WORDS_POOL = [
  "hapus", "akun", "saya", "yakin", "setuju", "konfirmasi", "permanen", "mengerti",
  "paham", "lanjut", "proses", "benar", "akhiri", "tutup", "batalkan"
];

function generatePhrase(): string {
  const shuffled = [...WORDS_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).join(" ");
}

export function AccountDeletionDialog() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"otp" | "phrase">("otp");
  const [requiredPhrase, setRequiredPhrase] = useState("");
  const [typedPhrase, setTypedPhrase] = useState("");
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // OTP states
  const [otpSent, setOtpSent] = useState(false);
  const [otpValid, setOtpValid] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [orgEmail, setOrgEmail] = useState("");
  const [orgWhatsapp, setOrgWhatsapp] = useState("");
  const otpRef = useRef<SingleOTPInputRef>(null);

  const handleOtpChange = useCallback((value: string) => {
    setOtpValid(value.length === 6);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStep("otp");
      setOtpSent(false);
      setOtpValid(false);
      setTypedPhrase("");
      setRequiredPhrase(generatePhrase());
      otpRef.current?.clear();
      // Fetch org email/whatsapp
      fetchOrgContact();
    }
  }, [isOpen]);

  const fetchOrgContact = async () => {
    try {
      const tenantId = await resolveOrgTenantId();
      if (tenantId) {
        const { data: tenant, error } = await supabase
          .from("tenants")
          .select("email, whatsapp")
          .eq("id", tenantId)
          .single();
        if (error) throw error;
        setOrgEmail(tenant?.email || "");
        setOrgWhatsapp(tenant?.whatsapp || "");
      }
    } catch (error) {
      const errorRef = reportError(error, "org.account_deletion.fetch_org_contact");
      toast.error(appendErrorReference("Gagal memuat kontak organisasi", errorRef));
    }
  };

  const handleSendOtp = async () => {
    if (!orgEmail && !orgWhatsapp) {
      toast.error("Email dan WhatsApp organisasi tidak ditemukan.");
      return;
    }
    setIsSendingOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-billing-mode-otp", {
        body: { email: orgEmail, whatsapp: orgWhatsapp },
      });
      if (error) throw error;
      if (data.demo_otp) {
        toast.info(`[DEMO] Kode OTP: ${data.demo_otp}`);
      } else {
        toast.success("Kode OTP telah dikirim");
      }
      setOtpSent(true);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Coba lagi";
      toast.error("Gagal mengirim OTP: " + errorMessage);
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otpCode = otpRef.current?.getValue() || "";
    if (otpCode.length !== 6) {
      toast.error("Masukkan 6 digit kode OTP");
      return;
    }
    setIsVerifyingOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-billing-mode-otp", {
        body: { email: orgEmail, otp: otpCode },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Kode OTP tidak valid");
        return;
      }
      toast.success("OTP terverifikasi");
      setStep("phrase");
    } catch (error: unknown) {
      toast.error("Gagal verifikasi OTP");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Block paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    toast.error("Copy-paste tidak diperbolehkan. Silakan ketik manual.");
  }, []);

  const isPhraseMatch = typedPhrase.trim().toLowerCase() === requiredPhrase.toLowerCase();

  const handleProceed = () => {
    if (!isPhraseMatch) {
      toast.error("Frasa tidak cocok. Silakan ketik ulang dengan benar.");
      return;
    }
    setShowFinalConfirm(true);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Sesi tidak valid");

      const { data: emp } = await supabase
        .from("employees")
        .select("id, tenant_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (emp?.tenant_id) {
        await supabase.from("tenants").update({ is_active: false }).eq("id", emp.tenant_id);
        await supabase.from("employees").update({ is_active: false }).eq("tenant_id", emp.tenant_id);
      }

      await supabase.from("audit_logs").insert({
        action: "ACCOUNT_DELETION_REQUEST",
        table_name: "tenants",
        record_id: emp?.tenant_id || null,
        user_id: session.user.id,
        new_values: { reason: "User requested account deletion", phrase_confirmed: true, otp_verified: true },
      });

      await supabase.auth.signOut();
      toast.success("Akun Anda telah dinonaktifkan. Hubungi admin jika ingin mengaktifkan kembali.");
      navigate("/", { replace: true });
    } catch (error: unknown) {
      const errorRef = reportError(error, "org.account_deletion.handle_delete");
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(appendErrorReference("Gagal memproses penghapusan: " + errorMessage, errorRef));
    } finally {
      setIsDeleting(false);
      setShowFinalConfirm(false);
      setIsOpen(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" className="gap-2">
            <Trash2 className="w-4 h-4" />
            Hapus Akun
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Hapus Akun Organisasi
            </DialogTitle>
            <DialogDescription>
              {step === "otp"
                ? "Untuk keamanan, verifikasi identitas Anda terlebih dahulu melalui OTP."
                : "Ketik frasa berikut secara manual (tanpa copy-paste) untuk melanjutkan."}
            </DialogDescription>
          </DialogHeader>

          {step === "otp" && (
            <div className="space-y-4 py-4">
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-destructive">
                    Tindakan ini akan menonaktifkan seluruh akun organisasi. Verifikasi OTP diperlukan.
                  </p>
                </div>
              </div>

              {!otpSent ? (
                <Button onClick={handleSendOtp} disabled={isSendingOtp} className="w-full">
                  {isSendingOtp ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Mengirim OTP...</>
                  ) : (
                    "Kirim Kode OTP"
                  )}
                </Button>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-center text-muted-foreground">
                    Masukkan 6 digit kode OTP
                  </p>
                  <SingleOTPInput ref={otpRef} onChange={handleOtpChange} autoFocus />
                  <Button variant="link" size="sm" onClick={handleSendOtp} disabled={isSendingOtp} className="w-full">
                    Kirim ulang kode
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "phrase" && (
            <div className="space-y-4 py-4">
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-center">
                <p className="text-lg font-mono font-bold text-destructive tracking-wider select-none" style={{ userSelect: "none" }}>
                  {requiredPhrase}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Ketik frasa di atas:</Label>
                <Input
                  value={typedPhrase}
                  onChange={(e) => setTypedPhrase(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="Ketik frasa secara manual..."
                  className={isPhraseMatch ? "border-green-500" : ""}
                  autoComplete="off"
                  spellCheck={false}
                />
                {typedPhrase && !isPhraseMatch && (
                  <p className="text-xs text-destructive">Frasa belum cocok</p>
                )}
                {isPhraseMatch && (
                  <p className="text-xs text-green-600">✓ Frasa cocok</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Batal</Button>
            {step === "otp" && otpSent && (
              <Button variant="destructive" onClick={handleVerifyOtp} disabled={!otpValid || isVerifyingOtp}>
                {isVerifyingOtp ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verifikasi...</> : "Verifikasi OTP"}
              </Button>
            )}
            {step === "phrase" && (
              <Button variant="destructive" onClick={handleProceed} disabled={!isPhraseMatch}>
                Lanjutkan
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showFinalConfirm} onOpenChange={setShowFinalConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Akhir</AlertDialogTitle>
            <AlertDialogDescription>
              Akun Anda akan dinonaktifkan. Data tidak akan dihapus secara permanen dan dapat diaktifkan kembali oleh Super Admin. Yakin ingin melanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Memproses...</> : "OK, Hapus Akun"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
