import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupInvoicesBestEffort, extractInvoiceNumbers } from "./helpers/billingCleanup";
import { tryLoginAsSuperadmin } from "./helpers/adminAuth";
import { expectOrgTenantContext, loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";
import { getRoleAccount } from "./helpers/testAccounts";
import { createSupabaseServiceTestClient } from "./helpers/supabaseTestEnv";

type SubscriptionSnapshot = {
  id: string;
  tenant_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  last_invoice_id: string | null;
  grace_period_end: string | null;
  billing_headcount_mode: string | null;
  contracted_employee_count: number | null;
  max_employees: number | null;
  notes: string | null;
  updated_at: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  employee_count: number;
  gross_amount: number;
  status: string;
  metadata: Record<string, unknown> | null;
};

type ManualPaymentRow = {
  id: string;
  status: string;
  confirmed_amount: number | null;
  verified_amount: number | null;
  is_archived: boolean | null;
};

const ensureServiceClient = async (): Promise<SupabaseClient> => {
  const client = await createSupabaseServiceTestClient();
  test.skip(!client, "SUPABASE_SERVICE_ROLE_KEY belum tersedia untuk verifikasi DB live.");
  return client!;
};

const openSuperadminSession = async (browser: Browser, baseURL?: string) => {
  const adminContext = await browser.newContext({ baseURL: baseURL || process.env.DASHBOARD_BASE_URL });
  const adminPage = await adminContext.newPage();
  const loginResult = await tryLoginAsSuperadmin(adminPage);
  if (loginResult.skipped || loginResult.twoFactorRequired) {
    await adminContext.close();
    return { page: null as Page | null, twoFactorRequired: loginResult.twoFactorRequired, skipped: loginResult.skipped };
  }
  return { page: adminPage, twoFactorRequired: false, skipped: false };
};

const getActiveEmployeeCount = async (client: SupabaseClient, tenantId: string): Promise<number> => {
  const { count, error } = await client
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (error) throw error;
  return Number(count || 0);
};

const getLatestSubscription = async (
  client: SupabaseClient,
  tenantId: string,
): Promise<SubscriptionSnapshot | null> => {
  const { data, error } = await client
    .from("subscriptions")
    .select(
      "id, tenant_id, status, start_date, end_date, last_invoice_id, grace_period_end, billing_headcount_mode, contracted_employee_count, max_employees, notes, updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as SubscriptionSnapshot | null) ?? null;
};

const setSubscriptionToTrialForSmoke = async (
  client: SupabaseClient,
  snapshot: SubscriptionSnapshot,
) => {
  const { error } = await client
    .from("subscriptions")
    .update({
      status: "trial",
      billing_headcount_mode: "actual_active_employee",
      contracted_employee_count: null,
      grace_period_end: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", snapshot.id);
  if (error) throw error;
};

const restoreSubscriptionSnapshot = async (
  client: SupabaseClient,
  snapshot: SubscriptionSnapshot | null,
) => {
  if (!snapshot?.id) return;
  const { error } = await client
    .from("subscriptions")
    .update({
      status: snapshot.status,
      start_date: snapshot.start_date,
      end_date: snapshot.end_date,
      last_invoice_id: snapshot.last_invoice_id,
      grace_period_end: snapshot.grace_period_end,
      billing_headcount_mode: snapshot.billing_headcount_mode,
      contracted_employee_count: snapshot.contracted_employee_count,
      max_employees: snapshot.max_employees,
      notes: snapshot.notes,
      updated_at: snapshot.updated_at,
    })
    .eq("id", snapshot.id);
  if (error) throw error;
};

const ensureNoOpenInvoices = async (client: SupabaseClient, tenantId: string) => {
  const { count, error } = await client
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("status", ["PENDING", "AWAITING_VERIFICATION", "AWAITING_VERIFICATION_FULL", "PENDING_VERIFICATION_PARTIAL"]);
  if (error) throw error;
  test.skip((count || 0) > 0, `Tenant ${tenantId} masih punya invoice aktif.`);
};

const setManualContractHeadcount = async (page: Page, contractCount: number) => {
  const heading = page.getByText("Jumlah Pegawai yang Dibayar", { exact: true }).last();
  await expect(heading).toBeVisible({ timeout: 20_000 });
  const container = heading.locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]");
  const input = container.locator('input[type="number"]').first();
  await expect(input).toBeVisible();
  await input.fill(String(contractCount));
  await expect(input).toHaveValue(String(contractCount));
};

const collectInvoiceNumbersFromPage = async (page: Page): Promise<string[]> => {
  const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
  return extractInvoiceNumbers(bodyText);
};

const parseInvoiceNumberFromUrl = (url: string): string | null => {
  try {
    const invoiceNumber = new URL(url).searchParams.get("invoice");
    return invoiceNumber?.trim() || null;
  } catch {
    return null;
  }
};

const readInvoiceByNumber = async (
  client: SupabaseClient,
  tenantId: string,
  invoiceNumber: string,
): Promise<InvoiceRow | null> => {
  const { data, error } = await client
    .from("invoices")
    .select("id, invoice_number, employee_count, gross_amount, status, metadata")
    .eq("tenant_id", tenantId)
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();
  if (error) throw error;
  return (data as InvoiceRow | null) ?? null;
};

const readLatestManualPaymentByInvoiceNumber = async (
  client: SupabaseClient,
  tenantId: string,
  invoiceNumber: string,
): Promise<ManualPaymentRow | null> => {
  const { data, error } = await client
    .from("manual_payments")
    .select("id, status, confirmed_amount, verified_amount, is_archived, created_at")
    .eq("tenant_id", tenantId)
    .eq("invoice_number", invoiceNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ManualPaymentRow | null) ?? null;
};

const cleanupNotificationArtifactsByInvoiceNumbers = async (
  client: SupabaseClient,
  invoiceNumbers: Iterable<string>,
) => {
  const links = Array.from(
    new Set(
      Array.from(invoiceNumbers)
        .filter((value) => value.trim().length > 0)
        .map((invoiceNumber) => `/org/billing?menu=invoices&invoice=${invoiceNumber}`),
    ),
  );
  if (links.length === 0) return;

  const { data: notificationRows, error: notificationError } = await client
    .from("notifications")
    .select("id")
    .in("link", links);
  if (notificationError) throw notificationError;
  const notificationIds = (notificationRows || []).map((row) => row.id);
  if (notificationIds.length === 0) return;

  const { error: deliveryError } = await client
    .from("notification_push_deliveries")
    .delete()
    .in("notification_id", notificationIds);
  if (deliveryError) throw deliveryError;

  const { error: deleteError } = await client.from("notifications").delete().in("id", notificationIds);
  if (deleteError) throw deleteError;
};

const submitOrgPaymentProof = async (
  page: Page,
  invoiceNumber: string,
  paidAmount: number,
  proofFilePath: string,
) => {
  await page.goto(`/org/billing?menu=invoices&invoice=${encodeURIComponent(invoiceNumber)}&focus=payment-proof`, {
    waitUntil: "domcontentloaded",
  });
  await waitForStable(page);
  await expect(page.getByText(invoiceNumber, { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel("Nominal Transfer Aktual")).toBeVisible();
  await page.getByLabel("Nominal Transfer Aktual").fill(String(paidAmount));
  await page.locator("#payment-proof-file").setInputFiles(proofFilePath);
  await expect(page.getByText("File dipilih:", { exact: false })).toBeVisible();
  await page
    .getByLabel("Saya menyatakan nominal di atas adalah nominal transfer aktual sesuai bukti pembayaran.")
    .click();
  await expect(page.getByRole("button", { name: "Kirim Konfirmasi Pembayaran" })).toBeEnabled();
  await page.getByRole("button", { name: "Kirim Konfirmasi Pembayaran" }).click();
};

const approveManualPayment = async (
  adminPage: Page,
  invoiceNumber: string,
  verifiedAmount: number,
) => {
  await adminPage.goto("/admin/billing?tab=manual", { waitUntil: "domcontentloaded" });
  await waitForStable(adminPage);
  await expect(adminPage.getByText("Verifikasi Pembayaran Manual", { exact: false })).toBeVisible();

  const searchInput = adminPage.getByPlaceholder("Cari invoice atau organisasi...");
  await searchInput.fill(invoiceNumber);

  const verifyButton = adminPage
    .locator("div")
    .filter({ hasText: invoiceNumber })
    .getByRole("button", { name: "Verifikasi" })
    .first();
  await expect(verifyButton).toBeVisible({ timeout: 12_000 });
  await verifyButton.click();

  const verifyDialog = adminPage.getByRole("dialog");
  await expect(verifyDialog.getByRole("heading", { name: "Verifikasi Pembayaran Manual" })).toBeVisible();
  const verifiedAmountInput = verifyDialog
    .locator("div")
    .filter({ hasText: "Nominal Verifikasi Admin" })
    .locator("input")
    .first();
  await expect(verifiedAmountInput).toBeVisible();
  await verifiedAmountInput.fill(String(verifiedAmount));
  await expect(verifyDialog.getByRole("button", { name: "Setujui Pembayaran" })).toBeEnabled();
  await verifyDialog.getByRole("button", { name: "Setujui Pembayaran" }).click();
  await expect(verifyDialog).not.toBeVisible({ timeout: 12_000 });
};

test.describe.serial("Org Billing Manual Contract Verification Renewal", () => {
  test("org admin konfirmasi bayar, admin verifikasi, renewal tetap memakai seat kontrak", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(240_000);

    const serviceClient = await ensureServiceClient();
    const orgAccount = await getRoleAccount("org_admin_centralized");
    test.skip(!orgAccount?.tenant_id, "Kredensial org_admin_centralized belum tersedia.");

    const adminSession = await openSuperadminSession(browser, baseURL);
    test.skip(adminSession.skipped, "Kredensial superadmin belum tersedia.");
    test.skip(adminSession.twoFactorRequired, "Login superadmin membutuhkan 2FA, flow otomatis dilewati.");

    const adminPage = adminSession.page!;
    const tenantId = orgAccount!.tenant_id!;
    const createdInvoiceNumbers = new Set<string>();
    const originalSubscription = await getLatestSubscription(serviceClient, tenantId);
    const proofFilePath = path.join(process.cwd(), "artifacts/smoke/absensiku-fcm-visible-notification.png");

    test.skip(!originalSubscription?.id, "Subscription tenant uji tidak ditemukan.");

    await ensureNoOpenInvoices(serviceClient, tenantId);

    const activeEmployeeCount = await getActiveEmployeeCount(serviceClient, tenantId);
    const contractCount = activeEmployeeCount + 6;

    try {
      await setSubscriptionToTrialForSmoke(serviceClient, originalSubscription!);

      const account = await loginAsOrgAdmin(page, ["org_admin_centralized"]);
      await expectOrgTenantContext(page, account);

      await page.goto("/org/billing?menu=offers", { waitUntil: "domcontentloaded" });
      await waitForStable(page);

      await expect(page.getByRole("heading", { name: "Aktivasi Awal (Buat Invoice)" })).toBeVisible();

      const beforeInvoiceNumbers = new Set(await collectInvoiceNumbersFromPage(page));
      await page.getByRole("button", { name: "Buka Kalkulator" }).first().click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Kalkulator Langganan", { exact: false })).toBeVisible();
      await dialog.getByRole("button", { name: "Lanjut Aktivasi Awal" }).click();

      await waitForStable(page);
      await expect(page.getByRole("heading", { name: "Metode Pembayaran" })).toBeVisible();
      await page.getByRole("button", { name: /Transfer Bank Manual/i }).first().click();
      await setManualContractHeadcount(page, contractCount);

      await expect(page.getByText(`Pegawai aktif saat ini: ${activeEmployeeCount}`, { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Mau Bayar", exact: true }).click();

      const confirmDialog = page.getByRole("dialog");
      await expect(confirmDialog.getByText("Konfirmasi Aktivasi Awal", { exact: false })).toBeVisible();
      await expect(confirmDialog.getByText(`Pegawai (Billing)${contractCount}`, { exact: false })).toBeVisible();
      await confirmDialog.getByRole("button", { name: "Lanjutkan Aktivasi Awal", exact: true }).click();

      const resolveCreatedInvoiceNumber = async () => {
        const fromUrl = parseInvoiceNumberFromUrl(page.url());
        if (fromUrl) return fromUrl;
        const invoiceNumbers = await collectInvoiceNumbersFromPage(page);
        return invoiceNumbers.find((invoice) => !beforeInvoiceNumbers.has(invoice)) || null;
      };

      await expect
        .poll(resolveCreatedInvoiceNumber, { timeout: 30_000, intervals: [500, 1000, 2000] })
        .not.toBeNull();

      const invoiceNumber = await resolveCreatedInvoiceNumber();
      expect(invoiceNumber).toBeTruthy();
      createdInvoiceNumbers.add(invoiceNumber!);

      const afterInvoiceNumbers = await collectInvoiceNumbersFromPage(page);
      for (const invoice of afterInvoiceNumbers) {
        if (!beforeInvoiceNumbers.has(invoice)) {
          createdInvoiceNumbers.add(invoice);
        }
      }

      const createdInvoice = await readInvoiceByNumber(serviceClient, tenantId, invoiceNumber!);
      expect(createdInvoice).toBeTruthy();
      expect(createdInvoice?.status).toBe("PENDING");
      expect(createdInvoice?.employee_count).toBe(contractCount);
      expect(createdInvoice?.metadata?.billing_origin).toBe("activation_early");
      expect(createdInvoice?.metadata?.billing_headcount_mode_after_payment).toBe("manual_contract");
      expect(createdInvoice?.metadata?.employee_count_source).toBe("manual_contract");

      await page.goto(`/org/billing?menu=invoices&invoice=${encodeURIComponent(invoiceNumber!)}&focus=payment-proof`, {
        waitUntil: "domcontentloaded",
      });
      await waitForStable(page);

      await expect(page.getByText(invoiceNumber!, { exact: false }).first()).toBeVisible();
      await expect(page.getByLabel("Nominal Transfer Aktual")).toBeVisible();
      await page.getByLabel("Nominal Transfer Aktual").fill(String(createdInvoice?.gross_amount || 0));
      await page.locator("#payment-proof-file").setInputFiles(proofFilePath);
      await expect(page.getByText("File dipilih:", { exact: false })).toBeVisible();
      await page.getByLabel("Saya menyatakan nominal di atas adalah nominal transfer aktual sesuai bukti pembayaran.").click();
      await expect(page.getByRole("button", { name: "Kirim Konfirmasi Pembayaran" })).toBeEnabled();
      await page.getByRole("button", { name: "Kirim Konfirmasi Pembayaran" }).click();

      await expect.poll(
        async () => {
          const invoice = await readInvoiceByNumber(serviceClient, tenantId, invoiceNumber!);
          const manualPayment = await readLatestManualPaymentByInvoiceNumber(serviceClient, tenantId, invoiceNumber!);
          return JSON.stringify({
            invoiceStatus: invoice?.status || null,
            manualStatus: manualPayment?.status || null,
            confirmedAmount: manualPayment?.confirmed_amount || null,
          });
        },
        { timeout: 30_000, intervals: [1000, 2000, 3000] },
      ).toBe(
        JSON.stringify({
          invoiceStatus: "AWAITING_VERIFICATION_FULL",
          manualStatus: "awaiting_verification_full",
          confirmedAmount: createdInvoice?.gross_amount || null,
        }),
      );

      await adminPage.goto("/admin/billing?tab=manual", { waitUntil: "domcontentloaded" });
      await waitForStable(adminPage);
      await expect(adminPage.getByText("Verifikasi Pembayaran Manual", { exact: false })).toBeVisible();

      const searchInput = adminPage.getByPlaceholder("Cari invoice atau organisasi...");
      await searchInput.fill(invoiceNumber!);

      const verifyButton = adminPage
        .locator("div")
        .filter({ hasText: invoiceNumber! })
        .getByRole("button", { name: "Verifikasi" })
        .first();
      await expect(verifyButton).toBeVisible({ timeout: 12_000 });
      await verifyButton.click();

      const verifyDialog = adminPage.getByRole("dialog");
      await expect(verifyDialog.getByRole("heading", { name: "Verifikasi Pembayaran Manual" })).toBeVisible();
      const verifiedAmountInput = verifyDialog
        .locator("div")
        .filter({ hasText: "Nominal Verifikasi Admin" })
        .locator("input")
        .first();
      await expect(verifiedAmountInput).toBeVisible();
      await verifiedAmountInput.fill(String(createdInvoice?.gross_amount || 0));
      await expect(verifyDialog.getByRole("button", { name: "Setujui Pembayaran" })).toBeEnabled();
      await verifyDialog.getByRole("button", { name: "Setujui Pembayaran" }).click();
      await expect(verifyDialog).not.toBeVisible({ timeout: 12_000 });

      await expect.poll(
        async () => {
          const invoice = await readInvoiceByNumber(serviceClient, tenantId, invoiceNumber!);
          const manualPayment = await readLatestManualPaymentByInvoiceNumber(serviceClient, tenantId, invoiceNumber!);
          const subscription = await getLatestSubscription(serviceClient, tenantId);
          return JSON.stringify({
            invoiceStatus: invoice?.status || null,
            manualStatus: manualPayment?.status || null,
            manualArchived: manualPayment?.is_archived || false,
            verifiedAmount: manualPayment?.verified_amount || null,
            subStatus: subscription?.status || null,
            headcountMode: subscription?.billing_headcount_mode || null,
            contractCount: subscription?.contracted_employee_count || null,
            lastInvoiceId: subscription?.last_invoice_id || null,
          });
        },
        { timeout: 45_000, intervals: [1000, 2000, 3000] },
      ).toBe(
        JSON.stringify({
          invoiceStatus: "PAID",
          manualStatus: "verified",
          manualArchived: true,
          verifiedAmount: createdInvoice?.gross_amount || null,
          subStatus: "active",
          headcountMode: "manual_contract",
          contractCount,
          lastInvoiceId: createdInvoice?.id || null,
        }),
      );

      const { data: renewalInvoiceId, error: renewalError } = await serviceClient.rpc("create_pending_streak_invoice", {
        p_tenant_id: tenantId,
        p_grace_days: 7,
      });
      if (renewalError) throw renewalError;
      expect(renewalInvoiceId).toBeTruthy();

      const { data: renewalInvoice } = await serviceClient
        .from("invoices")
        .select("id, invoice_number, employee_count, gross_amount, status, metadata")
        .eq("id", renewalInvoiceId)
        .maybeSingle();
      expect(renewalInvoice).toBeTruthy();
      createdInvoiceNumbers.add(renewalInvoice!.invoice_number);

      expect(renewalInvoice?.status).toBe("PENDING");
      expect(renewalInvoice?.employee_count).toBe(contractCount);
      expect(renewalInvoice?.metadata?.employee_count_source).toBe("subscription_contract");
      expect(renewalInvoice?.metadata?.billing_headcount_mode_after_payment).toBe("manual_contract");
      expect(renewalInvoice?.metadata?.active_employee_count_at_invoice).toBe(activeEmployeeCount);
    } finally {
      try {
        if (createdInvoiceNumbers.size > 0) {
          await cleanupNotificationArtifactsByInvoiceNumbers(serviceClient, createdInvoiceNumbers);
        }
      } catch {
        // best effort
      }

      if (createdInvoiceNumbers.size > 0) {
        await cleanupInvoicesBestEffort(
          createdInvoiceNumbers,
          "org-billing-manual-contract-verification-renewal",
        );
      }

      await restoreSubscriptionSnapshot(serviceClient, originalSubscription);
      await adminPage.context().close();
    }
  });

  test("cicilan parsial tidak mengaktifkan subscription, pelunasan kedua baru mengunci manual_contract", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(300_000);

    const serviceClient = await ensureServiceClient();
    const orgAccount = await getRoleAccount("org_admin_centralized");
    test.skip(!orgAccount?.tenant_id, "Kredensial org_admin_centralized belum tersedia.");

    const adminSession = await openSuperadminSession(browser, baseURL);
    test.skip(adminSession.skipped, "Kredensial superadmin belum tersedia.");
    test.skip(adminSession.twoFactorRequired, "Login superadmin membutuhkan 2FA, flow otomatis dilewati.");

    const adminPage = adminSession.page!;
    const tenantId = orgAccount!.tenant_id!;
    const createdInvoiceNumbers = new Set<string>();
    const originalSubscription = await getLatestSubscription(serviceClient, tenantId);
    const proofFilePath = path.join(process.cwd(), "artifacts/smoke/absensiku-fcm-visible-notification.png");

    test.skip(!originalSubscription?.id, "Subscription tenant uji tidak ditemukan.");

    await ensureNoOpenInvoices(serviceClient, tenantId);

    const activeEmployeeCount = await getActiveEmployeeCount(serviceClient, tenantId);
    const contractCount = activeEmployeeCount + 8;

    try {
      await setSubscriptionToTrialForSmoke(serviceClient, originalSubscription!);

      const account = await loginAsOrgAdmin(page, ["org_admin_centralized"]);
      await expectOrgTenantContext(page, account);

      await page.goto("/org/billing?menu=offers", { waitUntil: "domcontentloaded" });
      await waitForStable(page);

      await expect(page.getByRole("heading", { name: "Aktivasi Awal (Buat Invoice)" })).toBeVisible();

      const beforeInvoiceNumbers = new Set(await collectInvoiceNumbersFromPage(page));
      await page.getByRole("button", { name: "Buka Kalkulator" }).first().click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Kalkulator Langganan", { exact: false })).toBeVisible();
      await dialog.getByRole("button", { name: "Lanjut Aktivasi Awal" }).click();

      await waitForStable(page);
      await expect(page.getByRole("heading", { name: "Metode Pembayaran" })).toBeVisible();
      await page.getByRole("button", { name: /Transfer Bank Manual/i }).first().click();
      await setManualContractHeadcount(page, contractCount);

      await expect(page.getByText(`Pegawai aktif saat ini: ${activeEmployeeCount}`, { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Mau Bayar", exact: true }).click();

      const confirmDialog = page.getByRole("dialog");
      await expect(confirmDialog.getByText("Konfirmasi Aktivasi Awal", { exact: false })).toBeVisible();
      await expect(confirmDialog.getByText(`Pegawai (Billing)${contractCount}`, { exact: false })).toBeVisible();
      await confirmDialog.getByRole("button", { name: "Lanjutkan Aktivasi Awal", exact: true }).click();

      const resolveCreatedInvoiceNumber = async () => {
        const fromUrl = parseInvoiceNumberFromUrl(page.url());
        if (fromUrl) return fromUrl;
        const invoiceNumbers = await collectInvoiceNumbersFromPage(page);
        return invoiceNumbers.find((invoice) => !beforeInvoiceNumbers.has(invoice)) || null;
      };

      await expect
        .poll(resolveCreatedInvoiceNumber, { timeout: 30_000, intervals: [500, 1000, 2000] })
        .not.toBeNull();

      const invoiceNumber = await resolveCreatedInvoiceNumber();
      expect(invoiceNumber).toBeTruthy();
      createdInvoiceNumbers.add(invoiceNumber!);

      const createdInvoice = await readInvoiceByNumber(serviceClient, tenantId, invoiceNumber!);
      expect(createdInvoice).toBeTruthy();
      expect(createdInvoice?.status).toBe("PENDING");
      expect(createdInvoice?.employee_count).toBe(contractCount);
      expect(createdInvoice?.metadata?.billing_headcount_mode_after_payment).toBe("manual_contract");

      const grossAmount = Number(createdInvoice?.gross_amount || 0);
      expect(grossAmount).toBeGreaterThan(20_000);
      const firstPaymentAmount = Math.floor(grossAmount / 2);
      const secondPaymentAmount = grossAmount - firstPaymentAmount;
      expect(firstPaymentAmount).toBeGreaterThan(0);
      expect(secondPaymentAmount).toBeGreaterThan(0);

      await submitOrgPaymentProof(page, invoiceNumber!, firstPaymentAmount, proofFilePath);

      await expect.poll(
        async () => {
          const invoice = await readInvoiceByNumber(serviceClient, tenantId, invoiceNumber!);
          const manualPayment = await readLatestManualPaymentByInvoiceNumber(serviceClient, tenantId, invoiceNumber!);
          return JSON.stringify({
            invoiceStatus: invoice?.status || null,
            manualStatus: manualPayment?.status || null,
            confirmedAmount: manualPayment?.confirmed_amount || null,
          });
        },
        { timeout: 30_000, intervals: [1000, 2000, 3000] },
      ).toBe(
        JSON.stringify({
          invoiceStatus: "PENDING_VERIFICATION_PARTIAL",
          manualStatus: "pending_verification_partial",
          confirmedAmount: firstPaymentAmount,
        }),
      );

      await approveManualPayment(adminPage, invoiceNumber!, firstPaymentAmount);

      await expect.poll(
        async () => {
          const invoice = await readInvoiceByNumber(serviceClient, tenantId, invoiceNumber!);
          const manualPayment = await readLatestManualPaymentByInvoiceNumber(serviceClient, tenantId, invoiceNumber!);
          const subscription = await getLatestSubscription(serviceClient, tenantId);
          return JSON.stringify({
            invoiceStatus: invoice?.status || null,
            manualStatus: manualPayment?.status || null,
            verifiedAmount: manualPayment?.verified_amount || null,
            subStatus: subscription?.status || null,
            headcountMode: subscription?.billing_headcount_mode || null,
            contractCount: subscription?.contracted_employee_count || null,
          });
        },
        { timeout: 45_000, intervals: [1000, 2000, 3000] },
      ).toBe(
        JSON.stringify({
          invoiceStatus: "PARTIALLY_PAID",
          manualStatus: "verified",
          verifiedAmount: firstPaymentAmount,
          subStatus: "trial",
          headcountMode: "actual_active_employee",
          contractCount: null,
        }),
      );

      await submitOrgPaymentProof(page, invoiceNumber!, secondPaymentAmount, proofFilePath);

      await expect.poll(
        async () => {
          const invoice = await readInvoiceByNumber(serviceClient, tenantId, invoiceNumber!);
          const manualPayment = await readLatestManualPaymentByInvoiceNumber(serviceClient, tenantId, invoiceNumber!);
          return JSON.stringify({
            invoiceStatus: invoice?.status || null,
            manualStatus: manualPayment?.status || null,
            confirmedAmount: manualPayment?.confirmed_amount || null,
          });
        },
        { timeout: 30_000, intervals: [1000, 2000, 3000] },
      ).toBe(
        JSON.stringify({
          invoiceStatus: "AWAITING_VERIFICATION_FULL",
          manualStatus: "awaiting_verification_full",
          confirmedAmount: secondPaymentAmount,
        }),
      );

      await approveManualPayment(adminPage, invoiceNumber!, secondPaymentAmount);

      await expect.poll(
        async () => {
          const invoice = await readInvoiceByNumber(serviceClient, tenantId, invoiceNumber!);
          const manualPayment = await readLatestManualPaymentByInvoiceNumber(serviceClient, tenantId, invoiceNumber!);
          const subscription = await getLatestSubscription(serviceClient, tenantId);
          return JSON.stringify({
            invoiceStatus: invoice?.status || null,
            manualStatus: manualPayment?.status || null,
            verifiedAmount: manualPayment?.verified_amount || null,
            subStatus: subscription?.status || null,
            headcountMode: subscription?.billing_headcount_mode || null,
            contractCount: subscription?.contracted_employee_count || null,
            lastInvoiceId: subscription?.last_invoice_id || null,
          });
        },
        { timeout: 45_000, intervals: [1000, 2000, 3000] },
      ).toBe(
        JSON.stringify({
          invoiceStatus: "PAID",
          manualStatus: "verified",
          verifiedAmount: secondPaymentAmount,
          subStatus: "active",
          headcountMode: "manual_contract",
          contractCount,
          lastInvoiceId: createdInvoice?.id || null,
        }),
      );

      const { data: renewalInvoiceId, error: renewalError } = await serviceClient.rpc("create_pending_streak_invoice", {
        p_tenant_id: tenantId,
        p_grace_days: 7,
      });
      if (renewalError) throw renewalError;
      expect(renewalInvoiceId).toBeTruthy();

      const { data: renewalInvoice } = await serviceClient
        .from("invoices")
        .select("id, invoice_number, employee_count, status, metadata")
        .eq("id", renewalInvoiceId)
        .maybeSingle();
      expect(renewalInvoice).toBeTruthy();
      createdInvoiceNumbers.add(renewalInvoice!.invoice_number);

      expect(renewalInvoice?.status).toBe("PENDING");
      expect(renewalInvoice?.employee_count).toBe(contractCount);
      expect(renewalInvoice?.metadata?.employee_count_source).toBe("subscription_contract");
      expect(renewalInvoice?.metadata?.billing_headcount_mode_after_payment).toBe("manual_contract");
      expect(renewalInvoice?.metadata?.active_employee_count_at_invoice).toBe(activeEmployeeCount);
    } finally {
      try {
        if (createdInvoiceNumbers.size > 0) {
          await cleanupNotificationArtifactsByInvoiceNumbers(serviceClient, createdInvoiceNumbers);
        }
      } catch {
        // best effort
      }

      if (createdInvoiceNumbers.size > 0) {
        await cleanupInvoicesBestEffort(
          createdInvoiceNumbers,
          "org-billing-manual-contract-partial-payment",
        );
      }

      await restoreSubscriptionSnapshot(serviceClient, originalSubscription);
      await adminPage.context().close();
    }
  });
});
