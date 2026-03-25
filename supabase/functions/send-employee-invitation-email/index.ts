import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendEmployeeInvitationEmailRequest {
  invitation_id: string;
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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan internal";
};

const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
};

const buildEmployeeInvitationHtml = ({
  tenantName,
  employeeName,
  invitationCode,
  invitationLink,
  expiresAtLabel,
}: {
  tenantName: string;
  employeeName: string;
  invitationCode: string;
  invitationLink: string;
  expiresAtLabel: string;
}) => `
  <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 20px; background: #f8fafc;">
    <div style="background: linear-gradient(135deg, #1d4ed8, #1e293b); padding: 24px; border-radius: 18px 18px 0 0; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 28px;">AbsensiKu</h1>
      <p style="margin: 10px 0 0; color: #dbeafe; font-size: 14px;">Undangan Aktivasi Akun Pegawai</p>
    </div>
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 18px 18px; padding: 28px;">
      <p style="color: #334155; font-size: 16px; margin-top: 0;">Halo ${employeeName || "Pegawai"},</p>
      <p style="color: #475569; line-height: 1.7;">
        Anda menerima undangan untuk bergabung ke organisasi <strong>${tenantName}</strong> di aplikasi AbsensiKu.
      </p>
      <div style="margin: 24px 0; padding: 18px; border-radius: 16px; background: #eff6ff; border: 1px solid #bfdbfe;">
        <p style="margin: 0 0 8px; color: #1e3a8a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">Kode Undangan</p>
        <p style="margin: 0; color: #0f172a; font-size: 24px; font-weight: 700; letter-spacing: 0.16em;">${invitationCode}</p>
      </div>
      <p style="color: #475569; line-height: 1.7;">
        Berlaku sampai <strong>${expiresAtLabel}</strong>. Anda bisa menggunakan kode ini di aplikasi Android AbsensiKu pada menu <strong>Daftar &gt; Undangan</strong>, atau buka tautan berikut:
      </p>
      <p style="margin: 20px 0;">
        <a href="${invitationLink}" style="display: inline-block; background: #1d4ed8; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 12px; font-weight: 600;">
          Buka Undangan Pegawai
        </a>
      </p>
      <p style="color: #64748b; font-size: 13px; line-height: 1.6; word-break: break-word;">
        Jika tombol tidak berfungsi, salin tautan ini ke browser Anda:<br />
        <a href="${invitationLink}" style="color: #1d4ed8;">${invitationLink}</a>
      </p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
        Jika Anda tidak merasa menerima undangan ini, abaikan email ini dan hubungi admin organisasi Anda.
      </p>
    </div>
  </div>
`;

const sendEmailViaSMTP = async (
  to: string,
  subject: string,
  htmlContent: string,
  settings: Record<string, unknown>,
): Promise<boolean> => {
  try {
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");

    const smtpHost =
      (typeof settings["smtpHost"] === "string" ? settings["smtpHost"] : undefined) ||
      (typeof settings["smtp_host"] === "string" ? settings["smtp_host"] : undefined) ||
      "";
    const smtpPortRaw = settings["smtpPort"] ?? settings["smtp_port"];
    const smtpPort = parseInt(String(smtpPortRaw ?? "")) || 465;
    const smtpUser =
      (typeof settings["smtpUser"] === "string" ? settings["smtpUser"] : undefined) ||
      (typeof settings["smtp_user"] === "string" ? settings["smtp_user"] : undefined) ||
      "";
    const smtpPassword =
      (typeof settings["smtpPassword"] === "string" ? settings["smtpPassword"] : undefined) ||
      (typeof settings["smtp_password"] === "string" ? settings["smtp_password"] : undefined) ||
      "";
    const senderEmail =
      (typeof settings["senderEmail"] === "string" ? settings["senderEmail"] : undefined) ||
      (typeof settings["sender_email"] === "string" ? settings["sender_email"] : undefined) ||
      smtpUser;
    const senderName =
      (typeof settings["senderName"] === "string" ? settings["senderName"] : undefined) ||
      (typeof settings["sender_name"] === "string" ? settings["sender_name"] : undefined) ||
      "AbsensiKu";

    if (!smtpHost || !smtpUser || !smtpPassword) return false;

    const connectionConfig: SMTPConnectionConfig = {
      hostname: smtpHost,
      port: smtpPort,
      auth: {
        username: smtpUser,
        password: smtpPassword,
      },
    };

    if (smtpPort === 465) connectionConfig.tls = true;
    else if (smtpPort === 587) connectionConfig.tls = false;
    else connectionConfig.tls = typeof settings["useTLS"] === "boolean" ? settings["useTLS"] : true;

    const client = new SMTPClient({ connection: connectionConfig });
    await client.send({
      from: `${senderName} <${senderEmail}>`,
      to,
      subject,
      content: "Undangan pegawai AbsensiKu",
      html: htmlContent,
    });
    return true;
  } catch {
    return false;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("send-employee-invitation-email");

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify(withTrace({ error: "Method tidak diizinkan" }, traceId)),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
      return new Response(
        JSON.stringify(withTrace({ error: "Konfigurasi auth belum lengkap" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await authed.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify(withTrace({ error: "Sesi pengguna tidak valid" }, traceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as SendEmployeeInvitationEmailRequest;
    const invitationId = String(body?.invitation_id || "").trim();
    if (!invitationId) {
      return new Response(
        JSON.stringify(withTrace({ error: "invitation_id wajib diisi" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roleRows, error: roleError } = await admin
      .from("user_roles")
      .select("tenant_id, role")
      .eq("user_id", user.id);
    if (roleError) throw roleError;

    const allowedTenantIds = new Set(
      (roleRows || [])
        .filter((row) => row.tenant_id && ["admin_instansi", "operator_instansi", "super_admin"].includes(String(row.role || "")))
        .map((row) => String(row.tenant_id)),
    );

    const { data: invitation, error: invitationError } = await admin
      .from("employee_invitations")
      .select(`
        id,
        tenant_id,
        invitation_code,
        email,
        name,
        status,
        expires_at,
        invitation_type,
        tenants:tenant_id (
          name
        )
      `)
      .eq("id", invitationId)
      .maybeSingle();
    if (invitationError) throw invitationError;
    if (!invitation) {
      return new Response(
        JSON.stringify(withTrace({ error: "Undangan tidak ditemukan" }, traceId)),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!allowedTenantIds.has(String(invitation.tenant_id))) {
      return new Response(
        JSON.stringify(withTrace({ error: "Anda tidak berhak mengirim undangan ini" }, traceId)),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (String(invitation.invitation_type) !== "individual") {
      return new Response(
        JSON.stringify(withTrace({ error: "Email hanya tersedia untuk undangan individual" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recipientEmail = String(invitation.email || "").trim().toLowerCase();
    if (!recipientEmail) {
      return new Response(
        JSON.stringify(withTrace({ error: "Email penerima undangan belum tersedia" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: gatewaySetting, error: gatewayError } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "email_gateway")
      .maybeSingle();
    if (gatewayError) throw gatewayError;
    const settings = (gatewaySetting?.value as Record<string, unknown> | null) ?? null;
    if (!settings) {
      return new Response(
        JSON.stringify(withTrace({ error: "Konfigurasi email gateway belum tersedia" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const appBaseUrl = Deno.env.get("PUBLIC_APP_URL") || "https://absensipro.com";
    const invitationLink = `${appBaseUrl.replace(/\/+$/, "")}/employee/login?invite=${encodeURIComponent(String(invitation.invitation_code))}`;
    const tenantName = String((invitation.tenants as { name?: string } | null)?.name || "Organisasi Anda");
    const expiresAtLabel = invitation.expires_at
      ? new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" }).format(new Date(String(invitation.expires_at)))
      : "-";
    const html = buildEmployeeInvitationHtml({
      tenantName,
      employeeName: String(invitation.name || "Pegawai"),
      invitationCode: String(invitation.invitation_code),
      invitationLink,
      expiresAtLabel,
    });
    const subject = `Undangan Aktivasi Akun Pegawai - ${tenantName}`;

    let emailSent = false;
    const resendApiKey = typeof settings["resend_api_key"] === "string" ? settings["resend_api_key"] : "";
    const resendFromEmail = typeof settings["resend_from_email"] === "string"
      ? settings["resend_from_email"]
      : "AbsensiKu <noreply@absensiku.com>";

    if (resendApiKey) {
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: resendFromEmail,
            to: recipientEmail,
            subject,
            html,
          }),
        });
        emailSent = resendRes.ok;
      } catch (resendError) {
        logTraceError(traceId, "Resend send invitation email failed", resendError);
      }
    }

    if (!emailSent) {
      emailSent = await sendEmailViaSMTP(recipientEmail, subject, html, settings);
    }

    if (!emailSent) {
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal mengirim email undangan. Pastikan konfigurasi email gateway aktif." }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await admin.from("audit_logs").insert({
      tenant_id: invitation.tenant_id,
      user_id: user.id,
      action: "INVITATION_SEND_EMAIL",
      table_name: "employee_invitations",
      record_id: invitation.id,
      new_values: {
        trace_id: traceId,
        email: recipientEmail,
        invitation_code: invitation.invitation_code,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        email: maskEmail(recipientEmail),
        message: "Email undangan berhasil dikirim",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    logTraceError(traceId, "Unhandled send-employee-invitation-email error", error);
    return new Response(
      JSON.stringify(withTrace({ error: getErrorMessage(error) }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
