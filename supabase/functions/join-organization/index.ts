import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JoinOrganizationRequest {
  invitation_code: string;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan internal";
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("join-organization");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify(withTrace({ error: "Unauthorized" }, traceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { invitation_code }: JoinOrganizationRequest = await req.json();

    if (!invitation_code) {
      return new Response(
        JSON.stringify(withTrace({ error: "Kode undangan diperlukan" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
      "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth client: validasi JWT user memakai anon key + Authorization header asli.
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      logTraceError(traceId, "Token validation failed", userError || "user_not_found");
      return new Response(
        JSON.stringify(withTrace({ error: "Token tidak valid" }, traceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin client: operasi tulis DB memakai service role.
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
          JSON.stringify(withTrace({ error: "Terlalu banyak percobaan. Coba lagi nanti.", code: "RATE_LIMITED" }, traceId)),
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
        JSON.stringify(withTrace({ error: "Kode undangan tidak valid atau sudah kadaluarsa", code: "INVALID_CODE" }, traceId)),
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
        JSON.stringify(withTrace({ error: "Anda sudah terdaftar di organisasi ini", code: "ALREADY_MEMBER" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's self registration data if exists
    const { data: selfRegData } = await supabase
      .from("self_registered_users")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Generate device ID for employee session bootstrap
    const deviceId = `WEB-${Date.now().toString(16).toUpperCase()}`;

    const normalizedInvitationEmail =
      typeof invitation.email === "string" ? invitation.email.trim().toLowerCase() : "";
    const normalizedInvitationNik = typeof invitation.nik === "string" ? invitation.nik.trim() : "";
    const normalizedUserEmail = (user.email || "").trim().toLowerCase();
    const userEmailFallback = user.email || `user-${user.id}@local.invalid`;
    const isBulkInvitationEmail = normalizedInvitationEmail === "bulk@invitation.local";
    const isPlaceholderNik =
      !normalizedInvitationNik || /^0+$/.test(normalizedInvitationNik) || /^NIK-/i.test(normalizedInvitationNik);
    const canMatchByNik = !isPlaceholderNik;
    const canMatchByEmail = normalizedInvitationEmail.length > 0 && !isBulkInvitationEmail;
    const fallbackEmail = normalizedUserEmail || normalizedInvitationEmail;
    const candidateEmail = canMatchByEmail ? normalizedInvitationEmail : fallbackEmail;
    const candidateNik = canMatchByNik ? normalizedInvitationNik : "";
    const resolvedName =
      invitation.name || selfRegData?.name || user.email?.split("@")[0] || "User";

    let existingImportedEmployee: {
      id: string;
      user_id: string | null;
      name: string;
      email: string;
      nik: string;
      phone: string | null;
      whatsapp: string | null;
      address: string | null;
      opd_id: string | null;
      office_id: string | null;
    } | null = null;

    const [existingByNikRes, existingByEmailRes] = await Promise.all([
      canMatchByNik
        ? supabase
            .from("employees")
            .select("id, user_id, name, email, nik, phone, whatsapp, address, opd_id, office_id")
            .eq("tenant_id", invitation.tenant_id)
            .eq("nik", candidateNik)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      candidateEmail
        ? supabase
            .from("employees")
            .select("id, user_id, name, email, nik, phone, whatsapp, address, opd_id, office_id")
            .eq("tenant_id", invitation.tenant_id)
            .ilike("email", candidateEmail)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (existingByNikRes.error) {
      logTraceError(traceId, "Error resolving imported employee by NIK", existingByNikRes.error);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memeriksa data pegawai existing", details: existingByNikRes.error.message }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (existingByEmailRes.error) {
      logTraceError(traceId, "Error resolving imported employee by email", existingByEmailRes.error);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memeriksa data pegawai existing", details: existingByEmailRes.error.message }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    existingImportedEmployee =
      (existingByNikRes.data as typeof existingImportedEmployee) ??
      (existingByEmailRes.data as typeof existingImportedEmployee);

    let employeeId: string;
    if (existingImportedEmployee) {
      if (existingImportedEmployee.user_id && existingImportedEmployee.user_id !== user.id) {
        return new Response(
          JSON.stringify(
            withTrace(
              {
                error: "Data pegawai sudah terhubung ke akun lain. Hubungi admin organisasi.",
                code: "EMPLOYEE_ALREADY_LINKED",
              },
              traceId
            )
          ),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: updatedEmployee, error: updateEmployeeError } = await supabase
        .from("employees")
        .update({
          user_id: user.id,
          name: existingImportedEmployee.name || resolvedName,
          email: existingImportedEmployee.email || candidateEmail || userEmailFallback,
          nik: existingImportedEmployee.nik || candidateNik || `NIK-${Date.now()}`,
          phone: existingImportedEmployee.phone || invitation.phone || selfRegData?.whatsapp || null,
          whatsapp: existingImportedEmployee.whatsapp || selfRegData?.whatsapp || invitation.phone || null,
          address: existingImportedEmployee.address || selfRegData?.address || null,
          opd_id: existingImportedEmployee.opd_id || invitation.opd_id,
          office_id: existingImportedEmployee.office_id || invitation.office_id,
          android_id: deviceId,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingImportedEmployee.id)
        .select("id")
        .single();

      if (updateEmployeeError) {
        logTraceError(traceId, "Error linking existing employee", updateEmployeeError);
        return new Response(
          JSON.stringify(withTrace({ error: "Gagal menghubungkan akun ke data pegawai existing", details: updateEmployeeError.message }, traceId)),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      employeeId = updatedEmployee.id;
    } else {
      const { data: newEmployee, error: empError } = await supabase
        .from("employees")
        .insert({
          user_id: user.id,
          tenant_id: invitation.tenant_id,
          name: resolvedName,
          email: candidateEmail || userEmailFallback,
          nik: candidateNik || `NIK-${Date.now()}`,
          phone: invitation.phone || selfRegData?.whatsapp,
          whatsapp: selfRegData?.whatsapp || invitation.phone,
          address: selfRegData?.address,
          opd_id: invitation.opd_id,
          office_id: invitation.office_id,
          android_id: deviceId,
          is_active: true,
        })
        .select("id")
        .single();

      if (empError) {
        logTraceError(traceId, "Error creating employee", empError);
        return new Response(
          JSON.stringify(withTrace({ error: "Gagal membuat data pegawai", details: empError.message }, traceId)),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      employeeId = newEmployee.id;
    }

    // Assign pegawai role
    const { error: roleError } = await supabase.from("user_roles").upsert(
      {
        user_id: user.id,
        tenant_id: invitation.tenant_id,
        role: "pegawai",
      },
      {
        onConflict: "user_id,tenant_id,role",
        ignoreDuplicates: true,
      }
    );
    if (roleError) {
      logTraceError(traceId, "Error assigning user role", roleError);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal menyiapkan role pegawai", details: roleError.message }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const joinAuditAction = existingImportedEmployee
      ? "INVITATION_JOIN_LINK_EXISTING_EMPLOYEE"
      : "INVITATION_JOIN_CREATE_NEW_EMPLOYEE";

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

    const { error: invitationAuditError } = await supabase.from("audit_logs").insert({
      tenant_id: invitation.tenant_id,
      user_id: user.id,
      employee_id: employeeId,
      action: joinAuditAction,
      table_name: "employee_invitations",
      record_id: invitation.id,
      new_values: {
        event: joinAuditAction,
        invitation_id: invitation.id,
        invitation_code: invitation.invitation_code,
        employee_id: employeeId,
        linked_existing_employee: Boolean(existingImportedEmployee),
        existing_employee_id: existingImportedEmployee?.id ?? null,
        user_id: user.id,
        trace_id: traceId,
        joined_at: new Date().toISOString(),
      },
    });

    if (invitationAuditError) {
      logTraceError(traceId, "Error writing invitation join audit log", invitationAuditError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        employee_id: employeeId,
        tenant_name: invitation.tenants?.name,
        message: `Berhasil bergabung ke ${invitation.tenants?.name}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    logTraceError(traceId, "Error in join-organization", error);
    return new Response(
      JSON.stringify(withTrace({ error: getErrorMessage(error) }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
