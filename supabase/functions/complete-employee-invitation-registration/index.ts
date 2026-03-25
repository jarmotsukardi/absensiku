import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompleteEmployeeInvitationRegistrationRequest {
  invitation_code: string;
  email: string;
  name: string;
  whatsapp?: string | null;
  address?: string | null;
  password: string;
  device_id?: string | null;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan internal";
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isPlaceholderNik = (nik: string | null | undefined): boolean => {
  const normalized = (nik || "").trim();
  return !normalized || /^0+$/.test(normalized) || /^NIK-/i.test(normalized);
};

const isBulkInvitationEmail = (email: string | null | undefined): boolean =>
  normalizeEmail(email || "") === "bulk@invitation.local";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("complete-employee-invitation-registration");

  try {
    const {
      invitation_code,
      email,
      name,
      whatsapp,
      address,
      password,
      device_id,
    }: CompleteEmployeeInvitationRegistrationRequest = await req.json();

    const normalizedInviteCode = String(invitation_code || "").trim();
    const normalizedEmail = normalizeEmail(email || "");
    const normalizedName = String(name || "").trim();
    const normalizedWhatsapp = String(whatsapp || "").trim() || null;
    const normalizedAddress = String(address || "").trim() || null;
    const normalizedPassword = String(password || "");
    const normalizedDeviceId =
      String(device_id || "").trim() || `WEB-${Date.now().toString(16).toUpperCase()}`;

    if (!normalizedInviteCode || !normalizedEmail || !normalizedName || !normalizedPassword) {
      return new Response(
        JSON.stringify(withTrace({ error: "Data registrasi undangan tidak lengkap" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (normalizedPassword.length < 6) {
      return new Response(
        JSON.stringify(withTrace({ error: "Password minimal 6 karakter" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: invitation, error: invitationError } = await supabase
      .from("employee_invitations")
      .select("id, tenant_id, invitation_code, status, is_used, expires_at, verified_at, name, email, phone, nik, office_id, opd_id, archived_at")
      .eq("invitation_code", normalizedInviteCode)
      .maybeSingle();

    if (invitationError) {
      logTraceError(traceId, "Error fetching invitation", invitationError);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal memeriksa undangan", code: "INVITATION_LOOKUP_FAILED" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!invitation || invitation.archived_at) {
      return new Response(
        JSON.stringify(withTrace({ error: "Kode undangan tidak valid", code: "INVALID_CODE" }, traceId)),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) {
      return new Response(
        JSON.stringify(withTrace({ error: "Kode undangan sudah kedaluwarsa", code: "EXPIRED_CODE" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (invitation.is_used) {
      return new Response(
        JSON.stringify(withTrace({ error: "Kode undangan sudah digunakan", code: "USED_CODE" }, traceId)),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (invitation.status !== "verified") {
      return new Response(
        JSON.stringify(
          withTrace(
            {
              error: "Akun masih menunggu aktivasi admin. Minta admin organisasi memverifikasi undangan terlebih dahulu.",
              code: "PENDING_ACTIVATION",
            },
            traceId,
          ),
        ),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: normalizedPassword,
      email_confirm: true,
      user_metadata: {
        name: normalizedName,
        registration_type: "employee_invitation",
        invitation_code: normalizedInviteCode,
      },
    });

    if (createUserError || !createdUser.user) {
      const normalizedError = (createUserError?.message || "").toLowerCase();
      if (normalizedError.includes("already") || normalizedError.includes("registered")) {
        return new Response(
          JSON.stringify(
            withTrace(
              {
                error: "Email sudah terdaftar. Silakan login lalu gunakan fitur Bergabung ke Organisasi.",
                code: "EMAIL_EXISTS",
              },
              traceId,
            ),
          ),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      logTraceError(traceId, "Error creating auth user", createUserError);
      return new Response(
        JSON.stringify(withTrace({ error: "Gagal membuat akun pegawai", code: "CREATE_USER_FAILED" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userId = createdUser.user.id;

    try {
      const invitationNik = typeof invitation.nik === "string" ? invitation.nik.trim() : "";
      const invitationEmail = typeof invitation.email === "string" ? normalizeEmail(invitation.email) : "";
      const candidateNik = isPlaceholderNik(invitationNik) ? "" : invitationNik;
      const canMatchByEmail = !isBulkInvitationEmail(invitationEmail);

      const [existingByNikRes, existingByEmailRes] = await Promise.all([
        candidateNik
          ? supabase
              .from("employees")
              .select("id, user_id, name, email, nik, phone, whatsapp, address, opd_id, office_id")
              .eq("tenant_id", invitation.tenant_id)
              .eq("nik", candidateNik)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        canMatchByEmail
          ? supabase
              .from("employees")
              .select("id, user_id, name, email, nik, phone, whatsapp, address, opd_id, office_id")
              .eq("tenant_id", invitation.tenant_id)
              .ilike("email", invitationEmail || normalizedEmail)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (existingByNikRes.error) {
        throw existingByNikRes.error;
      }
      if (existingByEmailRes.error) {
        throw existingByEmailRes.error;
      }

      const existingEmployee =
        existingByNikRes.data ??
        existingByEmailRes.data;

      let employeeId: string;
      if (existingEmployee) {
        if (existingEmployee.user_id && existingEmployee.user_id !== userId) {
          return new Response(
            JSON.stringify(
              withTrace(
                {
                  error: "Data pegawai sudah terhubung ke akun lain. Hubungi admin organisasi.",
                  code: "EMPLOYEE_ALREADY_LINKED",
                },
                traceId,
              ),
            ),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const { data: updatedEmployee, error: updateEmployeeError } = await supabase
          .from("employees")
          .update({
            user_id: userId,
            name: existingEmployee.name || normalizedName,
            email: existingEmployee.email || normalizedEmail,
            nik: existingEmployee.nik || candidateNik || `NIK-${Date.now()}`,
            phone: existingEmployee.phone || invitation.phone || normalizedWhatsapp,
            whatsapp: existingEmployee.whatsapp || normalizedWhatsapp || invitation.phone || null,
            address: existingEmployee.address || normalizedAddress,
            opd_id: existingEmployee.opd_id || invitation.opd_id,
            office_id: existingEmployee.office_id || invitation.office_id,
            android_id: normalizedDeviceId,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingEmployee.id)
          .select("id")
          .single();

        if (updateEmployeeError || !updatedEmployee) {
          throw updateEmployeeError || new Error("Gagal menghubungkan akun ke pegawai existing");
        }

        employeeId = updatedEmployee.id;
      } else {
        const { data: newEmployee, error: createEmployeeError } = await supabase
          .from("employees")
          .insert({
            user_id: userId,
            tenant_id: invitation.tenant_id,
            name: normalizedName,
            email: normalizedEmail,
            nik: candidateNik || `NIK-${Date.now()}`,
            phone: normalizedWhatsapp || invitation.phone || null,
            whatsapp: normalizedWhatsapp || invitation.phone || null,
            address: normalizedAddress,
            opd_id: invitation.opd_id,
            office_id: invitation.office_id,
            android_id: normalizedDeviceId,
            is_active: true,
          })
          .select("id")
          .single();

        if (createEmployeeError || !newEmployee) {
          throw createEmployeeError || new Error("Gagal membuat data pegawai");
        }

        employeeId = newEmployee.id;
      }

      const { error: roleError } = await supabase.from("user_roles").upsert(
        {
          user_id: userId,
          tenant_id: invitation.tenant_id,
          role: "pegawai",
        },
        {
          onConflict: "user_id,tenant_id,role",
          ignoreDuplicates: true,
        },
      );

      if (roleError) {
        throw roleError;
      }

      const nowIso = new Date().toISOString();
      const { error: updateInvitationError } = await supabase
        .from("employee_invitations")
        .update({
          status: "verified",
          is_used: true,
          used_at: nowIso,
          verified_at: invitation.verified_at || nowIso,
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedWhatsapp || invitation.phone || null,
          updated_at: nowIso,
        })
        .eq("id", invitation.id);

      if (updateInvitationError) {
        throw updateInvitationError;
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        tenant_id: invitation.tenant_id,
        user_id: userId,
        employee_id: employeeId,
        action: "INVITATION_REGISTER_COMPLETE",
        table_name: "employee_invitations",
        record_id: invitation.id,
        new_values: {
          event: "INVITATION_REGISTER_COMPLETE",
          invitation_id: invitation.id,
          invitation_code: normalizedInviteCode,
          employee_id: employeeId,
          user_id: userId,
          trace_id: traceId,
          completed_at: nowIso,
        },
      });

      if (auditError) {
        logTraceError(traceId, "Error writing invitation registration audit log", auditError);
      }

      return new Response(
        JSON.stringify(
          withTrace(
            {
              success: true,
              user_id: userId,
              employee_id: employeeId,
              message: "Registrasi pegawai berhasil. Silakan login.",
            },
            traceId,
          ),
        ),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (flowError) {
      logTraceError(traceId, "Error completing invitation registration flow", flowError);
      await supabase.auth.admin.deleteUser(userId).catch((deleteError) => {
        logTraceError(traceId, "Error rolling back auth user", deleteError);
      });

      return new Response(
        JSON.stringify(withTrace({ error: getErrorMessage(flowError), code: "COMPLETE_FLOW_FAILED" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error: unknown) {
    logTraceError(traceId, "Error in complete-employee-invitation-registration", error);
    return new Response(
      JSON.stringify(withTrace({ error: getErrorMessage(error) }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
