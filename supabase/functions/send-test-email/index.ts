import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
      return new Response(
        JSON.stringify({ error: "Parameter tidak lengkap" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validasi format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ error: "Email tujuan tidak valid. Pastikan format email benar (contoh: nama@domain.com)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gunakan smtpUser sebagai sender jika senderEmail tidak valid
    const validSenderEmail = senderEmail && emailRegex.test(senderEmail) ? senderEmail : smtpUser;
    const port = parseInt(smtpPort) || 587;
    
    console.log("Sending email with config:", { 
      to, 
      smtpHost, 
      port, 
      smtpUser, 
      senderEmail: validSenderEmail, 
      senderName,
      useTLS 
    });

    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
    
    // Konfigurasi berbeda untuk port 465 (SSL) dan 587 (STARTTLS)
    // Port 465 = implicit TLS (langsung SSL)
    // Port 587 = STARTTLS (mulai plain lalu upgrade ke TLS)
    const connectionConfig: any = {
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

    console.log("Connection config:", { ...connectionConfig, auth: { username: smtpUser, password: "***" } });
    
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

    return new Response(
      JSON.stringify({ success: true, message: "Email berhasil dikirim" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending email:", error);
    
    let errorMessage = error.message || "Gagal mengirim email";
    
    // Berikan pesan error yang lebih jelas
    if (errorMessage.includes("NaN") || errorMessage.includes("connection")) {
      errorMessage = "Koneksi ke SMTP server gagal. Pastikan host, port, dan TLS setting benar. Untuk Gmail gunakan port 587.";
    } else if (errorMessage.includes("auth") || errorMessage.includes("535")) {
      errorMessage = "Autentikasi gagal. Pastikan username dan password benar. Untuk Gmail, gunakan App Password.";
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error.toString()
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
