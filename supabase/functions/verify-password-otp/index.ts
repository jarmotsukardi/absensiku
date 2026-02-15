import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyOTPRequest {
  email: string;
  otp: string;
  newPassword: string;
}

interface EmployeeCandidate {
  id: string;
  email: string | null;
  user_id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface ResolvedAccount {
  userId: string;
  authEmail: string;
}

type AdminSupabaseClient = ReturnType<typeof createClient>;

interface AuthUserRecord {
  id?: string;
  email?: string;
}

const pickBestEmployeeCandidate = (rows: EmployeeCandidate[]): EmployeeCandidate | null => {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const score = (r: EmployeeCandidate) => (r.user_id ? 100 : 0);
    const byScore = score(b) - score(a);
    if (byScore !== 0) return byScore;
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });
  return sorted[0];
};

const findAuthUserByEmail = async (supabase: AdminSupabaseClient, normalizedEmail: string): Promise<AuthUserRecord | null> => {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Gagal membaca auth users: ${error.message}`);
    const users = (data?.users || []) as AuthUserRecord[];
    const found = users.find((u) => String(u?.email || "").toLowerCase() === normalizedEmail);
    if (found) return found;
    if (!users.length) break;
    page += 1;
  }
  return null;
};

const resolveAccount = async (supabase: AdminSupabaseClient, email: string): Promise<ResolvedAccount | null> => {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("id, email, user_id, updated_at, created_at")
    .ilike("email", normalizedEmail)
    .limit(25);

  if (empError) throw new Error("Gagal memeriksa email");

  const selected = pickBestEmployeeCandidate((employees || []) as EmployeeCandidate[]);
  if (selected?.user_id) {
    const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(selected.user_id);
    if (authUserError || !authUserData?.user?.email) {
      throw new Error("Akun tidak ditemukan");
    }
    return { userId: selected.user_id, authEmail: authUserData.user.email };
  }

  const authUser = await findAuthUserByEmail(supabase, normalizedEmail);
  if (!authUser?.id || !authUser?.email) return null;
  return { userId: authUser.id, authEmail: authUser.email };
};

const createTraceId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const withTrace = <T extends Record<string, unknown>>(payload: T, traceId: string): T & { trace_id: string } => ({
  ...payload,
  trace_id: traceId,
});

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

// Check rate limit for verification
const checkVerifyRateLimit = async (supabase: AdminSupabaseClient, email: string): Promise<{ allowed: boolean; message?: string }> => {
  const { data: rateLimit } = await supabase
    .from("rate_limit_otp")
    .select("*")
    .eq("identifier", email)
    .eq("attempt_type", "verify")
    .maybeSingle();

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 3600000);

  if (rateLimit) {
    // Check if locked
    if (rateLimit.locked_until && new Date(rateLimit.locked_until) > now) {
      return { allowed: false, message: "Akun dikunci karena terlalu banyak percobaan gagal." };
    }

    // Reset if > 1 hour
    if (new Date(rateLimit.first_attempt_at) < hourAgo) {
      await supabase.from("rate_limit_otp")
        .update({ attempt_count: 1, first_attempt_at: now.toISOString(), last_attempt_at: now.toISOString(), locked_until: null })
        .eq("identifier", email)
        .eq("attempt_type", "verify");
      return { allowed: true };
    }

    // Max 5 failed attempts per hour
    if (rateLimit.attempt_count >= 5) {
      const lockUntil = new Date(now.getTime() + 7200000); // 2 hour lock
      await supabase.from("rate_limit_otp")
        .update({ locked_until: lockUntil.toISOString() })
        .eq("identifier", email)
        .eq("attempt_type", "verify");

      // Invalidate all OTPs for this email
      await supabase.from("password_reset_otps")
        .update({ is_used: true })
        .eq("email", email)
        .eq("is_used", false);

      return { allowed: false, message: "Terlalu banyak percobaan gagal. Akun dikunci selama 2 jam." };
    }

    // Increment
    await supabase.from("rate_limit_otp")
      .update({ attempt_count: rateLimit.attempt_count + 1, last_attempt_at: now.toISOString() })
      .eq("identifier", email)
      .eq("attempt_type", "verify");
  } else {
    await supabase.from("rate_limit_otp")
      .insert({ identifier: email, attempt_type: "verify" });
  }

  return { allowed: true };
};

// Reset verify attempts on successful verification
const resetVerifyAttempts = async (supabase: AdminSupabaseClient, email: string) => {
  await supabase.from("rate_limit_otp")
    .delete()
    .eq("identifier", email)
    .eq("attempt_type", "verify");
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("verify-password-otp");

  try {
    const { email, otp, newPassword }: VerifyOTPRequest = await req.json();

    if (!email || !otp || !newPassword) {
      return new Response(
        JSON.stringify(withTrace({ error: "Email, OTP, dan password baru diperlukan" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify(withTrace({ error: "Password minimal 6 karakter", code: "WEAK_PASSWORD" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let account: ResolvedAccount | null = null;
    try {
      account = await resolveAccount(supabase, email);
    } catch (resolveError: unknown) {
      console.error(`[${traceId}] Resolve account error:`, getErrorMessage(resolveError));
      return new Response(
        JSON.stringify(withTrace({ error: getErrorMessage(resolveError) || "Gagal memeriksa email", code: "EMAIL_LOOKUP_FAILED" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!account) {
      return new Response(
        JSON.stringify(withTrace({ error: "Email tidak ditemukan", code: "EMAIL_NOT_FOUND" }, traceId)),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authEmail = account.authEmail;

    // Check rate limit before verification
    const rateLimitCheck = await checkVerifyRateLimit(supabase, authEmail);
    if (!rateLimitCheck.allowed) {
      return new Response(
        JSON.stringify(withTrace({ error: rateLimitCheck.message, code: "RATE_LIMITED" }, traceId)),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash input OTP and compare with stored hash
    const inputHash = await hashOTP(otp);

    // Add random delay (50-200ms) to prevent timing attacks
    const randomDelay = 50 + Math.floor(Math.random() * 150);
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    // Verify OTP by comparing hashes
    const { data: otpRecord, error: otpError } = await supabase
      .from("password_reset_otps")
      .select("*")
      .eq("email", authEmail)
      .eq("otp_hash", inputHash)
      .eq("is_used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otpRecord) {
      console.log(`[${traceId}] Invalid OTP attempt for:`, authEmail);
      return new Response(
        JSON.stringify(withTrace({ error: "Kode OTP tidak valid atau sudah kadaluarsa", code: "INVALID_OTP" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark OTP as used
    await supabase
      .from("password_reset_otps")
      .update({ is_used: true, verified_at: new Date().toISOString() })
      .eq("id", otpRecord.id);

    // Reset verify attempts on success
    await resetVerifyAttempts(supabase, authEmail);

    // Update user password using admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      account.userId,
      { password: newPassword }
    );

    if (updateError) {
      console.error(`[${traceId}] Error updating password:`, updateError);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal mengubah password", code: "UPDATE_FAILED" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Password reset successful for:", authEmail);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Password berhasil diubah. Silakan login dengan password baru." 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error(`[${traceId}] Error in verify-password-otp:`, error);
    return new Response(
      JSON.stringify(withTrace({ error: getErrorMessage(error) }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
