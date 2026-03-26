import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loginAsPayrollOrgAdmin, waitForStable } from "./helpers/orgAuth";
import {
  createSupabaseAnonTestClient,
  createSupabaseServiceTestClient,
  getMissingSupabaseTestEnvKeys,
} from "./helpers/supabaseTestEnv";

type PayrollEmployeeContext = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
};

type PayrollAssignmentSnapshot = {
  payroll_role: string;
  is_active: boolean;
};

type PayrollAccessModeSnapshot = {
  id: string;
  setting_value: unknown;
};

const ORG_PAYROLL_ACCESS_MODE_KEY = "org_payroll_access_mode_v1";

const resolvePayrollEmployeeContext = async (
  serviceClient: SupabaseClient,
  anonClient: SupabaseClient,
  creds: { email: string; password: string },
): Promise<PayrollEmployeeContext | null> => {
  const byEmail = await serviceClient
    .from("employees")
    .select("id, tenant_id, user_id, name, email, is_active")
    .eq("email", creds.email)
    .eq("is_active", true)
    .limit(2);
  if (!byEmail.error && byEmail.data && byEmail.data.length === 1) {
    return {
      id: byEmail.data[0].id,
      tenant_id: byEmail.data[0].tenant_id,
      user_id: byEmail.data[0].user_id,
      name: byEmail.data[0].name,
      email: byEmail.data[0].email,
    };
  }

  const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (authError || !authData.user?.id) return null;

  try {
    const byUserId = await serviceClient
      .from("employees")
      .select("id, tenant_id, user_id, name, email, is_active")
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .limit(2);
    if (!byUserId.error && byUserId.data && byUserId.data.length === 1) {
      return {
        id: byUserId.data[0].id,
        tenant_id: byUserId.data[0].tenant_id,
        user_id: byUserId.data[0].user_id,
        name: byUserId.data[0].name,
        email: byUserId.data[0].email,
      };
    }
    if (byEmail.error || !byEmail.data || byEmail.data.length !== 1) return null;

    return {
      id: byEmail.data[0].id,
      tenant_id: byEmail.data[0].tenant_id,
      user_id: byEmail.data[0].user_id,
      name: byEmail.data[0].name,
      email: byEmail.data[0].email,
    };
  } finally {
    await anonClient.auth.signOut();
  }
};

test.describe.serial("Org Payroll Role Matrix", () => {
  test("strict mode + payroll_auditor: deny payment, allow reports", async ({ page }) => {
    test.setTimeout(150_000);

    const creds = await loginAsPayrollOrgAdmin(page);
    const missingEnvKeys = await getMissingSupabaseTestEnvKeys({
      SUPABASE_URL: ["VITE_SUPABASE_URL", "SUPABASE_URL"],
      SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_ROLE_KEY"],
      SUPABASE_ANON_KEY: [
        "VITE_SUPABASE_ANON_KEY",
        "SUPABASE_ANON_KEY",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_PUBLISHABLE_KEY",
      ],
    });
    test.skip(
      missingEnvKeys.length > 0,
      `Supabase test client env belum lengkap: ${missingEnvKeys.join(", ")}`,
    );
    const serviceClient = await createSupabaseServiceTestClient();
    const anonClient = await createSupabaseAnonTestClient();
    test.skip(!serviceClient || !anonClient, "Supabase test client tidak bisa dibuat dari env yang tersedia.");
    const employeeContext = await resolvePayrollEmployeeContext(serviceClient!, anonClient!, creds);
    test.skip(!employeeContext, `Pegawai aktif untuk user ${creds.email} tidak ditemukan.`);
    test.skip(!employeeContext.user_id, `Pegawai ${creds.email} belum terhubung ke user aktif.`);

    const snapshotRes = await serviceClient!
      .from("payroll_role_assignments")
      .select("payroll_role, is_active")
      .eq("tenant_id", employeeContext.tenant_id)
      .eq("user_id", employeeContext.user_id);
    if (snapshotRes.error) throw snapshotRes.error;
    const assignmentSnapshot = (snapshotRes.data || []) as PayrollAssignmentSnapshot[];

    const accessModeSnapshotRes = await serviceClient!
      .from("organization_settings")
      .select("id, setting_value")
      .eq("tenant_id", employeeContext.tenant_id)
      .eq("setting_key", ORG_PAYROLL_ACCESS_MODE_KEY)
      .maybeSingle();
    if (accessModeSnapshotRes.error) throw accessModeSnapshotRes.error;
    const accessModeSnapshot = accessModeSnapshotRes.data as PayrollAccessModeSnapshot | null;

    const restoreAssignments = async () => {
      const deactivateRes = await serviceClient!
        .from("payroll_role_assignments")
        .update({ is_active: false })
        .eq("tenant_id", employeeContext.tenant_id)
        .eq("user_id", employeeContext.user_id!);
      if (deactivateRes.error) throw deactivateRes.error;

      const normalizedAssignments = new Map(
        assignmentSnapshot.map((item) => [item.payroll_role, item.is_active] as const),
      );
      normalizedAssignments.set("payroll_admin", true);
      normalizedAssignments.set("payroll_auditor", false);

      const restoreRes = await serviceClient!.from("payroll_role_assignments").upsert(
        Array.from(normalizedAssignments.entries()).map(([payroll_role, is_active]) => ({
          tenant_id: employeeContext.tenant_id,
          user_id: employeeContext.user_id,
          payroll_role,
          is_active,
        })),
        { onConflict: "tenant_id,user_id,payroll_role" },
      );
      if (restoreRes.error) throw restoreRes.error;
    };
    const saveStrictMode = async (mode: "strict" | "fallback") => {
      const payload = {
        tenant_id: employeeContext.tenant_id,
        setting_key: ORG_PAYROLL_ACCESS_MODE_KEY,
        setting_value: { version: 1, mode },
        description: "Mode akses route payroll (fallback/strict)",
      };
      const result = await serviceClient!
        .from("organization_settings")
        .upsert(payload, { onConflict: "tenant_id,setting_key" });
      if (result.error) throw result.error;
    };

    try {
      await saveStrictMode("strict");

      await page.goto("/org/payroll/roles", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      const rolesHeading = page.getByRole("heading", { name: "Hak Akses Payroll", exact: true, level: 1 });
      test.skip(!(await rolesHeading.isVisible().catch(() => false)), "Workspace payroll belum siap untuk tenant uji.");
      await expect(rolesHeading).toBeVisible();

      const deactivateCurrentRes = await serviceClient!
        .from("payroll_role_assignments")
        .update({ is_active: false })
        .eq("tenant_id", employeeContext.tenant_id)
        .eq("user_id", employeeContext.user_id);
      if (deactivateCurrentRes.error) throw deactivateCurrentRes.error;

      const auditorRes = await serviceClient!.from("payroll_role_assignments").upsert(
        {
          tenant_id: employeeContext.tenant_id,
          user_id: employeeContext.user_id,
          payroll_role: "payroll_auditor",
          is_active: true,
        },
        { onConflict: "tenant_id,user_id,payroll_role" },
      );
      if (auditorRes.error) throw auditorRes.error;

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForStable(page);

      const currentUserRow = page.getByRole("row").filter({ hasText: creds.email }).first();
      const activeRoleCell = currentUserRow.getByRole("cell").nth(1);
      await expect(currentUserRow).toBeVisible();
      await expect(activeRoleCell).toContainText("Payroll Auditor", { timeout: 15_000 });

      await page.goto("/org/payroll/payment", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect
        .poll(async () => new URL(page.url()).pathname, { timeout: 12_000 })
        .toBe("/org/payroll");
      await expect(page.getByRole("heading", { name: "Beranda Payroll", exact: true })).toBeVisible();

      await page.goto("/org/payroll/reports", { waitUntil: "domcontentloaded" });
      await waitForStable(page);
      await expect(page.getByRole("heading", { name: "Laporan Payroll", exact: true })).toBeVisible();
    } finally {
      await restoreAssignments();
      if (accessModeSnapshot?.id) {
        const restoreModeRes = await serviceClient!
          .from("organization_settings")
          .update({ setting_value: accessModeSnapshot.setting_value })
          .eq("id", accessModeSnapshot.id);
        if (restoreModeRes.error) {
          console.warn("[org-payroll-role-matrix] restore access mode gagal", restoreModeRes.error.message);
        }
      } else {
        const deleteModeRes = await serviceClient!
          .from("organization_settings")
          .delete()
          .eq("tenant_id", employeeContext.tenant_id)
          .eq("setting_key", ORG_PAYROLL_ACCESS_MODE_KEY);
        if (deleteModeRes.error) {
          console.warn("[org-payroll-role-matrix] cleanup access mode gagal", deleteModeRes.error.message);
        }
      }
    }
  });
});
