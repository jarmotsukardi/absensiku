import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
      const { data: waSettings } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "wa_gateway")
        .maybeSingle();

      const waConfig = waSettings?.value as any;
      if (waConfig?.api_key && waConfig?.provider) {
        const modeLabel = new_mode === "individual" ? "Billing Mandiri" : "Billing Terpusat";
        const message = `[AbsensiKu] Kode OTP untuk perubahan ke ${modeLabel}: ${otp}\n\nKode berlaku 10 menit. Jangan bagikan kode ini.`;

        try {
          let apiUrl = "";
          let payload: any = {};
          const cleanNumber = whatsapp.replace(/\D/g, "");

          switch (waConfig.provider) {
            case "fonnte":
              apiUrl = "https://api.fonnte.com/send";
              payload = { target: cleanNumber, message, countryCode: "62" };
              break;
            case "wablas":
              apiUrl = "https://pati.wablas.com/api/send-message";
              payload = { phone: cleanNumber, message };
              break;
            default:
              apiUrl = "https://api.fonnte.com/send";
              payload = { target: cleanNumber, message };
          }

          await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: waConfig.api_key,
            },
            body: JSON.stringify(payload),
          });
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
  } catch (error: any) {
    logTraceError(traceId, "Unhandled error", error);
    return new Response(JSON.stringify(withTrace({ error: error.message }, traceId)), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
