import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppGatewayConfig {
  apiKey?: string;
  api_key?: string;
  provider?: string;
  apiUrl?: string;
  baseUrl?: string;
  senderNumber?: string;
  sender?: string;
  isEnabled?: boolean;
  enabled?: boolean;
}

interface GatewaySettingRow {
  key: string;
  value: WhatsAppGatewayConfig | null;
}

type WhatsAppPayload = Record<string, unknown>;

interface ProviderConfig {
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

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
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

const pickGateway = (rows: GatewaySettingRow[]): WhatsAppGatewayConfig | null => {
  const selected = rows.find((row) => row.key === "whatsapp_gateway") || rows.find((row) => row.key === "wa_gateway");
  return selected?.value ?? null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("send-billing-mode-otp");

  try {
    const { email, whatsapp, tenant_id, new_mode } = await req.json();

    if (!email || !tenant_id || !new_mode) {
      return new Response(JSON.stringify(withTrace({ error: "Email, tenant_id, dan new_mode wajib diisi" }, traceId)), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Rate limiting: max 3 sends per hour
    const identifier = `billing_otp_${email}`;
    const { data: rateData } = await supabase
      .from("rate_limit_otp")
      .select("*")
      .eq("identifier", identifier)
      .eq("attempt_type", "send")
      .maybeSingle();

    if (rateData) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (new Date(rateData.first_attempt_at) > hourAgo && rateData.attempt_count >= 3) {
        return new Response(JSON.stringify(withTrace({ error: "Terlalu banyak permintaan. Coba lagi dalam 1 jam." }, traceId)), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (new Date(rateData.first_attempt_at) <= hourAgo) {
        await supabase.from("rate_limit_otp").update({
          attempt_count: 1,
          first_attempt_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(),
        }).eq("id", rateData.id);
      } else {
        await supabase.from("rate_limit_otp").update({
          attempt_count: rateData.attempt_count + 1,
          last_attempt_at: new Date().toISOString(),
        }).eq("id", rateData.id);
      }
    } else {
      await supabase.from("rate_limit_otp").insert({
        identifier,
        attempt_type: "send",
        attempt_count: 1,
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Hash OTP with SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(otp);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const otpHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Store hashed OTP
    await supabase.from("org_type_change_otps").upsert({
      email: email.trim().toLowerCase(),
      otp_hash: otpHash,
      expires_at: expiresAt.toISOString(),
      is_used: false,
    }, { onConflict: "email" });

    // Try sending via WhatsApp gateway
    let demoOtp = null;
    if (whatsapp) {
      const { data: waSettings, error: waSettingsError } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["whatsapp_gateway", "wa_gateway"]);

      if (waSettingsError) {
        logTraceError(traceId, "Gagal membaca konfigurasi WhatsApp gateway", waSettingsError);
      }

      const waConfig = pickGateway((waSettings || []) as GatewaySettingRow[]);
      const apiKey = toStringSafe(waConfig?.apiKey ?? waConfig?.api_key);
      const provider = toStringSafe(waConfig?.provider) || (toStringSafe(waConfig?.apiUrl ?? waConfig?.baseUrl) ? "custom" : "fonnte");
      const apiUrl = toStringSafe(waConfig?.apiUrl ?? waConfig?.baseUrl);
      const senderNumber = toStringSafe(waConfig?.senderNumber ?? waConfig?.sender);
      const isEnabled = toBooleanSafe(waConfig?.isEnabled ?? waConfig?.enabled);

      if (isEnabled && apiKey) {
        const modeLabel = new_mode === "individual" ? "Billing Mandiri" : "Billing Terpusat";
        const message = `[AbsensiKu] Kode OTP untuk perubahan ke ${modeLabel}: ${otp}\n\nKode berlaku 10 menit. Jangan bagikan kode ini.`;

        try {
          const cleanNumber = normalizePhone(whatsapp);
          let fetchUrl = "";
          let fetchPayload: WhatsAppPayload = {};
          let fetchHeaders: Record<string, string> = {};

          if (provider === "custom" && apiUrl) {
            fetchUrl = apiUrl;
            fetchPayload = { to: cleanNumber, message };
            fetchHeaders = {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            };
          } else {
            const providerConfig = PROVIDER_CONFIGS[provider];
            if (!providerConfig) {
              throw new Error(`Provider WhatsApp '${provider}' tidak didukung`);
            }
            fetchUrl = providerConfig.url;
            fetchPayload = providerConfig.buildPayload(cleanNumber, message, apiKey, senderNumber || undefined);
            fetchHeaders = providerConfig.headers(apiKey);
          }

          const waResponse = await fetch(fetchUrl, {
            method: "POST",
            headers: fetchHeaders,
            body: JSON.stringify(fetchPayload),
          });

          if (!waResponse.ok) {
            throw new Error(await waResponse.text());
          }
        } catch (waError) {
          logTraceError(traceId, "WA send error", waError);
          demoOtp = otp;
        }
      } else {
        demoOtp = otp;
      }
    } else {
      demoOtp = otp;
    }

    return new Response(JSON.stringify({
      success: true,
      message: "OTP berhasil dikirim",
      ...(demoOtp ? { demo_otp: demoOtp } : {}),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    logTraceError(traceId, "Unhandled error", error);
    return new Response(JSON.stringify(withTrace({ error: getErrorMessage(error) }, traceId)), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
