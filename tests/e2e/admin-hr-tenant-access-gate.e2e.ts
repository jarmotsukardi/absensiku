import { expect, test, type Page } from "@playwright/test";
import { ensureWorkspaceEnabled, loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";
import { getRoleAccount } from "./helpers/testAccounts";
import {
  createSupabaseServiceTestClient,
  getMissingSupabaseTestEnvKeys,
} from "./helpers/supabaseTestEnv";

const ACCESS_SETTING_KEY = "org_hr_payroll_access_policy_v1";

type SubscriptionSnapshot = {
  id: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
};

type AccessSettingSnapshot = {
  id: string;
  setting_value: Record<string, unknown> | null;
};

type TenantAccessSnapshot = {
  subscription: SubscriptionSnapshot | null;
  accessSetting: AccessSettingSnapshot | null;
};

const readTenantAccessSnapshot = async (tenantId: string): Promise<TenantAccessSnapshot> => {
  const client = await createSupabaseServiceTestClient();
  test.skip(!client, "SUPABASE_SERVICE_ROLE_KEY belum tersedia untuk mengatur state gate HR tenant.");

  const [subscriptionRes, accessSettingRes] = await Promise.all([
    client!
      .from("subscriptions")
      .select("id, status, start_date, end_date")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    client!
      .from("organization_settings")
      .select("id, setting_value")
      .eq("tenant_id", tenantId)
      .eq("setting_key", ACCESS_SETTING_KEY)
      .maybeSingle(),
  ]);

  if (subscriptionRes.error) throw subscriptionRes.error;
  if (accessSettingRes.error && accessSettingRes.error.code !== "PGRST116") throw accessSettingRes.error;

  return {
    subscription: subscriptionRes.data,
    accessSetting: accessSettingRes.data as AccessSettingSnapshot | null,
  };
};

const applyTenantAccessState = async (
  tenantId: string,
  args: { subscriptionStatus: string; paymentCommitted: boolean },
) => {
  const client = await createSupabaseServiceTestClient();
  test.skip(!client, "SUPABASE_SERVICE_ROLE_KEY belum tersedia untuk mengatur state gate HR tenant.");

  const snapshot = await readTenantAccessSnapshot(tenantId);
  const today = new Date().toISOString().slice(0, 10);
  const accessValue = {
    version: 1,
    paymentCommitted: args.paymentCommitted,
    committedAt: args.paymentCommitted ? new Date().toISOString() : null,
    note: args.paymentCommitted ? "E2E HR tenant access gate" : null,
  };

  if (snapshot.subscription) {
    const { error } = await client!
      .from("subscriptions")
      .update({ status: args.subscriptionStatus })
      .eq("id", snapshot.subscription.id);
    if (error) throw error;
  } else {
    const { error } = await client!
      .from("subscriptions")
      .insert({
        tenant_id: tenantId,
        status: args.subscriptionStatus,
        start_date: today,
        end_date: today,
      });
    if (error) throw error;
  }

  if (snapshot.accessSetting) {
    const { error } = await client!
      .from("organization_settings")
      .update({
        setting_value: accessValue,
        description: "Policy akses preview/read-only HR dan Payroll berdasarkan readiness absensi dan komitmen pembayaran.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", snapshot.accessSetting.id);
    if (error) throw error;
  } else {
    const { error } = await client!
      .from("organization_settings")
      .insert({
        tenant_id: tenantId,
        setting_key: ACCESS_SETTING_KEY,
        setting_value: accessValue,
        description: "Policy akses preview/read-only HR dan Payroll berdasarkan readiness absensi dan komitmen pembayaran.",
      });
    if (error) throw error;
  }

  return snapshot;
};

const restoreTenantAccessState = async (tenantId: string, snapshot: TenantAccessSnapshot) => {
  const client = await createSupabaseServiceTestClient();
  if (!client) return;

  if (snapshot.subscription) {
    await client
      .from("subscriptions")
      .update({
        status: snapshot.subscription.status,
        start_date: snapshot.subscription.start_date,
        end_date: snapshot.subscription.end_date,
      })
      .eq("id", snapshot.subscription.id);
  }

  const currentAccessSettingRes = await client
    .from("organization_settings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("setting_key", ACCESS_SETTING_KEY)
    .maybeSingle();

  const currentAccessSettingId = currentAccessSettingRes.data?.id ?? null;
  if (snapshot.accessSetting) {
    if (currentAccessSettingId) {
      await client
        .from("organization_settings")
        .update({
          setting_value: snapshot.accessSetting.setting_value,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentAccessSettingId);
    }
  } else if (currentAccessSettingId) {
    await client.from("organization_settings").delete().eq("id", currentAccessSettingId);
  }
};

const openHrWorkspace = async (page: Page, roles: Parameters<typeof loginAsOrgAdmin>[1], path: string) => {
  await loginAsOrgAdmin(page, roles);
  await ensureWorkspaceEnabled(page, "Aktifkan workspace HR");
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await waitForStable(page);
};

test.describe.serial("Admin HR Tenant Access Gate", () => {
  test.beforeEach(async () => {
    const missingEnvKeys = await getMissingSupabaseTestEnvKeys({
      SUPABASE_URL: ["VITE_SUPABASE_URL", "SUPABASE_URL"],
      SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    test.skip(
      missingEnvKeys.length > 0,
      `Supabase service env belum lengkap: ${missingEnvKeys.join(", ")}`,
    );
  });

  test("tenant setup_required menolak route HR untuk admin instansi", async ({ page }) => {
    const orgAdmin = await getRoleAccount("org_admin");
    test.skip(!orgAdmin?.tenant_id, "tenant_id org_admin belum tersedia di ops/test-accounts.local.json");

    const snapshot = await applyTenantAccessState(orgAdmin!.tenant_id!, {
      subscriptionStatus: "trial",
      paymentCommitted: false,
    });

    try {
      await openHrWorkspace(page, ["org_admin"], "/org/hr");
      await expect(page.getByRole("heading", { name: "Akses HR Ditolak", exact: true })).toBeVisible();
      await expect(page.getByText("Menunggu Readiness Absensi", { exact: false })).toBeVisible();
      await expect(page.getByText("rekam absensi awal", { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: "Buka Billing" })).toBeVisible();
    } finally {
      await restoreTenantAccessState(orgAdmin!.tenant_id!, snapshot);
    }
  });

  test("tenant attendance_active menampilkan banner read only dan menahan aksi konten HR", async ({ page }) => {
    const orgAdmin = await getRoleAccount("org_admin_centralized");
    test.skip(!orgAdmin?.tenant_id, "tenant_id org_admin_centralized belum tersedia di ops/test-accounts.local.json");

    const snapshot = await applyTenantAccessState(orgAdmin!.tenant_id!, {
      subscriptionStatus: "trial",
      paymentCommitted: false,
    });

    try {
      await openHrWorkspace(page, ["org_admin_centralized"], "/org/hr/settings");
      await expect(page.getByRole("heading", { name: "Pengaturan HR", exact: true })).toBeVisible();
      await expect(page.getByRole("main").getByText("HR Read Only", { exact: false }).last()).toBeVisible();
      await expect(page.getByRole("main").getByText("Preview Read-Only", { exact: false }).last()).toBeVisible();
      await expect(
        page.getByText(
          "Workspace HR masih preview. Semua menu bisa dilihat, tetapi edit dan tambah data baru dibuka setelah komitmen pembayaran dicatat.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Catat Komitmen Pembayaran", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Buka Struktur", exact: true })).toBeDisabled();

      const currentUrl = page.url();
      await page.getByRole("main").getByRole("button", { name: "Kinerja", exact: true }).click();
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(currentUrl);

      await page.goto("/org/hr/leave-approval", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.getByRole("heading", { name: "Alur Persetujuan Cuti", exact: true })).toBeVisible();
      await expect(page.getByText("Capability halaman: monitoring hanya-baca", { exact: true })).toBeVisible();
      const approvalButtons = page.locator("tbody tr td.text-right button");
      if ((await approvalButtons.count()) > 0) {
        await expect(approvalButtons.first()).toBeDisabled();
      }

      await page.goto("/org/hr/ess/leave-requests", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.getByRole("heading", { name: "Cuti & Izin ESS", exact: true })).toBeVisible();
      await expect(page.getByText("Capability halaman: monitoring hanya-baca", { exact: true })).toBeVisible();
    } finally {
      await restoreTenantAccessState(orgAdmin!.tenant_id!, snapshot);
    }
  });

  test("tenant payment_committed membuka HR editable penuh tanpa banner read only", async ({ page }) => {
    const orgAdmin = await getRoleAccount("org_admin_centralized");
    test.skip(!orgAdmin?.tenant_id, "tenant_id org_admin_centralized belum tersedia di ops/test-accounts.local.json");

    const snapshot = await applyTenantAccessState(orgAdmin!.tenant_id!, {
      subscriptionStatus: "trial",
      paymentCommitted: true,
    });

    try {
      await openHrWorkspace(page, ["org_admin_centralized"], "/org/hr/settings");
      await expect(page.getByRole("heading", { name: "Pengaturan HR", exact: true })).toBeVisible();
      await expect(page.getByText("HR Read Only", { exact: false })).toHaveCount(0);
      await expect(page.getByText("Siap Dikonfigurasi", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Buka Struktur", exact: true })).toBeEnabled();

      await page.getByRole("button", { name: "Buka Struktur", exact: true }).click();
      await waitForStable(page);
      await expect(page).toHaveURL(/\/org\/hr\/settings\?(?:.*&)?hr_overlay=%2Forg%2Fhr%2Fstructure(?:&|$)/);
      await expect(page.getByText("Halaman Organisasi Dibuka sebagai Overlay", { exact: true })).toBeVisible();
      await expect(page.getByText("Struktur Organisasi", { exact: true }).last()).toBeVisible();
    } finally {
      await restoreTenantAccessState(orgAdmin!.tenant_id!, snapshot);
    }
  });

  test("tenant paid_active tetap editable penuh saat langganan aktif", async ({ page }) => {
    const orgAdmin = await getRoleAccount("org_admin_centralized");
    test.skip(!orgAdmin?.tenant_id, "tenant_id org_admin_centralized belum tersedia di ops/test-accounts.local.json");

    const snapshot = await applyTenantAccessState(orgAdmin!.tenant_id!, {
      subscriptionStatus: "active",
      paymentCommitted: false,
    });

    try {
      await openHrWorkspace(page, ["org_admin_centralized"], "/org/hr/training-data");
      await expect(page.getByRole("heading", { name: "Data Pelatihan", exact: true })).toBeVisible();
      await expect(page.getByText("HR Read Only", { exact: false })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Tambah Program", exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Tambah Program", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Tambah Program Pelatihan", exact: true })).toBeVisible();
    } finally {
      await restoreTenantAccessState(orgAdmin!.tenant_id!, snapshot);
    }
  });
});
