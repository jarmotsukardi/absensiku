#!/usr/bin/env node

import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { ensureRoleAccount, readTestAccounts } from "./lib/test-accounts.mjs";
import { pickScriptEnv, readScriptEnvMap } from "./lib/supabase-env.mjs";

const ROLE_DEFAULT_SOURCE = {
  superadmin: "admin_broadcast",
  org_admin: "org_notification",
  org_admin_centralized: "org_notification",
};

const DEFAULT_LINK_BY_SOURCE = {
  admin_broadcast: "/download",
  org_notification: "/employee/dashboard?tab=notifications",
  billing_grace_notifier: "/org/billing?menu=invoices",
  streak_invoice_created: "/org/billing?menu=invoices",
};

const VALID_ROLES = Object.keys(ROLE_DEFAULT_SOURCE);
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_WAIT_INTERVAL_MS = 2_000;

const args = process.argv.slice(2);

const readArg = (name, fallback = "") => {
  const direct = args.find((item) => item === name);
  if (direct) return "true";
  const prefixed = args.find((item) => item.startsWith(`${name}=`));
  if (!prefixed) return fallback;
  return prefixed.slice(name.length + 1).trim();
};

const hasFlag = (name) => args.includes(name);

const parseIdList = (value) =>
  Array.from(
    new Set(
      String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const printHelp = () => {
  console.log(`Manual invoke dispatch-device-pushes memakai sesi user valid.

Contoh invoke biasa:
  node scripts/dispatch-device-pushes-manual.mjs --role=superadmin --source=admin_broadcast --dry-run
  node scripts/dispatch-device-pushes-manual.mjs --role=org_admin_centralized --notification-id=<uuid>

Contoh full-cycle notifikasi uji:
  node scripts/dispatch-device-pushes-manual.mjs --role=superadmin --seed --source=admin_broadcast --wait-delivery --cleanup-after
  node scripts/dispatch-device-pushes-manual.mjs --role=org_admin_centralized --seed --source=org_notification --wait-delivery --cleanup-after

Opsi:
  --role=superadmin|org_admin|org_admin_centralized
  --source=admin_broadcast|org_notification|streak_invoice_created|billing_grace_notifier
  --notification-id=<uuid>
  --notification-ids=<uuid1,uuid2>
  --tenant-id=<uuid>
  --user-id=<uuid>
  --limit=<angka>
  --dry-run
  --seed
  --title=<judul>
  --message=<pesan>
  --type=info|success|warning|error
  --link=/path
  --wait-delivery
  --wait-timeout-ms=<angka>
  --cleanup-after
  --json
  --help
`);
};

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const toIsoNow = () => new Date().toISOString();

const buildSeedMetadata = ({ role, source, tenantId, link }) => ({
  source,
  tenant_id: tenantId || null,
  sent_by_role: role === "superadmin" ? "super_admin" : "admin_instansi",
  sent_via: "dispatch_device_pushes_manual",
  seed_test: true,
  target_type: source === "admin_broadcast" ? "android_active_users" : "manual_seed",
  release_download_path: source === "admin_broadcast" ? link : null,
  seeded_at: toIsoNow(),
});

const uniqueRowsByUserId = (rows) => {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row?.user_id || seen.has(row.user_id)) return false;
    seen.add(row.user_id);
    return true;
  });
};

const createServiceClientIfAvailable = (supabaseUrl, serviceRoleKey) => {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const createSessionClient = (supabaseUrl, publishableKey) =>
  createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const queryPushReadyUsers = async (client, tenantId, limit) => {
  let query = client
    .from("user_push_devices")
    .select("user_id, tenant_id, installation_id, app_version")
    .eq("platform", "android")
    .eq("is_active", true)
    .eq("notification_permission_state", "granted")
    .not("fcm_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 3, 10));

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return uniqueRowsByUserId(data || []).slice(0, limit);
};

const queryTenantEmployees = async (client, tenantId, limit) => {
  const { data, error } = await client
    .from("employees")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 3, 10));
  if (error) throw error;
  return uniqueRowsByUserId(data || []).slice(0, limit);
};

const resolveSeedRecipients = async ({
  sessionClient,
  serviceClient,
  source,
  tenantId,
  userId,
  limit,
}) => {
  if (userId) {
    return [{ user_id: userId, tenant_id: tenantId || null }];
  }

  const readClient = serviceClient || sessionClient;
  const pushReadyUsers = await queryPushReadyUsers(readClient, tenantId || null, limit).catch(() => []);
  if (pushReadyUsers.length > 0) {
    return pushReadyUsers;
  }

  if (source === "org_notification" && tenantId) {
    return queryTenantEmployees(readClient, tenantId, limit);
  }

  return [];
};

const insertSeedNotifications = async ({
  sessionClient,
  recipients,
  title,
  message,
  type,
  link,
  metadata,
}) => {
  const payload = recipients.map((recipient) => ({
    user_id: recipient.user_id,
    title,
    message,
    type,
    is_read: false,
    link,
    metadata,
  }));

  const { data, error } = await sessionClient
    .from("notifications")
    .insert(payload)
    .select("id, user_id");
  if (error) throw error;
  return data || [];
};

const invokeDispatch = async ({
  supabaseUrl,
  publishableKey,
  accessToken,
  body,
}) => {
  const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-device-pushes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = responseText;
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsed,
  };
};

const waitForDelivery = async ({
  verifyClient,
  notificationIds,
  timeoutMs,
}) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const { data, error } = await verifyClient
      .from("notification_push_deliveries")
      .select("id, notification_id, user_push_device_id, delivery_status, trace_id, provider_message_id, created_at")
      .in("notification_id", notificationIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if ((data || []).length > 0) {
      return data;
    }
    await sleep(DEFAULT_WAIT_INTERVAL_MS);
  }
  return [];
};

const cleanupSeedNotifications = async (client, notificationIds) => {
  if (!notificationIds.length) return { deleted: 0 };
  const { error } = await client
    .from("notifications")
    .delete()
    .in("id", notificationIds);
  if (error) throw error;
  return { deleted: notificationIds.length };
};

const main = async () => {
  if (hasFlag("--help")) {
    printHelp();
    return;
  }

  const role = readArg("--role", "superadmin");
  if (!VALID_ROLES.includes(role)) {
    fail(`Role tidak valid. Pilih salah satu: ${VALID_ROLES.join(", ")}`);
    return;
  }

  const envMap = await readScriptEnvMap();
  const supabaseUrl = pickScriptEnv(envMap, ["NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_URL"]);
  const supabasePublishableKey = pickScriptEnv(envMap, [
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
  ]);
  const supabaseServiceRoleKey = pickScriptEnv(envMap, ["SUPABASE_SERVICE_ROLE_KEY"]);

  if (!supabaseUrl || !supabasePublishableKey) {
    fail("SUPABASE_URL / publishable key belum tersedia di env lokal.");
    return;
  }

  const accounts = await readTestAccounts();
  const account = ensureRoleAccount(accounts, role);
  const source = readArg("--source", ROLE_DEFAULT_SOURCE[role]);
  const notificationId = readArg("--notification-id");
  const initialNotificationIds = parseIdList(readArg("--notification-ids"));
  const tenantId = readArg("--tenant-id", account.tenant_id || "");
  const userId = readArg("--user-id");
  const limit = Math.min(Math.max(Number.parseInt(readArg("--limit", "25"), 10) || 25, 1), 500);
  const dryRun = hasFlag("--dry-run");
  const jsonMode = hasFlag("--json");
  const seedMode = hasFlag("--seed");
  const waitDeliveryMode = hasFlag("--wait-delivery");
  const cleanupAfter = hasFlag("--cleanup-after") || hasFlag("--cleanup");
  const waitTimeoutMs = Math.max(Number.parseInt(readArg("--wait-timeout-ms", `${DEFAULT_WAIT_TIMEOUT_MS}`), 10) || DEFAULT_WAIT_TIMEOUT_MS, 1_000);

  const sessionClient = createSessionClient(supabaseUrl, supabasePublishableKey);
  const serviceClient = createServiceClientIfAvailable(supabaseUrl, supabaseServiceRoleKey);

  const { data: loginData, error: loginError } = await sessionClient.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (loginError || !loginData.session?.access_token) {
    fail(`Login ${role} gagal: ${loginError?.message || "session tidak tersedia"}`);
    return;
  }

  const output = {
    ok: true,
    role,
    source,
    tenant_id: tenantId || null,
    dry_run: dryRun,
    seeded: false,
    seeded_notifications: [],
    seeded_recipients: [],
    dispatch: null,
    delivery_rows: [],
    cleanup: null,
  };

  let seededNotificationIds = [];

  try {
    if (seedMode) {
      const recipients = await resolveSeedRecipients({
        sessionClient,
        serviceClient,
        source,
        tenantId: tenantId || null,
        userId: userId || null,
        limit,
      });

      if (recipients.length === 0) {
        throw new Error("Tidak ada penerima seed yang siap. Isi --user-id atau pastikan ada device/pegawai yang cocok.");
      }

      const seedTag = `${source.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${Date.now()}`;
      const title = readArg("--title", `[${seedTag}] Seed Notification`);
      const message = readArg("--message", `Seed notification ${seedTag}`);
      const type = readArg("--type", "info");
      const link = readArg("--link", DEFAULT_LINK_BY_SOURCE[source] || "/employee/dashboard?tab=notifications");
      const metadata = buildSeedMetadata({ role, source, tenantId, link });

      const inserted = await insertSeedNotifications({
        sessionClient,
        recipients,
        title,
        message,
        type,
        link,
        metadata,
      });

      seededNotificationIds = inserted.map((row) => row.id);
      output.seeded = true;
      output.seeded_notifications = inserted;
      output.seeded_recipients = recipients;
    }

    const body = {
      tenant_id: tenantId || undefined,
      user_id: userId || undefined,
      notification_id: notificationId || undefined,
      notification_ids: seededNotificationIds.length > 0
        ? seededNotificationIds
        : (initialNotificationIds.length > 0 ? initialNotificationIds : undefined),
      notification_sources: source ? [source] : undefined,
      dry_run: dryRun,
      limit,
    };

    const dispatchResult = await invokeDispatch({
      supabaseUrl,
      publishableKey: supabasePublishableKey,
      accessToken: loginData.session.access_token,
      body,
    });
    output.dispatch = dispatchResult;

    if (!dispatchResult.ok) {
      output.ok = false;
      if (jsonMode) {
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.error(`dispatch-device-pushes gagal: HTTP ${dispatchResult.status}`);
        console.error(dispatchResult.body);
      }
      process.exitCode = 1;
      return;
    }

    if (waitDeliveryMode) {
      const targetNotificationIds = seededNotificationIds.length > 0
        ? seededNotificationIds
        : (initialNotificationIds.length > 0
          ? initialNotificationIds
          : (notificationId ? [notificationId] : []));

      if (targetNotificationIds.length === 0) {
        throw new Error("Mode --wait-delivery butuh --seed atau notification id yang eksplisit.");
      }

      const verifyClient = serviceClient || (role === "superadmin" ? sessionClient : null);
      if (!verifyClient) {
        throw new Error("Tidak ada client yang berhak untuk memverifikasi delivery row. Isi SUPABASE_SERVICE_ROLE_KEY atau gunakan role superadmin.");
      }

      output.delivery_rows = await waitForDelivery({
        verifyClient,
        notificationIds: targetNotificationIds,
        timeoutMs: waitTimeoutMs,
      });
    }

    if (cleanupAfter && seededNotificationIds.length > 0) {
      output.cleanup = await cleanupSeedNotifications(sessionClient, seededNotificationIds);
    }

    if (jsonMode) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    console.log("dispatch-device-pushes berhasil dipanggil.");
    console.log(`role: ${role}`);
    console.log(`source: ${source}`);
    console.log(`dry_run: ${dryRun ? "true" : "false"}`);
    if (tenantId) console.log(`tenant_id: ${tenantId}`);
    if (seededNotificationIds.length > 0) {
      console.log(`seeded_notification_ids: ${seededNotificationIds.join(", ")}`);
      console.log(`seeded_recipients: ${output.seeded_recipients.map((item) => item.user_id).join(", ")}`);
    }
    if (output.delivery_rows.length > 0) {
      console.log(`delivery_rows: ${output.delivery_rows.length}`);
    }
    if (output.cleanup) {
      console.log(`cleanup_deleted_notifications: ${output.cleanup.deleted}`);
    }
    console.log(output.dispatch.body);
  } catch (error) {
    output.ok = false;
    output.error = error instanceof Error ? error.message : String(error);

    if (cleanupAfter && seededNotificationIds.length > 0) {
      try {
        output.cleanup = await cleanupSeedNotifications(sessionClient, seededNotificationIds);
      } catch (cleanupError) {
        output.cleanup_error = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      }
    }

    if (jsonMode) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      fail(output.error);
      if (output.cleanup_error) {
        console.error(`cleanup_error: ${output.cleanup_error}`);
      }
    }
    process.exitCode = 1;
  } finally {
    await sessionClient.auth.signOut().catch(() => undefined);
  }
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
