import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  subject?: string;
  body?: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  senderEmail: string;
  senderName: string;
  useTLS: boolean;
}

interface SMTPConnectionConfig {
  hostname: string;
  port: number;
  auth: {
    username: string;
    password: string;
  };
  tls?: boolean;
}

interface GatewayAuditLogParams {
  traceId: string;
  action: string;
  userId: string | null;
  payload: Record<string, unknown>;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Gagal mengirim email";
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

const extractUserIdFromAuthHeader = (authorization: string | null): string | null => {
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadRaw = atob(parts[1]);
    const payload = JSON.parse(payloadRaw) as { sub?: string };
    if (typeof payload.sub === "string" && isUuid(payload.sub)) return payload.sub;
  } catch {
    // ignore invalid token payload
  }
  return null;
};

const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
};

const mapSmtpErrorHint = (message: string): string => {
  const lower = message.toLowerCase();
  if (
    lower.includes("auth") ||
    lower.includes("535") ||
    lower.includes("username and password not accepted")
  ) {
    return "SMTP_AUTH_FAILED";
  }
  if (
    lower.includes("connection") ||
    lower.includes("connect") ||
    lower.includes("enotfound") ||
    lower.includes("timed out")
  ) {
    return "SMTP_CONNECTION_FAILED";
  }
  if (lower.includes("certificate") || lower.includes("tls") || lower.includes("ssl")) {
    return "SMTP_TLS_FAILED";
  }
  if (lower.includes("invalid recipient") || lower.includes("recipient")) {
    return "SMTP_RECIPIENT_INVALID";
  }
  return "SMTP_SEND_FAILED";
};

const writeGatewayAuditLog = async ({ traceId, action, userId, payload }: GatewayAuditLogParams) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    await admin.from("audit_logs").insert({
      user_id: userId,
      action,
      table_name: "gateway_test",
      new_values: {
        ...payload,
        trace_id: traceId,
        channel: "email",
      },
    });
  } catch (logError) {
    logTraceError(traceId, "Failed to persist gateway email audit log", logError);
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("send-test-email");
  const userId = extractUserIdFromAuthHeader(req.headers.get("authorization"));

  try {
    const { 
      to, 
      subject = "Test Email dari AbsensiKu", 
      body = "Ini adalah email percobaan untuk memastikan konfigurasi SMTP Anda berfungsi dengan benar.",
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      senderEmail,
      senderName,
      useTLS 
    }: EmailRequest = await req.json();

    if (!to || !smtpHost || !smtpUser || !smtpPassword) {
      await writeGatewayAuditLog({
        traceId,
        action: "gateway.email.test.failed",
        userId,
        payload: {
          stage: "validation",
          reason: "MISSING_REQUIRED_FIELDS",
          to: to ? maskEmail(to) : null,
          smtp_host: smtpHost || null,
          smtp_port: smtpPort || null,
          has_smtp_user: Boolean(smtpUser),
          has_smtp_password: Boolean(smtpPassword),
        },
      });
      return new Response(
        JSON.stringify(withTrace({ error: "Parameter tidak lengkap" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validasi format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(to)) {
      await writeGatewayAuditLog({
        traceId,
        action: "gateway.email.test.failed",
        userId,
        payload: {
          stage: "validation",
          reason: "INVALID_RECIPIENT_EMAIL",
          to_raw: to,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
        },
      });
      return new Response(
        JSON.stringify(withTrace({ error: "Email tujuan tidak valid. Pastikan format email benar (contoh: nama@domain.com)" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gunakan smtpUser sebagai sender jika senderEmail tidak valid
    const validSenderEmail = senderEmail && emailRegex.test(senderEmail) ? senderEmail : smtpUser;
    const port = parseInt(smtpPort) || 587;
    
    console.log("Sending email with config:", {
      traceId,
      to: maskEmail(to),
      smtpHost, 
      port, 
      smtpUser: maskEmail(smtpUser),
      senderEmail: maskEmail(validSenderEmail),
      senderName,
      useTLS 
    });

    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    
    // Konfigurasi berbeda untuk port 465 (SSL) dan 587 (STARTTLS)
    // Port 465 = implicit TLS (langsung SSL)
    // Port 587 = STARTTLS (mulai plain lalu upgrade ke TLS)
    const connectionConfig: SMTPConnectionConfig = {
      hostname: smtpHost,
      port: port,
      auth: {
        username: smtpUser,
        password: smtpPassword,
      },
    };

    // Untuk port 465, gunakan TLS langsung
    if (port === 465) {
      connectionConfig.tls = true;
    } else if (port === 587) {
      // Untuk port 587, mulai tanpa TLS lalu STARTTLS
      connectionConfig.tls = false;
    } else {
      connectionConfig.tls = useTLS;
    }

    console.log("Connection config:", {
      traceId,
      ...connectionConfig,
      auth: { username: maskEmail(smtpUser), password: "***" },
    });
    
    const client = new SMTPClient({
      connection: connectionConfig,
    });

    await client.send({
      from: `${senderName || 'AbsensiKu'} <${validSenderEmail}>`,
      to: to,
      subject: subject,
      content: body,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">AbsensiKu</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <h2 style="color: #1f2937;">Test Email Berhasil!</h2>
            <p style="color: #4b5563; line-height: 1.6;">${body}</p>
            <div style="margin-top: 20px; padding: 15px; background: #d1fae5; border-radius: 8px;">
              <p style="color: #065f46; margin: 0;">✓ Konfigurasi SMTP Anda berfungsi dengan benar</p>
            </div>
          </div>
          <div style="padding: 15px; text-align: center; color: #6b7280; font-size: 12px;">
            <p>Email ini dikirim dari sistem AbsensiKu</p>
          </div>
        </div>
      `,
    });

    await client.close();

    await writeGatewayAuditLog({
      traceId,
      action: "gateway.email.test.success",
      userId,
      payload: {
        stage: "sent",
        to: maskEmail(to),
        smtp_host: smtpHost,
        smtp_port: port,
        smtp_user: maskEmail(smtpUser),
        sender_email: maskEmail(validSenderEmail),
        use_tls: connectionConfig.tls ?? false,
      },
    });

    return new Response(
      JSON.stringify(withTrace({ success: true, message: "Email berhasil dikirim" }, traceId)),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    logTraceError(traceId, "Error sending email", error);
    
    let errorMessage = getErrorMessage(error);
    
    // Berikan pesan error yang lebih jelas
    if (errorMessage.includes("NaN") || errorMessage.includes("connection")) {
      errorMessage = "Koneksi ke SMTP server gagal. Pastikan host, port, dan TLS setting benar. Untuk Gmail gunakan port 587.";
    } else if (errorMessage.includes("auth") || errorMessage.includes("535")) {
      errorMessage = "Autentikasi gagal. Pastikan username dan password benar. Untuk Gmail, gunakan App Password.";
    }
    
    const rawErrorText = String(error);
    const errorHint = mapSmtpErrorHint(rawErrorText);
    await writeGatewayAuditLog({
      traceId,
      action: "gateway.email.test.failed",
      userId,
      payload: {
        stage: "send",
        reason: errorHint,
        error_message: errorMessage,
        raw_error: rawErrorText.slice(0, 800),
      },
    });

    return new Response(
      JSON.stringify(withTrace({
        error: errorMessage,
        details: rawErrorText,
        error_hint: errorHint,
      }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
