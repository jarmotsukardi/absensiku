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

type JsonValue = Record<string, unknown> | null;

interface GatewaySettingRow {
  key: string;
  value: JsonValue;
}

interface WhatsAppGatewayConfig {
  provider: string;
  apiKey: string;
  apiUrl?: string;
  senderNumber?: string;
  isEnabled: boolean;
}

type WhatsAppPayload = Record<string, unknown>;

interface WhatsAppProviderConfig {
  url: string;
  buildPayload: (to: string, message: string, apiKey: string, sender?: string) => WhatsAppPayload;
  headers: (apiKey: string) => Record<string, string>;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan internal";
};

const toStringSafe = (value: unknown): string => (typeof value === "string" ? value : "");

const toBooleanSafe = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};

const normalizePhone = (phone: string): string => {
  let digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  return digits;
};

const PROVIDER_CONFIGS: Record<string, WhatsAppProviderConfig> = {
  fonnte: {
    url: "https://api.fonnte.com/send",
    buildPayload: (to, message) => ({ target: to, message }),
    headers: (apiKey) => ({ Authorization: apiKey, "Content-Type": "application/json" }),
  },
  wablas: {
    url: "https://pati.wablas.com/api/send-message",
    buildPayload: (to, message) => ({ phone: to, message }),
    headers: (apiKey) => ({ Authorization: apiKey, "Content-Type": "application/json" }),
  },
  whacenter: {
    url: "https://app.whacenter.com/api/send",
    buildPayload: (to, message, _apiKey, sender) => ({ device_id: sender, number: to, message }),
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }),
  },
  dripsender: {
    url: "https://api.dripsender.id/send",
    buildPayload: (to, message, apiKey) => ({ api_key: apiKey, phone: to, text: message }),
    headers: () => ({ "Content-Type": "application/json" }),
  },
};

const pickGatewayConfig = (rows: GatewaySettingRow[]): WhatsAppGatewayConfig | null => {
  const selected = rows.find((row) => row.key === "whatsapp_gateway") || rows.find((row) => row.key === "wa_gateway");
  if (!selected?.value || typeof selected.value !== "object") return null;

  const raw = selected.value as Record<string, unknown>;
  const apiKey = toStringSafe(raw.apiKey ?? raw.api_key);
  const provider = toStringSafe(raw.provider) || (toStringSafe(raw.apiUrl ?? raw.baseUrl) ? "custom" : "fonnte");
  const isEnabled = toBooleanSafe(raw.isEnabled ?? raw.enabled);
  const apiUrl = toStringSafe(raw.apiUrl ?? raw.baseUrl) || undefined;
  const senderNumber = toStringSafe(raw.senderNumber ?? raw.sender) || undefined;

  return {
    provider,
    apiKey,
    apiUrl,
    senderNumber,
    isEnabled,
  };
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

    // Get WhatsApp gateway settings (support key baru & legacy)
    const { data: waSettings, error: waSettingsError } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["whatsapp_gateway", "wa_gateway"]);

    let otpSentViaWhatsApp = false;
    const message = `Kode OTP untuk mengubah jenis organisasi Anda adalah: ${otpCode}\n\nKode berlaku selama 10 menit.\nJangan bagikan kode ini kepada siapapun.`;
    const normalizedPhone = normalizePhone(whatsapp);

    if (waSettingsError) {
      logTraceError(traceId, "Failed to load WhatsApp settings", waSettingsError);
    }

    const wa = pickGatewayConfig((waSettings || []) as GatewaySettingRow[]);

    if (wa?.isEnabled && wa.apiKey && normalizedPhone) {
      try {
        let fetchUrl = "";
        let fetchPayload: WhatsAppPayload = {};
        let fetchHeaders: Record<string, string> = {};

        if (wa.provider === "custom" && wa.apiUrl) {
          fetchUrl = wa.apiUrl;
          fetchPayload = { to: normalizedPhone, message };
          fetchHeaders = { Authorization: `Bearer ${wa.apiKey}`, "Content-Type": "application/json" };
        } else {
          const config = PROVIDER_CONFIGS[wa.provider];
          if (!config) {
            logTraceError(traceId, `Unsupported WA provider: ${wa.provider}`, wa);
          } else {
            fetchUrl = config.url;
            fetchPayload = config.buildPayload(normalizedPhone, message, wa.apiKey, wa.senderNumber);
            fetchHeaders = config.headers(wa.apiKey);
          }
        }

        if (fetchUrl) {
          const response = await fetch(fetchUrl, {
            method: "POST",
            headers: fetchHeaders,
            body: JSON.stringify(fetchPayload),
          });

          if (response.ok) {
            otpSentViaWhatsApp = true;
            console.log("OTP sent via WhatsApp to:", normalizedPhone);
          } else {
            logTraceError(traceId, "WhatsApp send failed", await response.text());
          }
        }
      } catch (waError) {
        logTraceError(traceId, "WhatsApp send error", waError);
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
