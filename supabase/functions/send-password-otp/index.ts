import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendOTPRequest {
  email: string;
  whatsapp?: string;
  method?: "email" | "whatsapp";
  purpose?: string;
  login_type?: "employee" | "org" | "admin";
}

interface EmployeeCandidate {
  id: string;
  email: string | null;
  name: string | null;
  user_id: string | null;
  phone: string | null;
  whatsapp: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface ResolvedAccount {
  name: string | null;
  userId: string;
  authEmail: string;
  phone: string | null;
  whatsapp: string | null;
  source: "employee" | "auth_admin";
}

const ROLE_MAP: Record<string, { label: string }> = {
  admin: { label: "Super Admin" },
  org: { label: "Admin Organisasi" },
  employee: { label: "Pegawai" },
};

const PROVIDER_CONFIGS: Record<
  string,
  {
    url: string;
    buildPayload: (to: string, msg: string, key: string, sender?: string) => Record<string, unknown>;
    headers: (key: string) => Record<string, string>;
  }
> = {
  fonnte: {
    url: "https://api.fonnte.com/send",
    buildPayload: (to, msg) => ({ target: to, message: msg }),
    headers: (key) => ({ "Authorization": key, "Content-Type": "application/json" }),
  },
  wablas: {
    url: "https://pati.wablas.com/api/send-message",
    buildPayload: (to, msg) => ({ phone: to, message: msg }),
    headers: (key) => ({ "Authorization": key, "Content-Type": "application/json" }),
  },
  whacenter: {
    url: "https://app.whacenter.com/api/send",
    buildPayload: (to, msg, _key, sender) => ({ device_id: sender, number: to, message: msg }),
    headers: (key) => ({ "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }),
  },
  dripsender: {
    url: "https://api.dripsender.id/send",
    buildPayload: (to, msg, key) => ({ api_key: key, phone: to, text: msg }),
    headers: () => ({ "Content-Type": "application/json" }),
  },
};

// Generate 6-digit OTP
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  return digits;
};

const maskPhone = (phone: string): string => {
  const normalized = normalizePhone(phone);
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}***${normalized.slice(-2)}`;
};

const pickBestEmployeeCandidate = (rows: EmployeeCandidate[]): EmployeeCandidate | null => {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const score = (r: EmployeeCandidate) =>
      (r.user_id ? 100 : 0) + (r.phone ? 10 : 0) + (r.whatsapp ? 5 : 0);
    const byScore = score(b) - score(a);
    if (byScore !== 0) return byScore;
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });
  return sorted[0];
};

const findAuthUserByEmail = async (supabase: any, normalizedEmail: string) => {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Gagal membaca auth users: ${error.message}`);
    const users = data?.users || [];
    const found = users.find((u: any) => String(u?.email || "").toLowerCase() === normalizedEmail);
    if (found) return found;
    if (!users.length) break;
    page += 1;
  }
  return null;
};

const resolveAccount = async (
  supabase: any,
  email: string,
  loginType?: "employee" | "org" | "admin"
): Promise<{ account: ResolvedAccount | null; hasEmployeeRow: boolean; hasInactiveEmployee: boolean }> => {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("id, email, name, user_id, phone, whatsapp, updated_at, created_at")
    .ilike("email", normalizedEmail)
    .limit(25);

  if (empError) throw new Error("Gagal memeriksa email");

  const rows = (employees || []) as EmployeeCandidate[];
  const hasEmployeeRow = rows.length > 0;
  const hasInactiveEmployee = rows.some((r) => !r.user_id);
  const selected = pickBestEmployeeCandidate(rows);

  if (selected?.user_id) {
    const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(selected.user_id);
    if (authUserError || !authUserData?.user?.email) {
      throw new Error("Akun tidak ditemukan dalam sistem otentikasi");
    }

    return {
      account: {
        name: selected.name,
        userId: selected.user_id,
        authEmail: authUserData.user.email,
        phone: selected.phone,
        whatsapp: selected.whatsapp,
        source: "employee",
      },
      hasEmployeeRow,
      hasInactiveEmployee,
    };
  }

  if (loginType === "admin") {
    const authUser = await findAuthUserByEmail(supabase, normalizedEmail);
    if (!authUser?.id || !authUser?.email) {
      return { account: null, hasEmployeeRow, hasInactiveEmployee };
    }
    return {
      account: {
        name: authUser.user_metadata?.name || "Super Admin",
        userId: authUser.id,
        authEmail: authUser.email,
        phone: selected?.phone || null,
        whatsapp: selected?.whatsapp || null,
        source: "auth_admin",
      },
      hasEmployeeRow,
      hasInactiveEmployee,
    };
  }

  return { account: null, hasEmployeeRow, hasInactiveEmployee };
};

// Hash OTP with SHA-256
const hashOTP = async (otp: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

// Check rate limit
const checkRateLimit = async (supabase: any, email: string): Promise<{ allowed: boolean; message?: string }> => {
  const { data: rateLimit } = await supabase
    .from("rate_limit_otp")
    .select("*")
    .eq("identifier", email)
    .eq("attempt_type", "send")
    .maybeSingle();

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 3600000);

  if (rateLimit) {
    // Check if locked
    if (rateLimit.locked_until && new Date(rateLimit.locked_until) > now) {
      const minutesLeft = Math.ceil((new Date(rateLimit.locked_until).getTime() - now.getTime()) / 60000);
      return { allowed: false, message: `Terlalu banyak permintaan. Coba lagi dalam ${minutesLeft} menit.` };
    }

    // Reset counter if > 1 hour
    if (new Date(rateLimit.first_attempt_at) < hourAgo) {
      await supabase.from("rate_limit_otp")
        .update({ attempt_count: 1, first_attempt_at: now.toISOString(), last_attempt_at: now.toISOString(), locked_until: null })
        .eq("identifier", email)
        .eq("attempt_type", "send");
      return { allowed: true };
    }

    // Check rate limit: max 3 per hour
    if (rateLimit.attempt_count >= 3) {
      const lockUntil = new Date(now.getTime() + 3600000); // 1 hour lock
      await supabase.from("rate_limit_otp")
        .update({ locked_until: lockUntil.toISOString() })
        .eq("identifier", email)
        .eq("attempt_type", "send");
      return { allowed: false, message: "Terlalu banyak permintaan OTP. Akun dikunci selama 1 jam." };
    }

    // Increment counter
    await supabase.from("rate_limit_otp")
      .update({ 
        attempt_count: rateLimit.attempt_count + 1,
        last_attempt_at: now.toISOString() 
      })
      .eq("identifier", email)
      .eq("attempt_type", "send");
  } else {
    // First attempt
    await supabase.from("rate_limit_otp")
      .insert({ identifier: email, attempt_type: "send" });
  }

  return { allowed: true };
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: SendOTPRequest = await req.json();
    const { email, whatsapp, method, login_type } = body;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email diperlukan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check rate limit first
    const rateLimitCheck = await checkRateLimit(supabase, email.toLowerCase().trim());
    if (!rateLimitCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateLimitCheck.message, code: "RATE_LIMITED" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let account: ResolvedAccount | null = null;
    let hasEmployeeRow = false;
    let hasInactiveEmployee = false;
    try {
      const resolved = await resolveAccount(supabase, email, login_type);
      account = resolved.account;
      hasEmployeeRow = resolved.hasEmployeeRow;
      hasInactiveEmployee = resolved.hasInactiveEmployee;
    } catch (resolveError: any) {
      console.error("Error resolving account:", resolveError?.message);
      return new Response(
        JSON.stringify({ error: resolveError?.message || "Gagal memeriksa email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!account) {
      if (hasEmployeeRow || hasInactiveEmployee) {
        return new Response(
          JSON.stringify({
            error: "Akun belum diaktivasi. Silakan gunakan kode undangan untuk mendaftar terlebih dahulu.",
            code: "NOT_ACTIVATED",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Email tidak terdaftar dalam sistem", code: "EMAIL_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate role matches login context
    if (login_type && account.userId) {
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", account.userId);

      const roles = (userRoles || []).map((r: any) => r.role);
      const isSuperAdmin = roles.includes("super_admin");
      const isAdminInstansi = roles.includes("admin_instansi");

      if (login_type === "admin" && !isSuperAdmin) {
        const actualRole = isAdminInstansi ? "Admin Organisasi" : "Pegawai";
        return new Response(
          JSON.stringify({
            error: `Akun Anda terdaftar sebagai ${actualRole}, bukan Super Admin. Silakan gunakan halaman login yang sesuai.`,
            code: "ROLE_MISMATCH",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (login_type === "org" && !isAdminInstansi) {
        const actualRole = isSuperAdmin ? "Super Admin" : "Pegawai";
        return new Response(
          JSON.stringify({
            error: `Akun Anda terdaftar sebagai ${actualRole}, bukan Admin Organisasi. Silakan gunakan halaman login yang sesuai.`,
            code: "ROLE_MISMATCH",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (login_type === "employee" && (isSuperAdmin || isAdminInstansi)) {
        const actualRole = isSuperAdmin ? "Super Admin" : "Admin Organisasi";
        return new Response(
          JSON.stringify({
            error: `Akun Anda terdaftar sebagai ${actualRole}, bukan Pegawai. Silakan gunakan halaman login yang sesuai.`,
            code: "ROLE_MISMATCH",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate WhatsApp number matches registered phone.
    // For super admin without employee profile, allow fallback to email-only identity check.
    const inputPhone = whatsapp ? normalizePhone(whatsapp) : "";
    const storedPhone = account.phone ? normalizePhone(account.phone) : account.whatsapp ? normalizePhone(account.whatsapp) : "";
    const canSkipPhoneValidation = login_type === "admin" && account.source === "auth_admin" && !storedPhone;
    if (!canSkipPhoneValidation) {
      if (!inputPhone) {
        return new Response(
          JSON.stringify({ error: "No. WhatsApp diperlukan" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!storedPhone || inputPhone !== storedPhone) {
        return new Response(
          JSON.stringify({ error: "Email dan No. WhatsApp tidak cocok dengan data terdaftar", code: "IDENTITY_MISMATCH" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    const targetPhone = storedPhone || inputPhone;

    const authEmail = account.authEmail;

    // Generate OTP and hash it
    const otpCode = generateOTP();
    const otpHash = await hashOTP(otpCode);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Invalidate previous OTPs for this email
    await supabase
      .from("password_reset_otps")
      .update({ is_used: true })
      .eq("email", authEmail)
      .eq("is_used", false);

    // Save hashed OTP
    const { error: insertError } = await supabase
      .from("password_reset_otps")
      .insert({
        email: authEmail,
        otp_hash: otpHash, // Store hash, not plaintext
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Error saving OTP:", insertError);
      return new Response(
        JSON.stringify({ error: "Gagal membuat kode OTP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send OTP via WhatsApp if requested
    if (method === "whatsapp") {
      const { data: waSettings } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "whatsapp_gateway")
        .maybeSingle();

      if (!waSettings?.value) {
        return new Response(
          JSON.stringify({ error: "WhatsApp gateway belum dikonfigurasi" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const wa = waSettings.value as {
        apiKey: string;
        apiUrl?: string;
        provider?: string;
        isEnabled: boolean;
        senderNumber?: string;
      };

      if (!wa.isEnabled) {
        return new Response(
          JSON.stringify({ error: "WhatsApp gateway tidak aktif" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedPhone = targetPhone;
      if (!normalizedPhone) {
        return new Response(
          JSON.stringify({ error: "No. WhatsApp tidak tersedia untuk akun ini" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const waMessage = `[AbsensiKu] Kode OTP untuk reset password: ${otpCode}\n\nKode berlaku 10 menit. Jangan bagikan kode ini kepada siapapun.`;

      let fetchUrl: string;
      let fetchPayload: Record<string, unknown>;
      let fetchHeaders: Record<string, string>;
      const provider = wa.provider || "fonnte";

      if (provider === "custom" && wa.apiUrl) {
        fetchUrl = wa.apiUrl;
        fetchPayload = { to: normalizedPhone, message: waMessage };
        fetchHeaders = { "Authorization": `Bearer ${wa.apiKey}`, "Content-Type": "application/json" };
      } else {
        const config = PROVIDER_CONFIGS[provider];
        if (!config) {
          return new Response(
            JSON.stringify({ error: `Provider WhatsApp '${provider}' tidak didukung` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        fetchUrl = config.url;
        fetchPayload = config.buildPayload(normalizedPhone, waMessage, wa.apiKey, wa.senderNumber);
        fetchHeaders = config.headers(wa.apiKey);
      }

      const waRes = await fetch(fetchUrl, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify(fetchPayload),
      });

      if (!waRes.ok) {
        const details = await waRes.text();
        console.error("WhatsApp send error:", details);
        return new Response(
          JSON.stringify({ error: "Gagal mengirim OTP via WhatsApp" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Kode OTP telah dikirim ke WhatsApp Anda",
          whatsapp: maskPhone(normalizedPhone),
          delivery: "whatsapp",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get SMTP settings
    const { data: smtpSettings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "email_gateway")
      .maybeSingle();

    if (!smtpSettings?.value) {
      console.error("SMTP settings not configured");
      return new Response(
        JSON.stringify({ error: "Email gateway belum dikonfigurasi" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const smtp = smtpSettings.value as {
      smtpHost: string;
      smtpPort: number;
      smtpUser: string;
      smtpPassword: string;
      senderEmail: string;
      senderName: string;
      useTLS: boolean;
      isEnabled: boolean;
    };

    if (!smtp.isEnabled) {
      return new Response(
        JSON.stringify({ error: "Email gateway tidak aktif" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending OTP to email:", authEmail);

    // Send email with OTP (plaintext only sent via email, never stored)
    const port = Number(smtp.smtpPort) || 465;
    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const fromEmail = isValidEmail(smtp.senderEmail) ? smtp.senderEmail : smtp.smtpUser;

    try {
      const client = new SMTPClient({
        connection: {
          hostname: smtp.smtpHost,
          port: port,
          tls: port === 465,
          auth: {
            username: smtp.smtpUser,
            password: smtp.smtpPassword,
          },
        },
      });

      const emailContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kode OTP Reset Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a365d; margin: 0;">🔐 AbsensiKu</h1>
    <p style="color: #718096; margin-top: 5px;">Sistem Absensi Digital</p>
  </div>
  
  <div style="background: #f7fafc; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
    <h2 style="color: #2d3748; margin-top: 0;">Halo ${account.name || "Pengguna"},</h2>
    <p>Kami menerima permintaan untuk mereset password akun Anda.</p>
    <p>Gunakan kode OTP berikut untuk melanjutkan proses reset password:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <div style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px 40px; border-radius: 12px; font-size: 32px; font-weight: bold; letter-spacing: 8px;">
        ${otpCode}
      </div>
    </div>
    
    <p style="font-size: 14px; color: #718096; text-align: center;">
      Kode ini berlaku selama <strong>10 menit</strong>.
    </p>
  </div>
  
  <div style="text-align: center; font-size: 12px; color: #a0aec0;">
    <p>⚠️ Jangan berikan kode ini kepada siapapun.</p>
    <p>Jika Anda tidak meminta reset password, abaikan email ini.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
    <p>© ${new Date().getFullYear()} AbsensiKu - Sistem Absensi Digital</p>
  </div>
</body>
</html>
      `;

      await client.send({
        from: `${smtp.senderName || "AbsensiKu"} <${fromEmail}>`,
        to: authEmail,
        subject: "Kode OTP Reset Password - AbsensiKu",
        content: `Kode OTP Anda: ${otpCode}. Berlaku 10 menit.`,
        html: emailContent,
      });

      await client.close();
      console.log("OTP email sent successfully to:", authEmail);
      
    } catch (smtpError: any) {
      console.error("SMTP Error:", smtpError.message);
      
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        console.log("Trying Resend fallback...");
        try {
          const resendResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "AbsensiKu <onboarding@resend.dev>",
              to: [authEmail],
              subject: "Kode OTP Reset Password - AbsensiKu",
              html: `<p>Kode OTP Anda: <strong>${otpCode}</strong></p><p>Berlaku 10 menit.</p>`,
            }),
          });
          
          if (!resendResponse.ok) {
            throw new Error(`SMTP gagal: ${smtpError.message}. Fallback juga gagal.`);
          }
          
          console.log("Email sent via Resend fallback");
        } catch (fallbackError: any) {
          throw new Error(`Gagal mengirim email: ${smtpError.message}`);
        }
      } else {
        throw new Error(`Gagal mengirim email via SMTP: ${smtpError.message}`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Kode OTP telah dikirim ke email Anda",
        email: authEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
        delivery: "email",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-password-otp:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Terjadi kesalahan internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
