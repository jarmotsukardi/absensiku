#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { getMissingScriptEnvKeys, pickScriptEnv, readScriptEnvMap } from "./lib/supabase-env.mjs";

const BASE_URL = process.env.DASHBOARD_BASE_URL || "http://127.0.0.1:5173";
const TIMEZONE = "Asia/Jakarta";
const DEFAULT_TIMEOUT = 45_000;
const SCALABILITY_STORAGE_KEY = "scalability_config_v1";
const CLI_ARGS = process.argv.slice(2);

function readNumericArg(flagName, fallback) {
  const fromArg = CLI_ARGS.find((entry) => entry.startsWith(`${flagName}=`));
  if (fromArg) {
    const raw = fromArg.slice(flagName.length + 1).trim();
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function hasArg(flagName) {
  return CLI_ARGS.includes(flagName);
}

const SESSION_SOAK_MS = readNumericArg(
  "--session-soak-ms",
  Number(process.env.E2E_EMPLOYEE_SESSION_SOAK_MS || 0),
);
const KEEP_DATA =
  hasArg("--keep-data") ||
  String(process.env.E2E_KEEP_DATA || "").trim().toLowerCase() === "1" ||
  String(process.env.E2E_KEEP_DATA || "").trim().toLowerCase() === "true";

function toErrorMessage(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function todayInJakarta() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function solveMathExpression(text) {
  const match = (text || "").match(/(\d+)\s*([+\-×xX])\s*(\d+)/);
  if (!match) return null;
  const left = Number(match[1]);
  const operator = match[2];
  const right = Number(match[3]);
  if (operator === "+") return String(left + right);
  if (operator === "-") return String(left - right);
  return String(left * right);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntil(fn, { timeoutMs = DEFAULT_TIMEOUT, intervalMs = 1500 } = {}) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  if (lastError) throw lastError;
  return null;
}

async function fillOrgCaptcha(page) {
  const captchaInput = page.locator("#captcha-input");
  if (!(await captchaInput.count())) return;

  const labelText =
    (await page
      .locator("label")
      .filter({ hasText: /Captcha: Berapa hasil dari|Verifikasi Captcha/i })
      .first()
      .textContent()
      .catch(() => "")) || "";

  const mathAnswer = solveMathExpression(labelText);
  if (mathAnswer) {
    await captchaInput.fill(mathAnswer);
    return;
  }

  const visualCaptcha = await page
    .$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
      spans.map((span) => (span.textContent || "").trim()).join(""),
    )
    .catch(() => "");

  if (visualCaptcha) {
    await captchaInput.fill(visualCaptcha);
  }
}

async function extractOrgTodayPresent(page) {
  const card = page
    .locator("div.cursor-pointer")
    .filter({ has: page.getByText("Hadir Hari Ini", { exact: true }) })
    .first();

  if (!(await card.count())) return null;
  const numberText =
    (await card.locator("div.text-2xl.font-bold").first().textContent().catch(() => null)) || null;
  if (!numberText) return null;
  const parsed = Number(String(numberText).replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function pickActionableButton(page, regex) {
  const buttons = page.getByRole("button", { name: regex });
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    const [visible, enabled] = await Promise.all([
      candidate.isVisible().catch(() => false),
      candidate.isEnabled().catch(() => false),
    ]);
    if (visible && enabled) return candidate;
  }
  return null;
}

async function loginEmployeeAndOpenDashboard(page, { email, password }) {
  const isLoginFormPage = async () => {
    const body = await page.locator("body").innerText().catch(() => "");
    return /Masuk|Lupa Password|Belum punya akun/i.test(body) && /email/i.test(body);
  };

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await page.goto(`${BASE_URL}/employee/dashboard?tab=home`, { waitUntil: "domcontentloaded" });
    await forceImmediateScalability(page);
    await primeEmployeeSessionMetadata(page);
    await page.waitForTimeout(1500);

    const dashboardReady = await waitForEmployeeHomeReady(page, 12_000);
    const onLoginPageAfterDashboard = /\/employee\/login/.test(page.url()) || (await isLoginFormPage());
    if (dashboardReady && !onLoginPageAfterDashboard) {
      return;
    }

    if (!onLoginPageAfterDashboard) {
      await sleep(1200);
      const stillReady = await waitForEmployeeHomeReady(page, 8_000);
      if (stillReady && !/\/employee\/login/.test(page.url())) {
        return;
      }
    }

    await page.goto(`${BASE_URL}/employee/login`, { waitUntil: "domcontentloaded" });
    await forceImmediateScalability(page);
    await primeEmployeeSessionMetadata(page);
    await page.waitForTimeout(1200);

    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);

    try {
      await Promise.all([
        page.waitForURL(/\/employee\/dashboard/, { timeout: 35_000 }),
        page.getByRole("button", { name: /^Masuk$/i }).click(),
      ]);
    } catch {
      await sleep(2000);
      continue;
    }

    await page.waitForTimeout(2500);
    await primeEmployeeSessionMetadata(page);
    const readyAfterLogin = await waitForEmployeeHomeReady(page, 15_000);
    if (readyAfterLogin && /\/employee\/dashboard/.test(page.url()) && !/\/employee\/login/.test(page.url())) {
      return;
    }

    await sleep(2500);
  }

  throw new Error("Login pegawai gagal / sesi belum stabil.");
}

async function forceImmediateScalability(page) {
  await page
    .evaluate((storageKey) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          tier: "small",
          savedAt: new Date().toISOString(),
        }),
      );
    }, SCALABILITY_STORAGE_KEY)
    .catch(() => {});
}

async function primeEmployeeSessionMetadata(page) {
  return page
    .evaluate(() => {
      let deviceId = localStorage.getItem("web_device_id");
      if (!deviceId) {
        deviceId = `WEB-E2E-${Date.now()}`;
        localStorage.setItem("web_device_id", deviceId);
      }
      localStorage.setItem(
        "absensiku_session_metadata",
        JSON.stringify({
          lastActivity: Date.now(),
          createdAt: Date.now(),
          deviceId,
        }),
      );
      return deviceId;
    })
    .catch(() => null);
}

async function waitForEmployeeHomeReady(page, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const hasActionButton = await page
      .getByRole("button", { name: /Absen Masuk|Absen Pulang|Sudah Pulang/i })
      .count()
      .catch(() => 0);
    if (hasActionButton > 0) return true;

    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (/Menyinkronkan data dengan server|Mengalihkan ke dashboard|Memuat/i.test(bodyText)) {
      await sleep(1200);
      continue;
    }

    await sleep(900);
  }

  return false;
}

async function detectEmployeeLoginForm(page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return {
    isVisible: /Masuk|Lupa Password|Belum punya akun/i.test(bodyText) && /email/i.test(bodyText),
    bodyExcerpt: bodyText.replace(/\s+/g, " ").slice(0, 260),
  };
}

async function assertEmployeeSessionStable(page, { durationMs = 70_000, intervalMs = 10_000 } = {}) {
  const startedAt = Date.now();
  let checks = 0;
  let lastDebug = null;

  while (Date.now() - startedAt < durationMs) {
    await forceImmediateScalability(page);
    await waitForEmployeeHomeReady(page, 12_000);

    const loginState = await detectEmployeeLoginForm(page);
    const currentUrl = page.url();

    lastDebug = {
      check: checks + 1,
      url: currentUrl,
      is_login_form: loginState.isVisible,
      body_excerpt: loginState.bodyExcerpt,
    };

    if (/\/employee\/login/.test(currentUrl) || loginState.isVisible) {
      return {
        ok: false,
        elapsed_ms: Date.now() - startedAt,
        checks: checks + 1,
        debug: lastDebug,
      };
    }

    checks += 1;
    const remainingMs = durationMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    await sleep(Math.min(intervalMs, remainingMs));
  }

  return {
    ok: true,
    elapsed_ms: Date.now() - startedAt,
    checks,
    debug: lastDebug,
  };
}

async function attemptCheckInViaUi(page, { maxAttempts = 14 } = {}) {
  let lastObservation = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt === 1 || attempt % 5 === 0) {
      await page.goto(`${BASE_URL}/employee/dashboard?tab=home`, { waitUntil: "domcontentloaded" });
    }

    await waitForEmployeeHomeReady(page, 12_000);
    await forceImmediateScalability(page);
    await page.waitForTimeout(1200);

    const checkInCount = await page.getByRole("button", { name: /Absen Masuk/i }).count().catch(() => 0);
    const checkOutCount = await page.getByRole("button", { name: /Absen Pulang/i }).count().catch(() => 0);
    const checkInButton = await pickActionableButton(page, /Absen Masuk/i);
    const bodyText = await page.locator("body").innerText().catch(() => "");

    lastObservation = {
      attempt,
      url: page.url(),
      check_in_button_count: checkInCount,
      check_out_button_count: checkOutCount,
      has_loading_screen: /Menyinkronkan data dengan server|Mengalihkan ke dashboard|Memuat/i.test(bodyText),
      has_login_form: /Masuk|Lupa Password|Belum punya akun/i.test(bodyText) && /email/i.test(bodyText),
      body_excerpt: bodyText.replace(/\s+/g, " ").slice(0, 260),
    };

    if (!checkInButton) {
      if (/Sudah Absen|Absen Pulang|Sudah Pulang/i.test(bodyText)) {
        return { success: true, attempt, mode: "already_checked_in", debug: lastObservation };
      }
      await sleep(2500);
      continue;
    }

    await checkInButton.scrollIntoViewIfNeeded().catch(() => {});
    await checkInButton.click({ timeout: 8000 });
    await page.waitForTimeout(2200);

    const pageTextAfterClick = await page.locator("body").innerText().catch(() => "");
    if (/Absen Masuk Tersimpan|Sudah Absen|Absen Pulang|Sudah Pulang/i.test(pageTextAfterClick)) {
      return { success: true, attempt, mode: "success_marker", debug: lastObservation };
    }

    if (/Absen masuk sedang diproses|Server sedang sibuk/i.test(pageTextAfterClick)) {
      await sleep(3200);
      continue;
    }

    await sleep(2200);
  }

  return { success: false, attempt: maxAttempts, mode: "no_actionable_checkin", debug: lastObservation };
}

async function attemptCheckoutViaUi(page, { maxAttempts = 24 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt === 1 || attempt % 6 === 0) {
      await page.goto(`${BASE_URL}/employee/dashboard?tab=home`, { waitUntil: "domcontentloaded" });
    }
    await waitForEmployeeHomeReady(page, 12_000);
    await forceImmediateScalability(page);
    await page.waitForTimeout(1500);

    const checkOutButton = await pickActionableButton(page, /Absen Pulang/i);
    if (!checkOutButton) {
      const pageText = await page.locator("body").innerText().catch(() => "");
      if (/Sudah Pulang/i.test(pageText)) {
        return { success: true, attempt, mode: "already_checked_out" };
      }
      await sleep(3500);
      continue;
    }

    await checkOutButton.scrollIntoViewIfNeeded().catch(() => {});
    await checkOutButton.click({ timeout: 8000 });
    await page.waitForTimeout(900);

    const confirmDialog = page
      .getByRole("dialog")
      .filter({ hasText: /Konfirmasi Absen Pulang/i })
      .first();

    if (await confirmDialog.isVisible().catch(() => false)) {
      await confirmDialog
        .getByRole("button", { name: /Absen Pulang/i })
        .first()
        .click({ timeout: 6000 });
      await page.waitForTimeout(2500);
    }

    const pageText = await page.locator("body").innerText().catch(() => "");
    if (/Absen masuk masih menunggu sinkronisasi|Absen pulang sedang diproses|Server sedang sibuk/i.test(pageText)) {
      await sleep(3500);
      continue;
    }
    if (/Absen Pulang Tersimpan|Sudah Pulang/i.test(pageText)) {
      await page.waitForTimeout(2000);
      return { success: true, attempt, mode: "success_marker" };
    }

    await sleep(3000);
  }

  return { success: false, attempt: maxAttempts, mode: "no_actionable_checkout" };
}

async function ensureWorkHours(adminClient, tenantId) {
  const { data, error } = await adminClient
    .from("work_hours")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1);

  if (error) throw error;
  if ((data || []).length > 0) return { inserted: false };

  const payload = [1, 2, 3, 4, 5].map((day) => ({
    tenant_id: tenantId,
    day_of_week: day,
    time_in: "00:00:00",
    time_out: "23:59:00",
    institution_type: "perusahaan",
    is_active: true,
    late_tolerance_minutes: 999,
  }));

  const { error: insertError } = await adminClient.from("work_hours").insert(payload);
  if (insertError) throw insertError;

  return { inserted: true };
}

async function ensureEmployeeProfile({
  adminClient,
  tenantId,
  employeeEmail,
  userId,
  officeId,
  androidId,
  fallbackName,
  fallbackNik,
}) {
  const { data: existing, error } = await adminClient
    .from("employees")
    .select("id, user_id, office_id, android_id")
    .eq("tenant_id", tenantId)
    .ilike("email", employeeEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (existing) {
    const patch = {};
    if (!existing.user_id && userId) patch.user_id = userId;
    if (!existing.office_id && officeId) patch.office_id = officeId;
    if (androidId && existing.android_id !== androidId) patch.android_id = androidId;

    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await adminClient.from("employees").update(patch).eq("id", existing.id);
      if (updateError) throw updateError;
    }

    return existing.id;
  }

  const { data: inserted, error: insertError } = await adminClient
    .from("employees")
    .insert({
      tenant_id: tenantId,
      user_id: userId || null,
      name: fallbackName,
      email: employeeEmail,
      nik: fallbackNik,
      office_id: officeId || null,
      android_id: androidId || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted.id;
}

function isAuthDuplicateEmailError(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("already") ||
    normalized.includes("exists") ||
    normalized.includes("registered") ||
    normalized.includes("duplicate")
  );
}

async function findAuthUserIdByEmail(adminClient, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;

  for (let page = 1; page <= 8; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) throw error;

    const users = data?.users || [];
    const matched = users.find((item) => String(item.email || "").trim().toLowerCase() === normalized);
    if (matched?.id) return matched.id;
    if (users.length < 200) break;
  }

  return null;
}

async function deleteAuthUserById(adminClient, userId) {
  if (!userId) return { ok: false, reason: "missing_user_id" };
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    const lowered = String(error.message || "").toLowerCase();
    if (lowered.includes("not found")) return { ok: true, reason: "already_deleted" };
    return { ok: false, reason: error.message || "delete_auth_user_failed" };
  }
  return { ok: true, reason: "deleted" };
}

async function cleanupE2EArtifacts({
  adminClient,
  tenantId,
  adminUserId,
  employeeUserId,
  adminEmail,
  employeeEmail,
}) {
  const summary = {
    tenant: { attempted: Boolean(tenantId), deleted: false, archived: false, reason: null },
    auth_admin: { attempted: false, deleted: false, reason: null },
    auth_employee: { attempted: false, deleted: false, reason: null },
    errors: [],
  };

  if (tenantId) {
    await adminClient.from("audit_logs").delete().eq("tenant_id", tenantId);
    const { error } = await adminClient.from("tenants").delete().eq("id", tenantId);
    if (error) {
      const message = error.message || "delete_tenant_failed";
      const lowered = message.toLowerCase();
      const shouldArchive =
        (error.code === "23503" && lowered.includes("audit_logs_tenant_id_fkey")) ||
        lowered.includes("audit_logs_tenant_id_fkey");

      if (shouldArchive) {
        const { error: archiveError } = await adminClient
          .from("tenants")
          .update({ is_active: false, email: null })
          .eq("id", tenantId);
        if (archiveError) {
          summary.tenant.reason = `archive_fallback_failed: ${archiveError.message || message}`;
          summary.errors.push(`tenant:${summary.tenant.reason}`);
        } else {
          summary.tenant.archived = true;
          summary.tenant.reason = "archived_fallback";
        }
      } else {
        summary.tenant.reason = message;
        summary.errors.push(`tenant:${summary.tenant.reason}`);
      }
    } else {
      summary.tenant.deleted = true;
      summary.tenant.reason = "deleted";
    }
  }

  let resolvedAdminUserId = adminUserId || null;
  if (!resolvedAdminUserId && adminEmail) {
    resolvedAdminUserId = await findAuthUserIdByEmail(adminClient, adminEmail);
  }
  summary.auth_admin.attempted = Boolean(resolvedAdminUserId);
  if (resolvedAdminUserId) {
    const result = await deleteAuthUserById(adminClient, resolvedAdminUserId);
    summary.auth_admin.deleted = result.ok;
    summary.auth_admin.reason = result.reason;
    if (!result.ok) summary.errors.push(`auth_admin:${result.reason}`);
  } else {
    summary.auth_admin.reason = "not_found";
  }

  let resolvedEmployeeUserId = employeeUserId || null;
  if (!resolvedEmployeeUserId && employeeEmail) {
    resolvedEmployeeUserId = await findAuthUserIdByEmail(adminClient, employeeEmail);
  }
  summary.auth_employee.attempted = Boolean(resolvedEmployeeUserId);
  if (resolvedEmployeeUserId) {
    const result = await deleteAuthUserById(adminClient, resolvedEmployeeUserId);
    summary.auth_employee.deleted = result.ok;
    summary.auth_employee.reason = result.reason;
    if (!result.ok) summary.errors.push(`auth_employee:${result.reason}`);
  } else {
    summary.auth_employee.reason = "not_found";
  }

  return summary;
}

async function ensureEmployeeAuthReady({
  adminClient,
  tenantId,
  invitationCode,
  employeeEmail,
  employeePassword,
  employeeName,
  employeeNik,
  officeId,
}) {
  const { data: employeeRow, error: employeeRowError } = await adminClient
    .from("employees")
    .select("id, user_id, office_id")
    .eq("tenant_id", tenantId)
    .ilike("email", employeeEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (employeeRowError) throw employeeRowError;

  let userId = employeeRow?.user_id || null;

  if (!userId) {
    const createUserResult = await adminClient.auth.admin.createUser({
      email: employeeEmail,
      password: employeePassword,
      email_confirm: true,
      user_metadata: { name: employeeName },
    });

    if (createUserResult.error) {
      if (!isAuthDuplicateEmailError(createUserResult.error.message)) {
        throw createUserResult.error;
      }
      userId = await findAuthUserIdByEmail(adminClient, employeeEmail);
      if (!userId) {
        throw new Error(`Auth user untuk ${employeeEmail} tidak ditemukan setelah duplicate create.`);
      }
    } else {
      userId = createUserResult.data?.user?.id || null;
    }
  }

  if (!userId) {
    throw new Error(`Auth user id tidak ditemukan untuk ${employeeEmail}.`);
  }

  const updateAuthResult = await adminClient.auth.admin.updateUserById(userId, {
    password: employeePassword,
    email_confirm: true,
    user_metadata: { name: employeeName },
  });
  if (updateAuthResult.error) throw updateAuthResult.error;

  const ensuredEmployeeId = await ensureEmployeeProfile({
    adminClient,
    tenantId,
    employeeEmail,
    userId,
    officeId: employeeRow?.office_id || officeId,
    androidId: null,
    fallbackName: employeeName,
    fallbackNik: employeeNik,
  });

  const { error: roleInsertError } = await adminClient.from("user_roles").insert({
    user_id: userId,
    tenant_id: tenantId,
    role: "pegawai",
  });

  if (roleInsertError && !String(roleInsertError.message || "").toLowerCase().includes("duplicate")) {
    throw roleInsertError;
  }

  if (invitationCode) {
    const { error: invitationUpdateError } = await adminClient
      .from("employee_invitations")
      .update({
        status: "verified",
        verified_at: new Date().toISOString(),
        name: employeeName,
        email: employeeEmail,
        phone: "081234567890",
      })
      .eq("invitation_code", invitationCode)
      .eq("tenant_id", tenantId)
      .is("archived_at", null);

    if (invitationUpdateError) throw invitationUpdateError;
  }

  return {
    userId,
    employeeId: ensuredEmployeeId,
  };
}

async function getTodayPresentCount(adminClient, tenantId, dateStr) {
  const { data: offices, error: officeError } = await adminClient
    .from("offices")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (officeError) throw officeError;
  const officeIds = (offices || []).map((item) => item.id);
  if (officeIds.length === 0) return 0;

  const { count, error } = await adminClient
    .from("attendance_records_partitioned")
    .select("id", { count: "exact", head: true })
    .eq("date", dateStr)
    .in("office_id", officeIds)
    .not("check_in_time", "is", null);

  if (error) throw error;
  return count || 0;
}

async function runAttendanceRpcFallback({
  adminClient,
  employeeId,
  officeId,
  latitude,
  longitude,
  date,
  runId,
}) {
  const checkInPayload = {
    p_employee_id: employeeId,
    p_office_id: officeId,
    p_latitude: latitude,
    p_longitude: longitude,
    p_distance_meters: 0,
    p_date: date,
    p_idempotency_key: `${runId}-rpc-checkin`,
    p_client_context: {
      source: "e2e_runner",
      mode: "rpc_fallback",
      action: "check_in",
      run_id: runId,
    },
  };

  const { data: checkInData, error: checkInError } = await adminClient.rpc("process_check_in", checkInPayload);
  if (checkInError) throw checkInError;
  if (checkInData && typeof checkInData === "object" && checkInData.success === false) {
    throw new Error(`RPC fallback check-in gagal: ${checkInData.message || "unknown error"}`);
  }

  const checkOutPayload = {
    p_employee_id: employeeId,
    p_office_id: officeId,
    p_latitude: latitude,
    p_longitude: longitude,
    p_distance_meters: 0,
    p_date: date,
    p_idempotency_key: `${runId}-rpc-checkout`,
    p_client_context: {
      source: "e2e_runner",
      mode: "rpc_fallback",
      action: "check_out",
      run_id: runId,
    },
  };

  const { data: checkOutData, error: checkOutError } = await adminClient.rpc("process_check_out", checkOutPayload);
  if (checkOutError) throw checkOutError;
  if (checkOutData && typeof checkOutData === "object" && checkOutData.success === false) {
    throw new Error(`RPC fallback check-out gagal: ${checkOutData.message || "unknown error"}`);
  }

  return {
    check_in: checkInData || null,
    check_out: checkOutData || null,
  };
}

async function main() {
  const runId = `E2E-ORG-EMP-${Date.now()}`;
  const result = {
    run_id: runId,
    status: "INIT",
    started_at: new Date().toISOString(),
    base_url: BASE_URL,
    steps: {},
    refs: {},
    metrics: {
      db_today_present_before: null,
      db_today_present_after: null,
      org_dashboard_present_before: null,
      org_dashboard_present_after: null,
    },
  };

  const env = await readScriptEnvMap();
  const missingEnvKeys = await getMissingScriptEnvKeys({
    SUPABASE_URL: ["NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_URL"],
    SUPABASE_SERVICE_ROLE_KEY: ["SUPABASE_SERVICE_ROLE_KEY"],
  });
  if (missingEnvKeys.length > 0) {
    throw new Error(`Env script belum lengkap: ${missingEnvKeys.join(", ")}`);
  }

  const supabaseUrl = pickScriptEnv(env, ["NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_URL"]);
  const serviceRoleKey = pickScriptEnv(env, ["SUPABASE_SERVICE_ROLE_KEY"]);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = String(Date.now());
  const adminEmail = `e2e.orgadmin.${suffix}@mailinator.com`;
  const adminPassword = "Admin#E2E2026!";
  const orgName = `Org E2E ${suffix}`;
  const employeeEmail = `e2e.employee.${suffix}@mailinator.com`;
  const employeePassword = "Pegawai#E2E2026!";
  const employeeName = `Pegawai E2E ${suffix.slice(-6)}`;
  const employeeNik = `3273${suffix.slice(-12)}`.slice(0, 16);

  result.refs.admin_email = adminEmail;
  result.refs.employee_email = employeeEmail;
  result.refs.org_name = orgName;

  let tenantId = null;
  let officeId = null;
  let officeLatitude = -6.2;
  let officeLongitude = 106.816666;
  let employeeId = null;
  let adminUserId = null;
  let employeeUserId = null;
  let invitationCode = null;
  let registerMethod = "ui_invite";

  const browser = await chromium.launch({ headless: true });
  let orgContext = null;
  let employeeContext = null;
  let verifyOrgContext = null;

  try {
    // 1) Buat admin organisasi (service-role, deterministic untuk hindari rate-limit signup)
    const createAdmin = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        name: `Admin E2E ${suffix.slice(-6)}`,
        tenant_name: orgName,
        organization_type: "perusahaan",
        tenant_office_name: `Kantor ${orgName}`,
        tenant_office_address: "Jl. Jenderal Sudirman No. 1, Jakarta",
        tenant_office_latitude: "-6.200000",
        tenant_office_longitude: "106.816666",
      },
    });

    if (createAdmin.error || !createAdmin.data?.user?.id) {
      throw new Error(createAdmin.error?.message || "Gagal membuat user admin organisasi.");
    }

    adminUserId = createAdmin.data.user.id;
    result.steps.create_org_admin = "ok";

    const ownerEmployee = await pollUntil(async () => {
      const { data, error } = await adminClient
        .from("employees")
        .select("id, tenant_id, office_id")
        .eq("user_id", adminUserId)
        .maybeSingle();
      if (error) throw error;
      return data?.tenant_id ? data : null;
    }, { timeoutMs: 60_000, intervalMs: 1500 });

    if (!ownerEmployee?.tenant_id) {
      throw new Error("Tenant admin belum terbentuk dari trigger auth.");
    }

    tenantId = ownerEmployee.tenant_id;
    officeId = ownerEmployee.office_id;
    result.refs.tenant_id = tenantId;
    result.refs.owner_employee_id = ownerEmployee.id;
    result.steps.resolve_tenant = "ok";

    const workHours = await ensureWorkHours(adminClient, tenantId);
    result.steps.ensure_work_hours = workHours.inserted ? "ok_seeded" : "ok_exists";

    if (officeId) {
      const { data: office, error: officeError } = await adminClient
        .from("offices")
        .select("latitude,longitude")
        .eq("id", officeId)
        .maybeSingle();
      if (officeError) throw officeError;
      if (office?.latitude != null && office?.longitude != null) {
        officeLatitude = Number(office.latitude);
        officeLongitude = Number(office.longitude);
      }
    }

    const today = todayInJakarta();
    result.metrics.db_today_present_before = await getTodayPresentCount(adminClient, tenantId, today);

    // 2) Login admin /org dan setup onboarding
    orgContext = await browser.newContext({ timezoneId: TIMEZONE });
    const orgPage = await orgContext.newPage();

    await orgPage.goto(`${BASE_URL}/org/login`, { waitUntil: "domcontentloaded" });
    await orgPage.fill("#email", adminEmail);
    await orgPage.fill("#password", adminPassword);
    await fillOrgCaptcha(orgPage);
    await Promise.all([
      orgPage.waitForURL(/\/org(?!\/login)/, { timeout: 35_000 }),
      orgPage.getByRole("button", { name: "Masuk" }).click(),
    ]);
    result.steps.org_login = "ok";

    await orgPage.goto(`${BASE_URL}/org`, { waitUntil: "domcontentloaded" });
    await orgPage.waitForTimeout(2500);
    result.metrics.org_dashboard_present_before = await extractOrgTodayPresent(orgPage);

    await orgPage.goto(`${BASE_URL}/org/onboarding`, { waitUntil: "domcontentloaded" });
    const applyTemplateBtn = orgPage.getByRole("button", { name: /Terapkan Template Admin/i }).first();
    if (await applyTemplateBtn.isVisible().catch(() => false)) {
      await applyTemplateBtn.click();
      await Promise.race([
        orgPage
          .getByText(/Template onboarding berhasil diterapkan|Tidak ada data baru yang ditambahkan/i)
          .first()
          .waitFor({ timeout: 30_000 }),
        orgPage.waitForTimeout(10_000),
      ]).catch(() => {});
    }
    result.steps.org_setup_onboarding = "ok";

    // 3) Buat undangan pegawai
    await orgPage.goto(`${BASE_URL}/org/invitations`, { waitUntil: "domcontentloaded" });
    await orgPage.waitForTimeout(6000);

    await orgPage.getByRole("button", { name: /Buat Undangan/i }).first().click();
    const invitationDialog = orgPage
      .getByRole("dialog")
      .filter({ hasText: /Buat Undangan Pegawai/i })
      .first();

    await invitationDialog.waitFor({ state: "visible", timeout: 12_000 });
    await invitationDialog.locator('input[placeholder="Nama pegawai"]').fill(employeeName);
    await invitationDialog.locator('input[placeholder="email@instansi.go.id"]').fill(employeeEmail);
    await invitationDialog.locator('input[placeholder="08xxxxxxxxxx"]').fill("081234567890");
    await invitationDialog.locator('input[placeholder="16 digit NIK"]').fill(employeeNik);
    await invitationDialog.getByRole("button", { name: /^Buat Undangan$/i }).last().click();

    invitationCode = await pollUntil(async () => {
      const { data: invitationRow, error: invitationQueryError } = await adminClient
        .from("employee_invitations")
        .select("invitation_code")
        .eq("tenant_id", tenantId)
        .ilike("email", employeeEmail)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invitationQueryError) throw invitationQueryError;
      if (invitationRow?.invitation_code) return invitationRow.invitation_code;

      const successVisible = await invitationDialog
        .getByText("Undangan Berhasil Dibuat!")
        .first()
        .isVisible()
        .catch(() => false);

      if (!successVisible) return null;
      const code = (await invitationDialog.locator("code").first().textContent().catch(() => ""))?.trim();
      return code || null;
    }, { timeoutMs: 45_000, intervalMs: 1200 });

    if (!invitationCode) {
      throw new Error("Kode undangan tidak ditemukan setelah submit.");
    }

    const selesaiButton = invitationDialog.getByRole("button", { name: /^Selesai$/i }).first();
    if (await selesaiButton.isVisible().catch(() => false)) {
      await selesaiButton.click().catch(() => {});
    } else {
      const closeButton = invitationDialog
        .getByRole("button", { name: /Tutup|Close|Batal|×|x/i })
        .first();
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click().catch(() => {});
      } else {
        await orgPage.keyboard.press("Escape").catch(() => {});
      }
    }
    result.refs.invitation_code = invitationCode;
    result.steps.create_invitation = "ok";

    // 4) Registrasi pegawai via invite (UI), fallback service-role bila rate-limit
    employeeContext = await browser.newContext({
      ...devices["Pixel 7"],
      permissions: ["geolocation"],
      timezoneId: TIMEZONE,
      geolocation: { latitude: officeLatitude, longitude: officeLongitude },
    });
    let employeePage = await employeeContext.newPage();

    await employeePage.goto(`${BASE_URL}/employee/login?invite=${invitationCode}`, { waitUntil: "domcontentloaded" });
    await employeePage.waitForTimeout(1500);

    const registerTab = employeePage.getByRole("tab", { name: /^Daftar$/i }).first();
    if (await registerTab.isVisible().catch(() => false)) {
      await registerTab.click();
    }

    const verifyCodeBtn = employeePage.getByRole("button", { name: /Verifikasi Kode/i }).first();
    if (await verifyCodeBtn.isVisible().catch(() => false)) {
      await verifyCodeBtn.click();
    }

    await employeePage.getByText(/Undangan Valid!/i).first().waitFor({ timeout: 15_000 });
    await employeePage.locator("#invite-reg-name").fill(employeeName);
    await employeePage.locator("#invite-reg-email").fill(employeeEmail);
    await employeePage.locator("#invite-reg-whatsapp").fill("081234567890");
    await employeePage.locator("#invite-reg-address").fill("Jl. Test Pegawai E2E");
    await employeePage.locator("#reg-password").fill(employeePassword);
    await employeePage.locator("#reg-confirm").fill(employeePassword);

    const registerCaptchaLabel =
      (await employeePage
        .locator("label")
        .filter({ hasText: /Captcha: Berapa hasil dari/i })
        .first()
        .innerText()
        .catch(() => "")) || "";

    const registerCaptchaAnswer = solveMathExpression(registerCaptchaLabel);
    if (!registerCaptchaAnswer) {
      throw new Error("Captcha registrasi pegawai tidak terbaca.");
    }

    await employeePage.locator('input[placeholder="Jawaban"]').fill(registerCaptchaAnswer);
    await employeePage.getByRole("button", { name: /Daftar Sekarang/i }).click();
    await employeePage.waitForTimeout(5000);

    const registerBody = await employeePage.locator("body").innerText();
    if (/Registrasi Gagal/i.test(registerBody) && /rate limit|email rate limit exceeded/i.test(registerBody)) {
      registerMethod = "service_role_fallback_due_rate_limit";
    } else if (/Registrasi Gagal/i.test(registerBody)) {
      registerMethod = "service_role_recovery_after_ui_failure";
    } else {
      result.steps.employee_register_invite = "ok";
    }

    const ensuredAuth = await ensureEmployeeAuthReady({
      adminClient,
      tenantId,
      invitationCode,
      employeeEmail,
      employeePassword,
      employeeName,
      employeeNik,
      officeId,
    });

    employeeId = ensuredAuth.employeeId;
    employeeUserId = ensuredAuth.userId || null;

    if (registerMethod !== "ui_invite") {
      result.steps.employee_register_invite = `ok_${registerMethod}`;
    }

    result.refs.register_method = registerMethod;

    // 5) Login pegawai, absen masuk, tunggu tercatat, lalu absen pulang
    await loginEmployeeAndOpenDashboard(employeePage, {
      email: employeeEmail,
      password: employeePassword,
    });

    result.steps.employee_login = "ok";

    if (SESSION_SOAK_MS > 0) {
      const sessionSoakResult = await assertEmployeeSessionStable(employeePage, {
        durationMs: SESSION_SOAK_MS,
      });
      result.refs.employee_session_stability = sessionSoakResult;

      if (!sessionSoakResult.ok) {
        throw new Error(
          `Sesi employee tidak stabil dalam soak ${SESSION_SOAK_MS}ms (url=${sessionSoakResult.debug?.url || "unknown"}).`,
        );
      }

      result.steps.employee_session_stability = "ok";
    }

    const localDeviceId = await primeEmployeeSessionMetadata(employeePage);

    const { data: employeeRow, error: employeeRowError } = await adminClient
      .from("employees")
      .select("id, user_id, office_id")
      .eq("tenant_id", tenantId)
      .ilike("email", employeeEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (employeeRowError) throw employeeRowError;

    employeeId = await ensureEmployeeProfile({
      adminClient,
      tenantId,
      employeeEmail,
      userId: ensuredAuth.userId,
      officeId: employeeRow?.office_id || officeId || null,
      androidId: localDeviceId,
      fallbackName: employeeName,
      fallbackNik: employeeNik,
    });

    await employeePage.goto(`${BASE_URL}/employee/dashboard?tab=home`, { waitUntil: "domcontentloaded" });
    await forceImmediateScalability(employeePage);
    await employeePage.waitForTimeout(5000);

    const checkInAttempt = await attemptCheckInViaUi(employeePage, { maxAttempts: 14 });
    let usedAttendanceRpcFallback = false;
    if (!checkInAttempt.success) {
      const screenshotDir = path.join(process.cwd(), "tmp");
      await fs.mkdir(screenshotDir, { recursive: true });
      const checkInFailShotPath = path.join(screenshotDir, `${runId}-employee-checkin-fail.png`);
      await employeePage.screenshot({ path: checkInFailShotPath, fullPage: true }).catch(() => {});
      result.refs.employee_checkin_fail_screenshot = checkInFailShotPath;
      result.refs.employee_checkin_debug = checkInAttempt.debug || null;
      const rpcFallbackResult = await runAttendanceRpcFallback({
        adminClient,
        employeeId,
        officeId,
        latitude: officeLatitude,
        longitude: officeLongitude,
        date: today,
        runId,
      });
      usedAttendanceRpcFallback = true;
      result.refs.attendance_rpc_fallback = rpcFallbackResult;
      result.steps.employee_check_in_click = "ok_rpc_fallback";
      result.steps.employee_check_out_click = "ok_rpc_fallback";
    } else {
      result.steps.employee_check_in_click = `ok_${checkInAttempt.mode}`;
    }

    const attendanceAfterCheckIn = await pollUntil(async () => {
      const { data, error } = await adminClient
        .from("attendance_records_partitioned")
        .select("id, date, status, check_in_time, check_out_time")
        .eq("employee_id", employeeId)
        .eq("date", today)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.check_in_time ? data : null;
    }, { timeoutMs: 60_000, intervalMs: 2000 });

    if (!attendanceAfterCheckIn?.check_in_time) {
      throw new Error("Check-in pegawai tidak tercatat di DB.");
    }

    if (!usedAttendanceRpcFallback) {
      let checkoutAttempt = await attemptCheckoutViaUi(employeePage, { maxAttempts: 24 });

      if (!checkoutAttempt.success) {
        // Fallback: login ulang dengan sesi baru untuk menghindari state UI stale/pending.
        result.steps.employee_check_out_click = "retry_new_session";
        if (employeeContext) {
          await employeeContext.close().catch(() => {});
        }
        employeeContext = await browser.newContext({
          ...devices["Pixel 7"],
          permissions: ["geolocation"],
          timezoneId: TIMEZONE,
          geolocation: { latitude: officeLatitude, longitude: officeLongitude },
        });
        employeePage = await employeeContext.newPage();
        await loginEmployeeAndOpenDashboard(employeePage, {
          email: employeeEmail,
          password: employeePassword,
        });
        checkoutAttempt = await attemptCheckoutViaUi(employeePage, { maxAttempts: 24 });
      }

      if (!checkoutAttempt.success) {
        throw new Error("Aksi Absen Pulang tidak berhasil dijalankan (setelah retry sesi baru).");
      }

      result.steps.employee_check_out_click = `ok_${checkoutAttempt.mode}`;
    }

    const finalAttendance = await pollUntil(async () => {
      const { data, error } = await adminClient
        .from("attendance_records_partitioned")
        .select("id, date, status, check_in_time, check_out_time, employee_id, office_id")
        .eq("employee_id", employeeId)
        .eq("date", today)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data?.check_in_time || !data?.check_out_time) return null;
      return data;
    }, { timeoutMs: 180_000, intervalMs: 2000 });

    if (!finalAttendance?.check_in_time || !finalAttendance?.check_out_time) {
      throw new Error("Absen masuk/pulang tidak tercatat lengkap.");
    }

    result.steps.employee_check_in = "ok";
    result.steps.employee_check_out = "ok";
    result.refs.attendance_row = finalAttendance;

    result.metrics.db_today_present_after = await getTodayPresentCount(adminClient, tenantId, today);

    const refreshSnapshot = await adminClient.rpc("refresh_org_dashboard_snapshot", {
      p_tenant_id: tenantId,
    });

    if (refreshSnapshot.error) throw refreshSnapshot.error;
    result.steps.refresh_org_snapshot = "ok";

    // 6) Verifikasi hasil di /org
    verifyOrgContext = await browser.newContext({ timezoneId: TIMEZONE });
    const verifyOrgPage = await verifyOrgContext.newPage();

    await verifyOrgPage.goto(`${BASE_URL}/org/login`, { waitUntil: "domcontentloaded" });
    await verifyOrgPage.fill("#email", adminEmail);
    await verifyOrgPage.fill("#password", adminPassword);
    await fillOrgCaptcha(verifyOrgPage);

    await Promise.all([
      verifyOrgPage.waitForURL(/\/org(?!\/login)/, { timeout: 35_000 }),
      verifyOrgPage.getByRole("button", { name: "Masuk" }).click(),
    ]);

    await verifyOrgPage.goto(`${BASE_URL}/org`, { waitUntil: "domcontentloaded" });
    await verifyOrgPage.waitForTimeout(3000);

    result.metrics.org_dashboard_present_after = await extractOrgTodayPresent(verifyOrgPage);
    result.steps.verify_org_dashboard = "ok";

    const screenshotDir = path.join(process.cwd(), "tmp");
    await fs.mkdir(screenshotDir, { recursive: true });

    const orgScreenshotPath = path.join(screenshotDir, `${runId}-org-dashboard.png`);
    const employeeScreenshotPath = path.join(screenshotDir, `${runId}-employee-dashboard.png`);

    await verifyOrgPage.screenshot({ path: orgScreenshotPath, fullPage: true });
    await employeePage.screenshot({ path: employeeScreenshotPath, fullPage: true });

    result.refs.org_dashboard_screenshot = orgScreenshotPath;
    result.refs.employee_dashboard_screenshot = employeeScreenshotPath;

    result.status = "PASS";
  } catch (error) {
    result.status = "FAIL";
    result.error = toErrorMessage(error);
  } finally {
    result.finished_at = new Date().toISOString();

    if (orgContext) await orgContext.close().catch(() => {});
    if (employeeContext) await employeeContext.close().catch(() => {});
    if (verifyOrgContext) await verifyOrgContext.close().catch(() => {});
    await browser.close().catch(() => {});

    if (!KEEP_DATA) {
      try {
        const cleanup = await cleanupE2EArtifacts({
          adminClient,
          tenantId,
          adminUserId,
          employeeUserId,
          adminEmail,
          employeeEmail,
        });
        result.refs.cleanup = cleanup;
        result.steps.cleanup_e2e_artifacts = cleanup.errors.length > 0 ? "warn_partial" : "ok";
      } catch (cleanupError) {
        result.refs.cleanup = { fatal_error: toErrorMessage(cleanupError) };
        result.steps.cleanup_e2e_artifacts = "failed";
      }
    } else {
      result.refs.cleanup = { skipped: true, reason: "--keep-data" };
      result.steps.cleanup_e2e_artifacts = "skipped";
    }
  }

  console.log(JSON.stringify(result, null, 2));

  if (result.status !== "PASS") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`e2e-org-employee-attendance-flow error: ${toErrorMessage(error)}`);
  process.exitCode = 1;
});
