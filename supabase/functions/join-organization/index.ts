import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JoinOrganizationRequest {
  invitation_code: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { invitation_code }: JoinOrganizationRequest = await req.json();

    if (!invitation_code) {
      return new Response(
        JSON.stringify({ error: "Kode undangan diperlukan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Token tidak valid" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit: max 5 join attempts per hour per user
    const { data: rateCheck } = await supabase
      .from("rate_limit_otp")
      .select("*")
      .eq("identifier", user.id)
      .eq("attempt_type", "join_org")
      .maybeSingle();

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3600000);

    if (rateCheck) {
      if (new Date(rateCheck.first_attempt_at) < hourAgo) {
        await supabase.from("rate_limit_otp")
          .update({ attempt_count: 1, first_attempt_at: now.toISOString(), last_attempt_at: now.toISOString() })
          .eq("identifier", user.id)
          .eq("attempt_type", "join_org");
      } else if (rateCheck.attempt_count >= 5) {
        return new Response(
          JSON.stringify({ error: "Terlalu banyak percobaan. Coba lagi nanti.", code: "RATE_LIMITED" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        await supabase.from("rate_limit_otp")
          .update({ attempt_count: rateCheck.attempt_count + 1, last_attempt_at: now.toISOString() })
          .eq("identifier", user.id)
          .eq("attempt_type", "join_org");
      }
    } else {
      await supabase.from("rate_limit_otp")
        .insert({ identifier: user.id, attempt_type: "join_org" });
    }

    // Find valid invitation
    const { data: invitation, error: invError } = await supabase
      .from("employee_invitations")
      .select("*, tenants:tenant_id(name, code, logo_url)")
      .eq("invitation_code", invitation_code.trim())
      .eq("status", "pending")
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    if (invError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Kode undangan tidak valid atau sudah kadaluarsa", code: "INVALID_CODE" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already has employee record in this tenant
    const { data: existingEmployee } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .eq("tenant_id", invitation.tenant_id)
      .maybeSingle();

    if (existingEmployee) {
      return new Response(
        JSON.stringify({ error: "Anda sudah terdaftar di organisasi ini", code: "ALREADY_MEMBER" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's self registration data if exists
    const { data: selfRegData } = await supabase
      .from("self_registered_users")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Generate device ID for new employee
    const deviceId = `WEB-${Date.now().toString(16).toUpperCase()}`;

    // Create employee record
    const { data: newEmployee, error: empError } = await supabase
      .from("employees")
      .insert({
        user_id: user.id,
        tenant_id: invitation.tenant_id,
        name: invitation.name || selfRegData?.name || user.email?.split("@")[0] || "User",
        email: invitation.email || user.email,
        nik: invitation.nik || `NIK-${Date.now()}`,
        phone: invitation.phone || selfRegData?.whatsapp,
        whatsapp: selfRegData?.whatsapp,
        address: selfRegData?.address,
        opd_id: invitation.opd_id,
        office_id: invitation.office_id,
        android_id: deviceId,
        is_active: true,
      })
      .select()
      .single();

    if (empError) {
      console.error("Error creating employee:", empError);
      return new Response(
        JSON.stringify({ error: "Gagal membuat data pegawai", details: empError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Assign pegawai role
    await supabase.from("user_roles").insert({
      user_id: user.id,
      tenant_id: invitation.tenant_id,
      role: "pegawai",
    });

    // Mark invitation as used
    await supabase
      .from("employee_invitations")
      .update({
        status: "verified",
        is_used: true,
        used_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    // Update self registration status if exists
    if (selfRegData) {
      await supabase
        .from("self_registered_users")
        .update({ status: "joined_organization" })
        .eq("id", selfRegData.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        employee_id: newEmployee.id,
        tenant_name: invitation.tenants?.name,
        message: `Berhasil bergabung ke ${invitation.tenants?.name}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in join-organization:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Terjadi kesalahan internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
