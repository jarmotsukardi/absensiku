import { expect, test, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { waitForStable } from "./helpers/orgAuth";
import { loginAsSuperadmin, loginAsSuperadminWithCreds } from "./helpers/adminAuth";
import { expectAdminPageGuide } from "./helpers/adminPageGuide";
import {
  createSupabaseServiceTestClient,
  getMissingSupabaseTestEnvKeys,
} from "./helpers/supabaseTestEnv";
import { getRoleCreds } from "./helpers/testAccounts";

type EmployeeContext = {
  id: string;
  tenant_id: string;
};

const resolveEmployeeContext = async (serviceClient: SupabaseClient): Promise<EmployeeContext | null> => {
  const { data, error } = await serviceClient
    .from("employees")
    .select("id, tenant_id")
    .eq("is_active", true)
    .not("tenant_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  const row = data?.[0];
  if (!row?.id || !row.tenant_id) return null;
  return { id: row.id, tenant_id: row.tenant_id };
};

const getYmdPlusDays = (daysFromToday: number): string => {
  const value = new Date();
  value.setDate(value.getDate() + daysFromToday);
  return value.toISOString().slice(0, 10);
};

const getIsoMinusDays = (daysFromToday: number): string => {
  const value = new Date();
  value.setDate(value.getDate() - daysFromToday);
  return value.toISOString();
};

const getAuditCard = (page: Page, heading: string): Locator =>
  page
    .getByRole("heading", { name: heading, exact: true })
    .locator("xpath=ancestor::div[contains(@class,'rounded')][1]");

const fillCardSearch = async (page: Page, heading: string, value: string) => {
  const card = getAuditCard(page, heading);
  const input = card.getByRole("textbox").first();
  await expect(input).toBeVisible();
  await input.fill(value);
};

const expectCardRowVisible = async (page: Page, heading: string, text: string) => {
  const card = getAuditCard(page, heading);
  await expect
    .poll(async () => {
      const row = card.locator("tbody tr").filter({ hasText: text }).first();
      return await row.isVisible().catch(() => false);
    }, { timeout: 20_000, intervals: [500, 1000, 1500] })
    .toBe(true);
};

const expectCardEmptyState = async (page: Page, heading: string, emptyText: string) => {
  const card = getAuditCard(page, heading);
  await expect(card.getByText(emptyText, { exact: true })).toBeVisible();
};

const getTableRows = (page: Page, heading: string) => getAuditCard(page, heading).locator("tbody tr");

const isEmptyStateRow = async (row: Locator) => {
  const text = ((await row.textContent()) || "").toLowerCase();
  return text.includes("tidak ada ");
};

const readCellText = async (row: Locator, index: number) => (((await row.locator("td").nth(index).textContent()) || "").trim());

const selectCardOption = async (page: Page, heading: string, index: number, optionName: string) => {
  const card = getAuditCard(page, heading);
  const trigger = card.getByRole("combobox").nth(index);
  await expect(trigger).toBeVisible();
  await trigger.click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
};

const selectTenantFilter = async (page: Page, optionName: string) => {
  const trigger = page.getByRole("combobox").first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
};

test.describe.serial("Admin HR Audit Search", () => {
  test("search smoke tetap stabil tanpa service-role fixture", async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/audit", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();

    const cases = [
      {
        heading: "Drilldown Kontrak Segera Berakhir",
        emptyText: "Tidak ada kontrak aktif yang segera berakhir pada cakupan ini.",
        searchCellIndex: 2,
      },
      {
        heading: "Drilldown Kuota Cuti Kedaluwarsa",
        emptyText: "Tidak ada kuota cuti kedaluwarsa dengan sisa positif pada cakupan ini.",
        searchCellIndex: 2,
      },
      {
        heading: "Drilldown Lowongan Draft ATS",
        emptyText: "Tidak ada lowongan draft pada cakupan ini.",
        searchCellIndex: 1,
      },
      {
        heading: "Drilldown Offer ATS Kedaluwarsa",
        emptyText: "Tidak ada penawaran ATS kedaluwarsa pada cakupan ini.",
        searchCellIndex: 2,
      },
    ] as const;

    for (const item of cases) {
      const rows = getTableRows(page, item.heading);
      const firstRow = rows.first();
      await expect(firstRow).toBeVisible();

      if (await isEmptyStateRow(firstRow)) {
        await expectCardEmptyState(page, item.heading, item.emptyText);
        continue;
      }

      const keyword = await readCellText(firstRow, item.searchCellIndex);
      expect(keyword.length).toBeGreaterThan(0);

      await fillCardSearch(page, item.heading, keyword);
      await expectCardRowVisible(page, item.heading, keyword);

      await fillCardSearch(page, item.heading, `${keyword}-TIDAK-ADA`);
      await expectCardEmptyState(page, item.heading, item.emptyText);

      await fillCardSearch(page, item.heading, "");
    }
  });

  test("filter temuan hari libur tetap stabil saat hasil kosong", async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/audit", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();

    const heading = "Temuan Audit Hari Libur";
    const emptyText = "Tidak ada temuan pada cakupan audit ini.";
    const card = getAuditCard(page, heading);

    await expect(card.getByText(emptyText, { exact: true })).toBeVisible();
    await expect(card.getByText("Halaman 1 / 1", { exact: true })).toBeVisible();

    await fillCardSearch(page, heading, "temuan-holiday-tidak-ada");
    await expect(card.getByText(emptyText, { exact: true })).toBeVisible();

    await selectCardOption(page, heading, 0, "Global mismatch");
    await expect(card.getByText(emptyText, { exact: true })).toBeVisible();

    await selectCardOption(page, heading, 1, "Kritis");
    await expect(card.getByText(emptyText, { exact: true })).toBeVisible();
    await expect(card.getByText("Halaman 1 / 1", { exact: true })).toBeVisible();

    await selectCardOption(page, heading, 0, "Semua tipe");
    await selectCardOption(page, heading, 1, "Semua severity");
    await fillCardSearch(page, heading, "");
    await expect(card.getByText(emptyText, { exact: true })).toBeVisible();
  });

  test("filter tenant dan muat ulang audit tetap stabil", async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/audit", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();

    const tenantFilterTrigger = page.getByRole("combobox").first();
    await tenantFilterTrigger.click();
    const options = page.getByRole("option");
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(0);

    const tenantOptions: string[] = [];
    for (let i = 0; i < optionCount; i += 1) {
      const text = ((await options.nth(i).textContent()) || "").trim();
      if (text) tenantOptions.push(text);
    }
    await page.keyboard.press("Escape");

    const scopedTenant = tenantOptions.find((item) => item !== "Semua Tenant");
    if (scopedTenant) {
      await selectTenantFilter(page, scopedTenant);
      await waitForStable(page);
      await expect(tenantFilterTrigger).toContainText(scopedTenant);
      await expect(page.getByText("Terakhir diperbarui:", { exact: false })).toBeVisible();
    }

    await page.getByRole("button", { name: "Muat Ulang Audit" }).click();
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();
    await expect(page.getByText("Terakhir diperbarui:", { exact: false })).toBeVisible();

    if (scopedTenant) {
      await selectTenantFilter(page, "Semua Tenant");
      await waitForStable(page);
      await expect(tenantFilterTrigger).toContainText("Semua Tenant");
    }
  });

  test("pagination route audit tetap stabil pada halaman tunggal", async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/audit", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();

    const card = getAuditCard(page, "Audit Status Route HR");
    const rows = card.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    await expect(card.getByText(/Halaman \d+ \/ \d+/, { exact: false })).toBeVisible();

    const previousButton = card.getByRole("button", { name: "Sebelumnya" });
    const nextButton = card.getByRole("button", { name: "Berikutnya" });
    await expect(previousButton).toBeDisabled();
    await expect(nextButton).toBeDisabled();

    const dataRowCount = await rows.count();
    expect(dataRowCount).toBeGreaterThan(0);

    const firstRowText = ((await rows.first().textContent()) || "").trim();
    expect(firstRowText.length).toBeGreaterThan(0);
  });

  test("kartu ringkasan dan baseline audit tampil dengan nilai yang stabil", async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/audit", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();

    const summaryTitles = [
      "Route Aktif",
      "Route Alias",
      "Route Internal",
      "Route Ditunda",
      "Hari Libur Tercatat",
      "Global Tidak Konsisten",
      "Tenant Ditandai Nasional",
      "Indikasi Duplikasi",
      "Kontrak Segera Berakhir",
      "Kontrak Draft",
      "Kuota Kedaluwarsa",
      "Sisa Kuota Negatif",
      "Lowongan Draft",
      "Kandidat Tanpa Lowongan",
      "Interview Terlewat",
      "Offer Kedaluwarsa",
    ] as const;

    for (const title of summaryTitles) {
      const card = getAuditCard(page, title);
      await expect(card).toBeVisible();
      const valueText = (((await card.locator("p.text-2xl").first().textContent()) || "").trim());
      expect(valueText.length).toBeGreaterThan(0);
      expect(valueText).not.toContain("...");
      expect(Number.isNaN(Number(valueText))).toBe(false);
    }

    const baselineCard = getAuditCard(page, "Audit Baseline Kontrak dan Cuti");
    const baselineRows = baselineCard.locator("tbody tr");
    await expect(baselineRows.first()).toBeVisible();
    await expect(baselineRows).toHaveCount(8);
    await expect(baselineCard.getByText("Kontrak aktif mendekati akhir", { exact: true })).toBeVisible();
    await expect(baselineCard.getByText("Kuota cuti kedaluwarsa", { exact: true })).toBeVisible();
    await expect(baselineCard.getByText("Penawaran kedaluwarsa", { exact: true })).toBeVisible();
  });

  test("link ke log error HR dari audit tetap mengarah benar", async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/audit", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();

    await page.getByRole("link", { name: "Buka Log Error HR" }).click();
    await waitForStable(page);
    await expect(page).toHaveURL(/\/admin\/hr\/error-logs$/);
    await expect(page.locator("h1").filter({ hasText: "Log Error HR" })).toBeVisible();
  });

  test("guide halaman audit tampil di bagian bawah", async ({ page }) => {
    await loginAsSuperadmin(page);
    await page.goto("/admin/hr/audit", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();

    await expectAdminPageGuide(page, "Panduan Audit HR");
  });

  test("search backend-driven menampilkan hasil nyata untuk kontrak, kuota, lowongan draft, dan offer kedaluwarsa", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    test.skip(
      !process.env.E2E_ADMIN_HR_AUDIT_SEARCH,
      "Set E2E_ADMIN_HR_AUDIT_SEARCH=1 untuk menjalankan test search AdminHRAudit.",
    );

    const missingEnvKeys = await getMissingSupabaseTestEnvKeys({
      SUPABASE_URL: ["VITE_SUPABASE_URL", "SUPABASE_URL"],
      SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    test.skip(
      missingEnvKeys.length > 0,
      `Supabase test client env belum lengkap: ${missingEnvKeys.join(", ")}`,
    );

    const serviceClient = await createSupabaseServiceTestClient();
    test.skip(!serviceClient, "Supabase service test client tidak bisa dibuat dari env yang tersedia.");

    const employee = await resolveEmployeeContext(serviceClient!);
    test.skip(!employee, "Pegawai aktif untuk fixture audit HR tidak ditemukan.");

    const token = `E2E-AUDIT-HR-${Date.now()}`;
    const contractNumber = `${token}-CONTRACT`;
    const leaveTypeName = `${token} CUTI`;
    const leaveCode = `E2E${Date.now().toString().slice(-6)}`;
    const quotaNote = `${token}-QUOTA`;
    const draftJobTitle = `${token} Draft Job`;
    const candidateName = `${token} Candidate`;
    const offerPosition = `${token} Offer`;
    const offerNote = `${token}-OFFER`;

    let leaveTypeId: string | null = null;
    let jobId: string | null = null;
    let candidateId: string | null = null;
    let offerId: string | null = null;
    let contractId: string | null = null;
    let quotaId: string | null = null;

    try {
      const { data: contractRows, error: contractError } = await serviceClient!
        .from("hr_contracts")
        .insert({
          tenant_id: employee!.tenant_id,
          employee_id: employee!.id,
          contract_number: contractNumber,
          contract_type: "PKWT",
          start_date: getYmdPlusDays(-30),
          end_date: getYmdPlusDays(15),
          status: "active",
          notes: token,
        })
        .select("id")
        .limit(1);
      if (contractError) throw contractError;
      contractId = contractRows?.[0]?.id || null;

      const { data: leaveTypeRows, error: leaveTypeError } = await serviceClient!
        .from("leave_types")
        .insert({
          tenant_id: employee!.tenant_id,
          leave_name: leaveTypeName,
          leave_code: leaveCode,
          description: token,
          is_paid: true,
          requires_document: false,
          max_days_per_year: 12,
          is_active: true,
        })
        .select("id")
        .limit(1);
      if (leaveTypeError) throw leaveTypeError;
      leaveTypeId = leaveTypeRows?.[0]?.id || null;

      const quotaYear = new Date().getFullYear() - 1;
      const { data: quotaRows, error: quotaError } = await serviceClient!
        .from("leave_quotas")
        .insert({
          tenant_id: employee!.tenant_id,
          employee_id: employee!.id,
          leave_type_id: leaveTypeId,
          quota_year: quotaYear,
          total_days: 12,
          used_days: 2,
          carry_over_days: 0,
          expired_days: 0,
          notes: quotaNote,
          valid_from: `${quotaYear}-01-01`,
          valid_until: `${quotaYear}-12-31`,
        })
        .select("id")
        .limit(1);
      if (quotaError) throw quotaError;
      quotaId = quotaRows?.[0]?.id || null;

      const { data: jobRows, error: jobError } = await serviceClient!
        .from("hr_recruitment_jobs")
        .insert({
          tenant_id: employee!.tenant_id,
          title: draftJobTitle,
          department: "QA",
          employment_type: "full_time",
          opening_count: 1,
          status: "draft",
          description: token,
        })
        .select("id")
        .limit(1);
      if (jobError) throw jobError;
      jobId = jobRows?.[0]?.id || null;

      const { data: candidateRows, error: candidateError } = await serviceClient!
        .from("hr_recruitment_candidates")
        .insert({
          tenant_id: employee!.tenant_id,
          job_id: jobId,
          full_name: candidateName,
          email: `audit-${Date.now()}@example.com`,
          phone: `0812${String(Date.now()).slice(-8)}`,
          source: "e2e",
          stage: "offered",
          status: "active",
          notes: token,
        })
        .select("id")
        .limit(1);
      if (candidateError) throw candidateError;
      candidateId = candidateRows?.[0]?.id || null;

      const { data: offerRows, error: offerError } = await serviceClient!
        .from("hr_recruitment_offers")
        .insert({
          tenant_id: employee!.tenant_id,
          candidate_id: candidateId,
          offered_position: offerPosition,
          offered_salary: 9000000,
          currency: "IDR",
          status: "sent",
          offered_at: getIsoMinusDays(10),
          expiry_at: getIsoMinusDays(2),
          notes: offerNote,
        })
        .select("id")
        .limit(1);
      if (offerError) throw offerError;
      offerId = offerRows?.[0]?.id || null;

      await loginAsSuperadmin(page);
      await page.goto("/admin/hr/audit", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.locator("h1").filter({ hasText: "Audit HR" })).toBeVisible();

      await fillCardSearch(page, "Drilldown Kontrak Segera Berakhir", contractNumber);
      await expectCardRowVisible(page, "Drilldown Kontrak Segera Berakhir", contractNumber);

      await fillCardSearch(page, "Drilldown Kontrak Segera Berakhir", `${token}-NOT-FOUND`);
      await expectCardEmptyState(
        page,
        "Drilldown Kontrak Segera Berakhir",
        "Tidak ada kontrak aktif yang segera berakhir pada cakupan ini.",
      );

      await fillCardSearch(page, "Drilldown Kuota Cuti Kedaluwarsa", leaveTypeName);
      await expectCardRowVisible(page, "Drilldown Kuota Cuti Kedaluwarsa", leaveTypeName);

      await fillCardSearch(page, "Drilldown Lowongan Draft ATS", draftJobTitle);
      await expectCardRowVisible(page, "Drilldown Lowongan Draft ATS", draftJobTitle);

      await fillCardSearch(page, "Drilldown Offer ATS Kedaluwarsa", offerPosition);
      await expectCardRowVisible(page, "Drilldown Offer ATS Kedaluwarsa", offerPosition);
    } finally {
      if (offerId) {
        await serviceClient!.from("hr_recruitment_offers").delete().eq("id", offerId);
      }
      if (candidateId) {
        await serviceClient!.from("hr_recruitment_candidates").delete().eq("id", candidateId);
      }
      if (jobId) {
        await serviceClient!.from("hr_recruitment_jobs").delete().eq("id", jobId);
      }
      if (quotaId) {
        await serviceClient!.from("leave_quotas").delete().eq("id", quotaId);
      }
      if (leaveTypeId) {
        await serviceClient!.from("leave_types").delete().eq("id", leaveTypeId);
      }
      if (contractId) {
        await serviceClient!.from("hr_contracts").delete().eq("id", contractId);
      }
    }
  });
});
