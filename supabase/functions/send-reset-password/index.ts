import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResetPasswordRequest {
  email: string;
  whatsapp?: string;
  method?: "email" | "whatsapp";
  validate_only?: boolean;
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

const ROLE_MAP: Record<string, { expected_role: string | null; label: string; correct_path: string }> = {
  admin: { expected_role: "super_admin", label: "Super Admin", correct_path: "/admin/login" },
  org: { expected_role: "admin_instansi", label: "Admin Organisasi", correct_path: "/org/login" },
  employee: { expected_role: null, label: "Pegawai", correct_path: "/employee/login" },
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin_instansi: "Admin Organisasi",
};

// Normalize phone number for comparison
const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  return digits;
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

// Generate random password
const generatePassword = (length = 10): string => {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
  let result = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ResetPasswordRequest = await req.json();
    const { email, whatsapp, method, validate_only, login_type } = body;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email diperlukan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
          JSON.stringify({ error: "Akun belum diaktivasi. Hubungi admin.", code: "NOT_ACTIVATED" }),
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

      const roleConfig = ROLE_MAP[login_type];
      if (roleConfig) {
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

    // If validate_only, return success without generating password
    if (validate_only) {
      return new Response(
        JSON.stringify({ success: true, valid: true, message: "Data tervalidasi", name: account.name }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authEmail = account.authEmail;

    // Generate new password
    const newPassword = generatePassword(10);

    // Update password via Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(account.userId, {
      password: newPassword,
    });

    if (updateError) {
      console.error("Error updating password:", updateError);
      return new Response(
        JSON.stringify({ error: "Gagal mereset password" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Password reset for: ${authEmail}, method: ${method || "email"}`);

    // Send via WhatsApp if method is whatsapp
    if (method === "whatsapp") {
      // Get WhatsApp gateway settings
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

      const wa = waSettings.value as { apiUrl?: string; apiKey: string; isEnabled: boolean; provider?: string; senderNumber?: string };

      if (!wa.isEnabled) {
        return new Response(
          JSON.stringify({ error: "WhatsApp gateway tidak aktif" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const waMessage = `🔐 *AbsensiKu - Password Baru*\n\nHalo ${account.name || "Pengguna"},\n\nPassword baru Anda:\n*${newPassword}*\n\nSilakan login dan segera ubah password Anda.\n\n⚠️ Jangan bagikan password ini kepada siapapun.`;

      // Resolve URL and headers based on provider (matching send-test-whatsapp logic)
      const provider = wa.provider || "fonnte";
      const PROVIDER_CONFIGS: Record<string, { url: string; buildPayload: (to: string, msg: string, key: string, sender?: string) => any; headers: (key: string) => Record<string, string> }> = {
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

      const normalizedPhone = targetPhone || "";
      if (!normalizedPhone) {
        return new Response(
          JSON.stringify({ error: "No. WhatsApp tidak tersedia untuk akun ini" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      let fetchUrl: string;
      let fetchPayload: any;
      let fetchHeaders: Record<string, string>;

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

      console.log(`Sending WA reset to ${normalizedPhone} via ${provider}, url: ${fetchUrl}`);

      try {
        const waResponse = await fetch(fetchUrl, {
          method: "POST",
          headers: fetchHeaders,
          body: JSON.stringify(fetchPayload),
        });

        if (!waResponse.ok) {
          console.error("WhatsApp send failed:", await waResponse.text());
          return new Response(
            JSON.stringify({ error: "Gagal mengirim pesan WhatsApp" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (waError: any) {
        console.error("WhatsApp error:", waError.message);
        return new Response(
          JSON.stringify({ error: "Gagal mengirim pesan WhatsApp: " + waError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Password baru telah dikirim via WhatsApp" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: Send via Email
    const { data: smtpSettings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "email_gateway")
      .maybeSingle();

    if (!smtpSettings?.value) {
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

    const port = Number(smtp.smtpPort) || 465;
    const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    const fromEmail = isValidEmail(smtp.senderEmail) ? smtp.senderEmail : smtp.smtpUser;

    const emailContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a365d; margin: 0;">🔐 AbsensiKu</h1>
    <p style="color: #718096; margin-top: 5px;">Sistem Absensi Digital</p>
  </div>
  <div style="background: #f7fafc; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
    <h2 style="color: #2d3748; margin-top: 0;">Halo ${account.name || "Pengguna"},</h2>
    <p>Password akun Anda telah direset. Berikut password baru Anda:</p>
    <div style="text-align: center; margin: 30px 0;">
      <div style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 32px; border-radius: 10px; font-size: 24px; font-weight: bold; letter-spacing: 2px;">
        ${newPassword}
      </div>
    </div>
    <p style="font-size: 14px; color: #718096; text-align: center;">Silakan login dan segera ubah password Anda.</p>
  </div>
  <div style="text-align: center; font-size: 12px; color: #a0aec0;">
    <p>⚠️ Jangan berikan password ini kepada siapapun.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
    <p>© ${new Date().getFullYear()} AbsensiKu - Sistem Absensi Digital</p>
  </div>
</body>
</html>`;

    try {
      const client = new SMTPClient({
        connection: {
          hostname: smtp.smtpHost,
          port,
          tls: port === 465,
          auth: { username: smtp.smtpUser, password: smtp.smtpPassword },
        },
      });

      await client.send({
        from: `${smtp.senderName || "AbsensiKu"} <${fromEmail}>`,
        to: authEmail,
        subject: "Password Baru - AbsensiKu",
        content: `Password baru Anda: ${newPassword}. Silakan login dan segera ubah password Anda.`,
        html: emailContent,
      });

      await client.close();
    } catch (smtpError: any) {
      console.error("SMTP Error:", smtpError.message);

      // Try Resend fallback
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "AbsensiKu <onboarding@resend.dev>",
            to: [authEmail],
            subject: "Password Baru - AbsensiKu",
            html: emailContent,
          }),
        });

        if (!resendResponse.ok) {
          throw new Error(`Gagal mengirim email: ${smtpError.message}`);
        }
      } else {
        throw new Error(`Gagal mengirim email: ${smtpError.message}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Password baru telah dikirim ke email Anda" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-reset-password:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Terjadi kesalahan internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
