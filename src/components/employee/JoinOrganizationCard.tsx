import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/integrations/supabase/env";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";
import { appendErrorReference, reportError } from "@/lib/errorLogger";

interface JoinOrganizationCardProps {
  onSuccess: () => void;
}

export function JoinOrganizationCard({ onSuccess }: JoinOrganizationCardProps) {
  const [invitationCode, setInvitationCode] = useState("");
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
        const isInvalidJwt = response.status === 401 && /invalid jwt/i.test(message || code);

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
          setInvitationCode("");
          onSuccess();
          return;
        }

        if (code === "INVALID_CODE") {
          toast.error("Kode undangan tidak valid atau sudah kadaluarsa");
        } else if (code === "ALREADY_MEMBER") {
          toast.error("Anda sudah terdaftar di organisasi ini");
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
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-warning" />
          <CardTitle className="text-base">Belum Terdaftar di Organisasi</CardTitle>
        </div>
        <CardDescription>
          Untuk melakukan absensi, Anda perlu bergabung ke organisasi terlebih dahulu. 
          Hubungi admin organisasi Anda untuk mendapatkan kode undangan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleJoinOrganization} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invitation-code">Kode Undangan</Label>
            <div className="relative">
              <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="invitation-code"
                type="text"
                placeholder="Masukkan kode undangan"
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value)}
                className="pl-10"
                disabled={isLoading}
              />
            </div>
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
                Bergabung ke Organisasi
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
