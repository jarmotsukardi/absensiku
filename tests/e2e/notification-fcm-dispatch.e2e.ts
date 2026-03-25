import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryLoginAsSuperadmin } from "./helpers/adminAuth";
import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";
import { getRoleAccount } from "./helpers/testAccounts";
import { createSupabaseServiceTestClient } from "./helpers/supabaseTestEnv";

type PushDeviceRow = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  installation_id: string;
  app_version: string | null;
};

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DeliveryRow = {
  id: string;
  delivery_status: string;
  provider_message_id: string | null;
  trace_id: string | null;
  created_at: string;
};

const POLL_INTERVALS = [1_000, 2_000, 3_000, 5_000];

const ensureServiceClient = async (): Promise<SupabaseClient> => {
  const client = await createSupabaseServiceTestClient();
  test.skip(!client, "SUPABASE_SERVICE_ROLE_KEY belum tersedia untuk verifikasi DB live.");
  return client!;
};

const readActiveAndroidDeviceForTenant = async (
  client: SupabaseClient,
  tenantId: string,
): Promise<PushDeviceRow | null> => {
  const { data, error } = await client
    .from("user_push_devices")
    .select("id, user_id, tenant_id, installation_id, app_version")
    .eq("tenant_id", tenantId)
    .eq("platform", "android")
    .eq("is_active", true)
    .eq("notification_permission_state", "granted")
    .not("fcm_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as PushDeviceRow | null) ?? null;
};

const readNotificationsForTitle = async (
  client: SupabaseClient,
  title: string,
): Promise<NotificationRow[]> => {
  const { data, error } = await client
    .from("notifications")
    .select("id, user_id, title, metadata, created_at")
    .eq("title", title)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as NotificationRow[]) ?? [];
};

const readDeliveryForNotification = async (
  client: SupabaseClient,
  notificationId: string,
  deviceId: string,
): Promise<DeliveryRow | null> => {
  const { data, error } = await client
    .from("notification_push_deliveries")
    .select("id, delivery_status, provider_message_id, trace_id, created_at")
    .eq("notification_id", notificationId)
    .eq("user_push_device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as DeliveryRow | null) ?? null;
};

const cleanupNotificationArtifacts = async (
  client: SupabaseClient,
  title: string,
) => {
  const rows = await readNotificationsForTitle(client, title);
  const notificationIds = rows.map((row) => row.id);
  if (notificationIds.length > 0) {
    const { error: deliveryError } = await client
      .from("notification_push_deliveries")
      .delete()
      .in("notification_id", notificationIds);
    if (deliveryError) throw deliveryError;
  }

  const { error: notificationError } = await client
    .from("notifications")
    .delete()
    .eq("title", title);
  if (notificationError) throw notificationError;
};

const openOrgNotificationDialog = async (page: Page) => {
  await page.goto("/org/notifications", { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await expect(page.getByRole("heading", { name: "Manajemen Notifikasi", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kirim Notifikasi", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

const openAdminNotificationDialog = async (page: Page) => {
  await page.goto("/admin/notifications", { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await expect(page.getByRole("heading", { name: "Manajemen Notifikasi", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kirim Notifikasi", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

const fillNotificationDialog = async (page: Page, params: { title: string; message: string }) => {
  const dialog = page.getByRole("dialog");
  const titleInput = dialog.getByPlaceholder("Judul notifikasi");
  const messageInput = dialog.getByPlaceholder("Isi pesan notifikasi");
  await expect(titleInput).toBeVisible();
  await titleInput.fill(params.title);
  await messageInput.fill(params.message);
};

test.describe.serial("UI Notification FCM Dispatch", () => {
  test("org admin dapat mengirim notifikasi dan delivery FCM tercatat", async ({ page }) => {
    test.setTimeout(180_000);

    const serviceClient = await ensureServiceClient();
    const orgAccount = await getRoleAccount("org_admin_centralized");
    test.skip(!orgAccount?.tenant_id, "Kredensial org_admin_centralized belum tersedia.");

    const targetDevice = await readActiveAndroidDeviceForTenant(serviceClient, orgAccount!.tenant_id!);
    test.skip(!targetDevice?.user_id, "Belum ada device Android aktif untuk tenant org_admin_centralized.");

    const runId = `ORG-FCM-${Date.now()}`;
    const title = `[${runId}] Org Notification`;
    const message = `Uji FCM org notification ${runId}`;

    await cleanupNotificationArtifacts(serviceClient, title);

    try {
      await loginAsOrgAdmin(page, ["org_admin_centralized"]);
      await openOrgNotificationDialog(page);
      await fillNotificationDialog(page, { title, message });

      await expect(page.getByRole("dialog")).toContainText(/penerima/i);
      await page.getByRole("button", { name: /^Kirim$/ }).click();
      await expect(page.getByText(/Notifikasi berhasil dikirim|Notifikasi terkirim ke:/)).toBeVisible({
        timeout: 30_000,
      });

      const inserted = await expect
        .poll(async () => {
          const rows = await readNotificationsForTitle(serviceClient, title);
          return rows.find((row) => row.user_id === targetDevice!.user_id) ?? null;
        }, { timeout: 60_000, intervals: POLL_INTERVALS })
        .toBeTruthy();

      const targetNotification = await readNotificationsForTitle(serviceClient, title).then((rows) =>
        rows.find((row) => row.user_id === targetDevice!.user_id) ?? null,
      );
      expect(targetNotification).toBeTruthy();
      expect(targetNotification?.metadata?.source).toBe("org_notification");

      await expect
        .poll(async () => {
          const delivery = await readDeliveryForNotification(serviceClient, targetNotification!.id, targetDevice!.id);
          return delivery?.delivery_status ?? null;
        }, { timeout: 60_000, intervals: POLL_INTERVALS })
        .toBe("SENT");
    } finally {
      await cleanupNotificationArtifacts(serviceClient, title);
    }
  });

  test("superadmin dapat broadcast ke pengguna APK Android aktif", async ({ page }) => {
    test.setTimeout(180_000);

    const serviceClient = await ensureServiceClient();
    const orgAccount = await getRoleAccount("org_admin_centralized");
    test.skip(!orgAccount?.tenant_id, "Kredensial org_admin_centralized belum tersedia.");

    const targetDevice = await readActiveAndroidDeviceForTenant(serviceClient, orgAccount!.tenant_id!);
    test.skip(!targetDevice?.user_id, "Belum ada device Android aktif untuk tenant target broadcast.");

    const loginAttempt = await tryLoginAsSuperadmin(page);
    test.skip(loginAttempt.skipped, "Kredensial superadmin belum tersedia.");
    test.skip(loginAttempt.twoFactorRequired, "Login superadmin berhenti di verifikasi 2FA.");

    const runId = `ADMIN-FCM-${Date.now()}`;
    const title = `[${runId}] Admin Broadcast`;
    const message = `Uji FCM admin broadcast ${runId}`;

    await cleanupNotificationArtifacts(serviceClient, title);

    try {
      await openAdminNotificationDialog(page);
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox").first().click();
      await page.getByRole("option", { name: /Semua Pengguna APK Android Aktif/i }).click();
      await fillNotificationDialog(page, { title, message });
      await page.getByRole("button", { name: /^Kirim$/ }).click();
      await expect(page.getByText(/Notifikasi berhasil dikirim/)).toBeVisible({
        timeout: 30_000,
      });

      const targetNotification = await expect
        .poll(async () => {
          const rows = await readNotificationsForTitle(serviceClient, title);
          return rows.find((row) => row.user_id === targetDevice!.user_id) ?? null;
        }, { timeout: 60_000, intervals: POLL_INTERVALS })
        .toBeTruthy();

      const selectedNotification = await readNotificationsForTitle(serviceClient, title).then((rows) =>
        rows.find((row) => row.user_id === targetDevice!.user_id) ?? null,
      );
      expect(selectedNotification).toBeTruthy();
      expect(selectedNotification?.metadata?.source).toBe("admin_broadcast");

      await expect
        .poll(async () => {
          const delivery = await readDeliveryForNotification(serviceClient, selectedNotification!.id, targetDevice!.id);
          return delivery?.delivery_status ?? null;
        }, { timeout: 60_000, intervals: POLL_INTERVALS })
        .toBe("SENT");
    } finally {
      await cleanupNotificationArtifacts(serviceClient, title);
    }
  });
});
