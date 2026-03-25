#!/usr/bin/env node

import { execFile as execFileCb } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const strictMode = process.argv.includes("--strict");
const skipHttpCheck = process.argv.includes("--skip-http");
const checkLocalDb = process.argv.includes("--with-local-db");
const baseUrl = process.env.DASHBOARD_BASE_URL || "http://127.0.0.1:5173/";
const dbUrl =
  process.env.LOCAL_DB_URL || "postgresql://absensiku:absensiku_dev@127.0.0.1:54329/absensiku_dev";

const asErrorMessage = (error) => {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || String(error);
  return String(error);
};

const classifyPsqlErrorRef = (message) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("operation not permitted") && normalized.includes("127.0.0.1")) {
    return "SBX-LOCAL-PSQL-127001";
  }
  if (normalized.includes("connection to server") && normalized.includes("failed")) {
    return "SBX-LOCAL-PSQL-CONN";
  }
  return "SBX-LOCAL-PSQL-UNKNOWN";
};

const classifyChromiumErrorRef = (message) => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("bootstrap_check_in") ||
    normalized.includes("machportrendezvousserver") ||
    normalized.includes("permission denied (1100)")
  ) {
    return "SBX-LOCAL-PLAYWRIGHT-1100";
  }
  if (normalized.includes("executable doesn't exist")) {
    return "SBX-LOCAL-PLAYWRIGHT-INSTALL";
  }
  return "SBX-LOCAL-PLAYWRIGHT-UNKNOWN";
};

const checkHttp = async () => {
  if (skipHttpCheck) {
    return { key: "HTTP", ok: true, detail: "Skipped (--skip-http)" };
  }
  try {
    const response = await fetch(baseUrl, { method: "HEAD" });
    if (!response.ok) {
      return {
        key: "HTTP",
        ok: false,
        ref: "SBX-LOCAL-HTTP-STATUS",
        detail: `HTTP ${response.status} from ${baseUrl}`,
      };
    }
    return { key: "HTTP", ok: true, detail: `${baseUrl} reachable` };
  } catch (error) {
    const message = asErrorMessage(error);
    const normalized = message.toLowerCase();
    if (normalized.includes("operation not permitted")) {
      return {
        key: "HTTP",
        ok: false,
        ref: "SBX-LOCAL-HTTP-SANDBOX",
        detail: message,
      };
    }
    if (normalized.includes("econnrefused") || normalized.includes("fetch failed")) {
      return {
        key: "HTTP",
        ok: false,
        ref: "SBX-LOCAL-HTTP-DOWN",
        detail: `Dev server belum aktif di ${baseUrl}. Jalankan npm run dev terlebih dahulu.`,
      };
    }
    return {
      key: "HTTP",
      ok: false,
      ref: "SBX-LOCAL-HTTP-CONN",
      detail: message,
    };
  }
};

const checkPsql = async () => {
  if (!checkLocalDb) {
    return {
      key: "PSQL",
      ok: true,
      detail: "Skipped (default remote DB mode; pakai --with-local-db untuk cek psql localhost)",
    };
  }
  try {
    const { stdout } = await execFile("psql", [dbUrl, "-At", "-c", "select 1;"], {
      timeout: 7000,
      maxBuffer: 1024 * 1024,
    });
    const output = String(stdout || "").trim();
    if (output !== "1") {
      return {
        key: "PSQL",
        ok: false,
        ref: "SBX-LOCAL-PSQL-RESULT",
        detail: `Unexpected query result: ${output || "(empty)"}`,
      };
    }
    return { key: "PSQL", ok: true, detail: "DB localhost reachable via psql" };
  } catch (error) {
    const message = `${asErrorMessage(error)} ${
      typeof error?.stderr === "string" ? error.stderr : ""
    }`.trim();
    return {
      key: "PSQL",
      ok: false,
      ref: classifyPsqlErrorRef(message),
      detail: message,
    };
  }
};

const checkPlaywrightChromium = async () => {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("about:blank");
    await browser.close();
    return { key: "PLAYWRIGHT_CHROMIUM", ok: true, detail: "Chromium launch OK" };
  } catch (error) {
    const message = asErrorMessage(error);
    return {
      key: "PLAYWRIGHT_CHROMIUM",
      ok: false,
      ref: classifyChromiumErrorRef(message),
      detail: message,
    };
  }
};

const renderLine = (result) => {
  if (result.ok) {
    return `[OK] ${result.key} ${result.detail}`;
  }
  return `[FAIL] ${result.key} Ref: ${result.ref} ${result.detail}`;
};

const main = async () => {
  const checks = await Promise.all([checkHttp(), checkPsql(), checkPlaywrightChromium()]);
  console.log("== Localhost Sandbox Doctor ==");
  checks.forEach((result) => console.log(renderLine(result)));

  const failed = checks.filter((result) => !result.ok);
  if (failed.length === 0) {
    const localDbMode = checkLocalDb ? "on" : "off";
    console.log(`Status: SIAP (localhost tidak terblokir untuk HTTP + Playwright, local-db-check=${localDbMode}).`);
    return;
  }

  console.log("Status: BELUM SIAP.");
  console.log("Aksi:");
  if (failed.some((item) => item.ref === "SBX-LOCAL-HTTP-DOWN")) {
    console.log("1. Jalankan dev server: npm run dev");
    console.log("2. Ulangi doctor atau pakai --skip-http jika hanya validasi Playwright.");
  } else {
    console.log("1. Gunakan environment full-access (tanpa sandbox restriction) untuk E2E localhost.");
    console.log("2. Jika environment pakai approval-based sandbox, whitelist prefix perintah localhost.");
    console.log("3. Ulangi: npm run ops:sandbox:doctor:strict");
  }

  if (strictMode) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(`[FAIL] DOCTOR_RUNTIME Ref: SBX-LOCAL-DOCTOR-RUNTIME ${asErrorMessage(error)}`);
  process.exit(1);
});
