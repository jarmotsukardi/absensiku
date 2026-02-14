import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, otp, tenant_id, new_mode } = await req.json();

    if (!email || !otp || !tenant_id || !new_mode) {
      return new Response(JSON.stringify({ error: "Semua field wajib diisi" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Rate limit verification
    const identifier = `billing_otp_verify_${email}`;
    const { data: rateData } = await supabase
      .from("rate_limit_otp")
      .select("*")
      .eq("identifier", identifier)
      .eq("attempt_type", "verify")
      .maybeSingle();

    if (rateData) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (new Date(rateData.first_attempt_at) > hourAgo && rateData.attempt_count >= 5) {
        return new Response(JSON.stringify({ error: "Terlalu banyak percobaan. Coba lagi dalam 1 jam." }), {
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
        attempt_type: "verify",
        attempt_count: 1,
      });
    }

    // Hash OTP
    const cleanOtp = otp.replace(/\D/g, "");
    const encoder = new TextEncoder();
    const data = encoder.encode(cleanOtp);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const otpHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Verify
    const normalizedEmail = email.trim().toLowerCase();
    const { data: otpRecord } = await supabase
      .from("org_type_change_otps")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("otp_hash", otpHash)
      .eq("is_used", false)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!otpRecord) {
      return new Response(JSON.stringify({ error: "Kode OTP tidak valid atau sudah kedaluwarsa", success: false }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark OTP as used
    await supabase.from("org_type_change_otps").update({ is_used: true }).eq("id", otpRecord.id);

    // Atomically update billing_mode
    const { error: updateError } = await supabase
      .from("tenants")
      .update({
        billing_mode: new_mode,
        billing_mode_updated_at: new Date().toISOString(),
      })
      .eq("id", tenant_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Gagal mengubah mode billing: " + updateError.message, success: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message: "Mode billing berhasil diubah" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
