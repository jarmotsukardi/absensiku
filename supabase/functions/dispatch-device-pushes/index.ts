import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTraceId, logTraceError, withTrace } from "../_shared/error-utils.ts";
import {
  isFirebaseMessagingConfigured,
  sendFirebaseDataMessage,
} from "../_shared/firebase-fcm.ts";

type JsonObject = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const DEFAULT_NOTIFICATION_SOURCES = ["streak_invoice_created", "billing_grace_notifier", "org_notification", "admin_broadcast"];
const DEFAULT_TARGET_URL = "/employee/dashboard?tab=notifications";
const ORG_NOTIFICATION_SOURCE = "org_notification";

interface DispatchRequest {
  tenant_id?: string;
  user_id?: string;
  notification_id?: string;
  notification_ids?: string[];
  notification_sources?: string[];
  dry_run?: boolean;
  limit?: number;
}

interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  metadata: JsonObject | null;
  created_at: string;
  is_read: boolean;
}

interface UserPushDeviceRow {
  id: string;
  user_id: string;
  tenant_id: string | null;
  installation_id: string;
  platform: string;
  device_model: string | null;
  fcm_token: string | null;
  is_active: boolean | null;
  notification_permission_state: string | null;
}

interface DeliveryRow {
  notification_id: string;
  user_push_device_id: string;
}

const toStringSafe = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeSourceList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return DEFAULT_NOTIFICATION_SOURCES;
  const normalized = value
    .map((item) => toStringSafe(item))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : DEFAULT_NOTIFICATION_SOURCES;
};

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => toStringSafe(item))
        .filter((item) => item.length > 0),
    ),
  );
};

const resolveTargetUrl = (link: string | null): string => {
  const normalized = toStringSafe(link);
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return normalized;
  return DEFAULT_TARGET_URL;
};

const summarizeSource = (metadata: JsonObject | null): string =>
  toStringSafe(metadata?.source) || "notification";

const canPushSource = (metadata: JsonObject | null, allowedSources: Set<string>): boolean =>
  allowedSources.has(summarizeSource(metadata));

const shouldDeactivateDevice = (errorCode: string): boolean =>
  ["UNREGISTERED", "NOT_FOUND"].includes(errorCode.toUpperCase());

const buildBillingLogPayload = (params: {
  notification: NotificationRow;
  tenantId: string | null;
  invoiceId: string | null;
  successCount: number;
  failedCount: number;
  traceId: string;
}): JsonObject | null => {
  if (!params.tenantId || !params.invoiceId) return null;
  return {
    tenant_id: params.tenantId,
    invoice_id: params.invoiceId,
    notification_type: "PUSH_ANDROID",
    recipient: `android:${params.successCount + params.failedCount}`,
    subject: params.notification.title,
    message: params.notification.message,
    status: params.successCount > 0 ? "SENT" : "FAILED",
    sent_at: params.successCount > 0 ? new Date().toISOString() : null,
    error_message: params.failedCount > 0 && params.successCount === 0 ? "Semua device gagal menerima push Android" : null,
    metadata: {
      source: summarizeSource(params.notification.metadata),
      notification_id: params.notification.id,
      trace_id: params.traceId,
      success_count: params.successCount,
      failed_count: params.failedCount,
    },
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = createTraceId("dispatch-device-pushes");

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify(withTrace({ error: "Method tidak diizinkan" }, traceId)),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const pushCronSecret = toStringSafe(Deno.env.get("PUSH_DISPATCHER_SECRET")) ||
      toStringSafe(Deno.env.get("BILLING_NOTIFIER_SECRET"));

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify(withTrace({ error: "Konfigurasi Supabase belum lengkap" }, traceId)),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json().catch(() => ({}))) as DispatchRequest;
    const tenantFilter = toStringSafe(body.tenant_id) || null;
    const userFilter = toStringSafe(body.user_id) || null;
    const notificationIdFilter = toStringSafe(body.notification_id) || null;
    const notificationIdsFilter = normalizeIdList(body.notification_ids);
    const dryRun = body.dry_run === true;
    const limit = Math.min(Math.max(Number(body.limit ?? 100) || 100, 1), 500);
    const allowedSources = new Set(normalizeSourceList(body.notification_sources));

    let isAuthorized = false;
    let authorizedOrgTenantIds: string[] = [];
    const suppliedCronSecret = toStringSafe(req.headers.get("x-cron-secret"));
    if (pushCronSecret && suppliedCronSecret && suppliedCronSecret === pushCronSecret) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      const authHeader = toStringSafe(req.headers.get("Authorization"));
      if (authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice("Bearer ".length).trim();
        if (token && token === serviceRoleKey) {
          isAuthorized = true;
        } else if (token) {
          const { data: authData, error: authError } = await admin.auth.getUser(token);
          if (!authError && authData.user) {
            const { data: roles, error: roleError } = await admin
              .from("user_roles")
              .select("role, tenant_id")
              .eq("user_id", authData.user.id);
            if (!roleError && (roles ?? []).some((row: { role: string }) => row.role === "super_admin")) {
              isAuthorized = true;
            } else if (!roleError) {
              authorizedOrgTenantIds = (roles ?? [])
                .filter((row: { role: string; tenant_id?: string | null }) => row.role === "admin_instansi" && !!row.tenant_id)
                .map((row: { tenant_id?: string | null }) => toStringSafe(row.tenant_id))
                .filter((tenantId) => tenantId.length > 0);

              const orgOnlySources = Array.from(allowedSources).every((source) => source === ORG_NOTIFICATION_SOURCE);
              if (tenantFilter && orgOnlySources && authorizedOrgTenantIds.includes(tenantFilter)) {
                isAuthorized = true;
              }
            }
          }
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify(withTrace({ error: "Unauthorized" }, traceId)),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const summary: JsonObject = {
      success: true,
      trace_id: traceId,
      dry_run: dryRun,
      firebase_configured: isFirebaseMessagingConfigured(),
      limit,
      notification_sources: Array.from(allowedSources),
      notifications_scanned: 0,
      notifications_selected: 0,
      devices_selected: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      details: [] as JsonObject[],
    };

    let notificationQuery = admin
      .from("notifications")
      .select("id, user_id, title, message, type, link, metadata, created_at, is_read")
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(notificationIdFilter || notificationIdsFilter.length > 0 ? Math.max(notificationIdsFilter.length, 1) : Math.min(limit * 4, 1000));

    if (notificationIdFilter) {
      notificationQuery = notificationQuery.eq("id", notificationIdFilter);
    } else if (notificationIdsFilter.length > 0) {
      notificationQuery = notificationQuery.in("id", notificationIdsFilter);
    } else {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      notificationQuery = notificationQuery.gte("created_at", since);
    }

    const { data: notificationRows, error: notificationError } = await notificationQuery;
    if (notificationError) throw notificationError;

    const scannedNotifications = (notificationRows ?? []) as NotificationRow[];
    summary.notifications_scanned = scannedNotifications.length;

    const selectedNotifications = scannedNotifications
      .filter((notification) => canPushSource(notification.metadata, allowedSources))
      .filter((notification) => !tenantFilter || toStringSafe(notification.metadata?.tenant_id) === tenantFilter)
      .filter((notification) => !userFilter || notification.user_id === userFilter)
      .slice(0, limit);

    summary.notifications_selected = selectedNotifications.length;

    if (selectedNotifications.length === 0) {
      return new Response(
        JSON.stringify(summary),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userIds = Array.from(new Set(selectedNotifications.map((notification) => notification.user_id)));
    const { data: deviceRows, error: deviceError } = await admin
      .from("user_push_devices")
      .select(
        "id, user_id, tenant_id, installation_id, platform, device_model, fcm_token, is_active, notification_permission_state",
      )
      .in("user_id", userIds)
      .eq("platform", "android")
      .eq("is_active", true)
      .eq("notification_permission_state", "granted")
      .not("fcm_token", "is", null);
    if (deviceError) throw deviceError;

    const devices = (deviceRows ?? []) as UserPushDeviceRow[];
    summary.devices_selected = devices.length;

    const devicesByUser = new Map<string, UserPushDeviceRow[]>();
    for (const device of devices) {
      const list = devicesByUser.get(device.user_id) ?? [];
      list.push(device);
      devicesByUser.set(device.user_id, list);
    }

    const notificationIds = selectedNotifications.map((notification) => notification.id);
    const deviceIds = devices.map((device) => device.id);

    const deliveredKeySet = new Set<string>();
    if (notificationIds.length > 0 && deviceIds.length > 0) {
      const { data: deliveryRows, error: deliveryError } = await admin
        .from("notification_push_deliveries")
        .select("notification_id, user_push_device_id")
        .in("notification_id", notificationIds)
        .in("user_push_device_id", deviceIds);
      if (deliveryError) throw deliveryError;
      for (const row of (deliveryRows ?? []) as DeliveryRow[]) {
        deliveredKeySet.add(`${row.notification_id}:${row.user_push_device_id}`);
      }
    }

    const firebaseReady = isFirebaseMessagingConfigured();
    if (!firebaseReady && !dryRun) {
      return new Response(
        JSON.stringify({
          ...summary,
          skipped: selectedNotifications.length,
          message: "Firebase service account belum dikonfigurasi di Edge Functions.",
          skipped_reason: "FIREBASE_NOT_CONFIGURED",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    for (const notification of selectedNotifications) {
      const deviceCandidates = devicesByUser.get(notification.user_id) ?? [];
      const detail: JsonObject = {
        notification_id: notification.id,
        user_id: notification.user_id,
        source: summarizeSource(notification.metadata),
        devices: deviceCandidates.length,
        sent: 0,
        failed: 0,
        skipped: 0,
      };

      if (deviceCandidates.length === 0) {
        detail.skipped = 1;
        detail.skipped_reason = "NO_ACTIVE_ANDROID_DEVICE";
        (summary.details as JsonObject[]).push(detail);
        summary.skipped = Number(summary.skipped || 0) + 1;
        continue;
      }

      for (const device of deviceCandidates) {
        const deliveryKey = `${notification.id}:${device.id}`;
        if (deliveredKeySet.has(deliveryKey)) {
          detail.skipped = Number(detail.skipped || 0) + 1;
          summary.skipped = Number(summary.skipped || 0) + 1;
          continue;
        }

        const metadata = notification.metadata ?? {};
        const pushData = {
          notification_id: notification.id,
          notification_type: notification.type,
          source: summarizeSource(notification.metadata),
          target_url: resolveTargetUrl(notification.link),
          link: resolveTargetUrl(notification.link),
          tenant_id: toStringSafe(metadata.tenant_id),
          invoice_id: toStringSafe(metadata.invoice_id),
          invoice_number: toStringSafe(metadata.invoice_number),
          reason: toStringSafe(metadata.reason),
        };

        if (dryRun) {
          detail.sent = Number(detail.sent || 0) + 1;
          summary.sent = Number(summary.sent || 0) + 1;
          continue;
        }

        const sendResult = await sendFirebaseDataMessage(traceId, {
          token: toStringSafe(device.fcm_token),
          title: notification.title,
          body: notification.message,
          data: pushData,
        });

        const deliveryPayload = {
          notification_id: notification.id,
          user_push_device_id: device.id,
          user_id: notification.user_id,
          tenant_id: device.tenant_id ?? (toStringSafe(metadata.tenant_id) || null),
          platform: "android",
          delivery_status: sendResult.ok ? "SENT" : "FAILED",
          provider: sendResult.provider,
          provider_message_id: sendResult.messageId ?? null,
          trace_id: traceId,
          error_code: sendResult.errorCode ?? null,
          error_message: sendResult.errorMessage ?? null,
          payload: {
            source: summarizeSource(notification.metadata),
            target_url: pushData.target_url,
            title: notification.title,
            message: notification.message,
          },
          sent_at: sendResult.ok ? new Date().toISOString() : null,
        };

        const { error: insertDeliveryError } = await admin
          .from("notification_push_deliveries")
          .insert(deliveryPayload);
        if (insertDeliveryError) {
          logTraceError(traceId, "Gagal mencatat delivery push perangkat", insertDeliveryError);
        } else {
          deliveredKeySet.add(deliveryKey);
        }

        if (sendResult.ok) {
          detail.sent = Number(detail.sent || 0) + 1;
          summary.sent = Number(summary.sent || 0) + 1;
          const { error: deviceUpdateError } = await admin
            .from("user_push_devices")
            .update({
              last_seen_at: new Date().toISOString(),
              last_push_sent_at: new Date().toISOString(),
              last_push_success_at: new Date().toISOString(),
              last_push_error_at: null,
              last_push_error_code: null,
              last_push_error_message: null,
            })
            .eq("id", device.id);
          if (deviceUpdateError) {
            logTraceError(traceId, "Gagal mengupdate statistik push device sukses", deviceUpdateError);
          }
        } else {
          detail.failed = Number(detail.failed || 0) + 1;
          summary.failed = Number(summary.failed || 0) + 1;
          const shouldDeactivate = shouldDeactivateDevice(sendResult.errorCode || "");
          const { error: deviceUpdateError } = await admin
            .from("user_push_devices")
            .update({
              is_active: shouldDeactivate ? false : true,
              fcm_token: shouldDeactivate ? null : device.fcm_token,
              last_push_sent_at: new Date().toISOString(),
              last_push_error_at: new Date().toISOString(),
              last_push_error_code: sendResult.errorCode ?? "FCM_SEND_FAILED",
              last_push_error_message: sendResult.errorMessage ?? "Gagal mengirim push Android",
            })
            .eq("id", device.id);
          if (deviceUpdateError) {
            logTraceError(traceId, "Gagal mengupdate statistik push device gagal", deviceUpdateError);
          }
        }
      }

      const tenantId = toStringSafe(notification.metadata?.tenant_id) || null;
      const invoiceId = toStringSafe(notification.metadata?.invoice_id) || null;
      const billingLogPayload = buildBillingLogPayload({
        notification,
        tenantId,
        invoiceId,
        successCount: Number(detail.sent || 0),
        failedCount: Number(detail.failed || 0),
        traceId,
      });
      if (billingLogPayload) {
        const { error: billingLogError } = await admin
          .from("billing_notification_logs")
          .insert(billingLogPayload);
        if (billingLogError) {
          logTraceError(traceId, "Gagal menulis billing log untuk push Android", billingLogError);
        }
      }

      (summary.details as JsonObject[]).push(detail);
    }

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    logTraceError(traceId, "Gagal memproses dispatcher push perangkat", error);
    const message = error instanceof Error ? error.message : "Terjadi kesalahan internal";
    return new Response(
      JSON.stringify(withTrace({ error: message }, traceId)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
