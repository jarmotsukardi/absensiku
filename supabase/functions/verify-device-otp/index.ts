import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

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

interface AttendanceSecuritySettings {
  enable_device_binding: boolean;
  max_device_reset_count: number;
  require_password_change_for_reset: boolean;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan internal";
};

// Hash OTP with SHA-256
const hashOTP = async (otp: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

const getMonthKeyUtc = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("verify-device-otp");

  try {
    const { email, otp, newPassword, employeeId, newAndroidId }: VerifyDeviceOTPRequest = await req.json();

    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedOtp = (otp || "").replace(/\D/g, "").slice(0, 6);

    if (!normalizedEmail || !normalizedOtp) {
      return new Response(
        JSON.stringify(withTrace({ error: "Email dan OTP diperlukan" }, traceId)),
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
        logTraceError(traceId, "Error fetching employee for OTP lookup", employeeForOtpError);
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
      console.log(`[${traceId}] Invalid OTP attempt for:`, otpLookupEmail);
      return new Response(
        JSON.stringify(withTrace({ error: "Kode OTP tidak valid atau sudah kadaluarsa", code: "INVALID_OTP" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const currentMonthKey = getMonthKeyUtc(now);

    let resetEmployeeUserId: string | null = null;
    let deviceUpdatePayload: { android_id: string | null; device_id_last_reset: string; device_id_reset_count?: number } | null = null;

    // Validasi kebijakan reset device di backend agar tidak bisa bypass dari client.
    if (employeeId && newAndroidId !== undefined) {
      const [settingsRes, employeeRes] = await Promise.all([
        supabase
          .from("system_settings")
          .select("value")
          .eq("key", "attendance_security")
          .maybeSingle(),
        supabase
          .from("employees")
          .select("id, user_id, device_id_reset_count, device_id_last_reset")
          .eq("id", employeeId)
          .maybeSingle(),
      ]);

      if (employeeRes.error || !employeeRes.data) {
        return new Response(
          JSON.stringify(withTrace({ error: "Pegawai tidak ditemukan", code: "EMPLOYEE_NOT_FOUND" }, traceId)),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const rawSettings = settingsRes.data?.value as Record<string, unknown> | null;
      const bindingSettings: AttendanceSecuritySettings = {
        enable_device_binding: (rawSettings?.enable_device_binding as boolean) ?? false,
        max_device_reset_count: (rawSettings?.max_device_reset_count as number) ?? 3,
        require_password_change_for_reset: (rawSettings?.require_password_change_for_reset as boolean) ?? true,
      };

      if (bindingSettings.require_password_change_for_reset && !newPassword) {
        return new Response(
          JSON.stringify(withTrace({ error: "Reset device wajib disertai ganti password", code: "PASSWORD_REQUIRED" }, traceId)),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const employee = employeeRes.data;
      resetEmployeeUserId = employee.user_id;

      const lastResetAt = employee.device_id_last_reset ? new Date(employee.device_id_last_reset) : null;
      const isSameMonth = lastResetAt ? getMonthKeyUtc(lastResetAt) === currentMonthKey : false;
      const baseResetCount = isSameMonth ? (employee.device_id_reset_count || 0) : 0;

      if (bindingSettings.enable_device_binding && baseResetCount >= bindingSettings.max_device_reset_count) {
        return new Response(
          JSON.stringify(
            withTrace(
              {
                error: "Kuota reset device bulan ini sudah habis",
                code: "RESET_LIMIT_EXCEEDED",
                max_reset_count: bindingSettings.max_device_reset_count,
              },
              traceId
            )
          ),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Saat month rollover, counter dimulai lagi dari 1 pada reset pertama bulan berjalan.
      const nextResetCount = bindingSettings.enable_device_binding ? baseResetCount + 1 : employee.device_id_reset_count || 0;
      deviceUpdatePayload = {
        android_id: newAndroidId || null,
        device_id_last_reset: nowIso,
        device_id_reset_count: nextResetCount,
      };
    }

    // Mark OTP as used setelah seluruh precheck lolos.
    await supabase
      .from("password_reset_otps")
      .update({ is_used: true, verified_at: nowIso })
      .eq("id", otpRecord.id);

    // If password change is requested
    if (newPassword && employeeId) {
      if (resetEmployeeUserId) {
        // Update password
        const { error: pwError } = await supabase.auth.admin.updateUserById(
          resetEmployeeUserId,
          { password: newPassword }
        );

        if (pwError) {
          logTraceError(traceId, "Error updating password", pwError);
          return new Response(
            JSON.stringify(withTrace({ error: "Gagal mengubah password", code: "PASSWORD_UPDATE_FAILED" }, traceId)),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // If device ID update is requested
    if (employeeId && newAndroidId !== undefined && deviceUpdatePayload) {
      const { error: deviceError } = await supabase
        .from("employees")
        .update(deviceUpdatePayload)
        .eq("id", employeeId);

      if (deviceError) {
        logTraceError(traceId, "Error updating device", deviceError);
        return new Response(
          JSON.stringify(withTrace({ error: "Gagal update device", code: "DEVICE_UPDATE_FAILED" }, traceId)),
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

  } catch (error: unknown) {
    logTraceError(traceId, "Error in verify-device-otp", error);
    return new Response(
      JSON.stringify(withTrace({ error: getErrorMessage(error) }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
