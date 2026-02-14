import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyDeviceOTPRequest {
  email: string;
  otp: string;
  newPassword?: string;
  employeeId?: string;
  newAndroidId?: string;
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
    const { email, otp, newPassword, employeeId, newAndroidId }: VerifyDeviceOTPRequest = await req.json();

    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedOtp = (otp || "").replace(/\D/g, "").slice(0, 6);

    if (!normalizedEmail || !normalizedOtp) {
      return new Response(
        JSON.stringify({ error: "Email dan OTP diperlukan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Tentukan email yang dipakai untuk lookup OTP.
    // - send-password-otp menyimpan OTP dengan email auth user (auth.users.email)
    // - untuk alur reset device (client selalu kirim employeeId), ambil email auth dari employee.user_id agar konsisten
    let otpLookupEmail = normalizedEmail;
    if (employeeId) {
      const { data: employeeForOtp, error: employeeForOtpError } = await supabase
        .from("employees")
        .select("user_id, email")
        .eq("id", employeeId)
        .maybeSingle();

      if (employeeForOtpError) {
        console.error("Error fetching employee for OTP lookup:", employeeForOtpError);
      }

      if (employeeForOtp?.user_id) {
        const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(employeeForOtp.user_id);
        if (!authUserError && authUserData?.user?.email) {
          otpLookupEmail = authUserData.user.email.trim().toLowerCase();
        } else if (employeeForOtp?.email) {
          otpLookupEmail = employeeForOtp.email.trim().toLowerCase();
        }
      } else if (employeeForOtp?.email) {
        otpLookupEmail = employeeForOtp.email.trim().toLowerCase();
      }
    }

    // Hash input OTP
    const inputHash = await hashOTP(normalizedOtp);

    // Verify OTP by comparing hashes
    const { data: otpRecord, error: otpError } = await supabase
      .from("password_reset_otps")
      .select("*")
      .ilike("email", otpLookupEmail)
      .eq("otp_hash", inputHash)
      .eq("is_used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otpRecord) {
      console.log("Invalid OTP attempt for:", otpLookupEmail);
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

    // If password change is requested
    if (newPassword && employeeId) {
      // Get employee to find user_id
      const { data: employee } = await supabase
        .from("employees")
        .select("user_id")
        .eq("id", employeeId)
        .maybeSingle();

      if (employee?.user_id) {
        // Update password
        const { error: pwError } = await supabase.auth.admin.updateUserById(
          employee.user_id,
          { password: newPassword }
        );

        if (pwError) {
          console.error("Error updating password:", pwError);
          return new Response(
            JSON.stringify({ error: "Gagal mengubah password", code: "PASSWORD_UPDATE_FAILED" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // If device ID update is requested
    if (employeeId && newAndroidId !== undefined) {
      const { error: deviceError } = await supabase
        .from("employees")
        .update({ 
          android_id: newAndroidId || null,
          device_id_last_reset: new Date().toISOString()
        })
        .eq("id", employeeId);

      if (deviceError) {
        console.error("Error updating device:", deviceError);
        return new Response(
          JSON.stringify({ error: "Gagal update device", code: "DEVICE_UPDATE_FAILED" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "OTP terverifikasi"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in verify-device-otp:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Terjadi kesalahan internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
