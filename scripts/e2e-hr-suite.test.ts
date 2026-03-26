import { describe, expect, it } from "vitest";

import { parseArgs, resolveRunPlan } from "./e2e-hr-suite.mjs";

describe("e2e-hr-suite parser", () => {
  it("parses flags and passthrough arguments", () => {
    const parsed = parseArgs(["--suite", "smoke", "--grep", "Payroll Policies", "--headed", "--doctor", "--dry-run", "--account-key", "tenant_extra", "--list"]);
    expect(parsed).toMatchObject({
      suite: "smoke",
      grep: "Payroll Policies",
      headed: true,
      doctor: true,
      dryRun: true,
      accountKey: "tenant_extra",
      passthrough: ["--list"],
    });
  });

  it("does not swallow next flag when --grep has no value", () => {
    const parsed = parseArgs(["--suite=crud", "--grep", "--list"]);
    expect(parsed.grep).toBe("");
    expect(parsed.passthrough).toEqual(["--list"]);
  });

  it("uses npm_config_grep fallback and normalizes invalid suite to all", () => {
    const plan = resolveRunPlan(["--suite=unknown"], { npm_config_grep: "Contracts" });
    expect(plan.suite).toBe("all");
    expect(plan.grep).toBe("Contracts");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-all");
    expect(plan.files).toEqual([
      "tests/e2e/org-hr-payroll-smoke.e2e.ts",
      "tests/e2e/org-hr-payroll-crud.e2e.ts",
      "tests/e2e/admin-hr-ats-coverage.e2e.ts",
      "tests/e2e/admin-hr-ats-governance-runtime.e2e.ts",
      "tests/e2e/org-hr-ats-readonly-smoke.e2e.ts",
      "tests/e2e/org-hr-ats-crud.e2e.ts",
      "tests/e2e/org-hr-workspace-smoke.e2e.ts",
      "tests/e2e/org-payroll-role-matrix.e2e.ts",
      "tests/e2e/org-payroll-webhook-audit.e2e.ts",
    ]);
  });

  it("keeps --grep=value and suite-specific report dir", () => {
    const plan = resolveRunPlan(["--suite=smoke", "--grep=HR Contracts"], {});
    expect(plan.suite).toBe("smoke");
    expect(plan.grep).toBe("HR Contracts");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-smoke");
    expect(plan.files).toEqual(["tests/e2e/org-hr-payroll-smoke.e2e.ts"]);
  });

  it("supports explicit payroll smoke alias", () => {
    const plan = resolveRunPlan(["--suite=payroll-smoke", "--account-key=tenant_payroll"], {});
    expect(plan.suite).toBe("payroll-smoke");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-payroll-smoke");
    expect(plan.files).toEqual(["tests/e2e/org-hr-payroll-smoke.e2e.ts"]);
    expect(plan.accountKey).toBe("tenant_payroll");
  });

  it("supports explicit payroll crud alias", () => {
    const plan = resolveRunPlan(["--suite=payroll-crud"], {});
    expect(plan.suite).toBe("payroll-crud");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-payroll-crud");
    expect(plan.files).toEqual(["tests/e2e/org-hr-payroll-crud.e2e.ts"]);
  });

  it("supports hr-core suite", () => {
    const plan = resolveRunPlan(["--suite=hr-core"], {});
    expect(plan.suite).toBe("hr-core");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-core");
    expect(plan.playwrightArgs).toEqual([]);
    expect(plan.files).toEqual([
      "tests/e2e/org-hr-workspace-smoke.e2e.ts",
      "tests/e2e/admin-hr-tenant-readonly-smoke.e2e.ts",
      "tests/e2e/admin-hr-training-bundle-readonly.e2e.ts",
      "tests/e2e/admin-hr-ess-readonly-bridge.e2e.ts",
      "tests/e2e/admin-hr-performance-readonly-bridge.e2e.ts",
      "tests/e2e/admin-hr-domain-coverage.e2e.ts",
    ]);
  });

  it("supports hr-full suite", () => {
    const plan = resolveRunPlan(["--suite=hr-full"], {});
    expect(plan.suite).toBe("hr-full");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-full");
    expect(plan.playwrightArgs).toEqual(["--workers=1"]);
    expect(plan.files).toEqual([
      "tests/e2e/org-hr-workspace-smoke.e2e.ts",
      "tests/e2e/admin-hr-tenant-readonly-smoke.e2e.ts",
      "tests/e2e/admin-hr-training-bundle-readonly.e2e.ts",
      "tests/e2e/admin-hr-ess-readonly-bridge.e2e.ts",
      "tests/e2e/admin-hr-performance-readonly-bridge.e2e.ts",
      "tests/e2e/admin-hr-domain-coverage.e2e.ts",
      "tests/e2e/admin-hr-ats-coverage.e2e.ts",
      "tests/e2e/admin-hr-ats-governance-runtime.e2e.ts",
      "tests/e2e/org-hr-ats-readonly-smoke.e2e.ts",
      "tests/e2e/org-hr-ats-crud.e2e.ts",
    ]);
  });

  it("supports payroll-full suite", () => {
    const plan = resolveRunPlan(["--suite=payroll-full"], {});
    expect(plan.suite).toBe("payroll-full");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-payroll-full");
    expect(plan.playwrightArgs).toEqual(["--workers=1"]);
    expect(plan.files).toEqual([
      "tests/e2e/org-hr-payroll-smoke.e2e.ts",
      "tests/e2e/org-hr-payroll-crud.e2e.ts",
      "tests/e2e/org-payroll-role-matrix.e2e.ts",
      "tests/e2e/org-payroll-webhook-audit.e2e.ts",
    ]);
  });

  it("supports workspace suite", () => {
    const plan = resolveRunPlan(["--suite=workspace"], {});
    expect(plan.suite).toBe("workspace");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-workspace");
    expect(plan.files).toEqual(["tests/e2e/org-hr-workspace-smoke.e2e.ts"]);
  });

  it("supports ats suite", () => {
    const plan = resolveRunPlan(["--suite=ats"], {});
    expect(plan.suite).toBe("ats");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-ats");
    expect(plan.files).toEqual([
      "tests/e2e/admin-hr-ats-coverage.e2e.ts",
      "tests/e2e/admin-hr-ats-governance-runtime.e2e.ts",
      "tests/e2e/org-hr-ats-readonly-smoke.e2e.ts",
      "tests/e2e/org-hr-ats-crud.e2e.ts",
    ]);
  });

  it("supports rolematrix suite", () => {
    const plan = resolveRunPlan(["--suite=rolematrix"], {});
    expect(plan.suite).toBe("rolematrix");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-rolematrix");
    expect(plan.files).toEqual(["tests/e2e/org-payroll-role-matrix.e2e.ts"]);
  });

  it("supports webhook suite", () => {
    const plan = resolveRunPlan(["--suite=webhook"], {});
    expect(plan.suite).toBe("webhook");
    expect(plan.reportDir).toBe("artifacts/playwright-report-hr-webhook");
    expect(plan.files).toEqual(["tests/e2e/org-payroll-webhook-audit.e2e.ts"]);
  });
});
