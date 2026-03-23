import { describe, expect, it } from "vitest";

import { parseArgs, resolveRunPlan } from "./e2e-leave-suite.mjs";

describe("e2e-leave-suite parser", () => {
  it("parses flags and passthrough arguments", () => {
    const parsed = parseArgs(["--suite", "requests", "--grep", "Izin Terlambat", "--headed", "--doctor", "--dry-run", "--list"]);
    expect(parsed).toMatchObject({
      suite: "requests",
      grep: "Izin Terlambat",
      headed: true,
      doctor: true,
      dryRun: true,
      passthrough: ["--list"],
    });
  });

  it("does not swallow next flag when --grep has no value", () => {
    const parsed = parseArgs(["--suite=approved", "--grep", "--list"]);
    expect(parsed.grep).toBe("");
    expect(parsed.passthrough).toEqual(["--list"]);
  });

  it("uses npm_config_grep fallback and normalizes invalid suite to all", () => {
    const plan = resolveRunPlan(["--suite=unknown"], { npm_config_grep: "SYNC" });
    expect(plan.suite).toBe("all");
    expect(plan.grep).toBe("SYNC");
    expect(plan.reportDir).toBe("artifacts/playwright-report-leave-all");
    expect(plan.envFlags).toEqual({
      E2E_ORG_LEAVE_FILTER_PAGINATION: "1",
      E2E_ORG_LEAVE_APPROVED_REPORT_SYNC: "1",
      E2E_ORG_HARD_REQUEST_ALERT: "1",
    });
    expect(plan.files).toEqual([
      "tests/e2e/org-leave-requests-filter-pagination.e2e.ts",
      "tests/e2e/org-leave-approved-report-sync.e2e.ts",
      "tests/e2e/org-hard-request-alert-badge.e2e.ts",
    ]);
  });

  it("supports requests suite", () => {
    const plan = resolveRunPlan(["--suite=requests"], {});
    expect(plan.suite).toBe("requests");
    expect(plan.reportDir).toBe("artifacts/playwright-report-leave-requests");
    expect(plan.envFlags).toEqual({ E2E_ORG_LEAVE_FILTER_PAGINATION: "1" });
    expect(plan.files).toEqual(["tests/e2e/org-leave-requests-filter-pagination.e2e.ts"]);
  });

  it("supports approved suite", () => {
    const plan = resolveRunPlan(["--suite=approved"], {});
    expect(plan.suite).toBe("approved");
    expect(plan.reportDir).toBe("artifacts/playwright-report-leave-approved");
    expect(plan.envFlags).toEqual({ E2E_ORG_LEAVE_APPROVED_REPORT_SYNC: "1" });
    expect(plan.files).toEqual(["tests/e2e/org-leave-approved-report-sync.e2e.ts"]);
  });

  it("supports alerts suite", () => {
    const plan = resolveRunPlan(["--suite=alerts"], {});
    expect(plan.suite).toBe("alerts");
    expect(plan.reportDir).toBe("artifacts/playwright-report-leave-alerts");
    expect(plan.envFlags).toEqual({ E2E_ORG_HARD_REQUEST_ALERT: "1" });
    expect(plan.files).toEqual(["tests/e2e/org-hard-request-alert-badge.e2e.ts"]);
  });
});
