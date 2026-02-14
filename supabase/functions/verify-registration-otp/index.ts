import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyRegistrationOTPRequest {
  email: string;
  otp: string;
  name: string;
  whatsapp: string;
  address: string;
  password: string;
}

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

  try {
    const { email, otp, name, whatsapp, address, password }: VerifyRegistrationOTPRequest = await req.json();

    if (!email || !otp || !name || !password) {
      return new Response(
        JSON.stringify({ error: "Data tidak lengkap" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password minimal 6 karakter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const normalizedEmail = email.trim().toLowerCase();
    const inputHash = await hashOTP(otp);

    // Add random delay (50-200ms) to prevent timing attacks
    const randomDelay = 50 + Math.floor(Math.random() * 150);
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    // Verify OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from("password_reset_otps")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("otp_hash", inputHash)
      .eq("is_used", false)
      .eq("purpose", "registration")
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otpRecord) {
      console.log("Invalid OTP attempt for:", normalizedEmail);
      return new Response(
        JSON.stringify({ error: "Kode OTP tidak valid atau sudah kadaluarsa", code: "INVALID_OTP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark OTP as used
    await supabase
      .from("password_reset_otps")
      .update({ is_used: true, verified_at: new Date().toISOString() })
      .eq("id", otpRecord.id);

    // Create auth user with auto-confirm
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: password,
      email_confirm: true, // Auto confirm
      user_metadata: {
        name: name,
        registration_type: "self_register",
      },
    });

    if (authError) {
      console.error("Error creating user:", authError);
      return new Response(
        JSON.stringify({ error: authError.message || "Gagal membuat akun" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!authData.user) {
      return new Response(
        JSON.stringify({ error: "Gagal membuat akun" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a "pending" user record in a staging table or mark as unassigned
    // For now, we'll create a record in self_registered_users table
    const { error: regError } = await supabase
      .from("self_registered_users")
      .insert({
        user_id: authData.user.id,
        email: normalizedEmail,
        name: name,
        whatsapp: whatsapp || null,
        address: address || null,
        status: "pending_invitation",
      });

    if (regError) {
      console.error("Error saving registration:", regError);
      // Don't fail, user is still created
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authData.user.id,
        message: "Registrasi berhasil! Silakan login.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in verify-registration-otp:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Terjadi kesalahan internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
