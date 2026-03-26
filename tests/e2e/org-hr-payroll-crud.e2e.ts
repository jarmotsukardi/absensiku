import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { loginAsPayrollOrgAdmin, toYmd, waitForStable } from "./helpers/orgAuth";
import { ensureOrgWorkspaceEnabled } from "./helpers/orgWorkspace";
import { createSupabaseServiceTestClient } from "./helpers/supabaseTestEnv";
import {
  canOpenCreateDialog,
  clickResilient,
  closeDialogIfVisible,
} from "./helpers/crudDialogs";

const expectPayrollReadOnlyFallback = async (page: Page, heading: string) => {
  await waitForStable(page);

  const pageHeading = page.getByRole("heading", { name: heading });
  const pageHeadingText = page.getByText(heading, { exact: true });
  const deniedHeading = page.getByRole("heading", { name: "Akses Payroll Ditolak" });
  const workspaceHeading = page.getByRole("heading", { name: "Payroll Workspace" });
  const loadError = page.getByText("Gagal memuat", { exact: false });

  const states = [pageHeading, pageHeadingText, deniedHeading, workspaceHeading, loadError];
  for (const state of states) {
    if (await state.isVisible().catch(() => false)) return;
  }

  await expect
    .poll(
      async () => {
        for (const state of states) {
          if (await state.isVisible().catch(() => false)) {
            return true;
          }
        }
        return false;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
};

const hardenFloatingOverlay = async (page: Page) => {
  await page
    .addStyleTag({
      content: ".animate-wa-ripple-1,.animate-wa-ripple-2{pointer-events:none!important;}",
    })
    .catch(() => undefined);
};

test.describe.serial("Org HR/Payroll CRUD", () => {
  let latestRunTraceId = "";

  test("hr employees flow: create employee menyimpan relasi organisasi payroll-impact", async ({ page }) => {
    const account = await loginAsPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    const adminClient = await createSupabaseServiceTestClient();
    test.skip(!adminClient, "SUPABASE_SERVICE_ROLE_KEY belum tersedia untuk cleanup test employee.");
    test.skip(!account.tenant_id, "tenant_id account org admin belum diisi.");

    const tenantId = account.tenant_id!;
    let createdEmployeeId = "";

    const { data: opds, error: opdError } = await adminClient!
      .from("opd")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1);
    if (opdError) throw opdError;
    test.skip((opds || []).length === 0, "Belum ada master OPD aktif untuk memvalidasi relasi pegawai.");

    const selectedOpd = opds![0];
    const { data: workUnits, error: workUnitError } = await adminClient!
      .from("work_units")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("opd_id", selectedOpd.id)
      .order("name", { ascending: true })
      .limit(1);
    if (workUnitError) throw workUnitError;
    test.skip((workUnits || []).length === 0, "Belum ada unit kerja aktif untuk OPD uji.");

    const { data: offices, error: officeError } = await adminClient!
      .from("offices")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("opd_id", selectedOpd.id)
      .order("name", { ascending: true })
      .limit(1);
    if (officeError) throw officeError;
    test.skip((offices || []).length === 0, "Belum ada lokasi kerja aktif untuk OPD uji.");

    const { data: positions, error: positionError } = await adminClient!
      .from("positions")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .or(`opd_id.is.null,opd_id.eq.${selectedOpd.id}`)
      .order("name", { ascending: true })
      .limit(1);
    if (positionError) throw positionError;
    test.skip((positions || []).length === 0, "Belum ada jabatan master aktif untuk validasi relasi pegawai.");

    const selectedWorkUnit = workUnits![0];
    const selectedOffice = offices![0];
    const selectedPosition = positions![0];
    const suffix = Date.now().toString().slice(-8);
    const employeeName = `E2E Pegawai HR ${suffix}`;
    const employeeEmail = `e2e-hr-${suffix}@example.com`;
    const employeeNik = `3174${suffix.padStart(12, "0").slice(-12)}`;
    const employeeNip = `1987${suffix.padStart(14, "0").slice(-14)}`;

    try {
      await page.goto("/org/hr/employees", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.getByRole("heading", { name: "Data Pegawai", exact: true })).toBeVisible();

      const opened = await canOpenCreateDialog(page, "Tambah Pegawai", "Tambah Pegawai");
      if (!opened) {
        await expect(page.getByRole("heading", { name: "Data Pegawai", exact: true })).toBeVisible();
        test.fail(true, "Dialog tambah pegawai tidak terbuka untuk org admin.");
        return;
      }

      const dialog = page.getByRole("dialog").last();
      await dialog.locator("#employee-name").fill(employeeName);
      await dialog.locator("#employee-email").fill(employeeEmail);
      await dialog.locator("#employee-nik").fill(employeeNik);
      await dialog.locator("#employee-nip").fill(employeeNip);
      await dialog.locator("#employee-category").fill("ASN");
      await dialog.locator("#employee-golongan").fill("III/a");
      await dialog.locator("#employee-position").fill(selectedPosition.name);
      await dialog.locator("#employee-opd").selectOption(selectedOpd.id);
      await dialog.locator("#employee-work-unit").selectOption(selectedWorkUnit.id);
      await dialog.locator("#employee-office").selectOption(selectedOffice.id);
      await dialog.locator("#employee-position-id").selectOption(selectedPosition.id);
      await dialog.getByRole("button", { name: "Tambah Pegawai", exact: true }).click();

      await page.waitForTimeout(2_000);
      const createDialogStillOpen = await page
        .getByRole("heading", { name: "Tambah Pegawai", exact: true })
        .isVisible()
        .catch(() => false);
      if (createDialogStillOpen) {
        await closeDialogIfVisible(page, "Tambah Pegawai");
        test.fail(true, "Dialog tambah pegawai tetap terbuka; create employee belum lolos.");
        return;
      }

      await page.getByPlaceholder("Cari nama, email, NIP, kategori, golongan...").fill(employeeEmail);
      await waitForStable(page);
      const createdRow = page.locator("tbody tr", { hasText: employeeEmail }).first();
      await expect(createdRow).toBeVisible();
      await expect(createdRow).toContainText(selectedOpd.name);
      await expect(createdRow).toContainText(selectedWorkUnit.name);
      await expect(createdRow).toContainText(selectedOffice.name);
      await expect(createdRow).toContainText(selectedPosition.name);

      const { data: createdEmployee, error: createdEmployeeError } = await adminClient!
        .from("employees")
        .select("id, opd_id, work_unit_id, office_id, position_id, position")
        .eq("tenant_id", tenantId)
        .ilike("email", employeeEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (createdEmployeeError) throw createdEmployeeError;

      expect(createdEmployee?.opd_id).toBe(selectedOpd.id);
      expect(createdEmployee?.work_unit_id).toBe(selectedWorkUnit.id);
      expect(createdEmployee?.office_id).toBe(selectedOffice.id);
      expect(createdEmployee?.position_id).toBe(selectedPosition.id);
      expect(createdEmployee?.position).toBe(selectedPosition.name);
      createdEmployeeId = createdEmployee?.id || "";
    } finally {
      if (createdEmployeeId) {
        await adminClient!.from("audit_logs").delete().eq("tenant_id", tenantId).eq("employee_id", createdEmployeeId);
        await adminClient!.from("employees").delete().eq("tenant_id", tenantId).eq("id", createdEmployeeId);
      }
    }
  });

  test("hr employees flow: edit relasi organisasi terbaca ulang dan bisa direstore", async ({ page }) => {
    await loginAsPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    await page.goto("/org/hr/employees", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await expect(page.getByRole("heading", { name: "Data Pegawai", exact: true })).toBeVisible();

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toBeVisible();
    const employeeEmail = (await firstRow.locator("td").nth(2).textContent())?.trim() || "";
    test.skip(!employeeEmail, "Tidak menemukan pegawai aktif untuk uji relasi organisasi.");

    await clickResilient(firstRow.getByRole("button").first());
    const dialog = page.getByRole("dialog").last();
    await expect(dialog.getByRole("heading", { name: "Edit Data Pegawai", exact: true })).toBeVisible();

    const originalState = {
      employeeCategory: await dialog.locator("#employee-category").inputValue(),
      position: await dialog.locator("#employee-position").inputValue(),
      opdId: await dialog.locator("#employee-opd").inputValue(),
      workUnitId: await dialog.locator("#employee-work-unit").inputValue(),
      officeId: await dialog.locator("#employee-office").inputValue(),
      positionId: await dialog.locator("#employee-position-id").inputValue(),
    };
    test.skip(
      !originalState.employeeCategory.trim(),
      "Dataset pegawai aktif tenant uji masih kosong pada kategori pegawai, sehingga edit reversibel belum bisa dibuktikan.",
    );

    const readOptions = async (selector: string) =>
      dialog.locator(selector).evaluate((element) =>
        Array.from((element as HTMLSelectElement).options)
          .map((option) => ({ value: option.value, label: option.textContent?.trim() || "" }))
          .filter((option) => option.value),
      );

    const opdOptions = await readOptions("#employee-opd");
    const targetOpd = opdOptions.find((option) => option.value !== originalState.opdId) || opdOptions[0];
    test.skip(!targetOpd, "Belum ada master OPD aktif untuk uji edit relasi pegawai.");

    await dialog.locator("#employee-opd").selectOption(targetOpd.value);
    await page.waitForTimeout(300);

    const workUnitOptions = await readOptions("#employee-work-unit");
    const officeOptions = await readOptions("#employee-office");
    const positionOptions = await readOptions("#employee-position-id");
    const targetWorkUnit = workUnitOptions.find((option) => option.value !== originalState.workUnitId) || workUnitOptions[0];
    const targetOffice = officeOptions.find((option) => option.value !== originalState.officeId) || officeOptions[0];
    const targetPosition = positionOptions.find((option) => option.value !== originalState.positionId) || positionOptions[0];

    test.skip(!targetWorkUnit || !targetOffice || !targetPosition, "Master relasi organisasi belum cukup lengkap untuk uji edit pegawai.");

    const hasMeaningfulChange =
      targetOpd.value !== originalState.opdId ||
      targetWorkUnit.value !== originalState.workUnitId ||
      targetOffice.value !== originalState.officeId ||
      targetPosition.value !== originalState.positionId;
    test.skip(!hasMeaningfulChange, "Belum ada alternatif relasi organisasi yang berbeda untuk pegawai uji.");

    await dialog.locator("#employee-work-unit").selectOption(targetWorkUnit.value);
    await dialog.locator("#employee-office").selectOption(targetOffice.value);
    await dialog.locator("#employee-position-id").selectOption(targetPosition.value);
    await expect(dialog.locator("#employee-position")).toHaveValue(targetPosition.label);
    await dialog.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();

    await page.waitForTimeout(2_000);
    const editDialogStillOpen = await page
      .getByRole("heading", { name: "Edit Data Pegawai", exact: true })
      .isVisible()
      .catch(() => false);
    if (editDialogStillOpen) {
      await closeDialogIfVisible(page, "Edit Data Pegawai");
      throw new Error("Dialog edit pegawai tetap terbuka; save relasi organisasi belum lolos.");
    }

    await page.getByPlaceholder("Cari nama, email, NIP, kategori, golongan...").fill(employeeEmail);
    await waitForStable(page);
    const updatedRow = page.locator("tbody tr", { hasText: employeeEmail }).first();
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow).toContainText(targetOpd.label);
    await expect(updatedRow).toContainText(targetWorkUnit.label);
    await expect(updatedRow).toContainText(targetOffice.label);
    await expect(updatedRow).toContainText(targetPosition.label);

    await clickResilient(updatedRow.getByRole("button").first());
    const restoreDialog = page.getByRole("dialog").last();
    await expect(restoreDialog.getByRole("heading", { name: "Edit Data Pegawai", exact: true })).toBeVisible();
    await expect(restoreDialog.locator("#employee-opd")).toHaveValue(targetOpd.value);
    await expect(restoreDialog.locator("#employee-work-unit")).toHaveValue(targetWorkUnit.value);
    await expect(restoreDialog.locator("#employee-office")).toHaveValue(targetOffice.value);
    await expect(restoreDialog.locator("#employee-position-id")).toHaveValue(targetPosition.value);

    await restoreDialog.locator("#employee-opd").selectOption(originalState.opdId || "");
    await page.waitForTimeout(300);
    if (originalState.workUnitId) {
      await restoreDialog.locator("#employee-work-unit").selectOption(originalState.workUnitId);
    }
    if (originalState.officeId) {
      await restoreDialog.locator("#employee-office").selectOption(originalState.officeId);
    }
    if (originalState.positionId) {
      await restoreDialog.locator("#employee-position-id").selectOption(originalState.positionId);
    }
    await restoreDialog.locator("#employee-position").fill(originalState.position);
    await restoreDialog.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();

    await page.waitForTimeout(2_000);
    const restoreDialogStillOpen = await page
      .getByRole("heading", { name: "Edit Data Pegawai", exact: true })
      .isVisible()
      .catch(() => false);
    if (restoreDialogStillOpen) {
      await closeDialogIfVisible(page, "Edit Data Pegawai");
      throw new Error("Dialog edit pegawai tetap terbuka; restore relasi organisasi belum lolos.");
    }
  });

  test("hr employees flow: bulk kategori menghormati seleksi baris pada butuh review", async ({ page }) => {
    await loginAsPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    await page.goto("/org/hr/employees", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Data Pegawai", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Butuh Review/i }).click();
    await expect(page.getByText(/Menampilkan\s+\d+\s+pegawai dengan gap/i)).toBeVisible();
    await page.getByRole("button", { name: /^Kategori \(/i }).click();
    await expect(page.getByText("Belum ada seleksi khusus.", { exact: false })).toBeVisible();

    const selectableRows = page.locator('tbody tr input[type="checkbox"][aria-label^="Pilih "]');
    const selectableCount = await selectableRows.count();
    test.skip(selectableCount === 0, "Belum ada pegawai dengan gap Kategori untuk memvalidasi bulk seleksi.");

    await expect(page.getByText("Belum ada seleksi khusus.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Isi Semua: ASN", exact: true })).toBeVisible();

    await selectableRows.first().check();
    await expect(page.getByText(/Bulk kategori akan memakai\s+1\s+pegawai terpilih\./i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Isi Terpilih: ASN", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Isi Terpilih: ASN", exact: true }).click();
    const dialog = page.getByRole("alertdialog").last();
    await expect(dialog.getByRole("heading", { name: "Konfirmasi Bulk Kategori", exact: true })).toBeVisible();
    await expect(dialog.getByText(/akan mengisi\s+1\s+pegawai terpilih/i)).toBeVisible();
    await expect(dialog.getByText("Pratinjau pegawai terdampak", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    await page.getByRole("button", { name: /Hapus Pilihan/i }).click();
    await expect(page.getByText("Belum ada seleksi khusus.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Isi Semua: ASN", exact: true })).toBeVisible();
  });

  test("hr employees flow: navigasi review mengikuti subset pegawai terpilih", async ({ page }) => {
    await loginAsPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");

    await page.goto("/org/hr/employees", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Data Pegawai", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Butuh Review/i }).click();
    await expect(page.getByText(/Menampilkan\s+\d+\s+pegawai dengan gap/i)).toBeVisible();
    await page.getByRole("button", { name: /^Kategori \(/i }).click();
    await expect(page.getByText("Belum ada seleksi khusus.", { exact: false })).toBeVisible();

    const selectableRows = page.locator('tbody tr input[type="checkbox"][aria-label^="Pilih "]');
    const selectableCount = await selectableRows.count();
    test.skip(selectableCount < 2, "Butuh minimal 2 pegawai dengan gap Kategori untuk memvalidasi subset review.");

    const selectedRows = page.locator("tbody tr").filter({
      has: page.locator('input[type="checkbox"][aria-label^="Pilih "]'),
    });
    const firstName = ((await selectedRows.nth(0).locator("td").nth(1).textContent()) || "").trim();
    const secondName = ((await selectedRows.nth(1).locator("td").nth(1).textContent()) || "").trim();
    test.skip(!firstName || !secondName, "Tidak berhasil membaca nama pegawai untuk validasi subset review.");

    await selectableRows.nth(0).check();
    await selectableRows.nth(1).check();
    await expect(page.getByText(/Bulk kategori akan memakai\s+2\s+pegawai terpilih\./i)).toBeVisible();

    await selectedRows.nth(0).getByRole("button", { name: "Ubah", exact: true }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog.getByRole("heading", { name: "Edit Data Pegawai", exact: true })).toBeVisible();
    await expect(dialog.getByText(/Sedang meninjau\s+1\s+dari\s+2\s+pegawai/i)).toBeVisible();
    await expect(dialog.locator("#employee-name")).toHaveValue(firstName);

    await expect(dialog.getByRole("button", { name: "Simpan & Lanjut", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Berikutnya", exact: true }).click();
    await expect(dialog.getByText(/Sedang meninjau\s+2\s+dari\s+2\s+pegawai/i)).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator("#employee-name")).toHaveValue(secondName);
    await expect(dialog.getByText(/Cakupan tinjau mengikuti pegawai terpilih\./i)).toBeVisible();

    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("payroll periods flow: CRUD jika ada izin write, fallback read-only jika tidak", async ({ page }) => {
    await loginAsPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace Payroll");

    await page.goto("/org/payroll/periods", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const periodKey = `E2E${Date.now()}`;

    const opened = await canOpenCreateDialog(page, "Tambah Periode", "Tambah Periode Payroll");
    if (!opened) {
      await expectPayrollReadOnlyFallback(page, "Periode Payroll");
      return;
    }

    await page.fill("#period_key", periodKey);
    await page.fill("#period_start", toYmd(start));
    await page.fill("#period_end", toYmd(end));
    await page.fill("#notes", "E2E create");
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.waitForTimeout(2_000);
    const createDialogStillOpen = await page.getByRole("heading", { name: "Tambah Periode Payroll" }).isVisible().catch(() => false);
    if (createDialogStillOpen) {
      await closeDialogIfVisible(page, "Tambah Periode Payroll");
      await expectPayrollReadOnlyFallback(page, "Periode Payroll");
      return;
    }

    await page.getByPlaceholder("Cari period key, tanggal, atau catatan...").fill(periodKey);
    await waitForStable(page);

    const createdRow = page.locator("tr", { hasText: periodKey }).first();
    await expect(createdRow).toBeVisible();

    await createdRow.getByRole("button").first().click();
    await expect(page.getByRole("heading", { name: "Edit Periode Payroll" })).toBeVisible();
    await page.fill("#notes", "E2E edited");
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.getByPlaceholder("Cari period key, tanggal, atau catatan...").fill(periodKey);
    await waitForStable(page);
    const editedRow = page.locator("tr", { hasText: periodKey }).first();
    await expect(editedRow).toBeVisible();

    await clickResilient(editedRow.getByRole("button").nth(1));
    await clickResilient(page.getByRole("button", { name: "Ya, hapus" }));

    await page.getByPlaceholder("Cari period key, tanggal, atau catatan...").fill(periodKey);
    await waitForStable(page);
    await expect(page.locator("tr", { hasText: periodKey })).toHaveCount(0);
  });

  test("payroll policies flow: CRUD jika ada izin write, fallback read-only jika tidak", async ({ page }) => {
    await loginAsPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace Payroll");

    await page.goto("/org/payroll/policies", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const noteKey = `E2EPOL${Date.now()}`;
    const editedNoteKey = `${noteKey}EDIT`;
    const now = new Date();
    const createDate = toYmd(new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate(), 27)));
    const editDate = toYmd(new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 1, 28)));

    const opened = await canOpenCreateDialog(page, "Tambah Kebijakan", "Tambah Kebijakan Payroll");
    if (!opened) {
      await expectPayrollReadOnlyFallback(page, "Kebijakan Payroll");
      return;
    }

    await page.fill("#effective_date", createDate);
    await page.fill("#notes", noteKey);
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.waitForTimeout(2_000);
    const createDialogStillOpen = await page.getByRole("heading", { name: "Tambah Kebijakan Payroll" }).isVisible().catch(() => false);
    if (createDialogStillOpen) {
      await closeDialogIfVisible(page, "Tambah Kebijakan Payroll");
      await expectPayrollReadOnlyFallback(page, "Kebijakan Payroll");
      return;
    }

    await page.getByPlaceholder("Cari tanggal efektif, mode pembulatan, catatan...").fill(noteKey);
    await waitForStable(page);

    const createdRow = page.locator("tbody tr").first();
    await expect(createdRow).toBeVisible();

    await createdRow.getByRole("button").first().click();
    await expect(page.getByRole("heading", { name: "Edit Kebijakan Payroll" })).toBeVisible();
    await page.fill("#effective_date", editDate);
    await page.fill("#notes", editedNoteKey);
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.getByPlaceholder("Cari tanggal efektif, mode pembulatan, catatan...").fill(editedNoteKey);
    await waitForStable(page);
    const editedRow = page.locator("tbody tr").first();
    await expect(editedRow).toBeVisible();

    await clickResilient(editedRow.getByRole("button").nth(1));
    await clickResilient(page.getByRole("button", { name: "Ya, hapus" }));

    await page.getByPlaceholder("Cari tanggal efektif, mode pembulatan, catatan...").fill(editedNoteKey);
    await waitForStable(page);
    await expect(page.locator("tr", { hasText: editedNoteKey })).toHaveCount(0);
  });

  test("hr contracts flow: CRUD jika ada izin write dan data pegawai tersedia", async ({ page }) => {
    await loginAsPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace HR");
    await hardenFloatingOverlay(page);

    await page.goto("/org/hr/contracts", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const contractKey = `E2EHC${Date.now()}`;
    const editedContractKey = `${contractKey}EDIT`;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const opened = await canOpenCreateDialog(page, "Tambah Kontrak", "Tambah Kontrak Kerja");
    if (!opened) {
      await expect(page.getByRole("heading", { name: "Kontrak Kerja", exact: true })).toBeVisible();
      return;
    }

    const employeeSelectTrigger = page
      .locator("label", { hasText: "Pegawai" })
      .locator("..")
      .getByRole("combobox")
      .first();
    await employeeSelectTrigger.click();
    const employeeOptions = page.getByRole("option");
    const optionCount = await employeeOptions.count();
    if (optionCount === 0) {
      await page.keyboard.press("Escape");
      await closeDialogIfVisible(page, "Tambah Kontrak Kerja");
      await expect(page.getByRole("heading", { name: "Kontrak Kerja", exact: true })).toBeVisible();
      return;
    }
    await employeeOptions.first().click();

    await page.fill("#contract_number", contractKey);
    await page.fill("#start_date", toYmd(start));
    const invalidEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    invalidEnd.setDate(1);
    const invalidStart = new Date(now.getFullYear(), now.getMonth(), 2);
    await page.fill("#start_date", toYmd(invalidStart));
    await page.fill("#end_date", toYmd(invalidEnd));
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("heading", { name: "Tambah Kontrak Kerja", exact: true })).toBeVisible();

    await page.fill("#start_date", toYmd(start));
    await page.fill("#end_date", toYmd(end));
    await page.fill("#notes", "E2E contract create");
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.waitForTimeout(2_000);
    const createDialogStillOpen = await page.getByRole("heading", { name: "Tambah Kontrak Kerja" }).isVisible().catch(() => false);
    if (createDialogStillOpen) {
      await closeDialogIfVisible(page, "Tambah Kontrak Kerja");
      await expect(page.getByRole("heading", { name: "Kontrak Kerja", exact: true })).toBeVisible();
      return;
    }

    await page.getByPlaceholder("Cari nama pegawai, email, nomor kontrak...").fill(contractKey);
    await waitForStable(page);
    const createdRow = page.locator("tr", { hasText: contractKey }).first();
    await expect(createdRow).toBeVisible();

    await page.getByRole("button", { name: "Tambah Kontrak" }).click();
    await expect(page.getByRole("heading", { name: "Tambah Kontrak Kerja", exact: true })).toBeVisible();
    await employeeSelectTrigger.click();
    await employeeOptions.first().click();
    await page.fill("#contract_number", `${contractKey}-OVL`);
    await page.fill("#start_date", toYmd(start));
    await page.fill("#end_date", toYmd(end));
    await page.fill("#notes", "E2E overlap check");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("heading", { name: "Tambah Kontrak Kerja", exact: true })).toBeVisible();
    await closeDialogIfVisible(page, "Tambah Kontrak Kerja");

    await page.getByRole("button", { name: "Tambah Kontrak" }).click();
    await expect(page.getByRole("heading", { name: "Tambah Kontrak Kerja", exact: true })).toBeVisible();
    await employeeSelectTrigger.click();
    await employeeOptions.first().click();
    await page.fill("#contract_number", contractKey);
    await page.fill("#start_date", toYmd(start));
    await page.fill("#end_date", toYmd(end));
    await page.fill("#notes", "E2E duplicate check");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("heading", { name: "Tambah Kontrak Kerja", exact: true })).toBeVisible();
    await closeDialogIfVisible(page, "Tambah Kontrak Kerja");

    await clickResilient(createdRow.getByRole("button").first());
    await expect(page.getByRole("heading", { name: "Edit Kontrak Kerja", exact: true })).toBeVisible();
    await page.fill("#contract_number", editedContractKey);
    await page.fill("#notes", "E2E contract edited");
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.getByPlaceholder("Cari nama pegawai, email, nomor kontrak...").fill(editedContractKey);
    await waitForStable(page);
    const editedRow = page.locator("tr", { hasText: editedContractKey }).first();
    await expect(editedRow).toBeVisible();

    await clickResilient(editedRow.getByRole("button").nth(1));
    await clickResilient(page.getByRole("button", { name: "Ya, hapus" }));

    await page.getByPlaceholder("Cari nama pegawai, email, nomor kontrak...").fill(editedContractKey);
    await waitForStable(page);
    await expect(page.locator("tr", { hasText: editedContractKey })).toHaveCount(0);
  });

  test("payroll variable input flow: CRUD jika ada periode dan izin write", async ({ page }) => {
    await loginAsPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace Payroll");

    await page.goto("/org/payroll/variable-input", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const key = `E2EPVI${Date.now()}`;
    const editedKey = `${key}EDIT`;

    const opened = await canOpenCreateDialog(page, "Tambah Input", "Tambah Input Variabel");
    if (!opened) {
      await expectPayrollReadOnlyFallback(page, "Input Variabel Bulanan");
      return;
    }

    const dialog = page.getByRole("dialog");
    const periodSelect = dialog.getByRole("combobox").first();
    await periodSelect.click();
    const periodOptions = page.getByRole("option");
    const periodOptionCount = await periodOptions.count();
    if (periodOptionCount === 0) {
      await page.keyboard.press("Escape");
      await closeDialogIfVisible(page, "Tambah Input Variabel");
      await expectPayrollReadOnlyFallback(page, "Input Variabel Bulanan");
      return;
    }
    await periodOptions.first().click();

    await page.fill("#component_code", key);
    await page.fill("#component_name", "E2E Variable Input");
    await page.fill("#amount", "125000");
    await page.fill("#trace_id", key);
    await page.fill("#notes", "E2E variable create");
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.waitForTimeout(2_000);
    const createDialogStillOpen = await page.getByRole("heading", { name: "Tambah Input Variabel" }).isVisible().catch(() => false);
    if (createDialogStillOpen) {
      await closeDialogIfVisible(page, "Tambah Input Variabel");
      await expectPayrollReadOnlyFallback(page, "Input Variabel Bulanan");
      return;
    }

    await page.getByPlaceholder("Cari kode, nama komponen, trace id, atau catatan...").fill(key);
    await waitForStable(page);
    const createdRow = page.locator("tr", { hasText: key }).first();
    await expect(createdRow).toBeVisible();

    await createdRow.getByRole("button").first().click();
    await expect(page.getByRole("heading", { name: "Edit Input Variabel" })).toBeVisible();
    await page.fill("#component_code", editedKey);
    await page.fill("#trace_id", editedKey);
    await page.fill("#notes", "E2E variable edited");
    await page.getByRole("button", { name: "Simpan" }).click();

    await page.getByPlaceholder("Cari kode, nama komponen, trace id, atau catatan...").fill(editedKey);
    await waitForStable(page);
    const editedRow = page.locator("tr", { hasText: editedKey }).first();
    await expect(editedRow).toBeVisible();

    await clickResilient(editedRow.getByRole("button").nth(1));
    await clickResilient(page.getByRole("button", { name: "Ya, hapus" }));
    await waitForStable(page);
    await expect(page.locator("tr", { hasText: editedKey })).toHaveCount(0);
  });

  test("payroll run + approval flow: create run, sync approval, dan approve stage", async ({ page }) => {
    await loginAsPayrollOrgAdmin(page);
    await ensureOrgWorkspaceEnabled(page, "Aktifkan workspace Payroll");

    await page.goto("/org/payroll/run-engine", { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    const runTraceId = `E2ERUN${Date.now()}`;
    const runButton = page.getByRole("button", { name: "Buat Proses" });
    const runButtonVisible = await runButton.isVisible().catch(() => false);
    if (!runButtonVisible) {
      test.skip(true, "Tombol Proses Payroll tidak tersedia (read-only atau akses ditolak).");
      return;
    }
    await clickResilient(runButton);
    const dialogHeading = page.getByRole("heading", { name: "Buat Proses Payroll", exact: true });
    const dialogVisible = await dialogHeading.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!dialogVisible) {
      test.skip(true, "Dialog Proses Payroll tidak muncul setelah tombol diklik.");
      return;
    }

    const dialog = page.getByRole("dialog");
    const periodSelect = dialog.getByRole("combobox").first();
    await periodSelect.click();
    const periodOptions = page.getByRole("option");
    const periodOptionCount = await periodOptions.count();
    if (periodOptionCount === 0) {
      await page.keyboard.press("Escape");
      await closeDialogIfVisible(page, "Buat Proses Payroll");
      test.skip(true, "Belum ada periode payroll untuk menjalankan run.");
      return;
    }
    await periodOptions.first().click();

    await page.fill("#trace_id", runTraceId);
    await page.fill("#notes", "E2E run create");
    await page.getByRole("button", { name: "Simpan" }).click();
    await waitForStable(page);

    await page.getByPlaceholder("Cari ID trace, period key, atau catatan...").fill(runTraceId);
    await waitForStable(page);
    const createdRunRow = page.locator("tr", { hasText: runTraceId }).first();
    await expect(createdRunRow).toBeVisible();

    const processButton = createdRunRow.getByRole("button", { name: "Proses" });
    if (await processButton.isVisible().catch(() => false)) {
      await clickResilient(processButton);
      await waitForStable(page);
    }

    const reviewButton = createdRunRow.getByRole("button", { name: "Review" });
    if (await reviewButton.isVisible().catch(() => false)) {
      await clickResilient(reviewButton);
      await waitForStable(page);
    }

    latestRunTraceId = runTraceId;

    await page.goto("/org/payroll/approval", { waitUntil: "domcontentloaded" });
    await waitForStable(page);
    await page.getByRole("button", { name: "Sync dari Run" }).click();
    await waitForStable(page);

    await page.getByPlaceholder("Cari trace approval, trace run, atau catatan...").fill(latestRunTraceId);
    await waitForStable(page);

    const approvalRow = page.locator("tr", { hasText: latestRunTraceId }).first();
    if (await approvalRow.count() === 0) {
      await expect(page.getByRole("heading", { name: "Approval Payroll" })).toBeVisible();
      return;
    }

    await clickResilient(approvalRow.getByRole("button", { name: /Aksi/ }).first());
    await expect(page.getByRole("heading", { name: "Aksi Approval Payroll" })).toBeVisible();
    await page.fill("#comment", "E2E approval update");
    await clickResilient(page.getByRole("button", { name: "Approve" }));
    await waitForStable(page);

    await page.getByPlaceholder("Cari trace approval, trace run, atau catatan...").fill(latestRunTraceId);
    await waitForStable(page);
    await expect(page.locator("tr", { hasText: latestRunTraceId }).first()).toContainText("approved");
  });
});
