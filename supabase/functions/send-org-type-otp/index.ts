import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendOrgTypeOTPRequest {
  email: string;
  whatsapp: string;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan internal";
};

// Generate 6-digit OTP
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Hash OTP with SHA-256
const hashOTP = async (otp: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("send-org-type-otp");

  try {
    const { email, whatsapp }: SendOrgTypeOTPRequest = await req.json();

    if (!email || !whatsapp) {
      return new Response(
        JSON.stringify(withTrace({ error: "Email dan WhatsApp diperlukan" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate OTP and hash it
    const otpCode = generateOTP();
    const otpHash = await hashOTP(otpCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Invalidate previous OTPs for this email
    await supabase
      .from("password_reset_otps")
      .update({ is_used: true })
      .eq("email", email)
      .eq("is_used", false);

    // Save hashed OTP
    const { error: insertError } = await supabase
      .from("password_reset_otps")
      .insert({
        email: email,
        otp_hash: otpHash,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      logTraceError(traceId, "Error saving OTP", insertError);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal membuat kode OTP" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get WhatsApp gateway settings
    const { data: waSettings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "whatsapp_gateway")
      .maybeSingle();

    let otpSentViaWhatsApp = false;
    const message = `Kode OTP untuk mengubah jenis organisasi Anda adalah: ${otpCode}\n\nKode berlaku selama 10 menit.\nJangan bagikan kode ini kepada siapapun.`;

    if (waSettings?.value) {
      const wa = waSettings.value as {
        baseUrl: string;
        apiKey: string;
        sender: string;
        isEnabled: boolean;
      };

      if (wa.isEnabled && wa.baseUrl && wa.apiKey) {
        try {
          const response = await fetch(`${wa.baseUrl}/send-message`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${wa.apiKey}`,
            },
            body: JSON.stringify({
              phone: whatsapp,
              message: message,
            }),
          });

          if (response.ok) {
            otpSentViaWhatsApp = true;
            console.log("OTP sent via WhatsApp to:", whatsapp);
          }
        } catch (waError) {
          logTraceError(traceId, "WhatsApp send error", waError);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: otpSentViaWhatsApp 
          ? "Kode OTP telah dikirim ke WhatsApp Anda"
          : "Kode OTP dibuat (WhatsApp gateway tidak aktif)",
        // For demo mode only - in production, remove this
        demo_otp: otpSentViaWhatsApp ? undefined : otpCode
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    logTraceError(traceId, "Error in send-org-type-otp", error);
    return new Response(
      JSON.stringify(withTrace({ error: getErrorMessage(error) }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
