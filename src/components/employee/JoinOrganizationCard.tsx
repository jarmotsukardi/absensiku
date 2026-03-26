import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";
import { PENDING_INVITATION_CODE_STORAGE_KEY } from "@/lib/employeeAuthRoutes";

interface JoinOrganizationCardProps {
  onSuccess: () => void;
}

export function JoinOrganizationCard({ onSuccess }: JoinOrganizationCardProps) {
  const savedInvitationCode = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(PENDING_INVITATION_CODE_STORAGE_KEY)?.trim() || "";
  }, []);
  const hasSavedInvitationCode = Boolean(savedInvitationCode);
  const [invitationCode, setInvitationCode] = useState(savedInvitationCode);
  const [isLoading, setIsLoading] = useState(false);

  const handleJoinOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!invitationCode.trim()) {
      toast.error("Masukkan kode undangan");
      return;
    }

    setIsLoading(true);

    try {
      const normalizedInviteCode = invitationCode.trim();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Sesi tidak valid. Silakan login ulang.");
        return;
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/join-organization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": supabasePublishableKey,
          },
          body: JSON.stringify({ invitation_code: normalizedInviteCode }),
        }
      );

      const rawResult = await response.text();
      let result: Record<string, unknown> = {};
      try {
        result = rawResult ? JSON.parse(rawResult) : {};
      } catch {
        result = { message: rawResult };
      }

      if (!response.ok) {
        const code = String(result.code ?? "");
        const message = String(result.error ?? result.message ?? "");
        const traceId = typeof result.trace_id === "string" ? result.trace_id : null;
        const isInvalidJwt = response.status === 401 && /invalid jwt/i.test(message || code);
        const messageWithReference = (fallback: string) =>
          traceId ? appendErrorReference(message || fallback, traceId) : (message || fallback);

        if (isInvalidJwt) {
          // Fallback: beberapa environment project menolak JWT pada edge gateway.
          // Gunakan RPC DB untuk menyelesaikan join agar flow user tetap berjalan.
          const { error: rpcError } = await supabase.rpc("complete_employee_invitation_link", {
            p_invite_code: normalizedInviteCode,
          });

          if (rpcError) {
            const ref = reportError(rpcError, "employee.join_organization.fallback_rpc", {
              invitation_code: normalizedInviteCode,
            });
            toast.error(appendErrorReference(rpcError.message || "Gagal bergabung ke organisasi", ref));
            return;
          }

          toast.success("Berhasil bergabung ke organisasi!");
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(PENDING_INVITATION_CODE_STORAGE_KEY);
          }
          setInvitationCode("");
          onSuccess();
          return;
        }

        if (code === "INVALID_CODE") {
          toast.error(messageWithReference("Kode undangan tidak valid atau sudah kadaluarsa"));
        } else if (code === "ALREADY_MEMBER") {
          toast.error(messageWithReference("Anda sudah terdaftar di organisasi ini"));
        } else if (code === "RATE_LIMITED") {
          toast.error(messageWithReference("Terlalu banyak percobaan. Coba lagi beberapa saat."));
        } else {
          const edgeError = new Error(message || `Gagal bergabung (HTTP ${response.status})`);
          const ref = reportError(edgeError, "employee.join_organization.edge", {
            invitation_code: normalizedInviteCode,
            status: response.status,
          });
          throw new Error(appendErrorReference(edgeError.message, ref));
        }
        return;
      }

      toast.success(`Berhasil bergabung ke ${String(result.tenant_name || "organisasi")}!`);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(PENDING_INVITATION_CODE_STORAGE_KEY);
      }
      setInvitationCode("");
      onSuccess();
    } catch (error: unknown) {
      const ref = reportError(error, "employee.join_organization.catch", {
        invitation_code: invitationCode.trim(),
      });
      const message = error instanceof Error ? error.message : String(error);
      toast.error(appendErrorReference(message || "Terjadi kesalahan", ref));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-warning" />
            <CardTitle className="text-base">Langkah 2: Hubungkan ke Organisasi</CardTitle>
          </div>
          <Badge variant="secondary" className="shrink-0 border border-warning/40 bg-warning/10 text-warning-foreground">
            Wajib
          </Badge>
        </div>
        <CardDescription>
          Akun email Anda sudah aktif. Agar absensi, izin, dan riwayat kerja muncul, masukkan kode undangan dari admin organisasi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleJoinOrganization} className="space-y-4">
          <div className="grid gap-2 rounded-xl border border-border/70 bg-background/80 p-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/15 text-xs font-semibold text-green-700">1</span>
              <div>
                <p className="font-medium text-foreground">Akun berhasil dibuat</p>
                <p className="text-xs text-muted-foreground">Registrasi email dan password sudah selesai.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">2</span>
              <div>
                <p className="font-medium text-foreground">Masukkan kode undangan</p>
                <p className="text-xs text-muted-foreground">Sistem akan menghubungkan akun ini ke organisasi yang benar.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">3</span>
              <div>
                <p className="font-medium text-foreground">Mulai gunakan absensi</p>
                <p className="text-xs text-muted-foreground">Dashboard organisasi dan menu absensi akan aktif otomatis.</p>
              </div>
            </div>
          </div>

          {hasSavedInvitationCode ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Kode undangan dari pendaftaran sebelumnya sudah diisikan otomatis. Periksa kodenya lalu lanjutkan proses bergabung.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="invitation-code">Kode Undangan</Label>
            <div className="relative">
              <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="invitation-code"
                type="text"
                placeholder="Contoh: INV-XXXXXX-XXXXXX"
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                className="pl-10"
                disabled={isLoading}
                autoFocus={hasSavedInvitationCode}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Kode ini diberikan oleh admin organisasi. Setelah berhasil, Anda tidak perlu mengisi ulang lagi.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading || !invitationCode.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Memproses...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Gabung & Aktifkan Absensi
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
