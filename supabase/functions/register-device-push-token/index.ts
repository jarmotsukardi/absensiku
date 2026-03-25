import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RegisterDevicePushTokenRequest {
  installation_id?: string;
  fcm_token?: string | null;
  device_id?: string | null;
  device_model?: string | null;
  app_version?: string | null;
  notification_permission?: string | null;
  app_code?: string | null;
  active?: boolean | null;
}

const toStringSafe = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizePermissionState = (value: unknown): "granted" | "denied" | "unknown" => {
  const normalized = toStringSafe(value).toLowerCase();
  if (normalized === "granted" || normalized === "denied") return normalized;
  return "unknown";
};

const getTenantIdFromRoles = (rows: Array<{ tenant_id: string | null }>): string | null => {
  for (const row of rows) {
    if (typeof row.tenant_id === "string" && row.tenant_id.trim()) {
      return row.tenant_id;
    }
  }
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("register-device-push-token");

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify(withTrace({ error: "Method tidak diizinkan" }, traceId)),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
      "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(
        JSON.stringify(withTrace({ error: "Konfigurasi auth belum lengkap" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!authorization) {
      return new Response(
        JSON.stringify(withTrace({ error: "Authorization tidak ditemukan" }, traceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

    const body = (await req.json()) as RegisterDevicePushTokenRequest;
    const installationId = toStringSafe(body.installation_id);
    const fcmToken = toStringSafe(body.fcm_token);
    const deviceId = toStringSafe(body.device_id);
    const deviceModel = toStringSafe(body.device_model);
    const appVersion = toStringSafe(body.app_version);
    const appCode = toStringSafe(body.app_code);
    const active = body.active !== false;
    const permissionState = normalizePermissionState(body.notification_permission);

    if (!installationId) {
      return new Response(
        JSON.stringify(withTrace({ error: "installation_id wajib diisi" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (active && !fcmToken) {
      return new Response(
        JSON.stringify(withTrace({ error: "fcm_token wajib diisi saat aktivasi" }, traceId)),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [
      { data: roleRows, error: roleError },
      { data: employeeRow, error: employeeError },
      { data: attendanceSecurityRow, error: attendanceSecurityError },
    ] = await Promise.all([
      admin
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id),
      admin
        .from("employees")
        .select("id, tenant_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("system_settings")
        .select("value")
        .eq("key", "attendance_security")
        .maybeSingle(),
    ]);

    if (roleError) throw roleError;
    if (employeeError) throw employeeError;
    if (attendanceSecurityError) throw attendanceSecurityError;

    const expectedAppCode =
      attendanceSecurityRow?.value &&
      typeof attendanceSecurityRow.value === "object" &&
      !Array.isArray(attendanceSecurityRow.value) &&
      typeof (attendanceSecurityRow.value as Record<string, unknown>).native_app_code === "string"
        ? toStringSafe((attendanceSecurityRow.value as Record<string, unknown>).native_app_code)
        : "";

    if (expectedAppCode && appCode !== expectedAppCode) {
      return new Response(
        JSON.stringify(withTrace({ error: "Kode aplikasi native tidak valid" }, traceId)),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const employeeId = employeeRow?.id ?? null;
    const tenantId = employeeRow?.tenant_id ?? getTenantIdFromRoles((roleRows ?? []) as Array<{ tenant_id: string | null }>);
    const nowIso = new Date().toISOString();

    if (!active) {
      const { error: deactivateError } = await admin
        .from("user_push_devices")
        .update({
          tenant_id: tenantId,
          employee_id: employeeId,
          device_id: deviceId || null,
          device_model: deviceModel || null,
          app_version: appVersion || null,
          app_code: appCode || null,
          notification_permission_state: permissionState,
          fcm_token: fcmToken || null,
          is_active: false,
          last_seen_at: nowIso,
        })
        .eq("user_id", user.id)
        .eq("platform", "android")
        .eq("installation_id", installationId);

      if (deactivateError) throw deactivateError;

      return new Response(
        JSON.stringify(withTrace({
          ok: true,
          active: false,
          installation_id: installationId,
        }, traceId)),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = {
      user_id: user.id,
      tenant_id: tenantId,
      employee_id: employeeId,
      installation_id: installationId,
      platform: "android",
      device_id: deviceId || null,
      device_model: deviceModel || null,
      app_version: appVersion || null,
      app_code: appCode || null,
      fcm_token: fcmToken,
      notification_permission_state: permissionState,
      is_active: true,
      last_seen_at: nowIso,
      last_registered_at: nowIso,
      last_push_error_at: null,
      last_push_error_code: null,
      last_push_error_message: null,
    };

    const { error: upsertError } = await admin
      .from("user_push_devices")
      .upsert(payload, { onConflict: "user_id,platform,installation_id" });
    if (upsertError) throw upsertError;

    const { error: deactivateOthersError } = await admin
      .from("user_push_devices")
      .update({
        is_active: false,
        last_seen_at: nowIso,
      })
      .eq("platform", "android")
      .eq("installation_id", installationId)
      .neq("user_id", user.id);
    if (deactivateOthersError) throw deactivateOthersError;

    return new Response(
      JSON.stringify(withTrace({
        ok: true,
        active: true,
        installation_id: installationId,
        tenant_id: tenantId,
        employee_id: employeeId,
      }, traceId)),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    logTraceError(traceId, "Gagal memproses registrasi token push", error);
    const message = error instanceof Error ? error.message : "Terjadi kesalahan internal";
    return new Response(
      JSON.stringify(withTrace({ error: message }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
