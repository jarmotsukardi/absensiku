import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";

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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Sesi tidak valid. Silakan login ulang.");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/join-organization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ invitation_code: invitationCode.trim() }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (result.code === "INVALID_CODE") {
          toast.error("Kode undangan tidak valid atau sudah kadaluarsa");
        } else if (result.code === "ALREADY_MEMBER") {
          toast.error("Anda sudah terdaftar di organisasi ini");
        } else {
          throw new Error(result.error || "Gagal bergabung");
        }
        return;
      }

      toast.success(`Berhasil bergabung ke ${result.tenant_name}!`);
      setInvitationCode("");
      onSuccess();
    } catch (error: any) {
      console.error("Error joining organization:", error);
      toast.error(error.message || "Terjadi kesalahan");
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
