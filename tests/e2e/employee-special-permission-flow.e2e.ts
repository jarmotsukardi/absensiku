import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loginAsEmployee as loginAsEmployeeWithRoles } from "./helpers/employeeAuth";
import { loginAsOrgAdmin, waitForStable } from "./helpers/orgAuth";
import {
  createSupabaseServiceTestClient,
  getMissingSupabaseTestEnvKeys,
} from "./helpers/supabaseTestEnv";
import { getRoleCredsWithFallback, solveMathExpression } from "./helpers/testAccounts";
import { dismissDialogByButtonIfPresent } from "./helpers/uiHelpers";

const LATE_PREFIX = "[IZIN_TERLAMBAT_V1]";
const EARLY_PREFIX = "[IZIN_PULANG_CEPAT_V1]";
const LATE_NOTE_MARKER = "[IZIN_TERLAMBAT_DISETUJUI]";
const EARLY_NOTE_MARKER = "[IZIN_PULANG_CEPAT_DISETUJUI]";

type TestEmployeeContext = {
  id: string;
  tenant_id: string;
  office_id: string | null;
  email: string;
};

type AttendanceSeedContext = {
  attendanceId: string;
  date: string;
};

type LeaveRequestContext = {
  requestId: string;
  date: string;
};

const getTodayYmd = () => new Date().toISOString().slice(0, 10);
const getYesterdayYmd = () => {
  const value = new Date();
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
};

const resolveEmployeeContext = async (
  client: SupabaseClient,
  employeeEmail: string,
): Promise<TestEmployeeContext | null> => {
  const { data, error } = await client
    .from("employees")
    .select("id, tenant_id, office_id, email, is_active")
    .eq("email", employeeEmail)
    .eq("is_active", true)
    .limit(2);

  if (error) throw error;
  if (!data || data.length !== 1) return null;

  return {
    id: data[0].id,
    tenant_id: data[0].tenant_id,
    office_id: data[0].office_id,
    email: data[0].email,
  };
};

const seedAttendance = async (
  client: SupabaseClient,
  employee: TestEmployeeContext,
  date: string,
  status: "terlambat" | "pulang_cepat",
): Promise<AttendanceSeedContext | null> => {
  if (!employee.office_id) return null;

  const { data: existingRows, error: existingError } = await client
    .from("attendance_records_partitioned")
    .select("id")
    .eq("employee_id", employee.id)
    .eq("date", date)
    .limit(2);

  if (existingError) throw existingError;
  if ((existingRows || []).length > 0) return null;

  const checkInIso = `${date}T09:10:00+07:00`;
  const checkOutIso = status === "pulang_cepat" ? `${date}T15:00:00+07:00` : null;

  const { data: inserted, error: insertError } = await client
    .from("attendance_records_partitioned")
    .insert({
      employee_id: employee.id,
      office_id: employee.office_id,
      date,
      check_in_time: checkInIso,
      check_out_time: checkOutIso,
      status,
      notes: "E2E seeded special-permission scenario",
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return { attendanceId: inserted.id, date };
};

const submitLatePermissionFromEmployeeUi = async (
  page: Page,
  reasonToken: string,
): Promise<void> => {
  await page.goto("/employee/dashboard?tab=requests", { waitUntil: "domcontentloaded" });
  await waitForStable(page);

  await page.getByRole("button", { name: "Izin Terlambat" }).click();
  await page.getByRole("button", { name: "Ajukan Izin Terlambat" }).click();

  await expect(page.getByRole("heading", { name: "Permohonan Izin Terlambat" })).toBeVisible();
  await page.fill("#estimated-arrival-time", "09:45");
  await page.fill("#late-reason", `E2E LATE ${reasonToken} - validasi normalisasi status`);
  await page.getByRole("button", { name: "Kirim Permohonan" }).click();

  await expect(page.getByRole("heading", { name: "Permohonan Izin Terlambat" })).not.toBeVisible({ timeout: 12_000 });
};

const submitEarlyPermissionFromEmployeeUi = async (
  page: Page,
  reasonToken: string,
): Promise<void> => {
  await page.goto("/employee/dashboard?tab=requests", { waitUntil: "domcontentloaded" });
  await waitForStable(page);

  await page.getByRole("button", { name: "Izin Pulang Cepat" }).click();
  await page.getByRole("button", { name: "Ajukan Izin Pulang Cepat" }).click();

  await expect(page.getByRole("heading", { name: "Permohonan Izin Pulang Cepat" })).toBeVisible();
  await page.fill("#planned-leave-time", "15:10");
  await page.fill("#early-leave-reason", `E2E EARLY ${reasonToken} - validasi normalisasi status`);
  await page.getByRole("button", { name: "Kirim Permohonan" }).click();

  await expect(page.getByRole("heading", { name: "Permohonan Izin Pulang Cepat" })).not.toBeVisible({ timeout: 12_000 });
};

const findSpecialRequest = async (
  client: SupabaseClient,
  employeeId: string,
  reasonToken: string,
  prefix: typeof LATE_PREFIX | typeof EARLY_PREFIX,
): Promise<LeaveRequestContext | null> => {
  const { data, error } = await client
    .from("leave_requests")
    .select("id, start_date, reason, status")
    .eq("employee_id", employeeId)
    .eq("leave_type", "izin")
    .like("reason", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  const row = (data || []).find((item) => (item.reason || "").includes(reasonToken));
  if (!row) return null;
  return { requestId: row.id, date: row.start_date };
};

const waitForSpecialRequest = async (
  client: SupabaseClient,
  employeeId: string,
  reasonToken: string,
  prefix: typeof LATE_PREFIX | typeof EARLY_PREFIX,
): Promise<LeaveRequestContext> => {
  await expect
    .poll(
      async () => {
        const request = await findSpecialRequest(client, employeeId, reasonToken, prefix);
        return request?.requestId ?? null;
      },
      { timeout: 20_000, intervals: [500, 1000, 1500] },
    )
    .not.toBeNull();

  const request = await findSpecialRequest(client, employeeId, reasonToken, prefix);
  if (!request) {
    throw new Error(`Special permission request tidak ditemukan untuk token: ${reasonToken}`);
  }
  return request;
};

const approveRequestFromOrgUi = async (page: Page, reasonToken: string) => {
  await page.goto("/org/leave/requests", { waitUntil: "domcontentloaded" });
  await waitForStable(page);
  await dismissDialogByButtonIfPresent(page, "Saya Mengerti");

  const searchInput = page.getByPlaceholder("Cari permohonan...");
  await searchInput.fill(reasonToken);

  const row = page.locator("tr", { hasText: reasonToken }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  const actionButtons = row.locator("button");
  await expect(actionButtons.first()).toBeVisible();
  await actionButtons.first().click();
  await expect(page.locator("tr", { hasText: reasonToken })).toHaveCount(0, { timeout: 20_000 });
};

test.describe.serial("Employee Special Permission Approval Flow", () => {
  test.skip(
    !process.env.E2E_SPECIAL_PERMISSION_FLOW,
    "Set E2E_SPECIAL_PERMISSION_FLOW=1 untuk menjalankan flow izin terlambat/pulang cepat.",
  );

  test("izin terlambat: approve admin menormalkan status ke hadir + marker notes", async ({ page }) => {
    test.setTimeout(180_000);

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

    const employeeCreds = await getRoleCredsWithFallback(["employee", "employee_centralized"]);
    test.skip(!employeeCreds, "Kredensial employee belum tersedia.");

    const employeeContext = await resolveEmployeeContext(serviceClient!, employeeCreds!.email);
    test.skip(!employeeContext, "Data employee aktif untuk kredensial employee tidak ditemukan.");

    const attendanceDate = getTodayYmd();
    const seededAttendance = await seedAttendance(serviceClient!, employeeContext!, attendanceDate, "terlambat");
    test.skip(!seededAttendance, "Attendance hari ini sudah ada. Lewati agar tidak menimpa data.");

    const reasonToken = `LATE-${Date.now()}`;
    let createdRequestId: string | null = null;

    try {
      await loginAsEmployeeWithRoles(page, ["employee", "employee_centralized"]);
      await submitLatePermissionFromEmployeeUi(page, reasonToken);

      const requestCtx = await waitForSpecialRequest(
        serviceClient!,
        employeeContext!.id,
        reasonToken,
        LATE_PREFIX,
      );
      createdRequestId = requestCtx.requestId;

      const adminPage = await page.context().browser()!.newPage();
      try {
        await loginAsOrgAdmin(adminPage, ["org_admin", "org_admin_centralized"]);
        await approveRequestFromOrgUi(adminPage, reasonToken);
      } finally {
        await adminPage.close();
      }

      await expect
        .poll(
          async () => {
            const { data, error } = await serviceClient!
              .from("leave_requests")
              .select("status")
              .eq("id", createdRequestId!)
              .single();
            if (error) throw error;
            return data.status;
          },
          { timeout: 20_000, intervals: [800, 1200, 1500] },
        )
        .toBe("disetujui");

      await expect
        .poll(
          async () => {
            const { data, error } = await serviceClient!
              .from("attendance_records_partitioned")
              .select("status, notes")
              .eq("id", seededAttendance!.attendanceId)
              .single();
            if (error) throw error;
            return {
              status: data.status,
              hasMarker: (data.notes || "").includes(LATE_NOTE_MARKER),
            };
          },
          { timeout: 20_000, intervals: [800, 1200, 1500] },
        )
        .toEqual({ status: "hadir", hasMarker: true });
    } finally {
      if (createdRequestId) {
        await serviceClient!.from("leave_requests").delete().eq("id", createdRequestId);
      }
      await serviceClient!.from("attendance_records_partitioned").delete().eq("id", seededAttendance!.attendanceId);
    }
  });

  test("izin pulang cepat: approve admin menormalkan status ke hadir + marker notes", async ({ page }) => {
    test.setTimeout(180_000);

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

    const employeeCreds = await getRoleCredsWithFallback(["employee", "employee_centralized"]);
    test.skip(!employeeCreds, "Kredensial employee belum tersedia.");

    const employeeContext = await resolveEmployeeContext(serviceClient!, employeeCreds!.email);
    test.skip(!employeeContext, "Data employee aktif untuk kredensial employee tidak ditemukan.");

    const attendanceDate = getTodayYmd();
    const seededAttendance = await seedAttendance(serviceClient!, employeeContext!, attendanceDate, "pulang_cepat");
    test.skip(!seededAttendance, "Attendance hari ini sudah ada. Lewati agar tidak menimpa data.");

    const reasonToken = `EARLY-${Date.now()}`;
    let createdRequestId: string | null = null;

    try {
      await loginAsEmployeeWithRoles(page, ["employee", "employee_centralized"]);
      await submitEarlyPermissionFromEmployeeUi(page, reasonToken);

      const requestCtx = await waitForSpecialRequest(
        serviceClient!,
        employeeContext!.id,
        reasonToken,
        EARLY_PREFIX,
      );
      createdRequestId = requestCtx.requestId;

      const adminPage = await page.context().browser()!.newPage();
      try {
        await loginAsOrgAdmin(adminPage, ["org_admin", "org_admin_centralized"]);
        await approveRequestFromOrgUi(adminPage, reasonToken);
      } finally {
        await adminPage.close();
      }

      await expect
        .poll(
          async () => {
            const { data, error } = await serviceClient!
              .from("leave_requests")
              .select("status")
              .eq("id", createdRequestId!)
              .single();
            if (error) throw error;
            return data.status;
          },
          { timeout: 20_000, intervals: [800, 1200, 1500] },
        )
        .toBe("disetujui");

      await expect
        .poll(
          async () => {
            const { data, error } = await serviceClient!
              .from("attendance_records_partitioned")
              .select("status, notes")
              .eq("id", seededAttendance!.attendanceId)
              .single();
            if (error) throw error;
            return {
              status: data.status,
              hasMarker: (data.notes || "").includes(EARLY_NOTE_MARKER),
            };
          },
          { timeout: 20_000, intervals: [800, 1200, 1500] },
        )
        .toEqual({ status: "hadir", hasMarker: true });
    } finally {
      if (createdRequestId) {
        await serviceClient!.from("leave_requests").delete().eq("id", createdRequestId);
      }
      await serviceClient!.from("attendance_records_partitioned").delete().eq("id", seededAttendance!.attendanceId);
    }
  });
});
