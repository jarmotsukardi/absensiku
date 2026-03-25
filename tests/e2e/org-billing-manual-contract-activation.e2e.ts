import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupInvoicesBestEffort,
  extractInvoiceNumbers,
} from "./helpers/billingCleanup";
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
  status: string;
  metadata: Record<string, unknown> | null;
};

const ensureServiceClient = async (): Promise<SupabaseClient> => {
  const client = await createSupabaseServiceTestClient();
  test.skip(!client, "SUPABASE_SERVICE_ROLE_KEY belum tersedia untuk verifikasi DB live.");
  return client!;
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
    .in("status", ["PENDING", "AWAITING_VERIFICATION"]);
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
    .select("id, invoice_number, employee_count, status, metadata")
    .eq("tenant_id", tenantId)
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();
  if (error) throw error;
  return (data as InvoiceRow | null) ?? null;
};

test.describe.serial("Org Billing Manual Contract Activation", () => {
  test("org admin trial dapat membuat invoice aktivasi awal dengan seat manual contract", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const serviceClient = await ensureServiceClient();
    const orgAccount = await getRoleAccount("org_admin_centralized");
    test.skip(!orgAccount?.tenant_id, "Kredensial org_admin_centralized belum tersedia.");

    const tenantId = orgAccount!.tenant_id!;
    const createdInvoiceNumbers = new Set<string>();
    const originalSubscription = await getLatestSubscription(serviceClient, tenantId);

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

      await expect
        .poll(() => parseInvoiceNumberFromUrl(page.url()), { timeout: 30_000, intervals: [500, 1000, 2000] })
        .not.toBeNull();

      const invoiceNumber = parseInvoiceNumberFromUrl(page.url());
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
      expect(createdInvoice?.metadata?.contracted_employee_count_after_payment).toBe(contractCount);
      expect(createdInvoice?.metadata?.active_employee_count_at_invoice).toBe(activeEmployeeCount);

      const currentSub = await getLatestSubscription(serviceClient, tenantId);
      expect(currentSub?.status).toBe("trial");
      expect(currentSub?.billing_headcount_mode).toBe("actual_active_employee");
      expect(currentSub?.contracted_employee_count).toBeNull();
    } finally {
      if (createdInvoiceNumbers.size > 0) {
        await cleanupInvoicesBestEffort(
          createdInvoiceNumbers,
          "org-billing-manual-contract-activation",
        );
      }
      await restoreSubscriptionSnapshot(serviceClient, originalSubscription);
    }
  });
});
