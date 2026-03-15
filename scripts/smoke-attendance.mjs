#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { readTestAccounts } from "./lib/test-accounts.mjs";

const BASE_URL = process.env.DASHBOARD_BASE_URL || "http://127.0.0.1:5173";
const RECORD_FILE = path.join(process.cwd(), "ops", "test-runs.local.jsonl");
const TIMEZONE = "Asia/Jakarta";
const CLI_ARGS = process.argv.slice(2);

function readStringArg(flagName, fallback) {
  const fromArg = CLI_ARGS.find((entry) => entry.startsWith(`${flagName}=`));
  if (fromArg) {
    const raw = fromArg.slice(flagName.length + 1).trim();
    if (raw) return raw;
  }
  return fallback;
}

function formatDateInTz(date, timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getJakartaNowMeta() {
  const now = new Date();
  const dateStr = formatDateInTz(now);
  const [year, month, day] = dateStr.split("-").map((v) => parseInt(v, 10));
  return { now, dateStr, year, month, day };
}

function parseEnv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    env[key] = value;
  }
  return env;
}

async function readEnvLocal() {
  const envFile = path.join(process.cwd(), ".env.local");
  const raw = await fs.readFile(envFile, "utf8");
  return parseEnv(raw);
}

async function appendRecord(record) {
  await fs.mkdir(path.dirname(RECORD_FILE), { recursive: true });
  await fs.appendFile(RECORD_FILE, `${JSON.stringify(record)}\n`, "utf8");
}

async function deleteRecordedRun() {
  try {
    await fs.writeFile(RECORD_FILE, "", "utf8");
    return true;
  } catch {
    return false;
  }
}

async function apiGet(url, token, anonKey) {
  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const bodyText = await res.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }
  return { ok: res.ok, status: res.status, body };
}

function safeArray(input) {
  return Array.isArray(input) ? input : [];
}

function parseWorkHolidayDates(input) {
  if (typeof input !== "string" || !input.trim()) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim().padStart(2, "0"));
  } catch {
    // fallback below
  }
  return input
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.padStart(2, "0"));
}

async function readSessionToken(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!key) return { ok: false, reason: "no_auth_key" };
    const raw = localStorage.getItem(key);
    if (!raw) return { ok: false, reason: "no_auth_payload" };

    try {
      const parsed = JSON.parse(raw);
      const token = parsed?.access_token;
      if (!token) return { ok: false, reason: "no_access_token" };
      return { ok: true, token };
    } catch {
      return { ok: false, reason: "invalid_auth_payload" };
    }
  });
}

async function waitForAttendanceReady(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText || "";
      return (
        text.includes("Absen Masuk") ||
        text.includes("Sudah Absen") ||
        text.includes("Absen Pulang") ||
        text.includes("Sudah Pulang") ||
        text.includes("Tidak Dapat Absen")
      );
    },
    { timeout: timeoutMs }
  );
}

async function resolveTenantId(supabaseUrl, anonKey, token, employeeId) {
  const qs = new URLSearchParams({
    select: "tenant_id",
    id: `eq.${employeeId}`,
    limit: "1",
  });
  const resp = await apiGet(`${supabaseUrl}/rest/v1/employees?${qs.toString()}`, token, anonKey);
  if (!resp.ok) return { ok: false, reason: `employees_${resp.status}` };
  const row = safeArray(resp.body)[0];
  if (!row?.tenant_id) return { ok: false, reason: "tenant_not_found" };
  return { ok: true, tenantId: row.tenant_id };
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function resolveOfficeGeolocation(supabaseUrl, anonKey, token, employeeId) {
  const empQs = new URLSearchParams({
    select: "office_id",
    id: `eq.${employeeId}`,
    limit: "1",
  });
  const empRes = await apiGet(`${supabaseUrl}/rest/v1/employees?${empQs.toString()}`, token, anonKey);
  if (!empRes.ok) return { ok: false, reason: `employees_${empRes.status}` };
  const officeId = safeArray(empRes.body)[0]?.office_id;
  if (!officeId) return { ok: false, reason: "office_not_found" };

  const officeQs = new URLSearchParams({
    select: "latitude,longitude",
    id: `eq.${officeId}`,
    limit: "1",
  });
  const officeRes = await apiGet(`${supabaseUrl}/rest/v1/offices?${officeQs.toString()}`, token, anonKey);
  if (!officeRes.ok) return { ok: false, reason: `offices_${officeRes.status}` };

  const office = safeArray(officeRes.body)[0] || {};
  const latitude = toFiniteNumber(office.latitude);
  const longitude = toFiniteNumber(office.longitude);
  if (latitude === null || longitude === null) return { ok: false, reason: "office_coordinates_invalid" };
  return { ok: true, latitude, longitude };
}

async function checkHolidayForDate({ supabaseUrl, anonKey, token, tenantId, dateStr, year, month, day }) {
  const nationalQs = new URLSearchParams({
    select: "name,date",
    date: `eq.${dateStr}`,
    is_active: "eq.true",
    limit: "1",
  });
  const nationalRes = await apiGet(`${supabaseUrl}/rest/v1/national_holidays?${nationalQs.toString()}`, token, anonKey);
  if (nationalRes.ok && safeArray(nationalRes.body).length > 0) {
    const row = nationalRes.body[0];
    return { isHoliday: true, type: "national", name: row?.name || "Libur Nasional", date: row?.date || dateStr };
  }

  const workQs = new URLSearchParams({
    select: "dates,description",
    tenant_id: `eq.${tenantId}`,
    year: `eq.${year}`,
    month: `eq.${month}`,
    limit: "100",
  });
  const workRes = await apiGet(`${supabaseUrl}/rest/v1/work_holidays?${workQs.toString()}`, token, anonKey);
  if (workRes.ok) {
    for (const row of safeArray(workRes.body)) {
      const dates = parseWorkHolidayDates(row?.dates);
      if (dates.includes(String(day).padStart(2, "0"))) {
        return {
          isHoliday: true,
          type: "work_holiday",
          name: row?.description || "Hari Libur Kerja",
          date: dateStr,
        };
      }
    }
  }

  const legacyQs = new URLSearchParams({
    select: "name,date,tenant_id",
    date: `eq.${dateStr}`,
    or: `(tenant_id.eq.${tenantId},tenant_id.is.null)`,
    limit: "1",
  });
  const legacyRes = await apiGet(`${supabaseUrl}/rest/v1/holidays?${legacyQs.toString()}`, token, anonKey);
  if (legacyRes.ok && safeArray(legacyRes.body).length > 0) {
    const row = legacyRes.body[0];
    return { isHoliday: true, type: "legacy", name: row?.name || "Hari Libur", date: row?.date || dateStr };
  }

  return { isHoliday: false };
}

async function findNextWorkingDate({ supabaseUrl, anonKey, token, tenantId, startAt }) {
  const cursor = new Date(startAt.getTime());
  for (let i = 0; i < 30; i += 1) {
    cursor.setDate(cursor.getDate() + 1);
    const dateStr = formatDateInTz(cursor);
    const [year, month, day] = dateStr.split("-").map((v) => parseInt(v, 10));
    const weekday = new Date(`${dateStr}T00:00:00+07:00`).getDay();
    if (weekday === 0 || weekday === 6) continue;
    const holiday = await checkHolidayForDate({
      supabaseUrl,
      anonKey,
      token,
      tenantId,
      dateStr,
      year,
      month,
      day,
    });
    if (!holiday.isHoliday) return dateStr;
  }
  return null;
}

async function queryTodayAttendance({ supabaseUrl, anonKey, token, employeeId, dateStr }) {
  const qs = new URLSearchParams({
    select: "id,date,status,check_in_time,check_out_time,check_in_distance_meters,check_out_distance_meters",
    employee_id: `eq.${employeeId}`,
    date: `eq.${dateStr}`,
    order: "created_at.desc",
    limit: "1",
  });
  const res = await apiGet(`${supabaseUrl}/rest/v1/attendance_records_partitioned?${qs.toString()}`, token, anonKey);
  if (!res.ok) return { ok: false, reason: `attendance_${res.status}` };
  return { ok: true, row: safeArray(res.body)[0] || null };
}

async function detectAttendanceUiState(page) {
  const alreadyCheckedIn = await page
    .getByRole("button", { name: /Sudah Absen/i })
    .first()
    .isVisible()
    .catch(() => false);
  const checkInToast = await page
    .getByText(/Absen Masuk Tersimpan|Absen masuk tersimpan/i)
    .first()
    .isVisible()
    .catch(() => false);
  const failedCheckInToast = await page
    .getByText(/Gagal Absen Masuk|Tidak Dapat Absen|Gagal Mendapatkan Lokasi|Tidak Bisa Absen/i)
    .first()
    .isVisible()
    .catch(() => false);
  return {
    alreadyCheckedIn,
    checkInToast,
    failedCheckInToast,
  };
}

async function detectBillingLock(page) {
  const lockTitle = await page.getByText(/Akses Terkunci/i).first().isVisible().catch(() => false);
  if (!lockTitle) return false;
  const paymentHint = await page.getByText(/Lakukan Pembayaran|Status Pembayaran|Belum Dibayar/i).first().isVisible().catch(() => false);
  return paymentHint;
}

async function pickActionableButton(page, nameRegex) {
  const buttons = page.getByRole("button", { name: nameRegex });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = buttons.nth(i);
    const [visible, enabled] = await Promise.all([
      candidate.isVisible().catch(() => false),
      candidate.isEnabled().catch(() => false),
    ]);
    if (visible && enabled) {
      return { found: true, button: candidate, count, index: i };
    }
  }
  return { found: false, button: null, count, index: -1 };
}

async function waitForCheckInState({
  page,
  supabaseUrl,
  anonKey,
  token,
  employeeId,
  dateStr,
  timeoutMs = 30000,
}) {
  const started = Date.now();
  let lastAttendance = { ok: false, row: null };
  let lastUiState = { alreadyCheckedIn: false, checkInToast: false, failedCheckInToast: false };
  while (Date.now() - started < timeoutMs) {
    const [attendance, uiState] = await Promise.all([
      queryTodayAttendance({ supabaseUrl, anonKey, token, employeeId, dateStr }),
      detectAttendanceUiState(page),
    ]);
    lastAttendance = attendance;
    lastUiState = uiState;
    const hasServerCheckIn = Boolean(attendance.ok && attendance.row?.check_in_time);
    const hasLocalCheckIn = uiState.alreadyCheckedIn || uiState.checkInToast;
    if (hasServerCheckIn || hasLocalCheckIn) {
      return { attendance, uiState };
    }
    await page.waitForTimeout(2000);
  }
  return { attendance: lastAttendance, uiState: lastUiState };
}

async function verifyCheckInPersistsAfterReload({
  page,
  supabaseUrl,
  anonKey,
  token,
  employeeId,
  dateStr,
  timeoutMs = 20000,
}) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAttendanceReady(page, 10000).catch(() => {});

  const started = Date.now();
  let lastAttendance = { ok: false, row: null };
  let lastUiState = { alreadyCheckedIn: false, checkInToast: false, failedCheckInToast: false };

  while (Date.now() - started < timeoutMs) {
    const [attendance, uiState] = await Promise.all([
      queryTodayAttendance({ supabaseUrl, anonKey, token, employeeId, dateStr }),
      detectAttendanceUiState(page),
    ]);
    lastAttendance = attendance;
    lastUiState = uiState;

    const persistedInUi = uiState.alreadyCheckedIn;
    const persistedOnServer = Boolean(attendance.ok && attendance.row?.check_in_time);
    if (persistedInUi || persistedOnServer) {
      return {
        attempted: true,
        passed: true,
        attendance,
        uiState,
      };
    }

    await page.waitForTimeout(1500);
  }

  return {
    attempted: true,
    passed: false,
    attendance: lastAttendance,
    uiState: lastUiState,
  };
}

async function main() {
  const runId = `ATT-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const accounts = await readTestAccounts();
  const env = await readEnvLocal();
  const accountKey = readStringArg("--account", process.env.TEST_ACCOUNT_KEY || "employee");
  const selectedAccount = accounts?.[accountKey];
  const email = selectedAccount?.email;
  const password = selectedAccount?.password;
  const employeeId = selectedAccount?.employee_id;
  const androidId = selectedAccount?.android_id || "";
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY belum tersedia di .env.local");
  }
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password.trim()) {
    throw new Error(`Kredensial akun '${accountKey}' belum valid di ops/test-accounts.local.json`);
  }
  if (!employeeId) {
    throw new Error(`employee_id untuk akun '${accountKey}' wajib terisi di ops/test-accounts.local.json`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ permissions: ["geolocation"], timezoneId: TIMEZONE });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || "unknown",
    });
  });

  let record;
  try {
    await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });
    await page.fill("#login-email", email);
    await page.fill("#login-password", password);

    const captchaText = await page.$$eval("div.font-mono.text-xl.tracking-widest span", (spans) =>
      spans.map((s) => (s.textContent || "").trim()).join("")
    );
    if (!captchaText || captchaText.length < 6) {
      throw new Error("Captcha tidak terbaca dari halaman login.");
    }
    await page.fill("#captcha-input", captchaText);
    await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 20000 }),
      page.getByRole("button", { name: "Masuk" }).click(),
    ]);

    const sessionDeviceId = androidId && androidId.trim() ? androidId.trim() : `WEB-SMOKE-${Date.now()}`;
    await page.evaluate(({ now, deviceId }) => {
      localStorage.setItem("web_device_id", deviceId);
      localStorage.setItem(
        "absensiku_session_metadata",
        JSON.stringify({
          lastActivity: now,
          createdAt: now,
          deviceId,
        })
      );
    }, { now: Date.now(), deviceId: sessionDeviceId });

    await page.goto(`${BASE_URL}/employee/dashboard?tab=home`, { waitUntil: "domcontentloaded" });
    await waitForAttendanceReady(page, 15000);

    const session = await readSessionToken(page);
    if (!session.ok) {
      throw new Error(`Gagal membaca session token: ${session.reason}`);
    }
    const token = session.token;
    const tenant = await resolveTenantId(supabaseUrl, anonKey, token, employeeId);
    if (!tenant.ok) {
      throw new Error(`Gagal membaca tenant pegawai: ${tenant.reason}`);
    }

    const nowMeta = getJakartaNowMeta();
    const weekday = new Date(`${nowMeta.dateStr}T00:00:00+07:00`).getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const holiday = await checkHolidayForDate({
      supabaseUrl,
      anonKey,
      token,
      tenantId: tenant.tenantId,
      dateStr: nowMeta.dateStr,
      year: nowMeta.year,
      month: nowMeta.month,
      day: nowMeta.day,
    });

    if (isWeekend || holiday.isHoliday) {
      const nextWorkingDate = await findNextWorkingDate({
        supabaseUrl,
        anonKey,
        token,
        tenantId: tenant.tenantId,
        startAt: nowMeta.now,
      });

      record = {
        run_id: runId,
        suite: "attendance_e2e",
        status: "SKIPPED_NON_WORKING_DAY",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        base_url: BASE_URL,
        actor: { role: "employee", account_key: accountKey, email, employee_id: employeeId, tenant_id: tenant.tenantId },
        test_date: nowMeta.dateStr,
        reason: isWeekend ? "weekend" : "holiday",
        holiday: holiday.isHoliday ? holiday : null,
        next_recommended_working_date: nextWorkingDate,
        refs: {
          app_error_ids: [],
          critical_failed_requests: [],
        },
      };

      await appendRecord(record);
      const deleted = await deleteRecordedRun();
      record.record_cleanup = deleted ? "DELETED_MANDATORY" : "DELETE_FAILED";
      console.log(JSON.stringify(record, null, 2));
      if (!deleted) {
        console.error("cleanup_error_ref: ATT-CLEANUP-FAILED");
        process.exitCode = 1;
      }
      return;
    }

    // Resolve geolocation near employee office to avoid out-of-radius false negatives.
    const prevAttendance = await queryTodayAttendance({
      supabaseUrl,
      anonKey,
      token,
      employeeId,
      dateStr: nowMeta.dateStr,
    });

    const officeGeo = await resolveOfficeGeolocation(supabaseUrl, anonKey, token, employeeId);
    const fallbackGeo = { latitude: -6.2, longitude: 106.816666 };
    const targetGeo = officeGeo.ok
      ? { latitude: officeGeo.latitude, longitude: officeGeo.longitude }
      : fallbackGeo;
    await context.setGeolocation(targetGeo);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAttendanceReady(page, 10000);

    const actions = {
      check_in_clicked: false,
      check_in_success: false,
      check_out_clicked: false,
      check_out_success: false,
      skipped_because_already_complete: false,
    };

    const billingLockedOnLoad = await detectBillingLock(page);
    if (billingLockedOnLoad) {
      record = {
        run_id: runId,
        suite: "attendance_e2e",
        status: "SKIPPED_BILLING_LOCKED",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        base_url: BASE_URL,
        actor: { role: "employee", account_key: accountKey, email, employee_id: employeeId, tenant_id: tenant.tenantId },
        test_date: nowMeta.dateStr,
        reason: "billing_locked",
        refs: {
          app_error_ids: [],
          critical_failed_requests: [],
        },
      };
      await appendRecord(record);
      const deleted = await deleteRecordedRun();
      record.record_cleanup = deleted ? "DELETED_MANDATORY" : "DELETE_FAILED";
      console.log(JSON.stringify(record, null, 2));
      if (!deleted) {
        console.error("cleanup_error_ref: ATT-CLEANUP-FAILED");
        process.exitCode = 1;
      }
      return;
    }

    const checkInButtonPick = await pickActionableButton(page, /Absen Masuk/i);
    const checkOutButtonPick = await pickActionableButton(page, /^Absen Pulang$/i);
    const checkInBtn = checkInButtonPick.button;
    const checkOutBtn = checkOutButtonPick.button;
    const canCheckIn = checkInButtonPick.found && Boolean(checkInBtn);
    const canCheckOut = checkOutButtonPick.found && Boolean(checkOutBtn);
    const checkInExists = Boolean(prevAttendance.ok && prevAttendance.row?.check_in_time);
    const checkOutExists = Boolean(prevAttendance.ok && prevAttendance.row?.check_out_time);

    if (!canCheckIn && !canCheckOut && checkInExists && checkOutExists) {
      actions.skipped_because_already_complete = true;
    } else {
      if (canCheckIn) {
        try {
          actions.check_in_clicked = true;
          await checkInBtn.scrollIntoViewIfNeeded().catch(() => {});
          await checkInBtn.click({ timeout: 5000 });
          if (await detectBillingLock(page)) {
            record = {
              run_id: runId,
              suite: "attendance_e2e",
              status: "SKIPPED_BILLING_LOCKED",
              started_at: startedAt,
              finished_at: new Date().toISOString(),
              base_url: BASE_URL,
              actor: { role: "employee", account_key: accountKey, email, employee_id: employeeId, tenant_id: tenant.tenantId },
              test_date: nowMeta.dateStr,
              reason: "billing_locked_after_check_in_attempt",
              actions,
              refs: {
                app_error_ids: [],
                critical_failed_requests: [],
              },
            };
            await appendRecord(record);
            const deleted = await deleteRecordedRun();
            record.record_cleanup = deleted ? "DELETED_MANDATORY" : "DELETE_FAILED";
            console.log(JSON.stringify(record, null, 2));
            if (!deleted) {
              console.error("cleanup_error_ref: ATT-CLEANUP-FAILED");
              process.exitCode = 1;
            }
            return;
          }
          await page.waitForTimeout(2500);
          const uiState = await detectAttendanceUiState(page);
          actions.check_in_success = uiState.checkInToast || uiState.alreadyCheckedIn;
        } catch {
          actions.check_in_clicked = false;
          actions.check_in_success = false;
        }
      }

      const canCheckOutAfterCheckIn =
        checkOutBtn
          ? (await checkOutBtn.isVisible().catch(() => false)) &&
            (await checkOutBtn.isEnabled().catch(() => false))
          : false;
      if (canCheckOutAfterCheckIn || canCheckOut) {
        try {
          actions.check_out_clicked = true;
          await checkOutBtn.scrollIntoViewIfNeeded().catch(() => {});
          await checkOutBtn.click({ timeout: 5000 });
          await page.waitForTimeout(600);
          const confirmBtn = page.getByRole("button", { name: /^Absen Pulang$/i }).nth(1);
          const confirmVisible = await confirmBtn.isVisible().catch(() => false);
          if (confirmVisible) {
            await confirmBtn.click();
          }
          await page.waitForTimeout(2500);
          actions.check_out_success = await page.getByText(/Absen Pulang Tersimpan/i).first().isVisible().catch(() => false);
        } catch {
          actions.check_out_clicked = false;
          actions.check_out_success = false;
        }
      }
    }

    const checkInState = await waitForCheckInState({
      page,
      supabaseUrl,
      anonKey,
      token,
      employeeId,
      dateStr: nowMeta.dateStr,
    });
    const todayAttendance = checkInState.attendance;
    const uiState = checkInState.uiState;
    const shouldVerifyReloadPersistence = Boolean(
      checkInExists ||
        checkOutExists ||
        (todayAttendance.ok && todayAttendance.row?.check_in_time) ||
        uiState.alreadyCheckedIn ||
        uiState.checkInToast
    );
    const reloadPersistence = shouldVerifyReloadPersistence
      ? await verifyCheckInPersistsAfterReload({
          page,
          supabaseUrl,
          anonKey,
          token,
          employeeId,
          dateStr: nowMeta.dateStr,
        })
      : {
          attempted: false,
          passed: false,
          attendance: null,
          uiState: null,
        };

    const appLogs = await page.evaluate(() => {
      const logs = typeof window.absensikuErrorLogs === "function" ? window.absensikuErrorLogs() : [];
      return logs.slice(-20).map((log) => ({ id: log?.id, context: log?.context, message: log?.message }));
    });

    const criticalFailed = failedRequests.filter((req) => req.failure !== "net::ERR_ABORTED");
    const hasCheckIn = Boolean(todayAttendance.ok && todayAttendance.row?.check_in_time);
    const hasCheckOut = Boolean(todayAttendance.ok && todayAttendance.row?.check_out_time);
    const hasBufferedCheckIn = uiState.alreadyCheckedIn || uiState.checkInToast;
    const passCore =
      (hasCheckIn || hasBufferedCheckIn) &&
      (!reloadPersistence.attempted || reloadPersistence.passed);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    const billingLockVisible = await detectBillingLock(page);
    const screenshotPath = path.join("tmp", `${runId}-attendance.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

    const status = passCore
      ? hasCheckOut
        ? "PASS"
        : hasCheckIn
          ? "PASS_CHECKIN_ONLY"
          : "PASS_CHECKIN_BUFFERED"
      : actions.skipped_because_already_complete
        ? "SKIPPED_ALREADY_COMPLETED"
        : billingLockVisible
          ? "SKIPPED_BILLING_LOCKED"
          : "FAIL";

    record = {
      run_id: runId,
      suite: "attendance_e2e",
      status,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      base_url: BASE_URL,
      actor: { role: "employee", account_key: accountKey, email, employee_id: employeeId, tenant_id: tenant.tenantId },
      test_date: nowMeta.dateStr,
      actions,
      controls: {
        check_in_buttons_total: checkInButtonPick.count,
        check_in_button_index: checkInButtonPick.index,
        check_out_buttons_total: checkOutButtonPick.count,
        check_out_button_index: checkOutButtonPick.index,
      },
      ui_state: uiState,
      attendance_row: todayAttendance.ok ? todayAttendance.row : null,
      refs: {
        app_error_ids: appLogs.map((x) => x?.id).filter(Boolean),
        critical_failed_requests: criticalFailed,
      },
      diagnostics: {
        app_logs: appLogs,
        console_errors: consoleErrors.slice(-10),
        billing_lock_visible: billingLockVisible,
        reload_persistence: reloadPersistence,
        ui_markers: {
          has_gagal_absen_masuk: bodyText.includes("Gagal Absen Masuk"),
          has_tidak_dapat_absen: bodyText.includes("Tidak Dapat Absen"),
          has_gagal_mendapatkan_lokasi: bodyText.includes("Gagal Mendapatkan Lokasi"),
          has_tidak_bisa_absen: bodyText.includes("Tidak Bisa Absen"),
          has_akses_terkunci: bodyText.includes("Akses Terkunci"),
        },
        screenshot_path: screenshotPath,
      },
    };

    await appendRecord(record);
    const deleted = await deleteRecordedRun();
    record.record_cleanup = deleted ? "DELETED_MANDATORY" : "DELETE_FAILED";
    console.log(JSON.stringify(record, null, 2));
    if (!deleted) {
      console.error("cleanup_error_ref: ATT-CLEANUP-FAILED");
      process.exitCode = 1;
    }
    if (status === "FAIL") process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(async (error) => {
  const failRecord = {
    run_id: `ATT-${Date.now()}`,
    suite: "attendance_e2e",
    status: "FAIL_SCRIPT",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  await appendRecord(failRecord);
  const deleted = await deleteRecordedRun();
  if (!deleted) {
    console.error("cleanup_error_ref: ATT-CLEANUP-FAILED");
  }
  console.error(`smoke-attendance error: ${failRecord.error}`);
  process.exitCode = 1;
});
