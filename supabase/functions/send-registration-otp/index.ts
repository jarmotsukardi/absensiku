import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendRegistrationOTPRequest {
  email: string;
}

// Generate 6-digit OTP
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Hash OTP with SHA-256
const hashOTP = async (otp: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

// Mask email for privacy
const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(Math.min(local.length - 2, 6))}@${domain}`;
};

// Send email via SMTP
const sendEmailViaSMTP = async (
  to: string,
  subject: string,
  htmlContent: string,
  settings: any
): Promise<boolean> => {
  try {
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    
    const smtpHost = settings.smtpHost || settings.smtp_host;
    const smtpPort = parseInt(settings.smtpPort || settings.smtp_port) || 465;
    const smtpUser = settings.smtpUser || settings.smtp_user;
    const smtpPassword = settings.smtpPassword || settings.smtp_password;
    const senderEmail = settings.senderEmail || settings.sender_email || smtpUser;
    const senderName = settings.senderName || settings.sender_name || "AbsensiKu";
    
    if (!smtpHost || !smtpUser || !smtpPassword) {
      console.log("SMTP configuration incomplete");
      return false;
    }
    
    const connectionConfig: any = {
      hostname: smtpHost,
      port: smtpPort,
      auth: {
        username: smtpUser,
        password: smtpPassword,
      },
    };

    // Port 465 = implicit TLS, Port 587 = STARTTLS
    if (smtpPort === 465) {
      connectionConfig.tls = true;
    } else if (smtpPort === 587) {
      connectionConfig.tls = false;
    } else {
      connectionConfig.tls = settings.useTLS ?? true;
    }

    console.log("Sending OTP email via SMTP to:", to);
    
    const client = new SMTPClient({
      connection: connectionConfig,
    });

    await client.send({
      from: `${senderName} <${senderEmail}>`,
      to: to,
      subject: subject,
      content: "Kode OTP Registrasi AbsensiKu",
      html: htmlContent,
    });

    await client.close();
    console.log("OTP email sent successfully via SMTP");
    return true;
  } catch (error) {
    console.error("SMTP send error:", error);
    return false;
  }
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: SendRegistrationOTPRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email diperlukan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already registered as auth user
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    const userExists = existingUser?.users?.some(u => u.email?.toLowerCase() === normalizedEmail);
    
    if (userExists) {
      return new Response(
        JSON.stringify({ 
          error: "Email sudah terdaftar. Silakan login atau gunakan lupa password.", 
          code: "EMAIL_EXISTS" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting - max 3 OTP requests per hour per email
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("password_reset_otps")
      .select("*", { count: "exact", head: true })
      .eq("email", normalizedEmail)
      .eq("purpose", "registration")
      .gte("created_at", oneHourAgo);

    if ((recentCount || 0) >= 3) {
      return new Response(
        JSON.stringify({ 
          error: "Terlalu banyak permintaan OTP. Coba lagi dalam 1 jam.", 
          code: "RATE_LIMIT" 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP hash
    const { error: saveError } = await supabase
      .from("password_reset_otps")
      .insert({
        email: normalizedEmail,
        otp_hash: otpHash,
        expires_at: expiresAt.toISOString(),
        purpose: "registration",
      });

    if (saveError) {
      console.error("Error saving OTP:", saveError);
      throw new Error("Gagal menyimpan OTP");
    }

    // Get email settings
    const { data: emailSettings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "email_gateway")
      .maybeSingle();

    const settings = emailSettings?.value as any;

    // Build email HTML
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">AbsensiKu</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb; border: 1px solid #e5e7eb;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Kode OTP Registrasi</h2>
          <p style="color: #4b5563;">Gunakan kode berikut untuk melanjutkan registrasi:</p>
          <div style="background: #1a1a2e; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0; border-radius: 8px; color: #ffffff;">
            ${otp}
          </div>
          <p style="color: #666; font-size: 14px;">Kode ini berlaku selama 10 menit.</p>
          <p style="color: #999; font-size: 12px;">Jika Anda tidak meminta registrasi ini, abaikan email ini.</p>
        </div>
        <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px; background: #f3f4f6; border-radius: 0 0 8px 8px;">
          <p style="margin: 0;">Email ini dikirim dari sistem AbsensiKu</p>
        </div>
      </div>
    `;

    // Send email via SMTP or Resend
    let emailSent = false;
    
    // Try Resend first if available
    if (settings?.resend_api_key) {
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${settings.resend_api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: settings.resend_from_email || "AbsensiKu <noreply@absensiku.com>",
            to: normalizedEmail,
            subject: "Kode OTP Registrasi - AbsensiKu",
            html: emailHtml,
          }),
        });

        emailSent = resendRes.ok;
        if (emailSent) {
          console.log("OTP email sent successfully via Resend");
        }
      } catch (e) {
        console.error("Resend error:", e);
      }
    }

    // Try SMTP if Resend failed or not configured
    if (!emailSent && settings) {
      emailSent = await sendEmailViaSMTP(
        normalizedEmail,
        "Kode OTP Registrasi - AbsensiKu",
        emailHtml,
        settings
      );
    }

    if (!emailSent) {
      // Delete the OTP since email failed
      await supabase
        .from("password_reset_otps")
        .delete()
        .eq("email", normalizedEmail)
        .eq("otp_hash", otpHash);
        
      return new Response(
        JSON.stringify({ 
          error: "Gagal mengirim email OTP. Pastikan konfigurasi email gateway sudah benar.",
          code: "EMAIL_FAILED"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        email: maskEmail(normalizedEmail),
        message: "Kode OTP telah dikirim ke email Anda",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-registration-otp:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Terjadi kesalahan internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
