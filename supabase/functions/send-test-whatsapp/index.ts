import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppRequest {
  to: string;
  message?: string;
  provider: string;
  apiKey: string;
  apiUrl?: string;
  senderNumber?: string;
}

// Provider configurations
const PROVIDER_CONFIGS: Record<string, { url: string; buildPayload: (to: string, message: string, apiKey: string, sender?: string) => any; headers: (apiKey: string) => Record<string, string> }> = {
  fonnte: {
    url: "https://api.fonnte.com/send",
    buildPayload: (to, message, apiKey) => ({
      target: to,
      message: message,
    }),
    headers: (apiKey) => ({
      "Authorization": apiKey,
      "Content-Type": "application/json",
    }),
  },
  wablas: {
    url: "https://pati.wablas.com/api/send-message",
    buildPayload: (to, message, apiKey) => ({
      phone: to,
      message: message,
    }),
    headers: (apiKey) => ({
      "Authorization": apiKey,
      "Content-Type": "application/json",
    }),
  },
  whacenter: {
    url: "https://app.whacenter.com/api/send",
    buildPayload: (to, message, apiKey, sender) => ({
      device_id: sender,
      number: to,
      message: message,
    }),
    headers: (apiKey) => ({
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }),
  },
  dripsender: {
    url: "https://api.dripsender.id/send",
    buildPayload: (to, message, apiKey) => ({
      api_key: apiKey,
      phone: to,
      text: message,
    }),
    headers: () => ({
      "Content-Type": "application/json",
    }),
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("send-test-whatsapp");

  try {
    const { 
      to, 
      message = "Ini adalah pesan percobaan dari AbsensiKu. Jika Anda menerima pesan ini, konfigurasi WhatsApp Gateway berfungsi dengan benar. ✓",
      provider,
      apiKey,
      apiUrl,
      senderNumber 
    }: WhatsAppRequest = await req.json();

    if (!to || !apiKey || !provider) {
      return new Response(
        JSON.stringify(withTrace({ error: "Parameter tidak lengkap (to, apiKey, provider diperlukan)" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone number (remove non-numeric, ensure starts with country code)
    let normalizedPhone = to.replace(/[^0-9]/g, "");
    if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "62" + normalizedPhone.slice(1);
    }

    let url: string;
    let payload: any;
    let headers: Record<string, string>;

    if (provider === "custom" && apiUrl) {
      // Custom API
      url = apiUrl;
      payload = {
        to: normalizedPhone,
        message: message,
      };
      headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
    } else {
      const config = PROVIDER_CONFIGS[provider];
      if (!config) {
        return new Response(
          JSON.stringify(withTrace({ error: `Provider '${provider}' tidak didukung` }, traceId)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      url = config.url;
      payload = config.buildPayload(normalizedPhone, message, apiKey, senderNumber);
      headers = config.headers(apiKey);
    }

    console.log(`Sending WhatsApp to ${normalizedPhone} via ${provider}`);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      logTraceError(traceId, "WhatsApp API error", responseData);
      return new Response(
        JSON.stringify(withTrace({ 
          error: "Gagal mengirim pesan WhatsApp",
          details: responseData 
        }, traceId)),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Pesan berhasil dikirim ke ${normalizedPhone}`,
        response: responseData 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    logTraceError(traceId, "Error sending WhatsApp", error);
    return new Response(
      JSON.stringify(withTrace({ 
        error: error.message || "Gagal mengirim pesan WhatsApp",
        details: error.toString()
      }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
